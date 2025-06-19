/**
 * Event Gateway Service
 * Serviço principal para processamento de eventos externos
 */

const AWS = require('aws-sdk');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const Redis = require('ioredis');

class EventGatewayService {
  constructor(config, logger, metrics) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.sqs = null;
    this.redis = null;
    this.isRunning = false;
    this.startTime = new Date();
    
    // Estatísticas
    this.stats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      eventsRejected: 0,
      validationErrors: 0,
      sqsPublishErrors: 0,
      lastEventTime: null,
      averageProcessingTime: 0,
      processingTimes: []
    };

    this.initializeSchemas();
  }

  /**
   * Inicializa schemas de validação
   */
  initializeSchemas() {
    // Schema base para eventos
    this.eventSchema = Joi.object({
      eventType: Joi.string().valid(...this.config.validation.allowedEventTypes).required(),
      timestamp: Joi.alternatives().try(
        Joi.date(),
        Joi.string().isoDate(),
        Joi.number().integer().min(0)
      ).required(),
      source: Joi.string().min(1).max(255).required(),
      eventId: Joi.string().uuid().optional(),
      userId: Joi.string().max(255).optional(),
      sessionId: Joi.string().max(255).optional(),
      organizationId: Joi.string().max(255).optional(),
      applicationId: Joi.string().max(255).optional(),
      data: Joi.object().optional(),
      metadata: Joi.object().optional(),
      tags: Joi.array().items(Joi.string()).optional(),
      priority: Joi.string().valid('low', 'normal', 'high', 'critical').default('normal'),
      version: Joi.string().default('1.0')
    });

    // Schema para batch de eventos
    this.batchEventSchema = Joi.object({
      events: Joi.array().items(this.eventSchema).min(1).max(100).required(),
      batchId: Joi.string().uuid().optional(),
      metadata: Joi.object().optional()
    });
  }

  /**
   * Inicia o serviço
   */
  async start() {
    try {
      this.logger.info('Iniciando Event Gateway Service...');

      // Inicializa SQS
      await this.initializeSQS();

      // Inicializa Redis se habilitado
      if (this.config.redis.enabled) {
        await this.initializeRedis();
      }

      this.isRunning = true;
      this.logger.info('Event Gateway Service iniciado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao iniciar Event Gateway Service:', error);
      throw error;
    }
  }

  /**
   * Inicializa conexão com SQS
   */
  async initializeSQS() {
    const sqsConfig = {
      region: this.config.sqs.region,
      apiVersion: '2012-11-05'
    };

    if (this.config.sqs.accessKeyId && this.config.sqs.secretAccessKey) {
      sqsConfig.accessKeyId = this.config.sqs.accessKeyId;
      sqsConfig.secretAccessKey = this.config.sqs.secretAccessKey;
    }

    if (this.config.sqs.endpoint) {
      sqsConfig.endpoint = this.config.sqs.endpoint;
    }

    this.sqs = new AWS.SQS(sqsConfig);

    // Testa conexão
    try {
      await this.sqs.listQueues().promise();
      this.logger.info('Conexão com SQS estabelecida');
    } catch (error) {
      this.logger.error('Erro ao conectar com SQS:', error);
      throw error;
    }
  }

  /**
   * Inicializa conexão com Redis
   */
  async initializeRedis() {
    try {
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        keyPrefix: this.config.redis.keyPrefix,
        retryDelayOnFailover: this.config.redis.retryDelayOnFailover,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
        lazyConnect: true
      });

      await this.redis.connect();
      this.logger.info('Conexão com Redis estabelecida');
    } catch (error) {
      this.logger.error('Erro ao conectar com Redis:', error);
      throw error;
    }
  }

  /**
   * Processa um único evento
   */
  async processEvent(eventData, clientInfo = {}) {
    const startTime = Date.now();
    
    try {
      this.stats.eventsReceived++;
      
      // Valida evento
      const validatedEvent = await this.validateEvent(eventData);
      
      // Transforma evento
      const transformedEvent = await this.transformEvent(validatedEvent, clientInfo);
      
      // Publica nas filas SQS
      await this.publishToQueues(transformedEvent);
      
      // Atualiza estatísticas
      this.stats.eventsProcessed++;
      this.stats.lastEventTime = new Date();
      this.updateProcessingTime(Date.now() - startTime);
      
      // Métricas
      if (this.metrics) {
        this.metrics.eventsProcessedTotal.inc({
          event_type: transformedEvent.eventType,
          status: 'success'
        });
      }
      
      this.logger.debug('Evento processado com sucesso', {
        eventId: transformedEvent.eventId,
        eventType: transformedEvent.eventType,
        processingTime: Date.now() - startTime
      });
      
      return {
        success: true,
        eventId: transformedEvent.eventId,
        timestamp: transformedEvent.timestamp,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      this.stats.eventsRejected++;
      
      if (error.isValidationError) {
        this.stats.validationErrors++;
        
        if (this.metrics) {
          this.metrics.eventsValidationErrors.inc({
            error_type: error.type || 'unknown'
          });
        }
      }
      
      if (this.metrics) {
        this.metrics.eventsProcessedTotal.inc({
          event_type: eventData.eventType || 'unknown',
          status: 'error'
        });
      }
      
      this.logger.error('Erro ao processar evento:', error, {
        eventData: this.config.development.logRequestBodies ? eventData : '[hidden]'
      });
      
      throw error;
    }
  }

  /**
   * Processa batch de eventos
   */
  async processBatchEvents(batchData, clientInfo = {}) {
    const startTime = Date.now();
    
    try {
      // Valida batch
      const { error, value } = this.batchEventSchema.validate(batchData);
      if (error) {
        const validationError = new Error(`Erro de validação do batch: ${error.details[0].message}`);
        validationError.isValidationError = true;
        validationError.type = 'batch_validation';
        throw validationError;
      }
      
      const results = [];
      const errors = [];
      
      // Processa cada evento do batch
      for (let i = 0; i < value.events.length; i++) {
        try {
          const result = await this.processEvent(value.events[i], clientInfo);
          results.push({ index: i, ...result });
        } catch (error) {
          errors.push({ index: i, error: error.message });
        }
      }
      
      this.logger.info('Batch processado', {
        batchId: value.batchId,
        totalEvents: value.events.length,
        successful: results.length,
        failed: errors.length,
        processingTime: Date.now() - startTime
      });
      
      return {
        success: true,
        batchId: value.batchId || uuidv4(),
        totalEvents: value.events.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      this.logger.error('Erro ao processar batch:', error);
      throw error;
    }
  }

  /**
   * Valida evento
   */
  async validateEvent(eventData) {
    // Validação de schema
    const { error, value } = this.eventSchema.validate(eventData, {
      stripUnknown: true,
      abortEarly: false
    });
    
    if (error) {
      const validationError = new Error(`Erro de validação: ${error.details[0].message}`);
      validationError.isValidationError = true;
      validationError.type = 'schema_validation';
      validationError.details = error.details;
      throw validationError;
    }
    
    // Validação de tamanho
    const eventSize = JSON.stringify(value).length;
    if (eventSize > this.config.validation.maxEventSize) {
      const sizeError = new Error(`Evento muito grande: ${eventSize} bytes (máximo: ${this.config.validation.maxEventSize})`);
      sizeError.isValidationError = true;
      sizeError.type = 'size_validation';
      throw sizeError;
    }
    
    // Validação de timestamp
    if (this.config.validation.timestampTolerance > 0) {
      const eventTime = moment(value.timestamp);
      const now = moment();
      const diff = Math.abs(now.diff(eventTime));
      
      if (diff > this.config.validation.timestampTolerance) {
        const timestampError = new Error(`Timestamp fora da tolerância: ${diff}ms (máximo: ${this.config.validation.timestampTolerance}ms)`);
        timestampError.isValidationError = true;
        timestampError.type = 'timestamp_validation';
        throw timestampError;
      }
    }
    
    return value;
  }

  /**
   * Transforma evento para formato interno
   */
  async transformEvent(eventData, clientInfo = {}) {
    const transformedEvent = { ...eventData };
    
    if (this.config.transformation.enableTransformation) {
      // Gera ID se não fornecido
      if (this.config.transformation.generateEventIds && !transformedEvent.eventId) {
        transformedEvent.eventId = uuidv4();
      }
      
      // Normaliza timestamp
      if (this.config.transformation.normalizeTimestamps) {
        transformedEvent.timestamp = moment(transformedEvent.timestamp).toISOString();
      }
      
      // Adiciona metadados do gateway
      if (this.config.transformation.addGatewayMetadata) {
        transformedEvent.gateway = {
          receivedAt: new Date().toISOString(),
          version: '1.0.0',
          source: 'external-event-api-gateway'
        };
      }
      
      // Enriquece com informações do cliente
      if (this.config.transformation.enrichWithClientInfo && Object.keys(clientInfo).length > 0) {
        transformedEvent.client = {
          ip: clientInfo.ip,
          userAgent: clientInfo.userAgent,
          apiKey: clientInfo.apiKey ? clientInfo.apiKey.substring(0, 8) + '...' : undefined
        };
      }
    }
    
    return transformedEvent;
  }

  /**
   * Publica evento nas filas SQS
   */
  async publishToQueues(event) {
    const promises = [];
    
    // Fila de eventos brutos
    if (this.config.sqs.outputQueues.rawEvents.enabled) {
      promises.push(this.publishToQueue(
        this.config.sqs.outputQueues.rawEvents.url,
        event,
        'raw-events'
      ));
    }
    
    // Fila de eventos de entrada
    if (this.config.sqs.outputQueues.incomingEvents.enabled) {
      promises.push(this.publishToQueue(
        this.config.sqs.outputQueues.incomingEvents.url,
        event,
        'incoming-events'
      ));
    }
    
    try {
      await Promise.all(promises);
    } catch (error) {
      this.stats.sqsPublishErrors++;
      throw error;
    }
  }

  /**
   * Publica mensagem em uma fila SQS específica
   */
  async publishToQueue(queueUrl, message, queueName) {
    try {
      const params = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        DelaySeconds: this.config.sqs.sendMessage.delaySeconds
      };
      
      const result = await this.sqs.sendMessage(params).promise();
      
      if (this.metrics) {
        this.metrics.sqsMessagesPublished.inc({
          queue_name: queueName,
          status: 'success'
        });
      }
      
      this.logger.debug('Mensagem publicada no SQS', {
        queueName,
        messageId: result.MessageId,
        eventId: message.eventId
      });
      
      return result;
    } catch (error) {
      if (this.metrics) {
        this.metrics.sqsMessagesPublished.inc({
          queue_name: queueName,
          status: 'error'
        });
      }
      
      this.logger.error('Erro ao publicar no SQS:', error, {
        queueName,
        queueUrl
      });
      
      throw error;
    }
  }

  /**
   * Atualiza tempo médio de processamento
   */
  updateProcessingTime(processingTime) {
    this.stats.processingTimes.push(processingTime);
    
    // Mantém apenas os últimos 1000 tempos
    if (this.stats.processingTimes.length > 1000) {
      this.stats.processingTimes = this.stats.processingTimes.slice(-1000);
    }
    
    // Calcula média
    this.stats.averageProcessingTime = this.stats.processingTimes.reduce((a, b) => a + b, 0) / this.stats.processingTimes.length;
  }

  /**
   * Verifica saúde do serviço
   */
  async checkHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      dependencies: {}
    };
    
    // Verifica SQS
    if (this.config.healthCheck.dependencies.sqs) {
      try {
        await this.sqs.listQueues().promise();
        health.dependencies.sqs = { status: 'healthy' };
      } catch (error) {
        health.dependencies.sqs = { status: 'unhealthy', error: error.message };
        health.status = 'unhealthy';
      }
    }
    
    // Verifica Redis
    if (this.config.healthCheck.dependencies.redis && this.redis) {
      try {
        await this.redis.ping();
        health.dependencies.redis = { status: 'healthy' };
      } catch (error) {
        health.dependencies.redis = { status: 'unhealthy', error: error.message };
        health.status = 'unhealthy';
      }
    }
    
    return health;
  }

  /**
   * Retorna estatísticas do serviço
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime.getTime(),
      isRunning: this.isRunning
    };
  }

  /**
   * Retorna status do serviço
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: Date.now() - this.startTime.getTime(),
      stats: this.getStats()
    };
  }

  /**
   * Para o serviço
   */
  async stop() {
    try {
      this.logger.info('Parando Event Gateway Service...');
      
      this.isRunning = false;
      
      if (this.redis) {
        await this.redis.quit();
      }
      
      this.logger.info('Event Gateway Service parado');
    } catch (error) {
      this.logger.error('Erro ao parar Event Gateway Service:', error);
      throw error;
    }
  }
}

module.exports = EventGatewayService;