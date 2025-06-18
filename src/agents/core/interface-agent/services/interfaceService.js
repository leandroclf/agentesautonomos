/**
 * Interface Service para Interface Agent
 * Serviço principal que coordena todas as operações do Interface Agent
 */

const EventHandler = require('../handlers/eventHandler');
const WebSocketHandler = require('../handlers/websocketHandler');
const config = require('../../config');

class InterfaceService {
  constructor(sqsService, logger, metrics) {
    this.sqsService = sqsService;
    this.logger = logger;
    this.metrics = metrics;
    this.eventHandler = null;
    this.websocketHandler = null;
    this.isInitialized = false;
    this.startTime = new Date();
    
    // Estatísticas de operação
    this.stats = {
      requestsProcessed: 0,
      eventsSubmitted: 0,
      websocketConnections: 0,
      errors: 0,
      lastActivity: new Date()
    };
  }

  /**
   * Inicializa o serviço
   */
  async initialize() {
    try {
      this.logger.info('Initializing Interface Service');

      // Inicializar Event Handler
      this.eventHandler = new EventHandler(
        this.sqsService,
        this.logger,
        this.metrics
      );

      // Configurar limpeza automática de eventos antigos
      this.setupEventCleanup();

      this.isInitialized = true;
      
      this.logger.info('Interface Service initialized successfully', {
        eventHandlerEnabled: true,
        websocketEnabled: config.interface.websocket.enabled,
        cleanupInterval: '1 hour'
      });

    } catch (error) {
      this.logger.error('Failed to initialize Interface Service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Inicializa WebSocket Handler (chamado após servidor HTTP estar pronto)
   */
  initializeWebSocket(server) {
    if (config.interface.websocket.enabled) {
      try {
        this.websocketHandler = new WebSocketHandler(
          server,
          this.logger,
          this.metrics,
          this.eventHandler
        );
        
        this.logger.info('WebSocket Handler initialized');
      } catch (error) {
        this.logger.error('Failed to initialize WebSocket Handler', {
          error: error.message
        });
        // Não falhar a inicialização se WebSocket falhar
      }
    }
  }

  /**
   * Processa submissão de evento
   */
  async submitEvent(req, res) {
    const startTime = Date.now();
    
    try {
      this.stats.requestsProcessed++;
      this.stats.lastActivity = new Date();
      
      await this.eventHandler.handleEventSubmission(req, res);
      
      this.stats.eventsSubmitted++;
      
      // Atualizar métricas de performance
      this.metrics.requestDuration.observe(
        { method: 'POST', endpoint: '/events' },
        Date.now() - startTime
      );
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error in submitEvent', {
        error: error.message,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Consulta status de evento
   */
  async getEventStatus(req, res) {
    const startTime = Date.now();
    
    try {
      this.stats.requestsProcessed++;
      this.stats.lastActivity = new Date();
      
      await this.eventHandler.handleEventStatus(req, res);
      
      // Atualizar métricas de performance
      this.metrics.requestDuration.observe(
        { method: 'GET', endpoint: '/events/:id/status' },
        Date.now() - startTime
      );
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error in getEventStatus', {
        error: error.message,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Lista eventos
   */
  async listEvents(req, res) {
    const startTime = Date.now();
    
    try {
      this.stats.requestsProcessed++;
      this.stats.lastActivity = new Date();
      
      await this.eventHandler.handleEventsList(req, res);
      
      // Atualizar métricas de performance
      this.metrics.requestDuration.observe(
        { method: 'GET', endpoint: '/events' },
        Date.now() - startTime
      );
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error in listEvents', {
        error: error.message,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Retorna informações de saúde do serviço
   */
  async getHealthInfo() {
    const now = new Date();
    const uptime = now.getTime() - this.startTime.getTime();
    
    const health = {
      status: 'healthy',
      timestamp: now.toISOString(),
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      service: 'interface-agent',
      dependencies: {
        sqs: 'unknown',
        websocket: config.interface.websocket.enabled ? 'enabled' : 'disabled'
      },
      metrics: {
        requestsProcessed: this.stats.requestsProcessed,
        eventsSubmitted: this.stats.eventsSubmitted,
        errors: this.stats.errors,
        errorRate: this.stats.requestsProcessed > 0 
          ? (this.stats.errors / this.stats.requestsProcessed).toFixed(4)
          : 0,
        lastActivity: this.stats.lastActivity,
        memoryUsage: process.memoryUsage(),
        activeConnections: this.websocketHandler ? 
          this.websocketHandler.getStats().totalConnections : 0
      }
    };

    // Verificar saúde das dependências
    try {
      // Testar conectividade SQS
      await this.sqsService.getQueueAttributes(config.event.queues.input);
      health.dependencies.sqs = 'healthy';
    } catch (error) {
      health.dependencies.sqs = 'unhealthy';
      health.status = 'degraded';
      this.logger.warn('SQS health check failed', {
        error: error.message
      });
    }

    // Verificar se há muitos erros
    if (health.metrics.errorRate > 0.1) { // 10% de taxa de erro
      health.status = 'degraded';
    }

    // Verificar uso de memória
    const memoryUsagePercent = health.metrics.memoryUsage.heapUsed / health.metrics.memoryUsage.heapTotal;
    if (memoryUsagePercent > 0.9) { // 90% de uso de memória
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Retorna métricas detalhadas do serviço
   */
  getDetailedMetrics() {
    const metrics = {
      service: {
        name: 'interface-agent',
        version: process.env.npm_package_version || '1.0.0',
        startTime: this.startTime,
        uptime: Date.now() - this.startTime.getTime()
      },
      requests: {
        total: this.stats.requestsProcessed,
        errors: this.stats.errors,
        errorRate: this.stats.requestsProcessed > 0 
          ? (this.stats.errors / this.stats.requestsProcessed).toFixed(4)
          : 0,
        lastActivity: this.stats.lastActivity
      },
      events: {
        submitted: this.stats.eventsSubmitted,
        ...(this.eventHandler ? this.eventHandler.getStats() : {})
      },
      websocket: this.websocketHandler ? this.websocketHandler.getStats() : {
        enabled: false
      },
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    return metrics;
  }

  /**
   * Notifica sobre atualização de status de evento
   */
  notifyEventStatusUpdate(eventId, status, metadata = {}) {
    try {
      // Atualizar cache local
      if (this.eventHandler) {
        this.eventHandler.updateEventStatus(eventId, status, metadata);
      }

      // Notificar clientes WebSocket subscritos
      if (this.websocketHandler) {
        this.websocketHandler.broadcast('status_updates', {
          type: 'event_status_update',
          eventId,
          status,
          metadata,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.debug('Event status update notified', {
        eventId,
        status,
        metadata
      });

    } catch (error) {
      this.logger.error('Error notifying event status update', {
        eventId,
        status,
        error: error.message
      });
    }
  }

  /**
   * Envia notificação em tempo real
   */
  sendRealtimeNotification(topic, data) {
    if (this.websocketHandler) {
      const sent = this.websocketHandler.broadcast(topic, {
        type: 'notification',
        data,
        timestamp: new Date().toISOString()
      });
      
      this.logger.debug('Realtime notification sent', {
        topic,
        recipients: sent,
        dataType: typeof data
      });
      
      return sent;
    }
    return 0;
  }

  /**
   * Configura limpeza automática de eventos antigos
   */
  setupEventCleanup() {
    // Executar limpeza a cada hora
    const cleanupInterval = setInterval(() => {
      try {
        if (this.eventHandler) {
          this.eventHandler.cleanupOldEvents();
        }
      } catch (error) {
        this.logger.error('Error during event cleanup', {
          error: error.message
        });
      }
    }, 60 * 60 * 1000); // 1 hora

    // Limpar interval no shutdown
    process.on('SIGTERM', () => {
      clearInterval(cleanupInterval);
    });
    
    process.on('SIGINT', () => {
      clearInterval(cleanupInterval);
    });
  }

  /**
   * Processa eventos de sistema
   */
  async processSystemEvent(event) {
    try {
      this.logger.info('Processing system event', {
        type: event.type,
        eventId: event.id
      });

      switch (event.type) {
        case 'agent_status_change':
          await this.handleAgentStatusChange(event);
          break;
          
        case 'system_alert':
          await this.handleSystemAlert(event);
          break;
          
        case 'metrics_update':
          await this.handleMetricsUpdate(event);
          break;
          
        default:
          this.logger.warn('Unknown system event type', {
            type: event.type,
            eventId: event.id
          });
      }

    } catch (error) {
      this.logger.error('Error processing system event', {
        eventId: event.id,
        type: event.type,
        error: error.message
      });
    }
  }

  /**
   * Manipula mudança de status de agente
   */
  async handleAgentStatusChange(event) {
    const { agentId, status, metadata } = event.data;
    
    // Notificar clientes WebSocket
    this.sendRealtimeNotification('system_alerts', {
      type: 'agent_status_change',
      agentId,
      status,
      metadata,
      severity: status === 'unhealthy' ? 'high' : 'low'
    });
    
    this.logger.info('Agent status change processed', {
      agentId,
      status,
      metadata
    });
  }

  /**
   * Manipula alerta de sistema
   */
  async handleSystemAlert(event) {
    const { severity, message, source } = event.data;
    
    // Notificar clientes WebSocket
    this.sendRealtimeNotification('system_alerts', {
      type: 'system_alert',
      severity,
      message,
      source,
      timestamp: event.timestamp
    });
    
    this.logger.warn('System alert processed', {
      severity,
      message,
      source
    });
  }

  /**
   * Manipula atualização de métricas
   */
  async handleMetricsUpdate(event) {
    const { metrics, source } = event.data;
    
    // Notificar clientes WebSocket subscritos a métricas
    this.sendRealtimeNotification('metrics', {
      type: 'metrics_update',
      metrics,
      source,
      timestamp: event.timestamp
    });
    
    this.logger.debug('Metrics update processed', {
      source,
      metricsCount: Object.keys(metrics).length
    });
  }

  /**
   * Graceful shutdown do serviço
   */
  async shutdown() {
    this.logger.info('Shutting down Interface Service');
    
    try {
      // Fechar WebSocket se estiver ativo
      if (this.websocketHandler) {
        this.websocketHandler.close();
      }
      
      // Aguardar processamento de requisições pendentes
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.logger.info('Interface Service shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during Interface Service shutdown', {
        error: error.message
      });
    }
  }

  /**
   * Verifica se o serviço está pronto
   */
  isReady() {
    return this.isInitialized && this.eventHandler !== null;
  }

  /**
   * Retorna estatísticas resumidas
   */
  getSummaryStats() {
    return {
      uptime: Date.now() - this.startTime.getTime(),
      requestsProcessed: this.stats.requestsProcessed,
      eventsSubmitted: this.stats.eventsSubmitted,
      errors: this.stats.errors,
      websocketConnections: this.websocketHandler ? 
        this.websocketHandler.getStats().totalConnections : 0,
      lastActivity: this.stats.lastActivity
    };
  }
}

module.exports = InterfaceService;