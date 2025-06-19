/**
 * Belief Manager - Gerenciador de Crenças BDI
 * Responsável por manter e atualizar as crenças do agente
 * 
 * Responsabilidades:
 * - Armazenar e organizar crenças
 * - Atualizar crenças baseado em percepções
 * - Resolver conflitos entre crenças
 * - Manter histórico de mudanças
 * - Fornecer consultas sobre crenças
 */

class BeliefManager {
  constructor(logger) {
    this.logger = logger;
    this.beliefs = new Map();
    this.beliefHistory = [];
    this.conflictResolutionStrategy = 'timestamp-based'; // 'timestamp-based', 'confidence-based', 'source-based'
    
    // Configurações
    this.config = {
      maxBeliefs: 1000,
      maxHistorySize: 5000,
      defaultConfidence: 0.8,
      conflictThreshold: 0.1,
      expirationTime: 24 * 60 * 60 * 1000, // 24 horas
      enableAutoCleanup: true
    };
    
    // Estatísticas
    this.stats = {
      totalBeliefs: 0,
      beliefsAdded: 0,
      beliefsUpdated: 0,
      beliefsRemoved: 0,
      conflictsResolved: 0,
      lastUpdate: null
    };
    
    // Inicializar limpeza automática
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Adicionar uma nova crença
   */
  async addBelief(beliefData) {
    try {
      const belief = this.createBelief(beliefData);
      
      // Verificar conflitos
      const conflicts = await this.detectConflicts(belief);
      
      if (conflicts.length > 0) {
        await this.resolveConflicts(belief, conflicts);
      }
      
      // Adicionar crença
      this.beliefs.set(belief.id, belief);
      
      // Adicionar ao histórico
      this.addToHistory('added', belief);
      
      // Atualizar estatísticas
      this.stats.beliefsAdded++;
      this.stats.totalBeliefs = this.beliefs.size;
      this.stats.lastUpdate = new Date().toISOString();
      
      this.logger.info('Belief added', {
        beliefId: belief.id,
        predicate: belief.predicate,
        confidence: belief.confidence
      });
      
      return belief;
      
    } catch (error) {
      this.logger.error('Error adding belief', {
        error: error.message,
        beliefData
      });
      throw error;
    }
  }

  /**
   * Atualizar uma crença existente
   */
  async updateBelief(perception) {
    try {
      const beliefId = this.generateBeliefId(perception.predicate, perception.arguments);
      const existingBelief = this.beliefs.get(beliefId);
      
      if (existingBelief) {
        // Atualizar crença existente
        const updatedBelief = {
          ...existingBelief,
          value: perception.value,
          confidence: this.calculateNewConfidence(existingBelief, perception),
          source: perception.source,
          timestamp: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        
        this.beliefs.set(beliefId, updatedBelief);
        this.addToHistory('updated', updatedBelief, existingBelief);
        
        this.stats.beliefsUpdated++;
        
        this.logger.info('Belief updated', {
          beliefId,
          oldValue: existingBelief.value,
          newValue: updatedBelief.value,
          confidence: updatedBelief.confidence
        });
        
        return updatedBelief;
        
      } else {
        // Criar nova crença
        return await this.addBelief({
          predicate: perception.predicate,
          arguments: perception.arguments,
          value: perception.value,
          confidence: perception.confidence || this.config.defaultConfidence,
          source: perception.source
        });
      }
      
    } catch (error) {
      this.logger.error('Error updating belief', {
        error: error.message,
        perception
      });
      throw error;
    }
  }

  /**
   * Remover uma crença
   */
  async removeBelief(beliefId) {
    try {
      const belief = this.beliefs.get(beliefId);
      
      if (belief) {
        this.beliefs.delete(beliefId);
        this.addToHistory('removed', belief);
        
        this.stats.beliefsRemoved++;
        this.stats.totalBeliefs = this.beliefs.size;
        
        this.logger.info('Belief removed', { beliefId });
        
        return true;
      }
      
      return false;
      
    } catch (error) {
      this.logger.error('Error removing belief', {
        error: error.message,
        beliefId
      });
      throw error;
    }
  }

  /**
   * Obter uma crença específica
   */
  getBelief(beliefId) {
    return this.beliefs.get(beliefId);
  }

  /**
   * Obter todas as crenças
   */
  getAllBeliefs() {
    return Array.from(this.beliefs.values());
  }

  /**
   * Buscar crenças por predicado
   */
  getBeliefsByPredicate(predicate) {
    return Array.from(this.beliefs.values())
      .filter(belief => belief.predicate === predicate);
  }

  /**
   * Buscar crenças por fonte
   */
  getBeliefsBySource(source) {
    return Array.from(this.beliefs.values())
      .filter(belief => belief.source === source);
  }

  /**
   * Buscar crenças com confiança mínima
   */
  getBeliefsByConfidence(minConfidence) {
    return Array.from(this.beliefs.values())
      .filter(belief => belief.confidence >= minConfidence);
  }

  /**
   * Verificar se uma crença existe
   */
  hasBelief(predicate, args = []) {
    const beliefId = this.generateBeliefId(predicate, args);
    return this.beliefs.has(beliefId);
  }

  /**
   * Consultar valor de uma crença
   */
  queryBelief(predicate, args = []) {
    const beliefId = this.generateBeliefId(predicate, args);
    const belief = this.beliefs.get(beliefId);
    return belief ? belief.value : null;
  }

  /**
   * Criar uma nova crença
   */
  createBelief(beliefData) {
    const belief = {
      id: this.generateBeliefId(beliefData.predicate, beliefData.arguments || []),
      predicate: beliefData.predicate,
      arguments: beliefData.arguments || [],
      value: beliefData.value,
      confidence: beliefData.confidence || this.config.defaultConfidence,
      source: beliefData.source || 'unknown',
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      expiresAt: beliefData.expiresAt || new Date(Date.now() + this.config.expirationTime).toISOString()
    };
    
    return belief;
  }

  /**
   * Gerar ID único para uma crença
   */
  generateBeliefId(predicate, args = []) {
    const argsStr = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(',');
    
    return `${predicate}(${argsStr})`;
  }

  /**
   * Detectar conflitos com uma nova crença
   */
  async detectConflicts(newBelief) {
    const conflicts = [];
    
    for (const [id, existingBelief] of this.beliefs) {
      if (this.areConflicting(newBelief, existingBelief)) {
        conflicts.push(existingBelief);
      }
    }
    
    return conflicts;
  }

  /**
   * Verificar se duas crenças estão em conflito
   */
  areConflicting(belief1, belief2) {
    // Mesmo predicado e argumentos, mas valores diferentes
    if (belief1.predicate === belief2.predicate &&
        JSON.stringify(belief1.arguments) === JSON.stringify(belief2.arguments)) {
      
      // Verificar se os valores são conflitantes
      if (typeof belief1.value === 'boolean' && typeof belief2.value === 'boolean') {
        return belief1.value !== belief2.value;
      }
      
      if (typeof belief1.value === 'number' && typeof belief2.value === 'number') {
        return Math.abs(belief1.value - belief2.value) > this.config.conflictThreshold;
      }
      
      if (typeof belief1.value === 'string' && typeof belief2.value === 'string') {
        return belief1.value !== belief2.value;
      }
    }
    
    return false;
  }

  /**
   * Resolver conflitos entre crenças
   */
  async resolveConflicts(newBelief, conflicts) {
    try {
      for (const conflictingBelief of conflicts) {
        const resolution = await this.resolveConflict(newBelief, conflictingBelief);
        
        if (resolution.action === 'replace') {
          await this.removeBelief(conflictingBelief.id);
        } else if (resolution.action === 'merge') {
          // Mesclar crenças
          const mergedBelief = this.mergeBeliefs(newBelief, conflictingBelief);
          newBelief.value = mergedBelief.value;
          newBelief.confidence = mergedBelief.confidence;
          await this.removeBelief(conflictingBelief.id);
        } else if (resolution.action === 'reject') {
          throw new Error('New belief rejected due to conflict');
        }
        
        this.stats.conflictsResolved++;
      }
      
    } catch (error) {
      this.logger.error('Error resolving conflicts', {
        error: error.message,
        newBelief: newBelief.id,
        conflicts: conflicts.map(c => c.id)
      });
      throw error;
    }
  }

  /**
   * Resolver conflito entre duas crenças específicas
   */
  async resolveConflict(newBelief, existingBelief) {
    switch (this.conflictResolutionStrategy) {
      case 'confidence-based':
        return newBelief.confidence > existingBelief.confidence 
          ? { action: 'replace' } 
          : { action: 'reject' };
      
      case 'timestamp-based':
        return new Date(newBelief.timestamp) > new Date(existingBelief.timestamp)
          ? { action: 'replace' }
          : { action: 'reject' };
      
      case 'source-based':
        const sourceReliability = this.getSourceReliability(newBelief.source);
        const existingSourceReliability = this.getSourceReliability(existingBelief.source);
        
        return sourceReliability > existingSourceReliability
          ? { action: 'replace' }
          : { action: 'reject' };
      
      default:
        return { action: 'merge' };
    }
  }

  /**
   * Mesclar duas crenças conflitantes
   */
  mergeBeliefs(belief1, belief2) {
    const totalConfidence = belief1.confidence + belief2.confidence;
    const weight1 = belief1.confidence / totalConfidence;
    const weight2 = belief2.confidence / totalConfidence;
    
    let mergedValue;
    
    if (typeof belief1.value === 'number' && typeof belief2.value === 'number') {
      mergedValue = belief1.value * weight1 + belief2.value * weight2;
    } else {
      // Para outros tipos, usar a crença com maior confiança
      mergedValue = belief1.confidence > belief2.confidence ? belief1.value : belief2.value;
    }
    
    return {
      value: mergedValue,
      confidence: Math.max(belief1.confidence, belief2.confidence) * 0.9 // Reduzir confiança devido ao conflito
    };
  }

  /**
   * Calcular nova confiança baseada em atualização
   */
  calculateNewConfidence(existingBelief, perception) {
    const perceptionConfidence = perception.confidence || this.config.defaultConfidence;
    
    // Média ponderada das confianças
    const alpha = 0.7; // Peso da nova percepção
    return alpha * perceptionConfidence + (1 - alpha) * existingBelief.confidence;
  }

  /**
   * Obter confiabilidade de uma fonte
   */
  getSourceReliability(source) {
    const reliabilityMap = {
      'sensor': 0.9,
      'user': 0.7,
      'agent': 0.8,
      'system': 0.95,
      'external': 0.6,
      'unknown': 0.5
    };
    
    return reliabilityMap[source] || 0.5;
  }

  /**
   * Adicionar entrada ao histórico
   */
  addToHistory(action, belief, previousBelief = null) {
    const historyEntry = {
      id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      belief: { ...belief },
      previousBelief: previousBelief ? { ...previousBelief } : null,
      timestamp: new Date().toISOString()
    };
    
    this.beliefHistory.push(historyEntry);
    
    // Limitar tamanho do histórico
    if (this.beliefHistory.length > this.config.maxHistorySize) {
      this.beliefHistory.shift();
    }
  }

  /**
   * Obter histórico de mudanças
   */
  getHistory(limit = 100) {
    return this.beliefHistory.slice(-limit);
  }

  /**
   * Iniciar limpeza automática de crenças expiradas
   */
  startAutoCleanup() {
    setInterval(() => {
      this.cleanupExpiredBeliefs();
    }, 60000); // A cada minuto
  }

  /**
   * Limpar crenças expiradas
   */
  async cleanupExpiredBeliefs() {
    const now = new Date();
    const expiredBeliefs = [];
    
    for (const [id, belief] of this.beliefs) {
      if (belief.expiresAt && new Date(belief.expiresAt) < now) {
        expiredBeliefs.push(id);
      }
    }
    
    for (const id of expiredBeliefs) {
      await this.removeBelief(id);
    }
    
    if (expiredBeliefs.length > 0) {
      this.logger.info('Cleaned up expired beliefs', {
        count: expiredBeliefs.length
      });
    }
  }

  /**
   * Obter estatísticas do Belief Manager
   */
  getStats() {
    return {
      ...this.stats,
      currentBeliefs: this.beliefs.size,
      historySize: this.beliefHistory.length,
      config: this.config
    };
  }

  /**
   * Exportar crenças para backup
   */
  exportBeliefs() {
    return {
      beliefs: Array.from(this.beliefs.entries()),
      history: this.beliefHistory,
      stats: this.stats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Importar crenças de backup
   */
  async importBeliefs(backup) {
    try {
      this.beliefs.clear();
      
      for (const [id, belief] of backup.beliefs) {
        this.beliefs.set(id, belief);
      }
      
      this.beliefHistory = backup.history || [];
      this.stats = { ...this.stats, ...backup.stats };
      
      this.logger.info('Beliefs imported successfully', {
        beliefsCount: this.beliefs.size,
        historyCount: this.beliefHistory.length
      });
      
    } catch (error) {
      this.logger.error('Error importing beliefs', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Limpar todas as crenças
   */
  clear() {
    this.beliefs.clear();
    this.beliefHistory = [];
    this.stats = {
      totalBeliefs: 0,
      beliefsAdded: 0,
      beliefsUpdated: 0,
      beliefsRemoved: 0,
      conflictsResolved: 0,
      lastUpdate: null
    };
    
    this.logger.info('All beliefs cleared');
  }
}

module.exports = BeliefManager;