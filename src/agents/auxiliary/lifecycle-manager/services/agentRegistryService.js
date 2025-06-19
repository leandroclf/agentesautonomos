/**
 * Agent Registry Service
 * Serviço para gerenciamento do registro e estado dos agentes
 */

const EventEmitter = require('events')
const config = require('../config/lifecycleConfig')

class AgentRegistryService extends EventEmitter {
  constructor(cacheService, logger) {
    super()
    this.cache = cacheService
    this.logger = logger
    this.agents = new Map()
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Agent Registry Service...')
      
      // Carregar agentes do cache se disponível
      await this.loadFromCache()
      
      this.isInitialized = true
      this.logger.info('Agent Registry Service inicializado com sucesso')
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Agent Registry Service:', error)
      throw error
    }
  }

  async loadFromCache() {
    try {
      const cachedAgents = await this.cache.get('agent_registry')
      if (cachedAgents) {
        const agentsData = JSON.parse(cachedAgents)
        for (const [agentId, agentData] of Object.entries(agentsData)) {
          this.agents.set(agentId, agentData)
        }
        this.logger.info(`${this.agents.size} agentes carregados do cache`)
      }
    } catch (error) {
      this.logger.warn('Erro ao carregar agentes do cache:', error)
    }
  }

  async saveToCache() {
    try {
      const agentsData = Object.fromEntries(this.agents)
      await this.cache.set('agent_registry', JSON.stringify(agentsData), 3600) // 1 hora
    } catch (error) {
      this.logger.warn('Erro ao salvar agentes no cache:', error)
    }
  }

  async registerAgent(agentId, agentConfig) {
    try {
      if (this.agents.has(agentId)) {
        this.logger.warn(`Agente ${agentId} já está registrado, atualizando...`)
      }

      const agentData = {
        id: agentId,
        ...agentConfig,
        registeredAt: agentConfig.registeredAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state: agentConfig.state || config.agents.states.STOPPED,
        restartCount: agentConfig.restartCount || 0,
        metadata: {
          ...agentConfig.metadata,
          version: agentConfig.version || '1.0.0',
          category: agentConfig.category || 'unknown'
        }
      }

      this.agents.set(agentId, agentData)
      await this.saveToCache()

      this.logger.info(`Agente ${agentId} registrado com sucesso`)
      this.emit('agentRegistered', { agentId, agentData })

      return agentData

    } catch (error) {
      this.logger.error(`Erro ao registrar agente ${agentId}:`, error)
      throw error
    }
  }

  async unregisterAgent(agentId) {
    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agente ${agentId} não está registrado`)
      }

      const agentData = this.agents.get(agentId)
      this.agents.delete(agentId)
      await this.saveToCache()

      this.logger.info(`Agente ${agentId} removido do registro`)
      this.emit('agentUnregistered', { agentId, agentData })

      return true

    } catch (error) {
      this.logger.error(`Erro ao remover agente ${agentId} do registro:`, error)
      throw error
    }
  }

  async getAgent(agentId) {
    try {
      const agent = this.agents.get(agentId)
      if (!agent) {
        return null
      }

      // Retornar cópia para evitar modificações diretas
      return { ...agent }

    } catch (error) {
      this.logger.error(`Erro ao obter agente ${agentId}:`, error)
      throw error
    }
  }

  async getAllAgents() {
    try {
      return Array.from(this.agents.values()).map(agent => ({ ...agent }))
    } catch (error) {
      this.logger.error('Erro ao obter todos os agentes:', error)
      throw error
    }
  }

  async getAgentsByState(state) {
    try {
      return Array.from(this.agents.values())
        .filter(agent => agent.state === state)
        .map(agent => ({ ...agent }))
    } catch (error) {
      this.logger.error(`Erro ao obter agentes por estado ${state}:`, error)
      throw error
    }
  }

  async getAgentsByCategory(category) {
    try {
      return Array.from(this.agents.values())
        .filter(agent => agent.metadata?.category === category)
        .map(agent => ({ ...agent }))
    } catch (error) {
      this.logger.error(`Erro ao obter agentes por categoria ${category}:`, error)
      throw error
    }
  }

  async updateAgent(agentId, updates) {
    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agente ${agentId} não está registrado`)
      }

      const currentAgent = this.agents.get(agentId)
      const updatedAgent = {
        ...currentAgent,
        ...updates,
        id: agentId, // Garantir que o ID não seja alterado
        updatedAt: new Date().toISOString()
      }

      this.agents.set(agentId, updatedAgent)
      await this.saveToCache()

      this.logger.debug(`Agente ${agentId} atualizado`)
      this.emit('agentUpdated', { agentId, oldData: currentAgent, newData: updatedAgent })

      return updatedAgent

    } catch (error) {
      this.logger.error(`Erro ao atualizar agente ${agentId}:`, error)
      throw error
    }
  }

  async updateAgentState(agentId, newState, additionalData = {}) {
    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agente ${agentId} não está registrado`)
      }

      const currentAgent = this.agents.get(agentId)
      const oldState = currentAgent.state

      const updates = {
        state: newState,
        lastStateChange: new Date().toISOString(),
        ...additionalData
      }

      // Adicionar timestamps específicos baseados no estado
      switch (newState) {
        case config.agents.states.STARTING:
          updates.startingAt = new Date().toISOString()
          break
        case config.agents.states.RUNNING:
          updates.startedAt = updates.startedAt || new Date().toISOString()
          updates.lastSeen = new Date().toISOString()
          break
        case config.agents.states.STOPPING:
          updates.stoppingAt = new Date().toISOString()
          break
        case config.agents.states.STOPPED:
          updates.stoppedAt = new Date().toISOString()
          updates.processId = null
          break
        case config.agents.states.FAILED:
          updates.failedAt = new Date().toISOString()
          updates.processId = null
          break
      }

      const updatedAgent = await this.updateAgent(agentId, updates)

      this.logger.info(`Estado do agente ${agentId} alterado de ${oldState} para ${newState}`)
      this.emit('agentStateChanged', { agentId, oldState, newState, agentData: updatedAgent })

      return updatedAgent

    } catch (error) {
      this.logger.error(`Erro ao atualizar estado do agente ${agentId}:`, error)
      throw error
    }
  }

  async updateAgentHealth(agentId, healthData) {
    try {
      if (!this.agents.has(agentId)) {
        this.logger.warn(`Tentativa de atualizar health de agente não registrado: ${agentId}`)
        return null
      }

      const updates = {
        lastSeen: new Date().toISOString(),
        health: {
          ...healthData,
          lastCheck: new Date().toISOString()
        }
      }

      // Se o agente estava em estado UNKNOWN e agora está saudável, mudar para RUNNING
      const currentAgent = this.agents.get(agentId)
      if (currentAgent.state === config.agents.states.UNKNOWN && healthData.status === 'healthy') {
        updates.state = config.agents.states.RUNNING
      }

      const updatedAgent = await this.updateAgent(agentId, updates)

      this.logger.debug(`Health do agente ${agentId} atualizado: ${healthData.status}`)
      this.emit('agentHealthUpdated', { agentId, healthData, agentData: updatedAgent })

      return updatedAgent

    } catch (error) {
      this.logger.error(`Erro ao atualizar health do agente ${agentId}:`, error)
      throw error
    }
  }

  async incrementRestartCount(agentId) {
    try {
      const currentAgent = this.agents.get(agentId)
      if (!currentAgent) {
        throw new Error(`Agente ${agentId} não está registrado`)
      }

      const newCount = (currentAgent.restartCount || 0) + 1
      const updatedAgent = await this.updateAgent(agentId, {
        restartCount: newCount,
        lastRestart: new Date().toISOString()
      })

      this.logger.info(`Contador de restart do agente ${agentId} incrementado para ${newCount}`)
      return newCount

    } catch (error) {
      this.logger.error(`Erro ao incrementar contador de restart do agente ${agentId}:`, error)
      throw error
    }
  }

  async resetRestartCount(agentId) {
    try {
      const updatedAgent = await this.updateAgent(agentId, {
        restartCount: 0,
        restartCountReset: new Date().toISOString()
      })

      this.logger.info(`Contador de restart do agente ${agentId} resetado`)
      return updatedAgent

    } catch (error) {
      this.logger.error(`Erro ao resetar contador de restart do agente ${agentId}:`, error)
      throw error
    }
  }

  async getAgentCount() {
    return this.agents.size
  }

  async getAgentStatistics() {
    try {
      const agents = Array.from(this.agents.values())
      const stats = {
        total: agents.length,
        byState: {},
        byCategory: {},
        totalRestarts: 0,
        averageUptime: 0,
        healthyAgents: 0,
        unhealthyAgents: 0
      }

      let totalUptime = 0
      let agentsWithUptime = 0

      agents.forEach(agent => {
        // Estatísticas por estado
        stats.byState[agent.state] = (stats.byState[agent.state] || 0) + 1

        // Estatísticas por categoria
        const category = agent.metadata?.category || 'unknown'
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1

        // Total de restarts
        stats.totalRestarts += agent.restartCount || 0

        // Uptime
        if (agent.startedAt && agent.state === config.agents.states.RUNNING) {
          const uptime = Date.now() - new Date(agent.startedAt).getTime()
          totalUptime += uptime
          agentsWithUptime++
        }

        // Health status
        if (agent.health?.status === 'healthy') {
          stats.healthyAgents++
        } else if (agent.health?.status === 'unhealthy') {
          stats.unhealthyAgents++
        }
      })

      if (agentsWithUptime > 0) {
        stats.averageUptime = Math.round(totalUptime / agentsWithUptime)
      }

      return stats

    } catch (error) {
      this.logger.error('Erro ao obter estatísticas dos agentes:', error)
      throw error
    }
  }

  async findAgentsByPattern(pattern) {
    try {
      const regex = new RegExp(pattern, 'i')
      return Array.from(this.agents.values())
        .filter(agent => {
          return regex.test(agent.id) || 
                 regex.test(agent.name || '') || 
                 regex.test(agent.description || '') ||
                 regex.test(agent.metadata?.category || '')
        })
        .map(agent => ({ ...agent }))
    } catch (error) {
      this.logger.error(`Erro ao buscar agentes por padrão ${pattern}:`, error)
      throw error
    }
  }

  async getAgentDependencies(agentId) {
    try {
      const agent = this.agents.get(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não está registrado`)
      }

      const dependencies = agent.dependencies || []
      const dependencyDetails = []

      for (const depId of dependencies) {
        const dep = this.agents.get(depId)
        if (dep) {
          dependencyDetails.push({
            id: depId,
            state: dep.state,
            healthy: dep.health?.status === 'healthy',
            lastSeen: dep.lastSeen
          })
        } else {
          dependencyDetails.push({
            id: depId,
            state: 'not_registered',
            healthy: false,
            lastSeen: null
          })
        }
      }

      return dependencyDetails

    } catch (error) {
      this.logger.error(`Erro ao obter dependências do agente ${agentId}:`, error)
      throw error
    }
  }

  async getAgentDependents(agentId) {
    try {
      const dependents = []
      
      for (const [id, agent] of this.agents) {
        if (agent.dependencies && agent.dependencies.includes(agentId)) {
          dependents.push({
            id,
            state: agent.state,
            healthy: agent.health?.status === 'healthy',
            lastSeen: agent.lastSeen
          })
        }
      }

      return dependents

    } catch (error) {
      this.logger.error(`Erro ao obter dependentes do agente ${agentId}:`, error)
      throw error
    }
  }

  async validateAgentConfig(agentConfig) {
    const errors = []

    // Validações obrigatórias
    if (!agentConfig.name) {
      errors.push('Nome do agente é obrigatório')
    }

    if (!agentConfig.port || typeof agentConfig.port !== 'number') {
      errors.push('Porta do agente deve ser um número válido')
    }

    if (!agentConfig.healthEndpoint) {
      errors.push('Endpoint de health é obrigatório')
    }

    if (!agentConfig.startCommand) {
      errors.push('Comando de start é obrigatório')
    }

    // Validar dependências
    if (agentConfig.dependencies) {
      if (!Array.isArray(agentConfig.dependencies)) {
        errors.push('Dependências devem ser um array')
      } else {
        for (const dep of agentConfig.dependencies) {
          if (typeof dep !== 'string') {
            errors.push('IDs de dependências devem ser strings')
          }
        }
      }
    }

    // Validar política de restart
    if (agentConfig.restartPolicy) {
      const validPolicies = ['never', 'always', 'on-failure']
      if (!validPolicies.includes(agentConfig.restartPolicy)) {
        errors.push(`Política de restart deve ser uma de: ${validPolicies.join(', ')}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  async exportRegistry() {
    try {
      const agents = Array.from(this.agents.values())
      return {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        agentCount: agents.length,
        agents
      }
    } catch (error) {
      this.logger.error('Erro ao exportar registry:', error)
      throw error
    }
  }

  async importRegistry(registryData) {
    try {
      if (!registryData.agents || !Array.isArray(registryData.agents)) {
        throw new Error('Dados de registry inválidos')
      }

      let imported = 0
      let errors = 0

      for (const agentData of registryData.agents) {
        try {
          await this.registerAgent(agentData.id, agentData)
          imported++
        } catch (error) {
          this.logger.error(`Erro ao importar agente ${agentData.id}:`, error)
          errors++
        }
      }

      this.logger.info(`Registry importado: ${imported} agentes importados, ${errors} erros`)
      return { imported, errors }

    } catch (error) {
      this.logger.error('Erro ao importar registry:', error)
      throw error
    }
  }

  async clearRegistry() {
    try {
      const count = this.agents.size
      this.agents.clear()
      await this.saveToCache()
      
      this.logger.info(`Registry limpo: ${count} agentes removidos`)
      this.emit('registryCleared', { removedCount: count })
      
      return count
    } catch (error) {
      this.logger.error('Erro ao limpar registry:', error)
      throw error
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Agent Registry Service...')
      
      // Salvar estado final no cache
      await this.saveToCache()
      
      this.isInitialized = false
      this.logger.info('Agent Registry Service finalizado')
      
    } catch (error) {
      this.logger.error('Erro ao finalizar Agent Registry Service:', error)
      throw error
    }
  }
}

module.exports = AgentRegistryService