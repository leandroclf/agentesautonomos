/**
 * Rate Limiting Middleware - Message Schema Registry
 * Middleware para controle de taxa de requisições e prevenção de abuso
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const { getLogger } = require('./logging');

const logger = getLogger();

/**
 * Configuração do Redis para armazenamento distribuído
 */
let redisClient = null;

const createRedisClient = () => {
  if (process.env.REDIS_URL && !redisClient) {
    try {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis max retry attempts reached');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });
      
      redisClient.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
      });
      
      redisClient.on('connect', () => {
        logger.info('Redis client connected');
      });
      
      redisClient.on('disconnect', () => {
        logger.warn('Redis client disconnected');
      });
      
    } catch (error) {
      logger.error('Failed to create Redis client', { error: error.message });
      redisClient = null;
    }
  }
  
  return redisClient;
};

/**
 * Função para criar store baseado na disponibilidade do Redis
 */
const createStore = () => {
  const client = createRedisClient();
  
  if (client) {
    return new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
      prefix: 'msr:rl:' // message-schema-registry:rate-limit
    });
  }
  
  // Fallback para MemoryStore (não recomendado para produção)
  logger.warn('Using in-memory rate limiting store. Not recommended for production.');
  return undefined; // express-rate-limit usará MemoryStore por padrão
};

/**
 * Configurações de rate limiting por tipo de operação
 */
const rateLimitConfigs = {
  // Rate limiting geral
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // máximo 1000 requests por IP por janela
    message: {
      success: false,
      error: 'Too many requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Pular rate limiting para health checks
      return req.path.startsWith('/health');
    }
  },
  
  // Rate limiting para operações de validação
  validation: {
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // máximo 100 validações por minuto
    message: {
      success: false,
      error: 'Validation rate limit exceeded',
      message: 'Too many validation requests, please slow down.',
      retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Rate limiting para registro de schemas
  registration: {
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 50, // máximo 50 registros por 5 minutos
    message: {
      success: false,
      error: 'Schema registration rate limit exceeded',
      message: 'Too many schema registrations, please wait before registering more schemas.',
      retryAfter: '5 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Rate limiting para operações administrativas
  admin: {
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 200, // máximo 200 operações administrativas por 10 minutos
    message: {
      success: false,
      error: 'Admin operation rate limit exceeded',
      message: 'Too many administrative operations, please wait.',
      retryAfter: '10 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Rate limiting para operações de compatibilidade
  compatibility: {
    windowMs: 2 * 60 * 1000, // 2 minutos
    max: 50, // máximo 50 testes de compatibilidade por 2 minutos
    message: {
      success: false,
      error: 'Compatibility check rate limit exceeded',
      message: 'Too many compatibility checks, please slow down.',
      retryAfter: '2 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Rate limiting para operações de leitura
  read: {
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 500, // máximo 500 operações de leitura por minuto
    message: {
      success: false,
      error: 'Read operation rate limit exceeded',
      message: 'Too many read requests, please slow down.',
      retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Rate limiting para batch operations
  batch: {
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 10, // máximo 10 operações em lote por 5 minutos
    message: {
      success: false,
      error: 'Batch operation rate limit exceeded',
      message: 'Too many batch operations, please wait before submitting more batches.',
      retryAfter: '5 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  }
};

/**
 * Função para criar rate limiter com configuração específica
 */
const createRateLimiter = (configName, customConfig = {}) => {
  const config = {
    ...rateLimitConfigs[configName],
    ...customConfig
  };
  
  // Adicionar store se disponível
  const store = createStore();
  if (store) {
    config.store = store;
  }
  
  // Função para gerar chave personalizada
  config.keyGenerator = (req) => {
    // Usar user ID se autenticado, senão IP
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;
    
    if (userId) {
      return `user:${userId}:${configName}`;
    }
    
    return `ip:${ip}:${configName}`;
  };
  
  // Handler para quando o limite é excedido
  config.handler = (req, res) => {
    const userId = req.user?.id;
    const ip = req.ip;
    
    logger.warn('Rate limit exceeded', {
      configName,
      userId,
      ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      limit: config.max,
      windowMs: config.windowMs
    });
    
    // Atualizar métricas se disponível
    if (req.metricsService) {
      req.metricsService.incrementCounter('rate_limit_exceeded_total', {
        type: configName,
        path: req.path,
        method: req.method
      });
    }
    
    res.status(429).json(config.message);
  };
  
  // Handler para requisições bem-sucedidas (para logging)
  config.onLimitReached = (req, res, options) => {
    logger.info('Rate limit reached but not exceeded', {
      configName,
      userId: req.user?.id,
      ip: req.ip,
      path: req.path,
      remaining: res.getHeader('X-RateLimit-Remaining')
    });
  };
  
  return rateLimit(config);
};

/**
 * Rate limiters específicos
 */
const rateLimiters = {
  general: createRateLimiter('general'),
  validation: createRateLimiter('validation'),
  registration: createRateLimiter('registration'),
  admin: createRateLimiter('admin'),
  compatibility: createRateLimiter('compatibility'),
  read: createRateLimiter('read'),
  batch: createRateLimiter('batch')
};

/**
 * Rate limiter dinâmico baseado no usuário
 */
const createDynamicRateLimiter = (baseConfig) => {
  return (req, res, next) => {
    let config = { ...baseConfig };
    
    // Ajustar limites baseado no tipo de usuário
    if (req.user) {
      const userType = req.user.type || 'regular';
      
      switch (userType) {
        case 'admin':
          config.max = config.max * 5; // Admins têm 5x mais limite
          break;
        case 'premium':
          config.max = config.max * 3; // Usuários premium têm 3x mais limite
          break;
        case 'service':
          config.max = config.max * 10; // Contas de serviço têm 10x mais limite
          break;
        default:
          // Manter limite padrão para usuários regulares
          break;
      }
    }
    
    const limiter = createRateLimiter('dynamic', config);
    limiter(req, res, next);
  };
};

/**
 * Middleware para rate limiting baseado em IP e User-Agent
 */
const createAdvancedRateLimiter = (configName) => {
  return (req, res, next) => {
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // Detectar possíveis bots ou scrapers
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i
    ];
    
    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
    
    let config = { ...rateLimitConfigs[configName] };
    
    if (isSuspicious) {
      // Aplicar limites mais restritivos para user-agents suspeitos
      config.max = Math.floor(config.max * 0.1); // 10% do limite normal
      config.windowMs = config.windowMs * 2; // Janela 2x maior
      
      logger.info('Suspicious user agent detected, applying stricter rate limits', {
        userAgent,
        ip: req.ip,
        originalMax: rateLimitConfigs[configName].max,
        newMax: config.max
      });
    }
    
    const limiter = createRateLimiter(`${configName}_advanced`, config);
    limiter(req, res, next);
  };
};

/**
 * Middleware para bypass de rate limiting
 */
const createBypassMiddleware = (bypassConditions = []) => {
  return (req, res, next) => {
    // Verificar condições de bypass
    const shouldBypass = bypassConditions.some(condition => {
      if (typeof condition === 'function') {
        return condition(req);
      }
      return false;
    });
    
    if (shouldBypass) {
      logger.debug('Rate limiting bypassed', {
        path: req.path,
        ip: req.ip,
        userId: req.user?.id,
        reason: 'bypass_condition_met'
      });
      
      return next();
    }
    
    next();
  };
};

/**
 * Condições de bypass comuns
 */
const bypassConditions = {
  // Bypass para IPs da whitelist
  whitelistedIPs: (req) => {
    const whitelist = (process.env.RATE_LIMIT_WHITELIST || '').split(',').filter(Boolean);
    return whitelist.includes(req.ip);
  },
  
  // Bypass para usuários admin
  adminUsers: (req) => {
    return req.user && req.user.roles && req.user.roles.includes('admin');
  },
  
  // Bypass para health checks
  healthChecks: (req) => {
    return req.path.startsWith('/health') || req.path.startsWith('/metrics');
  },
  
  // Bypass para requests internos
  internalRequests: (req) => {
    const internalHeader = req.get('X-Internal-Request');
    const internalSecret = process.env.INTERNAL_REQUEST_SECRET;
    return internalHeader && internalSecret && internalHeader === internalSecret;
  }
};

/**
 * Middleware para logging de rate limiting
 */
const rateLimitLoggingMiddleware = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Log informações de rate limiting
    const remaining = res.getHeader('X-RateLimit-Remaining');
    const limit = res.getHeader('X-RateLimit-Limit');
    const reset = res.getHeader('X-RateLimit-Reset');
    
    if (remaining !== undefined) {
      req.logger?.debug('Rate limit info', {
        remaining: parseInt(remaining),
        limit: parseInt(limit),
        reset: new Date(parseInt(reset) * 1000).toISOString(),
        path: req.path,
        method: req.method,
        statusCode: res.statusCode
      });
      
      // Alertar quando restam poucas requisições
      if (parseInt(remaining) < parseInt(limit) * 0.1) {
        req.logger?.warn('Rate limit nearly exhausted', {
          remaining: parseInt(remaining),
          limit: parseInt(limit),
          percentage: (parseInt(remaining) / parseInt(limit)) * 100,
          userId: req.user?.id,
          ip: req.ip
        });
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Função para obter estatísticas de rate limiting
 */
const getRateLimitStats = async () => {
  if (!redisClient) {
    return { error: 'Redis not available' };
  }
  
  try {
    const keys = await redisClient.keys('msr:rl:*');
    const stats = {
      totalKeys: keys.length,
      keysByType: {},
      activeUsers: new Set(),
      activeIPs: new Set()
    };
    
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length >= 4) {
        const type = parts[3];
        const identifier = parts[2];
        
        stats.keysByType[type] = (stats.keysByType[type] || 0) + 1;
        
        if (identifier.startsWith('user:')) {
          stats.activeUsers.add(identifier.split(':')[1]);
        } else if (identifier.startsWith('ip:')) {
          stats.activeIPs.add(identifier.split(':')[1]);
        }
      }
    }
    
    stats.activeUsers = stats.activeUsers.size;
    stats.activeIPs = stats.activeIPs.size;
    
    return stats;
  } catch (error) {
    logger.error('Failed to get rate limit stats', { error: error.message });
    return { error: error.message };
  }
};

/**
 * Função para limpar rate limits expirados
 */
const cleanupExpiredRateLimits = async () => {
  if (!redisClient) {
    return;
  }
  
  try {
    const keys = await redisClient.keys('msr:rl:*');
    let cleaned = 0;
    
    for (const key of keys) {
      const ttl = await redisClient.ttl(key);
      if (ttl === -1) { // Chave sem TTL
        await redisClient.del(key);
        cleaned++;
      }
    }
    
    logger.info('Rate limit cleanup completed', { cleaned, total: keys.length });
  } catch (error) {
    logger.error('Failed to cleanup rate limits', { error: error.message });
  }
};

module.exports = {
  rateLimiters,
  createRateLimiter,
  createDynamicRateLimiter,
  createAdvancedRateLimiter,
  createBypassMiddleware,
  bypassConditions,
  rateLimitLoggingMiddleware,
  getRateLimitStats,
  cleanupExpiredRateLimits,
  rateLimitConfigs
};