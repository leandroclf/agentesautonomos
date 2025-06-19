/**
 * Policy Agent - Agente de Políticas
 * Fase 1-2: Gerenciamento e aplicação de políticas de negócio
 * 
 * Responsabilidades:
 * - Definir e gerenciar políticas de negócio
 * - Validar conformidade com políticas
 * - Aplicar regras de compliance
 * - Auditoria de políticas
 * - Controle de acesso baseado em políticas
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../../../config');
const SQSService = require('../../../services/sqs-service');
const MockSQSService = require('../../../services/mock-sqs-service');
const Logger = require('../../../utils/logger');

class PolicyAgent {
  constructor() {
    this.agentId = 'policy-agent';
    this.logger = new Logger(this.agentId);
    this.app = express();
    // Use MockSQSService in development, real SQSService in production
    this.sqsService = process.env.NODE_ENV === 'development' 
      ? new MockSQSService(this.logger)
      : null;
    this.isRunning = false;
    this.server = null;
    
    // Métricas de políticas
    this.policyMetrics = {
      policiesEvaluated: 0,
      policiesViolated: 0,
      policiesEnforced: 0,
      complianceChecks: 0,
      complianceViolations: 0,
      auditEvents: 0,
      lastPolicyEvent: null,
      startedAt: new Date().toISOString()
    };
    
    // Políticas ativas
    this.policies = new Map();
    
    // Histórico de violações
    this.violations = [];
    
    // Cache de avaliações
    this.evaluationCache = new Map();
    
    // Configurações de política
    this.policyConfig = {
      cacheTimeout: 300000, // 5 minutos
      maxViolationHistory: 1000,
      auditRetention: 30 * 24 * 60 * 60 * 1000, // 30 dias
      enforcementModes: ['warn', 'block', 'audit'],
      severityLevels: ['low', 'medium', 'high', 'critical']
    };
    
    this.initializePolicies();
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  /**
   * Inicializar políticas padrão
   */
  initializePolicies() {
    // Políticas de segurança
    this.policies.set('security-001', {
      id: 'security-001',
      name: 'Password Policy',
      description: 'Enforce strong password requirements',
      category: 'security',
      type: 'validation',
      severity: 'high',
      enforcement: 'block',
      active: true,
      rules: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        maxAge: 90 * 24 * 60 * 60 * 1000 // 90 dias
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    this.policies.set('security-002', {
      id: 'security-002',
      name: 'Session Timeout Policy',
      description: 'Enforce session timeout limits',
      category: 'security',
      type: 'enforcement',
      severity: 'medium',
      enforcement: 'block',
      active: true,
      rules: {
        maxSessionDuration: 8 * 60 * 60 * 1000, // 8 horas
        idleTimeout: 30 * 60 * 1000, // 30 minutos
        requireReauth: true
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Políticas de dados
    this.policies.set('data-001', {
      id: 'data-001',
      name: 'Data Retention Policy',
      description: 'Control data retention periods',
      category: 'data',
      type: 'lifecycle',
      severity: 'medium',
      enforcement: 'audit',
      active: true,
      rules: {
        personalDataRetention: 365 * 24 * 60 * 60 * 1000, // 1 ano
        logRetention: 90 * 24 * 60 * 60 * 1000, // 90 dias
        backupRetention: 7 * 365 * 24 * 60 * 60 * 1000, // 7 anos
        autoDelete: true
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    this.policies.set('data-002', {
      id: 'data-002',
      name: 'PII Protection Policy',
      description: 'Protect personally identifiable information',
      category: 'data',
      type: 'protection',
      severity: 'critical',
      enforcement: 'block',
      active: true,
      rules: {
        encryptionRequired: true,
        accessLogging: true,
        anonymizationRequired: false,
        allowedRegions: ['us-east-1', 'us-west-2'],
        dataClassification: 'sensitive'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Políticas de acesso
    this.policies.set('access-001', {
      id: 'access-001',
      name: 'Role-Based Access Control',
      description: 'Enforce role-based access restrictions',
      category: 'access',
      type: 'authorization',
      severity: 'high',
      enforcement: 'block',
      active: true,
      rules: {
        requireRole: true,
        inheritanceAllowed: true,
        temporaryAccess: false,
        auditAccess: true,
        maxConcurrentSessions: 3
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Políticas de compliance
    this.policies.set('compliance-001', {
      id: 'compliance-001',
      name: 'GDPR Compliance',
      description: 'Ensure GDPR compliance requirements',
      category: 'compliance',
      type: 'regulatory',
      severity: 'critical',
      enforcement: 'block',
      active: true,
      rules: {
        consentRequired: true,
        rightToErasure: true,
        dataPortability: true,
        privacyByDesign: true,
        dataProtectionOfficer: true,
        breachNotification: 72 * 60 * 60 * 1000 // 72 horas
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    this.logger.info('Default policies initialized', {
      count: this.policies.size,
      categories: [...new Set(Array.from(this.policies.values()).map(p => p.category))]
    });
  }
  
  /**
   * Configurar middleware do Express
   */
  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: config.security.corsOrigins || ['http://localhost:3000'],
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100 // máximo 100 requests por janela
    });
    this.app.use(limiter);
    
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
          ip: req.ip
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
        activePolicies: this.policies.size,
        recentViolations: this.violations.length
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Métricas de políticas
    this.app.get('/metrics', (req, res) => {
      res.json({
        agent: this.agentId,
        metrics: this.policyMetrics,
        activePolicies: this.policies.size,
        recentViolations: this.violations.length,
        cacheSize: this.evaluationCache.size,
        timestamp: new Date().toISOString()
      });
    });
    
    // Listar políticas
    this.app.get('/policies', (req, res) => {
      try {
        const { category, active, severity } = req.query;
        
        let policies = Array.from(this.policies.values());
        
        // Filtrar por categoria
        if (category) {
          policies = policies.filter(p => p.category === category);
        }
        
        // Filtrar por status ativo
        if (active !== undefined) {
          const isActive = active === 'true';
          policies = policies.filter(p => p.active === isActive);
        }
        
        // Filtrar por severidade
        if (severity) {
          policies = policies.filter(p => p.severity === severity);
        }
        
        res.json({
          policies,
          count: policies.length,
          categories: [...new Set(policies.map(p => p.category))],
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error listing policies', error);
        res.status(500).json({
          error: 'Failed to list policies',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Obter política específica
    this.app.get('/policies/:policyId', (req, res) => {
      try {
        const { policyId } = req.params;
        const policy = this.policies.get(policyId);
        
        if (!policy) {
          return res.status(404).json({
            error: 'Policy not found',
            policyId,
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({
          policy,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error getting policy', error);
        res.status(500).json({
          error: 'Failed to get policy',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Criar nova política
    this.app.post('/policies', (req, res) => {
      try {
        const policyData = req.body;
        
        // Validar dados da política
        const validation = this.validatePolicyData(policyData);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid policy data',
            details: validation.errors,
            timestamp: new Date().toISOString()
          });
        }
        
        // Gerar ID se não fornecido
        const policyId = policyData.id || this.generatePolicyId(policyData.category);
        
        // Verificar se política já existe
        if (this.policies.has(policyId)) {
          return res.status(409).json({
            error: 'Policy already exists',
            policyId,
            timestamp: new Date().toISOString()
          });
        }
        
        // Criar política
        const policy = {
          ...policyData,
          id: policyId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        this.policies.set(policyId, policy);
        
        this.logger.info('Policy created', {
          policyId,
          category: policy.category,
          severity: policy.severity
        });
        
        res.status(201).json({
          success: true,
          policy,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error creating policy', error);
        res.status(500).json({
          error: 'Failed to create policy',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Atualizar política
    this.app.put('/policies/:policyId', (req, res) => {
      try {
        const { policyId } = req.params;
        const updateData = req.body;
        
        const existingPolicy = this.policies.get(policyId);
        if (!existingPolicy) {
          return res.status(404).json({
            error: 'Policy not found',
            policyId,
            timestamp: new Date().toISOString()
          });
        }
        
        // Validar dados de atualização
        const validation = this.validatePolicyData(updateData, true);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid policy data',
            details: validation.errors,
            timestamp: new Date().toISOString()
          });
        }
        
        // Atualizar política
        const updatedPolicy = {
          ...existingPolicy,
          ...updateData,
          id: policyId, // Manter ID original
          createdAt: existingPolicy.createdAt, // Manter data de criação
          updatedAt: new Date().toISOString()
        };
        
        this.policies.set(policyId, updatedPolicy);
        
        // Limpar cache de avaliações relacionadas
        this.clearEvaluationCache(policyId);
        
        this.logger.info('Policy updated', {
          policyId,
          category: updatedPolicy.category,
          changes: Object.keys(updateData)
        });
        
        res.json({
          success: true,
          policy: updatedPolicy,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error updating policy', error);
        res.status(500).json({
          error: 'Failed to update policy',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Deletar política
    this.app.delete('/policies/:policyId', (req, res) => {
      try {
        const { policyId } = req.params;
        
        const policy = this.policies.get(policyId);
        if (!policy) {
          return res.status(404).json({
            error: 'Policy not found',
            policyId,
            timestamp: new Date().toISOString()
          });
        }
        
        // Remover política
        this.policies.delete(policyId);
        
        // Limpar cache de avaliações relacionadas
        this.clearEvaluationCache(policyId);
        
        this.logger.info('Policy deleted', {
          policyId,
          category: policy.category
        });
        
        res.json({
          success: true,
          message: 'Policy deleted successfully',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error deleting policy', error);
        res.status(500).json({
          error: 'Failed to delete policy',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Avaliar políticas
    this.app.post('/policies/evaluate', (req, res) => {
      try {
        const { context, data, policies: policyIds } = req.body;
        
        if (!context || !data) {
          return res.status(400).json({
            error: 'Context and data are required',
            timestamp: new Date().toISOString()
          });
        }
        
        // Determinar políticas a avaliar
        const policiesToEvaluate = policyIds 
          ? policyIds.map(id => this.policies.get(id)).filter(Boolean)
          : Array.from(this.policies.values()).filter(p => p.active);
        
        // Avaliar políticas
        const evaluationResults = this.evaluatePolicies(policiesToEvaluate, context, data);
        
        this.policyMetrics.policiesEvaluated += policiesToEvaluate.length;
        this.policyMetrics.lastPolicyEvent = new Date().toISOString();
        
        res.json({
          success: true,
          results: evaluationResults,
          evaluatedPolicies: policiesToEvaluate.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error evaluating policies', error);
        res.status(500).json({
          error: 'Failed to evaluate policies',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Verificar compliance
    this.app.post('/compliance/check', (req, res) => {
      try {
        const { entity, regulations, context } = req.body;
        
        this.policyMetrics.complianceChecks++;
        
        // Simular verificação de compliance (Fase 1)
        const complianceResults = this.checkCompliance(entity, regulations, context);
        
        res.json({
          success: true,
          compliance: complianceResults,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error checking compliance', error);
        res.status(500).json({
          error: 'Failed to check compliance',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Listar violações
    this.app.get('/violations', (req, res) => {
      try {
        const { severity, category, limit = 100 } = req.query;
        
        let violations = [...this.violations];
        
        // Filtrar por severidade
        if (severity) {
          violations = violations.filter(v => v.severity === severity);
        }
        
        // Filtrar por categoria
        if (category) {
          violations = violations.filter(v => v.category === category);
        }
        
        // Limitar resultados
        violations = violations.slice(0, parseInt(limit));
        
        res.json({
          violations,
          count: violations.length,
          total: this.violations.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error listing violations', error);
        res.status(500).json({
          error: 'Failed to list violations',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Auditoria de políticas
    this.app.get('/audit', (req, res) => {
      try {
        const { startDate, endDate, category } = req.query;
        
        // Simular dados de auditoria (Fase 1)
        const auditData = this.generateAuditReport(startDate, endDate, category);
        
        this.policyMetrics.auditEvents++;
        
        res.json({
          audit: auditData,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error generating audit report', error);
        res.status(500).json({
          error: 'Failed to generate audit report',
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
   * Validar dados de política
   */
  validatePolicyData(data, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
      if (!data.name) errors.push('Name is required');
      if (!data.category) errors.push('Category is required');
      if (!data.type) errors.push('Type is required');
      if (!data.severity) errors.push('Severity is required');
      if (!data.enforcement) errors.push('Enforcement mode is required');
    }
    
    if (data.severity && !this.policyConfig.severityLevels.includes(data.severity)) {
      errors.push(`Invalid severity level. Must be one of: ${this.policyConfig.severityLevels.join(', ')}`);
    }
    
    if (data.enforcement && !this.policyConfig.enforcementModes.includes(data.enforcement)) {
      errors.push(`Invalid enforcement mode. Must be one of: ${this.policyConfig.enforcementModes.join(', ')}`);
    }
    
    if (data.rules && typeof data.rules !== 'object') {
      errors.push('Rules must be an object');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Gerar ID de política
   */
  generatePolicyId(category) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${category}-${timestamp}-${random}`;
  }
  
  /**
   * Avaliar políticas
   */
  evaluatePolicies(policies, context, data) {
    const results = [];
    
    for (const policy of policies) {
      try {
        const result = this.evaluatePolicy(policy, context, data);
        results.push(result);
        
        // Registrar violação se necessário
        if (!result.compliant) {
          this.recordViolation(policy, context, data, result);
        }
        
      } catch (error) {
        this.logger.error('Error evaluating policy', error, {
          policyId: policy.id
        });
        
        results.push({
          policyId: policy.id,
          compliant: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return results;
  }
  
  /**
   * Avaliar política individual
   */
  evaluatePolicy(policy, context, data) {
    // Verificar cache
    const cacheKey = this.generateCacheKey(policy.id, context, data);
    const cached = this.evaluationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.policyConfig.cacheTimeout) {
      return cached.result;
    }
    
    // Avaliar política baseada no tipo
    let result;
    
    switch (policy.type) {
      case 'validation':
        result = this.evaluateValidationPolicy(policy, context, data);
        break;
      case 'enforcement':
        result = this.evaluateEnforcementPolicy(policy, context, data);
        break;
      case 'authorization':
        result = this.evaluateAuthorizationPolicy(policy, context, data);
        break;
      case 'lifecycle':
        result = this.evaluateLifecyclePolicy(policy, context, data);
        break;
      case 'protection':
        result = this.evaluateProtectionPolicy(policy, context, data);
        break;
      case 'regulatory':
        result = this.evaluateRegulatoryPolicy(policy, context, data);
        break;
      default:
        result = this.evaluateGenericPolicy(policy, context, data);
    }
    
    // Adicionar informações padrão
    result.policyId = policy.id;
    result.policyName = policy.name;
    result.category = policy.category;
    result.severity = policy.severity;
    result.enforcement = policy.enforcement;
    result.timestamp = new Date().toISOString();
    
    // Cache do resultado
    this.evaluationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }
  
  /**
   * Avaliar política de validação
   */
  evaluateValidationPolicy(policy, context, data) {
    // Exemplo: política de senha
    if (policy.id === 'security-001' && data.password) {
      const password = data.password;
      const rules = policy.rules;
      const violations = [];
      
      if (password.length < rules.minLength) {
        violations.push(`Password must be at least ${rules.minLength} characters`);
      }
      
      if (rules.requireUppercase && !/[A-Z]/.test(password)) {
        violations.push('Password must contain uppercase letters');
      }
      
      if (rules.requireLowercase && !/[a-z]/.test(password)) {
        violations.push('Password must contain lowercase letters');
      }
      
      if (rules.requireNumbers && !/\d/.test(password)) {
        violations.push('Password must contain numbers');
      }
      
      if (rules.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        violations.push('Password must contain special characters');
      }
      
      return {
        compliant: violations.length === 0,
        violations,
        details: {
          passwordLength: password.length,
          hasUppercase: /[A-Z]/.test(password),
          hasLowercase: /[a-z]/.test(password),
          hasNumbers: /\d/.test(password),
          hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        }
      };
    }
    
    // Política genérica de validação
    return {
      compliant: true,
      message: 'Validation policy evaluated successfully'
    };
  }
  
  /**
   * Avaliar política de enforcement
   */
  evaluateEnforcementPolicy(policy, context, data) {
    // Exemplo: política de timeout de sessão
    if (policy.id === 'security-002' && context.session) {
      const session = context.session;
      const rules = policy.rules;
      const now = Date.now();
      const violations = [];
      
      // Verificar duração máxima da sessão
      if (session.createdAt) {
        const sessionDuration = now - new Date(session.createdAt).getTime();
        if (sessionDuration > rules.maxSessionDuration) {
          violations.push('Session duration exceeded maximum allowed time');
        }
      }
      
      // Verificar timeout de inatividade
      if (session.lastActivity) {
        const idleTime = now - new Date(session.lastActivity).getTime();
        if (idleTime > rules.idleTimeout) {
          violations.push('Session idle timeout exceeded');
        }
      }
      
      return {
        compliant: violations.length === 0,
        violations,
        details: {
          sessionAge: session.createdAt ? now - new Date(session.createdAt).getTime() : 0,
          idleTime: session.lastActivity ? now - new Date(session.lastActivity).getTime() : 0
        }
      };
    }
    
    return {
      compliant: true,
      message: 'Enforcement policy evaluated successfully'
    };
  }
  
  /**
   * Avaliar política de autorização
   */
  evaluateAuthorizationPolicy(policy, context, data) {
    // Exemplo: controle de acesso baseado em roles
    if (policy.id === 'access-001' && context.user && data.resource) {
      const user = context.user;
      const resource = data.resource;
      const rules = policy.rules;
      const violations = [];
      
      // Verificar se role é obrigatório
      if (rules.requireRole && !user.role) {
        violations.push('User role is required');
      }
      
      // Verificar sessões concorrentes
      if (rules.maxConcurrentSessions && context.activeSessions > rules.maxConcurrentSessions) {
        violations.push(`Maximum concurrent sessions (${rules.maxConcurrentSessions}) exceeded`);
      }
      
      return {
        compliant: violations.length === 0,
        violations,
        details: {
          userRole: user.role,
          activeSessions: context.activeSessions || 0,
          resourceAccessed: resource
        }
      };
    }
    
    return {
      compliant: true,
      message: 'Authorization policy evaluated successfully'
    };
  }
  
  /**
   * Avaliar política de ciclo de vida
   */
  evaluateLifecyclePolicy(policy, context, data) {
    // Exemplo: política de retenção de dados
    if (policy.id === 'data-001' && data.dataAge) {
      const dataAge = data.dataAge;
      const rules = policy.rules;
      const violations = [];
      
      // Verificar retenção de dados pessoais
      if (data.type === 'personal' && dataAge > rules.personalDataRetention) {
        violations.push('Personal data retention period exceeded');
      }
      
      // Verificar retenção de logs
      if (data.type === 'log' && dataAge > rules.logRetention) {
        violations.push('Log retention period exceeded');
      }
      
      return {
        compliant: violations.length === 0,
        violations,
        details: {
          dataType: data.type,
          dataAge,
          retentionLimit: data.type === 'personal' ? rules.personalDataRetention : rules.logRetention
        }
      };
    }
    
    return {
      compliant: true,
      message: 'Lifecycle policy evaluated successfully'
    };
  }
  
  /**
   * Avaliar política de proteção
   */
  evaluateProtectionPolicy(policy, context, data) {
    // Exemplo: proteção de PII
    if (policy.id === 'data-002' && data.dataClassification) {
      const rules = policy.rules;
      const violations = [];
      
      // Verificar criptografia obrigatória
      if (rules.encryptionRequired && !data.encrypted) {
        violations.push('Encryption is required for sensitive data');
      }
      
      // Verificar região permitida
      if (rules.allowedRegions && data.region && !rules.allowedRegions.includes(data.region)) {
        violations.push(`Data region ${data.region} is not allowed`);
      }
      
      return {
        compliant: violations.length === 0,
        violations,
        details: {
          dataClassification: data.dataClassification,
          encrypted: data.encrypted || false,
          region: data.region
        }
      };
    }
    
    return {
      compliant: true,
      message: 'Protection policy evaluated successfully'
    };
  }
  
  /**
   * Avaliar política regulatória
   */
  evaluateRegulatoryPolicy(policy, context, data) {
    // Exemplo: GDPR
    if (policy.id === 'compliance-001' && data.personalData) {
      const rules = policy.rules;
      const violations = [];
      
      // Verificar consentimento
      if (rules.consentRequired && !data.consent) {
        violations.push('User consent is required for personal data processing');
      }
      
      // Verificar direito ao esquecimento
      if (rules.rightToErasure && data.erasureRequest && !data.erasureCompleted) {
        violations.push('Data erasure request must be processed');
      }
      
      return {
        compliant: violations.length === 0,
        violations,
        details: {
          hasConsent: data.consent || false,
          erasureRequested: data.erasureRequest || false,
          erasureCompleted: data.erasureCompleted || false
        }
      };
    }
    
    return {
      compliant: true,
      message: 'Regulatory policy evaluated successfully'
    };
  }
  
  /**
   * Avaliar política genérica
   */
  evaluateGenericPolicy(policy, context, data) {
    return {
      compliant: true,
      message: 'Generic policy evaluation - no specific rules defined'
    };
  }
  
  /**
   * Registrar violação
   */
  recordViolation(policy, context, data, evaluationResult) {
    const violation = {
      id: this.generateViolationId(),
      policyId: policy.id,
      policyName: policy.name,
      category: policy.category,
      severity: policy.severity,
      enforcement: policy.enforcement,
      violations: evaluationResult.violations || [],
      context: {
        userId: context.user?.id,
        sessionId: context.sessionId,
        ip: context.ip,
        userAgent: context.userAgent
      },
      data: {
        type: data.type,
        resource: data.resource,
        action: data.action
      },
      timestamp: new Date().toISOString()
    };
    
    this.violations.push(violation);
    this.policyMetrics.policiesViolated++;
    
    // Manter apenas as violações mais recentes
    if (this.violations.length > this.policyConfig.maxViolationHistory) {
      this.violations = this.violations.slice(-this.policyConfig.maxViolationHistory);
    }
    
    this.logger.warn('Policy violation recorded', {
      violationId: violation.id,
      policyId: policy.id,
      severity: policy.severity,
      violations: evaluationResult.violations
    });
    
    return violation;
  }
  
  /**
   * Verificar compliance
   */
  checkCompliance(entity, regulations, context) {
    // Simular verificação de compliance (Fase 1)
    const results = {
      entity,
      regulations: regulations || ['GDPR', 'CCPA'],
      compliant: true,
      score: 95,
      findings: [
        {
          regulation: 'GDPR',
          compliant: true,
          score: 98,
          details: 'All GDPR requirements met'
        },
        {
          regulation: 'CCPA',
          compliant: true,
          score: 92,
          details: 'Minor documentation improvements needed'
        }
      ],
      recommendations: [
        'Update privacy policy documentation',
        'Implement automated data retention cleanup'
      ],
      timestamp: new Date().toISOString()
    };
    
    if (results.score < 90) {
      this.policyMetrics.complianceViolations++;
    }
    
    return results;
  }
  
  /**
   * Gerar relatório de auditoria
   */
  generateAuditReport(startDate, endDate, category) {
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : now;
    
    // Filtrar violações por período
    const periodViolations = this.violations.filter(v => {
      const violationDate = new Date(v.timestamp);
      return violationDate >= start && violationDate <= end;
    });
    
    // Filtrar por categoria se especificada
    const filteredViolations = category 
      ? periodViolations.filter(v => v.category === category)
      : periodViolations;
    
    // Agrupar por severidade
    const violationsBySeverity = filteredViolations.reduce((acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    }, {});
    
    // Agrupar por política
    const violationsByPolicy = filteredViolations.reduce((acc, v) => {
      acc[v.policyId] = (acc[v.policyId] || 0) + 1;
      return acc;
    }, {});
    
    return {
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      category,
      summary: {
        totalViolations: filteredViolations.length,
        violationsBySeverity,
        violationsByPolicy,
        activePolicies: this.policies.size,
        complianceScore: Math.max(0, 100 - (filteredViolations.length * 2))
      },
      violations: filteredViolations.slice(0, 50), // Limitar a 50 mais recentes
      recommendations: this.generateRecommendations(filteredViolations),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Gerar recomendações baseadas em violações
   */
  generateRecommendations(violations) {
    const recommendations = [];
    
    // Agrupar violações por tipo
    const violationTypes = violations.reduce((acc, v) => {
      v.violations.forEach(violation => {
        acc[violation] = (acc[violation] || 0) + 1;
      });
      return acc;
    }, {});
    
    // Gerar recomendações baseadas nos tipos mais comuns
    Object.entries(violationTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([violation, count]) => {
        if (violation.includes('password')) {
          recommendations.push('Implement stronger password policy enforcement');
        } else if (violation.includes('session')) {
          recommendations.push('Review session timeout configurations');
        } else if (violation.includes('encryption')) {
          recommendations.push('Ensure all sensitive data is properly encrypted');
        } else if (violation.includes('consent')) {
          recommendations.push('Improve consent management processes');
        } else {
          recommendations.push(`Address recurring issue: ${violation}`);
        }
      });
    
    return [...new Set(recommendations)]; // Remover duplicatas
  }
  
  /**
   * Gerar chave de cache
   */
  generateCacheKey(policyId, context, data) {
    const contextStr = JSON.stringify({
      userId: context.user?.id,
      role: context.user?.role,
      resource: data.resource,
      action: data.action
    });
    
    return `${policyId}:${Buffer.from(contextStr).toString('base64')}`;
  }
  
  /**
   * Limpar cache de avaliações
   */
  clearEvaluationCache(policyId) {
    for (const [key, value] of this.evaluationCache) {
      if (key.startsWith(policyId + ':')) {
        this.evaluationCache.delete(key);
      }
    }
  }
  
  /**
   * Gerar ID de violação
   */
  generateViolationId() {
    return `violation-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
  
  /**
   * Limpeza periódica de dados expirados
   */
  cleanupExpiredData() {
    const now = Date.now();
    
    // Limpar cache de avaliações expirado
    for (const [key, value] of this.evaluationCache) {
      if (now - value.timestamp > this.policyConfig.cacheTimeout) {
        this.evaluationCache.delete(key);
      }
    }
    
    // Limpar violações antigas
    const cutoff = now - this.policyConfig.auditRetention;
    this.violations = this.violations.filter(v => {
      return new Date(v.timestamp).getTime() > cutoff;
    });
    
    this.logger.debug('Expired data cleanup completed', {
      cacheSize: this.evaluationCache.size,
      violationsCount: this.violations.length
    });
  }
  
  /**
   * Inicializar serviço SQS
   */
  async initializeSQS() {
    try {
      // Use existing sqsService if already configured (MockSQSService in development)
      if (!this.sqsService) {
        this.sqsService = new SQSService();
      }
      await this.sqsService.initialize();
      
      // Começar a escutar mensagens
      await this.sqsService.startPolling(
        config.aws.sqs.queues.auxiliary.policy,
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
        case 'policy_evaluation':
          await this.handlePolicyEvaluation(messageData);
          break;
        case 'compliance_check':
          await this.handleComplianceCheck(messageData);
          break;
        case 'policy_update':
          await this.handlePolicyUpdate(messageData);
          break;
        default:
          this.logger.warn('Unknown message type', {
            type: messageData.type,
            messageId: message.MessageId
          });
      }
      
      // Deletar mensagem da fila após processamento bem-sucedido
      await this.sqsService.deleteMessage(
        config.aws.sqs.queues.auxiliary.policy,
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
   * Lidar com avaliação de política via SQS
   */
  async handlePolicyEvaluation(messageData) {
    const { requestId, context, data, policies } = messageData;
    
    try {
      // Determinar políticas a avaliar
      const policiesToEvaluate = policies 
        ? policies.map(id => this.policies.get(id)).filter(Boolean)
        : Array.from(this.policies.values()).filter(p => p.active);
      
      // Avaliar políticas
      const evaluationResults = this.evaluatePolicies(policiesToEvaluate, context, data);
      
      this.logger.info('Policy evaluation completed via SQS', {
        requestId,
        evaluatedPolicies: policiesToEvaluate.length,
        violations: evaluationResults.filter(r => !r.compliant).length
      });
      
    } catch (error) {
      this.logger.error('Policy evaluation failed', error, {
        requestId
      });
    }
  }
  
  /**
   * Lidar com verificação de compliance via SQS
   */
  async handleComplianceCheck(messageData) {
    const { requestId, entity, regulations, context } = messageData;
    
    try {
      const complianceResults = this.checkCompliance(entity, regulations, context);
      
      this.logger.info('Compliance check completed via SQS', {
        requestId,
        entity,
        compliant: complianceResults.compliant,
        score: complianceResults.score
      });
      
    } catch (error) {
      this.logger.error('Compliance check failed', error, {
        requestId
      });
    }
  }
  
  /**
   * Lidar com atualização de política via SQS
   */
  async handlePolicyUpdate(messageData) {
    const { requestId, policyId, updateData } = messageData;
    
    try {
      const existingPolicy = this.policies.get(policyId);
      
      if (existingPolicy) {
        const updatedPolicy = {
          ...existingPolicy,
          ...updateData,
          updatedAt: new Date().toISOString()
        };
        
        this.policies.set(policyId, updatedPolicy);
        this.clearEvaluationCache(policyId);
        
        this.logger.info('Policy updated via SQS', {
          requestId,
          policyId,
          changes: Object.keys(updateData)
        });
      } else {
        this.logger.warn('Policy not found for update', {
          requestId,
          policyId
        });
      }
      
    } catch (error) {
      this.logger.error('Policy update failed', error, {
        requestId,
        policyId
      });
    }
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      this.logger.info('Starting Policy Agent...');
      
      // Inicializar SQS
      await this.initializeSQS();
      
      // Configurar limpeza periódica
      setInterval(() => {
        if (this.isRunning) {
          this.cleanupExpiredData();
        }
      }, 300000); // 5 minutos
      
      // Iniciar servidor HTTP
      const port = process.env.PORT || config.agents.policy.port || 3009;
      this.server = this.app.listen(port, () => {
        this.isRunning = true;
        this.logger.info(`Policy Agent started on port ${port}`);
      });
      
      // Configurar health check
      this.setupHealthCheck();
      
    } catch (error) {
      this.logger.error('Failed to start Policy Agent', error);
      throw error;
    }
  }
  
  /**
   * Parar o agente
   */
  async stop() {
    try {
      this.logger.info('Stopping Policy Agent...');
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
      
      this.logger.info('Policy Agent stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Policy Agent', error);
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
          metrics: this.policyMetrics,
          activePolicies: this.policies.size,
          recentViolations: this.violations.length
        });
      }
    }, config.agents.healthCheckInterval);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const agent = new PolicyAgent();
  
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
    console.error('Failed to start Policy Agent:', error);
    process.exit(1);
  });
}

module.exports = PolicyAgent;