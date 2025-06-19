/**
 * Metrics Routes for Agent Lifecycle Manager
 * Rotas de métricas para o gerenciador de ciclo de vida dos agentes
 */

const express = require('express')
const router = express.Router()
const promClient = require('prom-client')
const config = require('../config/lifecycleConfig')

module.exports = (services) => {
  const { lifecycleService, agentRegistry, processManager, eventService, logger } = services

  // Registrar métricas customizadas
  const register = new promClient.Registry()
  
  // Métricas padrão do Node.js
  promClient.collectDefaultMetrics({ register })

  // ===== MÉTRICAS CUSTOMIZADAS =====

  // Contador de agentes por estado
  const agentStateGauge = new promClient.Gauge({
    name: 'lifecycle_manager_agents_by_state',
    help: 'Número de agentes por estado',
    labelNames: ['state'],
    registers: [register]
  })

  // Contador de agentes por categoria
  const agentCategoryGauge = new promClient.Gauge({
    name: 'lifecycle_manager_agents_by_category',
    help: 'Número de agentes por categoria',
    labelNames: ['category'],
    registers: [register]
  })

  // Contador de processos ativos
  const activeProcessesGauge = new promClient.Gauge({
    name: 'lifecycle_manager_active_processes',
    help: 'Número de processos ativos',
    registers: [register]
  })

  // Contador de eventos processados
  const eventsProcessedCounter = new promClient.Counter({
    name: 'lifecycle_manager_events_processed_total',
    help: 'Total de eventos processados',
    labelNames: ['event_type', 'queue'],
    registers: [register]
  })

  // Histograma de tempo de resposta das operações
  const operationDurationHistogram = new promClient.Histogram({
    name: 'lifecycle_manager_operation_duration_seconds',
    help: 'Duração das operações em segundos',
    labelNames: ['operation', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [register]
  })

  // Gauge para uptime dos agentes
  const agentUptimeGauge = new promClient.Gauge({
    name: 'lifecycle_manager_agent_uptime_seconds',
    help: 'Tempo de atividade dos agentes em segundos',
    labelNames: ['agent_id', 'agent_name'],
    registers: [register]
  })

  // Contador de reinicializações de agentes
  const agentRestartsCounter = new promClient.Counter({
    name: 'lifecycle_manager_agent_restarts_total',
    help: 'Total de reinicializações de agentes',
    labelNames: ['agent_id', 'reason'],
    registers: [register]
  })

  // Gauge para uso de memória dos processos
  const processMemoryGauge = new promClient.Gauge({
    name: 'lifecycle_manager_process_memory_bytes',
    help: 'Uso de memória dos processos em bytes',
    labelNames: ['agent_id', 'memory_type'],
    registers: [register]
  })

  // Gauge para consumidores SQS ativos
  const sqsConsumersGauge = new promClient.Gauge({
    name: 'lifecycle_manager_sqs_consumers_active',
    help: 'Número de consumidores SQS ativos',
    labelNames: ['queue_name'],
    registers: [register]
  })

  // Contador de falhas de operações
  const operationFailuresCounter = new promClient.Counter({
    name: 'lifecycle_manager_operation_failures_total',
    help: 'Total de falhas em operações',
    labelNames: ['operation', 'error_type'],
    registers: [register]
  })

  // Gauge para health score do sistema
  const systemHealthGauge = new promClient.Gauge({
    name: 'lifecycle_manager_system_health_score',
    help: 'Score de saúde do sistema (0-100)',
    registers: [register]
  })

  // ===== FUNÇÕES DE COLETA DE MÉTRICAS =====

  async function updateMetrics() {
    try {
      // Atualizar métricas de agentes
      await updateAgentMetrics()
      
      // Atualizar métricas de processos
      await updateProcessMetrics()
      
      // Atualizar métricas de eventos
      await updateEventMetrics()
      
      // Atualizar métricas de sistema
      await updateSystemMetrics()
      
    } catch (error) {
      logger.error('Erro ao atualizar métricas:', error)
      operationFailuresCounter.inc({ operation: 'update_metrics', error_type: error.name || 'unknown' })
    }
  }

  async function updateAgentMetrics() {
    try {
      const stats = await agentRegistry.getAgentStatistics()
      
      // Limpar métricas anteriores
      agentStateGauge.reset()
      agentCategoryGauge.reset()
      agentUptimeGauge.reset()
      
      // Atualizar contadores por estado
      Object.entries(stats.byState || {}).forEach(([state, count]) => {
        agentStateGauge.set({ state }, count)
      })
      
      // Atualizar contadores por categoria
      Object.entries(stats.byCategory || {}).forEach(([category, count]) => {
        agentCategoryGauge.set({ category }, count)
      })
      
      // Atualizar uptime dos agentes
      const allAgents = await agentRegistry.getAllAgents()
      for (const agent of allAgents) {
        if (agent.state === 'running' && agent.startedAt) {
          const uptime = (Date.now() - new Date(agent.startedAt).getTime()) / 1000
          agentUptimeGauge.set(
            { agent_id: agent.id, agent_name: agent.name || agent.id },
            uptime
          )
        }
      }
      
    } catch (error) {
      logger.error('Erro ao atualizar métricas de agentes:', error)
      throw error
    }
  }

  async function updateProcessMetrics() {
    try {
      const stats = await processManager.getProcessStatistics()
      
      // Atualizar contador de processos ativos
      activeProcessesGauge.set(stats.active || 0)
      
      // Atualizar métricas de memória dos processos
      processMemoryGauge.reset()
      
      const allProcesses = await processManager.getAllProcesses()
      for (const process of allProcesses) {
        if (process.memoryUsage) {
          Object.entries(process.memoryUsage).forEach(([memType, value]) => {
            processMemoryGauge.set(
              { agent_id: process.agentId, memory_type: memType },
              value
            )
          })
        }
      }
      
    } catch (error) {
      logger.error('Erro ao atualizar métricas de processos:', error)
      throw error
    }
  }

  async function updateEventMetrics() {
    try {
      const consumerStats = await eventService.getConsumerStatistics()
      
      // Limpar métricas de consumidores
      sqsConsumersGauge.reset()
      
      // Atualizar consumidores ativos por fila
      Object.entries(consumerStats.byQueue || {}).forEach(([queueName, stats]) => {
        sqsConsumersGauge.set({ queue_name: queueName }, stats.active || 0)
      })
      
    } catch (error) {
      logger.error('Erro ao atualizar métricas de eventos:', error)
      throw error
    }
  }

  async function updateSystemMetrics() {
    try {
      const systemStatus = await lifecycleService.getSystemStatus()
      
      // Calcular score de saúde do sistema
      let healthScore = 100
      
      // Reduzir score baseado em agentes com problemas
      const agentStats = await agentRegistry.getAgentStatistics()
      const totalAgents = agentStats.total || 1
      const runningAgents = agentStats.byState?.running || 0
      const agentHealthRatio = runningAgents / totalAgents
      
      healthScore *= agentHealthRatio
      
      // Reduzir score baseado em uso de recursos
      const memUsage = process.memoryUsage()
      const memUsageRatio = memUsage.heapUsed / memUsage.heapTotal
      if (memUsageRatio > 0.9) healthScore *= 0.7
      else if (memUsageRatio > 0.8) healthScore *= 0.9
      
      systemHealthGauge.set(Math.max(0, Math.min(100, healthScore)))
      
    } catch (error) {
      logger.error('Erro ao atualizar métricas de sistema:', error)
      systemHealthGauge.set(0) // Sistema com problemas
      throw error
    }
  }

  // ===== MIDDLEWARE PARA INSTRUMENTAÇÃO =====

  function instrumentOperation(operationName) {
    return (req, res, next) => {
      const startTime = Date.now()
      
      res.on('finish', () => {
        const duration = (Date.now() - startTime) / 1000
        const status = res.statusCode >= 400 ? 'error' : 'success'
        
        operationDurationHistogram
          .labels(operationName, status)
          .observe(duration)
        
        if (status === 'error') {
          operationFailuresCounter.inc({
            operation: operationName,
            error_type: `http_${res.statusCode}`
          })
        }
      })
      
      next()
    }
  }

  // ===== ROTAS DE MÉTRICAS =====

  // Endpoint principal de métricas (formato Prometheus)
  router.get('/', async (req, res) => {
    try {
      // Atualizar métricas antes de retornar
      await updateMetrics()
      
      res.set('Content-Type', register.contentType)
      res.end(await register.metrics())
      
    } catch (error) {
      logger.error('Erro ao gerar métricas:', error)
      res.status(500).json({
        error: 'Erro ao gerar métricas',
        message: error.message
      })
    }
  })

  // Métricas em formato JSON
  router.get('/json', async (req, res) => {
    try {
      await updateMetrics()
      
      const metrics = await register.getMetricsAsJSON()
      
      res.json({
        timestamp: new Date().toISOString(),
        metrics
      })
      
    } catch (error) {
      logger.error('Erro ao gerar métricas JSON:', error)
      res.status(500).json({
        error: 'Erro ao gerar métricas JSON',
        message: error.message
      })
    }
  })

  // Métricas customizadas detalhadas
  router.get('/detailed', async (req, res) => {
    try {
      const [agentStats, processStats, eventStats, systemStatus] = await Promise.allSettled([
        agentRegistry.getAgentStatistics(),
        processManager.getProcessStatistics(),
        eventService.getEventStatistics(),
        lifecycleService.getSystemStatus()
      ])

      const detailedMetrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        
        agents: {
          statistics: agentStats.status === 'fulfilled' ? agentStats.value : { error: agentStats.reason?.message },
          byState: {},
          byCategory: {},
          uptime: {}
        },
        
        processes: {
          statistics: processStats.status === 'fulfilled' ? processStats.value : { error: processStats.reason?.message },
          active: 0,
          memory: {}
        },
        
        events: {
          statistics: eventStats.status === 'fulfilled' ? eventStats.value : { error: eventStats.reason?.message },
          consumers: {},
          processed: 0
        },
        
        system: {
          status: systemStatus.status === 'fulfilled' ? systemStatus.value : { error: systemStatus.reason?.message },
          health: 0,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      }

      // Preencher dados detalhados
      if (agentStats.status === 'fulfilled') {
        const allAgents = await agentRegistry.getAllAgents()
        
        for (const agent of allAgents) {
          // Contadores por estado
          detailedMetrics.agents.byState[agent.state] = 
            (detailedMetrics.agents.byState[agent.state] || 0) + 1
          
          // Contadores por categoria
          detailedMetrics.agents.byCategory[agent.category] = 
            (detailedMetrics.agents.byCategory[agent.category] || 0) + 1
          
          // Uptime dos agentes
          if (agent.state === 'running' && agent.startedAt) {
            const uptime = (Date.now() - new Date(agent.startedAt).getTime()) / 1000
            detailedMetrics.agents.uptime[agent.id] = uptime
          }
        }
      }

      if (processStats.status === 'fulfilled') {
        detailedMetrics.processes.active = processStats.value.active || 0
        
        const allProcesses = await processManager.getAllProcesses()
        for (const process of allProcesses) {
          if (process.memoryUsage) {
            detailedMetrics.processes.memory[process.agentId] = process.memoryUsage
          }
        }
      }

      if (eventStats.status === 'fulfilled') {
        detailedMetrics.events.processed = eventStats.value.totalEvents || 0
        
        const consumerStats = await eventService.getConsumerStatistics()
        detailedMetrics.events.consumers = consumerStats.byQueue || {}
      }

      // Calcular health score
      const agentHealthRatio = Object.values(detailedMetrics.agents.byState).reduce((sum, count) => sum + count, 0) > 0 ?
        (detailedMetrics.agents.byState.running || 0) / Object.values(detailedMetrics.agents.byState).reduce((sum, count) => sum + count, 0) : 0
      
      detailedMetrics.system.health = Math.round(agentHealthRatio * 100)

      res.json(detailedMetrics)
      
    } catch (error) {
      logger.error('Erro ao gerar métricas detalhadas:', error)
      res.status(500).json({
        error: 'Erro ao gerar métricas detalhadas',
        message: error.message
      })
    }
  })

  // Métricas de performance
  router.get('/performance', async (req, res) => {
    try {
      const performanceMetrics = {
        timestamp: new Date().toISOString(),
        
        process: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          pid: process.pid,
          version: process.version
        },
        
        operations: {
          // Métricas de operações serão coletadas do histograma
          durations: {},
          failures: {}
        },
        
        resources: {
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024)
          }
        }
      }

      res.json(performanceMetrics)
      
    } catch (error) {
      logger.error('Erro ao gerar métricas de performance:', error)
      res.status(500).json({
        error: 'Erro ao gerar métricas de performance',
        message: error.message
      })
    }
  })

  // Reset de métricas (apenas para desenvolvimento)
  router.post('/reset', (req, res) => {
    if (config.server.environment !== 'development') {
      return res.status(403).json({
        error: 'Reset de métricas disponível apenas em desenvolvimento'
      })
    }
    
    try {
      register.clear()
      
      // Re-registrar métricas padrão
      promClient.collectDefaultMetrics({ register })
      
      res.json({
        success: true,
        message: 'Métricas resetadas com sucesso',
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      logger.error('Erro ao resetar métricas:', error)
      res.status(500).json({
        error: 'Erro ao resetar métricas',
        message: error.message
      })
    }
  })

  // ===== INICIALIZAÇÃO =====

  // Configurar coleta automática de métricas
  const metricsInterval = setInterval(async () => {
    try {
      await updateMetrics()
    } catch (error) {
      logger.error('Erro na coleta automática de métricas:', error)
    }
  }, config.monitoring.metricsInterval || 30000) // 30 segundos por padrão

  // Cleanup no shutdown
  process.on('SIGTERM', () => {
    clearInterval(metricsInterval)
  })

  process.on('SIGINT', () => {
    clearInterval(metricsInterval)
  })

  // Expor funções para instrumentação
  router.instrumentOperation = instrumentOperation
  router.updateMetrics = updateMetrics
  router.counters = {
    eventsProcessed: eventsProcessedCounter,
    agentRestarts: agentRestartsCounter,
    operationFailures: operationFailuresCounter
  }
  router.gauges = {
    agentState: agentStateGauge,
    agentCategory: agentCategoryGauge,
    activeProcesses: activeProcessesGauge,
    agentUptime: agentUptimeGauge,
    processMemory: processMemoryGauge,
    sqsConsumers: sqsConsumersGauge,
    systemHealth: systemHealthGauge
  }
  router.histograms = {
    operationDuration: operationDurationHistogram
  }

  return router
}