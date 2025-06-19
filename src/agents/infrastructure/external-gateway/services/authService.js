/**
 * Authentication Service
 * Serviço de autenticação para o External Event API Gateway
 */

const crypto = require('crypto');
const Redis = require('ioredis');
const { promisify } = require('util');

class AuthService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.redis = null;
    this.isRunning = false;
    this.startTime = new Date();
    
    // Cache local para API keys (fallback)
    this.localApiKeys = new Map();
    
    // Estatísticas
    this.stats = {
      authAttempts: 0,
      authSuccesses: 0,
      authFailures: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastAuthTime: null
    };
    
    this.initializeDefaultApiKeys();
  }

  /**
   * Inicializa API keys padrão para desenvolvimento
   */
  initializeDefaultApiKeys() {
    if (this.config.server.environment === 'development') {
      // API keys de desenvolvimento
      this.localApiKeys.set('dev-key-12345', {
        id: 'dev-key-12345',
        name: 'Development Key',
        permissions: ['events:write', 'events:read'],
        rateLimits: {
          requestsPerMinute: 1000,
          requestsPerHour: 10000
        },
        metadata: {
          environment: 'development',
          createdAt: new Date().toISOString()
        },
        active: true
      });
      
      this.localApiKeys.set('test-key-67890', {
        id: 'test-key-67890',
        name: 'Test Key',
        permissions: ['events:write'],
        rateLimits: {
          requestsPerMinute: 100,
          requestsPerHour: 1000
        },
        metadata: {
          environment: 'test',
          createdAt: new Date().toISOString()
        },
        active: true
      });
    }
  }

  /**
   * Inicia o serviço
   */
  async start() {
    try {
      this.logger.info('Iniciando Auth Service...');

      // Inicializa Redis se habilitado
      if (this.config.redis.enabled) {
        await this.initializeRedis();
      }

      this.isRunning = true;
      this.logger.info('Auth Service iniciado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao iniciar Auth Service:', error);
      throw error;
    }
  }

  /**
   * Inicializa conexão com Redis
   */
  async initializeRedis() {
    try {
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        keyPrefix: this.config.redis.keyPrefix + 'auth:',
        retryDelayOnFailover: this.config.redis.retryDelayOnFailover,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
        lazyConnect: true
      });

      await this.redis.connect();
      
      // Carrega API keys padrão no Redis para desenvolvimento
      if (this.config.server.environment === 'development') {
        await this.loadDefaultApiKeysToRedis();
      }
      
      this.logger.info('Conexão com Redis estabelecida para Auth Service');
    } catch (error) {
      this.logger.error('Erro ao conectar com Redis (Auth Service):', error);
      throw error;
    }
  }

  /**
   * Carrega API keys padrão no Redis
   */
  async loadDefaultApiKeysToRedis() {
    try {
      for (const [apiKey, keyData] of this.localApiKeys) {
        const redisKey = `apikey:${apiKey}`;
        await this.redis.setex(redisKey, this.config.redis.ttl, JSON.stringify(keyData));
      }
      
      this.logger.info('API keys padrão carregadas no Redis');
    } catch (error) {
      this.logger.error('Erro ao carregar API keys no Redis:', error);
    }
  }

  /**
   * Autentica uma API key
   */
  async authenticateApiKey(apiKey) {
    if (!this.config.security.enableApiKeys) {
      return {
        valid: true,
        keyData: {
          id: 'anonymous',
          name: 'Anonymous Access',
          permissions: ['events:write'],
          rateLimits: this.config.rateLimiting,
          active: true
        }
      };
    }

    this.stats.authAttempts++;
    this.stats.lastAuthTime = new Date();

    try {
      // Valida formato da API key
      if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
        this.stats.authFailures++;
        return { valid: false, reason: 'Invalid API key format' };
      }

      // Busca no cache Redis primeiro
      let keyData = null;
      if (this.redis) {
        keyData = await this.getApiKeyFromRedis(apiKey);
      }

      // Fallback para cache local
      if (!keyData) {
        keyData = await this.getApiKeyFromLocal(apiKey);
      }

      if (!keyData) {
        this.stats.authFailures++;
        this.logger.warn('API key não encontrada', { apiKey: this.maskApiKey(apiKey) });
        return { valid: false, reason: 'API key not found' };
      }

      // Verifica se a key está ativa
      if (!keyData.active) {
        this.stats.authFailures++;
        this.logger.warn('API key inativa', { apiKey: this.maskApiKey(apiKey) });
        return { valid: false, reason: 'API key is inactive' };
      }

      this.stats.authSuccesses++;
      this.logger.debug('API key autenticada com sucesso', {
        keyId: keyData.id,
        keyName: keyData.name
      });

      return {
        valid: true,
        keyData
      };

    } catch (error) {
      this.stats.authFailures++;
      this.logger.error('Erro na autenticação:', error, {
        apiKey: this.maskApiKey(apiKey)
      });
      return { valid: false, reason: 'Authentication error' };
    }
  }

  /**
   * Busca API key no Redis
   */
  async getApiKeyFromRedis(apiKey) {
    try {
      const redisKey = `apikey:${apiKey}`;
      const keyDataStr = await this.redis.get(redisKey);
      
      if (keyDataStr) {
        this.stats.cacheHits++;
        return JSON.parse(keyDataStr);
      }
      
      this.stats.cacheMisses++;
      return null;
    } catch (error) {
      this.logger.error('Erro ao buscar API key no Redis:', error);
      return null;
    }
  }

  /**
   * Busca API key no cache local
   */
  async getApiKeyFromLocal(apiKey) {
    return this.localApiKeys.get(apiKey) || null;
  }

  /**
   * Verifica permissões de uma API key
   */
  hasPermission(keyData, permission) {
    if (!keyData || !keyData.permissions) {
      return false;
    }
    
    return keyData.permissions.includes(permission) || keyData.permissions.includes('*');
  }

  /**
   * Obtém limites de rate para uma API key
   */
  getRateLimits(keyData) {
    if (!keyData || !keyData.rateLimits) {
      return this.config.rateLimiting;
    }
    
    return {
      windowMs: this.config.rateLimiting.windowMs,
      maxRequests: keyData.rateLimits.requestsPerMinute || this.config.rateLimiting.maxRequests,
      ...keyData.rateLimits
    };
  }

  /**
   * Cria uma nova API key (para uso administrativo)
   */
  async createApiKey(keyData) {
    try {
      const apiKey = this.generateApiKey();
      const fullKeyData = {
        id: apiKey,
        name: keyData.name || 'Unnamed Key',
        permissions: keyData.permissions || ['events:write'],
        rateLimits: keyData.rateLimits || {
          requestsPerMinute: 100,
          requestsPerHour: 1000
        },
        metadata: {
          createdAt: new Date().toISOString(),
          createdBy: keyData.createdBy || 'system',
          ...keyData.metadata
        },
        active: true
      };

      // Salva no Redis
      if (this.redis) {
        const redisKey = `apikey:${apiKey}`;
        await this.redis.setex(redisKey, this.config.redis.ttl, JSON.stringify(fullKeyData));
      }

      // Salva no cache local
      this.localApiKeys.set(apiKey, fullKeyData);

      this.logger.info('Nova API key criada', {
        keyId: apiKey,
        keyName: fullKeyData.name
      });

      return {
        apiKey,
        keyData: fullKeyData
      };
    } catch (error) {
      this.logger.error('Erro ao criar API key:', error);
      throw error;
    }
  }

  /**
   * Revoga uma API key
   */
  async revokeApiKey(apiKey) {
    try {
      // Remove do Redis
      if (this.redis) {
        const redisKey = `apikey:${apiKey}`;
        await this.redis.del(redisKey);
      }

      // Remove do cache local
      this.localApiKeys.delete(apiKey);

      this.logger.info('API key revogada', {
        apiKey: this.maskApiKey(apiKey)
      });

      return true;
    } catch (error) {
      this.logger.error('Erro ao revogar API key:', error);
      throw error;
    }
  }

  /**
   * Lista todas as API keys (apenas metadados)
   */
  async listApiKeys() {
    try {
      const keys = [];

      // Busca do Redis
      if (this.redis) {
        const redisKeys = await this.redis.keys('apikey:*');
        for (const redisKey of redisKeys) {
          const keyDataStr = await this.redis.get(redisKey);
          if (keyDataStr) {
            const keyData = JSON.parse(keyDataStr);
            keys.push({
              id: keyData.id,
              name: keyData.name,
              permissions: keyData.permissions,
              active: keyData.active,
              createdAt: keyData.metadata?.createdAt
            });
          }
        }
      }

      // Adiciona keys do cache local que não estão no Redis
      for (const [apiKey, keyData] of this.localApiKeys) {
        if (!keys.find(k => k.id === keyData.id)) {
          keys.push({
            id: keyData.id,
            name: keyData.name,
            permissions: keyData.permissions,
            active: keyData.active,
            createdAt: keyData.metadata?.createdAt
          });
        }
      }

      return keys;
    } catch (error) {
      this.logger.error('Erro ao listar API keys:', error);
      throw error;
    }
  }

  /**
   * Gera uma nova API key
   */
  generateApiKey() {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `gw_${timestamp}_${randomBytes}`;
  }

  /**
   * Mascara uma API key para logs
   */
  maskApiKey(apiKey) {
    if (!apiKey || apiKey.length < 8) {
      return '[invalid]';
    }
    return apiKey.substring(0, 8) + '...';
  }

  /**
   * Verifica saúde do serviço
   */
  async checkHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      dependencies: {}
    };

    // Verifica Redis
    if (this.redis) {
      try {
        await this.redis.ping();
        health.dependencies.redis = { status: 'healthy' };
      } catch (error) {
        health.dependencies.redis = { status: 'unhealthy', error: error.message };
        health.status = 'unhealthy';
      }
    }

    return health;
  }

  /**
   * Retorna estatísticas do serviço
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime.getTime(),
      isRunning: this.isRunning,
      totalApiKeys: this.localApiKeys.size
    };
  }

  /**
   * Retorna status do serviço
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: Date.now() - this.startTime.getTime(),
      stats: this.getStats()
    };
  }

  /**
   * Para o serviço
   */
  async stop() {
    try {
      this.logger.info('Parando Auth Service...');
      
      this.isRunning = false;
      
      if (this.redis) {
        await this.redis.quit();
      }
      
      this.logger.info('Auth Service parado');
    } catch (error) {
      this.logger.error('Erro ao parar Auth Service:', error);
      throw error;
    }
  }
}

module.exports = AuthService;