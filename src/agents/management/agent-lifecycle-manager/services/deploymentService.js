/**
 * Deployment Service - Gerenciamento de Deployments e Atualizações
 * Responsável por coordenar deployments seguros dos agentes
 */

const EventEmitter = require('events')
const { v4: uuidv4 } = require('uuid')

class DeploymentService extends EventEmitter {
  constructor({ config, lifecycle, dependency, metrics, alert, logger }) {
    super()
    this.config = config
    this.lifecycle = lifecycle
    this.dependency = dependency
    this.metrics = metrics
    this.alert = alert
    this.logger = logger
    this.activeDeployments = new Map()
    this.deploymentHistory = []
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Deployment Service...')

      // Registrar métricas
      this.registerMetrics()

      // Configurar listeners
      this.setupEventListeners()

      this.logger.info('Deployment Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Deployment Service:', error)
      throw error
    }
  }

  registerMetrics() {
    this.metrics.registerCounter('deployments_total', 'Total de deployments', ['strategy', 'status'])
    this.metrics.registerHistogram('deployment_duration_seconds', 'Duração dos deployments', ['strategy'])
    this.metrics.registerGauge('active_deployments', 'Deployments ativos')
    this.metrics.registerCounter('deployment_rollbacks_total', 'Total de rollbacks', ['strategy', 'reason'])
    this.metrics.registerGauge('deployment_success_rate', 'Taxa de sucesso dos deployments', ['strategy'])
  }

  setupEventListeners() {
    // Escutar eventos de deployment
    this.on('deploymentStarted', (deployment) => {
      this.metrics.setGauge('active_deployments', this.activeDeployments.size)
      this.metrics.incrementCounter('deployments_total', {
        strategy: deployment.strategy,
        status: 'started'
      })
    })

    this.on('deploymentCompleted', (deployment) => {
      this.metrics.setGauge('active_deployments', this.activeDeployments.size)
      this.metrics.incrementCounter('deployments_total', {
        strategy: deployment.strategy,
        status: deployment.success ? 'success' : 'failed'
      })
      
      const duration = (Date.now() - deployment.startTime) / 1000
      this.metrics.observeHistogram('deployment_duration_seconds', duration, {
        strategy: deployment.strategy
      })
    })

    this.on('rollbackExecuted', (deployment, reason) => {
      this.metrics.incrementCounter('deployment_rollbacks_total', {
        strategy: deployment.strategy,
        reason
      })
    })
  }

  async deploy(options) {
    try {
      const deploymentId = uuidv4()
      const deployment = {
        id: deploymentId,
        strategy: options.strategy || this.config.strategy,
        agents: options.agents || [],
        options: options.options || {},
        status: 'preparing',
        startTime: Date.now(),
        steps: [],
        rollbackPlan: [],
        success: false
      }

      this.logger.info('Iniciando deployment', {
        deploymentId,
        strategy: deployment.strategy,
        agents: deployment.agents
      })

      // Adicionar aos deployments ativos
      this.activeDeployments.set(deploymentId, deployment)
      this.emit('deploymentStarted', deployment)

      try {
        // Validar deployment
        await this.validateDeployment(deployment)

        // Executar estratégia específica
        switch (deployment.strategy) {
          case 'rolling':
            await this.executeRollingDeployment(deployment)
            break
          case 'blue-green':
            await this.executeBlueGreenDeployment(deployment)
            break
          case 'canary':
            await this.executeCanaryDeployment(deployment)
            break
          default:
            throw new Error(`Estratégia de deployment não suportada: ${deployment.strategy}`)
        }

        deployment.status = 'completed'
        deployment.success = true
        deployment.endTime = Date.now()

        this.logger.info('Deployment concluído com sucesso', {
          deploymentId,
          duration: deployment.endTime - deployment.startTime
        })

      } catch (error) {
        deployment.status = 'failed'
        deployment.error = error.message
        deployment.endTime = Date.now()

        this.logger.error('Deployment falhou', {
          deploymentId,
          error: error.message
        })

        // Executar rollback se configurado
        if (this.config.rollbackOnFailure) {
          await this.executeRollback(deployment, 'deployment_failure')
        }

        // Enviar alerta
        await this.alert.send({
          type: 'deployment_failure',
          severity: 'high',
          message: `Deployment ${deploymentId} falhou`,
          details: {
            deploymentId,
            strategy: deployment.strategy,
            error: error.message
          }
        })
      }

      // Remover dos deployments ativos
      this.activeDeployments.delete(deploymentId)
      
      // Adicionar ao histórico
      this.deploymentHistory.push(deployment)
      
      // Manter apenas os últimos 100 deployments no histórico
      if (this.deploymentHistory.length > 100) {
        this.deploymentHistory = this.deploymentHistory.slice(-100)
      }

      this.emit('deploymentCompleted', deployment)

      return {
        deploymentId,
        success: deployment.success,
        status: deployment.status,
        duration: deployment.endTime - deployment.startTime,
        steps: deployment.steps,
        error: deployment.error
      }

    } catch (error) {
      this.logger.error('Erro no deployment:', error)
      throw error
    }
  }

  async validateDeployment(deployment) {
    try {
      deployment.status = 'validating'
      
      // Validar agentes
      if (!deployment.agents || deployment.agents.length === 0) {
        throw new Error('Lista de agentes não pode estar vazia')
      }

      // Verificar se agentes existem
      for (const agentId of deployment.agents) {
        const agent = await this.lifecycle.getAgent(agentId)
        if (!agent) {
          throw new Error(`Agente ${agentId} não encontrado`)
        }
      }

      // Verificar dependências
      const dependencyMap = this.dependency.getDependencyMap()
      for (const agentId of deployment.agents) {
        const dependencies = dependencyMap[agentId] || []
        for (const depId of dependencies) {
          if (!deployment.agents.includes(depId)) {
            const depAgent = await this.lifecycle.getAgent(depId)
            if (!depAgent || depAgent.status !== 'running') {
              throw new Error(`Dependência ${depId} do agente ${agentId} não está rodando`)
            }
          }
        }
      }

      // Verificar se há outros deployments ativos conflitantes
      for (const [activeId, activeDeployment] of this.activeDeployments) {
        if (activeId !== deployment.id) {
          const conflictingAgents = deployment.agents.filter(agent => 
            activeDeployment.agents.includes(agent)
          )
          if (conflictingAgents.length > 0) {
            throw new Error(`Deployment conflitante detectado: ${conflictingAgents.join(', ')}`)
          }
        }
      }

      deployment.steps.push({
        step: 'validation',
        status: 'completed',
        timestamp: new Date().toISOString()
      })

      this.logger.info('Validação do deployment concluída', {
        deploymentId: deployment.id
      })

    } catch (error) {
      deployment.steps.push({
        step: 'validation',
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
      throw error
    }
  }

  async executeRollingDeployment(deployment) {
    try {
      deployment.status = 'executing'
      const config = this.config.strategies.rolling
      const batchSize = Math.min(config.batchSize, deployment.agents.length)
      
      this.logger.info('Executando rolling deployment', {
        deploymentId: deployment.id,
        batchSize,
        totalAgents: deployment.agents.length
      })

      // Ordenar agentes por dependências
      const orderedAgents = this.dependency.topologicalSort(deployment.agents)
      
      // Processar em batches
      for (let i = 0; i < orderedAgents.length; i += batchSize) {
        const batch = orderedAgents.slice(i, i + batchSize)
        
        this.logger.info('Processando batch', {
          deploymentId: deployment.id,
          batch: i / batchSize + 1,
          agents: batch
        })

        // Criar plano de rollback para este batch
        const batchRollbackPlan = []
        
        // Atualizar agentes do batch
        for (const agentId of batch) {
          try {
            // Salvar estado atual para rollback
            const currentAgent = await this.lifecycle.getAgent(agentId)
            batchRollbackPlan.push({
              agentId,
              previousState: currentAgent.status,
              action: 'restore'
            })

            // Parar agente
            await this.lifecycle.stopAgent(agentId, { graceful: true })
            
            // Aguardar um pouco
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            // Iniciar agente (simulando atualização)
            await this.lifecycle.startAgent(agentId)
            
            // Verificar health check
            await this.waitForHealthCheck(agentId)
            
            deployment.steps.push({
              step: `rolling_update_${agentId}`,
              status: 'completed',
              timestamp: new Date().toISOString()
            })

          } catch (error) {
            deployment.steps.push({
              step: `rolling_update_${agentId}`,
              status: 'failed',
              error: error.message,
              timestamp: new Date().toISOString()
            })
            
            // Adicionar plano de rollback
            deployment.rollbackPlan.unshift(...batchRollbackPlan)
            throw error
          }
        }
        
        // Adicionar plano de rollback do batch
        deployment.rollbackPlan.unshift(...batchRollbackPlan)
        
        // Aguardar entre batches se não for o último
        if (i + batchSize < orderedAgents.length) {
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }

    } catch (error) {
      this.logger.error('Erro no rolling deployment:', error)
      throw error
    }
  }

  async executeBlueGreenDeployment(deployment) {
    try {
      deployment.status = 'executing'
      const config = this.config.strategies.blueGreen
      
      this.logger.info('Executando blue-green deployment', {
        deploymentId: deployment.id,
        agents: deployment.agents
      })

      // Fase 1: Preparar ambiente "green"
      deployment.steps.push({
        step: 'prepare_green_environment',
        status: 'started',
        timestamp: new Date().toISOString()
      })

      // Salvar estados atuais (ambiente "blue")
      const blueStates = new Map()
      for (const agentId of deployment.agents) {
        const agent = await this.lifecycle.getAgent(agentId)
        blueStates.set(agentId, agent)
        
        deployment.rollbackPlan.push({
          agentId,
          action: 'restore_blue',
          previousState: agent.status
        })
      }

      // Fase 2: Iniciar agentes no ambiente "green" (simulado)
      for (const agentId of deployment.agents) {
        await this.lifecycle.restartAgent(agentId)
        await this.waitForHealthCheck(agentId)
      }

      deployment.steps.push({
        step: 'prepare_green_environment',
        status: 'completed',
        timestamp: new Date().toISOString()
      })

      // Fase 3: Teste do ambiente "green"
      deployment.steps.push({
        step: 'test_green_environment',
        status: 'started',
        timestamp: new Date().toISOString()
      })

      await new Promise(resolve => setTimeout(resolve, config.testDuration))
      
      // Verificar health de todos os agentes
      for (const agentId of deployment.agents) {
        const healthResult = await this.lifecycle.healthCheckAgent(agentId)
        if (!healthResult.healthy) {
          throw new Error(`Health check falhou para agente ${agentId}`)
        }
      }

      deployment.steps.push({
        step: 'test_green_environment',
        status: 'completed',
        timestamp: new Date().toISOString()
      })

      // Fase 4: Switch para ambiente "green" (já feito)
      deployment.steps.push({
        step: 'switch_to_green',
        status: 'completed',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      this.logger.error('Erro no blue-green deployment:', error)
      throw error
    }
  }

  async executeCanaryDeployment(deployment) {
    try {
      deployment.status = 'executing'
      const config = this.config.strategies.canary
      
      this.logger.info('Executando canary deployment', {
        deploymentId: deployment.id,
        percentage: config.percentage,
        agents: deployment.agents
      })

      // Calcular número de agentes para canary
      const canaryCount = Math.max(1, Math.ceil(deployment.agents.length * config.percentage / 100))
      const canaryAgents = deployment.agents.slice(0, canaryCount)
      const remainingAgents = deployment.agents.slice(canaryCount)
      
      this.logger.info('Agentes selecionados para canary', {
        deploymentId: deployment.id,
        canaryAgents,
        remainingAgents
      })

      // Fase 1: Deploy canary
      deployment.steps.push({
        step: 'canary_deployment',
        status: 'started',
        timestamp: new Date().toISOString()
      })

      for (const agentId of canaryAgents) {
        const currentAgent = await this.lifecycle.getAgent(agentId)
        deployment.rollbackPlan.push({
          agentId,
          action: 'restore',
          previousState: currentAgent.status
        })

        await this.lifecycle.restartAgent(agentId)
        await this.waitForHealthCheck(agentId)
      }

      deployment.steps.push({
        step: 'canary_deployment',
        status: 'completed',
        timestamp: new Date().toISOString()
      })

      // Fase 2: Monitorar canary
      deployment.steps.push({
        step: 'canary_monitoring',
        status: 'started',
        timestamp: new Date().toISOString()
      })

      await new Promise(resolve => setTimeout(resolve, config.duration))
      
      // Verificar métricas de sucesso
      let successRate = 0
      for (const agentId of canaryAgents) {
        const healthResult = await this.lifecycle.healthCheckAgent(agentId)
        if (healthResult.healthy) {
          successRate += 1 / canaryAgents.length
        }
      }

      if (successRate < config.successThreshold) {
        throw new Error(`Taxa de sucesso do canary (${successRate}) abaixo do threshold (${config.successThreshold})`)
      }

      deployment.steps.push({
        step: 'canary_monitoring',
        status: 'completed',
        successRate,
        timestamp: new Date().toISOString()
      })

      // Fase 3: Deploy completo
      if (remainingAgents.length > 0) {
        deployment.steps.push({
          step: 'full_deployment',
          status: 'started',
          timestamp: new Date().toISOString()
        })

        for (const agentId of remainingAgents) {
          const currentAgent = await this.lifecycle.getAgent(agentId)
          deployment.rollbackPlan.push({
            agentId,
            action: 'restore',
            previousState: currentAgent.status
          })

          await this.lifecycle.restartAgent(agentId)
          await this.waitForHealthCheck(agentId)
        }

        deployment.steps.push({
          step: 'full_deployment',
          status: 'completed',
          timestamp: new Date().toISOString()
        })
      }

    } catch (error) {
      this.logger.error('Erro no canary deployment:', error)
      throw error
    }
  }

  async executeRollback(deployment, reason) {
    try {
      this.logger.info('Executando rollback', {
        deploymentId: deployment.id,
        reason,
        rollbackSteps: deployment.rollbackPlan.length
      })

      deployment.status = 'rolling_back'
      
      // Executar plano de rollback em ordem reversa
      for (const rollbackStep of deployment.rollbackPlan.reverse()) {
        try {
          switch (rollbackStep.action) {
            case 'restore':
            case 'restore_blue':
              if (rollbackStep.previousState === 'running') {
                await this.lifecycle.startAgent(rollbackStep.agentId)
              } else {
                await this.lifecycle.stopAgent(rollbackStep.agentId)
              }
              break
            default:
              this.logger.warn('Ação de rollback desconhecida', {
                action: rollbackStep.action,
                agentId: rollbackStep.agentId
              })
          }
        } catch (error) {
          this.logger.error('Erro no rollback do agente', {
            agentId: rollbackStep.agentId,
            error: error.message
          })
        }
      }

      deployment.status = 'rolled_back'
      deployment.rollbackReason = reason
      deployment.rollbackTime = Date.now()

      this.emit('rollbackExecuted', deployment, reason)

      this.logger.info('Rollback concluído', {
        deploymentId: deployment.id,
        reason
      })

    } catch (error) {
      this.logger.error('Erro durante rollback:', error)
      deployment.status = 'rollback_failed'
      throw error
    }
  }

  async waitForHealthCheck(agentId, timeout = 60000) {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      try {
        const healthResult = await this.lifecycle.healthCheckAgent(agentId)
        if (healthResult.healthy) {
          return true
        }
      } catch (error) {
        // Continuar tentando
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    throw new Error(`Timeout aguardando health check do agente ${agentId}`)
  }

  async getDeploymentStatus(deploymentId) {
    try {
      // Verificar deployments ativos
      const activeDeployment = this.activeDeployments.get(deploymentId)
      if (activeDeployment) {
        return {
          ...activeDeployment,
          duration: Date.now() - activeDeployment.startTime
        }
      }

      // Verificar histórico
      const historicalDeployment = this.deploymentHistory.find(d => d.id === deploymentId)
      if (historicalDeployment) {
        return historicalDeployment
      }

      return null
    } catch (error) {
      this.logger.error('Erro ao obter status do deployment:', error)
      throw error
    }
  }

  async getActiveDeployments() {
    return Array.from(this.activeDeployments.values())
  }

  async getDeploymentHistory(limit = 50) {
    return this.deploymentHistory.slice(-limit)
  }

  async cancelDeployment(deploymentId, reason = 'user_request') {
    try {
      const deployment = this.activeDeployments.get(deploymentId)
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} não encontrado ou não está ativo`)
      }

      this.logger.info('Cancelando deployment', {
        deploymentId,
        reason
      })

      // Executar rollback
      await this.executeRollback(deployment, reason)

      return {
        success: true,
        message: 'Deployment cancelado com sucesso'
      }
    } catch (error) {
      this.logger.error('Erro ao cancelar deployment:', error)
      throw error
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Deployment Service...')
      
      // Cancelar deployments ativos
      for (const [deploymentId, deployment] of this.activeDeployments) {
        try {
          await this.cancelDeployment(deploymentId, 'service_shutdown')
        } catch (error) {
          this.logger.error('Erro ao cancelar deployment durante shutdown:', error)
        }
      }
      
      // Limpar dados
      this.activeDeployments.clear()
      
      // Remover listeners
      this.removeAllListeners()
      
      this.logger.info('Deployment Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Deployment Service:', error)
    }
  }
}

module.exports = DeploymentService