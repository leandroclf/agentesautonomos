/**
 * Event Service
 * Serviço para gerenciamento de eventos e comunicação SQS
 */

const EventEmitter = require('events')
const config = require('../config/lifecycleConfig')

class EventService extends EventEmitter {
  constructor(sqsService, logger) {
    super()
    this.sqs = sqsService
    this.logger = logger
    this.consumers = new Map()
    this.isInitialized = false
    this.eventBuffer = []
    this.maxBufferSize = 1000
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Event Service...')
      
      // Verificar se SQS está disponível
      if (!this.sqs) {
        throw new Error('SQS Service não está disponível')
      }
      
      // Configurar filas necessárias
      await this.setupQueues()
      
      this.isInitialized = true
      this.logger.info('Event Service inicializado com sucesso')
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Event Service:', error)
      throw error
    }
  }

  async setupQueues() {
    try {
      const queuesToSetup = [
        config.sqs.queues.lifecycleEvents,
        config.sqs.queues.agentFailureEvents,
        config.sqs.queues.recoveryActions,
        config.sqs.queues.fallbackActions
      ]

      for (const queueName of queuesToSetup) {
        try {
          await this.sqs.createQueue(queueName)
          this.logger.debug(`Fila ${queueName} configurada`)
        } catch (error) {
          this.logger.warn(`Erro ao configurar fila ${queueName}:`, error)
        }
      }
      
    } catch (error) {
      this.logger.error('Erro ao configurar filas SQS:', error)
      throw error
    }
  }

  async publishEvent(event) {
    try {
      if (!this.isInitialized) {
        this.logger.warn('Event Service não inicializado, adicionando evento ao buffer')
        this.addToBuffer(event)
        return
      }

      // Validar evento
      const validationResult = this.validateEvent(event)
      if (!validationResult.valid) {
        throw new Error(`Evento inválido: ${validationResult.errors.join(', ')}`)
      }

      // Enriquecer evento com metadados
      const enrichedEvent = this.enrichEvent(event)

      // Determinar fila de destino
      const queueName = this.getQueueForEvent(enrichedEvent.type)
      
      if (!queueName) {
        this.logger.warn(`Tipo de evento desconhecido: ${enrichedEvent.type}`)
        return
      }

      // Publicar no SQS
      await this.sqs.sendMessage(queueName, enrichedEvent)
      
      this.logger.debug(`Evento publicado: ${enrichedEvent.type} -> ${queueName}`)
      
      // Emitir evento local
      this.emit('eventPublished', {
        event: enrichedEvent,
        queue: queueName
      })

      // Adicionar ao buffer para auditoria
      this.addToBuffer(enrichedEvent)

    } catch (error) {
      this.logger.error('Erro ao publicar evento:', error)
      
      // Emitir evento de erro
      this.emit('publishError', {
        event,
        error: error.message
      })
      
      throw error
    }
  }

  async publishBatch(events) {
    try {
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error('Lista de eventos deve ser um array não vazio')
      }

      const results = []
      const errors = []

      for (const event of events) {
        try {
          await this.publishEvent(event)
          results.push({ event, success: true })
        } catch (error) {
          errors.push({ event, error: error.message })
          results.push({ event, success: false, error: error.message })
        }
      }

      this.logger.info(`Batch publicado: ${results.filter(r => r.success).length}/${events.length} eventos com sucesso`)
      
      if (errors.length > 0) {
        this.logger.warn(`${errors.length} eventos falharam no batch`)
      }

      return {
        total: events.length,
        successful: results.filter(r => r.success).length,
        failed: errors.length,
        results,
        errors
      }

    } catch (error) {
      this.logger.error('Erro ao publicar batch de eventos:', error)
      throw error
    }
  }

  async createConsumer(queueName, handler, options = {}) {
    try {
      if (this.consumers.has(queueName)) {
        throw new Error(`Consumer para fila ${queueName} já existe`)
      }

      const consumerOptions = {
        batchSize: options.batchSize || 1,
        waitTimeSeconds: options.waitTimeSeconds || 20,
        visibilityTimeout: options.visibilityTimeout || 30,
        ...options
      }

      // Criar consumer SQS
      const consumer = await this.sqs.createConsumer(queueName, async (messages) => {
        for (const message of messages) {
          try {
            // Log da mensagem recebida
            this.logger.debug(`Mensagem recebida de ${queueName}:`, {
              messageId: message.MessageId,
              body: message.Body
            })

            // Processar mensagem
            await handler(message)

            // Emitir evento de mensagem processada
            this.emit('messageProcessed', {
              queue: queueName,
              messageId: message.MessageId,
              success: true
            })

          } catch (error) {
            this.logger.error(`Erro ao processar mensagem de ${queueName}:`, error)
            
            // Emitir evento de erro
            this.emit('messageError', {
              queue: queueName,
              messageId: message.MessageId,
              error: error.message,
              message
            })

            // Re-throw para que o SQS possa lidar com retry/DLQ
            throw error
          }
        }
      }, consumerOptions)

      // Armazenar consumer
      this.consumers.set(queueName, {
        consumer,
        handler,
        options: consumerOptions,
        createdAt: new Date().toISOString(),
        messagesProcessed: 0,
        errors: 0
      })

      this.logger.info(`Consumer criado para fila ${queueName}`)
      
      // Emitir evento de consumer criado
      this.emit('consumerCreated', {
        queue: queueName,
        options: consumerOptions
      })

      return consumer

    } catch (error) {
      this.logger.error(`Erro ao criar consumer para fila ${queueName}:`, error)
      throw error
    }
  }

  async stopConsumer(queueName) {
    try {
      const consumerInfo = this.consumers.get(queueName)
      if (!consumerInfo) {
        throw new Error(`Consumer para fila ${queueName} não encontrado`)
      }

      await consumerInfo.consumer.stop()
      this.consumers.delete(queueName)

      this.logger.info(`Consumer para fila ${queueName} parado`)
      
      // Emitir evento de consumer parado
      this.emit('consumerStopped', {
        queue: queueName,
        messagesProcessed: consumerInfo.messagesProcessed,
        errors: consumerInfo.errors
      })

    } catch (error) {
      this.logger.error(`Erro ao parar consumer para fila ${queueName}:`, error)
      throw error
    }
  }

  validateEvent(event) {
    const errors = []

    // Validações obrigatórias
    if (!event.type) {
      errors.push('Tipo do evento é obrigatório')
    }

    if (!event.timestamp) {
      errors.push('Timestamp do evento é obrigatório')
    } else {
      // Validar formato do timestamp
      const timestamp = new Date(event.timestamp)
      if (isNaN(timestamp.getTime())) {
        errors.push('Timestamp deve estar em formato ISO válido')
      }
    }

    // Validar tipo de evento conhecido
    if (event.type && !this.isKnownEventType(event.type)) {
      errors.push(`Tipo de evento desconhecido: ${event.type}`)
    }

    // Validar estrutura de dados
    if (event.data && typeof event.data !== 'object') {
      errors.push('Dados do evento devem ser um objeto')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  enrichEvent(event) {
    return {
      ...event,
      id: this.generateEventId(),
      source: 'lifecycle-manager',
      version: '1.0.0',
      publishedAt: new Date().toISOString(),
      metadata: {
        ...event.metadata,
        hostname: process.env.HOSTNAME || 'localhost',
        processId: process.pid,
        nodeVersion: process.version
      }
    }
  }

  generateEventId() {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substr(2, 9)
    return `evt_${timestamp}_${random}`
  }

  isKnownEventType(eventType) {
    const knownTypes = Object.values(config.events.types)
    return knownTypes.includes(eventType)
  }

  getQueueForEvent(eventType) {
    // Mapear tipos de evento para filas
    const eventQueueMap = {
      [config.events.types.AGENT_STARTED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.AGENT_STOPPED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.AGENT_FAILED]: config.sqs.queues.agentFailureEvents,
      [config.events.types.AGENT_RESTARTED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.AGENT_REGISTERED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.AGENT_UNREGISTERED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.LIFECYCLE_MANAGER_STARTED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.LIFECYCLE_MANAGER_STOPPED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.RECOVERY_ACTION_RECEIVED]: config.sqs.queues.lifecycleEvents,
      [config.events.types.FALLBACK_ACTION_RECEIVED]: config.sqs.queues.lifecycleEvents
    }

    return eventQueueMap[eventType] || null
  }

  addToBuffer(event) {
    // Adicionar ao buffer circular
    if (this.eventBuffer.length >= this.maxBufferSize) {
      this.eventBuffer.shift() // Remove o mais antigo
    }
    
    this.eventBuffer.push({
      ...event,
      bufferedAt: new Date().toISOString()
    })
  }

  getEventBuffer() {
    return [...this.eventBuffer]
  }

  clearEventBuffer() {
    const count = this.eventBuffer.length
    this.eventBuffer = []
    this.logger.info(`Buffer de eventos limpo: ${count} eventos removidos`)
    return count
  }

  async getEventHistory(options = {}) {
    try {
      const {
        eventType,
        startTime,
        endTime,
        limit = 100,
        offset = 0
      } = options

      let events = [...this.eventBuffer]

      // Filtrar por tipo
      if (eventType) {
        events = events.filter(event => event.type === eventType)
      }

      // Filtrar por período
      if (startTime) {
        const start = new Date(startTime)
        events = events.filter(event => new Date(event.timestamp) >= start)
      }

      if (endTime) {
        const end = new Date(endTime)
        events = events.filter(event => new Date(event.timestamp) <= end)
      }

      // Ordenar por timestamp (mais recente primeiro)
      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      // Aplicar paginação
      const paginatedEvents = events.slice(offset, offset + limit)

      return {
        events: paginatedEvents,
        total: events.length,
        limit,
        offset,
        hasMore: offset + limit < events.length
      }

    } catch (error) {
      this.logger.error('Erro ao obter histórico de eventos:', error)
      throw error
    }
  }

  async getEventStatistics() {
    try {
      const events = this.eventBuffer
      const stats = {
        total: events.length,
        byType: {},
        byHour: {},
        recentEvents: events.slice(-10).reverse()
      }

      // Estatísticas por tipo
      events.forEach(event => {
        stats.byType[event.type] = (stats.byType[event.type] || 0) + 1
      })

      // Estatísticas por hora (últimas 24 horas)
      const now = new Date()
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      
      events
        .filter(event => new Date(event.timestamp) >= last24Hours)
        .forEach(event => {
          const hour = new Date(event.timestamp).getHours()
          stats.byHour[hour] = (stats.byHour[hour] || 0) + 1
        })

      return stats

    } catch (error) {
      this.logger.error('Erro ao obter estatísticas de eventos:', error)
      throw error
    }
  }

  async getConsumerStatistics() {
    try {
      const stats = {
        total: this.consumers.size,
        consumers: []
      }

      for (const [queueName, consumerInfo] of this.consumers) {
        stats.consumers.push({
          queue: queueName,
          createdAt: consumerInfo.createdAt,
          messagesProcessed: consumerInfo.messagesProcessed,
          errors: consumerInfo.errors,
          isRunning: consumerInfo.consumer.isRunning || false,
          options: consumerInfo.options
        })
      }

      return stats

    } catch (error) {
      this.logger.error('Erro ao obter estatísticas de consumers:', error)
      throw error
    }
  }

  async flushBufferedEvents() {
    try {
      if (!this.isInitialized) {
        this.logger.warn('Event Service não inicializado, não é possível fazer flush')
        return 0
      }

      const bufferedEvents = this.eventBuffer.filter(event => !event.flushed)
      let flushed = 0

      for (const event of bufferedEvents) {
        try {
          await this.publishEvent(event)
          event.flushed = true
          flushed++
        } catch (error) {
          this.logger.error('Erro ao fazer flush de evento:', error)
        }
      }

      this.logger.info(`${flushed} eventos do buffer foram publicados`)
      return flushed

    } catch (error) {
      this.logger.error('Erro ao fazer flush de eventos do buffer:', error)
      throw error
    }
  }

  async testConnection() {
    try {
      // Testar conexão SQS
      const testQueue = 'lifecycle-test-queue'
      await this.sqs.createQueue(testQueue)
      
      const testMessage = {
        type: 'test',
        timestamp: new Date().toISOString(),
        data: { test: true }
      }
      
      await this.sqs.sendMessage(testQueue, testMessage)
      
      // Limpar fila de teste
      await this.sqs.deleteQueue(testQueue)
      
      this.logger.info('Teste de conexão SQS bem-sucedido')
      return true
      
    } catch (error) {
      this.logger.error('Falha no teste de conexão SQS:', error)
      return false
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Event Service...')
      
      // Parar todos os consumers
      const stopPromises = []
      for (const queueName of this.consumers.keys()) {
        stopPromises.push(
          this.stopConsumer(queueName).catch(error => {
            this.logger.error(`Erro ao parar consumer ${queueName}:`, error)
          })
        )
      }
      
      await Promise.all(stopPromises)
      
      // Fazer flush dos eventos em buffer
      await this.flushBufferedEvents()
      
      this.isInitialized = false
      this.logger.info('Event Service finalizado')
      
    } catch (error) {
      this.logger.error('Erro ao finalizar Event Service:', error)
      throw error
    }
  }
}

module.exports = EventService