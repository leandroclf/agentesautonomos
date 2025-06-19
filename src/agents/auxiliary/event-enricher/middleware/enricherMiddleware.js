/**
 * Event Enricher Middleware
 * Middleware personalizado para o Event Enricher Agent
 */

const rateLimit = require('express-rate-limit');
const { promisify } = require('util');

// Middleware de logging de requisições
const requestLogger = (logger) => {
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Adicionar request ID ao contexto
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    
    // Log da requisição
    logger.info('Request started', {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    // Interceptar resposta para log
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      logger.info('Request completed', {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString()
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

// Middleware de métricas
const metricsMiddleware = (metrics) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Incrementar contador de requisições
    metrics.httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path || req.path
    });
    
    // Interceptar resposta para métricas
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      // Registrar duração da requisição
      metrics.httpRequestDuration.observe(
        {
          method: req.method,
          route: req.route?.path || req.path,
          status_code: res.statusCode
        },
        duration / 1000 // Converter para segundos
      );
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

// Middleware de validação de content-type
const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    // Pular validação para métodos GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    
    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return res.status(400).json({
        error: 'Content-Type header required',
        allowedTypes,
        timestamp: new Date().toISOString()
      });
    }
    
    const isValidType = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );
    
    if (!isValidType) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        received: contentType,
        allowedTypes,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
};

// Middleware de validação de tamanho do payload
const validatePayloadSize = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        return res.status(413).json({
          error: 'Payload too large',
          received: `${sizeInBytes} bytes`,
          maximum: maxSize,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    next();
  };
};

// Função auxiliar para converter tamanho
function parseSize(size) {
  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  
  const match = size.toString().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
}

// Middleware de rate limiting específico para enriquecimento
const enrichmentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requisições por minuto
  message: {
    error: 'Too many enrichment requests',
    message: 'Rate limit exceeded for enrichment endpoint',
    retryAfter: '60 seconds',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Usar IP + User-Agent para identificar cliente
    return `${req.ip}_${req.get('User-Agent') || 'unknown'}`;
  },
  skip: (req) => {
    // Pular rate limiting para health checks
    return req.path === '/health';
  }
});

// Middleware de rate limiting para APIs administrativas
const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20, // máximo 20 requisições por minuto
  message: {
    error: 'Too many admin requests',
    message: 'Rate limit exceeded for admin endpoint',
    retryAfter: '60 seconds',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware de validação de evento
const validateEvent = (req, res, next) => {
  const event = req.body;
  
  if (!event || typeof event !== 'object') {
    return res.status(400).json({
      error: 'Invalid event data',
      message: 'Request body must contain a valid event object',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validações básicas
  const errors = [];
  
  if (!event.type || typeof event.type !== 'string') {
    errors.push('Event type is required and must be a string');
  }
  
  if (!event.source || typeof event.source !== 'string') {
    errors.push('Event source is required and must be a string');
  }
  
  if (!event.data || typeof event.data !== 'object') {
    errors.push('Event data is required and must be an object');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Event validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// Middleware de timeout para requisições
const requestTimeout = (timeoutMs = 30000) => {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout',
          message: `Request exceeded ${timeoutMs}ms timeout`,
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);
    
    // Limpar timeout quando resposta for enviada
    const originalSend = res.send;
    res.send = function(data) {
      clearTimeout(timeout);
      return originalSend.call(this, data);
    };
    
    next();
  };
};

// Middleware de cache de resposta
const responseCache = (cacheDurationMs = 60000) => {
  const cache = new Map();
  
  // Limpar cache periodicamente
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > cacheDurationMs) {
        cache.delete(key);
      }
    }
  }, cacheDurationMs);
  
  return (req, res, next) => {
    // Apenas cachear GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    const cacheKey = `${req.method}_${req.url}`;
    const cachedResponse = cache.get(cacheKey);
    
    if (cachedResponse && (Date.now() - cachedResponse.timestamp) < cacheDurationMs) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Age', Math.floor((Date.now() - cachedResponse.timestamp) / 1000));
      return res.status(cachedResponse.statusCode).json(cachedResponse.data);
    }
    
    // Interceptar resposta para cache
    const originalJson = res.json;
    res.json = function(data) {
      // Apenas cachear respostas de sucesso
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, {
          statusCode: res.statusCode,
          data,
          timestamp: Date.now()
        });
        
        // Limitar tamanho do cache
        if (cache.size > 1000) {
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey);
        }
      }
      
      res.setHeader('X-Cache', 'MISS');
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Middleware de correlação de eventos
const eventCorrelation = (req, res, next) => {
  const event = req.body;
  
  if (event && typeof event === 'object') {
    // Adicionar correlation ID se não existir
    if (!event.correlationId) {
      event.correlationId = req.requestId;
    }
    
    // Adicionar trace ID se não existir
    if (!event.traceId) {
      event.traceId = req.headers['x-trace-id'] || req.requestId;
    }
    
    // Adicionar timestamp de recebimento
    if (!event.receivedAt) {
      event.receivedAt = new Date().toISOString();
    }
  }
  
  next();
};

// Middleware de sanitização de entrada
const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  next();
};

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Sanitizar chave
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_.-]/g, '');
    
    if (typeof value === 'string') {
      // Remover caracteres de controle e limitar tamanho
      sanitized[sanitizedKey] = value
        .replace(/[\x00-\x1F\x7F]/g, '')
        .substring(0, 10000); // Limitar a 10KB
    } else if (typeof value === 'object') {
      sanitized[sanitizedKey] = sanitizeObject(value);
    } else {
      sanitized[sanitizedKey] = value;
    }
  }
  
  return sanitized;
}

// Middleware de tratamento de erros assíncronos
const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  requestLogger,
  metricsMiddleware,
  validateContentType,
  validatePayloadSize,
  enrichmentRateLimit,
  adminRateLimit,
  validateEvent,
  requestTimeout,
  responseCache,
  eventCorrelation,
  sanitizeInput,
  asyncErrorHandler
};