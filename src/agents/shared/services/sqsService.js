const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const config = require('../../../config');

class SQSService {
  constructor(logger) {
    this.logger = logger;
    this.sqs = null;
    this.queues = new Map(); // queueName -> queueUrl
    this.isInitialized = false;
    this.pollingIntervals = new Map(); // queueName -> intervalId
    this.messageHandlers = new Map(); // queueName -> messageHandler
    
    // Validação e configurações
    if (!config || !config.shared || !config.shared.sqs) {
      // Fallback para configuração SQS direta
      if (!config.shared || !config.shared.sqs) {
        this.config = {
          region: process.env.AWS_REGION || 'us-east-1',
          endpoint: process.env.SQS_ENDPOINT,
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };
      } else {
        throw new Error('SQS configuration not found');
      }
    } else {
      this.config = config.shared.sqs;
    }
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    };
    
    // Métricas internas
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesDeleted: 0,
      errors: 0,
      retries: 0
    };
  }

  async initialize() {
    try {
      this.logger.info('Initializing SQS Service');
      
      // Configurar AWS SDK
      const awsConfig = {
        region: this.config.region
      };
      
      // Para desenvolvimento local com ElasticMQ, usar credenciais fictícias
      if (process.env.SQS_ENDPOINT) {
        awsConfig.accessKeyId = 'fake-access-key';
        awsConfig.secretAccessKey = 'fake-secret-key';
      } else {
        awsConfig.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        awsConfig.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      }
      
      AWS.config.update(awsConfig);
      
      const sqsConfig = {
        apiVersion: '2012-11-05',
        region: this.config.region
      };
      
      // Adicionar endpoint se configurado (para LocalStack/ElasticMQ)
      // Forçar uso do ElasticMQ local se não houver endpoint configurado
      if (process.env.SQS_ENDPOINT) {
        sqsConfig.endpoint = process.env.SQS_ENDPOINT;
      } else {
        // Fallback para ElasticMQ local em desenvolvimento
        sqsConfig.endpoint = 'http://localhost:9324';
        this.logger.info('Using default ElasticMQ endpoint: http://localhost:9324');
      }
      
      this.sqs = new AWS.SQS(sqsConfig);
      
      // Verificar conectividade
      await this.testConnection();
      
      // Inicializar filas necessárias
      await this.initializeQueues();
      
      this.isInitialized = true;
      this.logger.info('SQS Service initialized successfully');
      
    } catch (error) {
      // Validação defensiva para evitar TypeError
      const safeError = error || new Error('Unknown error during SQS initialization');
      this.logger.error('Failed to initialize SQS Service', {
        error: safeError.message || 'Unknown error',
        stack: safeError.stack || 'No stack trace available'
      });
      throw safeError;
    }
  }

  async testConnection() {
    try {
      this.logger.debug('Testing SQS connection...', {
        endpoint: this.sqs.config.endpoint,
        region: this.sqs.config.region
      });
      await this.sqs.listQueues({ MaxResults: 1 }).promise();
      this.logger.debug('SQS connection test successful');
    } catch (error) {
      const safeError = error || new Error('Unknown connection error');
      this.logger.error('SQS connection test failed', {
        error: safeError.message || 'Unknown error',
        code: safeError.code || 'Unknown code',
        statusCode: safeError.statusCode || 'Unknown status',
        endpoint: this.sqs.config.endpoint,
        region: this.sqs.config.region
      });
      throw new Error(`SQS connection failed: ${safeError.message || 'Unknown error'}`);
    }
  }

  async initializeQueues() {
    const queueNames = [
      'interface-to-event',
      'event-to-planning',
      'planning-to-execution',
      'execution-to-interface',
      'status-updates',
      'notifications'
    ];
    
    for (const queueName of queueNames) {
      try {
        const queueUrl = await this.ensureQueueExists(queueName);
        this.queues.set(queueName, queueUrl);
        
        this.logger.debug('Queue initialized', {
          queueName,
          queueUrl
        });
        
      } catch (error) {
        const safeError = error || new Error('Unknown queue initialization error');
        this.logger.error('Failed to initialize queue', {
          queueName,
          error: safeError.message || 'Unknown error'
        });
        throw safeError;
      }
    }
  }

  async ensureQueueExists(queueName) {
    try {
      // Tentar obter URL da fila existente
      const getQueueUrlParams = {
        QueueName: this.getFullQueueName(queueName)
      };
      
      const result = await this.sqs.getQueueUrl(getQueueUrlParams).promise();
      return result.QueueUrl;
      
    } catch (error) {
      if (error.code === 'AWS.SimpleQueueService.NonExistentQueue') {
        // Fila não existe, criar nova
        return await this.createQueue(queueName);
      }
      throw error;
    }
  }

  async createQueue(queueName) {
    try {
      const fullQueueName = this.getFullQueueName(queueName);
      
      const createQueueParams = {
        QueueName: fullQueueName,
        Attributes: {
          'VisibilityTimeoutSeconds': '300',
          'MessageRetentionPeriod': '1209600', // 14 dias
          'ReceiveMessageWaitTimeSeconds': '20', // Long polling
          'DelaySeconds': '0'
        }
      };
      
      // Adicionar DLQ se configurado
      if (this.config.deadLetterQueue.enabled) {
        const dlqName = `${fullQueueName}-dlq`;
        const dlqUrl = await this.createDeadLetterQueue(dlqName);
        
        // Obter ARN da DLQ
        const dlqAttributes = await this.sqs.getQueueAttributes({
          QueueUrl: dlqUrl,
          AttributeNames: ['QueueArn']
        }).promise();
        
        createQueueParams.Attributes['RedrivePolicy'] = JSON.stringify({
          deadLetterTargetArn: dlqAttributes.Attributes.QueueArn,
          maxReceiveCount: this.config.deadLetterQueue.maxReceiveCount
        });
      }
      
      const result = await this.sqs.createQueue(createQueueParams).promise();
      
      this.logger.info('Queue created', {
        queueName: fullQueueName,
        queueUrl: result.QueueUrl
      });
      
      return result.QueueUrl;
      
    } catch (error) {
      this.logger.error('Failed to create queue', {
        queueName,
        error: error.message
      });
      throw error;
    }
  }

  async createDeadLetterQueue(dlqName) {
    try {
      const createDlqParams = {
        QueueName: dlqName,
        Attributes: {
          'MessageRetentionPeriod': '1209600' // 14 dias
        }
      };
      
      const result = await this.sqs.createQueue(createDlqParams).promise();
      
      this.logger.info('Dead letter queue created', {
        dlqName,
        queueUrl: result.QueueUrl
      });
      
      return result.QueueUrl;
      
    } catch (error) {
      this.logger.error('Failed to create dead letter queue', {
        dlqName,
        error: error.message
      });
      throw error;
    }
  }

  getFullQueueName(queueName) {
    const environment = process.env.NODE_ENV || 'development';
    
    // Em desenvolvimento local com ElasticMQ, usar nomes simples das filas
    if (environment === 'development') {
      // Mapear nomes internos para nomes das filas no ElasticMQ
      const queueMapping = {
        'interface-to-event': 'interface-events',
        'event-to-planning': 'planning-requests',
        'planning-to-execution': 'execution-requests',
        'execution-to-interface': 'status-updates',
        'status-updates': 'status-updates',
        'notifications': 'notifications'
      };
      
      return queueMapping[queueName] || queueName;
    }
    
    // Em produção, usar prefixos
    const prefix = this.config.queuePrefix || 'agentes';
    return `${prefix}-${environment}-${queueName}`;
  }

  async getQueueUrl(queueName) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    const queueUrl = this.queues.get(queueName);
    if (!queueUrl) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    return queueUrl;
  }

  async sendMessage(queueName, messageBody, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    const queueUrl = this.queues.get(queueName);
    if (!queueUrl) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    try {
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      
      // Preparar mensagem
      const message = {
        id: messageId,
        timestamp,
        body: messageBody,
        metadata: {
          source: options.source || 'unknown',
          correlationId: options.correlationId || messageId,
          retryCount: options.retryCount || 0
        }
      };
      
      const sendParams = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          'MessageType': {
            DataType: 'String',
            StringValue: options.messageType || 'default'
          },
          'Source': {
            DataType: 'String',
            StringValue: options.source || 'unknown'
          },
          'CorrelationId': {
            DataType: 'String',
            StringValue: options.correlationId || messageId
          }
        }
      };
      
      // Adicionar delay se especificado
      if (options.delaySeconds) {
        sendParams.DelaySeconds = Math.min(options.delaySeconds, 900); // Max 15 min
      }
      
      const result = await this.executeWithRetry(
        () => this.sqs.sendMessage(sendParams).promise(),
        'sendMessage'
      );
      
      this.metrics.messagesSent++;
      
      this.logger.debug('Message sent successfully', {
        queueName,
        messageId,
        sqsMessageId: result.MessageId
      });
      
      return {
        messageId,
        sqsMessageId: result.MessageId,
        timestamp
      };
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to send message', {
        queueName,
        error: error.message,
        messageBody: typeof messageBody === 'object' ? JSON.stringify(messageBody) : messageBody
      });
      throw error;
    }
  }

  async receiveMessages(queueName, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    const queueUrl = this.queues.get(queueName);
    if (!queueUrl) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    try {
      const receiveParams = {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: options.maxMessages || 10,
        WaitTimeSeconds: options.waitTimeSeconds || 20,
        MessageAttributeNames: ['All'],
        AttributeNames: ['All']
      };
      
      const result = await this.executeWithRetry(
        () => this.sqs.receiveMessage(receiveParams).promise(),
        'receiveMessages'
      );
      
      const messages = (result.Messages || []).map(sqsMessage => {
        try {
          const parsedBody = JSON.parse(sqsMessage.Body);
          
          return {
            id: parsedBody.id,
            body: parsedBody.body,
            metadata: parsedBody.metadata,
            timestamp: parsedBody.timestamp,
            sqsMessage: {
              messageId: sqsMessage.MessageId,
              receiptHandle: sqsMessage.ReceiptHandle,
              attributes: sqsMessage.Attributes,
              messageAttributes: sqsMessage.MessageAttributes
            }
          };
        } catch (parseError) {
          this.logger.warn('Failed to parse message body', {
            messageId: sqsMessage.MessageId,
            error: parseError.message
          });
          
          return {
            id: sqsMessage.MessageId,
            body: sqsMessage.Body,
            metadata: { parseError: true },
            timestamp: new Date().toISOString(),
            sqsMessage: {
              messageId: sqsMessage.MessageId,
              receiptHandle: sqsMessage.ReceiptHandle,
              attributes: sqsMessage.Attributes,
              messageAttributes: sqsMessage.MessageAttributes
            }
          };
        }
      });
      
      this.metrics.messagesReceived += messages.length;
      
      this.logger.debug('Messages received', {
        queueName,
        messageCount: messages.length
      });
      
      return messages;
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to receive messages', {
        queueName,
        error: error.message
      });
      throw error;
    }
  }

  async deleteMessage(queueName, receiptHandle) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    const queueUrl = this.queues.get(queueName);
    if (!queueUrl) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    try {
      const deleteParams = {
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle
      };
      
      await this.executeWithRetry(
        () => this.sqs.deleteMessage(deleteParams).promise(),
        'deleteMessage'
      );
      
      this.metrics.messagesDeleted++;
      
      this.logger.debug('Message deleted successfully', {
        queueName,
        receiptHandle
      });
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to delete message', {
        queueName,
        receiptHandle,
        error: error.message
      });
      throw error;
    }
  }

  async getQueueAttributes(queueName, attributeNames = ['All']) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    const queueUrl = this.queues.get(queueName);
    if (!queueUrl) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    try {
      const params = {
        QueueUrl: queueUrl,
        AttributeNames: attributeNames
      };
      
      const result = await this.executeWithRetry(
        () => this.sqs.getQueueAttributes(params).promise(),
        'getQueueAttributes'
      );
      
      return result.Attributes;
      
    } catch (error) {
      this.logger.error('Failed to get queue attributes', {
        queueName,
        error: error.message
      });
      throw error;
    }
  }

  async executeWithRetry(operation, operationName) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }
        
        // Verificar se é um erro que vale a pena tentar novamente
        if (!this.isRetryableError(error)) {
          break;
        }
        
        this.metrics.retries++;
        
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt),
          this.retryConfig.maxDelay
        );
        
        this.logger.warn('Operation failed, retrying', {
          operationName,
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries,
          delay,
          error: error.message
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    // Erros que valem a pena tentar novamente
    const retryableErrors = [
      'NetworkingError',
      'TimeoutError',
      'ThrottlingException',
      'ServiceUnavailable',
      'InternalError'
    ];
    
    return retryableErrors.some(retryableError => 
      error.code === retryableError || error.message.includes(retryableError)
    );
  }

  async purgeQueue(queueName) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    const queueUrl = this.queues.get(queueName);
    if (!queueUrl) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    try {
      await this.sqs.purgeQueue({ QueueUrl: queueUrl }).promise();
      
      this.logger.info('Queue purged successfully', {
        queueName
      });
      
    } catch (error) {
      this.logger.error('Failed to purge queue', {
        queueName,
        error: error.message
      });
      throw error;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      queues: Array.from(this.queues.keys()),
      isInitialized: this.isInitialized
    };
  }

  async getQueueStats() {
    const stats = {};
    
    for (const [queueName, queueUrl] of this.queues.entries()) {
      try {
        const attributes = await this.getQueueAttributes(queueName, [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed'
        ]);
        
        stats[queueName] = {
          messagesAvailable: parseInt(attributes.ApproximateNumberOfMessages || '0'),
          messagesInFlight: parseInt(attributes.ApproximateNumberOfMessagesNotVisible || '0'),
          messagesDelayed: parseInt(attributes.ApproximateNumberOfMessagesDelayed || '0')
        };
        
      } catch (error) {
        this.logger.warn('Failed to get queue stats', {
          queueName,
          error: error.message
        });
        
        stats[queueName] = {
          error: error.message
        };
      }
    }
    
    return stats;
  }

  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return {
          status: 'unhealthy',
          reason: 'Service not initialized'
        };
      }
      
      // Testar conectividade básica
      await this.testConnection();
      
      // Verificar se as filas estão acessíveis
      const queueStats = await this.getQueueStats();
      const unhealthyQueues = Object.entries(queueStats)
        .filter(([_, stats]) => stats.error)
        .map(([queueName, _]) => queueName);
      
      if (unhealthyQueues.length > 0) {
        return {
          status: 'degraded',
          reason: `Some queues are unhealthy: ${unhealthyQueues.join(', ')}`,
          unhealthyQueues
        };
      }
      
      return {
        status: 'healthy',
        metrics: this.getMetrics(),
        queueStats
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        reason: error.message,
        error: error.message
      };
    }
  }

  startPolling(queueName, messageHandler, options = {}) {
    if (this.pollingIntervals.has(queueName)) {
      this.logger.warn(`Polling already active for queue ${queueName}`);
      return;
    }
    
    this.messageHandlers.set(queueName, messageHandler);
    
    const pollInterval = options.pollInterval || 5000; // 5 segundos
    const maxMessages = options.maxMessages || 10;
    
    this.logger.info(`Starting polling for queue ${queueName}`);
    
    const poll = async () => {
      try {
        const messages = await this.receiveMessages(queueName, {
          maxMessages,
          waitTimeSeconds: 20
        });
        
        for (const message of messages) {
          try {
            // Processar mensagem
            await messageHandler(message);
            
            // Deletar mensagem após processamento bem-sucedido
            await this.deleteMessage(queueName, message.receiptHandle);
            
            this.logger.debug(`Message processed and deleted: ${message.messageId}`);
            
          } catch (error) {
            this.logger.error(`Error processing message ${message.messageId}:`, error);
            // Mensagem não será deletada e retornará à fila
          }
        }
        
      } catch (error) {
        this.logger.error(`Error during polling of ${queueName}:`, error);
      }
      
      // Agendar próximo poll
      if (this.pollingIntervals.has(queueName)) {
        const timeoutId = setTimeout(poll, pollInterval);
        this.pollingIntervals.set(queueName, timeoutId);
      }
    };
    
    // Iniciar primeiro poll
    const timeoutId = setTimeout(poll, 1000);
    this.pollingIntervals.set(queueName, timeoutId);
  }

  async shutdown() {
    this.logger.info('Shutting down SQS Service');
    
    // Parar todos os pollings
    for (const [queueName, intervalId] of this.pollingIntervals.entries()) {
      clearTimeout(intervalId);
      this.logger.debug(`Stopped polling for queue ${queueName}`);
    }
    this.pollingIntervals.clear();
    this.messageHandlers.clear();
    
    // Não há recursos específicos para limpar no AWS SDK
    // Apenas marcar como não inicializado
    this.isInitialized = false;
    
    this.logger.info('SQS Service shutdown completed');
  }
}

module.exports = SQSService;