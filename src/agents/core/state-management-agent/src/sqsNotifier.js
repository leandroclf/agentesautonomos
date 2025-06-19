/**
 * SQSNotifier - Notificador de Mudanças de Estado via SQS
 * 
 * Responsabilidades:
 * - Publicar notificações de mudanças de estado
 * - Gerenciar filas de notificação
 * - Implementar retry e DLQ
 * - Filtrar e rotear notificações
 */

const EventEmitter = require('events');

class SQSNotifier extends EventEmitter {
  constructor(sqsService, logger, options = {}) {
    super();
    
    this.sqsService = sqsService;
    this.logger = logger;
    this.options = {
      enableNotifications: options.enableNotifications !== false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      batchSize: options.batchSize || 10,
      flushInterval: options.flushInterval || 5000,
      ...options
    };
    
    // Filas de notificação
    this.queues = {
      stateChanges: 'state-changes-queue',
      agentEvents: 'agent-events-queue',
      systemEvents: 'system-events-queue'
    };
    
    // Buffer para notificações em lote
    this.notificationBuffer = [];
    this.flushTimer = null;
    
    // Estatísticas
    this.stats = {
      totalNotifications: 0,
      successfulNotifications: 0,
      failedNotifications: 0,
      retriedNotifications: 0,
      lastNotification: null
    };
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      if (!this.options.enableNotifications) {
        this.logger.info('SQS notifications disabled');
        this.isInitialized = true;
        return;
      }
      
      // Verificar conectividade com SQS
      await this.verifyQueues();
      
      // Iniciar timer de flush
      this.startFlushTimer();
      
      this.isInitialized = true;
      this.logger.info('SQSNotifier initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize SQSNotifier', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async verifyQueues() {
    for (const [name, queueName] of Object.entries(this.queues)) {
      try {
        await this.sqsService.getQueueUrl(queueName);
        this.logger.debug(`Queue verified: ${queueName}`);
      } catch (error) {
        this.logger.warn(`Queue not accessible: ${queueName}`, {
          error: error.message
        });
        // Continuar mesmo se algumas filas não estiverem disponíveis
      }
    }
  }

  async notifyStateChange(changeData) {
    if (!this.options.enableNotifications || !this.isInitialized) {
      return;
    }
    
    try {
      const notification = this.createStateChangeNotification(changeData);
      
      // Adicionar ao buffer para processamento em lote
      this.notificationBuffer.push({
        queue: this.queues.stateChanges,
        message: notification,
        timestamp: new Date().toISOString(),
        retries: 0
      });
      
      // Flush imediato se buffer estiver cheio
      if (this.notificationBuffer.length >= this.options.batchSize) {
        await this.flushNotifications();
      }
      
      this.stats.totalNotifications++;
      this.stats.lastNotification = new Date().toISOString();
      
    } catch (error) {
      this.logger.error('Failed to queue state change notification', {
        error: error.message,
        changeData
      });
      this.stats.failedNotifications++;
    }
  }

  async notifyAgentEvent(eventData) {
    if (!this.options.enableNotifications || !this.isInitialized) {
      return;
    }
    
    try {
      const notification = this.createAgentEventNotification(eventData);
      
      this.notificationBuffer.push({
        queue: this.queues.agentEvents,
        message: notification,
        timestamp: new Date().toISOString(),
        retries: 0
      });
      
      if (this.notificationBuffer.length >= this.options.batchSize) {
        await this.flushNotifications();
      }
      
      this.stats.totalNotifications++;
      
    } catch (error) {
      this.logger.error('Failed to queue agent event notification', {
        error: error.message,
        eventData
      });
      this.stats.failedNotifications++;
    }
  }

  async notifySystemEvent(eventData) {
    if (!this.options.enableNotifications || !this.isInitialized) {
      return;
    }
    
    try {
      const notification = this.createSystemEventNotification(eventData);
      
      // Eventos de sistema são enviados imediatamente
      await this.sendNotification(this.queues.systemEvents, notification);
      
      this.stats.totalNotifications++;
      this.stats.successfulNotifications++;
      
    } catch (error) {
      this.logger.error('Failed to send system event notification', {
        error: error.message,
        eventData
      });
      this.stats.failedNotifications++;
    }
  }

  createStateChangeNotification(changeData) {
    return {
      type: 'state_change',
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'state-management-agent',
      data: {
        agentId: changeData.agentId,
        version: changeData.version,
        changeType: changeData.changeType,
        timestamp: changeData.timestamp,
        metadata: changeData.metadata || {}
      },
      routing: {
        priority: this.determineNotificationPriority(changeData),
        tags: this.generateNotificationTags(changeData)
      }
    };
  }

  createAgentEventNotification(eventData) {
    return {
      type: 'agent_event',
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'state-management-agent',
      data: {
        agentId: eventData.agentId,
        eventType: eventData.eventType,
        payload: eventData.payload || {},
        metadata: eventData.metadata || {}
      },
      routing: {
        priority: eventData.priority || 'medium',
        tags: eventData.tags || []
      }
    };
  }

  createSystemEventNotification(eventData) {
    return {
      type: 'system_event',
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'state-management-agent',
      data: {
        eventType: eventData.eventType,
        severity: eventData.severity || 'info',
        message: eventData.message,
        payload: eventData.payload || {},
        metadata: eventData.metadata || {}
      },
      routing: {
        priority: eventData.severity === 'critical' ? 'high' : 'medium',
        tags: ['system', eventData.eventType]
      }
    };
  }

  determineNotificationPriority(changeData) {
    // Prioridade baseada no tipo de mudança
    switch (changeData.changeType) {
      case 'state_removed':
      case 'status_change':
        return 'high';
      case 'structure_change':
        return 'medium';
      case 'data_update':
      case 'created':
      default:
        return 'low';
    }
  }

  generateNotificationTags(changeData) {
    const tags = ['state-change'];
    
    if (changeData.agentId) {
      tags.push(`agent:${changeData.agentId}`);
    }
    
    if (changeData.changeType) {
      tags.push(`change:${changeData.changeType}`);
    }
    
    if (changeData.metadata?.agentType) {
      tags.push(`type:${changeData.metadata.agentType}`);
    }
    
    return tags;
  }

  async flushNotifications() {
    if (this.notificationBuffer.length === 0) {
      return;
    }
    
    const notifications = [...this.notificationBuffer];
    this.notificationBuffer = [];
    
    // Agrupar por fila
    const queueGroups = {};
    notifications.forEach(notification => {
      if (!queueGroups[notification.queue]) {
        queueGroups[notification.queue] = [];
      }
      queueGroups[notification.queue].push(notification);
    });
    
    // Enviar por fila
    const promises = Object.entries(queueGroups).map(([queue, queueNotifications]) => 
      this.sendBatchNotifications(queue, queueNotifications)
    );
    
    await Promise.allSettled(promises);
  }

  async sendBatchNotifications(queueName, notifications) {
    try {
      // Preparar mensagens para envio em lote
      const messages = notifications.map((notification, index) => ({
        Id: `msg-${Date.now()}-${index}`,
        MessageBody: JSON.stringify(notification.message),
        MessageAttributes: {
          NotificationType: {
            StringValue: notification.message.type,
            DataType: 'String'
          },
          Priority: {
            StringValue: notification.message.routing?.priority || 'medium',
            DataType: 'String'
          },
          Source: {
            StringValue: 'state-management-agent',
            DataType: 'String'
          }
        }
      }));
      
      // Enviar em lotes de até 10 mensagens (limite do SQS)
      const batchSize = 10;
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        await this.sqsService.sendMessageBatch(queueName, batch);
      }
      
      this.stats.successfulNotifications += notifications.length;
      
      this.logger.debug(`Sent ${notifications.length} notifications to ${queueName}`);
      
    } catch (error) {
      this.logger.error(`Failed to send batch notifications to ${queueName}`, {
        error: error.message,
        notificationCount: notifications.length
      });
      
      // Tentar reenviar notificações individuais com retry
      await this.retryFailedNotifications(queueName, notifications);
    }
  }

  async sendNotification(queueName, message) {
    try {
      await this.sqsService.sendMessage(queueName, {
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          NotificationType: {
            StringValue: message.type,
            DataType: 'String'
          },
          Priority: {
            StringValue: message.routing?.priority || 'medium',
            DataType: 'String'
          },
          Source: {
            StringValue: 'state-management-agent',
            DataType: 'String'
          }
        }
      });
      
    } catch (error) {
      this.logger.error(`Failed to send notification to ${queueName}`, {
        error: error.message,
        message
      });
      throw error;
    }
  }

  async retryFailedNotifications(queueName, notifications) {
    for (const notification of notifications) {
      if (notification.retries < this.options.maxRetries) {
        try {
          // Aguardar antes do retry
          await this.delay(this.options.retryDelay * (notification.retries + 1));
          
          await this.sendNotification(queueName, notification.message);
          
          this.stats.successfulNotifications++;
          this.stats.retriedNotifications++;
          
        } catch (error) {
          notification.retries++;
          
          if (notification.retries >= this.options.maxRetries) {
            this.logger.error(`Failed to send notification after ${this.options.maxRetries} retries`, {
              error: error.message,
              notification: notification.message
            });
            this.stats.failedNotifications++;
          } else {
            // Reagendar para retry
            this.notificationBuffer.push(notification);
          }
        }
      }
    }
  }

  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(async () => {
      try {
        await this.flushNotifications();
      } catch (error) {
        this.logger.error('Error during scheduled flush', {
          error: error.message
        });
      }
    }, this.options.flushInterval);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      ...this.stats,
      bufferSize: this.notificationBuffer.length,
      isInitialized: this.isInitialized,
      enabledQueues: Object.keys(this.queues)
    };
  }

  async shutdown() {
    this.logger.info('Shutting down SQSNotifier');
    
    // Parar timer de flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Enviar notificações pendentes
    if (this.notificationBuffer.length > 0) {
      this.logger.info(`Flushing ${this.notificationBuffer.length} pending notifications`);
      await this.flushNotifications();
    }
    
    this.isInitialized = false;
    this.emit('shutdown');
  }
}

module.exports = SQSNotifier;