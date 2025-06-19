/**
 * Persistence Agent - Agente de Persistência Avançada
 * Responsável por persistência de dados, backup, replicação e gerenciamento de estado
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const config = require('./config/persistenceConfig');
const PersistenceService = require('./services/persistenceService');
const DatabaseService = require('./services/databaseService');
const CacheService = require('./services/cacheService');
const BackupService = require('./services/backupService');
const persistenceRoutes = require('./routes/persistenceRoutes');
const persistenceMiddleware = require('./middleware/persistenceMiddleware');

class PersistenceAgent {
  constructor() {
    this.app = express();
    this.server = null;
    this.logger = null;
    this.metrics = {
      register: new promClient.Registry(),
      httpRequests: null,
      httpDuration: null,
      documentsStored: null,
      documentsRetrieved: null,
      cacheHits: null,
      cacheMisses: null,
      backupOperations: null,
      databaseConnections: null,
      errorCount: null
    };
    this.services = {
      persistence: null,
      database: null,
      cache: null,
      backup: null
    };
    this.isShuttingDown = false;
  }

  /**
   * Inicializa o agente de persistência
   */
  async initialize() {
    try {
      // Configurar logging
      this.setupLogging();
      this.logger.info('Inicializando Persistence Agent...');

      // Configurar métricas
      this.setupMetrics();

      // Inicializar serviços
      await this.initializeServices();

      // Configurar middlewares
      this.setupMiddlewares();

      // Configurar rotas
      this.setupRoutes();

      // Configurar tratamento de erros
      this.setupErrorHandling();

      this.logger.info('Persistence Agent inicializado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar Persistence Agent:', error);
      throw error;
    }
  }

  /**
   * Configura o sistema de logging
   */
  setupLogging() {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const transports = [];

    if (config.logging.enableConsole) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    if (config.logging.enableFile) {
      transports.push(new winston.transports.File({
        filename: config.logging.filename,
        format: logFormat,
        maxsize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles
      }));
    }

    this.logger = winston.createLogger({
      level: config.logging.level,
      format: logFormat,
      transports
    });
  }

  /**
   * Configura as métricas Prometheus
   */
  setupMetrics() {
    // Métricas HTTP
    this.metrics.httpRequests = new promClient.Counter({
      name: `${config.metrics.prefix}http_requests_total`,
      help: 'Total de requisições HTTP',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.metrics.register]
    });

    this.metrics.httpDuration = new promClient.Histogram({
      name: `${config.metrics.prefix}http_request_duration_seconds`,
      help: 'Duração das requisições HTTP em segundos',
      labelNames: ['method', 'route'],
      registers: [this.metrics.register]
    });

    // Métricas de persistência
    this.metrics.documentsStored = new promClient.Counter({
      name: `${config.metrics.prefix}documents_stored_total`,
      help: 'Total de documentos armazenados',
      labelNames: ['type', 'collection'],
      registers: [this.metrics.register]
    });

    this.metrics.documentsRetrieved = new promClient.Counter({
      name: `${config.metrics.prefix}documents_retrieved_total`,
      help: 'Total de documentos recuperados',
      labelNames: ['type', 'collection'],
      registers: [this.metrics.register]
    });

    // Métricas de cache
    this.metrics.cacheHits = new promClient.Counter({
      name: `${config.metrics.prefix}cache_hits_total`,
      help: 'Total de cache hits',
      registers: [this.metrics.register]
    });

    this.metrics.cacheMisses = new promClient.Counter({
      name: `${config.metrics.prefix}cache_misses_total`,
      help: 'Total de cache misses',
      registers: [this.metrics.register]
    });

    // Métricas de backup
    this.metrics.backupOperations = new promClient.Counter({
      name: `${config.metrics.prefix}backup_operations_total`,
      help: 'Total de operações de backup',
      labelNames: ['type', 'status'],
      registers: [this.metrics.register]
    });

    // Métricas de conexão
    this.metrics.databaseConnections = new promClient.Gauge({
      name: `${config.metrics.prefix}database_connections_active`,
      help: 'Conexões ativas com o banco de dados',
      registers: [this.metrics.register]
    });

    // Métricas de erro
    this.metrics.errorCount = new promClient.Counter({
      name: `${config.metrics.prefix}errors_total`,
      help: 'Total de erros',
      labelNames: ['type', 'operation'],
      registers: [this.metrics.register]
    });

    // Métricas padrão do sistema
    if (config.metrics.collectDefaultMetrics) {
      promClient.collectDefaultMetrics({
        register: this.metrics.register,
        prefix: config.metrics.prefix
      });
    }
  }

  /**
   * Inicializa os serviços
   */
  async initializeServices() {
    try {
      // Inicializar Database Service
      this.services.database = new DatabaseService(config, this.logger, this.metrics);
      await this.services.database.initialize();

      // Inicializar Cache Service
      this.services.cache = new CacheService(config, this.logger, this.metrics);
      await this.services.cache.initialize();

      // Inicializar Backup Service
      this.services.backup = new BackupService(config, this.logger, this.metrics);
      await this.services.backup.initialize();

      // Inicializar Persistence Service principal
      this.services.persistence = new PersistenceService(
        config,
        this.logger,
        this.metrics,
        this.services.database,
        this.services.cache,
        this.services.backup
      );
      await this.services.persistence.initialize();

      this.logger.info('Todos os serviços inicializados com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar serviços:', error);
      throw error;
    }
  }

  /**
   * Configura os middlewares
   */
  setupMiddlewares() {
    // Middlewares de segurança
    if (config.security.enableHelmet) {
      this.app.use(helmet());
    }

    if (config.security.enableCors) {
      this.app.use(cors({
        origin: config.security.corsOrigin,
        credentials: true
      }));
    }

    // Middleware de compressão
    this.app.use(compression());

    // Middleware de parsing
    this.app.use(express.json({ limit: config.server.maxPayloadSize }));
    this.app.use(express.urlencoded({ extended: true, limit: config.server.maxPayloadSize }));

    // Middlewares customizados
    this.app.use(persistenceMiddleware.requestLogger(this.logger));
    this.app.use(persistenceMiddleware.metricsCollector(this.metrics));
    this.app.use(persistenceMiddleware.requestTimeout(config.server.timeout));
    
    if (config.security.rateLimitEnabled) {
      this.app.use(persistenceMiddleware.rateLimiter(config.security));
    }

    this.app.use(persistenceMiddleware.requestValidation());
    this.app.use(persistenceMiddleware.requestSanitization());
    this.app.use(persistenceMiddleware.correlationId());
  }

  /**
   * Configura as rotas
   */
  setupRoutes() {
    // Rota de métricas
    if (config.metrics.enabled) {
      this.app.get(config.metrics.path, (req, res) => {
        res.set('Content-Type', this.metrics.register.contentType);
        res.end(this.metrics.register.metrics());
      });
    }

    // Rotas principais do agente
    this.app.use('/', persistenceRoutes(this.services, this.logger, this.metrics));

    // Rota 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint não encontrado',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Configura o tratamento de erros
   */
  setupErrorHandling() {
    this.app.use(persistenceMiddleware.errorHandler(this.logger, this.metrics));

    // Tratamento de erros não capturados
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      this.metrics.errorCount.inc({ type: 'uncaught_exception', operation: 'process' });
      this.gracefulShutdown('SIGTERM');
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.metrics.errorCount.inc({ type: 'unhandled_rejection', operation: 'process' });
    });

    // Tratamento de sinais de sistema
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  /**
   * Inicia o servidor
   */
  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(config.server.port, config.server.host, () => {
        this.logger.info(`Persistence Agent rodando em http://${config.server.host}:${config.server.port}`);
        this.logger.info(`Métricas disponíveis em http://${config.server.host}:${config.server.port}${config.metrics.path}`);
        this.logger.info(`Health check disponível em http://${config.server.host}:${config.server.port}${config.healthCheck.path}`);
      });

      // Configurar timeout do servidor
      this.server.timeout = config.server.timeout;

      return this.server;
    } catch (error) {
      this.logger.error('Erro ao iniciar servidor:', error);
      throw error;
    }
  }

  /**
   * Para o servidor graciosamente
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`Recebido sinal ${signal}. Iniciando shutdown gracioso...`);

    try {
      // Parar de aceitar novas conexões
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Servidor HTTP fechado');
        });
      }

      // Parar serviços
      if (this.services.persistence) {
        await this.services.persistence.stop();
      }
      if (this.services.backup) {
        await this.services.backup.stop();
      }
      if (this.services.cache) {
        await this.services.cache.stop();
      }
      if (this.services.database) {
        await this.services.database.stop();
      }

      this.logger.info('Shutdown gracioso concluído');
      process.exit(0);
    } catch (error) {
      this.logger.error('Erro durante shutdown gracioso:', error);
      process.exit(1);
    }
  }

  /**
   * Retorna o status do agente
   */
  getStatus() {
    return {
      agent: {
        name: 'Persistence Agent',
        version: '1.0.0',
        status: 'running',
        uptime: process.uptime(),
        environment: config.server.environment,
        port: config.server.port
      },
      services: {
        persistence: this.services.persistence?.getStatus() || 'not_initialized',
        database: this.services.database?.getStatus() || 'not_initialized',
        cache: this.services.cache?.getStatus() || 'not_initialized',
        backup: this.services.backup?.getStatus() || 'not_initialized'
      },
      health: {
        status: 'healthy',
        timestamp: new Date().toISOString()
      }
    };
  }
}

// Inicializar e executar se chamado diretamente
if (require.main === module) {
  const agent = new PersistenceAgent();
  agent.start().catch((error) => {
    console.error('Falha ao iniciar Persistence Agent:', error);
    process.exit(1);
  });
}

module.exports = PersistenceAgent;