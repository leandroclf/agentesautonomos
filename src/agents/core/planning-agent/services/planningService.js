const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const config = require('../../../../config');

class PlanningService extends EventEmitter {
  constructor(sqsService, logger, metrics) {
    super();
    this.sqsService = sqsService;
    this.logger = logger;
    this.metrics = metrics;
    
    // Estado interno
    this.activePlans = new Map();
    this.planTemplates = new Map();
    this.planHistory = new Map();
    this.analysisCache = new Map();
    this.optimizationRules = new Map();
    
    // Configurações
    this.config = {
      analysis: {
        maxComplexity: config.planning.analysis?.maxComplexity ?? 10,
        timeoutMs: config.planning.analysis?.timeoutMs ?? 30000,
        cacheSize: config.planning.analysis?.cacheSize ?? 1000,
        cacheTtl: config.planning.analysis?.cacheTtl ?? 300000 // 5 minutes
      },
      optimization: {
        enabled: config.planning.optimization?.enabled ?? true,
        maxIterations: config.planning.optimization?.maxIterations ?? 5,
        parallelSteps: config.planning.optimization?.parallelSteps ?? true,
        resourceOptimization: config.planning.optimization?.resourceOptimization ?? true
      },
      execution: {
        executionAgentUrl: config.planning.execution?.executionAgentUrl ?? 'http://localhost:3004',
        timeout: config.planning.execution?.timeout ?? 10000,
        retryAttempts: config.planning.execution?.retryAttempts ?? 3
      },
      templates: {
        directory: config.planning.templates?.directory ?? './templates',
        autoLoad: config.planning.templates?.autoLoad ?? true,
        validation: config.planning.templates?.validation ?? true
      },
      cleanup: {
        historyRetention: config.planning.cleanup?.historyRetention ?? 86400000, // 24 hours
        cleanupInterval: config.planning.cleanup?.cleanupInterval ?? 3600000 // 1 hour
      }
    };
    
    // Inicializar cliente de execução
    this.setupExecutionClient();
    
    // Carregar templates e regras
    this.loadPlanTemplates();
    this.loadOptimizationRules();
  }
  
  async initialize() {
    try {
      this.logger.info('Initializing Planning Service');
      
      // Configurar cleanup automático
      this.setupAutomaticCleanup();
      
      this.logger.info('Planning Service initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Planning Service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  setupExecutionClient() {
    const axios = require('axios');
    
    this.executionClient = axios.create({
      baseURL: this.config.execution.executionAgentUrl,
      timeout: this.config.execution.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'planning-agent/1.0.0'
      }
    });
  }
  
  loadPlanTemplates() {
    // Templates básicos para diferentes tipos de eventos
    const basicTemplates = {
      'user_action': {
        id: 'user_action_basic',
        name: 'Basic User Action',
        steps: [
          {
            id: 'validate_input',
            type: 'validation',
            description: 'Validate user input',
            dependencies: [],
            estimatedDuration: 1000,
            resources: ['validator']
          },
          {
            id: 'process_action',
            type: 'processing',
            description: 'Process user action',
            dependencies: ['validate_input'],
            estimatedDuration: 5000,
            resources: ['processor']
          },
          {
            id: 'update_state',
            type: 'state_update',
            description: 'Update application state',
            dependencies: ['process_action'],
            estimatedDuration: 2000,
            resources: ['database']
          },
          {
            id: 'send_response',
            type: 'response',
            description: 'Send response to user',
            dependencies: ['update_state'],
            estimatedDuration: 1000,
            resources: ['notifier']
          }
        ],
        complexity: 3,
        estimatedTotalDuration: 9000
      },
      
      'workflow_trigger': {
        id: 'workflow_basic',
        name: 'Basic Workflow',
        steps: [
          {
            id: 'analyze_trigger',
            type: 'analysis',
            description: 'Analyze workflow trigger',
            dependencies: [],
            estimatedDuration: 2000,
            resources: ['analyzer']
          },
          {
            id: 'prepare_workflow',
            type: 'preparation',
            description: 'Prepare workflow execution',
            dependencies: ['analyze_trigger'],
            estimatedDuration: 3000,
            resources: ['workflow_engine']
          },
          {
            id: 'execute_workflow',
            type: 'execution',
            description: 'Execute workflow steps',
            dependencies: ['prepare_workflow'],
            estimatedDuration: 15000,
            resources: ['workflow_engine', 'executor']
          },
          {
            id: 'finalize_workflow',
            type: 'finalization',
            description: 'Finalize workflow execution',
            dependencies: ['execute_workflow'],
            estimatedDuration: 2000,
            resources: ['workflow_engine']
          }
        ],
        complexity: 5,
        estimatedTotalDuration: 22000
      },
      
      'data_update': {
        id: 'data_update_basic',
        name: 'Basic Data Update',
        steps: [
          {
            id: 'validate_data',
            type: 'validation',
            description: 'Validate data update',
            dependencies: [],
            estimatedDuration: 1500,
            resources: ['validator']
          },
          {
            id: 'backup_current',
            type: 'backup',
            description: 'Backup current data',
            dependencies: ['validate_data'],
            estimatedDuration: 3000,
            resources: ['database', 'backup_service']
          },
          {
            id: 'apply_update',
            type: 'update',
            description: 'Apply data update',
            dependencies: ['backup_current'],
            estimatedDuration: 5000,
            resources: ['database']
          },
          {
            id: 'verify_update',
            type: 'verification',
            description: 'Verify update success',
            dependencies: ['apply_update'],
            estimatedDuration: 2000,
            resources: ['validator']
          }
        ],
        complexity: 4,
        estimatedTotalDuration: 11500
      }
    };
    
    // Carregar templates básicos
    for (const [type, template] of Object.entries(basicTemplates)) {
      this.planTemplates.set(type, template);
    }
    
    this.logger.info('Plan templates loaded', {
      templateCount: this.planTemplates.size
    });
  }
  
  loadOptimizationRules() {
    // Regras de otimização
    const rules = {
      'parallel_independent': {
        id: 'parallel_independent',
        description: 'Execute independent steps in parallel',
        condition: (steps) => {
          return steps.filter(step => step.dependencies.length === 0).length > 1;
        },
        apply: (plan) => {
          const independentSteps = plan.steps.filter(step => step.dependencies.length === 0);
          if (independentSteps.length > 1) {
            independentSteps.forEach(step => {
              step.parallel = true;
              step.parallelGroup = 'independent';
            });
          }
          return plan;
        }
      },
      
      'resource_optimization': {
        id: 'resource_optimization',
        description: 'Optimize resource usage',
        condition: (steps) => {
          const resourceUsage = new Map();
          steps.forEach(step => {
            step.resources?.forEach(resource => {
              resourceUsage.set(resource, (resourceUsage.get(resource) || 0) + 1);
            });
          });
          return Array.from(resourceUsage.values()).some(count => count > 2);
        },
        apply: (plan) => {
          // Agrupar steps que usam os mesmos recursos
          const resourceGroups = new Map();
          plan.steps.forEach(step => {
            step.resources?.forEach(resource => {
              if (!resourceGroups.has(resource)) {
                resourceGroups.set(resource, []);
              }
              resourceGroups.get(resource).push(step.id);
            });
          });
          
          // Adicionar informações de otimização
          plan.resourceOptimization = {
            groups: Object.fromEntries(resourceGroups),
            recommendations: ['Consider resource pooling', 'Monitor resource contention']
          };
          
          return plan;
        }
      },
      
      'dependency_optimization': {
        id: 'dependency_optimization',
        description: 'Optimize dependency chains',
        condition: (steps) => {
          return this.hasCircularDependencies(steps) || this.hasLongDependencyChains(steps);
        },
        apply: (plan) => {
          // Detectar e resolver dependências circulares
          const circularDeps = this.detectCircularDependencies(plan.steps);
          if (circularDeps.length > 0) {
            plan.warnings = plan.warnings || [];
            plan.warnings.push(`Circular dependencies detected: ${circularDeps.join(', ')}`);
          }
          
          // Otimizar cadeias longas
          plan.dependencyOptimization = {
            maxChainLength: this.getMaxDependencyChainLength(plan.steps),
            parallelizableSteps: this.findParallelizableSteps(plan.steps)
          };
          
          return plan;
        }
      }
    };
    
    // Carregar regras
    for (const [id, rule] of Object.entries(rules)) {
      this.optimizationRules.set(id, rule);
    }
    
    this.logger.info('Optimization rules loaded', {
      ruleCount: this.optimizationRules.size
    });
  }
  
  async analyzeRequest(req, res) {
    const startTime = Date.now();
    
    try {
      const { eventId, eventType, data, priority = 'medium' } = req.body;
      
      this.logger.info('Analyzing planning request', {
        eventId,
        eventType,
        priority
      });
      
      this.metrics.analysisRequests.inc({ event_type: eventType });
      
      // Validar entrada
      const validationResult = this.validateAnalysisRequest(req.body);
      if (!validationResult.isValid) {
        this.metrics.analysisErrors.inc({ error_type: 'validation' });
        return res.status(400).json({
          error: 'Invalid analysis request',
          details: validationResult.errors
        });
      }
      
      // Verificar cache
      const cacheKey = this.generateCacheKey(eventType, data);
      const cachedResult = this.analysisCache.get(cacheKey);
      
      if (cachedResult && Date.now() - cachedResult.timestamp < this.config.analysis.cacheTtl) {
        this.logger.debug('Using cached analysis result', { eventId, cacheKey });
        this.metrics.analysisCacheHits.inc();
        
        return res.json({
          ...cachedResult.result,
          cached: true,
          cacheAge: Date.now() - cachedResult.timestamp
        });
      }
      
      this.metrics.analysisCacheMisses.inc();
      
      // Realizar análise
      const analysisResult = await this.performAnalysis({
        eventId,
        eventType,
        data,
        priority
      });
      
      // Criar plano
      const plan = await this.createPlan(analysisResult);
      
      // Otimizar plano se habilitado
      let optimizedPlan = plan;
      if (this.config.optimization.enabled) {
        optimizedPlan = await this.optimizePlan(plan);
      }
      
      // Armazenar plano ativo
      this.activePlans.set(optimizedPlan.id, {
        plan: optimizedPlan,
        status: 'created',
        createdAt: new Date(),
        eventId,
        priority
      });
      
      // Cache do resultado
      this.analysisCache.set(cacheKey, {
        result: {
          planId: optimizedPlan.id,
          complexity: optimizedPlan.complexity,
          estimatedDuration: optimizedPlan.estimatedTotalDuration,
          stepCount: optimizedPlan.steps.length
        },
        timestamp: Date.now()
      });
      
      const duration = Date.now() - startTime;
      this.metrics.analysisTime.observe({ event_type: eventType }, duration / 1000);
      this.metrics.analysisSuccess.inc({ event_type: eventType });
      
      this.logger.info('Analysis completed successfully', {
        eventId,
        planId: optimizedPlan.id,
        complexity: optimizedPlan.complexity,
        duration
      });
      
      res.json({
        planId: optimizedPlan.id,
        complexity: optimizedPlan.complexity,
        estimatedDuration: optimizedPlan.estimatedTotalDuration,
        stepCount: optimizedPlan.steps.length,
        priority,
        optimized: this.config.optimization.enabled,
        analysisTime: duration
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Analysis failed', {
        eventId: req.body?.eventId,
        error: error.message,
        duration
      });
      
      this.metrics.analysisErrors.inc({ error_type: error.name || 'unknown' });
      this.metrics.analysisTime.observe(
        { event_type: req.body?.eventType || 'unknown' },
        duration / 1000
      );
      
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message,
        eventId: req.body?.eventId
      });
    }
  }
  
  validateAnalysisRequest(request) {
    const errors = [];
    
    if (!request.eventId) {
      errors.push('eventId is required');
    }
    
    if (!request.eventType) {
      errors.push('eventType is required');
    }
    
    if (!request.data) {
      errors.push('data is required');
    }
    
    if (request.priority && !['low', 'medium', 'high', 'critical'].includes(request.priority)) {
      errors.push('Invalid priority level');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  generateCacheKey(eventType, data) {
    const crypto = require('crypto');
    const content = JSON.stringify({ eventType, data });
    return crypto.createHash('md5').update(content).digest('hex');
  }
  
  async performAnalysis(request) {
    const { eventId, eventType, data, priority } = request;
    
    // Determinar complexidade baseada no tipo de evento e dados
    const complexity = this.calculateComplexity(eventType, data);
    
    if (complexity > this.config.analysis.maxComplexity) {
      throw new Error(`Event complexity (${complexity}) exceeds maximum allowed (${this.config.analysis.maxComplexity})`);
    }
    
    // Analisar dependências
    const dependencies = this.analyzeDependencies(eventType, data);
    
    // Estimar recursos necessários
    const resources = this.estimateResources(eventType, data, complexity);
    
    // Determinar template base
    const baseTemplate = this.selectBaseTemplate(eventType, complexity);
    
    return {
      eventId,
      eventType,
      data,
      priority,
      complexity,
      dependencies,
      resources,
      baseTemplate,
      analysisTimestamp: new Date().toISOString()
    };
  }
  
  calculateComplexity(eventType, data) {
    let complexity = 1;
    
    // Complexidade base por tipo
    const typeComplexity = {
      'user_action': 2,
      'workflow_trigger': 4,
      'data_update': 3,
      'system_event': 2,
      'integration_event': 5,
      'monitoring_alert': 1
    };
    
    complexity += typeComplexity[eventType] || 2;
    
    // Complexidade baseada nos dados
    if (data) {
      // Tamanho dos dados
      const dataSize = JSON.stringify(data).length;
      if (dataSize > 10000) complexity += 2;
      else if (dataSize > 1000) complexity += 1;
      
      // Número de campos
      const fieldCount = Object.keys(data).length;
      if (fieldCount > 20) complexity += 2;
      else if (fieldCount > 10) complexity += 1;
      
      // Presença de arrays ou objetos aninhados
      if (this.hasNestedStructures(data)) complexity += 1;
      
      // Operações especiais
      if (data.batch) complexity += 2;
      if (data.async) complexity += 1;
      if (data.validation) complexity += 1;
    }
    
    return Math.min(complexity, this.config.analysis.maxComplexity);
  }
  
  hasNestedStructures(obj) {
    for (const value of Object.values(obj)) {
      if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        return true;
      }
    }
    return false;
  }
  
  analyzeDependencies(eventType, data) {
    const dependencies = {
      internal: [],
      external: [],
      resources: []
    };
    
    // Dependências baseadas no tipo
    switch (eventType) {
      case 'user_action':
        dependencies.internal.push('authentication', 'authorization');
        dependencies.resources.push('database', 'cache');
        break;
        
      case 'workflow_trigger':
        dependencies.internal.push('workflow_engine', 'state_manager');
        dependencies.external.push('external_apis');
        dependencies.resources.push('database', 'queue', 'storage');
        break;
        
      case 'data_update':
        dependencies.internal.push('validation_service', 'backup_service');
        dependencies.resources.push('database', 'backup_storage');
        break;
        
      case 'integration_event':
        dependencies.external.push('third_party_apis', 'webhooks');
        dependencies.resources.push('network', 'cache');
        break;
    }
    
    // Dependências baseadas nos dados
    if (data) {
      if (data.userId) dependencies.internal.push('user_service');
      if (data.fileId) dependencies.resources.push('file_storage');
      if (data.notification) dependencies.external.push('notification_service');
      if (data.email) dependencies.external.push('email_service');
    }
    
    return dependencies;
  }
  
  estimateResources(eventType, data, complexity) {
    const resources = {
      cpu: 'low',
      memory: 'low',
      network: 'low',
      storage: 'low',
      duration: 5000 // ms
    };
    
    // Ajustar baseado na complexidade
    if (complexity >= 7) {
      resources.cpu = 'high';
      resources.memory = 'high';
      resources.duration = 30000;
    } else if (complexity >= 4) {
      resources.cpu = 'medium';
      resources.memory = 'medium';
      resources.duration = 15000;
    }
    
    // Ajustes específicos por tipo
    switch (eventType) {
      case 'workflow_trigger':
        resources.cpu = 'high';
        resources.duration = Math.max(resources.duration, 20000);
        break;
        
      case 'data_update':
        resources.storage = 'medium';
        resources.duration = Math.max(resources.duration, 10000);
        break;
        
      case 'integration_event':
        resources.network = 'high';
        resources.duration = Math.max(resources.duration, 15000);
        break;
    }
    
    return resources;
  }
  
  selectBaseTemplate(eventType, complexity) {
    // Selecionar template baseado no tipo e complexidade
    let template = this.planTemplates.get(eventType);
    
    if (!template) {
      // Template padrão
      template = this.planTemplates.get('user_action');
    }
    
    // Ajustar template baseado na complexidade
    if (complexity >= 7) {
      template = this.enhanceTemplateForHighComplexity(template);
    }
    
    return template;
  }
  
  enhanceTemplateForHighComplexity(template) {
    // Criar cópia do template
    const enhanced = JSON.parse(JSON.stringify(template));
    
    // Adicionar steps de monitoramento e validação
    enhanced.steps.unshift({
      id: 'pre_validation',
      type: 'validation',
      description: 'Pre-execution validation',
      dependencies: [],
      estimatedDuration: 2000,
      resources: ['validator']
    });
    
    enhanced.steps.push({
      id: 'post_validation',
      type: 'validation',
      description: 'Post-execution validation',
      dependencies: [enhanced.steps[enhanced.steps.length - 1].id],
      estimatedDuration: 2000,
      resources: ['validator']
    });
    
    // Atualizar dependências
    enhanced.steps.forEach((step, index) => {
      if (index > 0 && index < enhanced.steps.length - 1) {
        if (step.dependencies.length === 0) {
          step.dependencies = ['pre_validation'];
        }
      }
    });
    
    // Atualizar estimativas
    enhanced.complexity += 2;
    enhanced.estimatedTotalDuration += 4000;
    
    return enhanced;
  }
  
  async createPlan(analysisResult) {
    const planId = uuidv4();
    const { eventId, eventType, baseTemplate, complexity, resources } = analysisResult;
    
    // Criar plano baseado no template
    const plan = {
      id: planId,
      eventId,
      eventType,
      status: 'created',
      complexity,
      priority: analysisResult.priority,
      createdAt: new Date().toISOString(),
      estimatedTotalDuration: baseTemplate.estimatedTotalDuration,
      steps: JSON.parse(JSON.stringify(baseTemplate.steps)), // Deep copy
      resources: resources,
      dependencies: analysisResult.dependencies,
      metadata: {
        templateId: baseTemplate.id,
        templateName: baseTemplate.name,
        analysisTimestamp: analysisResult.analysisTimestamp
      }
    };
    
    // Personalizar steps baseado nos dados específicos
    plan.steps = this.customizeSteps(plan.steps, analysisResult.data);
    
    this.logger.debug('Plan created', {
      planId,
      eventId,
      stepCount: plan.steps.length,
      complexity
    });
    
    return plan;
  }
  
  customizeSteps(steps, eventData) {
    // Personalizar steps baseado nos dados do evento
    return steps.map(step => {
      const customizedStep = { ...step };
      
      // Adicionar dados específicos do evento
      customizedStep.eventData = eventData;
      
      // Ajustar duração baseada nos dados
      if (eventData && typeof eventData === 'object') {
        const dataSize = JSON.stringify(eventData).length;
        if (dataSize > 10000) {
          customizedStep.estimatedDuration *= 1.5;
        } else if (dataSize > 1000) {
          customizedStep.estimatedDuration *= 1.2;
        }
      }
      
      // Adicionar validações específicas
      if (step.type === 'validation' && eventData) {
        customizedStep.validationRules = this.generateValidationRules(eventData);
      }
      
      return customizedStep;
    });
  }
  
  generateValidationRules(eventData) {
    const rules = [];
    
    if (eventData.userId) {
      rules.push('validate_user_exists');
      rules.push('validate_user_permissions');
    }
    
    if (eventData.fileId) {
      rules.push('validate_file_exists');
      rules.push('validate_file_access');
    }
    
    if (eventData.email) {
      rules.push('validate_email_format');
    }
    
    return rules;
  }
  
  async optimizePlan(plan) {
    if (!this.config.optimization.enabled) {
      return plan;
    }
    
    this.logger.debug('Optimizing plan', { planId: plan.id });
    
    let optimizedPlan = JSON.parse(JSON.stringify(plan)); // Deep copy
    let iterations = 0;
    
    while (iterations < this.config.optimization.maxIterations) {
      let hasChanges = false;
      
      // Aplicar regras de otimização
      for (const [ruleId, rule] of this.optimizationRules.entries()) {
        if (rule.condition(optimizedPlan.steps)) {
          this.logger.debug('Applying optimization rule', {
            planId: plan.id,
            ruleId,
            iteration: iterations
          });
          
          const previousPlan = JSON.stringify(optimizedPlan);
          optimizedPlan = rule.apply(optimizedPlan);
          
          if (JSON.stringify(optimizedPlan) !== previousPlan) {
            hasChanges = true;
            this.metrics.optimizationRulesApplied.inc({ rule_id: ruleId });
          }
        }
      }
      
      if (!hasChanges) {
        break;
      }
      
      iterations++;
    }
    
    // Recalcular estimativas após otimização
    optimizedPlan = this.recalculateEstimates(optimizedPlan);
    
    // Adicionar metadados de otimização
    optimizedPlan.optimization = {
      applied: true,
      iterations,
      rulesApplied: this.getAppliedRules(optimizedPlan),
      originalDuration: plan.estimatedTotalDuration,
      optimizedDuration: optimizedPlan.estimatedTotalDuration,
      improvement: plan.estimatedTotalDuration - optimizedPlan.estimatedTotalDuration
    };
    
    this.metrics.planOptimizations.inc();
    this.metrics.optimizationIterations.observe(iterations);
    
    this.logger.info('Plan optimization completed', {
      planId: plan.id,
      iterations,
      originalDuration: plan.estimatedTotalDuration,
      optimizedDuration: optimizedPlan.estimatedTotalDuration,
      improvement: optimizedPlan.optimization.improvement
    });
    
    return optimizedPlan;
  }
  
  recalculateEstimates(plan) {
    // Recalcular duração total considerando paralelização
    const parallelGroups = new Map();
    let sequentialDuration = 0;
    
    plan.steps.forEach(step => {
      if (step.parallel && step.parallelGroup) {
        if (!parallelGroups.has(step.parallelGroup)) {
          parallelGroups.set(step.parallelGroup, []);
        }
        parallelGroups.get(step.parallelGroup).push(step);
      } else {
        sequentialDuration += step.estimatedDuration;
      }
    });
    
    // Adicionar duração dos grupos paralelos (máximo de cada grupo)
    for (const group of parallelGroups.values()) {
      const maxDuration = Math.max(...group.map(step => step.estimatedDuration));
      sequentialDuration += maxDuration;
    }
    
    plan.estimatedTotalDuration = sequentialDuration;
    
    return plan;
  }
  
  getAppliedRules(plan) {
    const appliedRules = [];
    
    if (plan.steps.some(step => step.parallel)) {
      appliedRules.push('parallel_independent');
    }
    
    if (plan.resourceOptimization) {
      appliedRules.push('resource_optimization');
    }
    
    if (plan.dependencyOptimization) {
      appliedRules.push('dependency_optimization');
    }
    
    return appliedRules;
  }
  
  // Métodos para detecção de dependências circulares
  
  hasCircularDependencies(steps) {
    return this.detectCircularDependencies(steps).length > 0;
  }
  
  detectCircularDependencies(steps) {
    const visited = new Set();
    const recursionStack = new Set();
    const stepMap = new Map(steps.map(step => [step.id, step]));
    const cycles = [];
    
    const dfs = (stepId, path = []) => {
      if (recursionStack.has(stepId)) {
        const cycleStart = path.indexOf(stepId);
        cycles.push(path.slice(cycleStart).concat(stepId));
        return;
      }
      
      if (visited.has(stepId)) {
        return;
      }
      
      visited.add(stepId);
      recursionStack.add(stepId);
      path.push(stepId);
      
      const step = stepMap.get(stepId);
      if (step && step.dependencies) {
        for (const depId of step.dependencies) {
          dfs(depId, [...path]);
        }
      }
      
      recursionStack.delete(stepId);
    };
    
    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id);
      }
    }
    
    return cycles;
  }
  
  hasLongDependencyChains(steps) {
    return this.getMaxDependencyChainLength(steps) > 5;
  }
  
  getMaxDependencyChainLength(steps) {
    const stepMap = new Map(steps.map(step => [step.id, step]));
    const memo = new Map();
    
    const getChainLength = (stepId) => {
      if (memo.has(stepId)) {
        return memo.get(stepId);
      }
      
      const step = stepMap.get(stepId);
      if (!step || !step.dependencies || step.dependencies.length === 0) {
        memo.set(stepId, 1);
        return 1;
      }
      
      const maxDepLength = Math.max(...step.dependencies.map(depId => getChainLength(depId)));
      const length = maxDepLength + 1;
      memo.set(stepId, length);
      return length;
    };
    
    return Math.max(...steps.map(step => getChainLength(step.id)));
  }
  
  findParallelizableSteps(steps) {
    const stepMap = new Map(steps.map(step => [step.id, step]));
    const parallelizable = [];
    
    // Encontrar steps que podem ser executados em paralelo
    const independentSteps = steps.filter(step => 
      !step.dependencies || step.dependencies.length === 0
    );
    
    if (independentSteps.length > 1) {
      parallelizable.push({
        type: 'independent',
        steps: independentSteps.map(s => s.id)
      });
    }
    
    // Encontrar steps com dependências comuns
    const dependencyGroups = new Map();
    steps.forEach(step => {
      if (step.dependencies && step.dependencies.length > 0) {
        const depKey = step.dependencies.sort().join(',');
        if (!dependencyGroups.has(depKey)) {
          dependencyGroups.set(depKey, []);
        }
        dependencyGroups.get(depKey).push(step.id);
      }
    });
    
    for (const [depKey, stepIds] of dependencyGroups.entries()) {
      if (stepIds.length > 1) {
        parallelizable.push({
          type: 'common_dependencies',
          dependencies: depKey.split(','),
          steps: stepIds
        });
      }
    }
    
    return parallelizable;
  }
  
  // Métodos para API HTTP
  
  async getPlanStatus(req, res) {
    try {
      const { id } = req.params;
      
      const planInfo = this.activePlans.get(id);
      if (!planInfo) {
        // Verificar histórico
        const historyInfo = this.planHistory.get(id);
        if (historyInfo) {
          return res.json({
            planId: id,
            status: 'completed',
            ...historyInfo
          });
        }
        
        return res.status(404).json({
          error: 'Plan not found',
          planId: id
        });
      }
      
      res.json({
        planId: id,
        status: planInfo.status,
        createdAt: planInfo.createdAt,
        eventId: planInfo.eventId,
        priority: planInfo.priority,
        complexity: planInfo.plan.complexity,
        stepCount: planInfo.plan.steps.length,
        estimatedDuration: planInfo.plan.estimatedTotalDuration
      });
      
    } catch (error) {
      this.logger.error('Failed to get plan status', {
        planId: req.params.id,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get plan status',
        message: error.message
      });
    }
  }
  
  async listPlans(req, res) {
    try {
      const { status, eventType, priority, limit = 50, offset = 0 } = req.query;
      
      let plans = Array.from(this.activePlans.values());
      
      // Filtros
      if (status) {
        plans = plans.filter(p => p.status === status);
      }
      
      if (eventType) {
        plans = plans.filter(p => p.plan.eventType === eventType);
      }
      
      if (priority) {
        plans = plans.filter(p => p.priority === priority);
      }
      
      // Ordenação por data de criação (mais recentes primeiro)
      plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Paginação
      const total = plans.length;
      plans = plans.slice(offset, offset + parseInt(limit));
      
      res.json({
        plans: plans.map(p => ({
          planId: p.plan.id,
          eventId: p.eventId,
          eventType: p.plan.eventType,
          status: p.status,
          priority: p.priority,
          complexity: p.plan.complexity,
          stepCount: p.plan.steps.length,
          estimatedDuration: p.plan.estimatedTotalDuration,
          createdAt: p.createdAt
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + parseInt(limit) < total
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to list plans', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to list plans',
        message: error.message
      });
    }
  }
  
  async listTemplates(req, res) {
    try {
      const templates = Array.from(this.planTemplates.values()).map(template => ({
        id: template.id,
        name: template.name,
        complexity: template.complexity,
        stepCount: template.steps.length,
        estimatedDuration: template.estimatedTotalDuration
      }));
      
      res.json({
        templates,
        count: templates.length
      });
      
    } catch (error) {
      this.logger.error('Failed to list templates', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to list templates',
        message: error.message
      });
    }
  }
  
  setupAutomaticCleanup() {
    setInterval(() => {
      this.cleanupOldData();
    }, this.config.cleanup.cleanupInterval);
  }
  
  cleanupOldData() {
    const now = Date.now();
    const retention = this.config.cleanup.historyRetention;
    
    // Limpar planos antigos do histórico
    let cleanedHistory = 0;
    for (const [planId, info] of this.planHistory.entries()) {
      if (now - new Date(info.completedAt).getTime() > retention) {
        this.planHistory.delete(planId);
        cleanedHistory++;
      }
    }
    
    // Limpar cache de análise antigo
    let cleanedCache = 0;
    for (const [key, cached] of this.analysisCache.entries()) {
      if (now - cached.timestamp > this.config.analysis.cacheTtl) {
        this.analysisCache.delete(key);
        cleanedCache++;
      }
    }
    
    if (cleanedHistory > 0 || cleanedCache > 0) {
      this.logger.debug('Cleaned up old data', {
        cleanedHistory,
        cleanedCache,
        currentHistorySize: this.planHistory.size,
        currentCacheSize: this.analysisCache.size
      });
    }
  }
  
  async getHealthInfo() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage.set(memUsage.heapUsed);
    this.metrics.activePlansGauge.set(this.activePlans.size);
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'planning-agent',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      planning: {
        activePlans: this.activePlans.size,
        templateCount: this.planTemplates.size,
        cacheSize: this.analysisCache.size,
        optimizationEnabled: this.config.optimization.enabled
      },
      execution: {
        agentUrl: this.config.execution.executionAgentUrl,
        timeout: this.config.execution.timeout
      }
    };
    
    // Verificar condições de saúde
    if (this.activePlans.size > 100) {
      health.status = 'degraded';
      health.warnings = ['High number of active plans'];
    }
    
    return health;
  }
  
  getDetailedMetrics() {
    return {
      planning: {
        activePlans: this.activePlans.size,
        historySize: this.planHistory.size,
        templateCount: this.planTemplates.size,
        cacheSize: this.analysisCache.size,
        optimizationRules: this.optimizationRules.size
      },
      configuration: {
        maxComplexity: this.config.analysis.maxComplexity,
        optimizationEnabled: this.config.optimization.enabled,
        maxOptimizationIterations: this.config.optimization.maxIterations,
        cacheTimeout: this.config.analysis.cacheTtl
      },
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
  
  async shutdown() {
    this.logger.info('Shutting down Planning Service');
    
    try {
      // Mover planos ativos para histórico
      for (const [planId, planInfo] of this.activePlans.entries()) {
        this.planHistory.set(planId, {
          ...planInfo,
          status: 'interrupted',
          completedAt: new Date().toISOString()
        });
      }
      
      this.activePlans.clear();
      
      this.logger.info('Planning Service shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during Planning Service shutdown', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = PlanningService;