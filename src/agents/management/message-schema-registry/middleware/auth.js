/**
 * Authentication & Authorization Middleware - Message Schema Registry
 * Middleware para autenticação e autorização de requisições
 */

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Configuração de rate limiting
 */
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: 'Rate limit exceeded',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_rate_limit_exceeded_total', {
          endpoint: req.path,
          method: req.method
        });
      }
      
      req.logger?.warn('Rate limit exceeded', {
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
      
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

/**
 * Rate limits específicos por tipo de operação
 */
const rateLimits = {
  // Operações gerais - 100 requests por minuto
  general: createRateLimit(60 * 1000, 100, 'Too many requests, please try again later'),
  
  // Validação - 200 requests por minuto (operação mais frequente)
  validation: createRateLimit(60 * 1000, 200, 'Too many validation requests, please try again later'),
  
  // Registro de esquemas - 20 requests por minuto
  registration: createRateLimit(60 * 1000, 20, 'Too many schema registrations, please try again later'),
  
  // Health checks - 300 requests por minuto
  health: createRateLimit(60 * 1000, 300, 'Too many health check requests, please try again later'),
  
  // Operações administrativas - 10 requests por minuto
  admin: createRateLimit(60 * 1000, 10, 'Too many admin requests, please try again later')
};

/**
 * Middleware de segurança básica
 */
const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Middleware para extrair e validar token JWT
 */
const extractToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      req.token = authHeader.substring(7);
      req.authType = 'jwt';
    } else if (apiKey) {
      req.token = apiKey;
      req.authType = 'api-key';
    } else {
      req.token = null;
      req.authType = null;
    }
    
    next();
  } catch (error) {
    req.logger?.error('Error extracting token:', error);
    next();
  }
};

/**
 * Middleware de autenticação JWT
 */
const authenticateJWT = async (req, res, next) => {
  try {
    if (!req.token || req.authType !== 'jwt') {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Valid JWT token required'
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      req.logger?.error('JWT_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: 'Authentication configuration error'
      });
    }

    const decoded = jwt.verify(req.token, jwtSecret);
    req.user = decoded;
    
    // Log de auditoria
    if (req.logger) {
      req.logger.info('User authenticated', {
        userId: decoded.sub || decoded.id,
        username: decoded.username,
        roles: decoded.roles,
        endpoint: req.path,
        method: req.method
      });
    }
    
    // Atualizar métricas
    if (req.metricsService) {
      req.metricsService.incrementCounter('msr_auth_success_total', {
        type: 'jwt',
        endpoint: req.path
      });
    }
    
    next();
  } catch (error) {
    req.logger?.warn('JWT authentication failed', {
      error: error.message,
      token: req.token?.substring(0, 10) + '...',
      endpoint: req.path
    });
    
    if (req.metricsService) {
      req.metricsService.incrementCounter('msr_auth_failure_total', {
        type: 'jwt',
        reason: error.name,
        endpoint: req.path
      });
    }
    
    const message = error.name === 'TokenExpiredError' ? 'Token expired' :
                   error.name === 'JsonWebTokenError' ? 'Invalid token' :
                   'Authentication failed';
    
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message
    });
  }
};

/**
 * Middleware de autenticação por API Key
 */
const authenticateAPIKey = async (req, res, next) => {
  try {
    if (!req.token || req.authType !== 'api-key') {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Valid API key required'
      });
    }

    // Validar API key (implementar conforme necessário)
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    
    if (!validApiKeys.includes(req.token)) {
      req.logger?.warn('Invalid API key used', {
        apiKey: req.token.substring(0, 8) + '...',
        endpoint: req.path,
        ip: req.ip
      });
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_auth_failure_total', {
          type: 'api-key',
          reason: 'invalid_key',
          endpoint: req.path
        });
      }
      
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid API key'
      });
    }

    // Simular usuário para API key
    req.user = {
      id: 'api-key-user',
      username: 'api-key',
      roles: ['api-user'],
      apiKey: true
    };
    
    if (req.metricsService) {
      req.metricsService.incrementCounter('msr_auth_success_total', {
        type: 'api-key',
        endpoint: req.path
      });
    }
    
    next();
  } catch (error) {
    req.logger?.error('API key authentication error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'Internal authentication error'
    });
  }
};

/**
 * Middleware de autenticação flexível (JWT ou API Key)
 */
const authenticate = async (req, res, next) => {
  if (req.authType === 'jwt') {
    return authenticateJWT(req, res, next);
  } else if (req.authType === 'api-key') {
    return authenticateAPIKey(req, res, next);
  } else {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Provide either JWT token or API key'
    });
  }
};

/**
 * Middleware de autenticação opcional
 */
const optionalAuth = async (req, res, next) => {
  if (req.token) {
    return authenticate(req, res, next);
  }
  
  // Usuário anônimo
  req.user = {
    id: 'anonymous',
    username: 'anonymous',
    roles: ['anonymous'],
    anonymous: true
  };
  
  next();
};

/**
 * Middleware de autorização baseada em roles
 */
const authorize = (requiredRoles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const userRoles = req.user.roles || [];
      
      // Admin tem acesso a tudo
      if (userRoles.includes('admin')) {
        return next();
      }
      
      // Verificar se usuário tem pelo menos uma das roles necessárias
      const hasRequiredRole = requiredRoles.length === 0 || 
                             requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        req.logger?.warn('Authorization failed', {
          userId: req.user.id,
          userRoles,
          requiredRoles,
          endpoint: req.path
        });
        
        if (req.metricsService) {
          req.metricsService.incrementCounter('msr_authorization_failure_total', {
            endpoint: req.path,
            userId: req.user.id
          });
        }
        
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `Required roles: ${requiredRoles.join(', ')}`
        });
      }
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_authorization_success_total', {
          endpoint: req.path,
          userId: req.user.id
        });
      }
      
      next();
    } catch (error) {
      req.logger?.error('Authorization error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Authorization error',
        message: 'Internal authorization error'
      });
    }
  };
};

/**
 * Middleware para verificar permissões específicas de subject
 */
const authorizeSubject = (action = 'read') => {
  return (req, res, next) => {
    try {
      const subject = req.params.subject || req.body.subject;
      const userRoles = req.user?.roles || [];
      
      // Admin tem acesso a tudo
      if (userRoles.includes('admin')) {
        return next();
      }
      
      // Verificar permissões específicas do subject
      const allowedActions = {
        'schema-reader': ['read'],
        'schema-writer': ['read', 'write'],
        'schema-admin': ['read', 'write', 'delete', 'admin']
      };
      
      const userPermissions = userRoles.flatMap(role => allowedActions[role] || []);
      
      if (!userPermissions.includes(action)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `Action '${action}' not allowed for subject '${subject}'`
        });
      }
      
      next();
    } catch (error) {
      req.logger?.error('Subject authorization error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Authorization error'
      });
    }
  };
};

/**
 * Middleware para logging de auditoria
 */
const auditLog = (req, res, next) => {
  const startTime = Date.now();
  
  // Interceptar resposta para log
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    if (req.logger) {
      req.logger.info('API Request', {
        method: req.method,
        path: req.path,
        query: req.query,
        userId: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString()
      });
    }
    
    if (req.metricsService) {
      req.metricsService.recordHistogram('msr_request_duration_ms', duration, {
        method: req.method,
        endpoint: req.path,
        status: res.statusCode.toString()
      });
      
      req.metricsService.incrementCounter('msr_requests_total', {
        method: req.method,
        endpoint: req.path,
        status: res.statusCode.toString()
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  securityMiddleware,
  extractToken,
  authenticate,
  authenticateJWT,
  authenticateAPIKey,
  optionalAuth,
  authorize,
  authorizeSubject,
  auditLog,
  rateLimits
};