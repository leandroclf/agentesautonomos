/**
 * Event Enricher Agent - Agente de Enriquecimento de Eventos
 * Fase 6: Complementação do Sistema
 * 
 * Responsabilidades:
 * - Enriquecimento de eventos com contexto adicional
 * - Adição de metadados e informações derivadas
 * - Validação e normalização de eventos
 * - Correlação com dados históricos
 * - Transformação de eventos brutos em eventos estruturados
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const EnrichmentService = require('./services/enrichmentService');
const ContextService = require('./services/contextService');
const ValidationService = require('./services/validationService');
const config = require('./config/enricherConfig');

class EventEnricherAgent {
  constructor() {
    this.agentId = 'event-enricher-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService(this.logger);
    this.metrics = this.setupMetrics();
    this.isShuttingDown = false;
    
    // Serviços especializados
    this.enrichmentService = new EnrichmentService(this.logger);
    this.contextService = new ContextService(this.logger);
    this.validationService = new ValidationService(this.logger);
    
    // Estado do agente
    this.startTime = new Date();
    this.stats = {
      totalEvents: 0,
      enrichedEvents: 0,
      failedEvents: 0,
      averageEnrichmentTime: 0,
      uptime: 0
    };
    
    // Filas SQS
    this.inputQueues = [
      'raw-events',
      'incoming-events'
    ];
    this.outputQueues = [
      'enriched-events',
      'validation-errors'
    ];
    
    this.setupServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
  }

  setupLogger() {
    return winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: this.agentId },
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
          filename: `logs/${this.agentId}.log`,
          maxsize: 10485760, // 10MB
          maxFiles: 5
        })
      ]
    });
  }

  setupMetrics() {
    const register = new promClient.Registry();
    
    const metrics = {
      // Enrichment Metrics
      eventsProcessed: new promClient.Counter({
        name: 'event_enricher_events_processed_total',
        help: 'Total number of events processed',
        labelNames: ['type', 'source', 'result'],
        registers: [register]
      }),
      enrichmentDuration: new promClient.Histogram({
        name: 'event_enricher_enrichment_duration_seconds',
        help: 'Duration of event enrichment in seconds',
        labelNames: ['type', 'complexity'],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
        registers: [register]
      }),
      enrichmentFields: new promClient.Counter({
        name: 'event_enricher_fields_added_total',
        help: 'Total number of fields added during enrichment',
        labelNames: ['field_type'],
        registers: [register]
      }),
      validationErrors: new promClient.Counter({
        name: 'event_enricher_validation_errors_total',
        help: 'Total number of validation errors',
        labelNames: ['error_type', 'field'],
        registers: [register]
      }),
      
      // HTTP Metrics
      httpRequests: new promClient.Counter({
        name: 'event_enricher_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
        registers: [register]
      }),
      requestDuration: new promClient.Histogram({
        name: 'event_enricher_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'endpoint'],
        buckets: [0.1, 0.5, 1, 2, 5],
        registers: [register]
      })
    };
    
    // Registrar métricas padrão
    promClient.collectDefaultMetrics({ register });
    
    return { ...metrics, register };
  }

  setupServices() {
    // Enrichment Service Events
    this.enrichmentService.on('enrichmentStarted', (data) => {
      this.handleEnrichmentStarted(data);
    });
    
    this.enrichmentService.on('enrichmentCompleted', (data) => {
      this.handleEnrichmentCompleted(data);
    });
    
    this.enrichmentService.on('enrichmentFailed', (data) => {
      this.handleEnrichmentFailed(data);
    });
    
    // Context Service Events
    this.contextService.on('contextLoaded', (data) => {
      this.handleContextLoaded(data);
    });
    
    // Validation Service Events
    this.validationService.on('validationError', (data) => {
      this.handleValidationError(data);
    });
  }

  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    this.app.use(cors(config.security.cors));
    
    // Rate limiting
    this.app.use(rateLimit({
      windowMs: config.security.rateLimiting.windowMs,
      max: config.security.rateLimiting.max,
      message: 'Too many requests from this IP'
    }));
    
    // Compressão e parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Middleware de métricas
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.metrics.httpRequests.inc({
          method: req.method,
          route: req.route?.path || req.path,
          status: res.statusCode
        });
        this.metrics.requestDuration.observe({
          method: req.method,
          endpoint: req.route?.path || req.path
        }, duration);
      });
      
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        agent: this.agentId,
        uptime: Date.now() - this.startTime.getTime(),
        stats: this.stats
      });
    });
    
    // Métricas
    this.app.get('/metrics', async (req, res) => {
      res.set('Content-Type', this.metrics.register.contentType);
      res.end(await this.metrics.register.metrics());
    });
    
    // API Routes
    const enricherRoutes = require('./routes/enricherRoutes');
    this.app.use('/api', enricherRoutes({
      enrichmentService: this.enrichmentService,
      contextService: this.contextService,
      validationService: this.validationService,
      logger: this.logger,
      metrics: this.metrics
    }));
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      this.isShuttingDown = true;
      
      try {
        // Parar de processar novas mensagens
        await this.sqsService.stopPolling();
        
        // Parar serviços
        await this.enrichmentService.stop();
        await this.contextService.stop();
        await this.validationService.stop();
        
        // Fechar servidor HTTP
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
        }
        
        this.logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async start() {
    try {
      this.logger.info('Starting Event Enricher Agent');
      
      // Inicializar serviços
      await this.enrichmentService.start();
      await this.contextService.start();
      await this.validationService.start();
      
      // Inicializar SQS
      await this.sqsService.initialize();
      
      // Iniciar servidor HTTP
      const port = config.server.port;
      this.server = this.app.listen(port, () => {
        this.logger.info(`Event Enricher Agent listening on port ${port}`);
      });
      
      // Iniciar processamento de mensagens
      await this.startMessageProcessing();
      
      this.logger.info('Event Enricher Agent started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Event Enricher Agent', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async startMessageProcessing() {
    // Processar eventos brutos
    this.sqsService.startPolling('raw-events', async (message) => {
      await this.processRawEvent(message);
    });
    
    // Processar eventos de entrada
    this.sqsService.startPolling('incoming-events', async (message) => {
      await this.processIncomingEvent(message);
    });
  }

  async processRawEvent(message) {
    const startTime = Date.now();
    
    try {
      const rawEvent = JSON.parse(message.Body);
      
      this.logger.debug('Processing raw event', {
        eventId: rawEvent.id,
        type: rawEvent.type,
        source: rawEvent.source
      });
      
      // Enriquecer evento
      const enrichedEvent = await this.enrichmentService.enrichEvent(rawEvent);
      
      // Validar evento enriquecido
      const validationResult = await this.validationService.validateEvent(enrichedEvent);
      
      if (validationResult.valid) {
        // Enviar evento enriquecido
        await this.sqsService.sendMessage('enriched-events', enrichedEvent);
        
        // Atualizar métricas
        this.metrics.eventsProcessed.inc({
          type: rawEvent.type,
          source: rawEvent.source,
          result: 'success'
        });
        
        this.stats.enrichedEvents++;
      } else {
        // Enviar erro de validação
        await this.sqsService.sendMessage('validation-errors', {
          originalEvent: rawEvent,
          enrichedEvent,
          validationErrors: validationResult.errors,
          timestamp: new Date().toISOString()
        });
        
        this.metrics.validationErrors.inc({
          error_type: 'enrichment_validation',
          field: validationResult.errors[0]?.field || 'unknown'
        });
        
        this.stats.failedEvents++;
      }
      
      // Métricas de duração
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.enrichmentDuration.observe({
        type: rawEvent.type,
        complexity: this.getEventComplexity(rawEvent)
      }, duration);
      
      this.stats.totalEvents++;
      
    } catch (error) {
      this.logger.error('Error processing raw event', {
        error: error.message,
        messageId: message.MessageId
      });
      
      this.metrics.eventsProcessed.inc({
        type: 'unknown',
        source: 'unknown',
        result: 'error'
      });
      
      this.stats.failedEvents++;
    }
  }

  async processIncomingEvent(message) {
    try {
      const event = JSON.parse(message.Body);
      
      // Adicionar contexto básico
      const contextualizedEvent = await this.contextService.addContext(event);
      
      // Enviar para enriquecimento completo
      await this.sqsService.sendMessage('raw-events', contextualizedEvent);
      
    } catch (error) {
      this.logger.error('Error processing incoming event', {
        error: error.message,
        messageId: message.MessageId
      });
    }
  }

  getEventComplexity(event) {
    const fieldCount = Object.keys(event).length;
    if (fieldCount < 5) return 'simple';
    if (fieldCount < 15) return 'medium';
    return 'complex';
  }

  // Event Handlers
  handleEnrichmentStarted(data) {
    this.logger.debug('Enrichment started', data);
  }

  handleEnrichmentCompleted(data) {
    this.logger.debug('Enrichment completed', data);
    
    // Contar campos adicionados
    if (data.fieldsAdded) {
      data.fieldsAdded.forEach(field => {
        this.metrics.enrichmentFields.inc({ field_type: field.type });
      });
    }
  }

  handleEnrichmentFailed(data) {
    this.logger.warn('Enrichment failed', data);
  }

  handleContextLoaded(data) {
    this.logger.debug('Context loaded', data);
  }

  handleValidationError(data) {
    this.logger.warn('Validation error', data);
    
    this.metrics.validationErrors.inc({
      error_type: data.type,
      field: data.field
    });
  }
}

// Inicializar e iniciar o agente se executado diretamente
if (require.main === module) {
  const agent = new EventEnricherAgent();
  agent.start().catch(error => {
    console.error('Failed to start Event Enricher Agent:', error);
    process.exit(1);
  });
}

module.exports = EventEnricherAgent;