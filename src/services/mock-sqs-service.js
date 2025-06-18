/**
 * Mock SQS Service - Simulação para Desenvolvimento Local
 * Fase 1-2: Mock para operações SQS sem dependência da AWS
 * 
 * Responsabilidades:
 * - Simular envio de mensagens para filas SQS
 * - Simular recebimento de mensagens de filas SQS
 * - Gerenciar filas em memória
 * - Implementar comportamento similar ao SQS real
 */

const EventEmitter = require('events');
const Logger = require('../utils/logger');

class MockSQSService extends EventEmitter {
  constructor(agentId = 'mock-sqs-service') {
    super();
    this.agentId = agentId;
    this.logger = new Logger(`mock-sqs-service-${agentId}`);
    this.queues = new Map(); // Simula filas em memória
    this.isInitialized = false;
    this.pollingIntervals = new Map();
    this.messageHandlers = new Map();
    this.messageIdCounter = 0;
  }
  
  /**
   * Inicializar o serviço SQS Mock
   */
  async initialize() {
    try {
      this.logger.info('Initializing Mock SQS Service...');
      
      // Simular inicialização
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.isInitialized = true;
      this.logger.info('Mock SQS Service initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Mock SQS Service:', error);
      throw error;
    }
  }
  
  /**
   * Obter URL da fila (simulado)
   */
  async getQueueUrl(queueName) {
    if (!this.isInitialized) {
      throw new Error('SQS Service not initialized');
    }
    
    // Simular URL da fila
    const mockUrl = `https://sqs.mock.amazonaws.com/123456789012/${queueName}`;
    
    // Criar fila se não existir
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
      this.logger.info(`Created mock queue: ${queueName}`);
    }
    
    return mockUrl;
  }
  
  /**
   * Enviar mensagem para fila
   */
  async sendMessage(queueName, messageBody, messageAttributes = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('SQS Service not initialized');
      }
      
      const queueUrl = await this.getQueueUrl(queueName);
      
      // Criar mensagem mock
      const message = {
        MessageId: `mock-msg-${++this.messageIdCounter}`,
        Body: typeof messageBody === 'string' ? messageBody : JSON.stringify(messageBody),
        Attributes: messageAttributes,
        ReceiptHandle: `mock-receipt-${this.messageIdCounter}`,
        Timestamp: new Date().toISOString()
      };
      
      // Adicionar à fila em memória
      const queue = this.queues.get(queueName);
      queue.push(message);
      
      this.logger.info(`Message sent to queue ${queueName}:`, {
        messageId: message.MessageId,
        queueSize: queue.length
      });
      
      return {
        MessageId: message.MessageId,
        MD5OfBody: 'mock-md5-hash',
        MD5OfMessageAttributes: 'mock-md5-attributes'
      };
      
    } catch (error) {
      this.logger.error(`Failed to send message to queue ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Receber mensagens da fila
   */
  async receiveMessages(queueName, maxMessages = 1, waitTimeSeconds = 0) {
    try {
      if (!this.isInitialized) {
        throw new Error('SQS Service not initialized');
      }
      
      const queueUrl = await this.getQueueUrl(queueName);
      const queue = this.queues.get(queueName);
      
      if (!queue || queue.length === 0) {
        return [];
      }
      
      // Simular wait time
      if (waitTimeSeconds > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTimeSeconds * 1000));
      }
      
      // Retornar mensagens (máximo especificado)
      const messages = queue.splice(0, Math.min(maxMessages, queue.length));
      
      this.logger.info(`Received ${messages.length} messages from queue ${queueName}`);
      
      return messages;
      
    } catch (error) {
      this.logger.error(`Failed to receive messages from queue ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Deletar mensagem da fila
   */
  async deleteMessage(queueName, receiptHandle) {
    try {
      if (!this.isInitialized) {
        throw new Error('SQS Service not initialized');
      }
      
      // Em um mock, a mensagem já foi removida no receiveMessages
      // Apenas simular sucesso
      this.logger.info(`Message deleted from queue ${queueName}:`, { receiptHandle });
      
      return true;
      
    } catch (error) {
      this.logger.error(`Failed to delete message from queue ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Iniciar polling de uma fila
   */
  async startPolling(queueName, messageHandler, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('SQS Service not initialized');
      }
      
      const {
        maxMessages = 10,
        waitTimeSeconds = 20,
        pollingInterval = 5000
      } = options;
      
      // Parar polling existente se houver
      await this.stopPolling(queueName);
      
      // Registrar handler
      this.messageHandlers.set(queueName, messageHandler);
      
      // Iniciar polling
      const intervalId = setInterval(async () => {
        try {
          const messages = await this.receiveMessages(queueName, maxMessages, 0);
          
          for (const message of messages) {
            try {
              await messageHandler(message);
              await this.deleteMessage(queueName, message.ReceiptHandle);
            } catch (handlerError) {
              this.logger.error(`Message handler error for queue ${queueName}:`, handlerError);
              // Em um sistema real, a mensagem voltaria para a fila
            }
          }
        } catch (pollingError) {
          this.logger.error(`Polling error for queue ${queueName}:`, pollingError);
        }
      }, pollingInterval);
      
      this.pollingIntervals.set(queueName, intervalId);
      
      this.logger.info(`Started polling queue: ${queueName}`);
      
    } catch (error) {
      this.logger.error(`Failed to start polling queue ${queueName}:`, error);
      throw error;
    }
  }
  
  /**
   * Parar polling de uma fila
   */
  async stopPolling(queueName) {
    const intervalId = this.pollingIntervals.get(queueName);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(queueName);
      this.messageHandlers.delete(queueName);
      this.logger.info(`Stopped polling queue: ${queueName}`);
    }
  }
  
  /**
   * Parar todos os pollings
   */
  async stopAllPolling() {
    const queueNames = Array.from(this.pollingIntervals.keys());
    for (const queueName of queueNames) {
      await this.stopPolling(queueName);
    }
  }
  
  /**
   * Obter estatísticas das filas
   */
  getQueueStats() {
    const stats = {};
    for (const [queueName, queue] of this.queues.entries()) {
      stats[queueName] = {
        messageCount: queue.length,
        isPolling: this.pollingIntervals.has(queueName)
      };
    }
    return stats;
  }
  
  /**
   * Limpar todas as filas
   */
  clearAllQueues() {
    for (const [queueName, queue] of this.queues.entries()) {
      queue.length = 0;
      this.logger.info(`Cleared queue: ${queueName}`);
    }
  }
  
  /**
   * Finalizar serviço
   */
  async shutdown() {
    try {
      this.logger.info('Shutting down Mock SQS Service...');
      
      await this.stopAllPolling();
      this.clearAllQueues();
      
      this.isInitialized = false;
      this.logger.info('Mock SQS Service shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during Mock SQS Service shutdown:', error);
      throw error;
    }
  }
}

module.exports = MockSQSService;