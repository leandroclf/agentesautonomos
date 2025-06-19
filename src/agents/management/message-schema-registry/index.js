/**
 * Message Schema Registry - Servidor Principal
 * Gerenciamento centralizado de esquemas de mensagens
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
const config = require('./config/schemaConfig')
const SchemaService = require('./services/schemaService')
const ValidationService = require('./services/validationService')
const VersionService = require('./services/versionService')
const CompatibilityService = require('./services/compatibilityService')
const MigrationService = require('./services/migrationService')
const SQSService = require('../../../services/sqs-service')
const HealthService = require('./services/healthService')
const MetricsService = require('./services/metricsService')
const CacheService = require('./services/cacheService')
const AlertService = require('./services/alertService')

class MessageSchemaRegistry {
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
      
      this.logger.info('Inicializando Message Schema Registry...', {
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

      this.logger.info('Message Schema Registry inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Message Schema Registry:', error)
      throw error
    }
  }

  setupLogger() {
    const transports = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ]

    if (config.server.environment !== 'test') {
      transports.push(
        new DailyRotateFile({
          filename: 'logs/schema-registry-%DATE%.log',
          datePattern: config.logging.datePattern,
          maxSize: config.logging.maxSize,
          maxFiles: config.logging.maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      )
    }

    this.logger = winston.createLogger({
      level: config.logging.level,
      transports
    })
  }

  async initializeServices() {
    try {
      // Cache Service
      this.services.cache = new CacheService({
        config: config.cache,
        logger: this.logger
      })
      await this.services.cache.initialize()

      // Metrics Service
      this.services.metrics = new MetricsService({
        config: config.metrics,
        logger: this.logger
      })
      await this.services.metrics.initialize()

      // Alert Service
      this.services.alert = new AlertService({
        config: config.alerts,
        metrics: this.services.metrics,
        logger: this.logger
      })
      await this.services.alert.initialize()

      // SQS Service
      this.services.sqs = new SQSService({
        region: config.aws.region,
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
        endpoint: config.aws.endpoint,
        logger: this.logger
      })
      await this.services.sqs.initialize()

      // Schema Service
      this.services.schema = new SchemaService({
        config: config.schema,
        cache: this.services.cache,
        metrics: this.services.metrics,
        alert: this.services.alert,
        sqs: this.services.sqs,
        logger: this.logger
      })
      await this.services.schema.initialize()

      // Version Service
      this.services.version = new VersionService({
        config: config.schema.versioning,
        schema: this.services.schema,
        cache: this.services.cache,
        metrics: this.services.metrics,
        logger: this.logger
      })
      await this.services.version.initialize()

      // Compatibility Service
      this.services.compatibility = new CompatibilityService({
        config: config.schema.compatibility,
        schema: this.services.schema,
        version: this.services.version,
        metrics: this.services.metrics,
        alert: this.services.alert,
        logger: this.logger
      })
      await this.services.compatibility.initialize()

      // Validation Service
      this.services.validation = new ValidationService({
        config: config.schema.validation,
        schema: this.services.schema,
        cache: this.services.cache,
        metrics: this.services.metrics,
        logger: this.logger
      })
      await this.services.validation.initialize()

      // Migration Service
      this.services.migration = new MigrationService({
        config: config.migration,
        schema: this.services.schema,
        version: this.services.version,
        compatibility: this.services.compatibility,
        metrics: this.services.metrics,
        alert: this.services.alert,
        logger: this.logger
      })
      await this.services.migration.initialize()

      // Health Service
      this.services.health = new HealthService({
        config: config.health,
        services: this.services,
        logger: this.logger
      })
      await this.services.health.initialize()

      this.logger.info('Todos os serviços inicializados com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar serviços:', error)
      throw error
    }
  }

  setupMiddleware() {
    // Segurança
    this.app.use(helmet(config.security.helmet))
    
    // CORS
    this.app.use(cors(config.security.cors))
    
    // Rate limiting
    this.app.use(rateLimit(config.security.rateLimit))
    
    // Compressão
    this.app.use(compression())
    
    // Parse JSON
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
    
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now()
      
      res.on('finish', () => {
        const duration = Date.now() - start
        this.logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent')
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
    const apiRouter = express.Router()

    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.services.health.getHealthStatus()
        res.status(health.status === 'healthy' ? 200 : 503).json(health)
      } catch (error) {
        this.logger.error('Erro no health check:', error)
        res.status(503).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Métricas
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

    // Rotas de esquemas
    apiRouter.get('/schemas', async (req, res) => {
      try {
        const { page = 1, limit = 20, format, subject } = req.query
        const schemas = await this.services.schema.listSchemas({
          page: parseInt(page),
          limit: parseInt(limit),
          format,
          subject
        })
        res.json(schemas)
      } catch (error) {
        this.logger.error('Erro ao listar esquemas:', error)
        res.status(500).json({ error: error.message })
      }
    })

    apiRouter.post('/schemas', async (req, res) => {
      try {
        const { subject, schema, format = 'json-schema', compatibility } = req.body
        
        if (!subject || !schema) {
          return res.status(400).json({ error: 'Subject e schema são obrigatórios' })
        }

        const result = await this.services.schema.registerSchema({
          subject,
          schema,
          format,
          compatibility
        })
        
        res.status(201).json(result)
      } catch (error) {
        this.logger.error('Erro ao registrar esquema:', error)
        res.status(400).json({ error: error.message })
      }
    })

    apiRouter.get('/schemas/:subject', async (req, res) => {
      try {
        const { subject } = req.params
        const { version = 'latest' } = req.query
        
        const schema = await this.services.schema.getSchema(subject, version)
        if (!schema) {
          return res.status(404).json({ error: 'Esquema não encontrado' })
        }
        
        res.json(schema)
      } catch (error) {
        this.logger.error('Erro ao obter esquema:', error)
        res.status(500).json({ error: error.message })
      }
    })

    apiRouter.delete('/schemas/:subject', async (req, res) => {
      try {
        const { subject } = req.params
        const { version } = req.query
        
        const result = await this.services.schema.deleteSchema(subject, version)
        res.json(result)
      } catch (error) {
        this.logger.error('Erro ao deletar esquema:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // Rotas de validação
    apiRouter.post('/validate/:subject', async (req, res) => {
      try {
        const { subject } = req.params
        const { data, version = 'latest' } = req.body
        
        if (!data) {
          return res.status(400).json({ error: 'Dados para validação são obrigatórios' })
        }

        const result = await this.services.validation.validateMessage(subject, data, version)
        res.json(result)
      } catch (error) {
        this.logger.error('Erro na validação:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // Rotas de versões
    apiRouter.get('/schemas/:subject/versions', async (req, res) => {
      try {
        const { subject } = req.params
        const versions = await this.services.version.getVersions(subject)
        res.json(versions)
      } catch (error) {
        this.logger.error('Erro ao obter versões:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // Rotas de compatibilidade
    apiRouter.post('/compatibility/:subject', async (req, res) => {
      try {
        const { subject } = req.params
        const { schema, version = 'latest' } = req.body
        
        if (!schema) {
          return res.status(400).json({ error: 'Esquema é obrigatório' })
        }

        const result = await this.services.compatibility.checkCompatibility(subject, schema, version)
        res.json(result)
      } catch (error) {
        this.logger.error('Erro na verificação de compatibilidade:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // Rotas de migração
    apiRouter.post('/migrate/:subject', async (req, res) => {
      try {
        const { subject } = req.params
        const { fromVersion, toVersion, data } = req.body
        
        if (!fromVersion || !toVersion || !data) {
          return res.status(400).json({ error: 'fromVersion, toVersion e data são obrigatórios' })
        }

        const result = await this.services.migration.migrateData(subject, fromVersion, toVersion, data)
        res.json(result)
      } catch (error) {
        this.logger.error('Erro na migração:', error)
        res.status(500).json({ error: error.message })
      }
    })

    // Informações do sistema
    apiRouter.get('/info', (req, res) => {
      res.json({
        service: config.server.name,
        version: config.server.version,
        environment: config.server.environment,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        supportedFormats: config.schema.supportedFormats,
        knownAgents: Object.keys(config.knownAgents)
      })
    })

    // Montar rotas da API
    this.app.use(config.api.basePath, apiRouter)

    // Documentação da API (se habilitada)
    if (config.api.docs.enabled) {
      this.app.get(config.api.docs.path, (req, res) => {
        res.json({
          title: config.api.docs.title,
          description: config.api.docs.description,
          version: config.api.version,
          endpoints: {
            'GET /health': 'Health check do serviço',
            'GET /metrics': 'Métricas Prometheus',
            'GET /api/v1/schemas': 'Listar esquemas',
            'POST /api/v1/schemas': 'Registrar novo esquema',
            'GET /api/v1/schemas/:subject': 'Obter esquema específico',
            'DELETE /api/v1/schemas/:subject': 'Deletar esquema',
            'POST /api/v1/validate/:subject': 'Validar dados contra esquema',
            'GET /api/v1/schemas/:subject/versions': 'Listar versões do esquema',
            'POST /api/v1/compatibility/:subject': 'Verificar compatibilidade',
            'POST /api/v1/migrate/:subject': 'Migrar dados entre versões',
            'GET /api/v1/info': 'Informações do sistema'
          }
        })
      })
    }
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint não encontrado',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      })
    })

    // Error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('Erro não tratado:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      })

      res.status(error.status || 500).json({
        error: config.server.environment === 'production' 
          ? 'Erro interno do servidor' 
          : error.message,
        timestamp: new Date().toISOString()
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
    }, config.health.interval)

    // Coleta de métricas
    this.metricsInterval = setInterval(async () => {
      try {
        await this.services.metrics.collectSystemMetrics()
      } catch (error) {
        this.logger.error('Erro na coleta de métricas:', error)
      }
    }, config.metrics.collectionInterval)
  }

  async start() {
    try {
      await this.initialize()

      this.server = this.app.listen(config.server.port, config.server.host, () => {
        this.logger.info(`Message Schema Registry rodando em ${config.server.host}:${config.server.port}`)
      })

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown('SIGTERM'))
      process.on('SIGINT', () => this.shutdown('SIGINT'))
      process.on('uncaughtException', (error) => {
        this.logger.error('Uncaught Exception:', error)
        this.shutdown('uncaughtException')
      })
      process.on('unhandledRejection', (reason, promise) => {
        this.logger.error('Unhandled Rejection:', { reason, promise })
        this.shutdown('unhandledRejection')
      })

    } catch (error) {
      this.logger.error('Erro ao iniciar servidor:', error)
      process.exit(1)
    }
  }

  async shutdown(signal) {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    this.logger.info(`Recebido sinal ${signal}, iniciando shutdown gracioso...`)

    try {
      // Parar intervalos
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval)
      }
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval)
      }

      // Fechar servidor HTTP
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve)
        })
      }

      // Finalizar serviços
      for (const [name, service] of Object.entries(this.services)) {
        if (service && typeof service.shutdown === 'function') {
          try {
            await service.shutdown()
            this.logger.info(`Serviço ${name} finalizado`)
          } catch (error) {
            this.logger.error(`Erro ao finalizar serviço ${name}:`, error)
          }
        }
      }

      this.logger.info('Shutdown concluído')
      process.exit(0)
    } catch (error) {
      this.logger.error('Erro durante shutdown:', error)
      process.exit(1)
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const registry = new MessageSchemaRegistry()
  registry.start()
}

module.exports = MessageSchemaRegistry