# Guia de Segurança - Message Schema Registry

Este documento descreve as práticas de segurança, configurações e procedimentos para manter o Message Schema Registry seguro em todos os ambientes.

## 📋 Índice

- [Visão Geral de Segurança](#visão-geral-de-segurança)
- [Autenticação e Autorização](#autenticação-e-autorização)
- [Segurança de Rede](#segurança-de-rede)
- [Criptografia](#criptografia)
- [Validação de Entrada](#validação-de-entrada)
- [Rate Limiting](#rate-limiting)
- [Auditoria e Logs](#auditoria-e-logs)
- [Gerenciamento de Secrets](#gerenciamento-de-secrets)
- [Segurança de Container](#segurança-de-container)
- [Monitoramento de Segurança](#monitoramento-de-segurança)
- [Resposta a Incidentes](#resposta-a-incidentes)
- [Compliance](#compliance)

## 🛡️ Visão Geral de Segurança

### Princípios de Segurança

1. **Defense in Depth**: Múltiplas camadas de segurança
2. **Least Privilege**: Acesso mínimo necessário
3. **Zero Trust**: Verificar sempre, nunca confiar
4. **Security by Design**: Segurança desde o início
5. **Fail Secure**: Falhar de forma segura

### Modelo de Ameaças

```
┌─────────────────────────────────────────────────────────────┐
│                    External Threats                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    DDoS     │  │   Injection │  │   Malware   │        │
│  │   Attacks   │  │   Attacks   │  │   Uploads   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                  Security Controls                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │     WAF     │  │ Rate Limit  │  │ Input Valid │        │
│  │ Protection  │  │ Protection  │  │ Protection  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                 Application Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │     JWT     │  │    RBAC     │  │   Audit     │        │
│  │    Auth     │  │   Control   │  │   Logging   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                Infrastructure Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Network   │  │ Encryption  │  │   Secret    │        │
│  │  Security   │  │  at Rest    │  │ Management  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Autenticação e Autorização

### JWT Authentication

```javascript
// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

class AuthMiddleware {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.jwtSecret = config.security.jwtSecret;
    this.jwtExpiration = config.security.jwtExpiration || '1h';
    
    // Rate limiting para login
    this.loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 5, // 5 tentativas por IP
      message: 'Too many login attempts, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  // Middleware de autenticação
  authenticate() {
    return (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, this.jwtSecret);
        
        // Verificar se o token não está na blacklist
        if (this.isTokenBlacklisted(token)) {
          return res.status(401).json({
            error: 'Token has been revoked',
            code: 'TOKEN_REVOKED'
          });
        }

        req.user = decoded;
        req.token = token;
        
        // Log da autenticação
        this.logger.info('User authenticated', {
          userId: decoded.sub,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        next();
      } catch (error) {
        this.logger.warn('Authentication failed', {
          error: error.message,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
    };
  }

  // Middleware de autorização baseada em roles
  authorize(requiredRoles = []) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userRoles = req.user.roles || [];
      const hasRequiredRole = requiredRoles.some(role => 
        userRoles.includes(role)
      );

      if (requiredRoles.length > 0 && !hasRequiredRole) {
        this.logger.warn('Authorization failed', {
          userId: req.user.sub,
          requiredRoles,
          userRoles,
          ip: req.ip
        });
        
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      next();
    };
  }

  // Gerar token JWT
  generateToken(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hora
    };

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256'
    });
  }

  // Verificar se token está na blacklist
  isTokenBlacklisted(token) {
    // Implementar verificação contra Redis ou banco de dados
    // return this.cache.get(`blacklist:${token}`);
    return false;
  }

  // Revogar token
  async revokeToken(token) {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        // Adicionar à blacklist até expirar
        await this.cache.setex(`blacklist:${token}`, ttl, 'revoked');
      }
    }
  }
}

module.exports = AuthMiddleware;
```

### Role-Based Access Control (RBAC)

```javascript
// src/security/rbac.js
class RBACManager {
  constructor() {
    this.roles = {
      'admin': {
        permissions: [
          'schema:create',
          'schema:read',
          'schema:update',
          'schema:delete',
          'version:create',
          'version:read',
          'version:update',
          'version:delete',
          'migration:execute',
          'system:admin'
        ]
      },
      'developer': {
        permissions: [
          'schema:create',
          'schema:read',
          'schema:update',
          'version:create',
          'version:read',
          'migration:plan'
        ]
      },
      'readonly': {
        permissions: [
          'schema:read',
          'version:read'
        ]
      }
    };
  }

  hasPermission(userRoles, requiredPermission) {
    return userRoles.some(role => {
      const roleConfig = this.roles[role];
      return roleConfig && roleConfig.permissions.includes(requiredPermission);
    });
  }

  // Middleware para verificar permissões específicas
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!this.hasPermission(req.user.roles, permission)) {
        return res.status(403).json({
          error: `Permission '${permission}' required`,
          code: 'PERMISSION_DENIED'
        });
      }

      next();
    };
  }
}

module.exports = RBACManager;
```

## 🌐 Segurança de Rede

### HTTPS Configuration

```javascript
// src/security/https.js
const https = require('https');
const fs = require('fs');

class HTTPSConfig {
  constructor(config) {
    this.config = config;
  }

  createServer(app) {
    if (this.config.security.https.enabled) {
      const options = {
        key: fs.readFileSync(this.config.security.https.keyPath),
        cert: fs.readFileSync(this.config.security.https.certPath),
        // Configurações de segurança
        secureProtocol: 'TLSv1_2_method',
        ciphers: [
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES128-SHA256',
          'ECDHE-RSA-AES256-SHA384'
        ].join(':'),
        honorCipherOrder: true
      };

      return https.createServer(options, app);
    }

    return app;
  }

  // Middleware para forçar HTTPS
  forceHTTPS() {
    return (req, res, next) => {
      if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
      }
      next();
    };
  }
}

module.exports = HTTPSConfig;
```

### Security Headers

```javascript
// src/middleware/security.js
const helmet = require('helmet');

class SecurityMiddleware {
  static configure() {
    return helmet({
      // Content Security Policy
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
      
      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 ano
        includeSubDomains: true,
        preload: true
      },
      
      // X-Frame-Options
      frameguard: {
        action: 'deny'
      },
      
      // X-Content-Type-Options
      noSniff: true,
      
      // X-XSS-Protection
      xssFilter: true,
      
      // Referrer Policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
      },
      
      // Hide X-Powered-By
      hidePoweredBy: true
    });
  }

  // CORS configuration
  static configureCORS() {
    return {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 86400 // 24 horas
    };
  }
}

module.exports = SecurityMiddleware;
```

## 🔒 Criptografia

### Encryption Service

```javascript
// src/security/encryption.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');

class EncryptionService {
  constructor(config) {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltRounds = 12;
    this.encryptionKey = Buffer.from(config.security.encryptionKey, 'hex');
  }

  // Criptografar dados sensíveis
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error('Encryption failed: ' + error.message);
    }
  }

  // Descriptografar dados
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, tag } = encryptedData;
      
      const decipher = crypto.createDecipher(
        this.algorithm,
        this.encryptionKey,
        Buffer.from(iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed: ' + error.message);
    }
  }

  // Hash de senhas
  async hashPassword(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  // Verificar senha
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Gerar chave aleatória
  generateKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  // Hash seguro para dados
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // HMAC para integridade
  createHMAC(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  // Verificar HMAC
  verifyHMAC(data, secret, expectedHmac) {
    const computedHmac = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(computedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );
  }
}

module.exports = EncryptionService;
```

## ✅ Validação de Entrada

### Input Validation

```javascript
// src/middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');
const DOMPurify = require('isomorphic-dompurify');

class ValidationMiddleware {
  // Sanitizar entrada
  static sanitize() {
    return (req, res, next) => {
      // Sanitizar body
      if (req.body) {
        req.body = this.sanitizeObject(req.body);
      }
      
      // Sanitizar query parameters
      if (req.query) {
        req.query = this.sanitizeObject(req.query);
      }
      
      next();
    };
  }

  static sanitizeObject(obj) {
    if (typeof obj === 'string') {
      return DOMPurify.sanitize(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }

  // Validação de schema
  static validateSchema() {
    return [
      body('subject')
        .isLength({ min: 1, max: 100 })
        .matches(/^[a-zA-Z0-9._-]+$/)
        .withMessage('Subject must contain only alphanumeric characters, dots, underscores, and hyphens'),
      
      body('schema')
        .isObject()
        .withMessage('Schema must be a valid JSON object'),
      
      body('version')
        .optional()
        .matches(/^\d+\.\d+\.\d+$/)
        .withMessage('Version must follow semantic versioning (x.y.z)'),
      
      body('compatibility')
        .optional()
        .isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE'])
        .withMessage('Invalid compatibility level'),
      
      this.handleValidationErrors()
    ];
  }

  // Validação de parâmetros
  static validateParams() {
    return [
      param('subject')
        .isLength({ min: 1, max: 100 })
        .matches(/^[a-zA-Z0-9._-]+$/),
      
      param('version')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Version must be a positive integer'),
      
      this.handleValidationErrors()
    ];
  }

  // Validação de query parameters
  static validateQuery() {
    return [
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be non-negative'),
      
      query('sort')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Sort must be asc or desc'),
      
      this.handleValidationErrors()
    ];
  }

  // Tratar erros de validação
  static handleValidationErrors() {
    return (req, res, next) => {
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        });
      }
      
      next();
    };
  }

  // Validação de tamanho de arquivo
  static validateFileSize(maxSize = 1024 * 1024) { // 1MB default
    return (req, res, next) => {
      if (req.body && JSON.stringify(req.body).length > maxSize) {
        return res.status(413).json({
          error: 'Request payload too large',
          code: 'PAYLOAD_TOO_LARGE',
          maxSize
        });
      }
      
      next();
    };
  }
}

module.exports = ValidationMiddleware;
```

## 🚦 Rate Limiting

### Advanced Rate Limiting

```javascript
// src/middleware/rateLimiting.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

class RateLimitingService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.redis = new Redis(config.redis);
  }

  // Rate limiting global
  createGlobalLimiter() {
    return rateLimit({
      store: new RedisStore({
        client: this.redis,
        prefix: 'rl:global:'
      }),
      windowMs: this.config.security.rateLimit.windowMs,
      max: this.config.security.rateLimit.maxRequests,
      message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(this.config.security.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(this.config.security.rateLimit.windowMs / 1000)
        });
      }
    });
  }

  // Rate limiting por usuário
  createUserLimiter() {
    return rateLimit({
      store: new RedisStore({
        client: this.redis,
        prefix: 'rl:user:'
      }),
      windowMs: 60 * 1000, // 1 minuto
      max: 100, // 100 requests por minuto por usuário
      keyGenerator: (req) => {
        return req.user ? req.user.sub : req.ip;
      },
      skip: (req) => {
        // Pular rate limiting para admins
        return req.user && req.user.roles.includes('admin');
      }
    });
  }

  // Rate limiting para operações sensíveis
  createSensitiveOperationLimiter() {
    return rateLimit({
      store: new RedisStore({
        client: this.redis,
        prefix: 'rl:sensitive:'
      }),
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 5, // 5 operações por 15 minutos
      keyGenerator: (req) => {
        return req.user ? req.user.sub : req.ip;
      },
      message: {
        error: 'Too many sensitive operations',
        code: 'SENSITIVE_RATE_LIMIT_EXCEEDED'
      }
    });
  }

  // Rate limiting adaptativo baseado em carga
  createAdaptiveLimiter() {
    return async (req, res, next) => {
      try {
        // Verificar carga do sistema
        const systemLoad = await this.getSystemLoad();
        
        let maxRequests = this.config.security.rateLimit.maxRequests;
        
        // Reduzir limite se sistema estiver sobrecarregado
        if (systemLoad > 0.8) {
          maxRequests = Math.floor(maxRequests * 0.5);
        } else if (systemLoad > 0.6) {
          maxRequests = Math.floor(maxRequests * 0.7);
        }
        
        // Aplicar rate limiting dinâmico
        const limiter = rateLimit({
          store: new RedisStore({
            client: this.redis,
            prefix: 'rl:adaptive:'
          }),
          windowMs: this.config.security.rateLimit.windowMs,
          max: maxRequests,
          keyGenerator: (req) => req.ip
        });
        
        limiter(req, res, next);
      } catch (error) {
        this.logger.error('Adaptive rate limiting error', { error });
        next();
      }
    };
  }

  async getSystemLoad() {
    // Implementar lógica para obter carga do sistema
    // Pode usar métricas do Prometheus, CPU usage, etc.
    return 0.5; // Placeholder
  }
}

module.exports = RateLimitingService;
```

## 📊 Auditoria e Logs

### Audit Logging

```javascript
// src/security/auditLogger.js
class AuditLogger {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
  }

  // Log de eventos de segurança
  logSecurityEvent(event, details = {}) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      event,
      severity: this.getEventSeverity(event),
      ...details
    };

    this.logger.info('Security audit', auditEntry);
    
    // Enviar para SIEM se configurado
    if (this.config.security.siem.enabled) {
      this.sendToSIEM(auditEntry);
    }
  }

  // Log de acesso
  logAccess(req, res) {
    const accessLog = {
      timestamp: new Date().toISOString(),
      event: 'ACCESS',
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.sub,
      statusCode: res.statusCode,
      responseTime: res.get('X-Response-Time'),
      contentLength: res.get('Content-Length')
    };

    this.logger.info('Access log', accessLog);
  }

  // Log de mudanças de dados
  logDataChange(action, resource, oldData, newData, user) {
    const changeLog = {
      timestamp: new Date().toISOString(),
      event: 'DATA_CHANGE',
      action,
      resource,
      userId: user?.sub,
      changes: this.calculateChanges(oldData, newData)
    };

    this.logger.info('Data change audit', changeLog);
  }

  // Log de falhas de autenticação
  logAuthFailure(req, reason) {
    const failureLog = {
      timestamp: new Date().toISOString(),
      event: 'AUTH_FAILURE',
      reason,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    };

    this.logger.warn('Authentication failure', failureLog);
  }

  // Log de tentativas de acesso não autorizado
  logUnauthorizedAccess(req, resource, requiredPermission) {
    const unauthorizedLog = {
      timestamp: new Date().toISOString(),
      event: 'UNAUTHORIZED_ACCESS',
      resource,
      requiredPermission,
      userId: req.user?.sub,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    this.logger.warn('Unauthorized access attempt', unauthorizedLog);
  }

  getEventSeverity(event) {
    const severityMap = {
      'AUTH_FAILURE': 'medium',
      'UNAUTHORIZED_ACCESS': 'high',
      'DATA_CHANGE': 'low',
      'ACCESS': 'low',
      'SECURITY_VIOLATION': 'critical'
    };

    return severityMap[event] || 'low';
  }

  calculateChanges(oldData, newData) {
    // Implementar lógica para calcular diferenças
    return {
      added: {},
      modified: {},
      removed: {}
    };
  }

  async sendToSIEM(auditEntry) {
    // Implementar envio para SIEM
    try {
      // Exemplo: enviar para Splunk, ELK, etc.
      console.log('Sending to SIEM:', auditEntry);
    } catch (error) {
      this.logger.error('Failed to send audit log to SIEM', { error });
    }
  }
}

module.exports = AuditLogger;
```

## 🔑 Gerenciamento de Secrets

### Secret Management

```javascript
// src/security/secretManager.js
const AWS = require('aws-sdk');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

class SecretManager {
  constructor(config) {
    this.config = config;
    this.provider = config.security.secretProvider || 'env';
    
    if (this.provider === 'aws') {
      this.awsSecrets = new AWS.SecretsManager({
        region: config.aws.region
      });
    } else if (this.provider === 'gcp') {
      this.gcpSecrets = new SecretManagerServiceClient();
    }
  }

  async getSecret(secretName) {
    try {
      switch (this.provider) {
        case 'aws':
          return await this.getAWSSecret(secretName);
        case 'gcp':
          return await this.getGCPSecret(secretName);
        case 'azure':
          return await this.getAzureSecret(secretName);
        default:
          return process.env[secretName];
      }
    } catch (error) {
      throw new Error(`Failed to retrieve secret ${secretName}: ${error.message}`);
    }
  }

  async getAWSSecret(secretName) {
    const result = await this.awsSecrets.getSecretValue({
      SecretId: secretName
    }).promise();
    
    return result.SecretString;
  }

  async getGCPSecret(secretName) {
    const [version] = await this.gcpSecrets.accessSecretVersion({
      name: `projects/${this.config.gcp.projectId}/secrets/${secretName}/versions/latest`
    });
    
    return version.payload.data.toString();
  }

  async getAzureSecret(secretName) {
    // Implementar Azure Key Vault
    throw new Error('Azure Key Vault not implemented');
  }

  // Rotacionar secrets automaticamente
  async rotateSecret(secretName) {
    try {
      const newSecret = this.generateSecureSecret();
      
      switch (this.provider) {
        case 'aws':
          await this.rotateAWSSecret(secretName, newSecret);
          break;
        case 'gcp':
          await this.rotateGCPSecret(secretName, newSecret);
          break;
        default:
          throw new Error('Secret rotation not supported for this provider');
      }
      
      return newSecret;
    } catch (error) {
      throw new Error(`Failed to rotate secret ${secretName}: ${error.message}`);
    }
  }

  generateSecureSecret(length = 32) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
  }

  // Validar integridade dos secrets
  async validateSecrets() {
    const requiredSecrets = [
      'JWT_SECRET',
      'ENCRYPTION_KEY',
      'REDIS_PASSWORD'
    ];

    for (const secret of requiredSecrets) {
      try {
        const value = await this.getSecret(secret);
        if (!value || value.length < 16) {
          throw new Error(`Secret ${secret} is invalid or too short`);
        }
      } catch (error) {
        throw new Error(`Secret validation failed for ${secret}: ${error.message}`);
      }
    }
  }
}

module.exports = SecretManager;
```

## 🐳 Segurança de Container

### Dockerfile Seguro

```dockerfile
# Dockerfile.secure
# Use imagem base oficial e específica
FROM node:18.17.0-alpine3.18 AS base

# Instalar apenas dependências necessárias
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001 -G nodejs

# Configurar diretório de trabalho
WORKDIR /app

# Copiar e instalar dependências primeiro (cache layer)
COPY package*.json ./
RUN npm ci --only=production \
    && npm cache clean --force \
    && rm -rf /tmp/*

# Copiar código fonte
COPY --chown=nodejs:nodejs src/ ./src/

# Criar diretórios necessários
RUN mkdir -p /app/logs /app/tmp \
    && chown -R nodejs:nodejs /app

# Remover capacidades desnecessárias
USER nodejs

# Configurar healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node src/healthcheck.js

# Expor apenas porta necessária
EXPOSE 3000

# Usar dumb-init para gerenciamento de processos
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]

# Labels para metadados
LABEL maintainer="security@company.com" \
      version="1.0.0" \
      description="Message Schema Registry" \
      security.scan="enabled"
```

### Container Security Scanning

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: docker build -t schema-registry:test .
    
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: 'schema-registry:test'
        format: 'sarif'
        output: 'trivy-results.sarif'
    
    - name: Upload Trivy scan results
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'
    
    - name: Run Snyk to check for vulnerabilities
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high
```

## 🔍 Monitoramento de Segurança

### Security Monitoring

```javascript
// src/security/securityMonitor.js
class SecurityMonitor {
  constructor(logger, metrics, alertManager) {
    this.logger = logger;
    this.metrics = metrics;
    this.alertManager = alertManager;
    this.suspiciousPatterns = new Map();
    this.ipBlacklist = new Set();
  }

  // Monitorar padrões suspeitos
  async monitorRequest(req, res, next) {
    const ip = req.ip;
    const userAgent = req.get('User-Agent');
    const path = req.path;
    
    // Detectar tentativas de SQL injection
    if (this.detectSQLInjection(req)) {
      await this.handleSecurityThreat('SQL_INJECTION_ATTEMPT', {
        ip,
        userAgent,
        path,
        body: req.body
      });
    }
    
    // Detectar tentativas de XSS
    if (this.detectXSS(req)) {
      await this.handleSecurityThreat('XSS_ATTEMPT', {
        ip,
        userAgent,
        path,
        body: req.body
      });
    }
    
    // Detectar scanning de vulnerabilidades
    if (this.detectVulnerabilityScanning(req)) {
      await this.handleSecurityThreat('VULNERABILITY_SCANNING', {
        ip,
        userAgent,
        path
      });
    }
    
    // Monitorar frequência de requests por IP
    await this.monitorRequestFrequency(ip);
    
    next();
  }

  detectSQLInjection(req) {
    const sqlPatterns = [
      /('|(\-\-)|(;)|(\||\|)|(\*|\*))/i,
      /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i,
      /(script|javascript|vbscript|onload|onerror|onclick)/i
    ];
    
    const checkString = JSON.stringify(req.body) + req.url;
    return sqlPatterns.some(pattern => pattern.test(checkString));
  }

  detectXSS(req) {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi
    ];
    
    const checkString = JSON.stringify(req.body) + req.url;
    return xssPatterns.some(pattern => pattern.test(checkString));
  }

  detectVulnerabilityScanning(req) {
    const scanningPatterns = [
      /\.\.\/|\.\.\\/,
      /etc\/passwd|etc\/shadow/,
      /proc\/self\/environ/,
      /wp-admin|wp-content|wp-includes/,
      /admin|administrator|root/
    ];
    
    return scanningPatterns.some(pattern => pattern.test(req.path));
  }

  async monitorRequestFrequency(ip) {
    const key = `freq:${ip}`;
    const current = this.suspiciousPatterns.get(key) || 0;
    const newCount = current + 1;
    
    this.suspiciousPatterns.set(key, newCount);
    
    // Limpar contador após 1 minuto
    setTimeout(() => {
      this.suspiciousPatterns.delete(key);
    }, 60000);
    
    // Alertar se muitos requests em pouco tempo
    if (newCount > 100) {
      await this.handleSecurityThreat('HIGH_REQUEST_FREQUENCY', {
        ip,
        requestCount: newCount
      });
    }
  }

  async handleSecurityThreat(threatType, details) {
    // Log da ameaça
    this.logger.warn('Security threat detected', {
      threatType,
      ...details,
      timestamp: new Date().toISOString()
    });
    
    // Incrementar métricas
    this.metrics.increment('security.threats.total', {
      type: threatType
    });
    
    // Adicionar IP à blacklist temporária
    if (details.ip) {
      this.ipBlacklist.add(details.ip);
      
      // Remover da blacklist após 1 hora
      setTimeout(() => {
        this.ipBlacklist.delete(details.ip);
      }, 3600000);
    }
    
    // Enviar alerta
    await this.alertManager.sendAlert({
      severity: 'high',
      title: `Security Threat Detected: ${threatType}`,
      description: `Threat details: ${JSON.stringify(details)}`,
      timestamp: new Date().toISOString()
    });
  }

  // Middleware para verificar blacklist
  checkBlacklist() {
    return (req, res, next) => {
      if (this.ipBlacklist.has(req.ip)) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'IP_BLACKLISTED'
        });
      }
      next();
    };
  }
}

module.exports = SecurityMonitor;
```

## 🚨 Resposta a Incidentes

### Incident Response Plan

```javascript
// src/security/incidentResponse.js
class IncidentResponseManager {
  constructor(config, logger, alertManager) {
    this.config = config;
    this.logger = logger;
    this.alertManager = alertManager;
    this.activeIncidents = new Map();
  }

  // Detectar e responder a incidentes
  async handleIncident(incidentType, severity, details) {
    const incidentId = this.generateIncidentId();
    
    const incident = {
      id: incidentId,
      type: incidentType,
      severity,
      details,
      timestamp: new Date().toISOString(),
      status: 'active',
      actions: []
    };
    
    this.activeIncidents.set(incidentId, incident);
    
    // Log do incidente
    this.logger.error('Security incident detected', incident);
    
    // Executar resposta automática
    await this.executeAutomaticResponse(incident);
    
    // Notificar equipe de segurança
    await this.notifySecurityTeam(incident);
    
    return incidentId;
  }

  async executeAutomaticResponse(incident) {
    const responses = {
      'BRUTE_FORCE_ATTACK': [
        'blockIP',
        'increaseRateLimit',
        'alertSecurityTeam'
      ],
      'DATA_BREACH_ATTEMPT': [
        'blockIP',
        'disableAffectedAccounts',
        'enableEmergencyMode',
        'alertSecurityTeam',
        'notifyCompliance'
      ],
      'MALWARE_DETECTED': [
        'isolateSystem',
        'scanAllSystems',
        'alertSecurityTeam'
      ]
    };
    
    const actions = responses[incident.type] || ['alertSecurityTeam'];
    
    for (const action of actions) {
      try {
        await this.executeAction(action, incident);
        incident.actions.push({
          action,
          timestamp: new Date().toISOString(),
          status: 'completed'
        });
      } catch (error) {
        this.logger.error('Failed to execute incident response action', {
          action,
          incidentId: incident.id,
          error: error.message
        });
        
        incident.actions.push({
          action,
          timestamp: new Date().toISOString(),
          status: 'failed',
          error: error.message
        });
      }
    }
  }

  async executeAction(action, incident) {
    switch (action) {
      case 'blockIP':
        await this.blockIP(incident.details.ip);
        break;
      case 'increaseRateLimit':
        await this.increaseRateLimit();
        break;
      case 'disableAffectedAccounts':
        await this.disableAffectedAccounts(incident.details.userIds);
        break;
      case 'enableEmergencyMode':
        await this.enableEmergencyMode();
        break;
      case 'alertSecurityTeam':
        await this.alertSecurityTeam(incident);
        break;
      case 'notifyCompliance':
        await this.notifyCompliance(incident);
        break;
      case 'isolateSystem':
        await this.isolateSystem();
        break;
      case 'scanAllSystems':
        await this.scanAllSystems();
        break;
    }
  }

  async blockIP(ip) {
    // Implementar bloqueio de IP no firewall/WAF
    this.logger.info('IP blocked', { ip });
  }

  async enableEmergencyMode() {
    // Ativar modo de emergência (read-only, etc.)
    this.logger.warn('Emergency mode enabled');
  }

  generateIncidentId() {
    return `INC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Relatório de incidentes
  async generateIncidentReport(incidentId) {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }
    
    return {
      ...incident,
      duration: this.calculateDuration(incident),
      impact: this.assessImpact(incident),
      recommendations: this.generateRecommendations(incident)
    };
  }
}

module.exports = IncidentResponseManager;
```

## 📋 Compliance

### GDPR Compliance

```javascript
// src/security/gdprCompliance.js
class GDPRCompliance {
  constructor(logger, auditLogger) {
    this.logger = logger;
    this.auditLogger = auditLogger;
  }

  // Middleware para consentimento
  requireConsent() {
    return (req, res, next) => {
      const consent = req.headers['x-consent'];
      
      if (!consent || consent !== 'granted') {
        return res.status(400).json({
          error: 'Data processing consent required',
          code: 'CONSENT_REQUIRED'
        });
      }
      
      next();
    };
  }

  // Anonimizar dados pessoais
  anonymizePersonalData(data) {
    const sensitiveFields = ['email', 'name', 'phone', 'address'];
    const anonymized = { ...data };
    
    sensitiveFields.forEach(field => {
      if (anonymized[field]) {
        anonymized[field] = this.hashField(anonymized[field]);
      }
    });
    
    return anonymized;
  }

  // Direito ao esquecimento
  async rightToBeForgotten(userId) {
    try {
      // Remover dados pessoais
      await this.removePersonalData(userId);
      
      // Anonimizar logs
      await this.anonymizeLogs(userId);
      
      // Log da ação
      this.auditLogger.logDataChange(
        'DELETE',
        'user_data',
        null,
        null,
        { action: 'right_to_be_forgotten', userId }
      );
      
      return true;
    } catch (error) {
      this.logger.error('Failed to process right to be forgotten', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Portabilidade de dados
  async exportUserData(userId) {
    try {
      const userData = await this.collectUserData(userId);
      
      // Log da exportação
      this.auditLogger.logDataChange(
        'EXPORT',
        'user_data',
        null,
        null,
        { action: 'data_export', userId }
      );
      
      return userData;
    } catch (error) {
      this.logger.error('Failed to export user data', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  hashField(value) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

module.exports = GDPRCompliance;
```

---

**Última atualização**: 2024
**Versão**: 1.0.0
**Equipe**: Security & Schema Registry Team