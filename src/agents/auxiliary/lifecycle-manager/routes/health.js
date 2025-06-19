/**
 * Health Check Routes for Agent Lifecycle Manager
 * Rotas de verificação de saúde para o gerenciador de ciclo de vida dos agentes
 */

const express = require('express')
const router = express.Router()
const os = require('os')
const config = require('../config/lifecycleConfig')

module.exports = (services) => {
  const { lifecycleService, agentRegistry, processManager, eventService, sqsService, logger } = services

  // Health check básico
  router.get('/', async (req, res) => {
    try {
      const startTime = Date.now()
      
      // Verificações básicas
      const checks = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        system: {
          platform: os.platform(),
          arch: os.arch(),
          nodeVersion: process.version,
          loadAverage: os.loadavg(),
          freeMemory: os.freemem(),
          totalMemory: os.totalmem()
        }
      }

      // Verificar serviços essenciais
      const serviceChecks = await Promise.allSettled([
        checkAgentRegistry(),
        checkProcessManager(),
        checkEventService(),
        checkSQSConnection()
      ])

      const services = {
        agentRegistry: serviceChecks[0].status === 'fulfilled' ? serviceChecks[0].value : { status: 'error', error: serviceChecks[0].reason?.message },
        processManager: serviceChecks[1].status === 'fulfilled' ? serviceChecks[1].value : { status: 'error', error: serviceChecks[1].reason?.message },
        eventService: serviceChecks[2].status === 'fulfilled' ? serviceChecks[2].value : { status: 'error', error: serviceChecks[2].reason?.message },
        sqsConnection: serviceChecks[3].status === 'fulfilled' ? serviceChecks[3].value : { status: 'error', error: serviceChecks[3].reason?.message }
      }

      // Determinar status geral
      const allServicesHealthy = Object.values(services).every(service => service.status === 'healthy')
      const overallStatus = allServicesHealthy ? 'healthy' : 'degraded'
      
      const responseTime = Date.now() - startTime
      
      const healthData = {
        status: overallStatus,
        timestamp: checks.timestamp,
        responseTime,
        version: config.server.version,
        environment: config.server.environment,
        uptime: checks.uptime,
        system: checks.system,
        memory: {
          used: Math.round(checks.memory.heapUsed / 1024 / 1024),
          total: Math.round(checks.memory.heapTotal / 1024 / 1024),
          external: Math.round(checks.memory.external / 1024 / 1024),
          rss: Math.round(checks.memory.rss / 1024 / 1024)
        },
        services
      }

      const statusCode = overallStatus === 'healthy' ? 200 : 503
      res.status(statusCode).json(healthData)
      
    } catch (error) {
      logger.error('Erro no health check:', error)
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      })
    }
  })

  // Health check detalhado
  router.get('/detailed', async (req, res) => {
    try {
      const startTime = Date.now()
      
      // Obter estatísticas detalhadas
      const [agentStats, processStats, eventStats, systemStatus] = await Promise.allSettled([
        agentRegistry.getAgentStatistics(),
        processManager.getProcessStatistics(),
        eventService.getEventStatistics(),
        lifecycleService.getSystemStatus()
      ])

      // Verificar agentes críticos
      const criticalAgents = await checkCriticalAgents()
      
      // Verificar recursos do sistema
      const resourceChecks = checkSystemResources()
      
      const detailedHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        version: config.server.version,
        environment: config.server.environment,
        uptime: process.uptime(),
        
        statistics: {
          agents: agentStats.status === 'fulfilled' ? agentStats.value : { error: agentStats.reason?.message },
          processes: processStats.status === 'fulfilled' ? processStats.value : { error: processStats.reason?.message },
          events: eventStats.status === 'fulfilled' ? eventStats.value : { error: eventStats.reason?.message },
          system: systemStatus.status === 'fulfilled' ? systemStatus.value : { error: systemStatus.reason?.message }
        },
        
        criticalAgents,
        resources: resourceChecks,
        
        configuration: {
          port: config.server.port,
          logLevel: config.logging.level,
          environment: config.server.environment,
          managedAgentsCount: Object.keys(config.managedAgents).length
        }
      }

      // Determinar status baseado nas verificações
      const hasErrors = Object.values(detailedHealth.statistics).some(stat => stat.error) ||
                       criticalAgents.some(agent => agent.status !== 'running') ||
                       resourceChecks.some(check => check.status === 'warning' || check.status === 'critical')
      
      detailedHealth.status = hasErrors ? 'degraded' : 'healthy'
      
      const statusCode = detailedHealth.status === 'healthy' ? 200 : 503
      res.status(statusCode).json(detailedHealth)
      
    } catch (error) {
      logger.error('Erro no health check detalhado:', error)
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      })
    }
  })

  // Health check rápido (para load balancers)
  router.get('/quick', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    })
  })

  // Readiness check
  router.get('/ready', async (req, res) => {
    try {
      // Verificar se todos os serviços essenciais estão prontos
      const readinessChecks = await Promise.allSettled([
        checkServiceReady('agentRegistry'),
        checkServiceReady('processManager'),
        checkServiceReady('eventService'),
        checkSQSConnection()
      ])

      const allReady = readinessChecks.every(check => 
        check.status === 'fulfilled' && check.value.status === 'ready'
      )

      const readinessData = {
        ready: allReady,
        timestamp: new Date().toISOString(),
        checks: {
          agentRegistry: readinessChecks[0].status === 'fulfilled' ? readinessChecks[0].value : { status: 'not_ready', error: readinessChecks[0].reason?.message },
          processManager: readinessChecks[1].status === 'fulfilled' ? readinessChecks[1].value : { status: 'not_ready', error: readinessChecks[1].reason?.message },
          eventService: readinessChecks[2].status === 'fulfilled' ? readinessChecks[2].value : { status: 'not_ready', error: readinessChecks[2].reason?.message },
          sqsConnection: readinessChecks[3].status === 'fulfilled' ? readinessChecks[3].value : { status: 'not_ready', error: readinessChecks[3].reason?.message }
        }
      }

      const statusCode = allReady ? 200 : 503
      res.status(statusCode).json(readinessData)
      
    } catch (error) {
      logger.error('Erro no readiness check:', error)
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error.message
      })
    }
  })

  // Liveness check
  router.get('/live', (req, res) => {
    // Verificação simples se o processo está vivo
    res.status(200).json({
      alive: true,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime()
    })
  })

  // ===== FUNÇÕES AUXILIARES =====

  async function checkAgentRegistry() {
    try {
      const stats = await agentRegistry.getAgentStatistics()
      return {
        status: 'healthy',
        agentCount: stats.total,
        runningAgents: stats.byState.running || 0,
        lastCheck: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      }
    }
  }

  async function checkProcessManager() {
    try {
      const stats = await processManager.getProcessStatistics()
      return {
        status: 'healthy',
        activeProcesses: stats.active,
        totalProcesses: stats.total,
        lastCheck: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      }
    }
  }

  async function checkEventService() {
    try {
      const stats = await eventService.getEventStatistics()
      const consumerStats = await eventService.getConsumerStatistics()
      
      return {
        status: 'healthy',
        eventsProcessed: stats.totalEvents,
        activeConsumers: consumerStats.active,
        lastCheck: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      }
    }
  }

  async function checkSQSConnection() {
    try {
      const connectionOk = await eventService.testConnection()
      return {
        status: connectionOk ? 'healthy' : 'error',
        connected: connectionOk,
        lastCheck: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'error',
        connected: false,
        error: error.message,
        lastCheck: new Date().toISOString()
      }
    }
  }

  async function checkServiceReady(serviceName) {
    try {
      switch (serviceName) {
        case 'agentRegistry':
          await agentRegistry.getAgentStatistics()
          return { status: 'ready', service: serviceName }
        
        case 'processManager':
          await processManager.getProcessStatistics()
          return { status: 'ready', service: serviceName }
        
        case 'eventService':
          await eventService.getEventStatistics()
          return { status: 'ready', service: serviceName }
        
        default:
          return { status: 'unknown', service: serviceName }
      }
    } catch (error) {
      return {
        status: 'not_ready',
        service: serviceName,
        error: error.message
      }
    }
  }

  async function checkCriticalAgents() {
    try {
      const criticalAgentIds = Object.keys(config.managedAgents).filter(id => 
        config.managedAgents[id].critical === true
      )
      
      const criticalAgents = []
      
      for (const agentId of criticalAgentIds) {
        try {
          const agent = await agentRegistry.getAgent(agentId)
          const processInfo = await processManager.getProcessInfo(agentId)
          
          criticalAgents.push({
            id: agentId,
            name: agent?.name || agentId,
            status: agent?.state || 'unknown',
            pid: processInfo?.pid || null,
            uptime: processInfo?.uptime || 0,
            healthy: agent?.state === 'running' && processInfo?.pid
          })
        } catch (error) {
          criticalAgents.push({
            id: agentId,
            name: agentId,
            status: 'error',
            error: error.message,
            healthy: false
          })
        }
      }
      
      return criticalAgents
    } catch (error) {
      logger.error('Erro ao verificar agentes críticos:', error)
      return []
    }
  }

  function checkSystemResources() {
    const checks = []
    
    // Verificar memória
    const memUsage = process.memoryUsage()
    const memUsedMB = memUsage.heapUsed / 1024 / 1024
    const memTotalMB = memUsage.heapTotal / 1024 / 1024
    const memUsagePercent = (memUsedMB / memTotalMB) * 100
    
    let memStatus = 'ok'
    if (memUsagePercent > 90) memStatus = 'critical'
    else if (memUsagePercent > 75) memStatus = 'warning'
    
    checks.push({
      name: 'memory',
      status: memStatus,
      value: `${memUsedMB.toFixed(1)}MB / ${memTotalMB.toFixed(1)}MB`,
      percentage: memUsagePercent.toFixed(1)
    })
    
    // Verificar uptime
    const uptimeHours = process.uptime() / 3600
    const uptimeStatus = uptimeHours > 0.1 ? 'ok' : 'warning' // Menos de 6 minutos é suspeito
    
    checks.push({
      name: 'uptime',
      status: uptimeStatus,
      value: `${uptimeHours.toFixed(2)} hours`,
      seconds: process.uptime()
    })
    
    // Verificar load average (apenas em sistemas Unix)
    if (os.platform() !== 'win32') {
      const loadAvg = os.loadavg()
      const cpuCount = os.cpus().length
      const load1min = loadAvg[0]
      const loadPercent = (load1min / cpuCount) * 100
      
      let loadStatus = 'ok'
      if (loadPercent > 90) loadStatus = 'critical'
      else if (loadPercent > 75) loadStatus = 'warning'
      
      checks.push({
        name: 'load_average',
        status: loadStatus,
        value: `${load1min.toFixed(2)} (${cpuCount} cores)`,
        percentage: loadPercent.toFixed(1)
      })
    }
    
    // Verificar memória do sistema
    const sysFreeMemMB = os.freemem() / 1024 / 1024
    const sysTotalMemMB = os.totalmem() / 1024 / 1024
    const sysMemUsagePercent = ((sysTotalMemMB - sysFreeMemMB) / sysTotalMemMB) * 100
    
    let sysMemStatus = 'ok'
    if (sysMemUsagePercent > 95) sysMemStatus = 'critical'
    else if (sysMemUsagePercent > 85) sysMemStatus = 'warning'
    
    checks.push({
      name: 'system_memory',
      status: sysMemStatus,
      value: `${(sysTotalMemMB - sysFreeMemMB).toFixed(0)}MB / ${sysTotalMemMB.toFixed(0)}MB`,
      percentage: sysMemUsagePercent.toFixed(1)
    })
    
    return checks
  }

  return router
}