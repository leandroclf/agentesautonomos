/**
 * Agent Lifecycle Manager - Servidor Principal
 * Gerenciamento completo do ciclo de vida dos agentes
 */

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const compression = require('compression')
const { createPrometheusMetrics } = require('prom-client')
const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')

// Configurações e serviços
const config = require('./config/lifecycleConfig')
const LifecycleService = require('./services/lifecycleService')
const AgentRegistryService = require('./services/agentRegistryService')
const ProcessManagerService = require('./services/processManagerService')
const EventService = require('./services/eventService')
const SQSService = require('../../../services/sqs-service')
const HealthService = require('./services/healthService')
const MetricsService = require('./services/metricsService')

class AgentLifecycleManager {
  constructor() {
    this.app = express()
    this.server = null
    this.logger = null
    this.services = {}
    this.isShuttingDown = false
    this.healthCheckInterval = null
    this.metricsInterval = null
  }

  async initialize() {
    try {
      // Configurar logger
      this.setupLogger()
      
      this.logger.info('Inicializando Agent Lifecycle Manager...', {
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

      // Iniciar monitoramento
      this.startMonitoring()

      this.logger.info('Agent Lifecycle Manager inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Agent Lifecycle Manager:', error)
      throw error
    }
  }

  setupLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )

    this.logger = winston.createLogger({
      level: config.logging.level,
      format: logFormat,
      defaultMeta: {
        service: config.server.name,
        version: config.server.version,
        environment: config.server.environment
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new DailyRotateFile({
          filename: `logs/agents/${config.server.name}-%DATE%.log`,
          datePattern: config.logging.datePattern,
          maxSize: config.logging.maxSize,
          maxFiles: config.logging.maxFiles,
          format: logFormat
        })
      ]
    })
  }

  async initializeServices() {
    this.logger.info('Inicializando serviços...')

    // Inicializar SQS Service
    this.services.sqs = new SQSService({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.SQS_ENDPOINT,
      queuePrefix: process.env.QUEUE_PREFIX || 'agents-development'
    })

    // Inicializar serviços principais
    this.services.agentRegistry = new AgentRegistryService(this.logger)
    this.services.processManager = new ProcessManagerService(this.logger)
    this.services.event = new EventService(this.services.sqs, this.logger)
    this.services.lifecycle = new LifecycleService(
      this.services.agentRegistry,
      this.services.processManager,
      this.services.event,
      this.logger
    )
    this.services.health = new HealthService(this.logger)
    this.services.metrics = new MetricsService(config.server.name)

    // Inicializar serviços
    await this.services.agentRegistry.initialize()
    await this.services.processManager.initialize()
    await this.services.event.initialize()
    await this.services.lifecycle.initialize()

    this.logger.info('Serviços inicializados com sucesso')
  }

  setupMiddleware() {
    // Segurança
    this.app.use(helmet(config.security.helmet))
    this.app.use(cors(config.security.cors))
    
    // Rate limiting
    const limiter = rateLimit(config.security.rateLimit)
    this.app.use(limiter)

    // Compressão e parsing
    this.app.use(compression())
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Logging de requisições
    this.app.use((req, res, next) => {
      const start = Date.now()
      res.on('finish', () => {
        const duration = Date.now() - start
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        })
        
        // Métricas
        this.services.metrics?.recordHttpRequest(
          req.method,
          req.route?.path || req.url,
          res.statusCode,
          duration
        )
      })
      next()
    })
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.services.health.getHealthStatus()
        res.status(health.status === 'healthy' ? 200 : 503).json(health)
      } catch (error) {
        this.logger.error('Erro no health check:', error)
        res.status(503).json({ status: 'error', message: error.message })
      }
    })

    // Métricas Prometheus
    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.services.metrics.getMetrics()
        res.set('Content-Type', 'text/plain')
        res.send(metrics)
      } catch (error) {
        this.logger.error('Erro ao obter métricas:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
      }
    })

    // Rotas da API
    this.app.use('/api/agents', require('./routes/agentRoutes')(this.services))
    this.app.use('/api/lifecycle', require('./routes/lifecycleRoutes')(this.services))
    this.app.use('/api/processes', require('./routes/processRoutes')(this.services))
    this.app.use('/api/events', require('./routes/eventRoutes')(this.services))

    // Rota raiz
    this.app.get('/', (req, res) => {
      res.json({
        service: config.server.name,
        version: config.server.version,
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          agents: '/api/agents',
          lifecycle: '/api/lifecycle',
          processes: '/api/processes',
          events: '/api/events'
        }
      })
    })
  }

  setupErrorHandling() {
    // Handler para rotas não encontradas
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint não encontrado',
        path: req.originalUrl,
        method: req.method
      })
    })

    // Handler global de erros
    this.app.use((error, req, res, next) => {
      this.logger.error('Erro não tratado:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      })

      res.status(error.status || 500).json({
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    })
  }

  startMonitoring() {
    // Health check periódico
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.services.health.performHealthCheck()
      } catch (error) {
        this.logger.error('Erro no health check periódico:', error)
      }
    }, config.monitoring.healthCheckInterval)

    // Coleta de métricas
    this.metricsInterval = setInterval(async () => {
      try {
        await this.services.metrics.collectSystemMetrics()
      } catch (error) {
        this.logger.error('Erro na coleta de métricas:', error)
      }
    }, config.monitoring.metricsInterval)
  }

  async start() {
    try {
      await this.initialize()
      
      this.server = this.app.listen(config.server.port, config.server.host, () => {
        this.logger.info(`Agent Lifecycle Manager rodando em http://${config.server.host}:${config.server.port}`)
      })

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown('SIGTERM'))
      process.on('SIGINT', () => this.shutdown('SIGINT'))
      process.on('uncaughtException', (error) => {
        this.logger.error('Exceção não capturada:', error)
        this.shutdown('uncaughtException')
      })
      process.on('unhandledRejection', (reason, promise) => {
        this.logger.error('Promise rejeitada não tratada:', { reason, promise })
        this.shutdown('unhandledRejection')
      })

    } catch (error) {
      this.logger.error('Erro ao iniciar servidor:', error)
      process.exit(1)
    }
  }

  async shutdown(signal) {
    if (this.isShuttingDown) return
    this.isShuttingDown = true

    this.logger.info(`Recebido sinal ${signal}. Iniciando shutdown graceful...`)

    // Parar intervalos
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)
    if (this.metricsInterval) clearInterval(this.metricsInterval)

    // Fechar servidor HTTP
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve)
      })
    }

    // Finalizar serviços
    if (this.services.lifecycle) await this.services.lifecycle.shutdown()
    if (this.services.event) await this.services.event.shutdown()
    if (this.services.processManager) await this.services.processManager.shutdown()

    this.logger.info('Shutdown concluído')
    process.exit(0)
  }
}

// Inicializar se executado diretamente
if (require.main === module) {
  const manager = new AgentLifecycleManager()
  manager.start().catch(error => {
    console.error('Erro fatal:', error)
    process.exit(1)
  })
}

module.exports = AgentLifecycleManager