/**
 * Fallback Service - Serviço principal de estratégias de fallback
 * Coordena circuit breaker, retry, degradação graceful e outras estratégias
 */

const AWS = require('aws-sdk');
const EventEmitter = require('events');
const crypto = require('crypto');
const moment = require('moment');

class FallbackService extends EventEmitter {
  constructor(config, logger, metrics, services) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.services = services; // { circuitBreaker, retry, degradation }
    
    this.sqs = null;
    this.isRunning = false;
    this.pollingInterval = null;
    this.messageQueue = [];
    this.processingQueue = new Map();
    
    // Cache para decisões de fallback
    this.fallbackCache = new Map();
    this.cacheCleanupInterval = null;
    
    // Estatísticas
    this.stats = {
      messagesProcessed: 0,
      fallbacksExecuted: 0,
      errorsHandled: 0,
      lastProcessedAt: null,
      startedAt: new Date()
    };
  }
  
  async initialize() {
    try {
      this.logger.info('Inicializando Fallback Service...');
      
      // Configurar AWS SQS
      this.sqs = new AWS.SQS({
        region: this.config.aws.region,
        accessKeyId: this.config.aws.accessKeyId,
        secretAccessKey: this.config.aws.secretAccessKey,
        endpoint: this.config.aws.endpoint
      });
      
      // Testar conexão SQS
      await this.testSQSConnection();
      
      // Iniciar polling de mensagens
      this.startPolling();
      
      // Iniciar limpeza do cache
      this.startCacheCleanup();
      
      this.isRunning = true;
      this.logger.info('Fallback Service inicializado com sucesso');
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Fallback Service:', error);
      throw error;
    }
  }
  
  async testSQSConnection() {
    try {
      await this.sqs.getQueueAttributes({
        QueueUrl: this.config.aws.queues.fallback,
        AttributeNames: ['All']
      }).promise();
      
      this.logger.info('Conexão SQS estabelecida com sucesso');
    } catch (error) {
      this.logger.error('Erro ao conectar com SQS:', error);
      throw new Error(`Falha na conexão SQS: ${error.message}`);
    }
  }
  
  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollMessages();
      } catch (error) {
        this.logger.error('Erro no polling de mensagens:', error);
        this.metrics.errorCount.inc({ type: 'polling', operation: 'sqs' });
      }
    }, this.config.aws.polling.interval);
    
    this.logger.info('Polling de mensagens SQS iniciado');
  }
  
  async pollMessages() {
    try {
      const params = {
        QueueUrl: this.config.aws.queues.fallback,
        MaxNumberOfMessages: this.config.aws.polling.maxMessages,
        WaitTimeSeconds: this.config.aws.polling.waitTime,
        VisibilityTimeout: this.config.aws.polling.visibilityTimeout
      };
      
      const result = await this.sqs.receiveMessage(params).promise();
      
      if (result.Messages && result.Messages.length > 0) {
        this.logger.debug(`Recebidas ${result.Messages.length} mensagens`);
        
        for (const message of result.Messages) {
          await this.processMessage(message);
        }
      }
    } catch (error) {
      this.logger.error('Erro ao fazer polling de mensagens:', error);
      throw error;
    }
  }
  
  async processMessage(message) {
    const startTime = Date.now();
    let messageData = null;
    
    try {
      // Parse da mensagem
      messageData = JSON.parse(message.Body);
      
      this.logger.info('Processando mensagem de fallback:', {
        messageId: message.MessageId,
        operation: messageData.operation,
        strategy: messageData.strategy
      });
      
      // Validar mensagem
      this.validateMessage(messageData);
      
      // Executar estratégia de fallback
      const result = await this.executeFallback(
        messageData.strategy,
        messageData.operation,
        messageData.data,
        messageData.context
      );
      
      // Deletar mensagem da fila
      await this.deleteMessage(message);
      
      // Atualizar estatísticas
      this.stats.messagesProcessed++;
      this.stats.lastProcessedAt = new Date();
      
      // Métricas
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.operationDuration.observe(
        { strategy: messageData.strategy, agent: 'fallback' },
        duration
      );
      
      this.metrics.fallbackOperations.inc({
        strategy: messageData.strategy,
        status: 'success',
        agent: 'fallback'
      });
      
      this.logger.info('Mensagem processada com sucesso:', {
        messageId: message.MessageId,
        duration,
        result: result ? 'success' : 'failed'
      });
      
    } catch (error) {
      this.logger.error('Erro ao processar mensagem:', {
        messageId: message.MessageId,
        error: error.message,
        messageData
      });
      
      this.stats.errorsHandled++;
      
      this.metrics.fallbackOperations.inc({
        strategy: messageData?.strategy || 'unknown',
        status: 'error',
        agent: 'fallback'
      });
      
      // Enviar para DLQ se necessário
      await this.handleFailedMessage(message, error);
    }
  }
  
  validateMessage(messageData) {
    const required = ['strategy', 'operation', 'data'];
    
    for (const field of required) {
      if (!messageData[field]) {
        throw new Error(`Campo obrigatório ausente: ${field}`);
      }
    }
    
    const validStrategies = ['circuit_breaker', 'retry', 'degradation', 'timeout', 'bulkhead'];
    if (!validStrategies.includes(messageData.strategy)) {
      throw new Error(`Estratégia inválida: ${messageData.strategy}`);
    }
  }
  
  async executeFallback(strategy, operation, data, context = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Executando fallback: ${strategy} para operação: ${operation}`);
      
      let result = null;
      
      switch (strategy) {
        case 'circuit_breaker':
          result = await this.executeCircuitBreaker(operation, data, context);
          break;
          
        case 'retry':
          result = await this.executeRetry(operation, data, context);
          break;
          
        case 'degradation':
          result = await this.executeDegradation(operation, data, context);
          break;
          
        case 'timeout':
          result = await this.executeTimeout(operation, data, context);
          break;
          
        case 'bulkhead':
          result = await this.executeBulkhead(operation, data, context);
          break;
          
        default:
          throw new Error(`Estratégia não implementada: ${strategy}`);
      }
      
      this.stats.fallbacksExecuted++;
      
      const duration = (Date.now() - startTime) / 1000;
      this.logger.info(`Fallback executado com sucesso: ${strategy}`, {
        operation,
        duration,
        result: result ? 'success' : 'failed'
      });
      
      return result;
      
    } catch (error) {
      this.logger.error(`Erro na execução de fallback: ${strategy}`, {
        operation,
        error: error.message
      });
      
      this.metrics.errorCount.inc({ type: 'fallback_execution', operation: strategy });
      throw error;
    }
  }
  
  async executeCircuitBreaker(operation, data, context) {
    const service = context.service || 'default';
    
    // Verificar estado do circuit breaker
    const state = this.services.circuitBreaker.getState(service);
    
    if (state === 'open') {
      this.logger.warn(`Circuit breaker aberto para serviço: ${service}`);
      
      // Executar fallback alternativo
      return await this.executeAlternativeFallback(operation, data, context);
    }
    
    try {
      // Tentar executar operação
      const result = await this.executeOperation(operation, data, context);
      
      // Registrar sucesso no circuit breaker
      this.services.circuitBreaker.recordSuccess(service);
      
      return result;
      
    } catch (error) {
      // Registrar falha no circuit breaker
      this.services.circuitBreaker.recordFailure(service);
      
      // Executar fallback alternativo
      return await this.executeAlternativeFallback(operation, data, context);
    }
  }
  
  async executeRetry(operation, data, context) {
    const retryConfig = {
      maxAttempts: context.maxAttempts || this.config.fallback.retry.maxAttempts,
      baseDelay: context.baseDelay || this.config.fallback.retry.baseDelay,
      maxDelay: context.maxDelay || this.config.fallback.retry.maxDelay,
      backoffMultiplier: context.backoffMultiplier || this.config.fallback.retry.backoffMultiplier
    };
    
    return await this.services.retry.execute(
      () => this.executeOperation(operation, data, context),
      retryConfig
    );
  }
  
  async executeDegradation(operation, data, context) {
    const currentLevel = this.services.degradation.getCurrentLevel();
    
    this.logger.info(`Executando degradação graceful: ${currentLevel}`);
    
    switch (currentLevel) {
      case 'minimal':
        return await this.executeMinimalOperation(operation, data, context);
        
      case 'reduced':
        return await this.executeReducedOperation(operation, data, context);
        
      case 'normal':
      default:
        return await this.executeOperation(operation, data, context);
    }
  }
  
  async executeTimeout(operation, data, context) {
    const timeout = context.timeout || this.config.fallback.timeout.default;
    
    return await Promise.race([
      this.executeOperation(operation, data, context),
      this.createTimeoutPromise(timeout)
    ]);
  }
  
  async executeBulkhead(operation, data, context) {
    const pool = context.pool || 'default';
    
    // Verificar se há recursos disponíveis no pool
    if (!this.services.circuitBreaker.hasAvailableResources(pool)) {
      throw new Error(`Pool de recursos esgotado: ${pool}`);
    }
    
    try {
      // Reservar recurso
      this.services.circuitBreaker.reserveResource(pool);
      
      // Executar operação
      const result = await this.executeOperation(operation, data, context);
      
      return result;
      
    } finally {
      // Liberar recurso
      this.services.circuitBreaker.releaseResource(pool);
    }
  }
  
  async executeOperation(operation, data, context) {
    // Simular execução da operação original
    // Em um cenário real, isso faria a chamada para o serviço/agente original
    
    this.logger.debug(`Executando operação: ${operation}`, { data, context });
    
    // Simular delay
    await this.sleep(100);
    
    // Simular falha ocasional para testes
    if (Math.random() < 0.1) {
      throw new Error('Falha simulada na operação');
    }
    
    return {
      success: true,
      operation,
      data,
      timestamp: new Date().toISOString()
    };
  }
  
  async executeAlternativeFallback(operation, data, context) {
    this.logger.info(`Executando fallback alternativo para: ${operation}`);
    
    // Implementar lógica de fallback alternativo
    // Por exemplo: retornar dados em cache, resposta padrão, etc.
    
    return {
      success: true,
      fallback: true,
      operation,
      message: 'Resposta de fallback alternativo',
      timestamp: new Date().toISOString()
    };
  }
  
  async executeMinimalOperation(operation, data, context) {
    this.logger.info(`Executando operação mínima para: ${operation}`);
    
    // Retornar resposta mínima necessária
    return {
      success: true,
      minimal: true,
      operation,
      timestamp: new Date().toISOString()
    };
  }
  
  async executeReducedOperation(operation, data, context) {
    this.logger.info(`Executando operação reduzida para: ${operation}`);
    
    // Retornar resposta com funcionalidade reduzida
    return {
      success: true,
      reduced: true,
      operation,
      data: this.reduceData(data),
      timestamp: new Date().toISOString()
    };
  }
  
  reduceData(data) {
    // Reduzir complexidade dos dados
    if (Array.isArray(data)) {
      return data.slice(0, 10); // Limitar a 10 itens
    }
    
    if (typeof data === 'object' && data !== null) {
      // Manter apenas campos essenciais
      const essential = ['id', 'name', 'status', 'timestamp'];
      const reduced = {};
      
      for (const key of essential) {
        if (data[key] !== undefined) {
          reduced[key] = data[key];
        }
      }
      
      return reduced;
    }
    
    return data;
  }
  
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operação excedeu timeout de ${timeout}ms`));
      }, timeout);
    });
  }
  
  async deleteMessage(message) {
    try {
      await this.sqs.deleteMessage({
        QueueUrl: this.config.aws.queues.fallback,
        ReceiptHandle: message.ReceiptHandle
      }).promise();
      
    } catch (error) {
      this.logger.error('Erro ao deletar mensagem:', error);
      throw error;
    }
  }
  
  async handleFailedMessage(message, error) {
    try {
      // Verificar número de tentativas
      const receiveCount = parseInt(message.Attributes?.ApproximateReceiveCount || '1');
      
      if (receiveCount >= this.config.aws.retry.maxAttempts) {
        // Enviar para DLQ
        await this.sendToDLQ(message, error);
        
        // Deletar da fila principal
        await this.deleteMessage(message);
        
        this.logger.warn('Mensagem enviada para DLQ após múltiplas tentativas:', {
          messageId: message.MessageId,
          receiveCount,
          error: error.message
        });
      }
      
    } catch (dlqError) {
      this.logger.error('Erro ao enviar mensagem para DLQ:', dlqError);
    }
  }
  
  async sendToDLQ(message, error) {
    const dlqMessage = {
      originalMessage: JSON.parse(message.Body),
      error: {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      metadata: {
        messageId: message.MessageId,
        receiveCount: message.Attributes?.ApproximateReceiveCount,
        sentTimestamp: message.Attributes?.SentTimestamp
      }
    };
    
    await this.sqs.sendMessage({
      QueueUrl: this.config.aws.queues.dlq,
      MessageBody: JSON.stringify(dlqMessage)
    }).promise();
  }
  
  startCacheCleanup() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupCache();
    }, this.config.cache.cleanupInterval);
  }
  
  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.fallbackCache.entries()) {
      if (now - entry.timestamp > this.config.cache.ttl) {
        this.fallbackCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cache limpo: ${cleaned} entradas removidas`);
    }
  }
  
  getCachedDecision(key) {
    const entry = this.fallbackCache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() - entry.timestamp > this.config.cache.ttl) {
      this.fallbackCache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  setCachedDecision(key, data) {
    this.fallbackCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  isHealthy() {
    return this.isRunning && this.sqs !== null;
  }
  
  getStatus() {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      stats: { ...this.stats },
      cache: {
        size: this.fallbackCache.size,
        maxSize: this.config.cache.maxSize
      },
      queue: {
        processing: this.processingQueue.size,
        pending: this.messageQueue.length
      },
      uptime: Date.now() - this.stats.startedAt.getTime()
    };
  }
  
  async stop() {
    this.logger.info('Parando Fallback Service...');
    
    this.isRunning = false;
    
    // Parar polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Parar limpeza do cache
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    
    // Aguardar processamento das mensagens em andamento
    const timeout = 30000; // 30 segundos
    const start = Date.now();
    
    while (this.processingQueue.size > 0 && (Date.now() - start) < timeout) {
      await this.sleep(100);
    }
    
    this.logger.info('Fallback Service parado');
  }
}

module.exports = FallbackService;