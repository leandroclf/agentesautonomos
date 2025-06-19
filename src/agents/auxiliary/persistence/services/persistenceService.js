/**
 * Persistence Service - Serviço Principal de Persistência
 * Coordena operações de persistência, cache, backup e replicação
 */

const AWS = require('aws-sdk');
const EventEmitter = require('events');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

class PersistenceService extends EventEmitter {
  constructor(config, logger, metrics, databaseService, cacheService, backupService) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.databaseService = databaseService;
    this.cacheService = cacheService;
    this.backupService = backupService;
    this.sqs = null;
    this.isProcessing = false;
    this.processingQueue = [];
    this.replicationQueue = [];
    this.transformationRules = new Map();
    this.validationSchemas = new Map();
  }

  /**
   * Inicializa o serviço de persistência
   */
  async initialize() {
    try {
      this.logger.info('Inicializando Persistence Service...');

      // Configurar AWS SQS
      await this.setupSQS();

      // Configurar regras de transformação
      this.setupTransformationRules();

      // Configurar esquemas de validação
      this.setupValidationSchemas();

      // Iniciar processamento de filas
      this.startQueueProcessing();

      // Iniciar replicação se habilitada
      if (this.config.persistence.replication.enabled) {
        this.startReplication();
      }

      this.logger.info('Persistence Service inicializado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar Persistence Service:', error);
      throw error;
    }
  }

  /**
   * Configura o cliente SQS
   */
  async setupSQS() {
    try {
      this.sqs = new AWS.SQS({
        region: this.config.sqs.region,
        accessKeyId: this.config.sqs.accessKeyId,
        secretAccessKey: this.config.sqs.secretAccessKey,
        endpoint: this.config.sqs.endpoint
      });

      // Testar conexão
      await this.sqs.listQueues().promise();
      this.logger.info('Conexão SQS estabelecida com sucesso');
    } catch (error) {
      this.logger.error('Erro ao configurar SQS:', error);
      throw error;
    }
  }

  /**
   * Configura regras de transformação
   */
  setupTransformationRules() {
    if (!this.config.transformation.enabled) {
      return;
    }

    // Regra para adicionar metadados
    this.transformationRules.set('addMetadata', (data) => {
      if (this.config.transformation.addMetadata) {
        data._metadata = {
          createdAt: new Date().toISOString(),
          version: '1.0',
          source: 'persistence-agent',
          id: this.generateId()
        };
      }
      return data;
    });

    // Regra para normalizar timestamp
    this.transformationRules.set('normalizeTimestamp', (data) => {
      if (this.config.transformation.normalizeTimestamp && data.timestamp) {
        data.timestamp = new Date(data.timestamp).toISOString();
      }
      return data;
    });

    // Regra para gerar ID
    this.transformationRules.set('generateId', (data) => {
      if (this.config.transformation.generateId && !data.id) {
        data.id = this.generateId();
      }
      return data;
    });

    // Regra para criptografar dados sensíveis
    this.transformationRules.set('encryptSensitive', (data) => {
      if (this.config.transformation.encryptSensitiveData) {
        const sensitiveFields = ['password', 'token', 'secret', 'key'];
        sensitiveFields.forEach(field => {
          if (data[field]) {
            data[field] = this.encrypt(data[field]);
          }
        });
      }
      return data;
    });

    this.logger.info('Regras de transformação configuradas');
  }

  /**
   * Configura esquemas de validação
   */
  setupValidationSchemas() {
    // Esquema básico para eventos
    this.validationSchemas.set('event', {
      required: ['type', 'data'],
      properties: {
        type: { type: 'string', minLength: 1 },
        data: { type: 'object' },
        timestamp: { type: 'string' },
        source: { type: 'string' }
      }
    });

    // Esquema para documentos
    this.validationSchemas.set('document', {
      required: ['id', 'content'],
      properties: {
        id: { type: 'string', minLength: 1 },
        content: { type: 'object' },
        metadata: { type: 'object' }
      }
    });

    this.logger.info('Esquemas de validação configurados');
  }

  /**
   * Inicia o processamento de filas SQS
   */
  startQueueProcessing() {
    this.isProcessing = true;
    this.processQueue();
    this.logger.info('Processamento de filas iniciado');
  }

  /**
   * Processa mensagens da fila SQS
   */
  async processQueue() {
    while (this.isProcessing) {
      try {
        const params = {
          QueueUrl: this.config.sqs.queues.input,
          MaxNumberOfMessages: this.config.sqs.polling.maxMessages,
          WaitTimeSeconds: this.config.sqs.polling.waitTimeSeconds,
          VisibilityTimeout: this.config.sqs.polling.visibilityTimeout
        };

        const result = await this.sqs.receiveMessage(params).promise();

        if (result.Messages && result.Messages.length > 0) {
          await this.processMessages(result.Messages);
        }

        // Pequena pausa para evitar polling excessivo
        await this.sleep(this.config.sqs.polling.pollingInterval);
      } catch (error) {
        this.logger.error('Erro no processamento da fila:', error);
        this.metrics.errorCount.inc({ type: 'queue_processing', operation: 'receive_message' });
        await this.sleep(5000); // Pausa maior em caso de erro
      }
    }
  }

  /**
   * Processa um lote de mensagens
   */
  async processMessages(messages) {
    const promises = messages.map(message => this.processMessage(message));
    await Promise.allSettled(promises);
  }

  /**
   * Processa uma mensagem individual
   */
  async processMessage(message) {
    const startTime = Date.now();
    let messageData = null;

    try {
      // Parse da mensagem
      messageData = JSON.parse(message.Body);
      this.logger.debug('Processando mensagem:', { messageId: message.MessageId, data: messageData });

      // Validar mensagem
      if (this.config.validation.strictMode) {
        await this.validateMessage(messageData);
      }

      // Transformar dados
      if (this.config.transformation.enabled) {
        messageData = await this.transformData(messageData);
      }

      // Persistir dados
      await this.persistData(messageData);

      // Deletar mensagem da fila após processamento bem-sucedido
      await this.deleteMessage(message);

      // Métricas de sucesso
      const duration = Date.now() - startTime;
      this.metrics.documentsStored.inc({ type: messageData.type || 'unknown', collection: messageData.collection || 'default' });
      this.logger.info('Mensagem processada com sucesso', {
        messageId: message.MessageId,
        duration,
        type: messageData.type
      });

    } catch (error) {
      this.logger.error('Erro ao processar mensagem:', {
        messageId: message.MessageId,
        error: error.message,
        data: messageData
      });

      this.metrics.errorCount.inc({ type: 'message_processing', operation: 'persist_data' });

      // Enviar para DLQ se necessário
      await this.handleFailedMessage(message, error);
    }
  }

  /**
   * Valida uma mensagem
   */
  async validateMessage(data) {
    const schema = this.validationSchemas.get(data.type || 'event');
    if (!schema) {
      throw new Error(`Schema não encontrado para tipo: ${data.type}`);
    }

    // Validação básica de campos obrigatórios
    if (schema.required) {
      for (const field of schema.required) {
        if (!data[field]) {
          throw new Error(`Campo obrigatório ausente: ${field}`);
        }
      }
    }

    // Validação de tamanho
    const dataSize = JSON.stringify(data).length;
    if (dataSize > this.config.validation.maxDocumentSize) {
      throw new Error(`Documento muito grande: ${dataSize} bytes`);
    }

    return true;
  }

  /**
   * Transforma dados aplicando regras configuradas
   */
  async transformData(data) {
    let transformedData = { ...data };

    for (const [ruleName, ruleFunction] of this.transformationRules) {
      try {
        transformedData = ruleFunction(transformedData);
      } catch (error) {
        this.logger.warn(`Erro na regra de transformação ${ruleName}:`, error);
      }
    }

    // Compressão se habilitada
    if (this.config.transformation.compression.enabled) {
      transformedData = await this.compressData(transformedData);
    }

    return transformedData;
  }

  /**
   * Persiste dados no banco e cache
   */
  async persistData(data) {
    const operations = [];

    // Persistir no banco de dados
    operations.push(this.databaseService.store(data));

    // Persistir no cache se habilitado
    if (this.config.persistence.cache.enabled) {
      operations.push(this.cacheService.set(data.id || this.generateId(), data));
    }

    // Executar operações em paralelo
    await Promise.all(operations);

    // Agendar backup se habilitado
    if (this.config.persistence.backup.enabled) {
      this.backupService.scheduleBackup(data);
    }

    // Agendar replicação se habilitada
    if (this.config.persistence.replication.enabled) {
      this.scheduleReplication(data);
    }
  }

  /**
   * Recupera dados por ID
   */
  async retrieveData(id, options = {}) {
    const startTime = Date.now();
    let data = null;

    try {
      // Tentar cache primeiro
      if (this.config.persistence.cache.enabled && !options.skipCache) {
        data = await this.cacheService.get(id);
        if (data) {
          this.metrics.cacheHits.inc();
          this.logger.debug('Dados recuperados do cache:', { id });
          return data;
        }
        this.metrics.cacheMisses.inc();
      }

      // Buscar no banco de dados
      data = await this.databaseService.retrieve(id, options);
      if (data) {
        // Atualizar cache
        if (this.config.persistence.cache.enabled) {
          await this.cacheService.set(id, data);
        }

        this.metrics.documentsRetrieved.inc({ type: data.type || 'unknown', collection: data.collection || 'default' });
        this.logger.debug('Dados recuperados do banco:', { id, duration: Date.now() - startTime });
      }

      return data;
    } catch (error) {
      this.logger.error('Erro ao recuperar dados:', { id, error: error.message });
      this.metrics.errorCount.inc({ type: 'data_retrieval', operation: 'retrieve' });
      throw error;
    }
  }

  /**
   * Busca dados com filtros
   */
  async searchData(filters, options = {}) {
    try {
      const results = await this.databaseService.search(filters, options);
      this.metrics.documentsRetrieved.inc({ type: 'search', collection: options.collection || 'default' }, results.length);
      return results;
    } catch (error) {
      this.logger.error('Erro na busca de dados:', { filters, error: error.message });
      this.metrics.errorCount.inc({ type: 'data_search', operation: 'search' });
      throw error;
    }
  }

  /**
   * Atualiza dados existentes
   */
  async updateData(id, updates, options = {}) {
    try {
      // Atualizar no banco
      const result = await this.databaseService.update(id, updates, options);

      // Invalidar cache
      if (this.config.persistence.cache.enabled) {
        await this.cacheService.delete(id);
      }

      // Agendar backup da atualização
      if (this.config.persistence.backup.enabled) {
        this.backupService.scheduleBackup({ id, updates, operation: 'update' });
      }

      this.logger.debug('Dados atualizados:', { id, updates });
      return result;
    } catch (error) {
      this.logger.error('Erro ao atualizar dados:', { id, updates, error: error.message });
      this.metrics.errorCount.inc({ type: 'data_update', operation: 'update' });
      throw error;
    }
  }

  /**
   * Remove dados
   */
  async deleteData(id, options = {}) {
    try {
      // Remover do banco
      const result = await this.databaseService.delete(id, options);

      // Remover do cache
      if (this.config.persistence.cache.enabled) {
        await this.cacheService.delete(id);
      }

      // Agendar backup da remoção
      if (this.config.persistence.backup.enabled) {
        this.backupService.scheduleBackup({ id, operation: 'delete' });
      }

      this.logger.debug('Dados removidos:', { id });
      return result;
    } catch (error) {
      this.logger.error('Erro ao remover dados:', { id, error: error.message });
      this.metrics.errorCount.inc({ type: 'data_deletion', operation: 'delete' });
      throw error;
    }
  }

  /**
   * Agenda replicação de dados
   */
  scheduleReplication(data) {
    this.replicationQueue.push({
      data,
      timestamp: Date.now(),
      retries: 0
    });
  }

  /**
   * Inicia processo de replicação
   */
  startReplication() {
    setInterval(async () => {
      if (this.replicationQueue.length > 0) {
        await this.processReplicationQueue();
      }
    }, this.config.persistence.replication.syncInterval);

    this.logger.info('Replicação iniciada');
  }

  /**
   * Processa fila de replicação
   */
  async processReplicationQueue() {
    const batch = this.replicationQueue.splice(0, 10); // Processar em lotes

    for (const item of batch) {
      try {
        await this.replicateData(item.data);
      } catch (error) {
        this.logger.error('Erro na replicação:', error);
        
        // Recolocar na fila se não excedeu tentativas
        if (item.retries < 3) {
          item.retries++;
          this.replicationQueue.push(item);
        }
      }
    }
  }

  /**
   * Replica dados para réplicas configuradas
   */
  async replicateData(data) {
    // Implementação específica de replicação
    // Pode ser para outros bancos, regiões, etc.
    this.logger.debug('Replicando dados:', { id: data.id });
  }

  /**
   * Trata mensagens que falharam no processamento
   */
  async handleFailedMessage(message, error) {
    try {
      // Enviar para DLQ
      if (this.config.sqs.queues.dlq) {
        await this.sqs.sendMessage({
          QueueUrl: this.config.sqs.queues.dlq,
          MessageBody: message.Body,
          MessageAttributes: {
            ErrorMessage: {
              StringValue: error.message,
              DataType: 'String'
            },
            OriginalMessageId: {
              StringValue: message.MessageId,
              DataType: 'String'
            },
            FailureTimestamp: {
              StringValue: new Date().toISOString(),
              DataType: 'String'
            }
          }
        }).promise();
      }

      // Deletar mensagem original
      await this.deleteMessage(message);
    } catch (dlqError) {
      this.logger.error('Erro ao enviar mensagem para DLQ:', dlqError);
    }
  }

  /**
   * Deleta mensagem da fila
   */
  async deleteMessage(message) {
    try {
      await this.sqs.deleteMessage({
        QueueUrl: this.config.sqs.queues.input,
        ReceiptHandle: message.ReceiptHandle
      }).promise();
    } catch (error) {
      this.logger.error('Erro ao deletar mensagem:', error);
    }
  }

  /**
   * Comprime dados
   */
  async compressData(data) {
    if (!this.config.transformation.compression.enabled) {
      return data;
    }

    try {
      const jsonString = JSON.stringify(data);
      const compressed = await promisify(zlib.gzip)(jsonString, {
        level: this.config.transformation.compression.level
      });

      return {
        ...data,
        _compressed: true,
        _originalSize: jsonString.length,
        _compressedSize: compressed.length,
        _data: compressed.toString('base64')
      };
    } catch (error) {
      this.logger.warn('Erro na compressão, mantendo dados originais:', error);
      return data;
    }
  }

  /**
   * Criptografa dados sensíveis
   */
  encrypt(data) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.config.security.encryptionKey || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, key);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Gera ID único
   */
  generateId() {
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Função de sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Para o serviço
   */
  async stop() {
    this.logger.info('Parando Persistence Service...');
    this.isProcessing = false;
    
    // Aguardar processamento de mensagens pendentes
    await this.sleep(2000);
    
    this.logger.info('Persistence Service parado');
  }

  /**
   * Retorna status do serviço
   */
  getStatus() {
    return {
      status: this.isProcessing ? 'running' : 'stopped',
      queueSize: this.processingQueue.length,
      replicationQueueSize: this.replicationQueue.length,
      transformationRules: this.transformationRules.size,
      validationSchemas: this.validationSchemas.size
    };
  }
}

module.exports = PersistenceService;