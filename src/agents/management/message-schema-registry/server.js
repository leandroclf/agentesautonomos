/**
 * Message Schema Registry Server
 * Servidor principal que integra todos os serviços do registro de esquemas
 */

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const swaggerUi = require('swagger-ui-express')
const swaggerJsdoc = require('swagger-jsdoc')
const winston = require('winston')
const cluster = require('cluster')
const os = require('os')
const path = require('path')

// Importar configuração
const config = require('./config/schemaConfig')

// Importar serviços
const SchemaService = require('./services/schemaService')
const ValidationService = require('./services/validationService')
const VersionService = require('./services/versionService')
const CompatibilityService = require('./services/compatibilityService')
const MigrationService = require('./services/migrationService')
const SQSService = require('./services/sqsService')
const CacheService = require('./services/cacheService')
const HealthService = require('./services/healthService')
const MetricsService = require('./services/metricsService')
const AlertService = require('./services/alertService')

// Importar rotas
const schemaRoutes = require('./routes/schemaRoutes')
const validationRoutes = require('./routes/validationRoutes')
const versionRoutes = require('./routes/versionRoutes')
const compatibilityRoutes = require('./routes/compatibilityRoutes')
const migrationRoutes = require('./routes/migrationRoutes')
const healthRoutes = require('./routes/healthRoutes')
const metricsRoutes = require('./routes/metricsRoutes')

class MessageSchemaRegistryServer {
  constructor() {
    this.app = express()
    this.server = null
    this.services = {}
    this.logger = null
    this.isShuttingDown = false
    
    this.setupLogger()
    this.setupServices()
    this.setupMiddleware()
    this.setupRoutes()
    this.setupErrorHandling()
    this.setupGracefulShutdown()
  }

  /**
   * Configurar logger
   */
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
        })
      ]
    })

    // Adicionar transporte de arquivo se configurado
    if (config.logging.maxFiles) {
      this.logger.add(new winston.transports.File({
        filename: path.join(__dirname, 'logs', 'error.log'),
        level: 'error',
        maxsize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles
      }))

      this.logger.add(new winston.transports.File({
        filename: path.join(__dirname, 'logs', 'combined.log'),
        maxsize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles
      }))
    }

    // Capturar exceções não tratadas
    this.logger.exceptions.handle(
      new winston.transports.Console(),
      new winston.transports.File({ 
        filename: path.join(__dirname, 'logs', 'exceptions.log') 
      })
    )

    this.logger.rejections.handle(
      new winston.transports.Console(),
      new winston.transports.File({ 
        filename: path.join(__dirname, 'logs', 'rejections.log') 
      })
    )
  }

  /**
   * Configurar serviços
   */
  async setupServices() {
    try {
      this.logger.info('Inicializando serviços...')

      // Inicializar serviços na ordem correta
      this.services.cache = new CacheService()
      await this.services.cache.initialize()

      this.services.metrics = new MetricsService()
      await this.services.metrics.initialize()

      this.services.schema = new SchemaService(this.services.cache, this.services.metrics)
      await this.services.schema.initialize()

      this.services.validation = new ValidationService(
        this.services.schema,
        this.services.cache,
        this.services.metrics
      )
      await this.services.validation.initialize()

      this.services.version = new VersionService(
        this.services.schema,
        this.services.cache,
        this.services.metrics
      )
      await this.services.version.initialize()

      this.services.compatibility = new CompatibilityService(
        this.services.schema,
        this.services.cache,
        this.services.metrics
      )
      await this.services.compatibility.initialize()

      this.services.migration = new MigrationService(
        this.services.schema,
        this.services.compatibility,
        this.services.cache,
        this.services.metrics
      )
      await this.services.migration.initialize()

      this.services.alert = new AlertService(this.services.metrics)
      await this.services.alert.initialize()

      this.services.health = new HealthService({
        schema: this.services.schema,
        validation: this.services.validation,
        version: this.services.version,
        compatibility: this.services.compatibility,
        migration: this.services.migration,
        cache: this.services.cache,
        metrics: this.services.metrics,
        alert: this.services.alert
      })
      await this.services.health.initialize()

      // Inicializar SQS se habilitado
      if (config.aws.accessKeyId && config.aws.secretAccessKey) {
        this.services.sqs = new SQSService(
          this.services.schema,
          this.services.validation,
          this.services.migration,
          this.services.metrics
        )
        await this.services.sqs.initialize()
      }

      this.logger.info('Todos os serviços inicializados com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar serviços:', error)
      throw error
    }
  }

  /**
   * Configurar middleware
   */
  setupMiddleware() {
    // Middleware de segurança
    this.app.use(helmet(config.security.helmet))
    
    // CORS
    this.app.use(cors(config.security.cors))
    
    // Compressão
    if (config.performance.compressionEnabled) {
      this.app.use(compression({
        level: config.performance.compressionLevel
      }))
    }
    
    // Rate limiting
    const limiter = rateLimit(config.security.rateLimit)
    this.app.use(limiter)
    
    // Parsing de JSON
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
    
    // Middleware de logging de requisições
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
        
        // Atualizar métricas
        if (this.services.metrics) {
          this.services.metrics.recordHttpRequest(
            req.method,
            req.route?.path || req.url,
            res.statusCode,
            duration
          )
        }
      })
      
      next()
    })
    
    // Middleware para injetar serviços nas requisições
    this.app.use((req, res, next) => {
      req.services = this.services
      req.logger = this.logger
      next()
    })
  }

  /**
   * Configurar rotas
   */
  setupRoutes() {
    // Rota de status básico
    this.app.get('/', (req, res) => {
      res.json({
        service: config.server.name,
        version: config.server.version,
        environment: config.server.environment,
        status: 'running',
        timestamp: new Date().toISOString()
      })
    })

    // Rotas da API
    const apiRouter = express.Router()
    
    apiRouter.use('/schemas', schemaRoutes)
    apiRouter.use('/validation', validationRoutes)
    apiRouter.use('/versions', versionRoutes)
    apiRouter.use('/compatibility', compatibilityRoutes)
    apiRouter.use('/migration', migrationRoutes)
    
    this.app.use(config.api.basePath, apiRouter)
    
    // Rotas de sistema
    this.app.use('/health', healthRoutes)
    this.app.use('/metrics', metricsRoutes)
    
    // Documentação da API
    if (config.api.docs.enabled) {
      const swaggerOptions = {
        definition: {
          openapi: '3.0.0',
          info: {
            title: config.api.docs.title,
            version: config.server.version,
            description: config.api.docs.description
          },
          servers: [
            {
              url: `http://${config.server.host}:${config.server.port}${config.api.basePath}`,
              description: 'Development server'
            }
          ]
        },
        apis: ['./routes/*.js', './models/*.js']
      }
      
      const specs = swaggerJsdoc(swaggerOptions)
      this.app.use(config.api.docs.path, swaggerUi.serve, swaggerUi.setup(specs))
    }
  }

  /**
   * Configurar tratamento de erros
   */
  setupErrorHandling() {
    // Handler para rotas não encontradas
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      })
    })

    // Handler global de erros
    this.app.use((error, req, res, next) => {
      this.logger.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
      })

      // Atualizar métricas de erro
      if (this.services.metrics) {
        this.services.metrics.incrementErrorCount('unhandled_error')
      }

      // Enviar alerta se configurado
      if (this.services.alert) {
        this.services.alert.createAlert({
          type: 'unhandled_error',
          severity: 'high',
          message: `Erro não tratado: ${error.message}`,
          metadata: {
            url: req.url,
            method: req.method,
            stack: error.stack
          }
        })
      }

      const statusCode = error.statusCode || error.status || 500
      const message = config.server.environment === 'production' 
        ? 'Internal Server Error' 
        : error.message

      res.status(statusCode).json({
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
        ...(config.server.environment !== 'production' && { stack: error.stack })
      })
    })
  }

  /**
   * Configurar graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        this.logger.warn('Shutdown já em andamento, forçando saída...')
        process.exit(1)
      }

      this.isShuttingDown = true
      this.logger.info(`Recebido sinal ${signal}, iniciando graceful shutdown...`)

      try {
        // Parar de aceitar novas conexões
        if (this.server) {
          this.server.close(() => {
            this.logger.info('Servidor HTTP fechado')
          })
        }

        // Shutdown dos serviços na ordem inversa
        const shutdownPromises = []
        
        if (this.services.sqs) {
          shutdownPromises.push(this.services.sqs.shutdown())
        }
        if (this.services.health) {
          shutdownPromises.push(this.services.health.shutdown())
        }
        if (this.services.alert) {
          shutdownPromises.push(this.services.alert.shutdown())
        }
        if (this.services.migration) {
          shutdownPromises.push(this.services.migration.shutdown())
        }
        if (this.services.compatibility) {
          shutdownPromises.push(this.services.compatibility.shutdown())
        }
        if (this.services.version) {
          shutdownPromises.push(this.services.version.shutdown())
        }
        if (this.services.validation) {
          shutdownPromises.push(this.services.validation.shutdown())
        }
        if (this.services.schema) {
          shutdownPromises.push(this.services.schema.shutdown())
        }
        if (this.services.metrics) {
          shutdownPromises.push(this.services.metrics.shutdown())
        }
        if (this.services.cache) {
          shutdownPromises.push(this.services.cache.shutdown())
        }

        await Promise.all(shutdownPromises)
        this.logger.info('Graceful shutdown concluído')
        process.exit(0)
      } catch (error) {
        this.logger.error('Erro durante graceful shutdown:', error)
        process.exit(1)
      }
    }

    // Registrar handlers para sinais de shutdown
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
    
    // Handler para exceções não capturadas
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error)
      shutdown('uncaughtException')
    })
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
      shutdown('unhandledRejection')
    })
  }

  /**
   * Iniciar servidor
   */
  async start() {
    try {
      await this.setupServices()
      
      this.server = this.app.listen(config.server.port, config.server.host, () => {
        this.logger.info(`Message Schema Registry iniciado`, {
          host: config.server.host,
          port: config.server.port,
          environment: config.server.environment,
          version: config.server.version,
          pid: process.pid
        })
        
        if (config.api.docs.enabled) {
          this.logger.info(`Documentação disponível em: http://${config.server.host}:${config.server.port}${config.api.docs.path}`)
        }
        
        this.logger.info(`Health check disponível em: http://${config.server.host}:${config.server.port}/health`)
        this.logger.info(`Métricas disponíveis em: http://${config.server.host}:${config.server.port}/metrics`)
      })
      
      this.server.on('error', (error) => {
        this.logger.error('Erro no servidor:', error)
        throw error
      })
      
    } catch (error) {
      this.logger.error('Erro ao iniciar servidor:', error)
      throw error
    }
  }

  /**
   * Parar servidor
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve)
      })
    }
  }
}

// Função para iniciar com clustering se habilitado
function startWithClustering() {
  const numWorkers = config.production?.clustering?.workers || os.cpus().length
  
  if (cluster.isMaster) {
    console.log(`Master ${process.pid} iniciando ${numWorkers} workers...`)
    
    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
      cluster.fork()
    }
    
    // Restart worker se morrer
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} morreu (${signal || code}). Reiniciando...`)
      cluster.fork()
    })
  } else {
    // Worker process
    const server = new MessageSchemaRegistryServer()
    server.start().catch((error) => {
      console.error('Erro ao iniciar worker:', error)
      process.exit(1)
    })
  }
}

// Iniciar servidor
if (require.main === module) {
  if (config.production?.clustering?.enabled && config.server.environment === 'production') {
    startWithClustering()
  } else {
    const server = new MessageSchemaRegistryServer()
    server.start().catch((error) => {
      console.error('Erro ao iniciar servidor:', error)
      process.exit(1)
    })
  }
}

module.exports = MessageSchemaRegistryServer