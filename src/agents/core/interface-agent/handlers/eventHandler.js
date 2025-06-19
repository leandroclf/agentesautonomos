/**
 * Event Handler para Interface Agent
 * Responsável por processar requisições de eventos e roteá-las adequadamente
 */

const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const config = require('../../../../config');

// Schema de validação para eventos
const eventSchema = Joi.object({
  type: Joi.string().valid(
    'user_request',
    'system_event', 
    'planning_request',
    'execution_request',
    'monitoring_event'
  ).required(),
  source: Joi.string().required(),
  data: Joi.object().required(),
  priority: Joi.string().valid('low', 'normal', 'high', 'critical').default('normal'),
  correlationId: Joi.string().uuid().optional(),
  metadata: Joi.object().optional()
});

class EventHandler {
  constructor(sqsService, logger, metrics) {
    this.sqsService = sqsService;
    this.logger = logger;
    this.metrics = metrics;
    this.processingEvents = new Map(); // Cache de eventos em processamento
  }

  /**
   * Processa submissão de novo evento
   */
  async handleEventSubmission(req, res) {
    const startTime = Date.now();
    const eventId = uuidv4();
    
    try {
      // Validar payload
      const { error, value: validatedEvent } = eventSchema.validate(req.body);
      if (error) {
        this.metrics.eventValidationErrors.inc();
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          eventId
        });
      }

      // Criar evento estruturado
      const event = {
        id: eventId,
        timestamp: new Date().toISOString(),
        ...validatedEvent,
        correlationId: validatedEvent.correlationId || uuidv4(),
        metadata: {
          ...validatedEvent.metadata,
          sourceIp: req.ip,
          userAgent: req.get('User-Agent'),
          receivedAt: new Date().toISOString()
        }
      };

      // Verificar tamanho do evento
      const eventSize = Buffer.byteLength(JSON.stringify(event), 'utf8');
      if (eventSize > config.event.validation.maxEventSize) {
        this.metrics.eventSizeErrors.inc();
        return res.status(413).json({
          error: 'Event too large',
          maxSize: config.event.validation.maxEventSize,
          actualSize: eventSize,
          eventId
        });
      }

      // Adicionar ao cache de processamento
      this.processingEvents.set(eventId, {
        status: 'submitted',
        timestamp: new Date(),
        event
      });

      // Enviar para fila de eventos
      const message = {
        messageId: uuidv4(),
        timestamp: new Date().toISOString(),
        source: 'interface-agent',
        target: 'event-agent',
        type: 'event_processing',
        payload: event,
        metadata: {
          correlationId: event.correlationId,
          retryCount: 0,
          priority: event.priority
        }
      };

      await this.sqsService.sendMessage(
        config.event.queues.input,
        message
      );

      // Atualizar métricas
      this.metrics.eventsSubmitted.inc({ type: event.type });
      this.metrics.eventProcessingDuration.observe(
        { type: event.type },
        Date.now() - startTime
      );

      // Log da submissão
      this.logger.info('Event submitted successfully', {
        eventId,
        type: event.type,
        correlationId: event.correlationId,
        duration: Date.now() - startTime
      });

      // Atualizar status no cache
      this.processingEvents.set(eventId, {
        status: 'queued',
        timestamp: new Date(),
        event,
        queuedAt: new Date()
      });

      // Resposta de sucesso
      res.status(202).json({
        eventId,
        correlationId: event.correlationId,
        status: 'queued',
        message: 'Event submitted for processing',
        estimatedProcessingTime: this._estimateProcessingTime(event.type)
      });

    } catch (error) {
      this.metrics.eventSubmissionErrors.inc();
      this.logger.error('Error submitting event', {
        eventId,
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      });

      res.status(500).json({
        error: 'Internal server error',
        eventId,
        message: 'Failed to submit event for processing'
      });
    }
  }

  /**
   * Consulta status de processamento de evento
   */
  async handleEventStatus(req, res) {
    const { eventId } = req.params;
    const startTime = Date.now();

    try {
      // Validar UUID
      if (!this._isValidUUID(eventId)) {
        return res.status(400).json({
          error: 'Invalid event ID format'
        });
      }

      // Buscar no cache local primeiro
      const cachedEvent = this.processingEvents.get(eventId);
      if (cachedEvent) {
        this.metrics.statusCacheHits.inc();
        return res.json({
          eventId,
          status: cachedEvent.status,
          submittedAt: cachedEvent.timestamp,
          lastUpdated: cachedEvent.lastUpdated || cachedEvent.timestamp,
          processingTime: Date.now() - cachedEvent.timestamp.getTime()
        });
      }

      // Se não encontrado no cache, consultar sistema de estado
      // (Implementação futura com banco de dados ou cache distribuído)
      this.metrics.statusCacheMisses.inc();
      
      this.logger.info('Event status requested', {
        eventId,
        duration: Date.now() - startTime
      });

      res.status(404).json({
        error: 'Event not found',
        eventId,
        message: 'Event ID not found in system'
      });

    } catch (error) {
      this.metrics.statusQueryErrors.inc();
      this.logger.error('Error querying event status', {
        eventId,
        error: error.message,
        duration: Date.now() - startTime
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to query event status'
      });
    }
  }

  /**
   * Lista eventos em processamento
   */
  async handleEventsList(req, res) {
    const startTime = Date.now();
    
    try {
      const {
        status,
        type,
        limit = 50,
        offset = 0,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = req.query;

      // Validar parâmetros
      const validLimit = Math.min(Math.max(parseInt(limit), 1), 100);
      const validOffset = Math.max(parseInt(offset), 0);

      // Filtrar eventos do cache
      let events = Array.from(this.processingEvents.entries())
        .map(([id, data]) => ({
          eventId: id,
          ...data
        }));

      // Aplicar filtros
      if (status) {
        events = events.filter(e => e.status === status);
      }
      if (type) {
        events = events.filter(e => e.event.type === type);
      }

      // Ordenar
      events.sort((a, b) => {
        const aVal = sortBy === 'timestamp' ? a.timestamp : a[sortBy];
        const bVal = sortBy === 'timestamp' ? b.timestamp : b[sortBy];
        
        if (sortOrder === 'desc') {
          return bVal > aVal ? 1 : -1;
        }
        return aVal > bVal ? 1 : -1;
      });

      // Paginar
      const total = events.length;
      const paginatedEvents = events.slice(validOffset, validOffset + validLimit);

      // Preparar resposta
      const response = {
        events: paginatedEvents.map(e => ({
          eventId: e.eventId,
          type: e.event.type,
          status: e.status,
          priority: e.event.priority,
          submittedAt: e.timestamp,
          correlationId: e.event.correlationId,
          processingTime: Date.now() - e.timestamp.getTime()
        })),
        pagination: {
          total,
          limit: validLimit,
          offset: validOffset,
          hasMore: validOffset + validLimit < total
        },
        filters: {
          status,
          type
        }
      };

      this.logger.info('Events list requested', {
        total,
        filtered: paginatedEvents.length,
        filters: { status, type },
        duration: Date.now() - startTime
      });

      res.json(response);

    } catch (error) {
      this.metrics.listEventsErrors.inc();
      this.logger.error('Error listing events', {
        error: error.message,
        duration: Date.now() - startTime
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list events'
      });
    }
  }

  /**
   * Atualiza status de evento (chamado por outros agentes)
   */
  updateEventStatus(eventId, status, metadata = {}) {
    const cachedEvent = this.processingEvents.get(eventId);
    if (cachedEvent) {
      cachedEvent.status = status;
      cachedEvent.lastUpdated = new Date();
      cachedEvent.metadata = { ...cachedEvent.metadata, ...metadata };
      
      this.logger.debug('Event status updated', {
        eventId,
        status,
        metadata
      });
    }
  }

  /**
   * Limpa eventos antigos do cache
   */
  cleanupOldEvents() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    
    let cleaned = 0;
    for (const [eventId, data] of this.processingEvents.entries()) {
      if (now - data.timestamp.getTime() > maxAge) {
        this.processingEvents.delete(eventId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.info('Cleaned up old events from cache', {
        cleaned,
        remaining: this.processingEvents.size
      });
    }
  }

  /**
   * Estima tempo de processamento baseado no tipo de evento
   */
  _estimateProcessingTime(eventType) {
    const estimates = {
      'user_request': 5000,      // 5 segundos
      'system_event': 2000,      // 2 segundos
      'planning_request': 30000, // 30 segundos
      'execution_request': 60000, // 1 minuto
      'monitoring_event': 1000   // 1 segundo
    };
    
    return estimates[eventType] || 10000; // 10 segundos default
  }

  /**
   * Valida se string é UUID válido
   */
  _isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Retorna estatísticas do handler
   */
  getStats() {
    const now = Date.now();
    const events = Array.from(this.processingEvents.values());
    
    const stats = {
      totalEvents: events.length,
      byStatus: {},
      byType: {},
      averageAge: 0
    };
    
    let totalAge = 0;
    events.forEach(event => {
      // Por status
      stats.byStatus[event.status] = (stats.byStatus[event.status] || 0) + 1;
      
      // Por tipo
      const type = event.event.type;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // Idade média
      totalAge += now - event.timestamp.getTime();
    });
    
    if (events.length > 0) {
      stats.averageAge = Math.round(totalAge / events.length);
    }
    
    return stats;
  }
}

module.exports = EventHandler;