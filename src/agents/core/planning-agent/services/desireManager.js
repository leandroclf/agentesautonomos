/**
 * Desire Manager - Gerenciador de Desejos BDI
 * Responsável por gerar, priorizar e gerenciar os desejos do agente
 * 
 * Responsabilidades:
 * - Gerar desejos baseado em crenças e objetivos
 * - Priorizar desejos por importância e viabilidade
 * - Resolver conflitos entre desejos
 * - Manter histórico de desejos
 * - Avaliar satisfação de desejos
 */

class DesireManager {
  constructor(logger) {
    this.logger = logger;
    this.desires = new Map();
    this.desireHistory = [];
    this.priorityStrategy = 'weighted-score'; // 'weighted-score', 'utility-based', 'deadline-based'
    
    // Configurações
    this.config = {
      maxDesires: 500,
      maxHistorySize: 2000,
      defaultPriority: 0.5,
      defaultUrgency: 0.5,
      expirationTime: 12 * 60 * 60 * 1000, // 12 horas
      conflictThreshold: 0.8,
      satisfactionThreshold: 0.9,
      enableAutoCleanup: true
    };
    
    // Pesos para cálculo de prioridade
    this.priorityWeights = {
      importance: 0.4,
      urgency: 0.3,
      feasibility: 0.2,
      cost: 0.1
    };
    
    // Tipos de desejos
    this.desireTypes = {
      ACHIEVEMENT: 'achievement',    // Alcançar um objetivo
      MAINTENANCE: 'maintenance',   // Manter um estado
      AVOIDANCE: 'avoidance',      // Evitar uma situação
      EXPLORATION: 'exploration',   // Explorar possibilidades
      OPTIMIZATION: 'optimization'  // Otimizar recursos
    };
    
    // Estatísticas
    this.stats = {
      totalDesires: 0,
      desiresGenerated: 0,
      desiresSatisfied: 0,
      desiresAbandoned: 0,
      conflictsResolved: 0,
      lastUpdate: null
    };
    
    // Inicializar limpeza automática
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Gerar desejos baseado em crenças e objetivos
   */
  async generateDesires(beliefs, goals, context = {}) {
    try {
      const newDesires = [];
      
      // Gerar desejos para cada objetivo
      for (const goal of goals) {
        const desires = await this.generateDesiresForGoal(goal, beliefs, context);
        newDesires.push(...desires);
      }
      
      // Gerar desejos baseado em crenças
      const beliefBasedDesires = await this.generateDesiresFromBeliefs(beliefs, context);
      newDesires.push(...beliefBasedDesires);
      
      // Adicionar desejos ao sistema
      for (const desire of newDesires) {
        await this.addDesire(desire);
      }
      
      this.logger.info('Desires generated', {
        count: newDesires.length,
        goals: goals.length,
        beliefs: beliefs.length
      });
      
      return newDesires;
      
    } catch (error) {
      this.logger.error('Error generating desires', {
        error: error.message,
        goals: goals.length,
        beliefs: beliefs.length
      });
      throw error;
    }
  }

  /**
   * Adicionar um novo desejo
   */
  async addDesire(desireData) {
    try {
      const desire = this.createDesire(desireData);
      
      // Verificar se já existe
      if (this.desires.has(desire.id)) {
        return await this.updateDesire(desire.id, desireData);
      }
      
      // Verificar conflitos
      const conflicts = await this.detectConflicts(desire);
      
      if (conflicts.length > 0) {
        await this.resolveConflicts(desire, conflicts);
      }
      
      // Calcular prioridade
      desire.priority = await this.calculatePriority(desire);
      
      // Adicionar desejo
      this.desires.set(desire.id, desire);
      
      // Adicionar ao histórico
      this.addToHistory('generated', desire);
      
      // Atualizar estatísticas
      this.stats.desiresGenerated++;
      this.stats.totalDesires = this.desires.size;
      this.stats.lastUpdate = new Date().toISOString();
      
      this.logger.info('Desire added', {
        desireId: desire.id,
        type: desire.type,
        priority: desire.priority,
        goal: desire.goal
      });
      
      return desire;
      
    } catch (error) {
      this.logger.error('Error adding desire', {
        error: error.message,
        desireData
      });
      throw error;
    }
  }

  /**
   * Atualizar um desejo existente
   */
  async updateDesire(desireId, updates) {
    try {
      const existingDesire = this.desires.get(desireId);
      
      if (!existingDesire) {
        throw new Error(`Desire ${desireId} not found`);
      }
      
      const updatedDesire = {
        ...existingDesire,
        ...updates,
        lastUpdated: new Date().toISOString()
      };
      
      // Recalcular prioridade se necessário
      if (updates.importance || updates.urgency || updates.feasibility || updates.cost) {
        updatedDesire.priority = await this.calculatePriority(updatedDesire);
      }
      
      this.desires.set(desireId, updatedDesire);
      this.addToHistory('updated', updatedDesire, existingDesire);
      
      this.logger.info('Desire updated', {
        desireId,
        changes: Object.keys(updates)
      });
      
      return updatedDesire;
      
    } catch (error) {
      this.logger.error('Error updating desire', {
        error: error.message,
        desireId,
        updates
      });
      throw error;
    }
  }

  /**
   * Remover um desejo
   */
  async removeDesire(desireId, reason = 'manual') {
    try {
      const desire = this.desires.get(desireId);
      
      if (desire) {
        this.desires.delete(desireId);
        this.addToHistory('removed', desire, null, reason);
        
        if (reason === 'satisfied') {
          this.stats.desiresSatisfied++;
        } else if (reason === 'abandoned') {
          this.stats.desiresAbandoned++;
        }
        
        this.stats.totalDesires = this.desires.size;
        
        this.logger.info('Desire removed', { desireId, reason });
        
        return true;
      }
      
      return false;
      
    } catch (error) {
      this.logger.error('Error removing desire', {
        error: error.message,
        desireId,
        reason
      });
      throw error;
    }
  }

  /**
   * Obter todos os desejos
   */
  getAllDesires() {
    return Array.from(this.desires.values());
  }

  /**
   * Obter desejos priorizados
   */
  getPrioritizedDesires(limit = null) {
    const desires = Array.from(this.desires.values())
      .sort((a, b) => b.priority - a.priority);
    
    return limit ? desires.slice(0, limit) : desires;
  }

  /**
   * Obter desejos por tipo
   */
  getDesiresByType(type) {
    return Array.from(this.desires.values())
      .filter(desire => desire.type === type);
  }

  /**
   * Obter desejos por objetivo
   */
  getDesiresByGoal(goalId) {
    return Array.from(this.desires.values())
      .filter(desire => desire.goalId === goalId);
  }

  /**
   * Obter desejos ativos (não expirados)
   */
  getActiveDesires() {
    const now = new Date();
    return Array.from(this.desires.values())
      .filter(desire => !desire.expiresAt || new Date(desire.expiresAt) > now);
  }

  /**
   * Criar um novo desejo
   */
  createDesire(desireData) {
    const desire = {
      id: this.generateDesireId(desireData),
      type: desireData.type || this.desireTypes.ACHIEVEMENT,
      goal: desireData.goal,
      goalId: desireData.goalId,
      description: desireData.description,
      conditions: desireData.conditions || [],
      constraints: desireData.constraints || [],
      importance: desireData.importance || this.config.defaultPriority,
      urgency: desireData.urgency || this.config.defaultUrgency,
      feasibility: desireData.feasibility || 1.0,
      cost: desireData.cost || 0.0,
      priority: 0, // Será calculado
      status: 'active',
      progress: 0,
      satisfaction: 0,
      dependencies: desireData.dependencies || [],
      context: desireData.context || {},
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      expiresAt: desireData.expiresAt || new Date(Date.now() + this.config.expirationTime).toISOString()
    };
    
    return desire;
  }

  /**
   * Gerar ID único para um desejo
   */
  generateDesireId(desireData) {
    const goalStr = typeof desireData.goal === 'object' 
      ? JSON.stringify(desireData.goal) 
      : String(desireData.goal);
    
    const hash = this.simpleHash(goalStr + desireData.type + Date.now());
    return `desire_${hash}`;
  }

  /**
   * Gerar desejos para um objetivo específico
   */
  async generateDesiresForGoal(goal, beliefs, context) {
    const desires = [];
    
    try {
      // Desejo principal de alcançar o objetivo
      const mainDesire = {
        type: this.desireTypes.ACHIEVEMENT,
        goal: goal.description || goal.name,
        goalId: goal.id,
        description: `Achieve goal: ${goal.description || goal.name}`,
        importance: goal.priority || 0.8,
        urgency: this.calculateUrgency(goal),
        feasibility: await this.assessFeasibility(goal, beliefs),
        cost: goal.estimatedCost || 0.5,
        conditions: goal.conditions || [],
        constraints: goal.constraints || [],
        context: { ...context, goalType: goal.type }
      };
      
      desires.push(mainDesire);
      
      // Gerar desejos para pré-condições
      if (goal.preconditions) {
        for (const precondition of goal.preconditions) {
          if (!this.isPreconditionSatisfied(precondition, beliefs)) {
            const preconditionDesire = {
              type: this.desireTypes.ACHIEVEMENT,
              goal: precondition.description,
              goalId: goal.id,
              description: `Satisfy precondition: ${precondition.description}`,
              importance: mainDesire.importance * 0.8,
              urgency: mainDesire.urgency * 1.2,
              feasibility: await this.assessFeasibility(precondition, beliefs),
              cost: precondition.cost || 0.3,
              dependencies: [mainDesire.id],
              context: { ...context, isPrecondition: true, parentGoal: goal.id }
            };
            
            desires.push(preconditionDesire);
          }
        }
      }
      
      // Gerar desejos de manutenção se necessário
      if (goal.type === 'maintenance') {
        const maintenanceDesire = {
          type: this.desireTypes.MAINTENANCE,
          goal: goal.description,
          goalId: goal.id,
          description: `Maintain state: ${goal.description}`,
          importance: goal.priority || 0.6,
          urgency: 0.3,
          feasibility: 0.9,
          cost: 0.2,
          context: { ...context, isMaintenance: true }
        };
        
        desires.push(maintenanceDesire);
      }
      
    } catch (error) {
      this.logger.error('Error generating desires for goal', {
        error: error.message,
        goal: goal.id
      });
    }
    
    return desires;
  }

  /**
   * Gerar desejos baseado em crenças
   */
  async generateDesiresFromBeliefs(beliefs, context) {
    const desires = [];
    
    try {
      for (const belief of beliefs) {
        // Verificar se a crença tem as propriedades necessárias
        if (!belief || !belief.predicate || belief.confidence === undefined) {
          continue;
        }
        
        // Gerar desejos de exploração para crenças incertas
        if (belief.confidence < 0.7) {
          const explorationDesire = {
            type: this.desireTypes.EXPLORATION,
            goal: `Verify belief: ${belief.predicate}`,
            description: `Increase confidence in belief about ${belief.predicate}`,
            importance: 0.4,
            urgency: 0.3,
            feasibility: 0.8,
            cost: 0.2,
            context: { ...context, beliefId: belief.id, targetConfidence: 0.9 }
          };
          
          desires.push(explorationDesire);
        }
        
        // Gerar desejos de otimização para recursos
        if (belief.predicate && belief.predicate.includes('resource') && belief.value < 0.5) {
          const optimizationDesire = {
            type: this.desireTypes.OPTIMIZATION,
            goal: `Optimize resource: ${belief.predicate}`,
            description: `Improve resource utilization for ${belief.predicate}`,
            importance: 0.6,
            urgency: 0.5,
            feasibility: 0.7,
            cost: 0.4,
            context: { ...context, beliefId: belief.id, targetValue: 0.8 }
          };
          
          desires.push(optimizationDesire);
        }
        
        // Gerar desejos de evitação para situações negativas
        if (belief.predicate.includes('threat') || belief.predicate.includes('risk')) {
          const avoidanceDesire = {
            type: this.desireTypes.AVOIDANCE,
            goal: `Avoid threat: ${belief.predicate}`,
            description: `Prevent or mitigate ${belief.predicate}`,
            importance: 0.8,
            urgency: 0.9,
            feasibility: 0.6,
            cost: 0.3,
            context: { ...context, beliefId: belief.id, threatLevel: belief.value }
          };
          
          desires.push(avoidanceDesire);
        }
      }
      
    } catch (error) {
      this.logger.error('Error generating desires from beliefs', {
        error: error.message,
        beliefsCount: beliefs.length
      });
    }
    
    return desires;
  }

  /**
   * Calcular prioridade de um desejo
   */
  async calculatePriority(desire) {
    try {
      const weights = this.priorityWeights;
      
      const score = (
        desire.importance * weights.importance +
        desire.urgency * weights.urgency +
        desire.feasibility * weights.feasibility +
        (1 - desire.cost) * weights.cost
      );
      
      // Aplicar modificadores baseado no contexto
      let modifier = 1.0;
      
      // Aumentar prioridade para desejos com dependências satisfeitas
      if (desire.dependencies && desire.dependencies.length > 0) {
        const satisfiedDeps = desire.dependencies.filter(depId => 
          this.isDependencySatisfied(depId)
        ).length;
        
        modifier *= 0.8 + (satisfiedDeps / desire.dependencies.length) * 0.4;
      }
      
      // Reduzir prioridade para desejos próximos do vencimento
      if (desire.expiresAt) {
        const timeToExpiry = new Date(desire.expiresAt) - new Date();
        const totalTime = new Date(desire.expiresAt) - new Date(desire.timestamp);
        const timeRatio = timeToExpiry / totalTime;
        
        if (timeRatio < 0.1) {
          modifier *= 0.5; // Muito próximo do vencimento
        } else if (timeRatio < 0.3) {
          modifier *= 0.8;
        }
      }
      
      return Math.max(0, Math.min(1, score * modifier));
      
    } catch (error) {
      this.logger.error('Error calculating priority', {
        error: error.message,
        desireId: desire.id
      });
      return this.config.defaultPriority;
    }
  }

  /**
   * Calcular urgência baseado no objetivo
   */
  calculateUrgency(goal) {
    if (goal.deadline) {
      const timeToDeadline = new Date(goal.deadline) - new Date();
      const maxTime = 7 * 24 * 60 * 60 * 1000; // 7 dias
      
      return Math.max(0, Math.min(1, 1 - (timeToDeadline / maxTime)));
    }
    
    return goal.urgency || this.config.defaultUrgency;
  }

  /**
   * Avaliar viabilidade de um objetivo
   */
  async assessFeasibility(goal, beliefs) {
    try {
      let feasibility = 1.0;
      
      // Verificar se temos recursos necessários
      if (goal.requiredResources) {
        for (const resource of goal.requiredResources) {
          const resourceBelief = beliefs.find(b => 
            b.predicate.includes('resource') && b.predicate.includes(resource.type)
          );
          
          if (!resourceBelief || resourceBelief.value < resource.amount) {
            feasibility *= 0.7;
          }
        }
      }
      
      // Verificar pré-condições
      if (goal.preconditions) {
        const satisfiedPreconditions = goal.preconditions.filter(pc => 
          this.isPreconditionSatisfied(pc, beliefs)
        ).length;
        
        feasibility *= satisfiedPreconditions / goal.preconditions.length;
      }
      
      // Considerar complexidade
      if (goal.complexity) {
        feasibility *= Math.max(0.3, 1 - (goal.complexity * 0.3));
      }
      
      return Math.max(0.1, feasibility);
      
    } catch (error) {
      this.logger.error('Error assessing feasibility', {
        error: error.message,
        goal: goal.id
      });
      return 0.5;
    }
  }

  /**
   * Verificar se uma pré-condição está satisfeita
   */
  isPreconditionSatisfied(precondition, beliefs) {
    const relevantBelief = beliefs.find(b => 
      b.predicate === precondition.predicate &&
      JSON.stringify(b.arguments) === JSON.stringify(precondition.arguments)
    );
    
    if (!relevantBelief) {
      return false;
    }
    
    return this.evaluateCondition(relevantBelief.value, precondition.operator, precondition.value);
  }

  /**
   * Avaliar uma condição
   */
  evaluateCondition(actualValue, operator, expectedValue) {
    switch (operator) {
      case '==':
      case 'equals':
        return actualValue === expectedValue;
      case '!=':
      case 'not_equals':
        return actualValue !== expectedValue;
      case '>':
      case 'greater_than':
        return actualValue > expectedValue;
      case '>=':
      case 'greater_equal':
        return actualValue >= expectedValue;
      case '<':
      case 'less_than':
        return actualValue < expectedValue;
      case '<=':
      case 'less_equal':
        return actualValue <= expectedValue;
      case 'contains':
        return String(actualValue).includes(String(expectedValue));
      case 'exists':
        return actualValue !== null && actualValue !== undefined;
      default:
        return false;
    }
  }

  /**
   * Verificar se uma dependência está satisfeita
   */
  isDependencySatisfied(dependencyId) {
    const dependency = this.desires.get(dependencyId);
    return dependency && dependency.satisfaction >= this.config.satisfactionThreshold;
  }

  /**
   * Detectar conflitos entre desejos
   */
  async detectConflicts(newDesire) {
    const conflicts = [];
    
    for (const [id, existingDesire] of this.desires) {
      if (this.areConflicting(newDesire, existingDesire)) {
        conflicts.push(existingDesire);
      }
    }
    
    return conflicts;
  }

  /**
   * Verificar se dois desejos estão em conflito
   */
  areConflicting(desire1, desire2) {
    // Conflito de recursos
    if (this.hasResourceConflict(desire1, desire2)) {
      return true;
    }
    
    // Conflito de objetivos mutuamente exclusivos
    if (this.hasMutuallyExclusiveGoals(desire1, desire2)) {
      return true;
    }
    
    // Conflito de prioridade alta com recursos limitados
    if (desire1.priority > this.config.conflictThreshold &&
        desire2.priority > this.config.conflictThreshold &&
        this.hasOverlappingRequirements(desire1, desire2)) {
      return true;
    }
    
    return false;
  }

  /**
   * Verificar conflito de recursos
   */
  hasResourceConflict(desire1, desire2) {
    // Implementar lógica de conflito de recursos
    return false; // Placeholder
  }

  /**
   * Verificar objetivos mutuamente exclusivos
   */
  hasMutuallyExclusiveGoals(desire1, desire2) {
    // Implementar lógica de objetivos exclusivos
    return false; // Placeholder
  }

  /**
   * Verificar requisitos sobrepostos
   */
  hasOverlappingRequirements(desire1, desire2) {
    // Implementar lógica de sobreposição
    return false; // Placeholder
  }

  /**
   * Resolver conflitos entre desejos
   */
  async resolveConflicts(newDesire, conflicts) {
    try {
      for (const conflictingDesire of conflicts) {
        const resolution = await this.resolveConflict(newDesire, conflictingDesire);
        
        if (resolution.action === 'replace') {
          await this.removeDesire(conflictingDesire.id, 'replaced');
        } else if (resolution.action === 'merge') {
          const mergedDesire = this.mergeDesires(newDesire, conflictingDesire);
          await this.removeDesire(conflictingDesire.id, 'merged');
          Object.assign(newDesire, mergedDesire);
        } else if (resolution.action === 'reject') {
          throw new Error('New desire rejected due to conflict');
        } else if (resolution.action === 'modify') {
          // Modificar prioridades ou recursos
          newDesire.priority *= 0.8;
          conflictingDesire.priority *= 0.8;
          await this.updateDesire(conflictingDesire.id, { priority: conflictingDesire.priority });
        }
        
        this.stats.conflictsResolved++;
      }
      
    } catch (error) {
      this.logger.error('Error resolving conflicts', {
        error: error.message,
        newDesire: newDesire.id,
        conflicts: conflicts.map(c => c.id)
      });
      throw error;
    }
  }

  /**
   * Resolver conflito entre dois desejos específicos
   */
  async resolveConflict(newDesire, existingDesire) {
    // Priorizar por importância e urgência
    const newScore = newDesire.importance * newDesire.urgency;
    const existingScore = existingDesire.importance * existingDesire.urgency;
    
    if (newScore > existingScore * 1.2) {
      return { action: 'replace' };
    } else if (existingScore > newScore * 1.2) {
      return { action: 'reject' };
    } else {
      return { action: 'modify' };
    }
  }

  /**
   * Mesclar dois desejos
   */
  mergeDesires(desire1, desire2) {
    return {
      ...desire1,
      importance: Math.max(desire1.importance, desire2.importance),
      urgency: Math.max(desire1.urgency, desire2.urgency),
      feasibility: Math.min(desire1.feasibility, desire2.feasibility),
      cost: Math.max(desire1.cost, desire2.cost),
      description: `${desire1.description} & ${desire2.description}`,
      conditions: [...(desire1.conditions || []), ...(desire2.conditions || [])],
      constraints: [...(desire1.constraints || []), ...(desire2.constraints || [])]
    };
  }

  /**
   * Adicionar entrada ao histórico
   */
  addToHistory(action, desire, previousDesire = null, reason = null) {
    const historyEntry = {
      id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      desire: { ...desire },
      previousDesire: previousDesire ? { ...previousDesire } : null,
      reason,
      timestamp: new Date().toISOString()
    };
    
    this.desireHistory.push(historyEntry);
    
    // Limitar tamanho do histórico
    if (this.desireHistory.length > this.config.maxHistorySize) {
      this.desireHistory.shift();
    }
  }

  /**
   * Iniciar limpeza automática
   */
  startAutoCleanup() {
    setInterval(() => {
      this.cleanupExpiredDesires();
    }, 60000); // A cada minuto
  }

  /**
   * Limpar desejos expirados
   */
  async cleanupExpiredDesires() {
    const now = new Date();
    const expiredDesires = [];
    
    for (const [id, desire] of this.desires) {
      if (desire.expiresAt && new Date(desire.expiresAt) < now) {
        expiredDesires.push(id);
      }
    }
    
    for (const id of expiredDesires) {
      await this.removeDesire(id, 'expired');
    }
    
    if (expiredDesires.length > 0) {
      this.logger.info('Cleaned up expired desires', {
        count: expiredDesires.length
      });
    }
  }

  /**
   * Função hash simples
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Obter estatísticas
   */
  getStats() {
    return {
      ...this.stats,
      currentDesires: this.desires.size,
      historySize: this.desireHistory.length,
      config: this.config
    };
  }

  /**
   * Exportar desejos
   */
  exportDesires() {
    return {
      desires: Array.from(this.desires.entries()),
      history: this.desireHistory,
      stats: this.stats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Limpar todos os desejos
   */
  clear() {
    this.desires.clear();
    this.desireHistory = [];
    this.stats = {
      totalDesires: 0,
      desiresGenerated: 0,
      desiresSatisfied: 0,
      desiresAbandoned: 0,
      conflictsResolved: 0,
      lastUpdate: null
    };
    
    this.logger.info('All desires cleared');
  }
}

module.exports = DesireManager;