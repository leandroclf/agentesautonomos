const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const config = require('../../../../config');

class EventService extends EventEmitter {
  constructor(sqsService, logger, metrics) {
    super();
    this.sqsService = sqsService;
    this.logger = logger;
    this.metrics = metrics;
    
    // Estado interno
    this.processingEvents = new Map();
    this.eventHistory = new Map();
    this.duplicateTracker = new Set();
    this.isPolling = false;
    this.pollingInterval = null;
    this.retryQueue = new Map();
    this.coordinationClients = new Map();
    
    // Configurações
    this.config = {
      polling: {
        enabled: true,
        interval: 5000,
        batchSize: 10,
        visibilityTimeout: 300
      },
      processing: {
        maxConcurrent: 50,
        timeout: config.agents.event.eventTimeout || 30000,
        retryAttempts: config.agents.event.retryAttempts || 3,
        retryDelay: config.agents.event.retryDelay || 1000
      },
      validation: {
        maxEventSize: 1048576, // 1MB
        requiredFields: ['id', 'type', 'data'],
        allowedTypes: [
          'user_action', 'system_event', 'data_update', 'notification',
          'workflow_trigger', 'integration_event', 'monitoring_alert'
        ]
      },
      coordination: {
        planningAgentUrl: 'http://localhost:3004',
        executionAgentUrl: 'http://localhost:3005',
        timeout: 10000
      },
      cleanup: {
        historyRetention: 86400000, // 24 hours
        cleanupInterval: 3600000 // 1 hour
      }
    };
    
    // Inicializar clientes de coordenação
    this.setupCoordinationClients();
  }
  
  async initialize() {
    try {
      this.logger.info('Initializing Event Service');
      
      // Configurar cleanup automático
      this.setupAutomaticCleanup();
      
      // Iniciar polling se habilitado
      if (this.config.polling.enabled) {
        await this.startPolling();
      }
      
      this.logger.info('Event Service initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Event Service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  setupCoordinationClients() {
    const axios = require('axios');
    
    // Cliente para Planning Agent
    this.coordinationClients.set('planning', axios.create({
      baseURL: this.config.coordination.planningAgentUrl,
      timeout: this.config.coordination.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'event-agent/1.0.0'
      }
    }));
    
    // Cliente para Execution Agent
    this.coordinationClients.set('execution', axios.create({
      baseURL: this.config.coordination.executionAgentUrl,
      timeout: this.config.coordination.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'event-agent/1.0.0'
      }
    }));
  }
  
  async startPolling() {
    if (this.isPolling) {
      this.logger.warn('Polling already started');
      return;
    }
    
    this.isPolling = true;
    this.logger.info('Starting SQS polling', {
      interval: this.config.polling.interval,
      batchSize: this.config.polling.batchSize
    });
    
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollEvents();
      } catch (error) {
        this.logger.error('Error during polling', {
          error: error.message
        });
        this.metrics.sqsErrors.inc({
          operation: 'polling',
          error_type: error.name || 'unknown'
        });
      }
    }, this.config.polling.interval);
  }
  
  async stopPolling() {
    if (!this.isPolling) {
      this.logger.warn('Polling not started');
      return;
    }
    
    this.isPolling = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.logger.info('SQS polling stopped');
  }
  
  async pollEvents() {
    try {
      const queueUrl = config.shared.sqs.queues.events;
      
      const messages = await this.sqsService.receiveMessages(queueUrl, {
        MaxNumberOfMessages: this.config.polling.batchSize,
        VisibilityTimeout: this.config.polling.visibilityTimeout,
        WaitTimeSeconds: 20 // Long polling
      });
      
      if (messages && messages.length > 0) {
        this.logger.debug(`Received ${messages.length} messages from SQS`);
        
        this.metrics.sqsMessagesReceived.inc(
          { queue: 'events' },
          messages.length
        );
        
        // Processar mensagens em paralelo (limitado)
        const processingPromises = messages.map(message => 
          this.processMessage(message, queueUrl)
        );
        
        await Promise.allSettled(processingPromises);
      }
      
    } catch (error) {
      this.logger.error('Failed to poll events', {
        error: error.message,
        stack: error.stack
      });
      
      this.metrics.sqsErrors.inc({
        operation: 'receive',
        error_type: error.name || 'unknown'
      });
    }
  }
  
  async processMessage(message, queueUrl) {
    const startTime = Date.now();
    let event = null;
    
    try {
      // Parse da mensagem
      event = JSON.parse(message.Body);
      
      this.logger.debug('Processing event', {
        eventId: event.id,
        eventType: event.type,
        messageId: message.MessageId
      });
      
      this.metrics.eventsReceived.inc({
        type: event.type || 'unknown',
        source: event.source || 'sqs'
      });
      
      // Validar evento
      const validationResult = this.validateEvent(event);
      if (!validationResult.isValid) {
        throw new Error(`Event validation failed: ${validationResult.errors.join(', ')}`);
      }
      
      // Verificar duplicatas
      if (this.isDuplicateEvent(event)) {
        this.logger.warn('Duplicate event detected', { eventId: event.id });
        this.metrics.duplicateEvents.inc({ type: event.type });
        
        // Remover mensagem da fila mesmo sendo duplicata
        await this.sqsService.deleteMessage(queueUrl, message.ReceiptHandle);
        return;
      }
      
      // Adicionar ao rastreamento de duplicatas
      this.duplicateTracker.add(event.id);
      
      // Adicionar ao estado de processamento
      this.processingEvents.set(event.id, {
        event,
        status: 'processing',
        startedAt: new Date(),
        attempts: 1,
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle
      });
      
      this.metrics.activeEvents.inc();
      
      // Processar evento
      await this.processEvent(event);
      
      // Marcar como processado com sucesso
      await this.markEventProcessed(event.id, queueUrl, message.ReceiptHandle);
      
      const duration = Date.now() - startTime;
      this.metrics.eventProcessingDuration.observe(
        { type: event.type },
        duration / 1000
      );
      
      this.metrics.eventsProcessed.inc({ type: event.type });
      
      this.logger.info('Event processed successfully', {
        eventId: event.id,
        eventType: event.type,
        duration
      });
      
    } catch (error) {
      this.logger.error('Failed to process message', {
        error: error.message,
        eventId: event?.id,
        eventType: event?.type,
        messageId: message.MessageId
      });
      
      this.metrics.eventProcessingErrors.inc({
        type: event?.type || 'unknown',
        error_type: error.name || 'unknown'
      });
      
      // Tentar novamente ou mover para DLQ
      await this.handleProcessingError(event, message, queueUrl, error);
    }
  }
  
  validateEvent(event) {
    const errors = [];
    
    // Verificar campos obrigatórios
    for (const field of this.config.validation.requiredFields) {
      if (!event[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Verificar tipo permitido
    if (event.type && !this.config.validation.allowedTypes.includes(event.type)) {
      errors.push(`Invalid event type: ${event.type}`);
    }
    
    // Verificar tamanho
    const eventSize = JSON.stringify(event).length;
    if (eventSize > this.config.validation.maxEventSize) {
      errors.push(`Event size exceeds limit: ${eventSize} > ${this.config.validation.maxEventSize}`);
    }
    
    // Verificar formato do ID
    if (event.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.id)) {
      errors.push('Invalid event ID format (must be UUID)');
    }
    
    // Verificar timestamp
    if (event.timestamp && isNaN(new Date(event.timestamp).getTime())) {
      errors.push('Invalid timestamp format');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  isDuplicateEvent(event) {
    return this.duplicateTracker.has(event.id) || this.eventHistory.has(event.id);
  }
  
  async processEvent(event) {
    try {
      // Determinar ações baseadas no tipo de evento
      const actions = this.determineEventActions(event);
      
      // Executar ações em sequência
      for (const action of actions) {
        await this.executeAction(action, event);
      }
      
      // Adicionar ao histórico
      this.eventHistory.set(event.id, {
        event,
        processedAt: new Date(),
        actions: actions.map(a => a.type)
      });
      
    } catch (error) {
      this.logger.error('Failed to process event', {
        eventId: event.id,
        error: error.message
      });
      throw error;
    }
  }
  
  determineEventActions(event) {
    const actions = [];
    
    // Ações baseadas no tipo de evento
    switch (event.type) {
      case 'user_action':
      case 'workflow_trigger':
        actions.push({
          type: 'request_planning',
          priority: 'high',
          data: event
        });
        break;
        
      case 'system_event':
      case 'monitoring_alert':
        actions.push({
          type: 'notify_status',
          priority: 'medium',
          data: event
        });
        break;
        
      case 'data_update':
        actions.push({
          type: 'update_state',
          priority: 'low',
          data: event
        });
        break;
        
      case 'integration_event':
        actions.push({
          type: 'coordinate_integration',
          priority: 'medium',
          data: event
        });
        break;
        
      default:
        actions.push({
          type: 'log_event',
          priority: 'low',
          data: event
        });
    }
    
    // Adicionar ação de notificação se especificado
    if (event.notify) {
      actions.push({
        type: 'send_notification',
        priority: 'medium',
        data: event
      });
    }
    
    return actions.sort((a, b) => {
      const priorities = { high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });
  }
  
  async executeAction(action, event) {
    try {
      this.logger.debug('Executing action', {
        actionType: action.type,
        eventId: event.id,
        priority: action.priority
      });
      
      switch (action.type) {
        case 'request_planning':
          await this.requestPlanning(event);
          break;
          
        case 'notify_status':
          await this.notifyStatus(event);
          break;
          
        case 'update_state':
          await this.updateState(event);
          break;
          
        case 'coordinate_integration':
          await this.coordinateIntegration(event);
          break;
          
        case 'send_notification':
          await this.sendNotification(event);
          break;
          
        case 'log_event':
          this.logger.info('Event logged', {
            eventId: event.id,
            eventType: event.type,
            data: event.data
          });
          break;
          
        default:
          this.logger.warn('Unknown action type', {
            actionType: action.type,
            eventId: event.id
          });
      }
      
    } catch (error) {
      this.logger.error('Failed to execute action', {
        actionType: action.type,
        eventId: event.id,
        error: error.message
      });
      throw error;
    }
  }
  
  async requestPlanning(event) {
    try {
      const planningClient = this.coordinationClients.get('planning');
      
      const planningRequest = {
        eventId: event.id,
        eventType: event.type,
        data: event.data,
        priority: event.priority || 'medium',
        requestedAt: new Date().toISOString(),
        requester: 'event-agent'
      };
      
      this.logger.debug('Sending planning request', {
        eventId: event.id,
        planningAgentUrl: this.config.coordination.planningAgentUrl
      });
      
      const response = await planningClient.post('/analyze', planningRequest);
      
      this.metrics.planningRequests.inc({ event_type: event.type });
      this.metrics.planningResponses.inc({ status: 'success' });
      
      this.logger.info('Planning request successful', {
        eventId: event.id,
        planId: response.data.planId,
        complexity: response.data.complexity
      });
      
      // Emitir evento para notificar outros componentes
      this.emit('planning_requested', {
        eventId: event.id,
        planId: response.data.planId,
        response: response.data
      });
      
    } catch (error) {
      this.metrics.planningResponses.inc({ status: 'error' });
      this.metrics.coordinationErrors.inc({ target_agent: 'planning' });
      
      this.logger.error('Failed to request planning', {
        eventId: event.id,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      throw error;
    }
  }
  
  async notifyStatus(event) {
    // Implementar notificação de status via WebSocket ou SQS
    this.logger.info('Status notification sent', {
      eventId: event.id,
      eventType: event.type
    });
    
    this.emit('status_notification', {
      eventId: event.id,
      status: event.data.status,
      timestamp: new Date().toISOString()
    });
  }
  
  async updateState(event) {
    // Atualizar estado interno ou externo
    this.metrics.stateUpdates.inc({ event_id: event.id });
    
    this.logger.info('State updated', {
      eventId: event.id,
      updateType: event.data.updateType
    });
  }
  
  async coordinateIntegration(event) {
    // Coordenar com sistemas externos
    this.logger.info('Integration coordination initiated', {
      eventId: event.id,
      integration: event.data.integration
    });
  }
  
  async sendNotification(event) {
    // Enviar notificação
    this.logger.info('Notification sent', {
      eventId: event.id,
      recipients: event.notify.recipients,
      channel: event.notify.channel
    });
  }
  
  async markEventProcessed(eventId, queueUrl, receiptHandle) {
    try {
      // Remover da fila SQS
      await this.sqsService.deleteMessage(queueUrl, receiptHandle);
      
      // Atualizar estado interno
      const processingInfo = this.processingEvents.get(eventId);
      if (processingInfo) {
        processingInfo.status = 'completed';
        processingInfo.completedAt = new Date();
      }
      
      // Remover do estado de processamento ativo
      this.processingEvents.delete(eventId);
      this.metrics.activeEvents.dec();
      
      this.logger.debug('Event marked as processed', { eventId });
      
    } catch (error) {
      this.logger.error('Failed to mark event as processed', {
        eventId,
        error: error.message
      });
      throw error;
    }
  }
  
  async handleProcessingError(event, message, queueUrl, error) {
    const eventId = event?.id || 'unknown';
    const processingInfo = this.processingEvents.get(eventId);
    
    if (processingInfo) {
      processingInfo.attempts++;
      processingInfo.lastError = error.message;
      processingInfo.status = 'error';
    }
    
    // Verificar se deve tentar novamente
    const attempts = processingInfo?.attempts || 1;
    
    if (attempts < this.config.processing.retryAttempts) {
      this.logger.warn('Retrying event processing', {
        eventId,
        attempt: attempts + 1,
        maxAttempts: this.config.processing.retryAttempts
      });
      
      this.metrics.retryAttempts.inc({
        operation: 'event_processing',
        attempt: attempts.toString()
      });
      
      // Não deletar a mensagem, deixar voltar para a fila
      return;
    }
    
    // Máximo de tentativas atingido
    this.logger.error('Max retry attempts reached, moving to DLQ', {
      eventId,
      attempts,
      error: error.message
    });
    
    this.metrics.retryFailures.inc({ operation: 'event_processing' });
    
    // Remover da fila principal (será movido para DLQ automaticamente)
    try {
      await this.sqsService.deleteMessage(queueUrl, message.ReceiptHandle);
    } catch (deleteError) {
      this.logger.error('Failed to delete failed message', {
        eventId,
        error: deleteError.message
      });
    }
    
    // Limpar estado de processamento
    this.processingEvents.delete(eventId);
    this.metrics.activeEvents.dec();
  }
  
  setupAutomaticCleanup() {
    setInterval(() => {
      this.cleanupOldData();
    }, this.config.cleanup.cleanupInterval);
  }
  
  cleanupOldData() {
    const now = Date.now();
    const retention = this.config.cleanup.historyRetention;
    
    // Limpar histórico antigo
    let cleanedHistory = 0;
    for (const [eventId, info] of this.eventHistory.entries()) {
      if (now - info.processedAt.getTime() > retention) {
        this.eventHistory.delete(eventId);
        cleanedHistory++;
      }
    }
    
    // Limpar rastreamento de duplicatas antigo
    // (Implementação simplificada - em produção usar TTL)
    if (this.duplicateTracker.size > 10000) {
      this.duplicateTracker.clear();
    }
    
    if (cleanedHistory > 0) {
      this.logger.debug('Cleaned up old data', {
        cleanedHistory,
        currentHistorySize: this.eventHistory.size,
        duplicateTrackerSize: this.duplicateTracker.size
      });
    }
  }
  
  // Métodos para API HTTP
  
  async getEventStatus(req, res) {
    try {
      const { id } = req.params;
      
      // Verificar se está em processamento
      const processingInfo = this.processingEvents.get(id);
      if (processingInfo) {
        return res.json({
          eventId: id,
          status: processingInfo.status,
          startedAt: processingInfo.startedAt,
          attempts: processingInfo.attempts,
          lastError: processingInfo.lastError
        });
      }
      
      // Verificar histórico
      const historyInfo = this.eventHistory.get(id);
      if (historyInfo) {
        return res.json({
          eventId: id,
          status: 'completed',
          processedAt: historyInfo.processedAt,
          actions: historyInfo.actions
        });
      }
      
      // Evento não encontrado
      res.status(404).json({
        error: 'Event not found',
        eventId: id
      });
      
    } catch (error) {
      this.logger.error('Failed to get event status', {
        eventId: req.params.id,
        error: error.message
      });
      
      this.metrics.statusQueryErrors.inc();
      
      res.status(500).json({
        error: 'Failed to get event status',
        message: error.message
      });
    }
  }
  
  async listProcessingEvents(req, res) {
    try {
      const { status, type, limit = 50, offset = 0 } = req.query;
      
      let events = Array.from(this.processingEvents.values());
      
      // Filtrar por status
      if (status) {
        events = events.filter(e => e.status === status);
      }
      
      // Filtrar por tipo
      if (type) {
        events = events.filter(e => e.event.type === type);
      }
      
      // Paginação
      const total = events.length;
      events = events.slice(offset, offset + parseInt(limit));
      
      res.json({
        events: events.map(e => ({
          eventId: e.event.id,
          type: e.event.type,
          status: e.status,
          startedAt: e.startedAt,
          attempts: e.attempts,
          lastError: e.lastError
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + parseInt(limit) < total
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to list processing events', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to list processing events',
        message: error.message
      });
    }
  }
  
  async getHealthInfo() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage.set(memUsage.heapUsed);
    this.metrics.queueDepth.set(this.processingEvents.size);
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'event-agent',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      processing: {
        activeEvents: this.processingEvents.size,
        isPolling: this.isPolling,
        pollingInterval: this.config.polling.interval,
        historySize: this.eventHistory.size
      },
      sqs: {
        connected: this.sqsService.isConnected(),
        region: this.sqsService.getRegion()
      }
    };
    
    // Verificar condições de saúde
    if (this.processingEvents.size > this.config.processing.maxConcurrent * 0.9) {
      health.status = 'degraded';
      health.warnings = ['High number of active events'];
    }
    
    if (!this.sqsService.isConnected()) {
      health.status = 'unhealthy';
      health.errors = ['SQS not connected'];
    }
    
    return health;
  }
  
  getDetailedMetrics() {
    return {
      processing: {
        activeEvents: this.processingEvents.size,
        historySize: this.eventHistory.size,
        duplicateTrackerSize: this.duplicateTracker.size,
        retryQueueSize: this.retryQueue.size
      },
      polling: {
        isPolling: this.isPolling,
        interval: this.config.polling.interval,
        batchSize: this.config.polling.batchSize
      },
      configuration: {
        maxConcurrent: this.config.processing.maxConcurrent,
        retryAttempts: this.config.processing.retryAttempts,
        historyRetention: this.config.cleanup.historyRetention
      },
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
  
  async shutdown() {
    this.logger.info('Shutting down Event Service');
    
    try {
      // Parar polling
      await this.stopPolling();
      
      // Aguardar eventos em processamento terminarem (com timeout)
      const shutdownTimeout = 30000; // 30 segundos
      const startTime = Date.now();
      
      while (this.processingEvents.size > 0 && Date.now() - startTime < shutdownTimeout) {
        this.logger.info(`Waiting for ${this.processingEvents.size} events to complete`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (this.processingEvents.size > 0) {
        this.logger.warn(`Forcing shutdown with ${this.processingEvents.size} events still processing`);
      }
      
      this.logger.info('Event Service shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during Event Service shutdown', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = EventService;