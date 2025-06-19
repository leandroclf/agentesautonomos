/**
 * Dependency Service - Gerenciamento de Dependências entre Agentes
 * Responsável por coordenar a inicialização e parada de agentes baseado em suas dependências
 */

const EventEmitter = require('events')

class DependencyService extends EventEmitter {
  constructor({ config, lifecycle, cache, metrics, logger }) {
    super()
    this.config = config
    this.lifecycle = lifecycle
    this.cache = cache
    this.metrics = metrics
    this.logger = logger
    this.dependencyMap = new Map()
    this.reverseDependencyMap = new Map()
    this.waitingQueue = new Map()
    this.checkInterval = null
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Dependency Service...')

      // Construir mapas de dependências
      this.buildDependencyMaps()

      // Configurar listeners
      this.setupEventListeners()

      // Registrar métricas
      this.registerMetrics()

      // Iniciar verificação periódica
      this.startPeriodicCheck()

      this.logger.info('Dependency Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Dependency Service:', error)
      throw error
    }
  }

  buildDependencyMaps() {
    try {
      // Limpar mapas existentes
      this.dependencyMap.clear()
      this.reverseDependencyMap.clear()

      // Construir mapa de dependências diretas
      for (const [agentId, dependencies] of Object.entries(this.config.map)) {
        this.dependencyMap.set(agentId, new Set(dependencies))
        
        // Construir mapa reverso (quem depende de quem)
        for (const dependency of dependencies) {
          if (!this.reverseDependencyMap.has(dependency)) {
            this.reverseDependencyMap.set(dependency, new Set())
          }
          this.reverseDependencyMap.get(dependency).add(agentId)
        }
      }

      this.logger.info('Mapas de dependências construídos', {
        totalAgents: this.dependencyMap.size,
        totalDependencies: Array.from(this.dependencyMap.values())
          .reduce((total, deps) => total + deps.size, 0)
      })
    } catch (error) {
      this.logger.error('Erro ao construir mapas de dependências:', error)
      throw error
    }
  }

  setupEventListeners() {
    // Escutar mudanças de estado dos agentes
    this.lifecycle.on('stateChange', async (agentId, oldState, newState) => {
      try {
        await this.handleAgentStateChange(agentId, oldState, newState)
      } catch (error) {
        this.logger.error('Erro ao processar mudança de estado:', error)
      }
    })
  }

  registerMetrics() {
    this.metrics.registerGauge('dependency_waiting_agents', 'Agentes aguardando dependências', ['agent_id'])
    this.metrics.registerCounter('dependency_violations_total', 'Total de violações de dependência', ['agent_id', 'dependency'])
    this.metrics.registerHistogram('dependency_resolution_time_seconds', 'Tempo para resolver dependências', ['agent_id'])
    this.metrics.registerGauge('dependency_graph_depth', 'Profundidade do grafo de dependências')
  }

  async handleAgentStateChange(agentId, oldState, newState) {
    try {
      // Se agente ficou running, verificar dependentes
      if (newState === 'running') {
        await this.checkDependentAgents(agentId)
      }
      
      // Se agente parou, verificar dependentes
      if (newState === 'stopped' || newState === 'failed') {
        await this.handleDependencyFailure(agentId)
      }

      // Atualizar métricas
      this.updateDependencyMetrics()
    } catch (error) {
      this.logger.error('Erro ao processar mudança de estado de dependência:', error)
    }
  }

  async checkDependentAgents(agentId) {
    try {
      const dependents = this.reverseDependencyMap.get(agentId) || new Set()
      
      for (const dependentId of dependents) {
        if (this.waitingQueue.has(dependentId)) {
          const canStart = await this.checkDependencies(dependentId)
          if (canStart) {
            this.logger.info('Dependências resolvidas, iniciando agente', {
              agentId: dependentId,
              resolvedBy: agentId
            })
            
            // Remover da fila de espera
            const waitStart = this.waitingQueue.get(dependentId)
            this.waitingQueue.delete(dependentId)
            
            // Calcular tempo de resolução
            const resolutionTime = (Date.now() - waitStart) / 1000
            this.metrics.observeHistogram('dependency_resolution_time_seconds', resolutionTime, {
              agent_id: dependentId
            })
            
            // Iniciar agente
            await this.lifecycle.startAgent(dependentId)
          }
        }
      }
    } catch (error) {
      this.logger.error('Erro ao verificar agentes dependentes:', error)
    }
  }

  async handleDependencyFailure(failedAgentId) {
    try {
      const dependents = this.reverseDependencyMap.get(failedAgentId) || new Set()
      
      for (const dependentId of dependents) {
        const agent = await this.lifecycle.getAgent(dependentId)
        
        if (agent && agent.status === 'running') {
          this.logger.warn('Dependência falhou, parando agente dependente', {
            dependentId,
            failedDependency: failedAgentId
          })
          
          // Incrementar métrica de violação
          this.metrics.incrementCounter('dependency_violations_total', {
            agent_id: dependentId,
            dependency: failedAgentId
          })
          
          // Parar agente dependente
          await this.lifecycle.stopAgent(dependentId, { reason: 'dependency_failure' })
        }
      }
    } catch (error) {
      this.logger.error('Erro ao processar falha de dependência:', error)
    }
  }

  async checkDependencies(agentId) {
    try {
      const dependencies = this.dependencyMap.get(agentId) || new Set()
      
      if (dependencies.size === 0) {
        return true // Sem dependências
      }

      for (const dependencyId of dependencies) {
        const dependency = await this.lifecycle.getAgent(dependencyId)
        
        if (!dependency || dependency.status !== 'running') {
          this.logger.debug('Dependência não atendida', {
            agentId,
            dependencyId,
            dependencyStatus: dependency?.status || 'not_found'
          })
          return false
        }
      }

      return true
    } catch (error) {
      this.logger.error('Erro ao verificar dependências:', error)
      return false
    }
  }

  async startAgentWithDependencies(agentId, options = {}) {
    try {
      this.logger.info('Iniciando agente com verificação de dependências', {
        agentId,
        options
      })

      // Verificar se dependências estão atendidas
      const canStart = await this.checkDependencies(agentId)
      
      if (canStart) {
        // Iniciar imediatamente
        return await this.lifecycle.startAgent(agentId, options)
      } else {
        // Adicionar à fila de espera
        this.waitingQueue.set(agentId, Date.now())
        
        this.logger.info('Agente adicionado à fila de espera por dependências', {
          agentId,
          waitingFor: Array.from(this.dependencyMap.get(agentId) || [])
        })
        
        // Atualizar métrica
        this.metrics.setGauge('dependency_waiting_agents', 1, {
          agent_id: agentId
        })
        
        // Tentar iniciar dependências se configurado
        if (options.startDependencies) {
          await this.startDependencies(agentId)
        }
        
        return {
          success: false,
          message: 'Agente aguardando dependências',
          waitingFor: Array.from(this.dependencyMap.get(agentId) || [])
        }
      }
    } catch (error) {
      this.logger.error('Erro ao iniciar agente com dependências:', error)
      throw error
    }
  }

  async startDependencies(agentId) {
    try {
      const dependencies = this.dependencyMap.get(agentId) || new Set()
      
      for (const dependencyId of dependencies) {
        const dependency = await this.lifecycle.getAgent(dependencyId)
        
        if (dependency && dependency.status !== 'running') {
          this.logger.info('Iniciando dependência', {
            agentId,
            dependencyId
          })
          
          // Iniciar dependência recursivamente
          await this.startAgentWithDependencies(dependencyId, {
            startDependencies: true
          })
        }
      }
    } catch (error) {
      this.logger.error('Erro ao iniciar dependências:', error)
    }
  }

  async stopAgentWithDependents(agentId, options = {}) {
    try {
      this.logger.info('Parando agente com verificação de dependentes', {
        agentId,
        options
      })

      const dependents = this.reverseDependencyMap.get(agentId) || new Set()
      
      // Parar dependentes primeiro se configurado
      if (options.stopDependents && dependents.size > 0) {
        this.logger.info('Parando agentes dependentes', {
          agentId,
          dependents: Array.from(dependents)
        })
        
        for (const dependentId of dependents) {
          const dependent = await this.lifecycle.getAgent(dependentId)
          
          if (dependent && dependent.status === 'running') {
            await this.stopAgentWithDependents(dependentId, {
              stopDependents: true,
              reason: 'dependency_stop'
            })
          }
        }
      }
      
      // Parar o agente
      return await this.lifecycle.stopAgent(agentId, options)
    } catch (error) {
      this.logger.error('Erro ao parar agente com dependentes:', error)
      throw error
    }
  }

  async startGroup(groupName, options = {}) {
    try {
      this.logger.info('Iniciando grupo de agentes', { groupName, options })

      const group = this.config.groups[groupName]
      if (!group) {
        throw new Error(`Grupo ${groupName} não encontrado`)
      }

      // Ordenar agentes por dependências
      const orderedAgents = this.topologicalSort(group)
      
      const results = []
      
      for (const agentId of orderedAgents) {
        try {
          const result = await this.startAgentWithDependencies(agentId, {
            ...options,
            startDependencies: true
          })
          results.push({ agentId, ...result })
          
          // Aguardar entre inicializações se configurado
          if (options.delay) {
            await new Promise(resolve => setTimeout(resolve, options.delay))
          }
        } catch (error) {
          this.logger.error('Erro ao iniciar agente do grupo', {
            groupName,
            agentId,
            error: error.message
          })
          results.push({
            agentId,
            success: false,
            error: error.message
          })
        }
      }

      return {
        group: groupName,
        results,
        success: results.every(r => r.success)
      }
    } catch (error) {
      this.logger.error('Erro ao iniciar grupo:', error)
      throw error
    }
  }

  async stopGroup(groupName, options = {}) {
    try {
      this.logger.info('Parando grupo de agentes', { groupName, options })

      const group = this.config.groups[groupName]
      if (!group) {
        throw new Error(`Grupo ${groupName} não encontrado`)
      }

      // Ordenar agentes em ordem reversa para parada
      const orderedAgents = this.topologicalSort(group).reverse()
      
      const results = []
      
      for (const agentId of orderedAgents) {
        try {
          const result = await this.stopAgentWithDependents(agentId, {
            ...options,
            stopDependents: false // Já estamos parando em ordem
          })
          results.push({ agentId, ...result })
          
          // Aguardar entre paradas se configurado
          if (options.delay) {
            await new Promise(resolve => setTimeout(resolve, options.delay))
          }
        } catch (error) {
          this.logger.error('Erro ao parar agente do grupo', {
            groupName,
            agentId,
            error: error.message
          })
          results.push({
            agentId,
            success: false,
            error: error.message
          })
        }
      }

      return {
        group: groupName,
        results,
        success: results.every(r => r.success)
      }
    } catch (error) {
      this.logger.error('Erro ao parar grupo:', error)
      throw error
    }
  }

  topologicalSort(agents) {
    try {
      const visited = new Set()
      const visiting = new Set()
      const result = []
      
      const visit = (agentId) => {
        if (visiting.has(agentId)) {
          throw new Error(`Dependência circular detectada envolvendo ${agentId}`)
        }
        
        if (visited.has(agentId)) {
          return
        }
        
        visiting.add(agentId)
        
        const dependencies = this.dependencyMap.get(agentId) || new Set()
        for (const dependency of dependencies) {
          if (agents.includes(dependency)) {
            visit(dependency)
          }
        }
        
        visiting.delete(agentId)
        visited.add(agentId)
        result.push(agentId)
      }
      
      for (const agentId of agents) {
        if (!visited.has(agentId)) {
          visit(agentId)
        }
      }
      
      return result
    } catch (error) {
      this.logger.error('Erro na ordenação topológica:', error)
      throw error
    }
  }

  getDependencyMap() {
    const map = {}
    for (const [agentId, dependencies] of this.dependencyMap) {
      map[agentId] = Array.from(dependencies)
    }
    return map
  }

  getReverseDependencyMap() {
    const map = {}
    for (const [agentId, dependents] of this.reverseDependencyMap) {
      map[agentId] = Array.from(dependents)
    }
    return map
  }

  async getAgentDependencies(agentId) {
    try {
      const dependencies = this.dependencyMap.get(agentId) || new Set()
      const dependents = this.reverseDependencyMap.get(agentId) || new Set()
      
      const dependencyStates = {}
      for (const depId of dependencies) {
        const agent = await this.lifecycle.getAgent(depId)
        dependencyStates[depId] = agent?.status || 'unknown'
      }
      
      const dependentStates = {}
      for (const depId of dependents) {
        const agent = await this.lifecycle.getAgent(depId)
        dependentStates[depId] = agent?.status || 'unknown'
      }
      
      return {
        agentId,
        dependencies: Array.from(dependencies),
        dependents: Array.from(dependents),
        dependencyStates,
        dependentStates,
        canStart: await this.checkDependencies(agentId),
        isWaiting: this.waitingQueue.has(agentId)
      }
    } catch (error) {
      this.logger.error('Erro ao obter dependências do agente:', error)
      throw error
    }
  }

  startPeriodicCheck() {
    if (this.config.enabled && this.config.checkInterval > 0) {
      this.checkInterval = setInterval(async () => {
        try {
          await this.checkWaitingQueue()
        } catch (error) {
          this.logger.error('Erro na verificação periódica de dependências:', error)
        }
      }, this.config.checkInterval)
    }
  }

  async checkWaitingQueue() {
    try {
      const now = Date.now()
      
      for (const [agentId, waitStart] of this.waitingQueue) {
        // Verificar timeout
        if (now - waitStart > this.config.maxWaitTime) {
          this.logger.warn('Timeout aguardando dependências', {
            agentId,
            waitTime: now - waitStart
          })
          
          this.waitingQueue.delete(agentId)
          this.metrics.setGauge('dependency_waiting_agents', 0, {
            agent_id: agentId
          })
          continue
        }
        
        // Verificar se dependências foram resolvidas
        const canStart = await this.checkDependencies(agentId)
        if (canStart) {
          this.logger.info('Dependências resolvidas na verificação periódica', {
            agentId
          })
          
          this.waitingQueue.delete(agentId)
          this.metrics.setGauge('dependency_waiting_agents', 0, {
            agent_id: agentId
          })
          
          await this.lifecycle.startAgent(agentId)
        }
      }
    } catch (error) {
      this.logger.error('Erro ao verificar fila de espera:', error)
    }
  }

  updateDependencyMetrics() {
    try {
      // Atualizar métricas de agentes aguardando
      for (const agentId of this.waitingQueue.keys()) {
        this.metrics.setGauge('dependency_waiting_agents', 1, {
          agent_id: agentId
        })
      }
      
      // Calcular profundidade do grafo
      const maxDepth = this.calculateGraphDepth()
      this.metrics.setGauge('dependency_graph_depth', maxDepth)
    } catch (error) {
      this.logger.error('Erro ao atualizar métricas de dependência:', error)
    }
  }

  calculateGraphDepth() {
    try {
      let maxDepth = 0
      
      const calculateDepth = (agentId, visited = new Set()) => {
        if (visited.has(agentId)) {
          return 0 // Evitar ciclos
        }
        
        visited.add(agentId)
        const dependencies = this.dependencyMap.get(agentId) || new Set()
        
        if (dependencies.size === 0) {
          return 1
        }
        
        let maxChildDepth = 0
        for (const dependency of dependencies) {
          const depth = calculateDepth(dependency, new Set(visited))
          maxChildDepth = Math.max(maxChildDepth, depth)
        }
        
        return maxChildDepth + 1
      }
      
      for (const agentId of this.dependencyMap.keys()) {
        const depth = calculateDepth(agentId)
        maxDepth = Math.max(maxDepth, depth)
      }
      
      return maxDepth
    } catch (error) {
      this.logger.error('Erro ao calcular profundidade do grafo:', error)
      return 0
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Dependency Service...')
      
      // Parar verificação periódica
      if (this.checkInterval) {
        clearInterval(this.checkInterval)
      }
      
      // Limpar filas e mapas
      this.waitingQueue.clear()
      this.dependencyMap.clear()
      this.reverseDependencyMap.clear()
      
      // Remover listeners
      this.removeAllListeners()
      
      this.logger.info('Dependency Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Dependency Service:', error)
    }
  }
}

module.exports = DependencyService