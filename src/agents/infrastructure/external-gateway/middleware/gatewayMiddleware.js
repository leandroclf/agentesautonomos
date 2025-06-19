/**
 * Gateway Middleware
 * Middlewares para o External Event API Gateway
 */

const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const DOMPurify = require('isomorphic-dompurify');

class GatewayMiddleware {
  /**
   * Middleware de logging de requisições
   */
  static requestLogger(logger) {
    return (req, res, next) => {
      const startTime = Date.now();
      const requestId = uuidv4();
      
      // Adiciona ID da requisição
      req.requestId = requestId;
      res.setHeader('X-Request-ID', requestId);
      
      // Log da requisição
      logger.info('Requisição recebida', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length'),
        timestamp: new Date().toISOString()
      });
      
      // Intercepta o final da resposta
      const originalSend = res.send;
      res.send = function(data) {
        const duration = Date.now() - startTime;
        
        logger.info('Resposta enviada', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length'),
          timestamp: new Date().toISOString()
        });
        
        return originalSend.call(this, data);
      };
      
      next();
    };
  }

  /**
   * Middleware de métricas
   */
  static requestMetrics(metrics) {
    return (req, res, next) => {
      if (!metrics) {
        return next();
      }

      const startTime = Date.now();
      
      // Incrementa conexões ativas
      metrics.activeConnections.inc();
      
      // Intercepta o final da resposta
      const originalSend = res.send;
      res.send = function(data) {
        const duration = (Date.now() - startTime) / 1000;
        const route = req.route ? req.route.path : req.path;
        
        // Métricas de requisição
        metrics.httpRequestsTotal.inc({
          method: req.method,
          route,
          status_code: res.statusCode
        });
        
        metrics.httpRequestDuration.observe({
          method: req.method,
          route,
          status_code: res.statusCode
        }, duration);
        
        // Decrementa conexões ativas
        metrics.activeConnections.dec();
        
        return originalSend.call(this, data);
      };
      
      next();
    };
  }

  /**
   * Middleware de timeout de requisição
   */
  static requestTimeout(timeout) {
    return (req, res, next) => {
      // Define timeout para a requisição
      req.setTimeout(timeout, () => {
        if (!res.headersSent) {
          res.status(408).json({
            error: 'Request Timeout',
            message: `Request timed out after ${timeout}ms`,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      next();
    };
  }

  /**
   * Middleware de rate limiting
   */
  static rateLimiter(config) {
    return rateLimit({
      windowMs: config.windowMs,
      max: config.maxRequests,
      skipSuccessfulRequests: config.skipSuccessfulRequests,
      skipFailedRequests: config.skipFailedRequests,
      standardHeaders: config.standardHeaders,
      legacyHeaders: config.legacyHeaders,
      message: {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`,
        retryAfter: Math.ceil(config.windowMs / 1000),
        timestamp: new Date().toISOString()
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`,
          retryAfter: Math.ceil(config.windowMs / 1000),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Middleware de autenticação
   */
  static requireAuth(authService, requiredPermissions = []) {
    return async (req, res, next) => {
      try {
        // Extrai API key do header
        const apiKey = req.get('x-api-key') || req.get('authorization')?.replace('Bearer ', '');
        
        if (!apiKey) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key is required',
            timestamp: new Date().toISOString()
          });
        }
        
        // Autentica API key
        const authResult = await authService.authenticateApiKey(apiKey);
        
        if (!authResult.valid) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: authResult.reason || 'Invalid API key',
            timestamp: new Date().toISOString()
          });
        }
        
        // Verifica permissões
        if (requiredPermissions.length > 0) {
          const hasPermission = requiredPermissions.some(permission => 
            authService.hasPermission(authResult.keyData, permission)
          );
          
          if (!hasPermission) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `Required permissions: ${requiredPermissions.join(', ')}`,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Adiciona dados da key à requisição
        req.apiKey = apiKey;
        req.keyData = authResult.keyData;
        
        next();
      } catch (error) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Authentication error',
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Middleware de validação básica de requisição
   */
  static requestValidation() {
    return (req, res, next) => {
      // Valida Content-Type para requisições POST/PUT
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.get('Content-Type');
        
        if (!contentType || !contentType.includes('application/json')) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Content-Type must be application/json',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Valida tamanho do payload
      const contentLength = parseInt(req.get('Content-Length') || '0');
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (contentLength > maxSize) {
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `Request payload too large. Maximum size: ${maxSize} bytes`,
          timestamp: new Date().toISOString()
        });
      }
      
      next();
    };
  }

  /**
   * Middleware de sanitização de entrada
   */
  static inputSanitization() {
    return (req, res, next) => {
      if (req.body && typeof req.body === 'object') {
        req.body = this.sanitizeObject(req.body);
      }
      
      next();
    };
  }

  /**
   * Sanitiza objeto recursivamente
   */
  static sanitizeObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          // Sanitiza strings HTML
          sanitized[key] = DOMPurify.sanitize(value, { 
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: []
          });
        } else if (typeof value === 'object') {
          sanitized[key] = this.sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
      
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Middleware de correlação de eventos
   */
  static eventCorrelation() {
    return (req, res, next) => {
      // Adiciona ou preserva correlation ID
      const correlationId = req.get('X-Correlation-ID') || uuidv4();
      
      req.correlationId = correlationId;
      res.setHeader('X-Correlation-ID', correlationId);
      
      // Adiciona ao body se for um evento
      if (req.body && (req.path.includes('/events') || req.path.includes('/batch'))) {
        if (Array.isArray(req.body.events)) {
          // Batch de eventos
          req.body.events.forEach(event => {
            if (!event.correlationId) {
              event.correlationId = correlationId;
            }
          });
        } else if (req.body.eventType) {
          // Evento único
          if (!req.body.correlationId) {
            req.body.correlationId = correlationId;
          }
        }
      }
      
      next();
    };
  }

  /**
   * Middleware de cache de resposta
   */
  static responseCache(duration = 300) {
    return (req, res, next) => {
      // Apenas para requisições GET
      if (req.method !== 'GET') {
        return next();
      }
      
      // Define headers de cache
      res.setHeader('Cache-Control', `public, max-age=${duration}`);
      res.setHeader('Expires', new Date(Date.now() + duration * 1000).toUTCString());
      
      next();
    };
  }

  /**
   * Middleware de tratamento de erros
   */
  static errorHandler(logger) {
    return (error, req, res, next) => {
      // Log do erro
      logger.error('Erro não tratado:', error, {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        stack: error.stack
      });
      
      // Resposta de erro
      if (!res.headersSent) {
        const statusCode = error.statusCode || error.status || 500;
        
        res.status(statusCode).json({
          error: error.name || 'Internal Server Error',
          message: error.message || 'An unexpected error occurred',
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
      }
    };
  }

  /**
   * Middleware de validação de payload JSON
   */
  static validateJsonPayload() {
    return (req, res, next) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (!req.body || typeof req.body !== 'object') {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid JSON payload',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      next();
    };
  }

  /**
   * Middleware de headers de segurança
   */
  static securityHeaders() {
    return (req, res, next) => {
      // Headers de segurança
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Remove headers que expõem informações
      res.removeHeader('X-Powered-By');
      
      next();
    };
  }

  /**
   * Middleware de compressão condicional
   */
  static conditionalCompression() {
    return (req, res, next) => {
      // Adiciona header para indicar suporte à compressão
      if (req.get('Accept-Encoding')?.includes('gzip')) {
        res.setHeader('Vary', 'Accept-Encoding');
      }
      
      next();
    };
  }
}

module.exports = GatewayMiddleware;