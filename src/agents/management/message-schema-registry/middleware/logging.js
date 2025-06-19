/**
 * Logging Middleware - Message Schema Registry
 * Middleware para logging estruturado e correlação de requests
 */

const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

/**
 * Configuração de formatos de log
 */
const logFormats = {
  // Formato para desenvolvimento
  development: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level}]: ${message} ${metaStr}`;
    })
  ),
  
  // Formato para produção (JSON estruturado)
  production: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  )
};

/**
 * Criar diretório de logs se não existir
 */
const ensureLogDirectory = () => {
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
};

/**
 * Configuração de transports
 */
const createTransports = () => {
  const logDir = ensureLogDirectory();
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
  
  const transports = [];
  
  // Console transport
  transports.push(
    new winston.transports.Console({
      level: logLevel,
      format: logFormats[isProduction ? 'production' : 'development']
    })
  );
  
  // File transports para produção
  if (isProduction) {
    // Log geral
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'application.log'),
        level: 'info',
        format: logFormats.production,
        maxsize: 50 * 1024 * 1024, // 50MB
        maxFiles: 10,
        tailable: true
      })
    );
    
    // Log de erros
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: logFormats.production,
        maxsize: 50 * 1024 * 1024, // 50MB
        maxFiles: 5,
        tailable: true
      })
    );
    
    // Log de auditoria
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'audit.log'),
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
          winston.format((info) => {
            // Filtrar apenas logs de auditoria
            return info.audit ? info : false;
          })()
        ),
        maxsize: 100 * 1024 * 1024, // 100MB
        maxFiles: 20,
        tailable: true
      })
    );
  }
  
  return transports;
};

/**
 * Criar logger principal
 */
const createLogger = () => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormats[process.env.NODE_ENV === 'production' ? 'production' : 'development'],
    defaultMeta: {
      service: 'message-schema-registry',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    },
    transports: createTransports(),
    exitOnError: false
  });
};

/**
 * Logger singleton
 */
let logger = createLogger();

/**
 * Middleware para correlação de requests
 */
const correlationMiddleware = (req, res, next) => {
  // Gerar ou usar correlation ID existente
  const correlationId = req.headers['x-correlation-id'] || 
                       req.headers['x-request-id'] || 
                       uuidv4();
  
  // Adicionar ao request
  req.correlationId = correlationId;
  
  // Adicionar ao response header
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Criar logger contextual para este request
  req.logger = logger.child({
    correlationId,
    requestId: correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  next();
};

/**
 * Middleware para logging de requests
 */
const requestLoggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Log do início do request
  req.logger.info('Request started', {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.get('Content-Type'),
      'content-length': req.get('Content-Length'),
      'user-agent': req.get('User-Agent'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined
    },
    body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined
  });
  
  // Interceptar resposta
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    logResponse(req, res, data, startTime);
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    logResponse(req, res, data, startTime);
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Função para sanitizar body do request (remover dados sensíveis)
 */
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

/**
 * Função para log de resposta
 */
const logResponse = (req, res, data, startTime) => {
  const duration = Date.now() - startTime;
  const responseSize = Buffer.isBuffer(data) ? data.length : 
                      typeof data === 'string' ? Buffer.byteLength(data) : 
                      JSON.stringify(data).length;
  
  const logData = {
    method: req.method,
    url: req.url,
    path: req.path,
    statusCode: res.statusCode,
    duration,
    responseSize,
    userId: req.user?.id,
    username: req.user?.username
  };
  
  // Log level baseado no status code
  if (res.statusCode >= 500) {
    req.logger.error('Request completed with server error', logData);
  } else if (res.statusCode >= 400) {
    req.logger.warn('Request completed with client error', logData);
  } else {
    req.logger.info('Request completed successfully', logData);
  }
};

/**
 * Middleware para captura de erros não tratados
 */
const errorLoggingMiddleware = (err, req, res, next) => {
  const errorId = uuidv4();
  
  const errorData = {
    errorId,
    name: err.name,
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    query: req.query,
    body: sanitizeBody(req.body),
    userId: req.user?.id,
    correlationId: req.correlationId
  };
  
  req.logger.error('Unhandled error occurred', errorData);
  
  // Resposta de erro padronizada
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      errorId,
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
  }
  
  next(err);
};

/**
 * Middleware para logging de auditoria
 */
const auditLoggingMiddleware = (action, resource) => {
  return (req, res, next) => {
    const originalSend = res.send;
    const originalJson = res.json;
    
    const logAudit = (success) => {
      const auditData = {
        audit: true,
        action,
        resource,
        success,
        userId: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        method: req.method,
        path: req.path,
        query: req.query,
        body: sanitizeBody(req.body),
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      };
      
      req.logger.info('Audit log', auditData);
    };
    
    res.send = function(data) {
      logAudit(res.statusCode < 400);
      return originalSend.call(this, data);
    };
    
    res.json = function(data) {
      logAudit(res.statusCode < 400);
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Middleware para logging de performance
 */
const performanceLoggingMiddleware = (threshold = 1000) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      if (duration > threshold) {
        req.logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          duration,
          threshold,
          statusCode: res.statusCode,
          userId: req.user?.id
        });
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Função para configurar logging de processo
 */
const setupProcessLogging = () => {
  // Log de início da aplicação
  logger.info('Application starting', {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
  
  // Log de erros não capturados
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      pid: process.pid
    });
    
    // Graceful shutdown
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  // Log de promises rejeitadas
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.toString(),
      stack: reason?.stack,
      promise: promise?.toString(),
      pid: process.pid
    });
  });
  
  // Log de sinais de sistema
  ['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down gracefully`, {
        signal,
        pid: process.pid,
        uptime: process.uptime()
      });
      
      process.exit(0);
    });
  });
};

/**
 * Função para obter logger
 */
const getLogger = () => logger;

/**
 * Função para reconfigurar logger
 */
const reconfigureLogger = (config) => {
  logger.close();
  logger = createLogger();
  return logger;
};

module.exports = {
  correlationMiddleware,
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  auditLoggingMiddleware,
  performanceLoggingMiddleware,
  setupProcessLogging,
  getLogger,
  reconfigureLogger,
  sanitizeBody
};