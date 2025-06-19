/**
 * SQS Service - Integração com Amazon SQS
 * Responsável por comunicação via filas SQS
 */

const AWS = require('aws-sdk')
const { EventEmitter } = require('events')

class SQSService extends EventEmitter {
  constructor({ config, logger }) {
    super()
    this.config = config
    this.logger = logger
    
    this.sqs = null
    this.consumers = new Map()
    this.isInitialized = false
    this.isShuttingDown = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando SQS Service...')
      
      // Configurar AWS SQS
      AWS.config.update({
        region: this.config.aws.region,
        accessKeyId: this.config.aws.accessKeyId,
        secretAccessKey: this.config.aws.secretAccessKey
      })
      
      if (this.config.aws.endpoint) {
        this.sqs = new AWS.SQS({ endpoint: this.config.aws.endpoint })
      } else {
        this.sqs = new AWS.SQS()
      }
      
      // Verificar conectividade
      await this.testConnection()
      
      // Iniciar consumidores
      await this.startConsumers()
      
      this.isInitialized = true
      this.logger.info('SQS Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar SQS Service:', error)
      throw error
    }
  }

  async testConnection() {
    try {
      await this.sqs.listQueues().promise()
      this.logger.info('Conexão com SQS estabelecida')
    } catch (error) {
      this.logger.error('Erro ao conectar com SQS:', error)
      throw error
    }
  }

  async startConsumers() {
    try {
      const queues = [
        { name: 'schemaEvents', url: this.config.aws.queues.schemaEvents },
        { name: 'validationEvents', url: this.config.aws.queues.validationEvents },
        { name: 'migrationEvents', url: this.config.aws.queues.migrationEvents }
      ]
      
      for (const queue of queues) {
        if (queue.url) {
          await this.startConsumer(queue.name, queue.url)
        }
      }
      
      this.logger.info('Consumidores SQS iniciados')
    } catch (error) {
      this.logger.error('Erro ao iniciar consumidores SQS:', error)
      throw error
    }
  }

  async startConsumer(queueName, queueUrl) {
    try {
      this.logger.info(`Iniciando consumidor para fila: ${queueName}`)
      
      const consumer = {
        queueName,
        queueUrl,
        isRunning: true,
        messageCount: 0,
        errorCount: 0
      }
      
      this.consumers.set(queueName, consumer)
      
      // Iniciar polling
      this.pollQueue(consumer)
      
    } catch (error) {
      this.logger.error(`Erro ao iniciar consumidor ${queueName}:`, error)
      throw error
    }
  }

  async pollQueue(consumer) {
    while (consumer.isRunning && !this.isShuttingDown) {
      try {
        const params = {
          QueueUrl: consumer.queueUrl,
          MaxNumberOfMessages: this.config.aws.polling.maxMessages || 10,
          WaitTimeSeconds: this.config.aws.polling.waitTimeSeconds || 20,
          VisibilityTimeout: this.config.aws.polling.visibilityTimeout || 30
        }
        
        const result = await this.sqs.receiveMessage(params).promise()
        
        if (result.Messages && result.Messages.length > 0) {
          await this.processMessages(consumer, result.Messages)
        }
        
      } catch (error) {
        this.logger.error(`Erro no polling da fila ${consumer.queueName}:`, error)
        consumer.errorCount++
        
        // Aguardar antes de tentar novamente
        await this.sleep(this.config.aws.polling.errorDelay || 5000)
      }
    }
  }

  async processMessages(consumer, messages) {
    for (const message of messages) {
      try {
        await this.processMessage(consumer, message)
        
        // Deletar mensagem após processamento bem-sucedido
        await this.deleteMessage(consumer.queueUrl, message.ReceiptHandle)
        
        consumer.messageCount++
        
      } catch (error) {
        this.logger.error(`Erro ao processar mensagem da fila ${consumer.queueName}:`, error)
        consumer.errorCount++
        
        // Implementar retry logic ou enviar para DLQ
        await this.handleMessageError(consumer, message, error)
      }
    }
  }

  async processMessage(consumer, message) {
    try {
      const messageBody = JSON.parse(message.Body)
      
      this.logger.debug(`Processando mensagem da fila ${consumer.queueName}:`, {
        messageId: message.MessageId,
        type: messageBody.type
      })
      
      // Emitir evento baseado no tipo de mensagem
      this.emit('message', {
        queue: consumer.queueName,
        messageId: message.MessageId,
        type: messageBody.type,
        data: messageBody.data,
        timestamp: messageBody.timestamp,
        attributes: message.MessageAttributes
      })
      
      // Emitir evento específico do tipo
      this.emit(messageBody.type, messageBody.data)
      
    } catch (error) {
      this.logger.error('Erro ao processar corpo da mensagem:', error)
      throw error
    }
  }

  async deleteMessage(queueUrl, receiptHandle) {
    try {
      await this.sqs.deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle
      }).promise()
    } catch (error) {
      this.logger.error('Erro ao deletar mensagem:', error)
      throw error
    }
  }

  async handleMessageError(consumer, message, error) {
    try {
      // Verificar número de tentativas
      const retryCount = parseInt(message.MessageAttributes?.retryCount?.StringValue || '0')
      const maxRetries = this.config.aws.retries.maxRetries || 3
      
      if (retryCount < maxRetries) {
        // Reenviar mensagem com contador de retry incrementado
        await this.retryMessage(consumer, message, retryCount + 1)
      } else {
        // Enviar para DLQ
        await this.sendToDLQ(consumer, message, error)
        
        // Deletar mensagem original
        await this.deleteMessage(consumer.queueUrl, message.ReceiptHandle)
      }
      
    } catch (dlqError) {
      this.logger.error('Erro ao lidar com erro de mensagem:', dlqError)
    }
  }

  async retryMessage(consumer, message, retryCount) {
    try {
      const messageBody = JSON.parse(message.Body)
      
      await this.sendMessage(consumer.queueUrl, messageBody, {
        retryCount: retryCount.toString(),
        originalMessageId: message.MessageId,
        errorTimestamp: new Date().toISOString()
      })
      
      this.logger.info(`Mensagem reenviada para retry ${retryCount}:`, {
        queue: consumer.queueName,
        messageId: message.MessageId
      })
      
    } catch (error) {
      this.logger.error('Erro ao reenviar mensagem:', error)
      throw error
    }
  }

  async sendToDLQ(consumer, message, error) {
    try {
      const dlqUrl = this.config.aws.queues.dlq
      if (!dlqUrl) {
        this.logger.warn('DLQ não configurada, mensagem será perdida')
        return
      }
      
      const dlqMessage = {
        originalQueue: consumer.queueName,
        originalMessage: JSON.parse(message.Body),
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        },
        messageAttributes: message.MessageAttributes
      }
      
      await this.sendMessage(dlqUrl, dlqMessage)
      
      this.logger.warn('Mensagem enviada para DLQ:', {
        queue: consumer.queueName,
        messageId: message.MessageId,
        error: error.message
      })
      
    } catch (dlqError) {
      this.logger.error('Erro ao enviar mensagem para DLQ:', dlqError)
      throw dlqError
    }
  }

  async sendMessage(queueUrl, messageBody, attributes = {}) {
    try {
      const params = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody)
      }
      
      // Adicionar atributos se fornecidos
      if (Object.keys(attributes).length > 0) {
        params.MessageAttributes = {}
        for (const [key, value] of Object.entries(attributes)) {
          params.MessageAttributes[key] = {
            DataType: 'String',
            StringValue: value.toString()
          }
        }
      }
      
      const result = await this.sqs.sendMessage(params).promise()
      
      this.logger.debug('Mensagem enviada:', {
        queueUrl,
        messageId: result.MessageId
      })
      
      return result
      
    } catch (error) {
      this.logger.error('Erro ao enviar mensagem:', error)
      throw error
    }
  }

  async sendSchemaEvent(eventType, data) {
    try {
      const queueUrl = this.config.aws.queues.schemaEvents
      if (!queueUrl) {
        this.logger.warn('Fila de eventos de esquema não configurada')
        return
      }
      
      const message = {
        type: `schema.${eventType}`,
        data,
        timestamp: new Date().toISOString(),
        source: 'message-schema-registry'
      }
      
      return await this.sendMessage(queueUrl, message)
      
    } catch (error) {
      this.logger.error('Erro ao enviar evento de esquema:', error)
      throw error
    }
  }

  async sendValidationEvent(eventType, data) {
    try {
      const queueUrl = this.config.aws.queues.validationEvents
      if (!queueUrl) {
        this.logger.warn('Fila de eventos de validação não configurada')
        return
      }
      
      const message = {
        type: `validation.${eventType}`,
        data,
        timestamp: new Date().toISOString(),
        source: 'message-schema-registry'
      }
      
      return await this.sendMessage(queueUrl, message)
      
    } catch (error) {
      this.logger.error('Erro ao enviar evento de validação:', error)
      throw error
    }
  }

  async sendMigrationEvent(eventType, data) {
    try {
      const queueUrl = this.config.aws.queues.migrationEvents
      if (!queueUrl) {
        this.logger.warn('Fila de eventos de migração não configurada')
        return
      }
      
      const message = {
        type: `migration.${eventType}`,
        data,
        timestamp: new Date().toISOString(),
        source: 'message-schema-registry'
      }
      
      return await this.sendMessage(queueUrl, message)
      
    } catch (error) {
      this.logger.error('Erro ao enviar evento de migração:', error)
      throw error
    }
  }

  async getQueueStats() {
    try {
      const stats = {
        consumers: {},
        queues: {}
      }
      
      // Estatísticas dos consumidores
      for (const [name, consumer] of this.consumers.entries()) {
        stats.consumers[name] = {
          isRunning: consumer.isRunning,
          messageCount: consumer.messageCount,
          errorCount: consumer.errorCount,
          queueUrl: consumer.queueUrl
        }
      }
      
      // Estatísticas das filas (se disponível)
      const queueUrls = [
        this.config.aws.queues.schemaEvents,
        this.config.aws.queues.validationEvents,
        this.config.aws.queues.migrationEvents,
        this.config.aws.queues.dlq
      ].filter(Boolean)
      
      for (const queueUrl of queueUrls) {
        try {
          const attributes = await this.sqs.getQueueAttributes({
            QueueUrl: queueUrl,
            AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
          }).promise()
          
          stats.queues[queueUrl] = {
            messagesAvailable: parseInt(attributes.Attributes.ApproximateNumberOfMessages || '0'),
            messagesInFlight: parseInt(attributes.Attributes.ApproximateNumberOfMessagesNotVisible || '0')
          }
        } catch (error) {
          this.logger.warn(`Erro ao obter estatísticas da fila ${queueUrl}:`, error)
        }
      }
      
      return stats
      
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas SQS:', error)
      throw error
    }
  }

  async stopConsumer(queueName) {
    try {
      const consumer = this.consumers.get(queueName)
      if (consumer) {
        consumer.isRunning = false
        this.logger.info(`Consumidor ${queueName} parado`)
      }
    } catch (error) {
      this.logger.error(`Erro ao parar consumidor ${queueName}:`, error)
      throw error
    }
  }

  async stopAllConsumers() {
    try {
      this.logger.info('Parando todos os consumidores SQS...')
      
      for (const [queueName, consumer] of this.consumers.entries()) {
        consumer.isRunning = false
        this.logger.info(`Consumidor ${queueName} parado`)
      }
      
      // Aguardar um pouco para que os loops de polling terminem
      await this.sleep(2000)
      
      this.logger.info('Todos os consumidores SQS parados')
    } catch (error) {
      this.logger.error('Erro ao parar consumidores SQS:', error)
      throw error
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando SQS Service...')
      
      this.isShuttingDown = true
      
      // Parar todos os consumidores
      await this.stopAllConsumers()
      
      // Limpar recursos
      this.consumers.clear()
      
      this.isInitialized = false
      this.logger.info('SQS Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar SQS Service:', error)
      throw error
    }
  }
}

module.exports = SQSService