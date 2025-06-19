/**
 * Event Agent - Agente de Processamento de Eventos
 * Fase 1-2: Processamento de eventos e coordenação
 * 
 * Responsabilidades:
 * - Receber eventos do Interface Agent
 * - Processar e validar eventos
 * - Coordenar com Planning Agent
 * - Gerenciar estado de eventos
 * - Implementar retry e DLQ
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const MockSQSService = require('../../../services/mock-sqs-service');
const EventService = require('./services/eventService');
const config = require('../../../config');

class EventAgent {
  constructor() {
    this.agentId = 'event-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    // Use MockSQSService in development, real SQSService in production
    this.sqsService = process.env.NODE_ENV === 'development' 
      ? new MockSQSService(this.logger)
      : new SQSService(this.logger);
    this.metrics = this.setupMetrics();
    this.eventService = null;
    this.isShuttingDown = false;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupLogger() {
    return winston.createLogger({
      level: config.shared.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        config.shared.logging.format === 'json' 
          ? winston.format.json()
          : winston.format.simple()
      ),
      defaultMeta: { service: this.agentId },
      transports: [
        ...(config.shared.logging.enableConsole ? [
          new winston.transports.Console()
        ] : []),
        ...(config.shared.logging.enableFile ? [
          new winston.transports.File({ 
            filename: `${config.shared.logging.logDirectory}/${this.agentId}.log`,
            maxsize: config.shared.logging.maxFileSize,
            maxFiles: config.shared.logging.maxFiles
          })
        ] : [])
      ]
    });
  }

  setupMetrics() {
    const register = new promClient.Registry();
    
    const metrics = {
      // HTTP Metrics
      httpRequests: new promClient.Counter({
        name: 'event_agent_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
        registers: [register]
      }),
      requestDuration: new promClient.Histogram({
        name: 'event_agent_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'endpoint'],
        buckets: config.shared.metrics.histogramBuckets,
        registers: [register]
      }),
      
      // Event Processing Metrics
      eventsReceived: new promClient.Counter({
        name: 'event_agent_events_received_total',
        help: 'Total number of events received',
        labelNames: ['type', 'source'],
        registers: [register]
      }),
      eventsProcessed: new promClient.Counter({
        name: 'event_agent_events_processed_total',
        help: 'Total number of events processed successfully',
        labelNames: ['type'],
        registers: [register]
      }),
      eventProcessingErrors: new promClient.Counter({
        name: 'event_agent_event_processing_errors_total',
        help: 'Total number of event processing errors',
        labelNames: ['type', 'error_type'],
        registers: [register]
      }),
      eventProcessingDuration: new promClient.Histogram({
        name: 'event_agent_event_processing_duration_seconds',
        help: 'Duration of event processing in seconds',
        labelNames: ['type'],
        buckets: config.shared.metrics.histogramBuckets,
        registers: [register]
      }),
      duplicateEvents: new promClient.Counter({
        name: 'event_agent_duplicate_events_total',
        help: 'Total number of duplicate events detected',
        labelNames: ['type'],
        registers: [register]
      }),
      invalidEvents: new promClient.Counter({
        name: 'event_agent_invalid_events_total',
        help: 'Total number of invalid events',
        labelNames: ['type', 'validation_error'],
        registers: [register]
      }),
      
      // SQS Metrics
      sqsMessagesReceived: new promClient.Counter({
        name: 'event_agent_sqs_messages_received_total',
        help: 'Total number of SQS messages received',
        labelNames: ['queue'],
        registers: [register]
      }),
      sqsMessagesSent: new promClient.Counter({
        name: 'event_agent_sqs_messages_sent_total',
        help: 'Total number of SQS messages sent',
        labelNames: ['queue'],
        registers: [register]
      }),
      sqsErrors: new promClient.Counter({
        name: 'event_agent_sqs_errors_total',
        help: 'Total number of SQS errors',
        labelNames: ['operation', 'error_type'],
        registers: [register]
      }),
      
      // Coordination Metrics
      planningRequests: new promClient.Counter({
        name: 'event_agent_planning_requests_total',
        help: 'Total number of planning requests sent',
        labelNames: ['event_type'],
        registers: [register]
      }),
      planningResponses: new promClient.Counter({
        name: 'event_agent_planning_responses_total',
        help: 'Total number of planning responses received',
        labelNames: ['status'],
        registers: [register]
      }),
      coordinationErrors: new promClient.Counter({
        name: 'event_agent_coordination_errors_total',
        help: 'Total number of coordination errors',
        labelNames: ['target_agent'],
        registers: [register]
      }),
      
      // State Management Metrics
      stateUpdates: new promClient.Counter({
        name: 'event_agent_state_updates_total',
        help: 'Total number of state updates',
        labelNames: ['event_id'],
        registers: [register]
      }),
      stateErrors: new promClient.Counter({
        name: 'event_agent_state_errors_total',
        help: 'Total number of state management errors',
        registers: [register]
      }),
      
      // Retry Metrics
      retryAttempts: new promClient.Counter({
        name: 'event_agent_retry_attempts_total',
        help: 'Total number of retry attempts',
        labelNames: ['operation', 'attempt'],
        registers: [register]
      }),
      retrySuccesses: new promClient.Counter({
        name: 'event_agent_retry_successes_total',
        help: 'Total number of successful retries',
        labelNames: ['operation'],
        registers: [register]
      }),
      retryFailures: new promClient.Counter({
        name: 'event_agent_retry_failures_total',
        help: 'Total number of failed retries',
        labelNames: ['operation'],
        registers: [register]
      }),
      
      // Performance Metrics
      activeEvents: new promClient.Gauge({
        name: 'event_agent_active_events',
        help: 'Number of currently active events',
        registers: [register]
      }),
      queueDepth: new promClient.Gauge({
        name: 'event_agent_queue_depth',
        help: 'Current depth of event processing queue',
        registers: [register]
      }),
      memoryUsage: new promClient.Gauge({
        name: 'event_agent_memory_usage_bytes',
        help: 'Current memory usage in bytes',
        registers: [register]
      })
    };
    
    // Registrar métricas padrão do Node.js
    promClient.collectDefaultMetrics({ register });
    
    return { ...metrics, register };
  }
  
  /**
   * Configurar middleware do Express
   */
  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: config.security.corsOrigins,
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 1000, // máximo 1000 requests por janela
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Logging de requests
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });
      next();
    });
  }
  
  /**
   * Configurar rotas do Express
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      const health = {
        status: this.isRunning ? 'healthy' : 'unhealthy',
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sqsConnected: this.sqsService?.isConnected() || false,
        processingEvents: this.processingEvents.size
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Métricas
    this.app.get('/metrics', (req, res) => {
      res.json({
        agent: this.agentId,
        metrics: this.metrics,
        processingEvents: this.processingEvents.size,
        timestamp: new Date().toISOString()
      });
    });
    
    // Endpoint para receber eventos diretamente (fallback)
    this.app.post('/events', async (req, res) => {
      try {
        const event = req.body;
        const result = await this.processEvent(event);
        
        res.json({
          success: true,
          eventId: result.eventId,
          status: result.status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error processing direct event', error, { event: req.body });
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Status de evento específico
    this.app.get('/events/:eventId/status', (req, res) => {
      const { eventId } = req.params;
      const event = this.processingEvents.get(eventId);
      
      if (!event) {
        return res.status(404).json({
          error: 'Event not found',
          eventId
        });
      }
      
      res.json({
        eventId,
        status: event.status,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        retryCount: event.retryCount,
        lastError: event.lastError
      });
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
    
    // Error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('Express error', error, {
        url: req.url,
        method: req.method,
        body: req.body
      });
      
      res.status(500).json({
        error: 'Internal server error',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
  }
  
  /**
   * Processar evento recebido
   */
  async processEvent(eventData) {
    const startTime = Date.now();
    const eventId = eventData.eventId || this.generateEventId();
    
    this.logger.info('Processing event', { eventId, type: eventData.type });
    this.metrics.eventsReceived++;
    
    // Registrar evento em processamento
    this.processingEvents.set(eventId, {
      eventId,
      status: 'processing',
      type: eventData.type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null
    });
    
    try {
      // Validar evento
      const validationResult = await this.validateEvent(eventData);
      if (!validationResult.valid) {
        throw new Error(`Event validation failed: ${validationResult.errors.join(', ')}`);
      }
      
      // Processar baseado no tipo
      let result;
      switch (eventData.type) {
        case 'user_request':
          result = await this.processUserRequest(eventData);
          break;
        case 'system_event':
          result = await this.processSystemEvent(eventData);
          break;
        case 'agent_communication':
          result = await this.processAgentCommunication(eventData);
          break;
        default:
          throw new Error(`Unknown event type: ${eventData.type}`);
      }
      
      // Atualizar status
      this.processingEvents.set(eventId, {
        ...this.processingEvents.get(eventId),
        status: 'completed',
        updatedAt: new Date().toISOString(),
        result
      });
      
      // Atualizar métricas
      this.metrics.eventsProcessed++;
      this.metrics.lastProcessedAt = new Date().toISOString();
      
      const processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(processingTime);
      
      this.logger.info('Event processed successfully', {
        eventId,
        type: eventData.type,
        processingTime
      });
      
      // Remover da lista de processamento após um tempo
      setTimeout(() => {
        this.processingEvents.delete(eventId);
      }, 300000); // 5 minutos
      
      return {
        eventId,
        status: 'completed',
        result,
        processingTime
      };
      
    } catch (error) {
      this.logger.error('Error processing event', error, { eventId, eventData });
      
      // Atualizar status de erro
      const eventState = this.processingEvents.get(eventId);
      this.processingEvents.set(eventId, {
        ...eventState,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        lastError: error.message
      });
      
      this.metrics.eventsFailed++;
      
      // Implementar retry se aplicável
      if (this.shouldRetry(eventData, error)) {
        await this.scheduleRetry(eventId, eventData, error);
      }
      
      throw error;
    }
  }
  
  /**
   * Validar estrutura do evento
   */
  async validateEvent(eventData) {
    const errors = [];
    
    // Validações básicas
    if (!eventData.type) {
      errors.push('Event type is required');
    }
    
    if (!eventData.timestamp) {
      errors.push('Event timestamp is required');
    }
    
    if (!eventData.source) {
      errors.push('Event source is required');
    }
    
    // Validações específicas por tipo
    switch (eventData.type) {
      case 'user_request':
        if (!eventData.payload?.request) {
          errors.push('User request payload is required');
        }
        break;
      case 'system_event':
        if (!eventData.payload?.event) {
          errors.push('System event payload is required');
        }
        break;
      case 'agent_communication':
        if (!eventData.payload?.message) {
          errors.push('Agent communication message is required');
        }
        break;
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Processar requisição de usuário
   */
  async processUserRequest(eventData) {
    const { payload } = eventData;
    
    this.logger.info('Processing user request', {
      eventId: eventData.eventId,
      request: payload.request
    });
    
    // Enviar para Planning Agent para análise
    const planningMessage = {
      type: 'analyze_request',
      eventId: eventData.eventId,
      request: payload.request,
      context: payload.context || {},
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage(
      config.aws.sqs.queues.core.planning,
      planningMessage
    );
    
    return {
      action: 'forwarded_to_planning',
      planningMessageId: planningMessage.eventId
    };
  }
  
  /**
   * Processar evento de sistema
   */
  async processSystemEvent(eventData) {
    const { payload } = eventData;
    
    this.logger.info('Processing system event', {
      eventId: eventData.eventId,
      event: payload.event
    });
    
    // Lógica específica para eventos de sistema
    switch (payload.event) {
      case 'agent_health_check':
        return await this.handleHealthCheckEvent(payload);
      case 'system_alert':
        return await this.handleSystemAlert(payload);
      case 'configuration_change':
        return await this.handleConfigurationChange(payload);
      default:
        this.logger.warn('Unknown system event', { event: payload.event });
        return { action: 'ignored', reason: 'unknown_event_type' };
    }
  }
  
  /**
   * Processar comunicação entre agentes
   */
  async processAgentCommunication(eventData) {
    const { payload } = eventData;
    
    this.logger.info('Processing agent communication', {
      eventId: eventData.eventId,
      fromAgent: payload.fromAgent,
      toAgent: payload.toAgent
    });
    
    // Rotear mensagem para o agente de destino
    if (payload.toAgent && config.aws.sqs.queues.core[payload.toAgent]) {
      await this.sqsService.sendMessage(
        config.aws.sqs.queues.core[payload.toAgent],
        {
          type: 'agent_message',
          fromAgent: payload.fromAgent,
          message: payload.message,
          timestamp: new Date().toISOString(),
          originalEventId: eventData.eventId
        }
      );
      
      return {
        action: 'message_routed',
        targetAgent: payload.toAgent
      };
    } else {
      throw new Error(`Unknown target agent: ${payload.toAgent}`);
    }
  }
  
  /**
   * Lidar com evento de health check
   */
  async handleHealthCheckEvent(payload) {
    // Implementar lógica de health check
    return {
      action: 'health_check_processed',
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Lidar com alerta de sistema
   */
  async handleSystemAlert(payload) {
    this.logger.warn('System alert received', payload);
    
    // Implementar lógica de alertas
    return {
      action: 'alert_processed',
      severity: payload.severity,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Lidar com mudança de configuração
   */
  async handleConfigurationChange(payload) {
    this.logger.info('Configuration change received', payload);
    
    // Implementar lógica de mudança de configuração
    return {
      action: 'configuration_updated',
      changes: payload.changes,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Verificar se deve fazer retry
   */
  shouldRetry(eventData, error) {
    const maxRetries = 3;
    const retryCount = eventData.retryCount || 0;
    
    // Não fazer retry para erros de validação
    if (error.message.includes('validation failed')) {
      return false;
    }
    
    return retryCount < maxRetries;
  }
  
  /**
   * Agendar retry
   */
  async scheduleRetry(eventId, eventData, error) {
    const retryCount = (eventData.retryCount || 0) + 1;
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
    
    this.logger.info('Scheduling retry', {
      eventId,
      retryCount,
      delay
    });
    
    this.metrics.eventsRetried++;
    
    setTimeout(async () => {
      try {
        const retryEventData = {
          ...eventData,
          retryCount,
          originalError: error.message
        };
        
        await this.processEvent(retryEventData);
      } catch (retryError) {
        this.logger.error('Retry failed', retryError, {
          eventId,
          retryCount
        });
      }
    }, delay);
  }
  
  /**
   * Gerar ID único para evento
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Atualizar tempo médio de processamento
   */
  updateAverageProcessingTime(newTime) {
    if (this.metrics.averageProcessingTime === 0) {
      this.metrics.averageProcessingTime = newTime;
    } else {
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime + newTime) / 2;
    }
  }
  
  /**
   * Inicializar serviço SQS
   */
  async initializeSQS() {
    try {
      this.sqsService = new SQSService(this.logger);
      await this.sqsService.initialize();
      
      // Começar a escutar mensagens
      await this.sqsService.startPolling(
        config.aws.sqs.queues.core.event,
        this.handleSQSMessage.bind(this)
      );
      
      this.logger.info('SQS service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SQS service', error);
      throw error;
    }
  }
  
  /**
   * Lidar com mensagem SQS
   */
  async handleSQSMessage(message) {
    try {
      const eventData = JSON.parse(message.Body);
      await this.processEvent(eventData);
      
      // Deletar mensagem da fila após processamento bem-sucedido
      await this.sqsService.deleteMessage(
        config.aws.sqs.queues.core.event,
        message.ReceiptHandle
      );
      
    } catch (error) {
      this.logger.error('Error handling SQS message', error, {
        messageId: message.MessageId,
        body: message.Body
      });
      
      // Mensagem será reprocessada ou enviada para DLQ automaticamente
      throw error;
    }
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      this.logger.info('Starting Event Agent...');
      
      // Inicializar EventService
      this.eventService = new EventService(this.logger, this.sqsService, this.metrics);
      
      // Inicializar SQS
      await this.initializeSQS();
      
      // Iniciar servidor HTTP
      const port = config.agents.event.port || 3002;
      this.server = this.app.listen(port, () => {
        this.isRunning = true;
        this.logger.info(`Event Agent started on port ${port}`);
      });
      
      // Configurar health check
      this.setupHealthCheck();
      
    } catch (error) {
      this.logger.error('Failed to start Event Agent', error);
      throw error;
    }
  }
  
  /**
   * Parar o agente
   */
  async stop() {
    try {
      this.logger.info('Stopping Event Agent...');
      this.isRunning = false;
      
      // Parar polling SQS
      if (this.sqsService) {
        await this.sqsService.stopPolling();
        await this.sqsService.close();
      }
      
      // Fechar servidor HTTP
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      this.logger.info('Event Agent stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Event Agent', error);
      throw error;
    }
  }
  
  /**
   * Configurar health check periódico
   */
  setupHealthCheck() {
    setInterval(() => {
      if (this.isRunning) {
        this.logger.debug('Health check', {
          status: 'healthy',
          metrics: this.metrics,
          processingEvents: this.eventService ? this.eventService.processingEvents.size : 0
        });
      }
    }, config.agents.healthCheckInterval);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const agent = new EventAgent();
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  // Iniciar agente
  agent.start().catch((error) => {
    console.error('Failed to start Event Agent:', error);
    process.exit(1);
  });
}

module.exports = EventAgent;