/**
 * External Event API Gateway
 * Ponto de entrada para eventos externos via REST API
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const config = require('./config/gatewayConfig');
const EventGatewayService = require('./services/eventGatewayService');
const AuthService = require('./services/authService');
const gatewayRoutes = require('./routes/gatewayRoutes');
const gatewayMiddleware = require('./middleware/gatewayMiddleware');

class ExternalEventAPIGateway {
  constructor() {
    this.app = express();
    this.server = null;
    this.logger = null;
    this.eventGatewayService = null;
    this.authService = null;
    this.isRunning = false;
    this.startTime = new Date();
    
    this.initializeLogger();
    this.initializeMetrics();
  }

  /**
   * Inicializa o sistema de logging
   */
  initializeLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const transports = [];

    if (config.logging.enableConsole) {
      transports.push(new winston.transports.Console({
        format: config.logging.format === 'json' ? logFormat : winston.format.simple()
      }));
    }

    if (config.logging.enableFile) {
      transports.push(new winston.transports.File({
        filename: config.logging.logFile,
        format: logFormat,
        maxsize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles
      }));
    }

    this.logger = winston.createLogger({
      level: config.logging.level,
      format: logFormat,
      transports,
      defaultMeta: {
        service: 'external-event-api-gateway',
        version: '1.0.0'
      }
    });
  }

  /**
   * Inicializa as métricas Prometheus
   */
  initializeMetrics() {
    if (config.metrics.enabled) {
      // Limpa métricas existentes
      promClient.register.clear();

      // Coleta métricas padrão do Node.js
      if (config.metrics.collectDefaultMetrics) {
        promClient.collectDefaultMetrics({
          prefix: config.metrics.prefix,
          labels: config.metrics.labels
        });
      }

      // Métricas customizadas
      this.metrics = {
        httpRequestsTotal: new promClient.Counter({
          name: `${config.metrics.prefix}http_requests_total`,
          help: 'Total number of HTTP requests',
          labelNames: ['method', 'route', 'status_code']
        }),

        httpRequestDuration: new promClient.Histogram({
          name: `${config.metrics.prefix}http_request_duration_seconds`,
          help: 'Duration of HTTP requests in seconds',
          labelNames: ['method', 'route', 'status_code'],
          buckets: [0.1, 0.5, 1, 2, 5, 10]
        }),

        eventsProcessedTotal: new promClient.Counter({
          name: `${config.metrics.prefix}events_processed_total`,
          help: 'Total number of events processed',
          labelNames: ['event_type', 'status']
        }),

        eventsValidationErrors: new promClient.Counter({
          name: `${config.metrics.prefix}events_validation_errors_total`,
          help: 'Total number of event validation errors',
          labelNames: ['error_type']
        }),

        sqsMessagesPublished: new promClient.Counter({
          name: `${config.metrics.prefix}sqs_messages_published_total`,
          help: 'Total number of messages published to SQS',
          labelNames: ['queue_name', 'status']
        }),

        activeConnections: new promClient.Gauge({
          name: `${config.metrics.prefix}active_connections`,
          help: 'Number of active connections'
        }),

        uptime: new promClient.Gauge({
          name: `${config.metrics.prefix}uptime_seconds`,
          help: 'Service uptime in seconds'
        })
      };

      // Atualiza uptime a cada 10 segundos
      setInterval(() => {
        if (this.metrics.uptime) {
          this.metrics.uptime.set((Date.now() - this.startTime.getTime()) / 1000);
        }
      }, 10000);
    }
  }

  /**
   * Configura middlewares do Express
   */
  setupMiddlewares() {
    // Trust proxy se configurado
    if (config.security.trustProxy) {
      this.app.set('trust proxy', true);
    }

    // Segurança
    if (config.security.enableHelmet) {
      this.app.use(helmet());
    }

    // CORS
    if (config.security.enableCors) {
      this.app.use(cors({
        origin: config.security.corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', config.security.apiKeyHeader]
      }));
    }

    // Compressão
    this.app.use(compression());

    // Parse JSON com limite de tamanho
    this.app.use(express.json({ 
      limit: config.server.maxPayloadSize,
      strict: true
    }));

    // Parse URL encoded
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: config.server.maxPayloadSize 
    }));

    // Middlewares customizados
    this.app.use(gatewayMiddleware.requestLogger(this.logger));
    this.app.use(gatewayMiddleware.requestMetrics(this.metrics));
    this.app.use(gatewayMiddleware.requestTimeout(config.server.timeout));
    
    if (config.rateLimiting.enabled) {
      this.app.use(gatewayMiddleware.rateLimiter(config.rateLimiting));
    }

    this.app.use(gatewayMiddleware.requestValidation());
    this.app.use(gatewayMiddleware.errorHandler(this.logger));
  }

  /**
   * Configura as rotas
   */
  setupRoutes() {
    // Rota de métricas
    if (config.metrics.enabled) {
      this.app.get(config.metrics.path, (req, res) => {
        res.set('Content-Type', promClient.register.contentType);
        res.end(promClient.register.metrics());
      });
    }

    // Rotas principais
    this.app.use('/api/gateway', gatewayRoutes({
      eventGatewayService: this.eventGatewayService,
      authService: this.authService,
      logger: this.logger,
      metrics: this.metrics
    }));

    // Rota 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Inicializa os serviços
   */
  async initializeServices() {
    try {
      // Inicializa serviço de autenticação
      this.authService = new AuthService(config, this.logger);
      await this.authService.start();

      // Inicializa serviço principal do gateway
      this.eventGatewayService = new EventGatewayService(config, this.logger, this.metrics);
      await this.eventGatewayService.start();

      this.logger.info('Todos os serviços inicializados com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar serviços:', error);
      throw error;
    }
  }

  /**
   * Inicia o servidor
   */
  async start() {
    try {
      this.logger.info('Iniciando External Event API Gateway...');

      // Inicializa serviços
      await this.initializeServices();

      // Configura middlewares e rotas
      this.setupMiddlewares();
      this.setupRoutes();

      // Inicia servidor HTTP
      this.server = this.app.listen(config.server.port, config.server.host, () => {
        this.isRunning = true;
        this.logger.info(`External Event API Gateway rodando em ${config.server.host}:${config.server.port}`);
        this.logger.info(`Ambiente: ${config.server.environment}`);
        this.logger.info(`Métricas disponíveis em: ${config.metrics.path}`);
        this.logger.info(`Health check disponível em: ${config.healthCheck.path}`);
      });

      // Configura timeout do servidor
      this.server.timeout = config.server.timeout;

      // Handlers de sinal
      process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

      // Handler de erros não capturados
      process.on('uncaughtException', (error) => {
        this.logger.error('Uncaught Exception:', error);
        this.gracefulShutdown('uncaughtException');
      });

      process.on('unhandledRejection', (reason, promise) => {
        this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        this.gracefulShutdown('unhandledRejection');
      });

    } catch (error) {
      this.logger.error('Erro ao iniciar External Event API Gateway:', error);
      process.exit(1);
    }
  }

  /**
   * Para o servidor graciosamente
   */
  async gracefulShutdown(signal) {
    this.logger.info(`Recebido sinal ${signal}. Iniciando shutdown gracioso...`);
    
    this.isRunning = false;

    try {
      // Para de aceitar novas conexões
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Servidor HTTP fechado');
        });
      }

      // Para os serviços
      if (this.eventGatewayService) {
        await this.eventGatewayService.stop();
      }

      if (this.authService) {
        await this.authService.stop();
      }

      this.logger.info('Shutdown gracioso concluído');
      process.exit(0);
    } catch (error) {
      this.logger.error('Erro durante shutdown gracioso:', error);
      process.exit(1);
    }
  }

  /**
   * Retorna status do gateway
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: Date.now() - this.startTime.getTime(),
      environment: config.server.environment,
      version: '1.0.0',
      services: {
        eventGateway: this.eventGatewayService ? this.eventGatewayService.getStatus() : null,
        auth: this.authService ? this.authService.getStatus() : null
      }
    };
  }
}

// Inicia o gateway se executado diretamente
if (require.main === module) {
  const gateway = new ExternalEventAPIGateway();
  gateway.start().catch(error => {
    console.error('Falha ao iniciar External Event API Gateway:', error);
    process.exit(1);
  });
}

module.exports = ExternalEventAPIGateway;