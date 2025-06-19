/**
 * Security Middleware
 * Middleware de segurança para o Recovery Agent
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const config = require('../config/recoveryConfig');

// Rate limiting
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.round(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    }
  });
};

// Rate limiters específicos
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutos
  config.security.rateLimit.general.max,
  'Too many requests from this IP, please try again later'
);

const recoveryLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutos
  config.security.rateLimit.recovery.max,
  'Too many recovery requests from this IP, please try again later'
);

const escalationLimiter = createRateLimiter(
  10 * 60 * 1000, // 10 minutos
  config.security.rateLimit.escalation.max,
  'Too many escalation requests from this IP, please try again later'
);

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sem origin (ex: Postman, aplicações mobile)
    if (!origin) return callback(null, true);
    
    // Verificar se a origin está na lista de permitidas
    if (config.security.cors.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Verificar wildcards
    const isAllowed = config.security.cors.allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        const regex = new RegExp(allowedOrigin.replace(/\*/g, '.*'));
        return regex.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: config.security.cors.allowedMethods,
  allowedHeaders: config.security.cors.allowedHeaders,
  credentials: config.security.cors.credentials,
  optionsSuccessStatus: 200
};

// Helmet configuration
const helmetOptions = {
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
  crossOriginResourcePolicy: { policy: "cross-origin" }
};

// Middleware de autenticação
const authenticate = (req, res, next) => {
  if (!config.security.authentication.enabled) {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      error: 'Authorization header required',
      timestamp: new Date().toISOString()
    });
  }

  const token = authHeader.split(' ')[1]; // Bearer <token>
  
  if (!token) {
    return res.status(401).json({
      error: 'Bearer token required',
      timestamp: new Date().toISOString()
    });
  }

  // Verificar se o token está na lista de tokens válidos
  if (!config.security.authentication.validTokens.includes(token)) {
    return res.status(401).json({
      error: 'Invalid token',
      timestamp: new Date().toISOString()
    });
  }

  // Adicionar informações do usuário ao request
  req.user = {
    token,
    authenticated: true,
    timestamp: new Date().toISOString()
  };

  next();
};

// Middleware de validação de IP
const validateIP = (req, res, next) => {
  if (!config.security.ipWhitelist.enabled) {
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress;
  const allowedIPs = config.security.ipWhitelist.allowedIPs;

  // Verificar se o IP está na whitelist
  const isAllowed = allowedIPs.some(allowedIP => {
    if (allowedIP.includes('/')) {
      // CIDR notation
      return isIPInCIDR(clientIP, allowedIP);
    }
    return clientIP === allowedIP;
  });

  if (!isAllowed) {
    return res.status(403).json({
      error: 'IP address not allowed',
      ip: clientIP,
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// Middleware de validação de entrada
const validateInput = (req, res, next) => {
  // Sanitizar entrada
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Middleware de logging de segurança
const securityLogger = (logger) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Log da requisição
    logger.info('Security check', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Interceptar resposta para log
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      logger.info('Security response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      
      originalSend.call(this, data);
    };

    next();
  };
};

// Middleware de detecção de ataques
const attackDetection = (logger) => {
  const suspiciousPatterns = [
    /(<script[^>]*>.*?<\/script>)/gi, // XSS
    /(union.*select|select.*from|insert.*into|delete.*from|drop.*table)/gi, // SQL Injection
    /(\.\.\/|\.\.\\/)/g, // Path traversal
    /(eval\(|setTimeout\(|setInterval\()/gi, // Code injection
    /(javascript:|data:|vbscript:)/gi // Protocol injection
  ];

  return (req, res, next) => {
    const checkString = JSON.stringify({
      body: req.body,
      query: req.query,
      params: req.params
    });

    const detectedAttacks = [];
    
    suspiciousPatterns.forEach((pattern, index) => {
      if (pattern.test(checkString)) {
        detectedAttacks.push({
          type: ['xss', 'sql_injection', 'path_traversal', 'code_injection', 'protocol_injection'][index],
          pattern: pattern.toString()
        });
      }
    });

    if (detectedAttacks.length > 0) {
      logger.warn('Potential attack detected', {
        ip: req.ip,
        method: req.method,
        path: req.path,
        attacks: detectedAttacks,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      return res.status(400).json({
        error: 'Malicious input detected',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Funções auxiliares
function isIPInCIDR(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - bits) - 1);
  return (ip2int(ip) & mask) === (ip2int(range) & mask);
}

function ip2int(ip) {
  return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeString(key);
    sanitized[sanitizedKey] = sanitizeObject(value);
  }

  return sanitized;
}

function sanitizeString(str) {
  if (typeof str !== 'string') {
    return str;
  }

  return str
    .replace(/[<>"'&]/g, (match) => {
      const entities = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[match];
    })
    .trim();
}

// Middleware de timeout
const requestTimeout = (timeout = 30000) => {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout',
          timeout: timeout,
          timestamp: new Date().toISOString()
        });
      }
    }, timeout);

    res.on('finish', () => {
      clearTimeout(timer);
    });

    next();
  };
};

// Exportar middlewares
module.exports = {
  // Rate limiters
  generalLimiter,
  recoveryLimiter,
  escalationLimiter,
  
  // Security middlewares
  helmet: helmet(helmetOptions),
  cors: cors(corsOptions),
  authenticate,
  validateIP,
  validateInput,
  securityLogger,
  attackDetection,
  requestTimeout,
  
  // Configurações
  corsOptions,
  helmetOptions
};