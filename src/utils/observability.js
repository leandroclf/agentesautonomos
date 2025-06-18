/**
 * Módulo de Observabilidade Básica
 * Fase 1 - Monitoramento de Infraestrutura
 * 
 * Fornece monitoramento básico de DLQs, métricas SQS e health checks
 */

const { SQSClient, GetQueueAttributesCommand, ListQueuesCommand } = require('@aws-sdk/client-sqs');
const logger = require('./logger');

class ObservabilityService {
  constructor() {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
      }
    });
    
    this.metrics = {
      dlqMessages: new Map(),
      queueDepth: new Map(),
      messageAge: new Map(),
      lastCheck: null
    };
    
    this.healthStatus = {
      sqs: 'unknown',
      postgres: 'unknown',
      redis: 'unknown',
      localstack: 'unknown'
    };
  }

  /**
   * Monitora todas as DLQs do sistema
   */
  async monitorDLQs() {
    try {
      const dlqQueues = await this.getDLQQueues();
      const dlqMetrics = {};
      
      for (const queueUrl of dlqQueues) {
        const attributes = await this.getQueueAttributes(queueUrl);
        const queueName = this.extractQueueName(queueUrl);
        
        dlqMetrics[queueName] = {
          messagesVisible: parseInt(attributes.ApproximateNumberOfMessages || '0'),
          messagesInFlight: parseInt(attributes.ApproximateNumberOfMessagesNotVisible || '0'),
          oldestMessage: attributes.ApproximateAgeOfOldestMessage || '0',
          lastUpdated: new Date().toISOString()
        };
        
        // Alerta se houver mensagens na DLQ
        if (dlqMetrics[queueName].messagesVisible > 0) {
          logger.warn(`DLQ Alert: ${queueName} tem ${dlqMetrics[queueName].messagesVisible} mensagens`);
        }
      }
      
      this.metrics.dlqMessages = dlqMetrics;
      this.metrics.lastCheck = new Date().toISOString();
      
      return dlqMetrics;
    } catch (error) {
      logger.error('Erro ao monitorar DLQs:', error);
      throw error;
    }
  }

  /**
   * Coleta métricas de todas as filas SQS
   */
  async collectSQSMetrics() {
    try {
      const allQueues = await this.getAllQueues();
      const queueMetrics = {};
      
      for (const queueUrl of allQueues) {
        const attributes = await this.getQueueAttributes(queueUrl);
        const queueName = this.extractQueueName(queueUrl);
        
        queueMetrics[queueName] = {
          messagesVisible: parseInt(attributes.ApproximateNumberOfMessages || '0'),
          messagesInFlight: parseInt(attributes.ApproximateNumberOfMessagesNotVisible || '0'),
          oldestMessageAge: parseInt(attributes.ApproximateAgeOfOldestMessage || '0'),
          createdTimestamp: attributes.CreatedTimestamp,
          lastModifiedTimestamp: attributes.LastModifiedTimestamp
        };
      }
      
      this.metrics.queueDepth = queueMetrics;
      return queueMetrics;
    } catch (error) {
      logger.error('Erro ao coletar métricas SQS:', error);
      throw error;
    }
  }

  /**
   * Executa health check de todos os serviços
   */
  async healthCheck() {
    const health = { ...this.healthStatus };
    
    // Check SQS/LocalStack
    try {
      await this.sqsClient.send(new ListQueuesCommand({}));
      health.sqs = 'healthy';
      health.localstack = 'healthy';
    } catch (error) {
      health.sqs = 'unhealthy';
      health.localstack = 'unhealthy';
      logger.error('SQS/LocalStack health check failed:', error.message);
    }
    
    // Check PostgreSQL (simulado)
    try {
      // Aqui seria uma conexão real com PostgreSQL
      health.postgres = 'healthy';
    } catch (error) {
      health.postgres = 'unhealthy';
    }
    
    // Check Redis (simulado)
    try {
      // Aqui seria uma conexão real com Redis
      health.redis = 'healthy';
    } catch (error) {
      health.redis = 'unhealthy';
    }
    
    this.healthStatus = health;
    return health;
  }

  /**
   * Obtém todas as filas DLQ
   */
  async getDLQQueues() {
    const listCommand = new ListQueuesCommand({
      QueueNamePrefix: '',
      MaxResults: 1000
    });
    
    const response = await this.sqsClient.send(listCommand);
    return (response.QueueUrls || []).filter(url => url.includes('-dlq'));
  }

  /**
   * Obtém todas as filas SQS
   */
  async getAllQueues() {
    const listCommand = new ListQueuesCommand({
      QueueNamePrefix: '',
      MaxResults: 1000
    });
    
    const response = await this.sqsClient.send(listCommand);
    return response.QueueUrls || [];
  }

  /**
   * Obtém atributos de uma fila específica
   */
  async getQueueAttributes(queueUrl) {
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateAgeOfOldestMessage',
        'CreatedTimestamp',
        'LastModifiedTimestamp'
      ]
    });
    
    const response = await this.sqsClient.send(command);
    return response.Attributes || {};
  }

  /**
   * Extrai o nome da fila da URL
   */
  extractQueueName(queueUrl) {
    return queueUrl.split('/').pop();
  }

  /**
   * Inicia monitoramento contínuo
   */
  startMonitoring(intervalMs = 30000) {
    logger.info(`Iniciando monitoramento contínuo (intervalo: ${intervalMs}ms)`);
    
    setInterval(async () => {
      try {
        await this.monitorDLQs();
        await this.collectSQSMetrics();
        await this.healthCheck();
        
        logger.debug('Ciclo de monitoramento concluído', {
          timestamp: new Date().toISOString(),
          dlqCount: Object.keys(this.metrics.dlqMessages).length,
          queueCount: Object.keys(this.metrics.queueDepth).length
        });
      } catch (error) {
        logger.error('Erro no ciclo de monitoramento:', error);
      }
    }, intervalMs);
  }

  /**
   * Obtém métricas atuais
   */
  getMetrics() {
    return {
      ...this.metrics,
      health: this.healthStatus
    };
  }

  /**
   * Obtém status de saúde
   */
  getHealthStatus() {
    return this.healthStatus;
  }
}

module.exports = ObservabilityService;