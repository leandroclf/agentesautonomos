/**
 * Middleware for Agent Lifecycle Manager
 * Middlewares para o gerenciador de ciclo de vida dos agentes
 */

const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const config = require('../config/lifecycleConfig')

module.exports = (services) => {
  const { logger } = services

  // ===== MIDDLEWARE DE SEGURANÇA =====

  // Configuração do Helmet
  const helmetConfig = helmet({
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
  })

  // Configuração do CORS
  const corsConfig = cors({
    origin: config.security.cors.origin,
    methods: config.security.cors.methods,
    allowedHeaders: config.security.cors.allowedHeaders,
    credentials: config.security.cors.credentials,
    optionsSuccessStatus: 200
  })

  // ===== MIDDLEWARE DE RATE LIMITING =====

  // Rate limiting geral
  const generalRateLimit = rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    message: {
      error: 'Muitas requisições. Tente novamente mais tarde.',
      retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit excedido', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      })
      
      res.status(429).json({
        success: false,
        error: 'Rate limit excedido',
        message: 'Muitas requisições. Tente novamente mais tarde.',
        retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000)
      })
    }
  })

  // Rate limiting para operações críticas
  const criticalRateLimit = rateLimit({
    windowMs: 60000, // 1 minuto
    max: 10, // 10 operações por minuto
    message: {
      error: 'Limite de operações críticas excedido',
      retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit para operações críticas excedido', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      })
      
      res.status(429).json({
        success: false,
        error: 'Limite de operações críticas excedido',
        message: 'Muitas operações críticas. Aguarde antes de tentar novamente.',
        retryAfter: 60
      })
    }
  })

  // ===== MIDDLEWARE DE AUTENTICAÇÃO =====

  // Validação de API Key
  const validateApiKey = (req, res, next) => {
    // Pular validação para rotas de health check
    if (req.path.startsWith('/health') || req.path === '/metrics') {
      return next()
    }

    const apiKey = req.headers['x-api-key'] || req.query.apiKey
    
    if (!apiKey) {
      logger.warn('Tentativa de acesso sem API key', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      })
      
      return res.status(401).json({
        success: false,
        error: 'API key ausente',
        message: 'Forneça uma API key válida no header X-API-Key ou query parameter apiKey'
      })
    }
    
    if (apiKey !== config.security.apiKey) {
      logger.warn('Tentativa de acesso com API key inválida', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        providedKey: apiKey.substring(0, 8) + '...'
      })
      
      return res.status(401).json({
        success: false,
        error: 'API key inválida',
        message: 'A API key fornecida não é válida'
      })
    }
    
    next()
  }

  // ===== MIDDLEWARE DE LOGGING =====

  // Request logging
  const requestLogger = (req, res, next) => {
    const startTime = Date.now()
    
    // Log da requisição
    logger.info('Requisição recebida', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: req.get('Content-Length'),
      timestamp: new Date().toISOString()
    })
    
    // Log da resposta
    res.on('finish', () => {
      const duration = Date.now() - startTime
      const logLevel = res.statusCode >= 400 ? 'warn' : 'info'
      
      logger[logLevel]('Resposta enviada', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length'),
        ip: req.ip,
        timestamp: new Date().toISOString()
      })
    })
    
    next()
  }

  // Error logging
  const errorLogger = (error, req, res, next) => {
    logger.error('Erro na requisição', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body,
        params: req.params,
        query: req.query
      },
      timestamp: new Date().toISOString()
    })
    
    next(error)
  }

  // ===== MIDDLEWARE DE VALIDAÇÃO =====

  // Validação de JSON
  const validateJson = (error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      logger.warn('JSON inválido recebido', {
        ip: req.ip,
        path: req.path,
        error: error.message
      })
      
      return res.status(400).json({
        success: false,
        error: 'JSON inválido',
        message: 'O corpo da requisição contém JSON malformado'
      })
    }
    
    next(error)
  }

  // Validação de Content-Type
  const validateContentType = (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type')
      
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Content-Type inválido', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          contentType
        })
        
        return res.status(400).json({
          success: false,
          error: 'Content-Type inválido',
          message: 'Content-Type deve ser application/json'
        })
      }
    }
    
    next()
  }

  // ===== MIDDLEWARE DE SANITIZAÇÃO =====

  // Sanitização de parâmetros
  const sanitizeParams = (req, res, next) => {
    // Sanitizar parâmetros da URL
    Object.keys(req.params).forEach(key => {
      if (typeof req.params[key] === 'string') {
        req.params[key] = req.params[key].trim()
      }
    })
    
    // Sanitizar query parameters
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim()
      }
    })
    
    next()
  }

  // ===== MIDDLEWARE DE CACHE =====

  // Cache headers para recursos estáticos
  const setCacheHeaders = (req, res, next) => {
    if (req.path.startsWith('/metrics')) {
      // Métricas não devem ser cacheadas
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      })
    } else if (req.path.startsWith('/health')) {
      // Health checks com cache curto
      res.set({
        'Cache-Control': 'public, max-age=30'
      })
    }
    
    next()
  }

  // ===== MIDDLEWARE DE TIMEOUT =====

  // Timeout para requisições
  const requestTimeout = (req, res, next) => {
    const timeout = 30000 // 30 segundos
    
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Timeout da requisição', {
          method: req.method,
          path: req.path,
          ip: req.ip,
          timeout: `${timeout}ms`
        })
        
        res.status(408).json({
          success: false,
          error: 'Timeout da requisição',
          message: 'A requisição demorou muito para ser processada'
        })
      }
    }, timeout)
    
    res.on('finish', () => {
      clearTimeout(timer)
    })
    
    next()
  }

  // ===== MIDDLEWARE DE HEALTH CHECK =====

  // Verificação de saúde do serviço
  const healthCheck = (req, res, next) => {
    // Adicionar informações de saúde ao request
    req.serviceHealth = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    }
    
    next()
  }

  // ===== MIDDLEWARE DE RESPOSTA PADRÃO =====

  // Headers de segurança adicionais
  const securityHeaders = (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Service': 'lifecycle-manager',
      'X-Version': config.server.version
    })
    
    next()
  }

  // ===== MIDDLEWARE DE TRATAMENTO DE ERROS =====

  // Handler de erro 404
  const notFoundHandler = (req, res) => {
    logger.warn('Endpoint não encontrado', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    })
    
    res.status(404).json({
      success: false,
      error: 'Endpoint não encontrado',
      message: `${req.method} ${req.path} não existe`,
      timestamp: new Date().toISOString()
    })
  }

  // Handler de erro geral
  const errorHandler = (error, req, res, next) => {
    // Se a resposta já foi enviada, delegar para o handler padrão do Express
    if (res.headersSent) {
      return next(error)
    }
    
    logger.error('Erro não tratado', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      timestamp: new Date().toISOString()
    })
    
    // Determinar código de status baseado no tipo de erro
    let statusCode = 500
    let errorMessage = 'Erro interno do servidor'
    
    if (error.name === 'ValidationError') {
      statusCode = 400
      errorMessage = 'Dados de entrada inválidos'
    } else if (error.name === 'UnauthorizedError') {
      statusCode = 401
      errorMessage = 'Não autorizado'
    } else if (error.name === 'ForbiddenError') {
      statusCode = 403
      errorMessage = 'Acesso negado'
    } else if (error.name === 'NotFoundError') {
      statusCode = 404
      errorMessage = 'Recurso não encontrado'
    } else if (error.name === 'ConflictError') {
      statusCode = 409
      errorMessage = 'Conflito de recursos'
    } else if (error.name === 'TimeoutError') {
      statusCode = 408
      errorMessage = 'Timeout da operação'
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: config.server.environment === 'development' ? error.message : errorMessage,
      timestamp: new Date().toISOString(),
      ...(config.server.environment === 'development' && { stack: error.stack })
    })
  }

  // ===== EXPORTAR MIDDLEWARES =====

  return {
    // Segurança
    helmet: helmetConfig,
    cors: corsConfig,
    validateApiKey,
    securityHeaders,
    
    // Rate limiting
    generalRateLimit,
    criticalRateLimit,
    
    // Logging
    requestLogger,
    errorLogger,
    
    // Validação
    validateJson,
    validateContentType,
    sanitizeParams,
    
    // Utilitários
    compression: compression(),
    setCacheHeaders,
    requestTimeout,
    healthCheck,
    
    // Tratamento de erros
    notFoundHandler,
    errorHandler
  }
}