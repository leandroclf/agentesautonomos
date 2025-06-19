/**
 * Cache Service - Serviço de Cache
 * Gerencia operações de cache usando Redis ou memória
 */

const redis = require('redis');
const EventEmitter = require('events');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

class CacheService extends EventEmitter {
  constructor(config, logger, metrics) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.client = null;
    this.memoryCache = new Map();
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 3000;
    this.compressionEnabled = config.transformation?.compression?.enabled || false;
    this.keyPrefix = config.persistence.cache.keyPrefix || 'persistence:';
  }

  /**
   * Inicializa o serviço de cache
   */
  async initialize() {
    if (!this.config.persistence.cache.enabled) {
      this.logger.info('Cache desabilitado na configuração');
      return;
    }

    try {
      this.logger.info('Inicializando Cache Service...');
      
      if (this.config.persistence.cache.type === 'redis') {
        await this.connectRedis();
      } else {
        this.setupMemoryCache();
      }
      
      this.logger.info('Cache Service inicializado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar Cache Service:', error);
      throw error;
    }
  }

  /**
   * Conecta ao Redis
   */
  async connectRedis() {
    try {
      const redisConfig = {
        host: this.config.persistence.cache.host,
        port: this.config.persistence.cache.port,
        password: this.config.persistence.cache.password,
        db: this.config.persistence.cache.db,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      };

      this.client = redis.createClient(redisConfig);

      // Event listeners
      this.client.on('connect', () => {
        this.logger.info('Conectando ao Redis...');
      });

      this.client.on('ready', () => {
        this.logger.info('Redis conectado e pronto');
        this.isConnected = true;
        this.connectionRetries = 0;
      });

      this.client.on('error', (error) => {
        this.logger.error('Erro no Redis:', error);
        this.isConnected = false;
        this.metrics.errorCount.inc({ type: 'cache_error', operation: 'redis_connection' });
      });

      this.client.on('end', () => {
        this.logger.warn('Conexão Redis encerrada');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.logger.info('Reconectando ao Redis...');
      });

      // Conectar
      await this.client.connect();
      
      // Testar conexão
      await this.client.ping();
      
    } catch (error) {
      this.isConnected = false;
      
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        this.logger.warn(`Tentativa de conexão Redis ${this.connectionRetries}/${this.maxRetries} falhou. Tentando novamente em ${this.retryDelay}ms...`);
        
        await this.sleep(this.retryDelay);
        return this.connectRedis();
      }
      
      this.logger.error('Falha ao conectar ao Redis após múltiplas tentativas. Usando cache em memória.');
      this.setupMemoryCache();
    }
  }

  /**
   * Configura cache em memória
   */
  setupMemoryCache() {
    this.isConnected = true;
    this.logger.info('Cache em memória configurado');
    
    // Limpeza periódica do cache em memória
    setInterval(() => {
      this.cleanupMemoryCache();
    }, 60000); // A cada minuto
  }

  /**
   * Limpa cache em memória expirado
   */
  cleanupMemoryCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expiry && value.expiry < now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Limpeza do cache: ${cleaned} entradas removidas`);
    }
    
    // Verificar limite de memória
    if (this.memoryCache.size > this.config.persistence.cache.maxMemory) {
      this.evictOldestEntries();
    }
  }

  /**
   * Remove entradas mais antigas do cache em memória
   */
  evictOldestEntries() {
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = Math.floor(this.memoryCache.size * 0.1); // Remove 10%
    
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
    
    this.logger.debug(`Eviction: ${toRemove} entradas removidas por limite de memória`);
  }

  /**
   * Armazena valor no cache
   */
  async set(key, value, ttl = null) {
    if (!this.config.persistence.cache.enabled) {
      return false;
    }

    try {
      const fullKey = this.getFullKey(key);
      const serializedValue = await this.serializeValue(value);
      const cacheTtl = ttl || this.config.persistence.cache.ttl;

      if (this.client && this.isConnected) {
        // Redis
        if (cacheTtl > 0) {
          await this.client.setEx(fullKey, cacheTtl, serializedValue);
        } else {
          await this.client.set(fullKey, serializedValue);
        }
      } else {
        // Memória
        const expiry = cacheTtl > 0 ? Date.now() + (cacheTtl * 1000) : null;
        this.memoryCache.set(fullKey, {
          value: serializedValue,
          timestamp: Date.now(),
          expiry
        });
      }

      this.logger.debug(`Cache set: ${fullKey}`);
      return true;
    } catch (error) {
      this.logger.error('Erro ao definir cache:', error);
      this.metrics.errorCount.inc({ type: 'cache_set', operation: 'set' });
      return false;
    }
  }

  /**
   * Recupera valor do cache
   */
  async get(key) {
    if (!this.config.persistence.cache.enabled) {
      return null;
    }

    try {
      const fullKey = this.getFullKey(key);
      let serializedValue = null;

      if (this.client && this.isConnected) {
        // Redis
        serializedValue = await this.client.get(fullKey);
      } else {
        // Memória
        const cached = this.memoryCache.get(fullKey);
        if (cached) {
          // Verificar expiração
          if (cached.expiry && cached.expiry < Date.now()) {
            this.memoryCache.delete(fullKey);
            return null;
          }
          serializedValue = cached.value;
        }
      }

      if (serializedValue) {
        const value = await this.deserializeValue(serializedValue);
        this.logger.debug(`Cache hit: ${fullKey}`);
        this.metrics.cacheHits.inc();
        return value;
      }

      this.logger.debug(`Cache miss: ${fullKey}`);
      this.metrics.cacheMisses.inc();
      return null;
    } catch (error) {
      this.logger.error('Erro ao recuperar cache:', error);
      this.metrics.errorCount.inc({ type: 'cache_get', operation: 'get' });
      this.metrics.cacheMisses.inc();
      return null;
    }
  }

  /**
   * Remove valor do cache
   */
  async delete(key) {
    if (!this.config.persistence.cache.enabled) {
      return false;
    }

    try {
      const fullKey = this.getFullKey(key);

      if (this.client && this.isConnected) {
        // Redis
        const result = await this.client.del(fullKey);
        return result > 0;
      } else {
        // Memória
        const existed = this.memoryCache.has(fullKey);
        this.memoryCache.delete(fullKey);
        return existed;
      }
    } catch (error) {
      this.logger.error('Erro ao deletar cache:', error);
      this.metrics.errorCount.inc({ type: 'cache_delete', operation: 'delete' });
      return false;
    }
  }

  /**
   * Verifica se chave existe no cache
   */
  async exists(key) {
    if (!this.config.persistence.cache.enabled) {
      return false;
    }

    try {
      const fullKey = this.getFullKey(key);

      if (this.client && this.isConnected) {
        // Redis
        const result = await this.client.exists(fullKey);
        return result > 0;
      } else {
        // Memória
        const cached = this.memoryCache.get(fullKey);
        if (cached && cached.expiry && cached.expiry < Date.now()) {
          this.memoryCache.delete(fullKey);
          return false;
        }
        return this.memoryCache.has(fullKey);
      }
    } catch (error) {
      this.logger.error('Erro ao verificar existência no cache:', error);
      return false;
    }
  }

  /**
   * Define TTL para uma chave
   */
  async expire(key, ttl) {
    if (!this.config.persistence.cache.enabled) {
      return false;
    }

    try {
      const fullKey = this.getFullKey(key);

      if (this.client && this.isConnected) {
        // Redis
        const result = await this.client.expire(fullKey, ttl);
        return result > 0;
      } else {
        // Memória
        const cached = this.memoryCache.get(fullKey);
        if (cached) {
          cached.expiry = Date.now() + (ttl * 1000);
          return true;
        }
        return false;
      }
    } catch (error) {
      this.logger.error('Erro ao definir TTL:', error);
      return false;
    }
  }

  /**
   * Limpa todo o cache
   */
  async clear() {
    if (!this.config.persistence.cache.enabled) {
      return false;
    }

    try {
      if (this.client && this.isConnected) {
        // Redis - limpar apenas chaves com nosso prefixo
        const keys = await this.client.keys(`${this.keyPrefix}*`);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      } else {
        // Memória
        this.memoryCache.clear();
      }

      this.logger.info('Cache limpo');
      return true;
    } catch (error) {
      this.logger.error('Erro ao limpar cache:', error);
      return false;
    }
  }

  /**
   * Obtém estatísticas do cache
   */
  async getStats() {
    const stats = {
      enabled: this.config.persistence.cache.enabled,
      type: this.config.persistence.cache.type,
      connected: this.isConnected
    };

    try {
      if (this.client && this.isConnected) {
        // Redis stats
        const info = await this.client.info('memory');
        const keyspace = await this.client.info('keyspace');
        
        stats.redis = {
          memory: this.parseRedisInfo(info),
          keyspace: this.parseRedisInfo(keyspace)
        };
      } else {
        // Memory stats
        stats.memory = {
          size: this.memoryCache.size,
          maxMemory: this.config.persistence.cache.maxMemory
        };
      }
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas do cache:', error);
    }

    return stats;
  }

  /**
   * Serializa valor para armazenamento
   */
  async serializeValue(value) {
    try {
      let serialized = JSON.stringify(value);
      
      if (this.compressionEnabled && serialized.length > 1024) {
        const compressed = await promisify(zlib.gzip)(serialized);
        return JSON.stringify({
          compressed: true,
          data: compressed.toString('base64')
        });
      }
      
      return serialized;
    } catch (error) {
      this.logger.error('Erro na serialização:', error);
      throw error;
    }
  }

  /**
   * Deserializa valor do armazenamento
   */
  async deserializeValue(serialized) {
    try {
      const parsed = JSON.parse(serialized);
      
      if (parsed.compressed) {
        const compressed = Buffer.from(parsed.data, 'base64');
        const decompressed = await promisify(zlib.gunzip)(compressed);
        return JSON.parse(decompressed.toString());
      }
      
      return parsed;
    } catch (error) {
      this.logger.error('Erro na deserialização:', error);
      throw error;
    }
  }

  /**
   * Gera chave completa com prefixo
   */
  getFullKey(key) {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Parseia informações do Redis
   */
  parseRedisInfo(info) {
    const result = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(value) ? value : Number(value);
      }
    }
    
    return result;
  }

  /**
   * Função de sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Para o serviço
   */
  async stop() {
    this.logger.info('Parando Cache Service...');
    
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
      }
      
      this.memoryCache.clear();
      this.isConnected = false;
      
      this.logger.info('Cache Service parado');
    } catch (error) {
      this.logger.error('Erro ao parar Cache Service:', error);
    }
  }

  /**
   * Retorna status do serviço
   */
  getStatus() {
    return {
      enabled: this.config.persistence.cache.enabled,
      type: this.config.persistence.cache.type,
      connected: this.isConnected,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries,
      memorySize: this.memoryCache.size
    };
  }
}

module.exports = CacheService;