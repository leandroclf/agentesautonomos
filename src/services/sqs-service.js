/**
 * SQS Service - Serviço de Comunicação via Amazon SQS
 * Fase 1-2: Abstração para operações SQS
 * 
 * Responsabilidades:
 * - Enviar mensagens para filas SQS
 * - Receber mensagens de filas SQS
 * - Gerenciar conexões e configurações
 * - Implementar retry e error handling
 */

const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueUrlCommand } = require('@aws-sdk/client-sqs');
const config = require('@config');
const Logger = require('../utils/logger');

class SQSService {
  constructor(agentId = 'sqs-service') {
    this.agentId = agentId;
    this.logger = new Logger(`sqs-service-${agentId}`);
    this.client = null;
    this.queueUrls = new Map();
    this.isInitialized = false;
    this.pollingIntervals = new Map();
    this.messageHandlers = new Map();
  }
  
  /**
   * Inicializar o serviço SQS
   */
  async initialize() {
    try {
      this.logger.info('Initializing SQS Service...');
      
      // Configurar cliente SQS
      this.client = new SQSClient({
        region: config.aws.region,
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey
        }
      });
      
      this.isInitialized = true;
      this.logger.info('SQS Service initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize SQS Service:', error);
      throw error;
    }
  }
  
  /**
   * Obter URL de uma fila (com cache)
   */
  async getQueueUrl(queueName) {
    if (this.queueUrls.has(queueName)) {
      return this.queueUrls.get(queueName);
    }
    
    try {
      const command = new GetQueueUrlCommand({ QueueName: queueName });
      const response = await this.client.send(command);
      
      this.queueUrls.set(queueName, response.QueueUrl);
      this.logger.debug(`Queue URL cached: ${queueName} -> ${response.QueueUrl}`);
      
      return response.QueueUrl;
      
    } catch (error) {
      this.logger.error(`Failed to get queue URL for ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Enviar mensagem para uma fila
   */
  async sendMessage(queueName, message, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    try {
      const queueUrl = await this.getQueueUrl(queueName);
      
      // Preparar mensagem
      const messageBody = typeof message === 'string' ? message : JSON.stringify(message);
      
      const params = {
        QueueUrl: queueUrl,
        MessageBody: messageBody,
        ...options
      };
      
      // Adicionar atributos da mensagem se fornecidos
      if (options.messageAttributes) {
        params.MessageAttributes = options.messageAttributes;
      }
      
      // Adicionar delay se fornecido
      if (options.delaySeconds) {
        params.DelaySeconds = options.delaySeconds;
      }
      
      const command = new SendMessageCommand(params);
      const response = await this.client.send(command);
      
      this.logger.debug(`Message sent to ${queueName}:`, {
        messageId: response.MessageId,
        queueUrl
      });
      
      return {
        messageId: response.MessageId,
        md5OfBody: response.MD5OfBody,
        queueUrl
      };
      
    } catch (error) {
      this.logger.error(`Failed to send message to ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Receber mensagens de uma fila
   */
  async receiveMessages(queueName, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    try {
      const queueUrl = await this.getQueueUrl(queueName);
      
      const params = {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: options.maxMessages || 1,
        WaitTimeSeconds: options.waitTimeSeconds || 20, // Long polling
        VisibilityTimeoutSeconds: options.visibilityTimeout || 300,
        MessageAttributeNames: options.messageAttributeNames || ['All']
      };
      
      const command = new ReceiveMessageCommand(params);
      const response = await this.client.send(command);
      
      const messages = response.Messages || [];
      
      this.logger.debug(`Received ${messages.length} messages from ${queueName}`);
      
      // Processar mensagens
      return messages.map(message => ({
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle,
        body: this.parseMessageBody(message.Body),
        attributes: message.Attributes || {},
        messageAttributes: message.MessageAttributes || {},
        md5OfBody: message.MD5OfBody
      }));
      
    } catch (error) {
      this.logger.error(`Failed to receive messages from ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Deletar mensagem da fila (após processamento)
   */
  async deleteMessage(queueName, receiptHandle) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    try {
      const queueUrl = await this.getQueueUrl(queueName);
      
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle
      });
      
      await this.client.send(command);
      
      this.logger.debug(`Message deleted from ${queueName}`);
      
    } catch (error) {
      this.logger.error(`Failed to delete message from ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Iniciar polling contínuo de uma fila
   */
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
  
  /**
   * Parar polling de uma fila
   */
  stopPolling(queueName) {
    if (this.pollingIntervals.has(queueName)) {
      clearTimeout(this.pollingIntervals.get(queueName));
      this.pollingIntervals.delete(queueName);
      this.messageHandlers.delete(queueName);
      
      this.logger.info(`Stopped polling for queue ${queueName}`);
    }
  }
  
  /**
   * Parar todos os pollings
   */
  stopAllPolling() {
    for (const queueName of this.pollingIntervals.keys()) {
      this.stopPolling(queueName);
    }
  }
  
  /**
   * Processar corpo da mensagem
   */
  parseMessageBody(body) {
    try {
      return JSON.parse(body);
    } catch (error) {
      this.logger.warn('Failed to parse message body as JSON, returning as string');
      return body;
    }
  }
  
  /**
   * Obter estatísticas do serviço
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      activePolling: Array.from(this.pollingIntervals.keys()),
      cachedQueues: Array.from(this.queueUrls.keys()),
      messageHandlers: Array.from(this.messageHandlers.keys())
    };
  }
  
  /**
   * Fechar conexões e limpar recursos
   */
  async close() {
    this.logger.info('Closing SQS Service...');
    
    // Parar todos os pollings
    this.stopAllPolling();
    
    // Limpar caches
    this.queueUrls.clear();
    this.messageHandlers.clear();
    
    this.isInitialized = false;
    this.client = null;
    
    this.logger.info('SQS Service closed');
  }
  
  /**
   * Método de conveniência para enviar evento estruturado
   */
  async sendEvent(targetQueue, eventType, payload, source = this.agentId) {
    const event = {
      id: require('uuid').v4(),
      type: eventType,
      source,
      target: targetQueue.replace('-queue', '').replace('-dev', '').replace('-staging', '').replace('-prod', ''),
      payload,
      timestamp: new Date().toISOString(),
      correlationId: payload.correlationId || require('uuid').v4()
    };
    
    return await this.sendMessage(targetQueue, event);
  }
}

module.exports = SQSService;