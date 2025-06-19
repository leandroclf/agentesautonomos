/**
 * Intention Manager - Gerenciador de Intenções BDI
 * Responsável por selecionar, executar e monitorar as intenções do agente
 * 
 * Responsabilidades:
 * - Selecionar intenções baseado em desejos priorizados
 * - Gerenciar execução de intenções
 * - Monitorar progresso e sucesso
 * - Suspender/retomar intenções
 * - Resolver conflitos de recursos
 */

class IntentionManager {
  constructor(logger) {
    this.logger = logger;
    this.intentions = new Map();
    this.intentionHistory = [];
    this.executionQueue = [];
    this.activeIntentions = new Set();
    this.suspendedIntentions = new Set();
    
    // Configurações
    this.config = {
      maxActiveIntentions: 10,
      maxIntentions: 200,
      maxHistorySize: 1000,
      executionTimeout: 30000, // 30 segundos
      monitoringInterval: 5000, // 5 segundos
      retryAttempts: 3,
      retryDelay: 2000,
      resourceAllocationTimeout: 10000,
      enableAutoCleanup: true
    };
    
    // Estados de intenção
    this.intentionStates = {
      PENDING: 'pending',
      ACTIVE: 'active',
      SUSPENDED: 'suspended',
      COMPLETED: 'completed',
      FAILED: 'failed',
      CANCELLED: 'cancelled'
    };
    
    // Estratégias de seleção
    this.selectionStrategies = {
      PRIORITY_BASED: 'priority-based',
      RESOURCE_AWARE: 'resource-aware',
      DEADLINE_DRIVEN: 'deadline-driven',
      BALANCED: 'balanced'
    };
    
    this.currentStrategy = this.selectionStrategies.BALANCED;
    
    // Recursos disponíveis
    this.availableResources = {
      cpu: 1.0,
      memory: 1.0,
      network: 1.0,
      storage: 1.0
    };
    
    // Estatísticas
    this.stats = {
      totalIntentions: 0,
      intentionsCreated: 0,
      intentionsCompleted: 0,
      intentionsFailed: 0,
      intentionsCancelled: 0,
      averageExecutionTime: 0,
      resourceUtilization: 0,
      lastUpdate: null
    };
    
    // Inicializar monitoramento
    this.startMonitoring();
    
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Selecionar intenções baseado em desejos
   */
  async selectIntentions(desires, availableResources = null) {
    try {
      if (availableResources) {
        this.availableResources = { ...this.availableResources, ...availableResources };
      }
      
      const selectedIntentions = [];
      const sortedDesires = this.sortDesiresByStrategy(desires);
      
      for (const desire of sortedDesires) {
        // Verificar se já temos uma intenção para este desejo
        if (this.hasIntentionForDesire(desire.id)) {
          continue;
        }
        
        // Verificar se podemos adicionar mais intenções ativas
        if (this.activeIntentions.size >= this.config.maxActiveIntentions) {
          break;
        }
        
        // Verificar disponibilidade de recursos
        if (!await this.canAllocateResources(desire)) {
          continue;
        }
        
        // Criar intenção
        const intention = await this.createIntention(desire);
        selectedIntentions.push(intention);
        
        // Adicionar à fila de execução
        this.executionQueue.push(intention.id);
      }
      
      this.logger.info('Intentions selected', {
        count: selectedIntentions.length,
        desires: desires.length,
        activeIntentions: this.activeIntentions.size
      });
      
      return selectedIntentions;
      
    } catch (error) {
      this.logger.error('Error selecting intentions', {
        error: error.message,
        desires: desires.length
      });
      throw error;
    }
  }

  /**
   * Criar uma nova intenção
   */
  async createIntention(desire) {
    try {
      const intention = {
        id: this.generateIntentionId(desire),
        desireId: desire.id,
        goal: desire.goal,
        description: desire.description,
        type: desire.type,
        priority: desire.priority,
        state: this.intentionStates.PENDING,
        progress: 0,
        startTime: null,
        endTime: null,
        executionTime: 0,
        retryCount: 0,
        maxRetries: this.config.retryAttempts,
        resources: this.calculateRequiredResources(desire),
        allocatedResources: {},
        plan: null,
        planSteps: [],
        currentStep: 0,
        context: desire.context || {},
        conditions: desire.conditions || [],
        constraints: desire.constraints || [],
        dependencies: desire.dependencies || [],
        metadata: {
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          strategy: this.currentStrategy
        }
      };
      
      // Adicionar intenção
      this.intentions.set(intention.id, intention);
      
      // Adicionar ao histórico
      this.addToHistory('created', intention);
      
      // Atualizar estatísticas
      this.stats.intentionsCreated++;
      this.stats.totalIntentions = this.intentions.size;
      this.stats.lastUpdate = new Date().toISOString();
      
      this.logger.info('Intention created', {
        intentionId: intention.id,
        desireId: desire.id,
        priority: intention.priority,
        type: intention.type
      });
      
      return intention;
      
    } catch (error) {
      this.logger.error('Error creating intention', {
        error: error.message,
        desire: desire.id
      });
      throw error;
    }
  }

  /**
   * Executar uma intenção
   */
  async executeIntention(intentionId) {
    try {
      const intention = this.intentions.get(intentionId);
      
      if (!intention) {
        throw new Error(`Intention ${intentionId} not found`);
      }
      
      if (intention.state !== this.intentionStates.PENDING) {
        throw new Error(`Intention ${intentionId} is not in pending state`);
      }
      
      // Alocar recursos
      const allocated = await this.allocateResources(intention);
      if (!allocated) {
        throw new Error(`Cannot allocate resources for intention ${intentionId}`);
      }
      
      // Atualizar estado
      intention.state = this.intentionStates.ACTIVE;
      intention.startTime = new Date().toISOString();
      intention.metadata.lastUpdated = new Date().toISOString();
      
      this.activeIntentions.add(intentionId);
      
      // Adicionar ao histórico
      this.addToHistory('started', intention);
      
      this.logger.info('Intention execution started', {
        intentionId,
        resources: intention.allocatedResources
      });
      
      // Executar plano (simulado)
      const result = await this.executePlan(intention);
      
      if (result.success) {
        await this.completeIntention(intentionId, result);
      } else {
        await this.failIntention(intentionId, result.error);
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Error executing intention', {
        error: error.message,
        intentionId
      });
      
      await this.failIntention(intentionId, error.message);
      throw error;
    }
  }

  /**
   * Completar uma intenção
   */
  async completeIntention(intentionId, result = {}) {
    try {
      const intention = this.intentions.get(intentionId);
      
      if (!intention) {
        throw new Error(`Intention ${intentionId} not found`);
      }
      
      // Atualizar estado
      intention.state = this.intentionStates.COMPLETED;
      intention.endTime = new Date().toISOString();
      intention.progress = 100;
      intention.executionTime = new Date(intention.endTime) - new Date(intention.startTime);
      intention.result = result;
      intention.metadata.lastUpdated = new Date().toISOString();
      
      // Liberar recursos
      await this.deallocateResources(intention);
      
      // Remover das intenções ativas
      this.activeIntentions.delete(intentionId);
      
      // Adicionar ao histórico
      this.addToHistory('completed', intention);
      
      // Atualizar estatísticas
      this.stats.intentionsCompleted++;
      this.updateAverageExecutionTime(intention.executionTime);
      
      this.logger.info('Intention completed', {
        intentionId,
        executionTime: intention.executionTime,
        result: result.summary || 'success'
      });
      
    } catch (error) {
      this.logger.error('Error completing intention', {
        error: error.message,
        intentionId
      });
      throw error;
    }
  }

  /**
   * Falhar uma intenção
   */
  async failIntention(intentionId, errorMessage) {
    try {
      const intention = this.intentions.get(intentionId);
      
      if (!intention) {
        throw new Error(`Intention ${intentionId} not found`);
      }
      
      intention.retryCount++;
      
      // Verificar se deve tentar novamente
      if (intention.retryCount < intention.maxRetries) {
        // Suspender temporariamente
        intention.state = this.intentionStates.SUSPENDED;
        this.suspendedIntentions.add(intentionId);
        this.activeIntentions.delete(intentionId);
        
        // Programar retry
        setTimeout(() => {
          this.retryIntention(intentionId);
        }, this.config.retryDelay * intention.retryCount);
        
        this.logger.warn('Intention suspended for retry', {
          intentionId,
          retryCount: intention.retryCount,
          maxRetries: intention.maxRetries,
          error: errorMessage
        });
        
      } else {
        // Falhar definitivamente
        intention.state = this.intentionStates.FAILED;
        intention.endTime = new Date().toISOString();
        intention.error = errorMessage;
        intention.metadata.lastUpdated = new Date().toISOString();
        
        // Liberar recursos
        await this.deallocateResources(intention);
        
        // Remover das intenções ativas
        this.activeIntentions.delete(intentionId);
        
        // Adicionar ao histórico
        this.addToHistory('failed', intention);
        
        // Atualizar estatísticas
        this.stats.intentionsFailed++;
        
        this.logger.error('Intention failed permanently', {
          intentionId,
          retryCount: intention.retryCount,
          error: errorMessage
        });
      }
      
    } catch (error) {
      this.logger.error('Error failing intention', {
        error: error.message,
        intentionId
      });
      throw error;
    }
  }

  /**
   * Tentar novamente uma intenção
   */
  async retryIntention(intentionId) {
    try {
      const intention = this.intentions.get(intentionId);
      
      if (!intention || intention.state !== this.intentionStates.SUSPENDED) {
        return;
      }
      
      // Resetar estado
      intention.state = this.intentionStates.PENDING;
      intention.progress = 0;
      intention.currentStep = 0;
      
      this.suspendedIntentions.delete(intentionId);
      
      // Adicionar de volta à fila
      this.executionQueue.push(intentionId);
      
      this.logger.info('Intention retry scheduled', {
        intentionId,
        retryCount: intention.retryCount
      });
      
    } catch (error) {
      this.logger.error('Error retrying intention', {
        error: error.message,
        intentionId
      });
    }
  }

  /**
   * Cancelar uma intenção
   */
  async cancelIntention(intentionId, reason = 'manual') {
    try {
      const intention = this.intentions.get(intentionId);
      
      if (!intention) {
        throw new Error(`Intention ${intentionId} not found`);
      }
      
      // Atualizar estado
      intention.state = this.intentionStates.CANCELLED;
      intention.endTime = new Date().toISOString();
      intention.cancellationReason = reason;
      intention.metadata.lastUpdated = new Date().toISOString();
      
      // Liberar recursos
      await this.deallocateResources(intention);
      
      // Remover das coleções ativas
      this.activeIntentions.delete(intentionId);
      this.suspendedIntentions.delete(intentionId);
      
      // Remover da fila de execução
      const queueIndex = this.executionQueue.indexOf(intentionId);
      if (queueIndex > -1) {
        this.executionQueue.splice(queueIndex, 1);
      }
      
      // Adicionar ao histórico
      this.addToHistory('cancelled', intention);
      
      // Atualizar estatísticas
      this.stats.intentionsCancelled++;
      
      this.logger.info('Intention cancelled', {
        intentionId,
        reason
      });
      
    } catch (error) {
      this.logger.error('Error cancelling intention', {
        error: error.message,
        intentionId,
        reason
      });
      throw error;
    }
  }

  /**
   * Processar fila de execução
   */
  async processExecutionQueue() {
    while (this.executionQueue.length > 0 && 
           this.activeIntentions.size < this.config.maxActiveIntentions) {
      
      const intentionId = this.executionQueue.shift();
      
      try {
        await this.executeIntention(intentionId);
      } catch (error) {
        this.logger.error('Error processing execution queue', {
          error: error.message,
          intentionId
        });
      }
    }
  }

  /**
   * Executar plano (simulado)
   */
  async executePlan(intention) {
    try {
      // Simular execução de plano
      const steps = intention.planSteps.length || 3;
      
      for (let i = 0; i < steps; i++) {
        // Verificar se a intenção ainda está ativa
        if (intention.state !== this.intentionStates.ACTIVE) {
          throw new Error('Intention no longer active');
        }
        
        // Simular execução de passo
        await this.sleep(1000);
        
        // Atualizar progresso
        intention.currentStep = i + 1;
        intention.progress = Math.round((i + 1) / steps * 100);
        intention.metadata.lastUpdated = new Date().toISOString();
        
        this.logger.debug('Plan step executed', {
          intentionId: intention.id,
          step: i + 1,
          totalSteps: steps,
          progress: intention.progress
        });
      }
      
      return {
        success: true,
        summary: `Plan executed successfully with ${steps} steps`,
        steps: steps
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Ordenar desejos por estratégia
   */
  sortDesiresByStrategy(desires) {
    switch (this.currentStrategy) {
      case this.selectionStrategies.PRIORITY_BASED:
        return desires.sort((a, b) => b.priority - a.priority);
      
      case this.selectionStrategies.DEADLINE_DRIVEN:
        return desires.sort((a, b) => {
          const aDeadline = a.deadline ? new Date(a.deadline) : new Date('2099-12-31');
          const bDeadline = b.deadline ? new Date(b.deadline) : new Date('2099-12-31');
          return aDeadline - bDeadline;
        });
      
      case this.selectionStrategies.RESOURCE_AWARE:
        return desires.sort((a, b) => {
          const aCost = this.calculateResourceCost(a);
          const bCost = this.calculateResourceCost(b);
          return (b.priority / bCost) - (a.priority / aCost);
        });
      
      case this.selectionStrategies.BALANCED:
      default:
        return desires.sort((a, b) => {
          const aScore = this.calculateBalancedScore(a);
          const bScore = this.calculateBalancedScore(b);
          return bScore - aScore;
        });
    }
  }

  /**
   * Calcular pontuação balanceada
   */
  calculateBalancedScore(desire) {
    const priorityWeight = 0.4;
    const urgencyWeight = 0.3;
    const feasibilityWeight = 0.2;
    const costWeight = 0.1;
    
    const resourceCost = this.calculateResourceCost(desire);
    const normalizedCost = Math.min(1, resourceCost);
    
    return (
      desire.priority * priorityWeight +
      desire.urgency * urgencyWeight +
      desire.feasibility * feasibilityWeight +
      (1 - normalizedCost) * costWeight
    );
  }

  /**
   * Calcular custo de recursos
   */
  calculateResourceCost(desire) {
    // Implementar cálculo baseado no tipo de desejo
    const baseCost = desire.cost || 0.3;
    
    switch (desire.type) {
      case 'exploration':
        return baseCost * 0.8;
      case 'optimization':
        return baseCost * 1.2;
      case 'maintenance':
        return baseCost * 0.6;
      default:
        return baseCost;
    }
  }

  /**
   * Calcular recursos necessários
   */
  calculateRequiredResources(desire) {
    const baseResources = {
      cpu: 0.1,
      memory: 0.1,
      network: 0.05,
      storage: 0.05
    };
    
    const multiplier = desire.cost || 1.0;
    
    return {
      cpu: baseResources.cpu * multiplier,
      memory: baseResources.memory * multiplier,
      network: baseResources.network * multiplier,
      storage: baseResources.storage * multiplier
    };
  }

  /**
   * Verificar se pode alocar recursos
   */
  async canAllocateResources(desire) {
    const required = this.calculateRequiredResources(desire);
    
    for (const [resource, amount] of Object.entries(required)) {
      if (this.availableResources[resource] < amount) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Alocar recursos
   */
  async allocateResources(intention) {
    try {
      const required = intention.resources;
      
      // Verificar disponibilidade
      for (const [resource, amount] of Object.entries(required)) {
        if (this.availableResources[resource] < amount) {
          throw new Error(`Insufficient ${resource}: required ${amount}, available ${this.availableResources[resource]}`);
        }
      }
      
      // Alocar recursos
      for (const [resource, amount] of Object.entries(required)) {
        this.availableResources[resource] -= amount;
      }
      
      intention.allocatedResources = { ...required };
      
      this.logger.debug('Resources allocated', {
        intentionId: intention.id,
        allocated: required,
        remaining: this.availableResources
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Error allocating resources', {
        error: error.message,
        intentionId: intention.id,
        required: intention.resources
      });
      return false;
    }
  }

  /**
   * Desalocar recursos
   */
  async deallocateResources(intention) {
    try {
      if (!intention.allocatedResources) {
        return;
      }
      
      // Liberar recursos
      for (const [resource, amount] of Object.entries(intention.allocatedResources)) {
        this.availableResources[resource] += amount;
        
        // Garantir que não exceda 1.0
        this.availableResources[resource] = Math.min(1.0, this.availableResources[resource]);
      }
      
      this.logger.debug('Resources deallocated', {
        intentionId: intention.id,
        deallocated: intention.allocatedResources,
        available: this.availableResources
      });
      
      intention.allocatedResources = {};
      
    } catch (error) {
      this.logger.error('Error deallocating resources', {
        error: error.message,
        intentionId: intention.id
      });
    }
  }

  /**
   * Verificar se tem intenção para um desejo
   */
  hasIntentionForDesire(desireId) {
    for (const intention of this.intentions.values()) {
      if (intention.desireId === desireId && 
          intention.state !== this.intentionStates.COMPLETED &&
          intention.state !== this.intentionStates.FAILED &&
          intention.state !== this.intentionStates.CANCELLED) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gerar ID único para intenção
   */
  generateIntentionId(desire) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `intention_${timestamp}_${random}`;
  }

  /**
   * Iniciar monitoramento
   */
  startMonitoring() {
    setInterval(() => {
      this.monitorIntentions();
      this.processExecutionQueue();
    }, this.config.monitoringInterval);
  }

  /**
   * Monitorar intenções ativas
   */
  async monitorIntentions() {
    const now = new Date();
    
    for (const intentionId of this.activeIntentions) {
      const intention = this.intentions.get(intentionId);
      
      if (!intention) {
        this.activeIntentions.delete(intentionId);
        continue;
      }
      
      // Verificar timeout
      if (intention.startTime) {
        const executionTime = now - new Date(intention.startTime);
        
        if (executionTime > this.config.executionTimeout) {
          this.logger.warn('Intention execution timeout', {
            intentionId,
            executionTime,
            timeout: this.config.executionTimeout
          });
          
          await this.failIntention(intentionId, 'Execution timeout');
        }
      }
    }
  }

  /**
   * Iniciar limpeza automática
   */
  startAutoCleanup() {
    setInterval(() => {
      this.cleanupCompletedIntentions();
    }, 300000); // A cada 5 minutos
  }

  /**
   * Limpar intenções completadas antigas
   */
  async cleanupCompletedIntentions() {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas atrás
    const toRemove = [];
    
    for (const [id, intention] of this.intentions) {
      if ((intention.state === this.intentionStates.COMPLETED ||
           intention.state === this.intentionStates.FAILED ||
           intention.state === this.intentionStates.CANCELLED) &&
          intention.endTime &&
          new Date(intention.endTime) < cutoffTime) {
        toRemove.push(id);
      }
    }
    
    for (const id of toRemove) {
      this.intentions.delete(id);
    }
    
    if (toRemove.length > 0) {
      this.logger.info('Cleaned up old intentions', {
        count: toRemove.length
      });
    }
  }

  /**
   * Atualizar tempo médio de execução
   */
  updateAverageExecutionTime(executionTime) {
    const completedCount = this.stats.intentionsCompleted;
    const currentAverage = this.stats.averageExecutionTime;
    
    this.stats.averageExecutionTime = 
      (currentAverage * (completedCount - 1) + executionTime) / completedCount;
  }

  /**
   * Adicionar ao histórico
   */
  addToHistory(action, intention, previousState = null) {
    const historyEntry = {
      id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      intention: { ...intention },
      previousState,
      timestamp: new Date().toISOString()
    };
    
    this.intentionHistory.push(historyEntry);
    
    // Limitar tamanho do histórico
    if (this.intentionHistory.length > this.config.maxHistorySize) {
      this.intentionHistory.shift();
    }
  }

  /**
   * Função sleep para simulação
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obter estatísticas
   */
  getStats() {
    const resourceUtilization = Object.values(this.availableResources)
      .reduce((sum, val) => sum + (1 - val), 0) / Object.keys(this.availableResources).length;
    
    return {
      ...this.stats,
      currentIntentions: this.intentions.size,
      activeIntentions: this.activeIntentions.size,
      suspendedIntentions: this.suspendedIntentions.size,
      queueLength: this.executionQueue.length,
      resourceUtilization,
      availableResources: this.availableResources,
      historySize: this.intentionHistory.length,
      config: this.config
    };
  }

  /**
   * Obter intenções ativas
   */
  getActiveIntentions() {
    return Array.from(this.activeIntentions)
      .map(id => this.intentions.get(id))
      .filter(intention => intention);
  }

  /**
   * Obter todas as intenções
   */
  getAllIntentions() {
    return Array.from(this.intentions.values());
  }

  /**
   * Limpar todas as intenções
   */
  clear() {
    this.intentions.clear();
    this.intentionHistory = [];
    this.executionQueue = [];
    this.activeIntentions.clear();
    this.suspendedIntentions.clear();
    
    // Resetar recursos
    this.availableResources = {
      cpu: 1.0,
      memory: 1.0,
      network: 1.0,
      storage: 1.0
    };
    
    // Resetar estatísticas
    this.stats = {
      totalIntentions: 0,
      intentionsCreated: 0,
      intentionsCompleted: 0,
      intentionsFailed: 0,
      intentionsCancelled: 0,
      averageExecutionTime: 0,
      resourceUtilization: 0,
      lastUpdate: null
    };
    
    this.logger.info('All intentions cleared');
  }
}

module.exports = IntentionManager;