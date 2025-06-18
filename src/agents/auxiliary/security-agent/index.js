/**
 * Security Agent - Agente de Segurança
 * Fase 1-2: Autenticação, autorização e verificações de segurança
 * 
 * Responsabilidades:
 * - Autenticação de usuários e sistemas
 * - Autorização baseada em roles e políticas
 * - Validação de tokens e sessões
 * - Detecção de ameaças e anomalias
 * - Auditoria de segurança
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const config = require('../../../config');
const SQSService = require('../../../services/sqs-service');
const Logger = require('../../../utils/logger');

class SecurityAgent {
  constructor() {
    this.agentId = 'security-agent';
    this.logger = new Logger(this.agentId);
    this.app = express();
    this.sqsService = null;
    this.isRunning = false;
    this.server = null;
    
    // Métricas de segurança
    this.securityMetrics = {
      authenticationAttempts: 0,
      authenticationSuccesses: 0,
      authenticationFailures: 0,
      authorizationChecks: 0,
      authorizationDenials: 0,
      tokenValidations: 0,
      tokenRejections: 0,
      threatDetections: 0,
      securityAudits: 0,
      lastSecurityEvent: null,
      startedAt: new Date().toISOString()
    };
    
    // Configurações de segurança
    this.securityConfig = {
      jwtSecret: config.security.jwtSecret || 'default-secret-change-in-production',
      jwtExpiresIn: '24h',
      bcryptRounds: 12,
      maxLoginAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutos
      sessionTimeout: 60 * 60 * 1000, // 1 hora
      allowedOrigins: config.security.corsOrigins || ['http://localhost:3000'],
      rateLimits: {
        auth: { windowMs: 15 * 60 * 1000, max: 10 }, // 10 tentativas por 15 min
        api: { windowMs: 15 * 60 * 1000, max: 100 } // 100 requests por 15 min
      }
    };
    
    // Sessões ativas
    this.activeSessions = new Map();
    
    // Tentativas de login falhadas
    this.failedAttempts = new Map();
    
    // Usuários bloqueados
    this.blockedUsers = new Map();
    
    // Tokens revogados
    this.revokedTokens = new Set();
    
    // Roles e permissões
    this.roles = {
      admin: {
        permissions: ['*']
      },
      user: {
        permissions: ['read', 'write']
      },
      readonly: {
        permissions: ['read']
      },
      agent: {
        permissions: ['agent:communicate', 'agent:metrics', 'agent:health']
      }
    };
    
    // Usuários mock (Fase 1)
    this.mockUsers = {
      'admin@system.local': {
        id: 'admin-001',
        email: 'admin@system.local',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'admin123'
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
      },
      'user@system.local': {
        id: 'user-001',
        email: 'user@system.local',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'user123'
        role: 'user',
        active: true,
        createdAt: new Date().toISOString()
      }
    };
    
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  /**
   * Configurar middleware do Express
   */
  setupMiddleware() {
    // Segurança
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));
    
    // CORS
    this.app.use(cors({
      origin: this.securityConfig.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
    
    // Rate limiting para autenticação
    const authLimiter = rateLimit(this.securityConfig.rateLimits.auth);
    this.app.use('/auth', authLimiter);
    
    // Rate limiting geral
    const apiLimiter = rateLimit(this.securityConfig.rateLimits.api);
    this.app.use(apiLimiter);
    
    // Body parsing
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    
    // Logging de requests
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          authorization: req.get('Authorization') ? 'present' : 'absent'
        });
      });
      next();
    });
  }
  
  /**
   * Configurar rotas do Express
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      const health = {
        status: this.isRunning ? 'healthy' : 'unhealthy',
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sqsConnected: this.sqsService?.isConnected() || false,
        activeSessions: this.activeSessions.size,
        blockedUsers: this.blockedUsers.size
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Métricas de segurança
    this.app.get('/metrics', this.authenticateToken.bind(this), (req, res) => {
      res.json({
        agent: this.agentId,
        metrics: this.securityMetrics,
        activeSessions: this.activeSessions.size,
        blockedUsers: this.blockedUsers.size,
        revokedTokens: this.revokedTokens.size,
        timestamp: new Date().toISOString()
      });
    });
    
    // Autenticação - Login
    this.app.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        const clientIp = req.ip;
        
        this.securityMetrics.authenticationAttempts++;
        
        // Verificar se usuário está bloqueado
        if (this.isUserBlocked(email)) {
          this.logger.warn('Login attempt from blocked user', {
            email,
            clientIp
          });
          
          return res.status(423).json({
            success: false,
            error: 'Account temporarily locked due to multiple failed attempts',
            timestamp: new Date().toISOString()
          });
        }
        
        // Validar credenciais
        const user = await this.validateCredentials(email, password);
        
        if (!user) {
          this.handleFailedLogin(email, clientIp);
          this.securityMetrics.authenticationFailures++;
          
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials',
            timestamp: new Date().toISOString()
          });
        }
        
        // Gerar token JWT
        const token = this.generateToken(user);
        
        // Criar sessão
        const sessionId = this.createSession(user, token, clientIp);
        
        // Limpar tentativas falhadas
        this.failedAttempts.delete(email);
        
        this.securityMetrics.authenticationSuccesses++;
        this.securityMetrics.lastSecurityEvent = new Date().toISOString();
        
        this.logger.info('User authenticated successfully', {
          userId: user.id,
          email: user.email,
          role: user.role,
          sessionId,
          clientIp
        });
        
        res.json({
          success: true,
          token,
          sessionId,
          user: {
            id: user.id,
            email: user.email,
            role: user.role
          },
          expiresIn: this.securityConfig.jwtExpiresIn,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Authentication error', error, {
          email: req.body.email,
          clientIp: req.ip
        });
        
        res.status(500).json({
          success: false,
          error: 'Authentication service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Logout
    this.app.post('/auth/logout', this.authenticateToken.bind(this), (req, res) => {
      try {
        const { sessionId } = req.body;
        const userId = req.user.id;
        
        // Revogar token
        this.revokedTokens.add(req.token);
        
        // Remover sessão
        if (sessionId) {
          this.activeSessions.delete(sessionId);
        }
        
        this.logger.info('User logged out', {
          userId,
          sessionId
        });
        
        res.json({
          success: true,
          message: 'Logged out successfully',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Logout error', error);
        res.status(500).json({
          success: false,
          error: 'Logout service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Validar token
    this.app.post('/auth/validate', async (req, res) => {
      try {
        const { token } = req.body;
        
        this.securityMetrics.tokenValidations++;
        
        if (!token) {
          this.securityMetrics.tokenRejections++;
          return res.status(400).json({
            valid: false,
            error: 'Token is required',
            timestamp: new Date().toISOString()
          });
        }
        
        // Verificar se token foi revogado
        if (this.revokedTokens.has(token)) {
          this.securityMetrics.tokenRejections++;
          return res.status(401).json({
            valid: false,
            error: 'Token has been revoked',
            timestamp: new Date().toISOString()
          });
        }
        
        // Validar token JWT
        const decoded = jwt.verify(token, this.securityConfig.jwtSecret);
        
        // Verificar se usuário ainda está ativo
        const user = this.mockUsers[decoded.email];
        if (!user || !user.active) {
          this.securityMetrics.tokenRejections++;
          return res.status(401).json({
            valid: false,
            error: 'User account is inactive',
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({
          valid: true,
          user: {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role
          },
          permissions: this.getUserPermissions(decoded.role),
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.securityMetrics.tokenRejections++;
        
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({
            valid: false,
            error: 'Token has expired',
            timestamp: new Date().toISOString()
          });
        }
        
        if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({
            valid: false,
            error: 'Invalid token',
            timestamp: new Date().toISOString()
          });
        }
        
        this.logger.error('Token validation error', error);
        res.status(500).json({
          valid: false,
          error: 'Token validation service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Verificar autorização
    this.app.post('/auth/authorize', this.authenticateToken.bind(this), (req, res) => {
      try {
        const { resource, action } = req.body;
        const user = req.user;
        
        this.securityMetrics.authorizationChecks++;
        
        const authorized = this.checkAuthorization(user, resource, action);
        
        if (!authorized) {
          this.securityMetrics.authorizationDenials++;
          
          this.logger.warn('Authorization denied', {
            userId: user.id,
            role: user.role,
            resource,
            action
          });
        }
        
        res.json({
          authorized,
          user: {
            id: user.id,
            email: user.email,
            role: user.role
          },
          resource,
          action,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Authorization error', error);
        res.status(500).json({
          authorized: false,
          error: 'Authorization service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Listar sessões ativas
    this.app.get('/auth/sessions', this.authenticateToken.bind(this), (req, res) => {
      try {
        const user = req.user;
        
        // Filtrar sessões do usuário
        const userSessions = Array.from(this.activeSessions.entries())
          .filter(([_, session]) => session.userId === user.id)
          .map(([sessionId, session]) => ({
            sessionId,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            clientIp: session.clientIp,
            userAgent: session.userAgent
          }));
        
        res.json({
          sessions: userSessions,
          count: userSessions.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Sessions listing error', error);
        res.status(500).json({
          error: 'Sessions service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Revogar sessão
    this.app.delete('/auth/sessions/:sessionId', this.authenticateToken.bind(this), (req, res) => {
      try {
        const { sessionId } = req.params;
        const user = req.user;
        
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
          return res.status(404).json({
            error: 'Session not found',
            timestamp: new Date().toISOString()
          });
        }
        
        // Verificar se a sessão pertence ao usuário
        if (session.userId !== user.id) {
          return res.status(403).json({
            error: 'Access denied',
            timestamp: new Date().toISOString()
          });
        }
        
        // Revogar token da sessão
        this.revokedTokens.add(session.token);
        
        // Remover sessão
        this.activeSessions.delete(sessionId);
        
        this.logger.info('Session revoked', {
          sessionId,
          userId: user.id
        });
        
        res.json({
          success: true,
          message: 'Session revoked successfully',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Session revocation error', error);
        res.status(500).json({
          error: 'Session revocation service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Auditoria de segurança
    this.app.get('/security/audit', this.authenticateToken.bind(this), this.requirePermission('admin'), (req, res) => {
      try {
        const { hours = 24 } = req.query;
        
        // Simular dados de auditoria (Fase 1)
        const auditData = {
          period: `${hours} hours`,
          summary: {
            authenticationAttempts: this.securityMetrics.authenticationAttempts,
            authenticationSuccesses: this.securityMetrics.authenticationSuccesses,
            authenticationFailures: this.securityMetrics.authenticationFailures,
            authorizationChecks: this.securityMetrics.authorizationChecks,
            authorizationDenials: this.securityMetrics.authorizationDenials,
            tokenValidations: this.securityMetrics.tokenValidations,
            tokenRejections: this.securityMetrics.tokenRejections
          },
          activeSessions: this.activeSessions.size,
          blockedUsers: this.blockedUsers.size,
          revokedTokens: this.revokedTokens.size,
          timestamp: new Date().toISOString()
        };
        
        this.securityMetrics.securityAudits++;
        
        res.json(auditData);
        
      } catch (error) {
        this.logger.error('Security audit error', error);
        res.status(500).json({
          error: 'Security audit service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Detecção de ameaças
    this.app.get('/security/threats', this.authenticateToken.bind(this), this.requirePermission('admin'), (req, res) => {
      try {
        // Simular detecção de ameaças (Fase 1)
        const threats = [
          {
            id: 'threat-001',
            type: 'brute_force',
            severity: 'medium',
            description: 'Multiple failed login attempts detected',
            source: '192.168.1.100',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            status: 'mitigated'
          },
          {
            id: 'threat-002',
            type: 'suspicious_activity',
            severity: 'low',
            description: 'Unusual access pattern detected',
            source: '10.0.0.50',
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            status: 'monitoring'
          }
        ];
        
        res.json({
          threats,
          count: threats.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Threat detection error', error);
        res.status(500).json({
          error: 'Threat detection service error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
    
    // Error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('Express error', error, {
        url: req.url,
        method: req.method,
        body: req.body
      });
      
      res.status(500).json({
        error: 'Internal server error',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
  }
  
  /**
   * Middleware de autenticação de token
   */
  authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'Access token is required',
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar se token foi revogado
    if (this.revokedTokens.has(token)) {
      return res.status(401).json({
        error: 'Token has been revoked',
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      const decoded = jwt.verify(token, this.securityConfig.jwtSecret);
      
      // Verificar se usuário ainda está ativo
      const user = this.mockUsers[decoded.email];
      if (!user || !user.active) {
        return res.status(401).json({
          error: 'User account is inactive',
          timestamp: new Date().toISOString()
        });
      }
      
      req.user = decoded;
      req.token = token;
      next();
      
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token has expired',
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(403).json({
        error: 'Invalid token',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Middleware de verificação de permissão
   */
  requirePermission(requiredRole) {
    return (req, res, next) => {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
      }
      
      if (user.role !== requiredRole && user.role !== 'admin') {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: requiredRole,
          current: user.role,
          timestamp: new Date().toISOString()
        });
      }
      
      next();
    };
  }
  
  /**
   * Validar credenciais de usuário
   */
  async validateCredentials(email, password) {
    if (!email || !password) {
      return null;
    }
    
    const user = this.mockUsers[email];
    if (!user || !user.active) {
      return null;
    }
    
    // Verificar senha
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return null;
    }
    
    return user;
  }
  
  /**
   * Gerar token JWT
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, this.securityConfig.jwtSecret, {
      expiresIn: this.securityConfig.jwtExpiresIn
    });
  }
  
  /**
   * Criar sessão
   */
  createSession(user, token, clientIp) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    
    const session = {
      sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
      token,
      clientIp,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.securityConfig.sessionTimeout).toISOString()
    };
    
    this.activeSessions.set(sessionId, session);
    
    // Configurar limpeza automática da sessão
    setTimeout(() => {
      this.activeSessions.delete(sessionId);
      this.revokedTokens.add(token);
    }, this.securityConfig.sessionTimeout);
    
    return sessionId;
  }
  
  /**
   * Verificar se usuário está bloqueado
   */
  isUserBlocked(email) {
    const blockInfo = this.blockedUsers.get(email);
    
    if (!blockInfo) {
      return false;
    }
    
    // Verificar se o bloqueio expirou
    if (Date.now() > blockInfo.expiresAt) {
      this.blockedUsers.delete(email);
      return false;
    }
    
    return true;
  }
  
  /**
   * Lidar com tentativa de login falhada
   */
  handleFailedLogin(email, clientIp) {
    const attempts = this.failedAttempts.get(email) || 0;
    const newAttempts = attempts + 1;
    
    this.failedAttempts.set(email, newAttempts);
    
    this.logger.warn('Failed login attempt', {
      email,
      attempts: newAttempts,
      clientIp
    });
    
    // Bloquear usuário se exceder o limite
    if (newAttempts >= this.securityConfig.maxLoginAttempts) {
      const expiresAt = Date.now() + this.securityConfig.lockoutDuration;
      
      this.blockedUsers.set(email, {
        attempts: newAttempts,
        blockedAt: Date.now(),
        expiresAt,
        clientIp
      });
      
      this.logger.warn('User account locked', {
        email,
        attempts: newAttempts,
        lockoutDuration: this.securityConfig.lockoutDuration,
        clientIp
      });
      
      // Limpar tentativas após bloqueio
      this.failedAttempts.delete(email);
    }
  }
  
  /**
   * Verificar autorização
   */
  checkAuthorization(user, resource, action) {
    const userRole = this.roles[user.role];
    
    if (!userRole) {
      return false;
    }
    
    // Admin tem acesso total
    if (userRole.permissions.includes('*')) {
      return true;
    }
    
    // Verificar permissão específica
    const requiredPermission = `${resource}:${action}`;
    if (userRole.permissions.includes(requiredPermission)) {
      return true;
    }
    
    // Verificar permissão genérica
    if (userRole.permissions.includes(action)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Obter permissões do usuário
   */
  getUserPermissions(role) {
    const userRole = this.roles[role];
    return userRole ? userRole.permissions : [];
  }
  
  /**
   * Limpeza periódica de dados expirados
   */
  cleanupExpiredData() {
    const now = Date.now();
    
    // Limpar sessões expiradas
    for (const [sessionId, session] of this.activeSessions) {
      if (new Date(session.expiresAt).getTime() < now) {
        this.activeSessions.delete(sessionId);
        this.revokedTokens.add(session.token);
      }
    }
    
    // Limpar usuários bloqueados expirados
    for (const [email, blockInfo] of this.blockedUsers) {
      if (blockInfo.expiresAt < now) {
        this.blockedUsers.delete(email);
      }
    }
    
    // Limpar tokens revogados antigos (manter por 24h)
    // Implementar lógica de limpeza baseada em timestamp se necessário
    
    this.logger.debug('Expired data cleanup completed', {
      activeSessions: this.activeSessions.size,
      blockedUsers: this.blockedUsers.size,
      revokedTokens: this.revokedTokens.size
    });
  }
  
  /**
   * Inicializar serviço SQS
   */
  async initializeSQS() {
    try {
      this.sqsService = new SQSService();
      await this.sqsService.initialize();
      
      // Começar a escutar mensagens
      await this.sqsService.startPolling(
        config.aws.sqs.queues.auxiliary.security,
        this.handleSQSMessage.bind(this)
      );
      
      this.logger.info('SQS service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SQS service', error);
      throw error;
    }
  }
  
  /**
   * Lidar com mensagem SQS
   */
  async handleSQSMessage(message) {
    try {
      const messageData = JSON.parse(message.Body);
      
      switch (messageData.type) {
        case 'security_check':
          await this.handleSecurityCheck(messageData);
          break;
        case 'token_validation':
          await this.handleTokenValidation(messageData);
          break;
        case 'authorization_check':
          await this.handleAuthorizationCheck(messageData);
          break;
        default:
          this.logger.warn('Unknown message type', {
            type: messageData.type,
            messageId: message.MessageId
          });
      }
      
      // Deletar mensagem da fila após processamento bem-sucedido
      await this.sqsService.deleteMessage(
        config.aws.sqs.queues.auxiliary.security,
        message.ReceiptHandle
      );
      
    } catch (error) {
      this.logger.error('Error handling SQS message', error, {
        messageId: message.MessageId,
        body: message.Body
      });
      
      throw error;
    }
  }
  
  /**
   * Lidar com verificação de segurança
   */
  async handleSecurityCheck(messageData) {
    const { requestId, token, resource, action } = messageData;
    
    try {
      // Validar token
      const decoded = jwt.verify(token, this.securityConfig.jwtSecret);
      
      // Verificar autorização
      const authorized = this.checkAuthorization(decoded, resource, action);
      
      // Enviar resposta
      const response = {
        type: 'security_check_response',
        requestId,
        authorized,
        user: {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role
        },
        timestamp: new Date().toISOString()
      };
      
      // Enviar resposta de volta (implementar fila de resposta)
      this.logger.info('Security check completed', {
        requestId,
        authorized,
        userId: decoded.id
      });
      
    } catch (error) {
      this.logger.error('Security check failed', error, {
        requestId
      });
      
      // Enviar resposta de erro
      const response = {
        type: 'security_check_response',
        requestId,
        authorized: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Lidar com validação de token
   */
  async handleTokenValidation(messageData) {
    const { requestId, token } = messageData;
    
    try {
      // Verificar se token foi revogado
      if (this.revokedTokens.has(token)) {
        throw new Error('Token has been revoked');
      }
      
      // Validar token JWT
      const decoded = jwt.verify(token, this.securityConfig.jwtSecret);
      
      // Verificar se usuário ainda está ativo
      const user = this.mockUsers[decoded.email];
      if (!user || !user.active) {
        throw new Error('User account is inactive');
      }
      
      this.logger.info('Token validation successful', {
        requestId,
        userId: decoded.id
      });
      
    } catch (error) {
      this.logger.error('Token validation failed', error, {
        requestId
      });
    }
  }
  
  /**
   * Lidar com verificação de autorização
   */
  async handleAuthorizationCheck(messageData) {
    const { requestId, user, resource, action } = messageData;
    
    try {
      const authorized = this.checkAuthorization(user, resource, action);
      
      this.logger.info('Authorization check completed', {
        requestId,
        authorized,
        userId: user.id,
        resource,
        action
      });
      
    } catch (error) {
      this.logger.error('Authorization check failed', error, {
        requestId
      });
    }
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      this.logger.info('Starting Security Agent...');
      
      // Inicializar SQS
      await this.initializeSQS();
      
      // Configurar limpeza periódica
      setInterval(() => {
        if (this.isRunning) {
          this.cleanupExpiredData();
        }
      }, 300000); // 5 minutos
      
      // Iniciar servidor HTTP
      const port = config.agents.security.port || 3006;
      this.server = this.app.listen(port, () => {
        this.isRunning = true;
        this.logger.info(`Security Agent started on port ${port}`);
      });
      
      // Configurar health check
      this.setupHealthCheck();
      
    } catch (error) {
      this.logger.error('Failed to start Security Agent', error);
      throw error;
    }
  }
  
  /**
   * Parar o agente
   */
  async stop() {
    try {
      this.logger.info('Stopping Security Agent...');
      this.isRunning = false;
      
      // Parar polling SQS
      if (this.sqsService) {
        await this.sqsService.stopPolling();
        await this.sqsService.close();
      }
      
      // Fechar servidor HTTP
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      this.logger.info('Security Agent stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Security Agent', error);
      throw error;
    }
  }
  
  /**
   * Configurar health check periódico
   */
  setupHealthCheck() {
    setInterval(() => {
      if (this.isRunning) {
        this.logger.debug('Health check', {
          status: 'healthy',
          metrics: this.securityMetrics,
          activeSessions: this.activeSessions.size,
          blockedUsers: this.blockedUsers.size
        });
      }
    }, config.agents.healthCheckInterval);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const agent = new SecurityAgent();
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  // Iniciar agente
  agent.start().catch((error) => {
    console.error('Failed to start Security Agent:', error);
    process.exit(1);
  });
}

module.exports = SecurityAgent;