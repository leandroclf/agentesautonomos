/**
 * Enrichment Service
 * Serviço responsável pelo enriquecimento de eventos com contexto adicional
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const config = require('../config/enricherConfig');

class EnrichmentService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.isRunning = false;
    
    // Cache para enriquecimento
    this.enrichmentCache = new Map();
    this.geoCache = new Map();
    this.uaCache = new Map();
    
    // Estatísticas
    this.stats = {
      totalEnrichments: 0,
      successfulEnrichments: 0,
      failedEnrichments: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageEnrichmentTime: 0
    };
    
    // Configurações
    this.strategies = config.enrichment.strategies;
    this.limits = config.enrichment.limits;
    this.cache = config.enrichment.cache;
    this.retry = config.enrichment.retry;
    
    // Parser de User Agent
    this.uaParser = new UAParser();
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Enrichment Service already running');
      return;
    }

    this.logger.info('Starting Enrichment Service');
    this.isRunning = true;
    
    // Inicializar cache cleanup
    if (this.cache.enabled) {
      this.startCacheCleanup();
    }
    
    this.logger.info('Enrichment Service started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Enrichment Service not running');
      return;
    }

    this.logger.info('Stopping Enrichment Service');
    this.isRunning = false;
    
    // Limpar caches
    this.enrichmentCache.clear();
    this.geoCache.clear();
    this.uaCache.clear();
    
    this.logger.info('Enrichment Service stopped');
  }

  async enrichEvent(event) {
    const startTime = Date.now();
    
    try {
      this.emit('enrichmentStarted', {
        eventId: event.id,
        type: event.type,
        timestamp: new Date().toISOString()
      });
      
      // Validar tamanho do evento
      if (this.getEventSize(event) > this.limits.maxEventSize) {
        throw new Error('Event size exceeds maximum limit');
      }
      
      // Verificar cache
      const cacheKey = this.generateCacheKey(event);
      if (this.cache.enabled && this.enrichmentCache.has(cacheKey)) {
        this.stats.cacheHits++;
        const cachedResult = this.enrichmentCache.get(cacheKey);
        this.logger.debug('Using cached enrichment', { eventId: event.id });
        return cachedResult;
      }
      
      this.stats.cacheMisses++;
      
      // Criar cópia do evento para enriquecimento
      const enrichedEvent = JSON.parse(JSON.stringify(event));
      const fieldsAdded = [];
      
      // Aplicar estratégias de enriquecimento em ordem de prioridade
      const sortedStrategies = Object.entries(this.strategies)
        .filter(([_, strategy]) => strategy.enabled)
        .sort(([_, a], [__, b]) => a.priority - b.priority);
      
      for (const [strategyName, strategy] of sortedStrategies) {
        try {
          const result = await this.applyEnrichmentStrategy(
            strategyName, 
            strategy, 
            enrichedEvent
          );
          
          if (result.fields) {
            fieldsAdded.push(...result.fields);
          }
          
        } catch (error) {
          this.logger.warn('Enrichment strategy failed', {
            strategy: strategyName,
            eventId: event.id,
            error: error.message
          });
        }
      }
      
      // Adicionar metadados de enriquecimento
      enrichedEvent._enrichment = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        strategies: sortedStrategies.map(([name]) => name),
        fieldsAdded: fieldsAdded.length,
        processingTime: Date.now() - startTime
      };
      
      // Armazenar no cache
      if (this.cache.enabled) {
        this.enrichmentCache.set(cacheKey, enrichedEvent);
        
        // Limitar tamanho do cache
        if (this.enrichmentCache.size > this.cache.maxSize) {
          const firstKey = this.enrichmentCache.keys().next().value;
          this.enrichmentCache.delete(firstKey);
        }
      }
      
      // Atualizar estatísticas
      this.stats.totalEnrichments++;
      this.stats.successfulEnrichments++;
      this.updateAverageEnrichmentTime(Date.now() - startTime);
      
      this.emit('enrichmentCompleted', {
        eventId: event.id,
        fieldsAdded,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      return enrichedEvent;
      
    } catch (error) {
      this.stats.failedEnrichments++;
      
      this.emit('enrichmentFailed', {
        eventId: event.id,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  async applyEnrichmentStrategy(strategyName, strategy, event) {
    const fieldsAdded = [];
    
    switch (strategyName) {
      case 'metadata':
        return this.enrichWithMetadata(event, strategy, fieldsAdded);
      
      case 'geolocation':
        return this.enrichWithGeolocation(event, strategy, fieldsAdded);
      
      case 'userAgent':
        return this.enrichWithUserAgent(event, strategy, fieldsAdded);
      
      case 'sessionInfo':
        return this.enrichWithSessionInfo(event, strategy, fieldsAdded);
      
      case 'contextual':
        return this.enrichWithContextual(event, strategy, fieldsAdded);
      
      default:
        this.logger.warn('Unknown enrichment strategy', { strategy: strategyName });
        return { fields: [] };
    }
  }

  enrichWithMetadata(event, strategy, fieldsAdded) {
    if (!event.metadata) {
      event.metadata = {};
    }
    
    // Timestamp de processamento
    if (strategy.fields.includes('timestamp') && !event.metadata.processedAt) {
      event.metadata.processedAt = new Date().toISOString();
      fieldsAdded.push({ type: 'metadata', field: 'processedAt' });
    }
    
    // Fonte do evento
    if (strategy.fields.includes('source') && !event.metadata.enrichmentSource) {
      event.metadata.enrichmentSource = 'event-enricher-agent';
      fieldsAdded.push({ type: 'metadata', field: 'enrichmentSource' });
    }
    
    // Versão do schema
    if (strategy.fields.includes('version') && !event.metadata.schemaVersion) {
      event.metadata.schemaVersion = '1.0.0';
      fieldsAdded.push({ type: 'metadata', field: 'schemaVersion' });
    }
    
    // Ambiente
    if (strategy.fields.includes('environment') && !event.metadata.environment) {
      event.metadata.environment = process.env.NODE_ENV || 'development';
      fieldsAdded.push({ type: 'metadata', field: 'environment' });
    }
    
    return { fields: fieldsAdded };
  }

  enrichWithGeolocation(event, strategy, fieldsAdded) {
    const ip = event.ip || event.clientIp || event.data?.ip;
    
    if (!ip) {
      return { fields: [] };
    }
    
    // Verificar cache de geolocalização
    if (this.geoCache.has(ip)) {
      const geoData = this.geoCache.get(ip);
      this.addGeoDataToEvent(event, geoData, strategy, fieldsAdded);
      return { fields: fieldsAdded };
    }
    
    try {
      const geoData = geoip.lookup(ip);
      
      if (geoData) {
        // Armazenar no cache
        this.geoCache.set(ip, geoData);
        
        this.addGeoDataToEvent(event, geoData, strategy, fieldsAdded);
      }
      
    } catch (error) {
      this.logger.warn('Geolocation enrichment failed', {
        ip,
        error: error.message
      });
    }
    
    return { fields: fieldsAdded };
  }

  addGeoDataToEvent(event, geoData, strategy, fieldsAdded) {
    if (!event.geo) {
      event.geo = {};
    }
    
    if (strategy.fields.includes('country') && geoData.country) {
      event.geo.country = geoData.country;
      fieldsAdded.push({ type: 'geo', field: 'country' });
    }
    
    if (strategy.fields.includes('region') && geoData.region) {
      event.geo.region = geoData.region;
      fieldsAdded.push({ type: 'geo', field: 'region' });
    }
    
    if (strategy.fields.includes('city') && geoData.city) {
      event.geo.city = geoData.city;
      fieldsAdded.push({ type: 'geo', field: 'city' });
    }
    
    if (strategy.fields.includes('timezone') && geoData.timezone) {
      event.geo.timezone = geoData.timezone;
      fieldsAdded.push({ type: 'geo', field: 'timezone' });
    }
  }

  enrichWithUserAgent(event, strategy, fieldsAdded) {
    const userAgent = event.userAgent || event.headers?.['user-agent'] || event.data?.userAgent;
    
    if (!userAgent) {
      return { fields: [] };
    }
    
    // Verificar cache de User Agent
    if (this.uaCache.has(userAgent)) {
      const uaData = this.uaCache.get(userAgent);
      this.addUADataToEvent(event, uaData, strategy, fieldsAdded);
      return { fields: fieldsAdded };
    }
    
    try {
      this.uaParser.setUA(userAgent);
      const uaData = this.uaParser.getResult();
      
      // Armazenar no cache
      this.uaCache.set(userAgent, uaData);
      
      this.addUADataToEvent(event, uaData, strategy, fieldsAdded);
      
    } catch (error) {
      this.logger.warn('User Agent enrichment failed', {
        userAgent,
        error: error.message
      });
    }
    
    return { fields: fieldsAdded };
  }

  addUADataToEvent(event, uaData, strategy, fieldsAdded) {
    if (!event.client) {
      event.client = {};
    }
    
    if (strategy.fields.includes('browser') && uaData.browser?.name) {
      event.client.browser = {
        name: uaData.browser.name,
        version: uaData.browser.version
      };
      fieldsAdded.push({ type: 'client', field: 'browser' });
    }
    
    if (strategy.fields.includes('os') && uaData.os?.name) {
      event.client.os = {
        name: uaData.os.name,
        version: uaData.os.version
      };
      fieldsAdded.push({ type: 'client', field: 'os' });
    }
    
    if (strategy.fields.includes('device') && uaData.device?.type) {
      event.client.device = {
        type: uaData.device.type,
        model: uaData.device.model,
        vendor: uaData.device.vendor
      };
      fieldsAdded.push({ type: 'client', field: 'device' });
    }
    
    if (strategy.fields.includes('mobile')) {
      event.client.mobile = uaData.device?.type === 'mobile';
      fieldsAdded.push({ type: 'client', field: 'mobile' });
    }
  }

  enrichWithSessionInfo(event, strategy, fieldsAdded) {
    if (!event.session) {
      event.session = {};
    }
    
    // Gerar session ID se não existir
    if (strategy.fields.includes('sessionId') && !event.session.id) {
      event.session.id = this.generateSessionId(event);
      fieldsAdded.push({ type: 'session', field: 'id' });
    }
    
    // Extrair user ID se disponível
    if (strategy.fields.includes('userId') && !event.session.userId) {
      const userId = event.userId || event.user?.id || event.data?.userId;
      if (userId) {
        event.session.userId = userId;
        fieldsAdded.push({ type: 'session', field: 'userId' });
      }
    }
    
    return { fields: fieldsAdded };
  }

  enrichWithContextual(event, strategy, fieldsAdded) {
    if (!event.context) {
      event.context = {};
    }
    
    // Referrer
    if (strategy.fields.includes('referrer')) {
      const referrer = event.referrer || event.headers?.referer || event.data?.referrer;
      if (referrer && !event.context.referrer) {
        event.context.referrer = referrer;
        fieldsAdded.push({ type: 'context', field: 'referrer' });
      }
    }
    
    // Campaign tracking
    if (strategy.fields.includes('campaign')) {
      const campaign = event.utm_campaign || event.data?.utm_campaign;
      if (campaign && !event.context.campaign) {
        event.context.campaign = campaign;
        fieldsAdded.push({ type: 'context', field: 'campaign' });
      }
    }
    
    return { fields: fieldsAdded };
  }

  generateCacheKey(event) {
    const keyData = {
      type: event.type,
      source: event.source,
      ip: event.ip || event.clientIp,
      userAgent: event.userAgent || event.headers?.['user-agent']
    };
    
    return crypto.createHash('md5')
      .update(JSON.stringify(keyData))
      .digest('hex');
  }

  generateSessionId(event) {
    const sessionData = {
      ip: event.ip || event.clientIp,
      userAgent: event.userAgent || event.headers?.['user-agent'],
      timestamp: new Date().toISOString().split('T')[0] // Data atual
    };
    
    return crypto.createHash('sha256')
      .update(JSON.stringify(sessionData))
      .digest('hex')
      .substring(0, 32);
  }

  getEventSize(event) {
    return Buffer.byteLength(JSON.stringify(event), 'utf8');
  }

  updateAverageEnrichmentTime(duration) {
    const total = this.stats.averageEnrichmentTime * (this.stats.totalEnrichments - 1);
    this.stats.averageEnrichmentTime = (total + duration) / this.stats.totalEnrichments;
  }

  startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      const ttl = this.cache.ttl * 1000;
      
      // Limpar cache de enriquecimento (implementação simples)
      if (this.enrichmentCache.size > this.cache.maxSize * 0.8) {
        const keysToDelete = Array.from(this.enrichmentCache.keys())
          .slice(0, Math.floor(this.cache.maxSize * 0.2));
        
        keysToDelete.forEach(key => {
          this.enrichmentCache.delete(key);
        });
        
        this.logger.debug('Cache cleanup completed', {
          deletedKeys: keysToDelete.length,
          remainingKeys: this.enrichmentCache.size
        });
      }
    }, this.cache.ttl * 1000);
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.enrichmentCache.size,
      geoCacheSize: this.geoCache.size,
      uaCacheSize: this.uaCache.size,
      isRunning: this.isRunning
    };
  }
}

module.exports = EnrichmentService;