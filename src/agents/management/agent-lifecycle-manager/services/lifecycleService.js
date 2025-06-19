/**
 * Lifecycle Service - Gerenciamento do Ciclo de Vida dos Agentes
 * Responsável por iniciar, parar, reiniciar e monitorar agentes
 */

const axios = require('axios')
const EventEmitter = require('events')

class LifecycleService extends EventEmitter {
  constructor({ config, sqs, cache, metrics, alert, logger }) {
    super()
    this.config = config
    this.sqs = sqs
    this.cache = cache
    this.metrics = metrics
    this.alert = alert
    this.logger = logger
    this.agentStates = new Map()
    this.restartAttempts = new Map()
    this.monitoringActive = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Lifecycle Service...')

      // Inicializar estados dos agentes
      await this.initializeAgentStates()

      // Configurar listeners de eventos
      this.setupEventListeners()

      // Registrar métricas
      this.registerMetrics()

      this.logger.info('Lifecycle Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Lifecycle Service:', error)
      throw error
    }
  }

  async initializeAgentStates() {
    try {
      // Carregar estados do cache se disponível
      const cachedStates = await this.cache.get('agent_states')
      if (cachedStates) {
        this.agentStates = new Map(Object.entries(cachedStates))
        this.logger.info('Estados dos agentes carregados do cache', {
          agentCount: this.agentStates.size
        })
      } else {
        // Inicializar com estados padrão
        const agentRegistry = require('../config/lifecycleConfig').agents.registry
        for (const [agentId, agentConfig] of Object.entries(agentRegistry)) {
          this.agentStates.set(agentId, {
            id: agentId,
            name: agentConfig.name,
            status: this.config.states.unknown,
            lastHealthCheck: null,
            lastStatusChange: new Date().toISOString(),
            restartCount: 0,
            uptime: 0,
            config: agentConfig
          })
        }
        await this.saveAgentStates()
      }

      // Verificar estado atual dos agentes
      await this.refreshAgentStates()
    } catch (error) {
      this.logger.error('Erro ao inicializar estados dos agentes:', error)
      throw error
    }
  }

  setupEventListeners() {
    // Listener para mudanças de estado
    this.on('stateChange', async (agentId, oldState, newState) => {
      try {
        this.logger.info('Mudança de estado do agente', {
          agentId,
          oldState,
          newState,
          timestamp: new Date().toISOString()
        })

        // Atualizar métricas
        this.metrics.incrementCounter('agent_state_changes_total', {
          agent_id: agentId,
          old_state: oldState,
          new_state: newState
        })

        // Enviar alerta se necessário
        if (newState === this.config.states.failed) {
          await this.alert.send({
            type: 'agent_failure',
            severity: 'high',
            message: `Agente ${agentId} falhou`,
            details: { agentId, oldState, newState }
          })
        }

        // Salvar estados
        await this.saveAgentStates()
      } catch (error) {
        this.logger.error('Erro ao processar mudança de estado:', error)
      }
    })

    // Listener para reinicializações automáticas
    this.on('autoRestart', async (agentId) => {
      try {
        await this.restartAgent(agentId, { automatic: true })
      } catch (error) {
        this.logger.error('Erro na reinicialização automática:', error)
      }
    })
  }

  registerMetrics() {
    // Métricas de estado dos agentes
    this.metrics.registerGauge('agent_status', 'Status atual dos agentes', ['agent_id', 'status'])
    this.metrics.registerCounter('agent_state_changes_total', 'Total de mudanças de estado', ['agent_id', 'old_state', 'new_state'])
    this.metrics.registerCounter('agent_restarts_total', 'Total de reinicializações', ['agent_id', 'type'])
    this.metrics.registerHistogram('agent_uptime_seconds', 'Tempo de atividade dos agentes', ['agent_id'])
    this.metrics.registerGauge('agent_health_check_duration_seconds', 'Duração dos health checks', ['agent_id'])
  }

  async getAllAgents() {
    try {
      return Array.from(this.agentStates.values())
    } catch (error) {
      this.logger.error('Erro ao obter todos os agentes:', error)
      throw error
    }
  }

  async getAgent(agentId) {
    try {
      return this.agentStates.get(agentId) || null
    } catch (error) {
      this.logger.error('Erro ao obter agente:', error)
      throw error
    }
  }

  async startAgent(agentId, options = {}) {
    try {
      this.logger.info('Iniciando agente', { agentId, options })

      const agent = this.agentStates.get(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado`)
      }

      if (agent.status === this.config.states.running) {
        this.logger.warn('Agente já está rodando', { agentId })
        return { success: true, message: 'Agente já está rodando' }
      }

      // Atualizar estado para starting
      await this.updateAgentState(agentId, this.config.states.starting)

      // Enviar comando de start via SQS
      await this.sendLifecycleCommand(agentId, this.config.actions.start, options)

      // Aguardar confirmação de inicialização
      const started = await this.waitForAgentState(agentId, this.config.states.running, 30000)
      
      if (started) {
        this.logger.info('Agente iniciado com sucesso', { agentId })
        this.metrics.incrementCounter('agent_restarts_total', {
          agent_id: agentId,
          type: options.automatic ? 'automatic' : 'manual'
        })
        return { success: true, message: 'Agente iniciado com sucesso' }
      } else {
        await this.updateAgentState(agentId, this.config.states.failed)
        throw new Error('Timeout ao aguardar inicialização do agente')
      }
    } catch (error) {
      this.logger.error('Erro ao iniciar agente:', error)
      await this.updateAgentState(agentId, this.config.states.failed)
      throw error
    }
  }

  async stopAgent(agentId, options = {}) {
    try {
      this.logger.info('Parando agente', { agentId, options })

      const agent = this.agentStates.get(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado`)
      }

      if (agent.status === this.config.states.stopped) {
        this.logger.warn('Agente já está parado', { agentId })
        return { success: true, message: 'Agente já está parado' }
      }

      // Atualizar estado para stopping
      await this.updateAgentState(agentId, this.config.states.stopping)

      // Enviar comando de stop via SQS
      await this.sendLifecycleCommand(agentId, this.config.actions.stop, options)

      // Aguardar confirmação de parada
      const stopped = await this.waitForAgentState(agentId, this.config.states.stopped, 
        options.graceful ? this.config.gracefulShutdownTimeout : 10000)
      
      if (stopped) {
        this.logger.info('Agente parado com sucesso', { agentId })
        return { success: true, message: 'Agente parado com sucesso' }
      } else {
        this.logger.warn('Timeout ao aguardar parada do agente', { agentId })
        return { success: false, message: 'Timeout ao parar agente' }
      }
    } catch (error) {
      this.logger.error('Erro ao parar agente:', error)
      throw error
    }
  }

  async restartAgent(agentId, options = {}) {
    try {
      this.logger.info('Reiniciando agente', { agentId, options })

      const agent = this.agentStates.get(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado`)
      }

      // Verificar limite de tentativas de restart
      const attempts = this.restartAttempts.get(agentId) || 0
      if (attempts >= this.config.maxRestartAttempts && !options.force) {
        throw new Error(`Limite de tentativas de restart excedido para ${agentId}`)
      }

      // Incrementar contador de tentativas
      this.restartAttempts.set(agentId, attempts + 1)

      // Parar agente se estiver rodando
      if (agent.status === this.config.states.running) {
        await this.stopAgent(agentId, { graceful: true })
      }

      // Aguardar delay antes de reiniciar
      if (this.config.restartDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.restartDelay))
      }

      // Iniciar agente
      const result = await this.startAgent(agentId, options)

      // Reset contador de tentativas em caso de sucesso
      if (result.success) {
        this.restartAttempts.delete(agentId)
        
        // Atualizar contador de restarts
        const currentAgent = this.agentStates.get(agentId)
        currentAgent.restartCount = (currentAgent.restartCount || 0) + 1
        await this.saveAgentStates()
      }

      return result
    } catch (error) {
      this.logger.error('Erro ao reiniciar agente:', error)
      throw error
    }
  }

  async healthCheckAgent(agentId) {
    try {
      const agent = this.agentStates.get(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado`)
      }

      const startTime = Date.now()
      
      try {
        const response = await axios.get(
          `${agent.config.url}${agent.config.healthEndpoint}`,
          { timeout: agent.config.timeout }
        )

        const duration = (Date.now() - startTime) / 1000
        
        // Atualizar métricas
        this.metrics.setGauge('agent_health_check_duration_seconds', duration, {
          agent_id: agentId
        })

        const isHealthy = response.status === 200 && response.data.status === 'healthy'
        
        // Atualizar último health check
        agent.lastHealthCheck = new Date().toISOString()
        
        if (isHealthy && agent.status !== this.config.states.running) {
          await this.updateAgentState(agentId, this.config.states.running)
        } else if (!isHealthy && agent.status === this.config.states.running) {
          await this.updateAgentState(agentId, this.config.states.failed)
        }

        return {
          healthy: isHealthy,
          status: response.status,
          data: response.data,
          duration
        }
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000
        
        this.metrics.setGauge('agent_health_check_duration_seconds', duration, {
          agent_id: agentId
        })

        // Atualizar estado para failed se estava running
        if (agent.status === this.config.states.running) {
          await this.updateAgentState(agentId, this.config.states.failed)
        }

        return {
          healthy: false,
          error: error.message,
          duration
        }
      }
    } catch (error) {
      this.logger.error('Erro no health check do agente:', error)
      throw error
    }
  }

  async monitorAgents() {
    try {
      if (!this.monitoringActive) {
        this.monitoringActive = true
        
        const agents = Array.from(this.agentStates.keys())
        const healthChecks = agents.map(agentId => this.healthCheckAgent(agentId))
        
        const results = await Promise.allSettled(healthChecks)
        
        // Processar resultados
        for (let i = 0; i < results.length; i++) {
          const agentId = agents[i]
          const result = results[i]
          
          if (result.status === 'rejected') {
            this.logger.error('Erro no health check do agente', {
              agentId,
              error: result.reason
            })
          } else {
            const healthResult = result.value
            
            // Verificar se precisa de restart automático
            if (!healthResult.healthy) {
              const agent = this.agentStates.get(agentId)
              if (agent && agent.config.critical) {
                this.emit('autoRestart', agentId)
              }
            }
          }
        }
        
        // Atualizar métricas de status
        this.updateStatusMetrics()
        
        this.monitoringActive = false
      }
    } catch (error) {
      this.logger.error('Erro no monitoramento de agentes:', error)
      this.monitoringActive = false
    }
  }

  async refreshAgentStates() {
    try {
      const agents = Array.from(this.agentStates.keys())
      const healthChecks = agents.map(agentId => this.healthCheckAgent(agentId))
      
      await Promise.allSettled(healthChecks)
      
      this.logger.info('Estados dos agentes atualizados')
    } catch (error) {
      this.logger.error('Erro ao atualizar estados dos agentes:', error)
    }
  }

  async updateAgentState(agentId, newState) {
    try {
      const agent = this.agentStates.get(agentId)
      if (!agent) {
        throw new Error(`Agente ${agentId} não encontrado`)
      }

      const oldState = agent.status
      if (oldState !== newState) {
        agent.status = newState
        agent.lastStatusChange = new Date().toISOString()
        
        // Calcular uptime se mudando para stopped
        if (newState === this.config.states.stopped && oldState === this.config.states.running) {
          const uptime = Date.now() - new Date(agent.lastStatusChange).getTime()
          agent.uptime += uptime
          
          this.metrics.observeHistogram('agent_uptime_seconds', uptime / 1000, {
            agent_id: agentId
          })
        }
        
        this.emit('stateChange', agentId, oldState, newState)
      }
    } catch (error) {
      this.logger.error('Erro ao atualizar estado do agente:', error)
      throw error
    }
  }

  async sendLifecycleCommand(agentId, action, options = {}) {
    try {
      const message = {
        agentId,
        action,
        options,
        timestamp: new Date().toISOString(),
        requestId: `${agentId}-${action}-${Date.now()}`
      }

      await this.sqs.sendMessage(
        require('../config/lifecycleConfig').sqs.queues.lifecycle,
        message
      )

      this.logger.debug('Comando de ciclo de vida enviado', message)
    } catch (error) {
      this.logger.error('Erro ao enviar comando de ciclo de vida:', error)
      throw error
    }
  }

  async waitForAgentState(agentId, expectedState, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now()
      
      const checkState = () => {
        const agent = this.agentStates.get(agentId)
        if (agent && agent.status === expectedState) {
          resolve(true)
          return
        }
        
        if (Date.now() - startTime >= timeout) {
          resolve(false)
          return
        }
        
        setTimeout(checkState, 1000)
      }
      
      checkState()
    })
  }

  updateStatusMetrics() {
    try {
      for (const [agentId, agent] of this.agentStates) {
        this.metrics.setGauge('agent_status', 1, {
          agent_id: agentId,
          status: agent.status
        })
      }
    } catch (error) {
      this.logger.error('Erro ao atualizar métricas de status:', error)
    }
  }

  async saveAgentStates() {
    try {
      const states = Object.fromEntries(this.agentStates)
      await this.cache.set('agent_states', states, 3600) // 1 hora
    } catch (error) {
      this.logger.error('Erro ao salvar estados dos agentes:', error)
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Lifecycle Service...')
      
      // Salvar estados finais
      await this.saveAgentStates()
      
      // Limpar listeners
      this.removeAllListeners()
      
      this.logger.info('Lifecycle Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Lifecycle Service:', error)
    }
  }
}

module.exports = LifecycleService