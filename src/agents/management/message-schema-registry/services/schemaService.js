/**
 * Schema Service - Gerenciamento de Esquemas
 * Responsável pelo registro, armazenamento e recuperação de esquemas
 */

const crypto = require('crypto')
const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const avro = require('avsc')
const { EventEmitter } = require('events')

class SchemaService extends EventEmitter {
  constructor({ config, cache, metrics, alert, sqs, logger }) {
    super()
    this.config = config
    this.cache = cache
    this.metrics = metrics
    this.alert = alert
    this.sqs = sqs
    this.logger = logger
    
    this.schemas = new Map() // subject -> versions -> schema
    this.ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(this.ajv)
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Schema Service...')
      
      // Carregar esquemas do cache/persistência
      await this.loadExistingSchemas()
      
      // Configurar listeners SQS
      await this.setupSQSListeners()
      
      this.isInitialized = true
      this.logger.info('Schema Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Schema Service:', error)
      throw error
    }
  }

  async loadExistingSchemas() {
    try {
      const cachedSchemas = await this.cache.get('all_schemas')
      if (cachedSchemas) {
        this.schemas = new Map(JSON.parse(cachedSchemas))
        this.logger.info(`Carregados ${this.schemas.size} esquemas do cache`)
      }
    } catch (error) {
      this.logger.warn('Erro ao carregar esquemas do cache:', error)
    }
  }

  async setupSQSListeners() {
    try {
      // Listener para eventos de esquema
      await this.sqs.subscribe(
        this.config.aws.sqs.schemaQueue,
        this.handleSchemaEvent.bind(this),
        {
          maxMessages: this.config.aws.sqs.maxMessages,
          visibilityTimeout: this.config.aws.sqs.visibilityTimeout,
          waitTimeSeconds: this.config.aws.sqs.waitTimeSeconds
        }
      )

      this.logger.info('SQS listeners configurados')
    } catch (error) {
      this.logger.error('Erro ao configurar SQS listeners:', error)
      throw error
    }
  }

  async handleSchemaEvent(message) {
    try {
      const { eventType, data } = JSON.parse(message.Body)
      
      this.logger.debug('Processando evento de esquema:', { eventType, subject: data.subject })
      
      switch (eventType) {
        case 'schema.registered':
          await this.handleSchemaRegistered(data)
          break
        case 'schema.updated':
          await this.handleSchemaUpdated(data)
          break
        case 'schema.deleted':
          await this.handleSchemaDeleted(data)
          break
        case 'schema.validation.requested':
          await this.handleValidationRequested(data)
          break
        default:
          this.logger.warn('Tipo de evento desconhecido:', eventType)
      }
      
      // Atualizar métricas
      this.metrics?.incrementCounter('schema_events_processed', { eventType })
      
    } catch (error) {
      this.logger.error('Erro ao processar evento de esquema:', error)
      this.metrics?.incrementCounter('schema_events_errors')
      throw error
    }
  }

  async registerSchema({ subject, schema, format = 'json-schema', compatibility = 'backward' }) {
    try {
      this.logger.info('Registrando novo esquema:', { subject, format })
      
      // Validar formato
      if (!this.config.supportedFormats.includes(format)) {
        throw new Error(`Formato não suportado: ${format}`)
      }
      
      // Validar esquema
      const validationResult = await this.validateSchemaDefinition(schema, format)
      if (!validationResult.valid) {
        throw new Error(`Esquema inválido: ${validationResult.errors.join(', ')}`)
      }
      
      // Gerar ID e hash do esquema
      const schemaId = this.generateSchemaId()
      const schemaHash = this.generateSchemaHash(schema)
      
      // Verificar se já existe
      const existingSchema = await this.findSchemaByHash(subject, schemaHash)
      if (existingSchema) {
        this.logger.info('Esquema já existe:', { subject, version: existingSchema.version })
        return existingSchema
      }
      
      // Determinar próxima versão
      const nextVersion = await this.getNextVersion(subject)
      
      // Criar registro do esquema
      const schemaRecord = {
        id: schemaId,
        subject,
        version: nextVersion,
        schema,
        format,
        hash: schemaHash,
        compatibility,
        createdAt: new Date().toISOString(),
        createdBy: 'system', // TODO: implementar autenticação
        metadata: {
          size: JSON.stringify(schema).length,
          fields: this.extractSchemaFields(schema, format)
        }
      }
      
      // Armazenar esquema
      await this.storeSchema(schemaRecord)
      
      // Emitir evento
      await this.emitSchemaEvent('schema.registered', schemaRecord)
      
      // Atualizar métricas
      this.metrics?.incrementCounter('schemas_registered', { subject, format })
      this.metrics?.setGauge('schemas_total', this.getTotalSchemas())
      
      this.logger.info('Esquema registrado com sucesso:', {
        subject,
        version: nextVersion,
        id: schemaId
      })
      
      return schemaRecord
      
    } catch (error) {
      this.logger.error('Erro ao registrar esquema:', error)
      this.metrics?.incrementCounter('schema_registration_errors')
      throw error
    }
  }

  async getSchema(subject, version = 'latest') {
    try {
      this.logger.debug('Obtendo esquema:', { subject, version })
      
      // Verificar cache primeiro
      const cacheKey = `schema:${subject}:${version}`
      const cached = await this.cache.get(cacheKey)
      if (cached) {
        this.metrics?.incrementCounter('schema_cache_hits')
        return JSON.parse(cached)
      }
      
      // Buscar no armazenamento
      const subjectSchemas = this.schemas.get(subject)
      if (!subjectSchemas) {
        return null
      }
      
      let schema
      if (version === 'latest') {
        const versions = Object.keys(subjectSchemas).sort((a, b) => parseInt(b) - parseInt(a))
        schema = subjectSchemas[versions[0]]
      } else {
        schema = subjectSchemas[version]
      }
      
      if (schema) {
        // Cachear resultado
        await this.cache.set(cacheKey, JSON.stringify(schema), this.config.storage.ttl)
        this.metrics?.incrementCounter('schema_cache_misses')
      }
      
      return schema
      
    } catch (error) {
      this.logger.error('Erro ao obter esquema:', error)
      throw error
    }
  }

  async listSchemas({ page = 1, limit = 20, format, subject }) {
    try {
      this.logger.debug('Listando esquemas:', { page, limit, format, subject })
      
      let allSchemas = []
      
      // Coletar todos os esquemas
      for (const [subjectName, versions] of this.schemas.entries()) {
        if (subject && !subjectName.includes(subject)) {
          continue
        }
        
        for (const [version, schema] of Object.entries(versions)) {
          if (format && schema.format !== format) {
            continue
          }
          
          allSchemas.push({
            ...schema,
            subject: subjectName,
            version: parseInt(version)
          })
        }
      }
      
      // Ordenar por data de criação (mais recentes primeiro)
      allSchemas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      
      // Paginação
      const total = allSchemas.length
      const offset = (page - 1) * limit
      const schemas = allSchemas.slice(offset, offset + limit)
      
      return {
        schemas,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1
        }
      }
      
    } catch (error) {
      this.logger.error('Erro ao listar esquemas:', error)
      throw error
    }
  }

  async deleteSchema(subject, version) {
    try {
      this.logger.info('Deletando esquema:', { subject, version })
      
      const subjectSchemas = this.schemas.get(subject)
      if (!subjectSchemas) {
        throw new Error(`Subject não encontrado: ${subject}`)
      }
      
      if (version) {
        // Deletar versão específica
        if (!subjectSchemas[version]) {
          throw new Error(`Versão não encontrada: ${version}`)
        }
        
        const schema = subjectSchemas[version]
        delete subjectSchemas[version]
        
        // Se não há mais versões, remover o subject
        if (Object.keys(subjectSchemas).length === 0) {
          this.schemas.delete(subject)
        }
        
        // Emitir evento
        await this.emitSchemaEvent('schema.deleted', { subject, version, schema })
        
        // Limpar cache
        await this.cache.delete(`schema:${subject}:${version}`)
        await this.cache.delete(`schema:${subject}:latest`)
        
        this.logger.info('Versão do esquema deletada:', { subject, version })
        return { deleted: true, subject, version }
        
      } else {
        // Deletar todas as versões do subject
        const deletedVersions = Object.keys(subjectSchemas)
        this.schemas.delete(subject)
        
        // Emitir evento
        await this.emitSchemaEvent('schema.deleted', { subject, versions: deletedVersions })
        
        // Limpar cache
        for (const v of deletedVersions) {
          await this.cache.delete(`schema:${subject}:${v}`)
        }
        await this.cache.delete(`schema:${subject}:latest`)
        
        this.logger.info('Subject deletado completamente:', { subject, versions: deletedVersions })
        return { deleted: true, subject, versions: deletedVersions }
      }
      
    } catch (error) {
      this.logger.error('Erro ao deletar esquema:', error)
      throw error
    }
  }

  async validateSchemaDefinition(schema, format) {
    try {
      const errors = []
      
      switch (format) {
        case 'json-schema':
          try {
            this.ajv.compile(schema)
          } catch (error) {
            errors.push(`JSON Schema inválido: ${error.message}`)
          }
          break
          
        case 'avro':
          try {
            avro.Type.forSchema(schema)
          } catch (error) {
            errors.push(`Avro Schema inválido: ${error.message}`)
          }
          break
          
        default:
          errors.push(`Formato não suportado: ${format}`)
      }
      
      return {
        valid: errors.length === 0,
        errors
      }
      
    } catch (error) {
      this.logger.error('Erro na validação do esquema:', error)
      return {
        valid: false,
        errors: [error.message]
      }
    }
  }

  async storeSchema(schemaRecord) {
    try {
      const { subject, version } = schemaRecord
      
      // Armazenar em memória
      if (!this.schemas.has(subject)) {
        this.schemas.set(subject, {})
      }
      this.schemas.get(subject)[version] = schemaRecord
      
      // Persistir no cache
      await this.cache.set(
        'all_schemas',
        JSON.stringify([...this.schemas.entries()]),
        this.config.storage.ttl
      )
      
      // Cachear esquema individual
      await this.cache.set(
        `schema:${subject}:${version}`,
        JSON.stringify(schemaRecord),
        this.config.storage.ttl
      )
      
      // Atualizar cache 'latest'
      await this.cache.set(
        `schema:${subject}:latest`,
        JSON.stringify(schemaRecord),
        this.config.storage.ttl
      )
      
    } catch (error) {
      this.logger.error('Erro ao armazenar esquema:', error)
      throw error
    }
  }

  async findSchemaByHash(subject, hash) {
    try {
      const subjectSchemas = this.schemas.get(subject)
      if (!subjectSchemas) {
        return null
      }
      
      for (const [version, schema] of Object.entries(subjectSchemas)) {
        if (schema.hash === hash) {
          return schema
        }
      }
      
      return null
    } catch (error) {
      this.logger.error('Erro ao buscar esquema por hash:', error)
      return null
    }
  }

  async getNextVersion(subject) {
    try {
      const subjectSchemas = this.schemas.get(subject)
      if (!subjectSchemas) {
        return 1
      }
      
      const versions = Object.keys(subjectSchemas).map(v => parseInt(v))
      return Math.max(...versions) + 1
    } catch (error) {
      this.logger.error('Erro ao obter próxima versão:', error)
      return 1
    }
  }

  generateSchemaId() {
    return crypto.randomUUID()
  }

  generateSchemaHash(schema) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(schema))
      .digest('hex')
  }

  extractSchemaFields(schema, format) {
    try {
      switch (format) {
        case 'json-schema':
          return this.extractJsonSchemaFields(schema)
        case 'avro':
          return this.extractAvroFields(schema)
        default:
          return []
      }
    } catch (error) {
      this.logger.warn('Erro ao extrair campos do esquema:', error)
      return []
    }
  }

  extractJsonSchemaFields(schema, prefix = '') {
    const fields = []
    
    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        const fieldName = prefix ? `${prefix}.${name}` : name
        fields.push({
          name: fieldName,
          type: prop.type || 'unknown',
          required: schema.required?.includes(name) || false,
          description: prop.description
        })
        
        // Recursão para objetos aninhados
        if (prop.type === 'object' && prop.properties) {
          fields.push(...this.extractJsonSchemaFields(prop, fieldName))
        }
      }
    }
    
    return fields
  }

  extractAvroFields(schema, prefix = '') {
    const fields = []
    
    if (schema.fields) {
      for (const field of schema.fields) {
        const fieldName = prefix ? `${prefix}.${field.name}` : field.name
        fields.push({
          name: fieldName,
          type: typeof field.type === 'string' ? field.type : field.type.type,
          required: !field.default,
          description: field.doc
        })
        
        // Recursão para records aninhados
        if (field.type.type === 'record' && field.type.fields) {
          fields.push(...this.extractAvroFields(field.type, fieldName))
        }
      }
    }
    
    return fields
  }

  async emitSchemaEvent(eventType, data) {
    try {
      const event = {
        eventType,
        data,
        timestamp: new Date().toISOString(),
        source: 'schema-service'
      }
      
      // Emitir localmente
      this.emit(eventType, data)
      
      // Enviar para SQS
      await this.sqs.sendMessage(
        this.config.aws.sqs.schemaQueue,
        JSON.stringify(event)
      )
      
    } catch (error) {
      this.logger.error('Erro ao emitir evento de esquema:', error)
    }
  }

  getTotalSchemas() {
    let total = 0
    for (const versions of this.schemas.values()) {
      total += Object.keys(versions).length
    }
    return total
  }

  async handleSchemaRegistered(data) {
    this.logger.debug('Esquema registrado:', data)
    // Implementar lógica adicional se necessário
  }

  async handleSchemaUpdated(data) {
    this.logger.debug('Esquema atualizado:', data)
    // Implementar lógica adicional se necessário
  }

  async handleSchemaDeleted(data) {
    this.logger.debug('Esquema deletado:', data)
    // Implementar lógica adicional se necessário
  }

  async handleValidationRequested(data) {
    this.logger.debug('Validação solicitada:', data)
    // Implementar lógica adicional se necessário
  }

  async getStats() {
    return {
      totalSubjects: this.schemas.size,
      totalSchemas: this.getTotalSchemas(),
      supportedFormats: this.config.supportedFormats,
      cacheStats: await this.cache.getStats?.() || {},
      uptime: process.uptime()
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Schema Service...')
      
      // Salvar estado final
      await this.cache.set(
        'all_schemas',
        JSON.stringify([...this.schemas.entries()]),
        this.config.storage.ttl
      )
      
      this.isInitialized = false
      this.logger.info('Schema Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Schema Service:', error)
      throw error
    }
  }
}

module.exports = SchemaService