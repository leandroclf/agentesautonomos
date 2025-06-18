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
const config = require('../config');

class PlanningAgent {
  constructor() {
    this.agentId = 'planning-agent';
    this.logger = new Logger(this.agentId);
    this.app = express();
    this.sqsService = null;
    this.isRunning = false;
    this.server = null;
    
    // Métricas
    this.metrics = {
      requestsAnalyzed: 0,
      plansCreated: 0,
      plansFailed: 0,
      averageAnalysisTime: 0,
      averagePlanComplexity: 0,
      lastAnalyzedAt: null,
      startedAt: new Date().toISOString()
    };
    
    // Cache de planos ativos
    this.activePlans = new Map();
    
    // Templates de planos
    this.planTemplates = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.initializePlanTemplates();
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
        activePlans: this.activePlans.size
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Métricas
    this.app.get('/metrics', (req, res) => {
      res.json({
        agent: this.agentId,
        metrics: this.metrics,
        activePlans: this.activePlans.size,
        planTemplates: this.planTemplates.size,
        timestamp: new Date().toISOString()
      });
    });
    
    // Endpoint para análise direta
    this.app.post('/analyze', async (req, res) => {
      try {
        const request = req.body;
        const result = await this.analyzeRequest(request);
        
        res.json({
          success: true,
          planId: result.planId,
          plan: result.plan,
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
    
    // Status de plano específico
    this.app.get('/plans/:planId', (req, res) => {
      const { planId } = req.params;
      const plan = this.activePlans.get(planId);
      
      if (!plan) {
        return res.status(404).json({
          error: 'Plan not found',
          planId
        });
      }
      
      res.json({
        planId,
        plan: plan.plan,
        status: plan.status,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        progress: plan.progress
      });
    });
    
    // Listar planos ativos
    this.app.get('/plans', (req, res) => {
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
      const templates = Array.from(this.planTemplates.entries()).map(([name, template]) => ({
        name,
        description: template.description,
        complexity: template.complexity,
        stepsCount: template.steps.length
      }));
      
      res.json({
        templates,
        total: templates.length,
        timestamp: new Date().toISOString()
      });
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
  initializePlanTemplates() {
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
      this.sqsService = new SQSService();
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
      
      switch (messageData.type) {
        case 'analyze_request':
          await this.analyzeRequest(messageData);
          break;
        case 'plan_update':
          await this.handlePlanUpdate(messageData);
          break;
        default:
          this.logger.warn('Unknown message type', {
            type: messageData.type,
            messageId: message.MessageId
          });
      }
      
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