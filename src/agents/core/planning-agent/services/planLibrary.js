/**
 * Plan Library - Biblioteca de Planos BDI
 * Responsável por armazenar, buscar e gerenciar planos para execução de intenções
 * 
 * Responsabilidades:
 * - Armazenar templates de planos
 * - Buscar planos adequados para intenções
 * - Gerar planos dinâmicos
 * - Adaptar planos existentes
 * - Avaliar eficácia de planos
 */

class PlanLibrary {
  constructor(logger) {
    this.logger = logger;
    this.plans = new Map();
    this.planTemplates = new Map();
    this.planHistory = [];
    this.planMetrics = new Map();
    
    // Configurações
    this.config = {
      maxPlans: 1000,
      maxTemplates: 200,
      maxHistorySize: 2000,
      planCacheSize: 100,
      adaptationThreshold: 0.7,
      successThreshold: 0.8,
      enableLearning: true,
      enableAdaptation: true
    };
    
    // Tipos de planos
    this.planTypes = {
      SEQUENTIAL: 'sequential',
      PARALLEL: 'parallel',
      CONDITIONAL: 'conditional',
      ITERATIVE: 'iterative',
      REACTIVE: 'reactive',
      HIERARCHICAL: 'hierarchical'
    };
    
    // Estratégias de busca
    this.searchStrategies = {
      EXACT_MATCH: 'exact-match',
      SIMILARITY_BASED: 'similarity-based',
      TEMPLATE_BASED: 'template-based',
      ADAPTIVE: 'adaptive'
    };
    
    // Estatísticas
    this.stats = {
      totalPlans: 0,
      plansCreated: 0,
      plansExecuted: 0,
      plansSuccessful: 0,
      plansFailed: 0,
      plansAdapted: 0,
      averageExecutionTime: 0,
      averageSuccessRate: 0,
      lastUpdate: null
    };
    
    // Cache de planos
    this.planCache = new Map();
    
    // Inicializar biblioteca com planos básicos
    this.initializeBasicPlans();
  }

  /**
   * Buscar plano adequado para uma intenção
   */
  async findPlan(intention, context = {}) {
    try {
      const searchCriteria = {
        goal: intention.goal,
        type: intention.type,
        constraints: intention.constraints || [],
        resources: intention.resources || {},
        context: { ...intention.context, ...context }
      };
      
      // Tentar busca exata primeiro
      let plan = await this.searchExactMatch(searchCriteria);
      
      if (!plan) {
        // Busca por similaridade
        plan = await this.searchBySimilarity(searchCriteria);
      }
      
      if (!plan) {
        // Busca por template
        plan = await this.searchByTemplate(searchCriteria);
      }
      
      if (!plan) {
        // Gerar plano dinâmico
        plan = await this.generateDynamicPlan(searchCriteria);
      }
      
      if (plan) {
        // Adaptar plano se necessário
        plan = await this.adaptPlan(plan, intention, context);
        
        // Adicionar ao cache
        this.addToCache(searchCriteria, plan);
        
        this.logger.info('Plan found', {
          intentionId: intention.id,
          planId: plan.id,
          planType: plan.type,
          stepsCount: plan.steps.length
        });
      } else {
        this.logger.warn('No suitable plan found', {
          intentionId: intention.id,
          goal: intention.goal,
          type: intention.type
        });
      }
      
      return plan;
      
    } catch (error) {
      this.logger.error('Error finding plan', {
        error: error.message,
        intention: intention.id
      });
      throw error;
    }
  }

  /**
   * Criar um novo plano
   */
  async createPlan(planData) {
    try {
      const plan = {
        id: this.generatePlanId(planData),
        name: planData.name,
        description: planData.description,
        type: planData.type || this.planTypes.SEQUENTIAL,
        goal: planData.goal,
        preconditions: planData.preconditions || [],
        postconditions: planData.postconditions || [],
        steps: planData.steps || [],
        resources: planData.resources || {},
        constraints: planData.constraints || [],
        parameters: planData.parameters || {},
        metadata: {
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          version: '1.0.0',
          author: planData.author || 'system',
          tags: planData.tags || []
        },
        metrics: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          lastExecuted: null,
          successRate: 0
        }
      };
      
      // Validar plano
      this.validatePlan(plan);
      
      // Adicionar à biblioteca
      this.plans.set(plan.id, plan);
      
      // Adicionar ao histórico
      this.addToHistory('created', plan);
      
      // Atualizar estatísticas
      this.stats.plansCreated++;
      this.stats.totalPlans = this.plans.size;
      this.stats.lastUpdate = new Date().toISOString();
      
      this.logger.info('Plan created', {
        planId: plan.id,
        name: plan.name,
        type: plan.type,
        stepsCount: plan.steps.length
      });
      
      return plan;
      
    } catch (error) {
      this.logger.error('Error creating plan', {
        error: error.message,
        planData
      });
      throw error;
    }
  }

  /**
   * Atualizar um plano existente
   */
  async updatePlan(planId, updates) {
    try {
      const existingPlan = this.plans.get(planId);
      
      if (!existingPlan) {
        throw new Error(`Plan ${planId} not found`);
      }
      
      const updatedPlan = {
        ...existingPlan,
        ...updates,
        metadata: {
          ...existingPlan.metadata,
          lastUpdated: new Date().toISOString(),
          version: this.incrementVersion(existingPlan.metadata.version)
        }
      };
      
      // Validar plano atualizado
      this.validatePlan(updatedPlan);
      
      // Atualizar na biblioteca
      this.plans.set(planId, updatedPlan);
      
      // Adicionar ao histórico
      this.addToHistory('updated', updatedPlan, existingPlan);
      
      this.logger.info('Plan updated', {
        planId,
        changes: Object.keys(updates),
        version: updatedPlan.metadata.version
      });
      
      return updatedPlan;
      
    } catch (error) {
      this.logger.error('Error updating plan', {
        error: error.message,
        planId,
        updates
      });
      throw error;
    }
  }

  /**
   * Remover um plano
   */
  async removePlan(planId) {
    try {
      const plan = this.plans.get(planId);
      
      if (plan) {
        this.plans.delete(planId);
        this.planMetrics.delete(planId);
        
        // Remover do cache
        for (const [key, cachedPlan] of this.planCache) {
          if (cachedPlan.id === planId) {
            this.planCache.delete(key);
          }
        }
        
        // Adicionar ao histórico
        this.addToHistory('removed', plan);
        
        this.stats.totalPlans = this.plans.size;
        
        this.logger.info('Plan removed', { planId });
        
        return true;
      }
      
      return false;
      
    } catch (error) {
      this.logger.error('Error removing plan', {
        error: error.message,
        planId
      });
      throw error;
    }
  }

  /**
   * Busca exata por critérios
   */
  async searchExactMatch(criteria) {
    const cacheKey = this.generateCacheKey(criteria);
    
    // Verificar cache primeiro
    if (this.planCache.has(cacheKey)) {
      return this.planCache.get(cacheKey);
    }
    
    // Buscar na biblioteca
    for (const plan of this.plans.values()) {
      if (this.isExactMatch(plan, criteria)) {
        return plan;
      }
    }
    
    return null;
  }

  /**
   * Busca por similaridade
   */
  async searchBySimilarity(criteria) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const plan of this.plans.values()) {
      const score = this.calculateSimilarityScore(plan, criteria);
      
      if (score > bestScore && score >= this.config.adaptationThreshold) {
        bestScore = score;
        bestMatch = plan;
      }
    }
    
    return bestMatch;
  }

  /**
   * Busca por template
   */
  async searchByTemplate(criteria) {
    for (const template of this.planTemplates.values()) {
      if (this.matchesTemplate(template, criteria)) {
        return await this.instantiateTemplate(template, criteria);
      }
    }
    
    return null;
  }

  /**
   * Gerar plano dinâmico
   */
  async generateDynamicPlan(criteria) {
    try {
      const planData = {
        name: `Dynamic Plan for ${criteria.goal}`,
        description: `Dynamically generated plan for achieving: ${criteria.goal}`,
        type: this.selectPlanType(criteria),
        goal: criteria.goal,
        steps: await this.generateSteps(criteria),
        resources: criteria.resources,
        constraints: criteria.constraints,
        parameters: criteria.context,
        tags: ['dynamic', 'generated']
      };
      
      return await this.createPlan(planData);
      
    } catch (error) {
      this.logger.error('Error generating dynamic plan', {
        error: error.message,
        criteria
      });
      return null;
    }
  }

  /**
   * Adaptar plano existente
   */
  async adaptPlan(plan, intention, context) {
    try {
      if (!this.config.enableAdaptation) {
        return plan;
      }
      
      const adaptedPlan = { ...plan };
      let adapted = false;
      
      // Adaptar recursos
      if (intention.resources && 
          JSON.stringify(plan.resources) !== JSON.stringify(intention.resources)) {
        adaptedPlan.resources = { ...plan.resources, ...intention.resources };
        adapted = true;
      }
      
      // Adaptar restrições
      if (intention.constraints && intention.constraints.length > 0) {
        adaptedPlan.constraints = [...plan.constraints, ...intention.constraints];
        adapted = true;
      }
      
      // Adaptar passos baseado no contexto
      if (context.adaptSteps) {
        adaptedPlan.steps = await this.adaptSteps(plan.steps, context);
        adapted = true;
      }
      
      if (adapted) {
        adaptedPlan.id = this.generatePlanId(adaptedPlan);
        adaptedPlan.metadata = {
          ...plan.metadata,
          adaptedFrom: plan.id,
          adaptedAt: new Date().toISOString(),
          adaptationReason: 'Context-based adaptation'
        };
        
        // Adicionar plano adaptado à biblioteca
        this.plans.set(adaptedPlan.id, adaptedPlan);
        
        this.stats.plansAdapted++;
        
        this.logger.info('Plan adapted', {
          originalPlanId: plan.id,
          adaptedPlanId: adaptedPlan.id,
          intentionId: intention.id
        });
        
        return adaptedPlan;
      }
      
      return plan;
      
    } catch (error) {
      this.logger.error('Error adapting plan', {
        error: error.message,
        planId: plan.id,
        intentionId: intention.id
      });
      return plan;
    }
  }

  /**
   * Registrar execução de plano
   */
  async recordExecution(planId, result) {
    try {
      const plan = this.plans.get(planId);
      
      if (!plan) {
        throw new Error(`Plan ${planId} not found`);
      }
      
      // Atualizar métricas do plano
      plan.metrics.executionCount++;
      plan.metrics.lastExecuted = new Date().toISOString();
      
      if (result.success) {
        plan.metrics.successCount++;
      } else {
        plan.metrics.failureCount++;
      }
      
      // Calcular taxa de sucesso
      plan.metrics.successRate = plan.metrics.successCount / plan.metrics.executionCount;
      
      // Atualizar tempo médio de execução
      if (result.executionTime) {
        const currentAvg = plan.metrics.averageExecutionTime;
        const count = plan.metrics.executionCount;
        
        plan.metrics.averageExecutionTime = 
          (currentAvg * (count - 1) + result.executionTime) / count;
      }
      
      // Atualizar estatísticas globais
      this.stats.plansExecuted++;
      
      if (result.success) {
        this.stats.plansSuccessful++;
      } else {
        this.stats.plansFailed++;
      }
      
      this.stats.averageSuccessRate = this.stats.plansSuccessful / this.stats.plansExecuted;
      
      // Adicionar ao histórico
      this.addToHistory('executed', plan, null, result);
      
      // Aprender com a execução se habilitado
      if (this.config.enableLearning) {
        await this.learnFromExecution(plan, result);
      }
      
      this.logger.info('Plan execution recorded', {
        planId,
        success: result.success,
        executionTime: result.executionTime,
        successRate: plan.metrics.successRate
      });
      
    } catch (error) {
      this.logger.error('Error recording execution', {
        error: error.message,
        planId,
        result
      });
    }
  }

  /**
   * Aprender com execução
   */
  async learnFromExecution(plan, result) {
    try {
      // Se o plano falhou consistentemente, marcar para revisão
      if (plan.metrics.successRate < 0.3 && plan.metrics.executionCount >= 5) {
        plan.metadata.needsReview = true;
        plan.metadata.reviewReason = 'Low success rate';
        
        this.logger.warn('Plan marked for review', {
          planId: plan.id,
          successRate: plan.metrics.successRate,
          executionCount: plan.metrics.executionCount
        });
      }
      
      // Se o plano é muito bem-sucedido, promover como template
      if (plan.metrics.successRate > 0.9 && plan.metrics.executionCount >= 10) {
        await this.promoteToTemplate(plan);
      }
      
      // Analisar falhas para melhorias
      if (!result.success && result.failureReason) {
        await this.analyzeFailure(plan, result);
      }
      
    } catch (error) {
      this.logger.error('Error learning from execution', {
        error: error.message,
        planId: plan.id
      });
    }
  }

  /**
   * Promover plano para template
   */
  async promoteToTemplate(plan) {
    try {
      const template = {
        id: `template_${plan.id}`,
        name: `Template: ${plan.name}`,
        description: `Template based on successful plan: ${plan.description}`,
        type: plan.type,
        goalPattern: this.extractGoalPattern(plan.goal),
        stepTemplates: this.extractStepTemplates(plan.steps),
        resourceRequirements: plan.resources,
        constraintPatterns: this.extractConstraintPatterns(plan.constraints),
        parameters: plan.parameters,
        metadata: {
          createdAt: new Date().toISOString(),
          basedOnPlan: plan.id,
          successRate: plan.metrics.successRate,
          executionCount: plan.metrics.executionCount
        }
      };
      
      this.planTemplates.set(template.id, template);
      
      this.logger.info('Plan promoted to template', {
        planId: plan.id,
        templateId: template.id,
        successRate: plan.metrics.successRate
      });
      
    } catch (error) {
      this.logger.error('Error promoting plan to template', {
        error: error.message,
        planId: plan.id
      });
    }
  }

  /**
   * Analisar falha
   */
  async analyzeFailure(plan, result) {
    try {
      const failurePattern = {
        planId: plan.id,
        reason: result.failureReason,
        step: result.failedStep,
        context: result.context,
        timestamp: new Date().toISOString()
      };
      
      // Armazenar padrão de falha para análise futura
      if (!plan.metadata.failurePatterns) {
        plan.metadata.failurePatterns = [];
      }
      
      plan.metadata.failurePatterns.push(failurePattern);
      
      // Limitar histórico de falhas
      if (plan.metadata.failurePatterns.length > 10) {
        plan.metadata.failurePatterns.shift();
      }
      
      this.logger.debug('Failure pattern recorded', {
        planId: plan.id,
        reason: result.failureReason,
        step: result.failedStep
      });
      
    } catch (error) {
      this.logger.error('Error analyzing failure', {
        error: error.message,
        planId: plan.id
      });
    }
  }

  /**
   * Verificar se é correspondência exata
   */
  isExactMatch(plan, criteria) {
    return (
      plan.goal === criteria.goal &&
      plan.type === criteria.type &&
      this.arraysEqual(plan.constraints, criteria.constraints) &&
      this.objectsEqual(plan.resources, criteria.resources)
    );
  }

  /**
   * Calcular pontuação de similaridade
   */
  calculateSimilarityScore(plan, criteria) {
    let score = 0;
    let factors = 0;
    
    // Similaridade do objetivo
    if (plan.goal && criteria.goal) {
      score += this.stringSimilarity(plan.goal, criteria.goal) * 0.4;
      factors += 0.4;
    }
    
    // Similaridade do tipo
    if (plan.type === criteria.type) {
      score += 0.3;
    }
    factors += 0.3;
    
    // Similaridade de recursos
    if (plan.resources && criteria.resources) {
      score += this.resourceSimilarity(plan.resources, criteria.resources) * 0.2;
      factors += 0.2;
    }
    
    // Similaridade de restrições
    if (plan.constraints && criteria.constraints) {
      score += this.constraintSimilarity(plan.constraints, criteria.constraints) * 0.1;
      factors += 0.1;
    }
    
    return factors > 0 ? score / factors : 0;
  }

  /**
   * Verificar se corresponde ao template
   */
  matchesTemplate(template, criteria) {
    // Verificar padrão do objetivo
    if (!this.matchesPattern(criteria.goal, template.goalPattern)) {
      return false;
    }
    
    // Verificar tipo
    if (template.type && criteria.type !== template.type) {
      return false;
    }
    
    // Verificar recursos mínimos
    if (!this.hasRequiredResources(criteria.resources, template.resourceRequirements)) {
      return false;
    }
    
    return true;
  }

  /**
   * Instanciar template
   */
  async instantiateTemplate(template, criteria) {
    try {
      const planData = {
        name: `${template.name} Instance`,
        description: `Plan instantiated from template: ${template.name}`,
        type: template.type,
        goal: criteria.goal,
        steps: this.instantiateSteps(template.stepTemplates, criteria),
        resources: { ...template.resourceRequirements, ...criteria.resources },
        constraints: [...template.constraintPatterns, ...criteria.constraints],
        parameters: { ...template.parameters, ...criteria.context },
        tags: ['template-based', template.id]
      };
      
      return await this.createPlan(planData);
      
    } catch (error) {
      this.logger.error('Error instantiating template', {
        error: error.message,
        templateId: template.id
      });
      return null;
    }
  }

  /**
   * Selecionar tipo de plano
   */
  selectPlanType(criteria) {
    // Lógica simples para seleção de tipo
    if (criteria.context.parallel) {
      return this.planTypes.PARALLEL;
    }
    
    if (criteria.context.conditional) {
      return this.planTypes.CONDITIONAL;
    }
    
    if (criteria.context.iterative) {
      return this.planTypes.ITERATIVE;
    }
    
    return this.planTypes.SEQUENTIAL;
  }

  /**
   * Gerar passos do plano
   */
  async generateSteps(criteria) {
    const steps = [];
    
    // Gerar passos básicos baseado no objetivo
    if (criteria.goal.includes('collect')) {
      steps.push(
        { id: 1, name: 'Initialize collection', action: 'initialize', parameters: {} },
        { id: 2, name: 'Gather data', action: 'collect', parameters: { target: criteria.goal } },
        { id: 3, name: 'Validate results', action: 'validate', parameters: {} },
        { id: 4, name: 'Store results', action: 'store', parameters: {} }
      );
    } else if (criteria.goal.includes('analyze')) {
      steps.push(
        { id: 1, name: 'Load data', action: 'load', parameters: {} },
        { id: 2, name: 'Process analysis', action: 'analyze', parameters: { type: criteria.goal } },
        { id: 3, name: 'Generate report', action: 'report', parameters: {} }
      );
    } else {
      // Passos genéricos
      steps.push(
        { id: 1, name: 'Prepare', action: 'prepare', parameters: {} },
        { id: 2, name: 'Execute', action: 'execute', parameters: { goal: criteria.goal } },
        { id: 3, name: 'Verify', action: 'verify', parameters: {} }
      );
    }
    
    return steps;
  }

  /**
   * Adaptar passos
   */
  async adaptSteps(steps, context) {
    const adaptedSteps = [...steps];
    
    // Adicionar passos de validação se necessário
    if (context.requireValidation) {
      adaptedSteps.push({
        id: adaptedSteps.length + 1,
        name: 'Additional validation',
        action: 'validate',
        parameters: { type: 'extended' }
      });
    }
    
    // Modificar parâmetros baseado no contexto
    for (const step of adaptedSteps) {
      if (context.stepModifications && context.stepModifications[step.id]) {
        step.parameters = { ...step.parameters, ...context.stepModifications[step.id] };
      }
    }
    
    return adaptedSteps;
  }

  /**
   * Validar plano
   */
  validatePlan(plan) {
    if (!plan.id || !plan.name || !plan.goal) {
      throw new Error('Plan must have id, name, and goal');
    }
    
    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Plan must have at least one step');
    }
    
    // Validar passos
    for (const step of plan.steps) {
      if (!step.id || !step.name || !step.action) {
        throw new Error('Each step must have id, name, and action');
      }
    }
    
    return true;
  }

  /**
   * Inicializar planos básicos
   */
  initializeBasicPlans() {
    const basicPlans = [
      {
        name: 'Data Collection Plan',
        description: 'Basic plan for collecting data',
        type: this.planTypes.SEQUENTIAL,
        goal: 'collect data',
        steps: [
          { id: 1, name: 'Initialize collection', action: 'initialize', parameters: {} },
          { id: 2, name: 'Gather data', action: 'collect', parameters: {} },
          { id: 3, name: 'Validate data', action: 'validate', parameters: {} },
          { id: 4, name: 'Store data', action: 'store', parameters: {} }
        ],
        resources: { cpu: 0.2, memory: 0.3, network: 0.4 },
        tags: ['basic', 'data', 'collection']
      },
      {
        name: 'Analysis Plan',
        description: 'Basic plan for data analysis',
        type: this.planTypes.SEQUENTIAL,
        goal: 'analyze data',
        steps: [
          { id: 1, name: 'Load data', action: 'load', parameters: {} },
          { id: 2, name: 'Process analysis', action: 'analyze', parameters: {} },
          { id: 3, name: 'Generate insights', action: 'generate', parameters: {} },
          { id: 4, name: 'Create report', action: 'report', parameters: {} }
        ],
        resources: { cpu: 0.5, memory: 0.4, network: 0.1 },
        tags: ['basic', 'analysis', 'processing']
      },
      {
        name: 'Monitoring Plan',
        description: 'Basic plan for system monitoring',
        type: this.planTypes.ITERATIVE,
        goal: 'monitor system',
        steps: [
          { id: 1, name: 'Check status', action: 'check', parameters: {} },
          { id: 2, name: 'Collect metrics', action: 'collect', parameters: {} },
          { id: 3, name: 'Evaluate health', action: 'evaluate', parameters: {} },
          { id: 4, name: 'Alert if needed', action: 'alert', parameters: {} }
        ],
        resources: { cpu: 0.1, memory: 0.2, network: 0.2 },
        tags: ['basic', 'monitoring', 'health']
      }
    ];
    
    for (const planData of basicPlans) {
      this.createPlan(planData).catch(error => {
        this.logger.error('Error creating basic plan', {
          error: error.message,
          plan: planData.name
        });
      });
    }
  }

  /**
   * Funções utilitárias
   */
  generatePlanId(planData) {
    const goalHash = this.simpleHash(planData.goal || 'unknown');
    const timestamp = Date.now();
    return `plan_${goalHash}_${timestamp}`;
  }

  generateCacheKey(criteria) {
    return this.simpleHash(JSON.stringify(criteria));
  }

  incrementVersion(version) {
    const parts = version.split('.');
    parts[2] = String(parseInt(parts[2]) + 1);
    return parts.join('.');
  }

  addToCache(criteria, plan) {
    const key = this.generateCacheKey(criteria);
    this.planCache.set(key, plan);
    
    // Limitar tamanho do cache
    if (this.planCache.size > this.config.planCacheSize) {
      const firstKey = this.planCache.keys().next().value;
      this.planCache.delete(firstKey);
    }
  }

  addToHistory(action, plan, previousPlan = null, result = null) {
    const historyEntry = {
      id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      plan: { ...plan },
      previousPlan: previousPlan ? { ...previousPlan } : null,
      result,
      timestamp: new Date().toISOString()
    };
    
    this.planHistory.push(historyEntry);
    
    // Limitar tamanho do histórico
    if (this.planHistory.length > this.config.maxHistorySize) {
      this.planHistory.shift();
    }
  }

  // Funções de comparação e similaridade
  arraysEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  objectsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  stringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  resourceSimilarity(res1, res2) {
    const keys = new Set([...Object.keys(res1), ...Object.keys(res2)]);
    let similarity = 0;
    
    for (const key of keys) {
      const val1 = res1[key] || 0;
      const val2 = res2[key] || 0;
      similarity += 1 - Math.abs(val1 - val2);
    }
    
    return similarity / keys.size;
  }

  constraintSimilarity(cons1, cons2) {
    const set1 = new Set(cons1.map(c => JSON.stringify(c)));
    const set2 = new Set(cons2.map(c => JSON.stringify(c)));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 1;
  }

  matchesPattern(text, pattern) {
    // Implementação simples de correspondência de padrão
    return text.toLowerCase().includes(pattern.toLowerCase());
  }

  hasRequiredResources(available, required) {
    for (const [resource, amount] of Object.entries(required)) {
      if (!available[resource] || available[resource] < amount) {
        return false;
      }
    }
    return true;
  }

  instantiateSteps(stepTemplates, criteria) {
    return stepTemplates.map((template, index) => ({
      id: index + 1,
      name: template.name.replace('{goal}', criteria.goal),
      action: template.action,
      parameters: { ...template.parameters, ...criteria.context }
    }));
  }

  extractGoalPattern(goal) {
    // Extrair padrão simples do objetivo
    return goal.toLowerCase().replace(/\b\d+\b/g, '{number}').replace(/\b[a-f0-9-]{36}\b/g, '{id}');
  }

  extractStepTemplates(steps) {
    return steps.map(step => ({
      name: step.name,
      action: step.action,
      parameters: step.parameters
    }));
  }

  extractConstraintPatterns(constraints) {
    return constraints.map(constraint => ({
      type: constraint.type || 'generic',
      pattern: constraint.pattern || constraint.value
    }));
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Obter estatísticas
   */
  getStats() {
    return {
      ...this.stats,
      currentPlans: this.plans.size,
      currentTemplates: this.planTemplates.size,
      cacheSize: this.planCache.size,
      historySize: this.planHistory.length,
      config: this.config
    };
  }

  /**
   * Obter todos os planos
   */
  getAllPlans() {
    return Array.from(this.plans.values());
  }

  /**
   * Obter planos por tag
   */
  getPlansByTag(tag) {
    return Array.from(this.plans.values())
      .filter(plan => plan.metadata.tags && plan.metadata.tags.includes(tag));
  }

  /**
   * Limpar biblioteca
   */
  clear() {
    this.plans.clear();
    this.planTemplates.clear();
    this.planHistory = [];
    this.planMetrics.clear();
    this.planCache.clear();
    
    this.stats = {
      totalPlans: 0,
      plansCreated: 0,
      plansExecuted: 0,
      plansSuccessful: 0,
      plansFailed: 0,
      plansAdapted: 0,
      averageExecutionTime: 0,
      averageSuccessRate: 0,
      lastUpdate: null
    };
    
    this.logger.info('Plan library cleared');
    
    // Recriar planos básicos
    this.initializeBasicPlans();
  }
}

module.exports = PlanLibrary;