/**
 * Lifecycle Service
 * Serviço principal para gerenciamento do ciclo de vida dos agentes
 */

const EventEmitter = require('events')
const config = require('../config/lifecycleConfig')

class LifecycleService extends EventEmitter {
  constructor(agentRegistry, processManager, eventService, logger) {
    super()
    this.agentRegistry = agentRegistry
    this.processManager = processManager
    this.eventService = eventService
    this.logger = logger
    this.isInitialized = false
    this.sqsConsumers = new Map()
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Lifecycle Service...')

      // Configurar listeners de eventos
      this.setupEventListeners()

      // Iniciar consumidores SQS
      await this.startSQSConsumers()

      // Registrar agentes conhecidos
      await this.registerKnownAgents()

      this.isInitialized = true
      this.logger.info('Lifecycle Service inicializado com sucesso')

      // Emitir evento de inicialização
      await this.eventService.publishEvent({
        type: config.events.types.LIFECYCLE_MANAGER_STARTED,
        timestamp: new Date().toISOString(),
        data: {
          managerId: process.env.HOSTNAME || 'localhost',
          agentsCount: this.agentRegistry.getAgentCount()
        }
      })

    } catch (error) {
      this.logger.error('Erro ao inicializar Lifecycle Service:', error)
      throw error
    }
  }

  setupEventListeners() {
    // Eventos do Process Manager
    this.processManager.on('processStarted', this.handleProcessStarted.bind(this))
    this.processManager.on('processStopped', this.handleProcessStopped.bind(this))
    this.processManager.on('processFailed', this.handleProcessFailed.bind(this))
    this.processManager.on('processRestarted', this.handleProcessRestarted.bind(this))

    // Eventos do Agent Registry
    this.agentRegistry.on('agentRegistered', this.handleAgentRegistered.bind(this))
    this.agentRegistry.on('agentUnregistered', this.handleAgentUnregistered.bind(this))
    this.agentRegistry.on('agentStateChanged', this.handleAgentStateChanged.bind(this))
  }

  async startSQSConsumers() {
    try {
      // Consumer para recovery actions
      const recoveryConsumer = await this.eventService.createConsumer(
        config.sqs.queues.recoveryActions,
        this.handleRecoveryAction.bind(this)
      )
      this.sqsConsumers.set('recovery', recoveryConsumer)

      // Consumer para fallback actions
      const fallbackConsumer = await this.eventService.createConsumer(
        config.sqs.queues.fallbackActions,
        this.handleFallbackAction.bind(this)
      )
      this.sqsConsumers.set('fallback', fallbackConsumer)

      this.logger.info('Consumidores SQS iniciados com sucesso')
    } catch (error) {
      this.logger.error('Erro ao iniciar consumidores SQS:', error)
      throw error
    }
  }

  async registerKnownAgents() {
    const agents = config.agents.registry
    
    for (const [agentId, agentConfig] of Object.entries(agents)) {
      try {
        await this.agentRegistry.registerAgent(agentId, {
          ...agentConfig,
          state: config.agents.states.STOPPED,
          lastSeen: null,
          restartCount: 0,
          registeredAt: new Date().toISOString()
        })
        
        this.logger.debug(`Agente ${agentId} registrado no registry`)
      } catch (error) {
        this.logger.error(`Erro ao registrar agente ${agentId}:`, error)
      }
    }
  }

  // Operações de ciclo de vida
  async startAgent(agentId, options = {}) {
    try {
      this.logger.info(`Iniciando agente: ${agentId}`)

      const agent = await this.agentRegistry.getAgent(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado no registry`)
      }

      if (agent.state === config.agents.states.RUNNING) {
        this.logger.warn(`Agente ${agentId} já está rodando`)
        return { success: true, message: 'Agente já está rodando' }
      }

      // Verificar dependências
      if (agent.dependencies && agent.dependencies.length > 0) {
        await this.checkDependencies(agent.dependencies)
      }

      // Atualizar estado para STARTING
      await this.agentRegistry.updateAgentState(agentId, config.agents.states.STARTING)

      // Iniciar processo
      const processInfo = await this.processManager.startProcess(agentId, {
        command: agent.startCommand,
        workingDirectory: agent.workingDirectory,
        env: options.env || {},
        ...options
      })

      // Aguardar confirmação de inicialização
      await this.waitForAgentHealth(agentId, agent.port, agent.healthEndpoint)

      // Atualizar estado para RUNNING
      await this.agentRegistry.updateAgentState(agentId, config.agents.states.RUNNING, {
        processId: processInfo.pid,
        startedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      })

      this.logger.info(`Agente ${agentId} iniciado com sucesso (PID: ${processInfo.pid})`)
      
      return {
        success: true,
        message: 'Agente iniciado com sucesso',
        processId: processInfo.pid
      }

    } catch (error) {
      this.logger.error(`Erro ao iniciar agente ${agentId}:`, error)
      
      // Atualizar estado para FAILED
      await this.agentRegistry.updateAgentState(agentId, config.agents.states.FAILED, {
        error: error.message,
        failedAt: new Date().toISOString()
      })

      throw error
    }
  }

  async stopAgent(agentId, options = {}) {
    try {
      this.logger.info(`Parando agente: ${agentId}`)

      const agent = await this.agentRegistry.getAgent(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado no registry`)
      }

      if (agent.state === config.agents.states.STOPPED) {
        this.logger.warn(`Agente ${agentId} já está parado`)
        return { success: true, message: 'Agente já está parado' }
      }

      // Atualizar estado para STOPPING
      await this.agentRegistry.updateAgentState(agentId, config.agents.states.STOPPING)

      // Parar processo
      await this.processManager.stopProcess(agentId, options.force || false)

      // Atualizar estado para STOPPED
      await this.agentRegistry.updateAgentState(agentId, config.agents.states.STOPPED, {
        stoppedAt: new Date().toISOString(),
        processId: null
      })

      this.logger.info(`Agente ${agentId} parado com sucesso`)
      
      return {
        success: true,
        message: 'Agente parado com sucesso'
      }

    } catch (error) {
      this.logger.error(`Erro ao parar agente ${agentId}:`, error)
      throw error
    }
  }

  async restartAgent(agentId, options = {}) {
    try {
      this.logger.info(`Reiniciando agente: ${agentId}`)

      const agent = await this.agentRegistry.getAgent(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado no registry`)
      }

      // Parar agente se estiver rodando
      if (agent.state === config.agents.states.RUNNING) {
        await this.stopAgent(agentId, { force: options.force })
      }

      // Aguardar delay se especificado
      if (options.delay || agent.restartDelay) {
        const delay = options.delay || agent.restartDelay
        this.logger.info(`Aguardando ${delay}ms antes de reiniciar ${agentId}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Incrementar contador de restarts
      const restartCount = (agent.restartCount || 0) + 1
      await this.agentRegistry.updateAgent(agentId, { restartCount })

      // Iniciar agente
      const result = await this.startAgent(agentId, options)

      this.logger.info(`Agente ${agentId} reiniciado com sucesso (restart #${restartCount})`)
      
      return {
        ...result,
        restartCount
      }

    } catch (error) {
      this.logger.error(`Erro ao reiniciar agente ${agentId}:`, error)
      throw error
    }
  }

  async startAllAgents(options = {}) {
    try {
      this.logger.info('Iniciando todos os agentes...')

      const agents = await this.agentRegistry.getAllAgents()
      const results = []

      // Ordenar agentes por dependências
      const sortedAgents = this.sortAgentsByDependencies(agents)

      for (const agent of sortedAgents) {
        try {
          if (agent.state !== config.agents.states.RUNNING) {
            const result = await this.startAgent(agent.id, options)
            results.push({ agentId: agent.id, ...result })
            
            // Aguardar entre inicializações
            if (options.delay) {
              await new Promise(resolve => setTimeout(resolve, options.delay))
            }
          }
        } catch (error) {
          this.logger.error(`Erro ao iniciar agente ${agent.id}:`, error)
          results.push({
            agentId: agent.id,
            success: false,
            error: error.message
          })
        }
      }

      this.logger.info('Processo de inicialização de todos os agentes concluído')
      return results

    } catch (error) {
      this.logger.error('Erro ao iniciar todos os agentes:', error)
      throw error
    }
  }

  async stopAllAgents(options = {}) {
    try {
      this.logger.info('Parando todos os agentes...')

      const agents = await this.agentRegistry.getAllAgents()
      const results = []

      // Ordenar agentes em ordem reversa de dependências
      const sortedAgents = this.sortAgentsByDependencies(agents).reverse()

      for (const agent of sortedAgents) {
        try {
          if (agent.state === config.agents.states.RUNNING) {
            const result = await this.stopAgent(agent.id, options)
            results.push({ agentId: agent.id, ...result })
            
            // Aguardar entre paradas
            if (options.delay) {
              await new Promise(resolve => setTimeout(resolve, options.delay))
            }
          }
        } catch (error) {
          this.logger.error(`Erro ao parar agente ${agent.id}:`, error)
          results.push({
            agentId: agent.id,
            success: false,
            error: error.message
          })
        }
      }

      this.logger.info('Processo de parada de todos os agentes concluído')
      return results

    } catch (error) {
      this.logger.error('Erro ao parar todos os agentes:', error)
      throw error
    }
  }

  // Handlers de eventos
  async handleProcessStarted(data) {
    const { agentId, processId } = data
    this.logger.info(`Processo iniciado para agente ${agentId} (PID: ${processId})`)
    
    await this.eventService.publishEvent({
      type: config.events.types.AGENT_STARTED,
      timestamp: new Date().toISOString(),
      data: { agentId, processId }
    })
  }

  async handleProcessStopped(data) {
    const { agentId, processId, exitCode } = data
    this.logger.info(`Processo parado para agente ${agentId} (PID: ${processId}, Exit Code: ${exitCode})`)
    
    await this.eventService.publishEvent({
      type: config.events.types.AGENT_STOPPED,
      timestamp: new Date().toISOString(),
      data: { agentId, processId, exitCode }
    })
  }

  async handleProcessFailed(data) {
    const { agentId, processId, error } = data
    this.logger.error(`Processo falhou para agente ${agentId} (PID: ${processId}):`, error)
    
    await this.eventService.publishEvent({
      type: config.events.types.AGENT_FAILED,
      timestamp: new Date().toISOString(),
      data: { agentId, processId, error: error.message }
    })

    // Verificar se deve reiniciar automaticamente
    await this.handleAutoRestart(agentId)
  }

  async handleProcessRestarted(data) {
    const { agentId, processId, restartCount } = data
    this.logger.info(`Processo reiniciado para agente ${agentId} (PID: ${processId}, Restart #${restartCount})`)
    
    await this.eventService.publishEvent({
      type: config.events.types.AGENT_RESTARTED,
      timestamp: new Date().toISOString(),
      data: { agentId, processId, restartCount }
    })
  }

  async handleAgentRegistered(data) {
    const { agentId } = data
    this.logger.info(`Agente registrado: ${agentId}`)
    
    await this.eventService.publishEvent({
      type: config.events.types.AGENT_REGISTERED,
      timestamp: new Date().toISOString(),
      data: { agentId }
    })
  }

  async handleAgentUnregistered(data) {
    const { agentId } = data
    this.logger.info(`Agente removido do registro: ${agentId}`)
    
    await this.eventService.publishEvent({
      type: config.events.types.AGENT_UNREGISTERED,
      timestamp: new Date().toISOString(),
      data: { agentId }
    })
  }

  async handleAgentStateChanged(data) {
    const { agentId, oldState, newState } = data
    this.logger.debug(`Estado do agente ${agentId} mudou de ${oldState} para ${newState}`)
  }

  // Handlers SQS
  async handleRecoveryAction(message) {
    try {
      this.logger.info('Ação de recovery recebida:', message)
      
      const { agentId, action, options = {} } = JSON.parse(message.Body)
      
      await this.eventService.publishEvent({
        type: config.events.types.RECOVERY_ACTION_RECEIVED,
        timestamp: new Date().toISOString(),
        data: { agentId, action, options }
      })

      switch (action) {
        case 'restart':
          await this.restartAgent(agentId, options)
          break
        case 'start':
          await this.startAgent(agentId, options)
          break
        case 'stop':
          await this.stopAgent(agentId, options)
          break
        default:
          this.logger.warn(`Ação de recovery desconhecida: ${action}`)
      }

    } catch (error) {
      this.logger.error('Erro ao processar ação de recovery:', error)
      throw error
    }
  }

  async handleFallbackAction(message) {
    try {
      this.logger.info('Ação de fallback recebida:', message)
      
      const { agentId, action, options = {} } = JSON.parse(message.Body)
      
      await this.eventService.publishEvent({
        type: config.events.types.FALLBACK_ACTION_RECEIVED,
        timestamp: new Date().toISOString(),
        data: { agentId, action, options }
      })

      // Implementar lógica de fallback conforme necessário
      switch (action) {
        case 'graceful_degradation':
          await this.handleGracefulDegradation(agentId, options)
          break
        case 'circuit_breaker':
          await this.handleCircuitBreaker(agentId, options)
          break
        default:
          this.logger.warn(`Ação de fallback desconhecida: ${action}`)
      }

    } catch (error) {
      this.logger.error('Erro ao processar ação de fallback:', error)
      throw error
    }
  }

  // Métodos auxiliares
  async checkDependencies(dependencies) {
    for (const depId of dependencies) {
      const dep = await this.agentRegistry.getAgent(depId)
      if (!dep || dep.state !== config.agents.states.RUNNING) {
        throw new Error(`Dependência ${depId} não está rodando`)
      }
    }
  }

  async waitForAgentHealth(agentId, port, healthEndpoint, timeout = 30000) {
    const startTime = Date.now()
    const url = `http://localhost:${port}${healthEndpoint}`
    
    while (Date.now() - startTime < timeout) {
      try {
        const axios = require('axios')
        const response = await axios.get(url, { timeout: 5000 })
        
        if (response.status === 200) {
          this.logger.debug(`Health check OK para agente ${agentId}`)
          return true
        }
      } catch (error) {
        // Ignorar erros e tentar novamente
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    throw new Error(`Timeout aguardando health check do agente ${agentId}`)
  }

  sortAgentsByDependencies(agents) {
    const sorted = []
    const visited = new Set()
    const visiting = new Set()

    const visit = (agent) => {
      if (visiting.has(agent.id)) {
        throw new Error(`Dependência circular detectada: ${agent.id}`)
      }
      
      if (visited.has(agent.id)) {
        return
      }

      visiting.add(agent.id)
      
      if (agent.dependencies) {
        for (const depId of agent.dependencies) {
          const dep = agents.find(a => a.id === depId)
          if (dep) {
            visit(dep)
          }
        }
      }
      
      visiting.delete(agent.id)
      visited.add(agent.id)
      sorted.push(agent)
    }

    for (const agent of agents) {
      if (!visited.has(agent.id)) {
        visit(agent)
      }
    }

    return sorted
  }

  async handleAutoRestart(agentId) {
    try {
      const agent = await this.agentRegistry.getAgent(agentId)
      if (!agent) return

      const shouldRestart = this.shouldAutoRestart(agent)
      if (shouldRestart) {
        this.logger.info(`Iniciando restart automático para agente ${agentId}`)
        await this.restartAgent(agentId)
      }
    } catch (error) {
      this.logger.error(`Erro no restart automático do agente ${agentId}:`, error)
    }
  }

  shouldAutoRestart(agent) {
    if (agent.restartPolicy === 'never') return false
    if (agent.restartPolicy === 'always') return true
    if (agent.restartPolicy === 'on-failure' && agent.state === config.agents.states.FAILED) {
      return (agent.restartCount || 0) < (agent.maxRestarts || 3)
    }
    return false
  }

  async handleGracefulDegradation(agentId, options) {
    this.logger.info(`Iniciando degradação graceful para agente ${agentId}`)
    // Implementar lógica de degradação graceful
  }

  async handleCircuitBreaker(agentId, options) {
    this.logger.info(`Ativando circuit breaker para agente ${agentId}`)
    // Implementar lógica de circuit breaker
  }

  async getSystemStatus() {
    const agents = await this.agentRegistry.getAllAgents()
    const summary = {
      total: agents.length,
      running: 0,
      stopped: 0,
      failed: 0,
      starting: 0,
      stopping: 0,
      unknown: 0
    }

    agents.forEach(agent => {
      summary[agent.state] = (summary[agent.state] || 0) + 1
    })

    return {
      summary,
      agents: agents.map(agent => ({
        id: agent.id,
        state: agent.state,
        port: agent.port,
        restartCount: agent.restartCount || 0,
        lastSeen: agent.lastSeen,
        uptime: agent.startedAt ? Date.now() - new Date(agent.startedAt).getTime() : null
      }))
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Lifecycle Service...')

      // Parar consumidores SQS
      for (const [name, consumer] of this.sqsConsumers) {
        try {
          await consumer.stop()
          this.logger.debug(`Consumer ${name} parado`)
        } catch (error) {
          this.logger.error(`Erro ao parar consumer ${name}:`, error)
        }
      }

      // Emitir evento de finalização
      await this.eventService.publishEvent({
        type: config.events.types.LIFECYCLE_MANAGER_STOPPED,
        timestamp: new Date().toISOString(),
        data: {
          managerId: process.env.HOSTNAME || 'localhost'
        }
      })

      this.isInitialized = false
      this.logger.info('Lifecycle Service finalizado')

    } catch (error) {
      this.logger.error('Erro ao finalizar Lifecycle Service:', error)
      throw error
    }
  }
}

module.exports = LifecycleService