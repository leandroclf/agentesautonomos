/**
 * StateStore - Armazenamento e Versionamento de Estados
 * 
 * Responsabilidades:
 * - Armazenar estados de agentes em memória com persistência opcional
 * - Versionar mudanças de estado
 * - Manter histórico de alterações
 * - Fornecer APIs para consulta e atualização
 * - Implementar TTL para limpeza automática
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class StateStore extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxVersionsPerAgent: options.maxVersionsPerAgent || 100,
      defaultTTL: options.defaultTTL || 24 * 60 * 60 * 1000, // 24 horas
      cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1 hora
      enablePersistence: options.enablePersistence || false,
      persistencePath: options.persistencePath || './data/state-store.json',
      ...options
    };
    
    // Estrutura de dados principal
    this.states = new Map(); // agentId -> { current, versions, metadata }
    this.globalState = {
      systemStatus: 'initializing',
      lastUpdate: new Date().toISOString(),
      totalAgents: 0,
      activeAgents: 0
    };
    
    // Índices para consultas rápidas
    this.agentsByStatus = new Map(); // status -> Set(agentIds)
    this.agentsByType = new Map(); // type -> Set(agentIds)
    
    // Controle de limpeza
    this.cleanupTimer = null;
    
    // Estatísticas
    this.stats = {
      totalOperations: 0,
      totalStates: 0,
      totalVersions: 0,
      lastCleanup: null
    };
  }

  async initialize() {
    try {
      // Carregar estado persistido se habilitado
      if (this.options.enablePersistence) {
        await this.loadPersistedState();
      }
      
      // Iniciar limpeza automática
      this.startCleanupTimer();
      
      // Atualizar estado global
      this.globalState.systemStatus = 'running';
      this.globalState.lastUpdate = new Date().toISOString();
      
      this.emit('initialized');
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Criar ou atualizar estado de um agente
   */
  setState(agentId, state, metadata = {}) {
    try {
      const timestamp = new Date().toISOString();
      const version = this.generateVersion();
      
      // Validar entrada
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('Agent ID must be a non-empty string');
      }
      
      if (!state || typeof state !== 'object') {
        throw new Error('State must be an object');
      }
      
      // Obter estado atual ou criar novo
      let agentState = this.states.get(agentId);
      const isNewAgent = !agentState;
      
      if (isNewAgent) {
        agentState = {
          current: null,
          versions: [],
          metadata: {
            createdAt: timestamp,
            agentType: metadata.agentType || 'unknown',
            ...metadata
          }
        };
        this.states.set(agentId, agentState);
      }
      
      // Criar nova versão
      const newVersion = {
        version,
        state: this.deepClone(state),
        timestamp,
        metadata: {
          ...metadata,
          previousVersion: agentState.current?.version || null,
          changeType: this.detectChangeType(agentState.current?.state, state)
        }
      };
      
      // Atualizar estado atual
      const previousState = agentState.current;
      agentState.current = newVersion;
      
      // Adicionar à lista de versões
      agentState.versions.unshift(newVersion);
      
      // Limitar número de versões
      if (agentState.versions.length > this.options.maxVersionsPerAgent) {
        agentState.versions = agentState.versions.slice(0, this.options.maxVersionsPerAgent);
      }
      
      // Atualizar índices
      this.updateIndices(agentId, state, previousState?.state);
      
      // Atualizar estatísticas
      this.stats.totalOperations++;
      if (isNewAgent) {
        this.stats.totalStates++;
        this.globalState.totalAgents++;
      }
      this.stats.totalVersions++;
      
      // Atualizar estado global
      this.updateGlobalState();
      
      // Emitir eventos
      this.emit('stateChanged', {
        agentId,
        newState: state,
        previousState: previousState?.state || null,
        version,
        timestamp,
        isNewAgent
      });
      
      // Persistir se habilitado
      if (this.options.enablePersistence) {
        this.scheduleStatePersistence();
      }
      
      return {
        success: true,
        version,
        timestamp,
        agentId
      };
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Obter estado atual de um agente
   */
  getState(agentId, options = {}) {
    const agentState = this.states.get(agentId);
    
    if (!agentState) {
      return null;
    }
    
    const result = {
      agentId,
      state: this.deepClone(agentState.current.state),
      version: agentState.current.version,
      timestamp: agentState.current.timestamp,
      metadata: agentState.metadata
    };
    
    // Incluir histórico se solicitado
    if (options.includeHistory) {
      result.history = agentState.versions.slice(1, (options.historyLimit || 10) + 1)
        .map(v => ({
          version: v.version,
          timestamp: v.timestamp,
          metadata: v.metadata,
          ...(options.includeHistoryState ? { state: v.state } : {})
        }));
    }
    
    return result;
  }

  /**
   * Obter versão específica de um estado
   */
  getStateVersion(agentId, version) {
    const agentState = this.states.get(agentId);
    
    if (!agentState) {
      return null;
    }
    
    const versionData = agentState.versions.find(v => v.version === version);
    
    if (!versionData) {
      return null;
    }
    
    return {
      agentId,
      state: this.deepClone(versionData.state),
      version: versionData.version,
      timestamp: versionData.timestamp,
      metadata: versionData.metadata
    };
  }

  /**
   * Listar todos os agentes
   */
  listAgents(filters = {}) {
    const agents = [];
    
    for (const [agentId, agentState] of this.states.entries()) {
      // Aplicar filtros
      if (filters.status && agentState.current.state.status !== filters.status) {
        continue;
      }
      
      if (filters.type && agentState.metadata.agentType !== filters.type) {
        continue;
      }
      
      if (filters.since) {
        const since = new Date(filters.since);
        const lastUpdate = new Date(agentState.current.timestamp);
        if (lastUpdate < since) {
          continue;
        }
      }
      
      agents.push({
        agentId,
        status: agentState.current.state.status || 'unknown',
        type: agentState.metadata.agentType,
        lastUpdate: agentState.current.timestamp,
        version: agentState.current.version,
        versionsCount: agentState.versions.length
      });
    }
    
    // Ordenar por última atualização
    agents.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
    
    return agents;
  }

  /**
   * Remover estado de um agente
   */
  removeState(agentId) {
    const agentState = this.states.get(agentId);
    
    if (!agentState) {
      return false;
    }
    
    // Remover dos índices
    this.removeFromIndices(agentId, agentState.current.state);
    
    // Remover do armazenamento principal
    this.states.delete(agentId);
    
    // Atualizar estatísticas
    this.stats.totalStates--;
    this.stats.totalVersions -= agentState.versions.length;
    this.globalState.totalAgents--;
    
    // Atualizar estado global
    this.updateGlobalState();
    
    // Emitir evento
    this.emit('stateRemoved', { agentId });
    
    return true;
  }

  /**
   * Obter estado global do sistema
   */
  getGlobalState() {
    return {
      ...this.globalState,
      stats: this.getStats()
    };
  }

  /**
   * Obter estatísticas do store
   */
  getStats() {
    const agentStates = {};
    let totalSizeBytes = 0;
    
    for (const [agentId, agentState] of this.states.entries()) {
      const sizeBytes = this.calculateStateSize(agentState);
      totalSizeBytes += sizeBytes;
      
      agentStates[agentId] = {
        versions: agentState.versions.length,
        sizeBytes,
        lastUpdate: agentState.current.timestamp,
        status: agentState.current.state.status || 'unknown'
      };
    }
    
    return {
      ...this.stats,
      totalSizeBytes,
      agentStates,
      activeAgents: this.globalState.activeAgents,
      totalAgents: this.globalState.totalAgents
    };
  }

  // Métodos auxiliares
  
  generateVersion() {
    return crypto.randomBytes(8).toString('hex');
  }
  
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  
  detectChangeType(previousState, newState) {
    if (!previousState) return 'created';
    
    const prevStatus = previousState.status;
    const newStatus = newState.status;
    
    if (prevStatus !== newStatus) {
      return 'status_change';
    }
    
    // Comparação simples de propriedades
    const prevKeys = Object.keys(previousState).sort();
    const newKeys = Object.keys(newState).sort();
    
    if (JSON.stringify(prevKeys) !== JSON.stringify(newKeys)) {
      return 'structure_change';
    }
    
    return 'data_update';
  }
  
  updateIndices(agentId, newState, previousState) {
    // Remover dos índices antigos
    if (previousState) {
      this.removeFromIndices(agentId, previousState);
    }
    
    // Adicionar aos novos índices
    const status = newState.status || 'unknown';
    if (!this.agentsByStatus.has(status)) {
      this.agentsByStatus.set(status, new Set());
    }
    this.agentsByStatus.get(status).add(agentId);
    
    const agentState = this.states.get(agentId);
    const type = agentState.metadata.agentType || 'unknown';
    if (!this.agentsByType.has(type)) {
      this.agentsByType.set(type, new Set());
    }
    this.agentsByType.get(type).add(agentId);
  }
  
  removeFromIndices(agentId, state) {
    const status = state.status || 'unknown';
    if (this.agentsByStatus.has(status)) {
      this.agentsByStatus.get(status).delete(agentId);
      if (this.agentsByStatus.get(status).size === 0) {
        this.agentsByStatus.delete(status);
      }
    }
    
    const agentState = this.states.get(agentId);
    if (agentState) {
      const type = agentState.metadata.agentType || 'unknown';
      if (this.agentsByType.has(type)) {
        this.agentsByType.get(type).delete(agentId);
        if (this.agentsByType.get(type).size === 0) {
          this.agentsByType.delete(type);
        }
      }
    }
  }
  
  updateGlobalState() {
    this.globalState.lastUpdate = new Date().toISOString();
    this.globalState.activeAgents = Array.from(this.agentsByStatus.get('running') || []).length;
  }
  
  calculateStateSize(agentState) {
    return Buffer.byteLength(JSON.stringify(agentState), 'utf8');
  }
  
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.options.cleanupInterval);
  }
  
  performCleanup() {
    const now = Date.now();
    let cleanedVersions = 0;
    
    for (const [agentId, agentState] of this.states.entries()) {
      // Limpar versões antigas baseado em TTL
      const originalLength = agentState.versions.length;
      agentState.versions = agentState.versions.filter(version => {
        const versionAge = now - new Date(version.timestamp).getTime();
        return versionAge < this.options.defaultTTL;
      });
      
      cleanedVersions += originalLength - agentState.versions.length;
    }
    
    this.stats.totalVersions -= cleanedVersions;
    this.stats.lastCleanup = new Date().toISOString();
    
    if (cleanedVersions > 0) {
      this.emit('cleanup', { cleanedVersions, timestamp: this.stats.lastCleanup });
    }
  }
  
  async loadPersistedState() {
    // Implementação de persistência seria adicionada aqui
    // Por enquanto, apenas um placeholder
  }
  
  scheduleStatePersistence() {
    // Implementação de persistência seria adicionada aqui
    // Por enquanto, apenas um placeholder
  }
  
  async shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.options.enablePersistence) {
      await this.scheduleStatePersistence();
    }
    
    this.emit('shutdown');
  }
}

module.exports = StateStore;