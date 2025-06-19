/**
 * Planning Agent - Agente de Planejamento e Análise
 * Fase 1-2: Análise de requisições e criação de planos
 * 
 * Responsabilidades:
 * - Analisar requisições do Event Agent
 * - Criar planos de execução
 * - Coordenar com Execution Agent
 * - Gerenciar dependências entre tarefas
 * - Otimizar sequência de execução
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const PlanningService = require('./services/planningService');
const BDIEngine = require('./services/bdiEngine');
const BeliefManager = require('./services/beliefManager');
const DesireManager = require('./services/desireManager');
const IntentionManager = require('./services/intentionManager');
const PlanLibrary = require('./services/planLibrary');
const config = require('../../../config');

class PlanningAgent {
  constructor() {
    this.agentId = 'planning-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.sqsService = new SQSService(this.logger);
    this.isRunning = false;
    this.server = null;
    
    // BDI Components
    this.beliefManager = new BeliefManager(this.logger);
    this.desireManager = new DesireManager(this.logger);
    this.intentionManager = new IntentionManager(this.logger);
    this.planLibrary = new PlanLibrary(this.logger);
    this.bdiEngine = new BDIEngine(this.logger, {
      beliefManager: this.beliefManager,
      desireManager: this.desireManager,
      intentionManager: this.intentionManager,
      planLibrary: this.planLibrary
    });
    
    // Métricas BDI
    this.metrics = this.setupMetrics();
    
    // Cache de planos ativos
    this.activePlans = new Map();
    this.activeIntentions = new Map();
    
    // BDI State
    this.bdiCycleActive = false;
    this.lastBDICycle = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeBDI();
    this.initializePlanTemplates();
  }
  
  /**
   * Configurar logger
   */
  setupLogger() {
    return winston.createLogger({
      level: config.logging.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/planning-agent.log' })
      ]
    });
  }
  
  /**
   * Configurar métricas
   */
  setupMetrics() {
    const register = new promClient.Registry();
    
    const metrics = {
      requestsAnalyzed: new promClient.Counter({
        name: 'planning_requests_analyzed_total',
        help: 'Total number of requests analyzed',
        registers: [register]
      }),
      plansCreated: new promClient.Counter({
        name: 'planning_plans_created_total',
        help: 'Total number of plans created',
        registers: [register]
      }),
      plansFailed: new promClient.Counter({
        name: 'planning_plans_failed_total',
        help: 'Total number of plans that failed',
        registers: [register]
      }),
      averageAnalysisTime: 0,
      averagePlanComplexity: 0,
      lastAnalyzedAt: null,
      register
    };
    
    return metrics;
  }
  
  /**
   * Inicializar BDI
   */
  async initializeBDI() {
    try {
      this.logger.info('Initializing BDI architecture...');
      
      // Initialize basic beliefs
      await this.beliefManager.addBelief({
        content: 'system_status',
        value: 'operational',
        confidence: 1.0,
        source: 'system',
        type: 'status'
      });
      
      await this.beliefManager.addBelief({
        content: 'agent_role',
        value: 'planning_agent',
        confidence: 1.0,
        source: 'system',
        type: 'identity'
      });
      
      // Initialize basic desires
      await this.desireManager.addDesire({
        goal: 'maintain_system_health',
        description: 'Keep the system running optimally',
        importance: 0.8,
        urgency: 0.6,
        feasibility: 0.9,
        cost: 0.2,
        type: 'maintenance'
      });
      
      await this.desireManager.addDesire({
        goal: 'optimize_planning_efficiency',
        description: 'Improve planning algorithms and response time',
        importance: 0.7,
        urgency: 0.4,
        feasibility: 0.8,
        cost: 0.3,
        type: 'optimization'
      });
      
      // Start BDI cycle
      this.startBDICycle();
      
      this.logger.info('BDI architecture initialized successfully');
      
    } catch (error) {
      this.logger.error('Error initializing BDI architecture', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Iniciar ciclo BDI
   */
  startBDICycle() {
    this.bdiCycleActive = true;
    
    const runCycle = async () => {
      if (!this.bdiCycleActive) return;
      
      try {
        await this.bdiEngine.executeCycle();
        this.lastBDICycle = new Date().toISOString();
      } catch (error) {
        this.logger.error('Error in BDI cycle', { error: error.message });
      }
      
      // Schedule next cycle
      setTimeout(runCycle, config.agents.planning.bdiCycleInterval || 5000);
    };
    
    runCycle();
  }
  
  /**
   * Parar ciclo BDI
   */
  stopBDICycle() {
    this.bdiCycleActive = false;
  }
  
  /**
   * Calcular complexidade do plano
   */
  calculatePlanComplexity(plan) {
    if (!plan || !plan.steps) return 0;
    
    let complexity = plan.steps.length;
    
    // Adicionar complexidade baseada em recursos
    if (plan.resources) {
      complexity += Object.keys(plan.resources).length * 0.5;
    }
    
    // Adicionar complexidade baseada em restrições
    if (plan.constraints) {
      complexity += plan.constraints.length * 0.3;
    }
    
    // Adicionar complexidade baseada no tipo
    const typeComplexity = {
      'sequential': 1,
      'parallel': 1.5,
      'conditional': 2,
      'iterative': 2.5,
      'reactive': 3,
      'hierarchical': 3.5
    };
    
    complexity *= typeComplexity[plan.type] || 1;
    
    return Math.round(complexity * 100) / 100;
  }

  /**
   * Configurar middleware do Express
   */
  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: config.security.corsOrigins,
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 500, // máximo 500 requests por janela
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
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
        activePlans: this.activePlans.size,
        bdi: {
          cycleActive: this.bdiCycleActive,
          lastCycle: this.lastBDICycle,
          beliefs: this.beliefManager.getStats().totalBeliefs,
          desires: this.desireManager.getStats().totalDesires,
          intentions: this.intentionManager.getStats().totalIntentions,
          plans: this.planLibrary.getStats().totalPlans
        }
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Métricas
    this.app.get('/metrics', (req, res) => {
      res.json({
        agent: this.agentId,
        metrics: this.metrics,
        activePlans: this.activePlans.size,
        timestamp: new Date().toISOString()
      });
    });
    
    // Endpoint para criação de plano (legacy compatibility)
    this.app.post('/plan', async (req, res) => {
      const startTime = Date.now();
      
      try {
        const { goal, constraints, resources, context } = req.body;
        
        if (!goal) {
          return res.status(400).json({ error: 'Goal is required' });
        }
        
        // Create desire from goal
        const desire = await this.desireManager.addDesire({
          goal,
          description: `External goal: ${goal}`,
          importance: 0.8,
          urgency: 0.7,
          feasibility: 0.8,
          cost: 0.3,
          type: 'external',
          constraints,
          resources,
          context
        });
        
        // Trigger BDI cycle to process the desire
        const result = await this.bdiEngine.executeCycle();
        
        if (result.newIntentions && result.newIntentions.length > 0) {
          const intention = result.newIntentions[0];
          const complexity = this.calculatePlanComplexity(intention.plan);
          
          res.json({
            success: true,
            plan: intention.plan,
            intention: intention,
            metadata: {
              complexity,
              creationTime: Date.now() - startTime,
              timestamp: new Date().toISOString()
            }
          });
        } else {
          res.status(400).json({
            success: false,
            error: 'Failed to create plan from goal'
          });
        }
        
      } catch (error) {
        this.logger.error('Error creating plan', {
          error: error.message,
          request: req.body
        });
        
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // BDI Status endpoint
    this.app.get('/bdi/status', (req, res) => {
      try {
        res.json({
          success: true,
          bdi: {
            cycleActive: this.bdiCycleActive,
            lastCycle: this.lastBDICycle,
            beliefs: this.beliefManager.getStats(),
            desires: this.desireManager.getStats(),
            intentions: this.intentionManager.getStats(),
            plans: this.planLibrary.getStats(),
            engine: this.bdiEngine.getStats()
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error getting BDI status', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Beliefs endpoints
    this.app.get('/beliefs', (req, res) => {
      try {
        const beliefs = this.beliefManager.getAllBeliefs();
        res.json({ success: true, beliefs, count: beliefs.length });
      } catch (error) {
        this.logger.error('Error getting beliefs', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/beliefs', async (req, res) => {
      try {
        const belief = await this.beliefManager.addBelief(req.body);
        res.json({ success: true, belief });
      } catch (error) {
        this.logger.error('Error adding belief', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Desires endpoints
    this.app.get('/desires', (req, res) => {
      try {
        const desires = this.desireManager.getAllDesires();
        res.json({ success: true, desires, count: desires.length });
      } catch (error) {
        this.logger.error('Error getting desires', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/desires', async (req, res) => {
      try {
        const desire = await this.desireManager.addDesire(req.body);
        res.json({ success: true, desire });
      } catch (error) {
        this.logger.error('Error adding desire', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Intentions endpoints
    this.app.get('/intentions', (req, res) => {
      try {
        const intentions = this.intentionManager.getAllIntentions();
        res.json({ success: true, intentions, count: intentions.length });
      } catch (error) {
        this.logger.error('Error getting intentions', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/intentions/active', (req, res) => {
      try {
        const activeIntentions = this.intentionManager.getActiveIntentions();
        res.json({ success: true, intentions: activeIntentions, count: activeIntentions.length });
      } catch (error) {
        this.logger.error('Error getting active intentions', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // BDI Cycle control
    this.app.post('/bdi/cycle', async (req, res) => {
      try {
        const result = await this.bdiEngine.executeCycle();
        res.json({ success: true, result });
      } catch (error) {
        this.logger.error('Error executing BDI cycle', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Endpoint para análise direta (legacy compatibility)
    this.app.post('/analyze', async (req, res) => {
      try {
        const request = req.body;
        
        // Convert to belief and trigger BDI cycle
        await this.beliefManager.addBelief({
          content: 'analysis_request',
          value: request,
          confidence: 0.8,
          source: 'external',
          type: 'request'
        });
        
        // Trigger BDI cycle
        const result = await this.bdiEngine.executeCycle();
        
        res.json({
          success: true,
          result: result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error in direct analysis', error, { request: req.body });
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Plans endpoints (BDI integration)
    this.app.get('/plans', (req, res) => {
      try {
        const plans = this.planLibrary.getAllPlans();
        res.json({ success: true, plans, count: plans.length });
      } catch (error) {
        this.logger.error('Error getting plans', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/plans', async (req, res) => {
      try {
        const plan = await this.planLibrary.createPlan(req.body);
        res.json({ success: true, plan });
      } catch (error) {
        this.logger.error('Error creating plan', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Status de plano específico
    this.app.get('/plans/:planId', (req, res) => {
      const { planId } = req.params;
      
      // Check active plans first
      const activePlan = this.activePlans.get(planId);
      if (activePlan) {
        return res.json({
          planId,
          plan: activePlan.plan,
          status: activePlan.status,
          createdAt: activePlan.createdAt,
          updatedAt: activePlan.updatedAt,
          progress: activePlan.progress
        });
      }
      
      // Check plan library
      try {
        const plans = this.planLibrary.getAllPlans();
        const plan = plans.find(p => p.id === planId);
        
        if (plan) {
          res.json({ success: true, plan });
        } else {
          res.status(404).json({ success: false, error: 'Plan not found' });
        }
      } catch (error) {
        this.logger.error('Error getting plan', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Listar planos ativos
    this.app.get('/plans/active', (req, res) => {
      const plans = Array.from(this.activePlans.entries()).map(([planId, planData]) => ({
        planId,
        status: planData.status,
        createdAt: planData.createdAt,
        complexity: planData.plan.complexity,
        stepsCount: planData.plan.steps.length
      }));
      
      res.json({
        plans,
        total: plans.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Templates de planos
    this.app.get('/templates', (req, res) => {
      try {
        const plans = this.planLibrary.getAllPlans();
        const templates = plans.map(plan => ({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          complexity: plan.complexity,
          stepsCount: plan.steps ? plan.steps.length : 0
        }));
        
        res.json({
          templates,
          total: templates.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error getting templates', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
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
   * Inicializar templates de planos
   */
  async initializePlanTemplates() {
    this.planTemplates = new Map();
    // Template para requisições simples
    this.planTemplates.set('simple_request', {
      name: 'simple_request',
      description: 'Template para requisições simples',
      complexity: 'low',
      steps: [
        {
          id: 'validate_input',
          name: 'Validar entrada',
          type: 'validation',
          agent: 'execution-agent',
          dependencies: [],
          estimatedTime: 1000
        },
        {
          id: 'process_request',
          name: 'Processar requisição',
          type: 'processing',
          agent: 'execution-agent',
          dependencies: ['validate_input'],
          estimatedTime: 5000
        },
        {
          id: 'return_response',
          name: 'Retornar resposta',
          type: 'response',
          agent: 'execution-agent',
          dependencies: ['process_request'],
          estimatedTime: 1000
        }
      ]
    });
    
    // Template para requisições complexas
    this.planTemplates.set('complex_request', {
      name: 'complex_request',
      description: 'Template para requisições complexas',
      complexity: 'high',
      steps: [
        {
          id: 'analyze_requirements',
          name: 'Analisar requisitos',
          type: 'analysis',
          agent: 'execution-agent',
          dependencies: [],
          estimatedTime: 3000
        },
        {
          id: 'validate_security',
          name: 'Validar segurança',
          type: 'security',
          agent: 'security-agent',
          dependencies: ['analyze_requirements'],
          estimatedTime: 2000
        },
        {
          id: 'check_policies',
          name: 'Verificar políticas',
          type: 'policy',
          agent: 'policy-agent',
          dependencies: ['analyze_requirements'],
          estimatedTime: 2000
        },
        {
          id: 'execute_main_task',
          name: 'Executar tarefa principal',
          type: 'execution',
          agent: 'execution-agent',
          dependencies: ['validate_security', 'check_policies'],
          estimatedTime: 10000
        },
        {
          id: 'validate_results',
          name: 'Validar resultados',
          type: 'validation',
          agent: 'execution-agent',
          dependencies: ['execute_main_task'],
          estimatedTime: 2000
        },
        {
          id: 'generate_response',
          name: 'Gerar resposta',
          type: 'response',
          agent: 'execution-agent',
          dependencies: ['validate_results'],
          estimatedTime: 1000
        }
      ]
    });
    
    // Template para operações de dados
    this.planTemplates.set('data_operation', {
      name: 'data_operation',
      description: 'Template para operações com dados',
      complexity: 'medium',
      steps: [
        {
          id: 'validate_data_access',
          name: 'Validar acesso aos dados',
          type: 'security',
          agent: 'security-agent',
          dependencies: [],
          estimatedTime: 2000
        },
        {
          id: 'prepare_data_query',
          name: 'Preparar consulta de dados',
          type: 'preparation',
          agent: 'execution-agent',
          dependencies: ['validate_data_access'],
          estimatedTime: 3000
        },
        {
          id: 'execute_data_operation',
          name: 'Executar operação de dados',
          type: 'data',
          agent: 'execution-agent',
          dependencies: ['prepare_data_query'],
          estimatedTime: 8000
        },
        {
          id: 'validate_data_integrity',
          name: 'Validar integridade dos dados',
          type: 'validation',
          agent: 'execution-agent',
          dependencies: ['execute_data_operation'],
          estimatedTime: 2000
        },
        {
          id: 'format_data_response',
          name: 'Formatar resposta de dados',
          type: 'formatting',
          agent: 'execution-agent',
          dependencies: ['validate_data_integrity'],
          estimatedTime: 1000
        }
      ]
    });
    
    // Add templates to plan library
    for (const [name, template] of this.planTemplates.entries()) {
      await this.planLibrary.createPlan({
        name: template.name,
        description: template.description,
        type: 'template',
        steps: template.steps,
        complexity: template.complexity
      });
    }
    
    this.logger.info('Plan templates initialized', {
      templatesCount: this.planTemplates.size,
      templates: Array.from(this.planTemplates.keys())
    });
  }
  
  /**
   * Analisar requisição e criar plano
   */
  async analyzeRequest(requestData) {
    const startTime = Date.now();
    const planId = this.generatePlanId();
    
    this.logger.info('Analyzing request', {
      planId,
      request: requestData.request || requestData.type
    });
    
    this.metrics.requestsAnalyzed++;
    
    try {
      // Classificar tipo de requisição
      const requestType = await this.classifyRequest(requestData);
      
      // Selecionar template apropriado
      const template = await this.selectTemplate(requestType, requestData);
      
      // Criar plano personalizado
      const plan = await this.createPlan(template, requestData, requestType);
      
      // Otimizar plano
      const optimizedPlan = await this.optimizePlan(plan);
      
      // Armazenar plano ativo
      this.activePlans.set(planId, {
        planId,
        plan: optimizedPlan,
        status: 'created',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progress: {
          completed: 0,
          total: optimizedPlan.steps.length,
          currentStep: null
        },
        originalRequest: requestData
      });
      
      // Enviar plano para Execution Agent
      await this.sendPlanToExecution(planId, optimizedPlan, requestData);
      
      // Atualizar métricas
      this.metrics.plansCreated++;
      this.metrics.lastAnalyzedAt = new Date().toISOString();
      
      const analysisTime = Date.now() - startTime;
      this.updateAverageAnalysisTime(analysisTime);
      this.updateAveragePlanComplexity(optimizedPlan.complexity);
      
      this.logger.info('Plan created successfully', {
        planId,
        complexity: optimizedPlan.complexity,
        stepsCount: optimizedPlan.steps.length,
        analysisTime
      });
      
      return {
        planId,
        plan: optimizedPlan,
        analysisTime
      };
      
    } catch (error) {
      this.logger.error('Error analyzing request', error, {
        planId,
        requestData
      });
      
      this.metrics.plansFailed++;
      throw error;
    }
  }
  
  /**
   * Classificar tipo de requisição
   */
  async classifyRequest(requestData) {
    const request = requestData.request || requestData.payload?.request || '';
    const context = requestData.context || {};
    
    // Análise baseada em palavras-chave
    const keywords = {
      data: ['dados', 'data', 'consulta', 'query', 'busca', 'search', 'listar', 'list'],
      security: ['segurança', 'security', 'autenticação', 'auth', 'permissão', 'permission'],
      complex: ['complexo', 'complex', 'múltiplo', 'multiple', 'integração', 'integration'],
      simple: ['simples', 'simple', 'básico', 'basic', 'rápido', 'quick']
    };
    
    const requestLower = request.toLowerCase();
    
    // Verificar palavras-chave
    for (const [type, words] of Object.entries(keywords)) {
      if (words.some(word => requestLower.includes(word))) {
        this.logger.debug('Request classified by keywords', {
          type,
          matchedWords: words.filter(word => requestLower.includes(word))
        });
        return type;
      }
    }
    
    // Análise baseada no contexto
    if (context.requiresAuth || context.securityLevel) {
      return 'security';
    }
    
    if (context.dataSource || context.database) {
      return 'data';
    }
    
    if (context.complexity === 'high' || context.multiStep) {
      return 'complex';
    }
    
    // Análise baseada no tamanho da requisição
    if (request.length > 200) {
      return 'complex';
    }
    
    // Default para simples
    return 'simple';
  }
  
  /**
   * Selecionar template apropriado
   */
  async selectTemplate(requestType, requestData) {
    let templateName;
    
    switch (requestType) {
      case 'data':
        templateName = 'data_operation';
        break;
      case 'complex':
      case 'security':
        templateName = 'complex_request';
        break;
      case 'simple':
      default:
        templateName = 'simple_request';
        break;
    }
    
    const template = this.planTemplates.get(templateName);
    
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }
    
    this.logger.debug('Template selected', {
      requestType,
      templateName,
      complexity: template.complexity
    });
    
    return template;
  }
  
  /**
   * Criar plano personalizado baseado no template
   */
  async createPlan(template, requestData, requestType) {
    const plan = {
      id: this.generatePlanId(),
      name: `Plan for ${requestType} request`,
      description: `Automatically generated plan for ${requestType} request`,
      complexity: template.complexity,
      requestType,
      estimatedDuration: 0,
      steps: [],
      metadata: {
        templateUsed: template.name,
        createdAt: new Date().toISOString(),
        originalRequest: requestData
      }
    };
    
    // Personalizar steps baseado na requisição
    for (const templateStep of template.steps) {
      const step = {
        ...templateStep,
        id: `${plan.id}_${templateStep.id}`,
        planId: plan.id,
        status: 'pending',
        parameters: await this.generateStepParameters(templateStep, requestData),
        createdAt: new Date().toISOString()
      };
      
      plan.steps.push(step);
      plan.estimatedDuration += templateStep.estimatedTime;
    }
    
    return plan;
  }
  
  /**
   * Gerar parâmetros específicos para um step
   */
  async generateStepParameters(templateStep, requestData) {
    const parameters = {
      originalRequest: requestData,
      stepType: templateStep.type,
      agent: templateStep.agent
    };
    
    // Parâmetros específicos por tipo de step
    switch (templateStep.type) {
      case 'validation':
        parameters.validationRules = await this.getValidationRules(requestData);
        break;
      case 'security':
        parameters.securityChecks = await this.getSecurityChecks(requestData);
        break;
      case 'data':
        parameters.dataSource = requestData.context?.dataSource || 'default';
        parameters.queryType = requestData.context?.queryType || 'read';
        break;
      case 'processing':
        parameters.processingType = requestData.context?.processingType || 'standard';
        break;
    }
    
    return parameters;
  }
  
  /**
   * Obter regras de validação
   */
  async getValidationRules(requestData) {
    return {
      required: ['request'],
      format: 'string',
      maxLength: 10000,
      allowedTypes: ['user_request', 'system_request']
    };
  }
  
  /**
   * Obter verificações de segurança
   */
  async getSecurityChecks(requestData) {
    return {
      authentication: true,
      authorization: true,
      inputSanitization: true,
      rateLimiting: true
    };
  }
  
  /**
   * Otimizar plano
   */
  async optimizePlan(plan) {
    const optimizedPlan = { ...plan };
    
    // Otimizar ordem de execução baseado em dependências
    optimizedPlan.steps = await this.optimizeStepOrder(plan.steps);
    
    // Identificar steps que podem ser executados em paralelo
    optimizedPlan.parallelGroups = await this.identifyParallelSteps(optimizedPlan.steps);
    
    // Recalcular duração estimada considerando paralelismo
    optimizedPlan.estimatedDuration = await this.calculateOptimizedDuration(
      optimizedPlan.steps,
      optimizedPlan.parallelGroups
    );
    
    this.logger.debug('Plan optimized', {
      planId: plan.id,
      originalDuration: plan.estimatedDuration,
      optimizedDuration: optimizedPlan.estimatedDuration,
      parallelGroups: optimizedPlan.parallelGroups.length
    });
    
    return optimizedPlan;
  }
  
  /**
   * Otimizar ordem dos steps
   */
  async optimizeStepOrder(steps) {
    // Implementar algoritmo de ordenação topológica
    const ordered = [];
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (step) => {
      if (visiting.has(step.id)) {
        throw new Error(`Circular dependency detected: ${step.id}`);
      }
      
      if (visited.has(step.id)) {
        return;
      }
      
      visiting.add(step.id);
      
      // Visitar dependências primeiro
      for (const depId of step.dependencies) {
        const depStep = steps.find(s => s.id.endsWith(depId));
        if (depStep) {
          visit(depStep);
        }
      }
      
      visiting.delete(step.id);
      visited.add(step.id);
      ordered.push(step);
    };
    
    // Visitar todos os steps
    for (const step of steps) {
      if (!visited.has(step.id)) {
        visit(step);
      }
    }
    
    return ordered;
  }
  
  /**
   * Identificar steps que podem ser executados em paralelo
   */
  async identifyParallelSteps(steps) {
    const groups = [];
    const processed = new Set();
    
    for (const step of steps) {
      if (processed.has(step.id)) {
        continue;
      }
      
      const parallelSteps = [step];
      processed.add(step.id);
      
      // Encontrar outros steps que podem executar em paralelo
      for (const otherStep of steps) {
        if (processed.has(otherStep.id)) {
          continue;
        }
        
        // Verificar se não há dependências entre os steps
        const canRunInParallel = !this.hasDependency(step, otherStep, steps) &&
                                !this.hasDependency(otherStep, step, steps);
        
        if (canRunInParallel) {
          parallelSteps.push(otherStep);
          processed.add(otherStep.id);
        }
      }
      
      if (parallelSteps.length > 1) {
        groups.push({
          id: `group_${groups.length}`,
          steps: parallelSteps.map(s => s.id),
          estimatedDuration: Math.max(...parallelSteps.map(s => s.estimatedTime))
        });
      }
    }
    
    return groups;
  }
  
  /**
   * Verificar se há dependência entre steps
   */
  hasDependency(step1, step2, allSteps) {
    const visited = new Set();
    
    const checkDependency = (currentStep, targetStep) => {
      if (visited.has(currentStep.id)) {
        return false;
      }
      
      visited.add(currentStep.id);
      
      if (currentStep.id === targetStep.id) {
        return true;
      }
      
      for (const depId of currentStep.dependencies) {
        const depStep = allSteps.find(s => s.id.endsWith(depId));
        if (depStep && checkDependency(depStep, targetStep)) {
          return true;
        }
      }
      
      return false;
    };
    
    return checkDependency(step1, step2);
  }
  
  /**
   * Calcular duração otimizada considerando paralelismo
   */
  async calculateOptimizedDuration(steps, parallelGroups) {
    let totalDuration = 0;
    const processedSteps = new Set();
    
    // Somar duração dos grupos paralelos
    for (const group of parallelGroups) {
      totalDuration += group.estimatedDuration;
      group.steps.forEach(stepId => processedSteps.add(stepId));
    }
    
    // Somar duração dos steps sequenciais
    for (const step of steps) {
      if (!processedSteps.has(step.id)) {
        totalDuration += step.estimatedTime;
      }
    }
    
    return totalDuration;
  }
  
  /**
   * Enviar plano para Execution Agent
   */
  async sendPlanToExecution(planId, plan, originalRequest) {
    const executionMessage = {
      type: 'execute_plan',
      planId,
      plan,
      originalRequest,
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage(
      config.aws.sqs.queues.core.execution,
      executionMessage
    );
    
    this.logger.info('Plan sent to execution', {
      planId,
      complexity: plan.complexity,
      stepsCount: plan.steps.length
    });
  }
  
  /**
   * Gerar ID único para plano
   */
  generatePlanId() {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Atualizar tempo médio de análise
   */
  updateAverageAnalysisTime(newTime) {
    if (this.metrics.averageAnalysisTime === 0) {
      this.metrics.averageAnalysisTime = newTime;
    } else {
      this.metrics.averageAnalysisTime = 
        (this.metrics.averageAnalysisTime + newTime) / 2;
    }
  }
  
  /**
   * Atualizar complexidade média dos planos
   */
  updateAveragePlanComplexity(complexity) {
    const complexityValues = { low: 1, medium: 2, high: 3 };
    const newValue = complexityValues[complexity] || 1;
    
    if (this.metrics.averagePlanComplexity === 0) {
      this.metrics.averagePlanComplexity = newValue;
    } else {
      this.metrics.averagePlanComplexity = 
        (this.metrics.averagePlanComplexity + newValue) / 2;
    }
  }
  
  /**
   * Inicializar serviço SQS
   */
  async initializeSQS() {
    try {
      this.sqsService = new SQSService(this.logger);
      await this.sqsService.initialize();
      
      // Começar a escutar mensagens
      await this.sqsService.startPolling(
        config.aws.sqs.queues.core.planning,
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
      
      // Convert SQS message to belief
      await this.beliefManager.addBelief({
        content: 'sqs_message',
        value: messageData,
        confidence: 0.9,
        source: 'sqs',
        type: messageData.type || 'unknown',
        context: {
          messageId: message.MessageId,
          timestamp: new Date().toISOString()
        }
      });
      
      // Process specific message types for legacy compatibility
      switch (messageData.type) {
        case 'analyze_request':
          await this.analyzeRequest(messageData);
          break;
        case 'plan_update':
          await this.handlePlanUpdate(messageData);
          break;
        case 'planning_request':
          await this.handlePlanningRequest(messageData);
          break;
        case 'plan_execution_result':
          await this.handlePlanExecutionResult(messageData);
          break;
        case 'system_event':
          await this.handleSystemEvent(messageData);
          break;
        default:
          this.logger.warn('Unknown message type', {
            type: messageData.type,
            messageId: message.MessageId
          });
      }
      
      // Trigger BDI cycle to process the new belief
      await this.bdiEngine.executeCycle();
      
      // Deletar mensagem da fila após processamento bem-sucedido
      await this.sqsService.deleteMessage(
        config.aws.sqs.queues.core.planning,
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
   * Lidar com solicitação de planejamento (legacy)
   */
  async handlePlanningRequest(data) {
    try {
      this.logger.info('Handling planning request', { data });
      
      // Convert to desire
      await this.desireManager.addDesire({
        goal: data.goal || 'process_request',
        description: `Planning request: ${data.description || 'Unknown request'}`,
        importance: data.priority || 0.7,
        urgency: 0.8,
        feasibility: 0.8,
        cost: 0.3,
        type: 'request',
        context: data
      });
      
      // Execute BDI cycle
      const result = await this.bdiEngine.executeCycle();
      
      // Enviar resultado para fila de saída
      if (config.agents.planning.outputQueue) {
        await this.sqsService.sendMessage(
          config.agents.planning.outputQueue,
          {
            type: 'planning_result',
            requestId: data.requestId,
            result,
            timestamp: new Date().toISOString()
          }
        );
      }
      
    } catch (error) {
      this.logger.error('Error handling planning request', {
        error: error.message,
        data
      });
      
      // Enviar erro para DLQ
      if (config.agents.planning.dlqQueue) {
        await this.sqsService.sendMessage(
          config.agents.planning.dlqQueue,
          {
            type: 'planning_error',
            requestId: data.requestId,
            error: error.message,
            originalData: data,
            timestamp: new Date().toISOString()
          }
        );
      }
    }
  }
  
  /**
   * Lidar com resultado de execução de plano
   */
  async handlePlanExecutionResult(data) {
    try {
      this.logger.info('Handling plan execution result', { data });
      
      const { planId, success, result, error } = data;
      
      // Update belief about plan execution
      await this.beliefManager.addBelief({
        content: 'plan_execution_result',
        value: {
          planId,
          success,
          result,
          error
        },
        confidence: 1.0,
        source: 'execution',
        type: 'result'
      });
      
      // Record execution in plan library
      await this.planLibrary.recordExecution(planId, {
        success,
        result,
        error,
        executionTime: data.executionTime,
        timestamp: new Date().toISOString()
      });
      
      // Update active plans
      if (this.activePlans.has(planId)) {
        const plan = this.activePlans.get(planId);
        
        if (success) {
          plan.status = 'completed';
          plan.result = result;
        } else {
          plan.status = 'failed';
          plan.error = error;
        }
        
        plan.updatedAt = new Date().toISOString();
        plan.progress = 100;
        
        this.activePlans.set(planId, plan);
      }
      
      // Trigger BDI cycle to process the result
      await this.bdiEngine.executeCycle();
      
    } catch (error) {
      this.logger.error('Error handling plan execution result', {
        error: error.message,
        data
      });
    }
  }
  
  /**
   * Lidar com evento do sistema
   */
  async handleSystemEvent(data) {
    try {
      this.logger.info('Handling system event', { data });
      
      // Convert system event to belief
      await this.beliefManager.addBelief({
        content: 'system_event',
        value: data,
        confidence: 0.9,
        source: 'system',
        type: data.eventType || 'unknown',
        context: {
          timestamp: new Date().toISOString(),
          severity: data.severity || 'info'
        }
      });
      
      // Process specific event types
      switch (data.eventType) {
        case 'agent_status_change':
          await this.handleAgentStatusChange(data);
          break;
        case 'resource_availability':
          await this.handleResourceAvailability(data);
          break;
        case 'system_alert':
          await this.handleSystemAlert(data);
          break;
        default:
          this.logger.debug('Unhandled system event type', {
            eventType: data.eventType
          });
      }
      
      // Trigger BDI cycle to process the event
      await this.bdiEngine.executeCycle();
      
    } catch (error) {
      this.logger.error('Error handling system event', {
        error: error.message,
        data
      });
    }
  }
  
  /**
   * Handle agent status change
   */
  async handleAgentStatusChange(data) {
    this.logger.info('Agent status changed', data);
    // Implementation for agent status change
  }
  
  /**
   * Handle resource availability
   */
  async handleResourceAvailability(data) {
    this.logger.info('Resource availability changed', data);
    // Implementation for resource availability
  }
  
  /**
   * Handle system alert
   */
  async handleSystemAlert(data) {
    this.logger.info('System alert received', data);
    // Implementation for system alert
  }
  
  /**
   * Lidar com atualização de plano
   */
  async handlePlanUpdate(messageData) {
    const { planId, status, progress, error } = messageData;
    
    const planData = this.activePlans.get(planId);
    if (!planData) {
      this.logger.warn('Plan not found for update', { planId });
      return;
    }
    
    // Atualizar status do plano
    planData.status = status;
    planData.updatedAt = new Date().toISOString();
    
    if (progress) {
      planData.progress = { ...planData.progress, ...progress };
    }
    
    if (error) {
      planData.error = error;
    }
    
    this.activePlans.set(planId, planData);
    
    this.logger.info('Plan updated', {
      planId,
      status,
      progress: planData.progress
    });
    
    // Remover planos completados após um tempo
    if (status === 'completed' || status === 'failed') {
      setTimeout(() => {
        this.activePlans.delete(planId);
        this.logger.debug('Plan removed from active plans', { planId });
      }, 600000); // 10 minutos
    }
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      this.logger.info('Starting Planning Agent...');
      
      // Inicializar SQS
      await this.initializeSQS();
      
      // Iniciar servidor HTTP
      const port = config.agents.planning.port || 3003;
      this.server = this.app.listen(port, () => {
        this.isRunning = true;
        this.logger.info(`Planning Agent started on port ${port}`);
      });
      
      // Configurar health check
      this.setupHealthCheck();
      
    } catch (error) {
      this.logger.error('Failed to start Planning Agent', error);
      throw error;
    }
  }
  
  /**
   * Parar o agente
   */
  async stop() {
    try {
      this.logger.info('Stopping Planning Agent...');
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
      
      this.logger.info('Planning Agent stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Planning Agent', error);
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
          metrics: this.metrics,
          activePlans: this.activePlans.size
        });
      }
    }, config.agents.healthCheckInterval);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const agent = new PlanningAgent();
  
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
    console.error('Failed to start Planning Agent:', error);
    process.exit(1);
  });
}

module.exports = PlanningAgent;