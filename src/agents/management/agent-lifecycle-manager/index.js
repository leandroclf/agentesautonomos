/**
 * Agent Lifecycle Manager - Servidor Principal
 * Gerencia o ciclo de vida de todos os agentes do sistema
 */

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const compression = require('compression')
const { createPrometheusMetrics } = require('prom-client')
const winston = require('winston')
const config = require('./config/lifecycleConfig')
const LifecycleService = require('./services/lifecycleService')
const DependencyService = require('./services/dependencyService')
const DeploymentService = require('./services/deploymentService')
const SQSService = require('../../../shared/services/sqsService')
const HealthService = require('../../../shared/services/healthService')
const MetricsService = require('../../../shared/services/metricsService')
const CacheService = require('../../../shared/services/cacheService')
const AlertService = require('../../../shared/services/alertService')

// Configuração de logging
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.logging.format === 'json' ? winston.format.json() : winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(),
    ...(config.logging.file.enabled ? [
      new winston.transports.File({
        filename: config.logging.file.path,
        maxsize: config.logging.file.maxSize,
        maxFiles: config.logging.file.maxFiles
      })
    ] : [])
  ]
})

class AgentLifecycleManager {
  constructor() {
    this.app = express()
    this.server = null
    this.isShuttingDown = false
    this.services = {}
    this.agentStates = new Map()
    this.monitoringInterval = null
    this.healthCheckInterval = null
  }

  async initialize() {
    try {
      logger.info('Inicializando Agent Lifecycle Manager...', {
        version: config.server.version,
        environment: config.server.environment,
        port: config.server.port
      })

      // Inicializar serviços
      await this.initializeServices()

      // Configurar middleware
      this.setupMiddleware()

      // Configurar rotas
      this.setupRoutes()

      // Configurar tratamento de erros
      this.setupErrorHandling()

      // Inicializar monitoramento
      await this.startMonitoring()

      logger.info('Agent Lifecycle Manager inicializado com sucesso')
    } catch (error) {
      logger.error('Erro ao inicializar Agent Lifecycle Manager:', error)
      throw error
    }
  }

  async initializeServices() {
    try {
      // SQS Service
      this.services.sqs = new SQSService({
        region: config.aws.region,
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
        endpoint: config.aws.endpoint
      })

      // Cache Service
      this.services.cache = new CacheService(config.cache)
      await this.services.cache.initialize()

      // Metrics Service
      this.services.metrics = new MetricsService(config.metrics)
      await this.services.metrics.initialize()

      // Health Service
      this.services.health = new HealthService({
        ...config.healthCheck,
        dependencies: {
          sqs: () => this.services.sqs.healthCheck(),
          cache: () => this.services.cache.healthCheck(),
          agents: () => this.checkAgentsHealth()
        }
      })

      // Alert Service
      this.services.alert = new AlertService(config.alerts)
      await this.services.alert.initialize()

      // Lifecycle Service
      this.services.lifecycle = new LifecycleService({
        config: config.lifecycle,
        sqs: this.services.sqs,
        cache: this.services.cache,
        metrics: this.services.metrics,
        alert: this.services.alert,
        logger
      })

      // Dependency Service
      this.services.dependency = new DependencyService({
        config: config.dependencies,
        lifecycle: this.services.lifecycle,
        cache: this.services.cache,
        metrics: this.services.metrics,
        logger
      })

      // Deployment Service
      this.services.deployment = new DeploymentService({
        config: config.deployment,
        lifecycle: this.services.lifecycle,
        dependency: this.services.dependency,
        metrics: this.services.metrics,
        alert: this.services.alert,
        logger
      })

      // Inicializar serviços
      await Promise.all([
        this.services.lifecycle.initialize(),
        this.services.dependency.initialize(),
        this.services.deployment.initialize()
      ])

      logger.info('Todos os serviços inicializados com sucesso')
    } catch (error) {
      logger.error('Erro ao inicializar serviços:', error)
      throw error
    }
  }

  setupMiddleware() {
    // Segurança
    if (config.security.helmet.enabled) {
      this.app.use(helmet({
        contentSecurityPolicy: config.security.helmet.contentSecurityPolicy,
        hsts: {
          maxAge: config.security.helmet.hstsMaxAge
        }
      }))
    }

    // CORS
    if (config.security.cors.enabled) {
      this.app.use(cors({
        origin: config.security.cors.origin,
        methods: config.security.cors.methods.split(','),
        allowedHeaders: config.security.cors.allowedHeaders.split(',')
      }))
    }

    // Rate limiting
    if (config.security.rateLimit.enabled) {
      const limiter = rateLimit({
        windowMs: config.security.rateLimit.windowMs,
        max: config.security.rateLimit.maxRequests,
        message: config.security.rateLimit.message
      })
      this.app.use(limiter)
    }

    // Compressão
    this.app.use(compression())

    // Parse JSON
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Logging de requisições
    this.app.use((req, res, next) => {
      logger.debug('Requisição recebida', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      })
      next()
    })
  }

  setupRoutes() {
    // Health check
    this.app.get(config.healthCheck.path, async (req, res) => {
      try {
        const health = await this.services.health.check()
        res.status(health.status === 'healthy' ? 200 : 503).json(health)
      } catch (error) {
        logger.error('Erro no health check:', error)
        res.status(503).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Métricas
    if (config.metrics.enabled) {
      this.app.get(config.metrics.path, async (req, res) => {
        try {
          const metrics = await this.services.metrics.getMetrics()
          res.set('Content-Type', 'text/plain')
          res.send(metrics)
        } catch (error) {
          logger.error('Erro ao obter métricas:', error)
          res.status(500).json({ error: 'Erro interno do servidor' })
        }
      })
    }

    // Rotas de gerenciamento de agentes
    this.app.get('/agents', async (req, res) => {
      try {
        const agents = await this.services.lifecycle.getAllAgents()
        res.json(agents)
      } catch (error) {
        logger.error('Erro ao obter agentes:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
      }
    })

    this.app.get('/agents/:agentId', async (req, res) => {
      try {
        const agent = await this.services.lifecycle.getAgent(req.params.agentId)
        if (!agent) {
          return res.status(404).json({ error: 'Agente não encontrado' })
        }
        res.json(agent)
      } catch (error) {
        logger.error('Erro ao obter agente:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
      }
    })

    this.app.post('/agents/:agentId/start', async (req, res) => {
      try {
        const result = await this.services.lifecycle.startAgent(req.params.agentId)
        res.json(result)
      } catch (error) {
        logger.error('Erro ao iniciar agente:', error)
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/agents/:agentId/stop', async (req, res) => {
      try {
        const result = await this.services.lifecycle.stopAgent(req.params.agentId)
        res.json(result)
      } catch (error) {
        logger.error('Erro ao parar agente:', error)
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/agents/:agentId/restart', async (req, res) => {
      try {
        const result = await this.services.lifecycle.restartAgent(req.params.agentId)
        res.json(result)
      } catch (error) {
        logger.error('Erro ao reiniciar agente:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // Rotas de dependências
    this.app.get('/dependencies', async (req, res) => {
      try {
        const dependencies = await this.services.dependency.getDependencyMap()
        res.json(dependencies)
      } catch (error) {
        logger.error('Erro ao obter dependências:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
      }
    })

    this.app.get('/dependencies/:agentId', async (req, res) => {
      try {
        const dependencies = await this.services.dependency.getAgentDependencies(req.params.agentId)
        res.json(dependencies)
      } catch (error) {
        logger.error('Erro ao obter dependências do agente:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
      }
    })

    // Rotas de deployment
    this.app.post('/deploy', async (req, res) => {
      try {
        const { strategy, agents, options } = req.body
        const result = await this.services.deployment.deploy({
          strategy,
          agents,
          options
        })
        res.json(result)
      } catch (error) {
        logger.error('Erro no deployment:', error)
        res.status(500).json({ error: error.message })
      }
    })

    this.app.get('/deploy/status/:deploymentId', async (req, res) => {
      try {
        const status = await this.services.deployment.getDeploymentStatus(req.params.deploymentId)
        res.json(status)
      } catch (error) {
        logger.error('Erro ao obter status do deployment:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
      }
    })

    // Rota de informações do sistema
    this.app.get('/system/info', (req, res) => {
      res.json({
        name: config.server.name,
        version: config.server.version,
        environment: config.server.environment,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      })
    })
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint não encontrado',
        path: req.path,
        method: req.method
      })
    })

    // Error handler
    this.app.use((error, req, res, next) => {
      logger.error('Erro não tratado:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      })

      res.status(500).json({
        error: 'Erro interno do servidor',
        timestamp: new Date().toISOString()
      })
    })
  }

  async startMonitoring() {
    // Monitoramento contínuo dos agentes
    if (config.lifecycle.enabled) {
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.services.lifecycle.monitorAgents()
        } catch (error) {
          logger.error('Erro no monitoramento de agentes:', error)
        }
      }, config.lifecycle.monitoringInterval)
    }

    // Health check periódico
    if (config.healthCheck.enabled) {
      this.healthCheckInterval = setInterval(async () => {
        try {
          await this.services.health.check()
        } catch (error) {
          logger.error('Erro no health check periódico:', error)
        }
      }, config.healthCheck.interval)
    }

    logger.info('Monitoramento iniciado')
  }

  async checkAgentsHealth() {
    try {
      const agents = await this.services.lifecycle.getAllAgents()
      const healthyAgents = agents.filter(agent => agent.status === 'running').length
      const totalAgents = agents.length
      
      return {
        healthy: healthyAgents === totalAgents,
        details: {
          total: totalAgents,
          healthy: healthyAgents,
          unhealthy: totalAgents - healthyAgents
        }
      }
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      }
    }
  }

  async start() {
    try {
      await this.initialize()

      this.server = this.app.listen(config.server.port, config.server.host, () => {
        logger.info(`Agent Lifecycle Manager rodando em ${config.server.host}:${config.server.port}`, {
          environment: config.server.environment,
          version: config.server.version
        })
      })

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown('SIGTERM'))
      process.on('SIGINT', () => this.shutdown('SIGINT'))
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error)
        this.shutdown('uncaughtException')
      })
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection:', { reason, promise })
        this.shutdown('unhandledRejection')
      })

    } catch (error) {
      logger.error('Erro ao iniciar servidor:', error)
      process.exit(1)
    }
  }

  async shutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown já em progresso...')
      return
    }

    this.isShuttingDown = true
    logger.info(`Iniciando shutdown graceful (${signal})...`)

    try {
      // Parar intervalos de monitoramento
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval)
      }
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval)
      }

      // Fechar servidor HTTP
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve)
        })
      }

      // Finalizar serviços
      if (this.services.lifecycle) {
        await this.services.lifecycle.shutdown()
      }
      if (this.services.dependency) {
        await this.services.dependency.shutdown()
      }
      if (this.services.deployment) {
        await this.services.deployment.shutdown()
      }
      if (this.services.cache) {
        await this.services.cache.disconnect()
      }

      logger.info('Shutdown concluído com sucesso')
      process.exit(0)
    } catch (error) {
      logger.error('Erro durante shutdown:', error)
      process.exit(1)
    }
  }
}

// Inicializar e executar
if (require.main === module) {
  const manager = new AgentLifecycleManager()
  manager.start().catch((error) => {
    console.error('Erro fatal:', error)
    process.exit(1)
  })
}

module.exports = AgentLifecycleManager