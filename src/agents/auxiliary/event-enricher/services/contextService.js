/**
 * Context Service
 * Serviço responsável por adicionar contexto aos eventos
 */

const EventEmitter = require('events');
const redis = require('redis');
const config = require('../config/enricherConfig');

class ContextService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.isRunning = false;
    
    // Clientes de contexto
    this.redisClient = null;
    this.dbClient = null;
    
    // Cache local
    this.contextCache = new Map();
    
    // Estatísticas
    this.stats = {
      totalLookups: 0,
      successfulLookups: 0,
      failedLookups: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLookupTime: 0
    };
    
    // Configurações
    this.sources = config.context.sources;
    this.cache = config.context.cache;
    this.lookup = config.context.lookup;
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Context Service already running');
      return;
    }

    this.logger.info('Starting Context Service');
    
    try {
      // Inicializar Redis se habilitado
      if (this.sources.redis.enabled) {
        await this.initializeRedis();
      }
      
      // Inicializar Database se habilitado
      if (this.sources.database.enabled) {
        await this.initializeDatabase();
      }
      
      // Inicializar cache cleanup
      if (this.cache.enabled) {
        this.startCacheCleanup();
      }
      
      this.isRunning = true;
      this.logger.info('Context Service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Context Service', {
        error: error.message
      });
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Context Service not running');
      return;
    }

    this.logger.info('Stopping Context Service');
    this.isRunning = false;
    
    try {
      // Fechar conexões
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      
      if (this.dbClient) {
        await this.dbClient.end();
      }
      
      // Limpar cache
      this.contextCache.clear();
      
      this.logger.info('Context Service stopped');
      
    } catch (error) {
      this.logger.error('Error stopping Context Service', {
        error: error.message
      });
    }
  }

  async initializeRedis() {
    try {
      this.redisClient = redis.createClient({
        host: this.sources.redis.host,
        port: this.sources.redis.port,
        connectTimeout: this.sources.redis.timeout
      });
      
      this.redisClient.on('error', (error) => {
        this.logger.error('Redis error', { error: error.message });
      });
      
      this.redisClient.on('connect', () => {
        this.logger.info('Redis connected');
      });
      
      await this.redisClient.connect();
      
    } catch (error) {
      this.logger.error('Failed to initialize Redis', {
        error: error.message
      });
      throw error;
    }
  }

  async initializeDatabase() {
    // Implementação mock para database
    // Em produção, usar cliente real (pg, mysql2, etc.)
    this.dbClient = {
      query: async (sql, params) => {
        // Mock implementation
        this.logger.debug('Database query (mock)', { sql, params });
        return { rows: [] };
      },
      end: async () => {
        this.logger.debug('Database connection closed (mock)');
      }
    };
    
    this.logger.info('Database client initialized (mock)');
  }

  async addContext(event) {
    const startTime = Date.now();
    
    try {
      this.emit('contextLookupStarted', {
        eventId: event.id,
        type: event.type,
        timestamp: new Date().toISOString()
      });
      
      // Verificar cache
      const cacheKey = this.generateContextCacheKey(event);
      if (this.cache.enabled && this.contextCache.has(cacheKey)) {
        this.stats.cacheHits++;
        const cachedContext = this.contextCache.get(cacheKey);
        
        const contextualizedEvent = {
          ...event,
          context: {
            ...event.context,
            ...cachedContext
          }
        };
        
        this.logger.debug('Using cached context', { eventId: event.id });
        return contextualizedEvent;
      }
      
      this.stats.cacheMisses++;
      
      // Buscar contexto de múltiplas fontes
      const contextData = await this.gatherContextData(event);
      
      // Adicionar contexto ao evento
      const contextualizedEvent = {
        ...event,
        context: {
          ...event.context,
          ...contextData,
          _contextMetadata: {
            sources: Object.keys(contextData),
            timestamp: new Date().toISOString(),
            lookupTime: Date.now() - startTime
          }
        }
      };
      
      // Armazenar no cache
      if (this.cache.enabled && Object.keys(contextData).length > 0) {
        this.contextCache.set(cacheKey, contextData);
        
        // Limitar tamanho do cache
        if (this.contextCache.size > this.cache.maxSize) {
          const firstKey = this.contextCache.keys().next().value;
          this.contextCache.delete(firstKey);
        }
      }
      
      // Atualizar estatísticas
      this.stats.totalLookups++;
      this.stats.successfulLookups++;
      this.updateAverageLookupTime(Date.now() - startTime);
      
      this.emit('contextLoaded', {
        eventId: event.id,
        contextFields: Object.keys(contextData),
        lookupTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      return contextualizedEvent;
      
    } catch (error) {
      this.stats.failedLookups++;
      
      this.logger.error('Context lookup failed', {
        eventId: event.id,
        error: error.message
      });
      
      // Retornar evento original em caso de erro
      return event;
    }
  }

  async gatherContextData(event) {
    const contextData = {};
    const lookupPromises = [];
    
    // Lookup de usuário
    if (event.userId || event.user?.id) {
      lookupPromises.push(
        this.lookupUserContext(event.userId || event.user.id)
          .then(userContext => {
            if (userContext) {
              contextData.user = userContext;
            }
          })
          .catch(error => {
            this.logger.warn('User context lookup failed', {
              userId: event.userId || event.user?.id,
              error: error.message
            });
          })
      );
    }
    
    // Lookup de sessão
    if (event.sessionId || event.session?.id) {
      lookupPromises.push(
        this.lookupSessionContext(event.sessionId || event.session.id)
          .then(sessionContext => {
            if (sessionContext) {
              contextData.session = sessionContext;
            }
          })
          .catch(error => {
            this.logger.warn('Session context lookup failed', {
              sessionId: event.sessionId || event.session?.id,
              error: error.message
            });
          })
      );
    }
    
    // Lookup de organização
    if (event.organizationId || event.org?.id) {
      lookupPromises.push(
        this.lookupOrganizationContext(event.organizationId || event.org.id)
          .then(orgContext => {
            if (orgContext) {
              contextData.organization = orgContext;
            }
          })
          .catch(error => {
            this.logger.warn('Organization context lookup failed', {
              organizationId: event.organizationId || event.org?.id,
              error: error.message
            });
          })
      );
    }
    
    // Lookup de aplicação
    if (event.applicationId || event.app?.id) {
      lookupPromises.push(
        this.lookupApplicationContext(event.applicationId || event.app.id)
          .then(appContext => {
            if (appContext) {
              contextData.application = appContext;
            }
          })
          .catch(error => {
            this.logger.warn('Application context lookup failed', {
              applicationId: event.applicationId || event.app?.id,
              error: error.message
            });
          })
      );
    }
    
    // Aguardar todos os lookups com timeout
    try {
      await Promise.allSettled(lookupPromises);
    } catch (error) {
      this.logger.warn('Some context lookups failed', {
        error: error.message
      });
    }
    
    return contextData;
  }

  async lookupUserContext(userId) {
    try {
      // Tentar Redis primeiro
      if (this.redisClient) {
        const redisKey = `user:${userId}`;
        const cachedUser = await this.redisClient.get(redisKey);
        
        if (cachedUser) {
          return JSON.parse(cachedUser);
        }
      }
      
      // Fallback para database
      if (this.dbClient) {
        const result = await this.dbClient.query(
          'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
          [userId]
        );
        
        if (result.rows.length > 0) {
          const user = result.rows[0];
          
          // Armazenar no Redis para próximas consultas
          if (this.redisClient) {
            await this.redisClient.setex(
              `user:${userId}`,
              300, // 5 minutos
              JSON.stringify(user)
            );
          }
          
          return user;
        }
      }
      
      return null;
      
    } catch (error) {
      this.logger.error('User context lookup error', {
        userId,
        error: error.message
      });
      return null;
    }
  }

  async lookupSessionContext(sessionId) {
    try {
      if (this.redisClient) {
        const redisKey = `session:${sessionId}`;
        const cachedSession = await this.redisClient.get(redisKey);
        
        if (cachedSession) {
          return JSON.parse(cachedSession);
        }
      }
      
      // Mock session data
      return {
        id: sessionId,
        startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hora atrás
        lastActivity: new Date().toISOString(),
        pageViews: Math.floor(Math.random() * 10) + 1,
        duration: 3600000 // 1 hora em ms
      };
      
    } catch (error) {
      this.logger.error('Session context lookup error', {
        sessionId,
        error: error.message
      });
      return null;
    }
  }

  async lookupOrganizationContext(organizationId) {
    try {
      if (this.redisClient) {
        const redisKey = `org:${organizationId}`;
        const cachedOrg = await this.redisClient.get(redisKey);
        
        if (cachedOrg) {
          return JSON.parse(cachedOrg);
        }
      }
      
      // Mock organization data
      const orgData = {
        id: organizationId,
        name: `Organization ${organizationId}`,
        plan: 'premium',
        industry: 'technology',
        size: 'medium'
      };
      
      // Cache por mais tempo (organizações mudam menos)
      if (this.redisClient) {
        await this.redisClient.setex(
          `org:${organizationId}`,
          1800, // 30 minutos
          JSON.stringify(orgData)
        );
      }
      
      return orgData;
      
    } catch (error) {
      this.logger.error('Organization context lookup error', {
        organizationId,
        error: error.message
      });
      return null;
    }
  }

  async lookupApplicationContext(applicationId) {
    try {
      // Mock application data
      return {
        id: applicationId,
        name: `Application ${applicationId}`,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      };
      
    } catch (error) {
      this.logger.error('Application context lookup error', {
        applicationId,
        error: error.message
      });
      return null;
    }
  }

  generateContextCacheKey(event) {
    const keyData = {
      userId: event.userId || event.user?.id,
      sessionId: event.sessionId || event.session?.id,
      organizationId: event.organizationId || event.org?.id,
      applicationId: event.applicationId || event.app?.id
    };
    
    return `context:${JSON.stringify(keyData)}`;
  }

  updateAverageLookupTime(duration) {
    const total = this.stats.averageLookupTime * (this.stats.totalLookups - 1);
    this.stats.averageLookupTime = (total + duration) / this.stats.totalLookups;
  }

  startCacheCleanup() {
    setInterval(() => {
      if (this.contextCache.size > this.cache.maxSize * 0.8) {
        const keysToDelete = Array.from(this.contextCache.keys())
          .slice(0, Math.floor(this.cache.maxSize * 0.2));
        
        keysToDelete.forEach(key => {
          this.contextCache.delete(key);
        });
        
        this.logger.debug('Context cache cleanup completed', {
          deletedKeys: keysToDelete.length,
          remainingKeys: this.contextCache.size
        });
      }
    }, this.cache.ttl * 1000);
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.contextCache.size,
      isRunning: this.isRunning,
      redisConnected: this.redisClient?.isReady || false,
      dbConnected: !!this.dbClient
    };
  }
}

module.exports = ContextService;