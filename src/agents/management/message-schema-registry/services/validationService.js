/**
 * Validation Service - Validação de Mensagens
 * Responsável pela validação de dados contra esquemas registrados
 */

const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const avro = require('avsc')
const { EventEmitter } = require('events')

class ValidationService extends EventEmitter {
  constructor({ config, schema, cache, metrics, logger }) {
    super()
    this.config = config
    this.schema = schema
    this.cache = cache
    this.metrics = metrics
    this.logger = logger
    
    this.ajv = new Ajv({ 
      allErrors: true, 
      strict: false,
      removeAdditional: this.config.removeAdditional,
      useDefaults: this.config.useDefaults,
      coerceTypes: this.config.coerceTypes
    })
    addFormats(this.ajv)
    
    this.compiledSchemas = new Map() // cache de esquemas compilados
    this.validationStats = new Map() // estatísticas de validação por subject
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Validation Service...')
      
      // Carregar estatísticas do cache
      await this.loadValidationStats()
      
      // Configurar listeners de esquema
      this.setupSchemaListeners()
      
      this.isInitialized = true
      this.logger.info('Validation Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Validation Service:', error)
      throw error
    }
  }

  async loadValidationStats() {
    try {
      const cachedStats = await this.cache.get('validation_stats')
      if (cachedStats) {
        this.validationStats = new Map(JSON.parse(cachedStats))
        this.logger.info(`Carregadas estatísticas de validação para ${this.validationStats.size} subjects`)
      }
    } catch (error) {
      this.logger.warn('Erro ao carregar estatísticas de validação:', error)
    }
  }

  setupSchemaListeners() {
    // Limpar cache quando esquema é atualizado
    this.schema.on('schema.registered', (data) => {
      this.clearCompiledSchema(data.subject)
    })
    
    this.schema.on('schema.updated', (data) => {
      this.clearCompiledSchema(data.subject)
    })
    
    this.schema.on('schema.deleted', (data) => {
      this.clearCompiledSchema(data.subject)
    })
  }

  async validateMessage(subject, data, version = 'latest', options = {}) {
    const startTime = Date.now()
    
    try {
      this.logger.debug('Validando mensagem:', { subject, version, dataSize: JSON.stringify(data).length })
      
      // Obter esquema
      const schemaRecord = await this.schema.getSchema(subject, version)
      if (!schemaRecord) {
        throw new Error(`Esquema não encontrado: ${subject}:${version}`)
      }
      
      // Validar dados
      const validationResult = await this.performValidation(schemaRecord, data, options)
      
      // Registrar estatísticas
      const duration = Date.now() - startTime
      await this.recordValidationStats(subject, validationResult.valid, duration)
      
      // Atualizar métricas
      this.metrics?.incrementCounter('validations_total', { 
        subject, 
        version: schemaRecord.version.toString(),
        format: schemaRecord.format,
        valid: validationResult.valid.toString()
      })
      
      this.metrics?.recordHistogram('validation_duration_ms', duration, {
        subject,
        format: schemaRecord.format
      })
      
      if (!validationResult.valid) {
        this.metrics?.incrementCounter('validation_errors', { subject })
      }
      
      const result = {
        valid: validationResult.valid,
        subject,
        version: schemaRecord.version,
        format: schemaRecord.format,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        metadata: {
          schemaId: schemaRecord.id,
          validationTime: duration,
          timestamp: new Date().toISOString()
        }
      }
      
      // Aplicar transformações se solicitado
      if (options.transform && validationResult.valid) {
        result.transformedData = await this.applyTransformations(schemaRecord, data, options.transform)
      }
      
      this.logger.debug('Validação concluída:', {
        subject,
        valid: validationResult.valid,
        duration,
        errorCount: validationResult.errors.length
      })
      
      return result
      
    } catch (error) {
      const duration = Date.now() - startTime
      
      this.logger.error('Erro na validação:', error)
      this.metrics?.incrementCounter('validation_failures', { subject })
      
      await this.recordValidationStats(subject, false, duration, error.message)
      
      throw error
    }
  }

  async performValidation(schemaRecord, data, options) {
    try {
      const { schema, format } = schemaRecord
      
      switch (format) {
        case 'json-schema':
          return await this.validateJsonSchema(schema, data, options)
        case 'avro':
          return await this.validateAvroSchema(schema, data, options)
        default:
          throw new Error(`Formato de validação não suportado: ${format}`)
      }
    } catch (error) {
      this.logger.error('Erro na validação do esquema:', error)
      return {
        valid: false,
        errors: [{
          message: error.message,
          path: '',
          code: 'VALIDATION_ERROR'
        }],
        warnings: []
      }
    }
  }

  async validateJsonSchema(schema, data, options) {
    try {
      // Obter validador compilado
      const validator = await this.getCompiledJsonSchema(schema)
      
      // Executar validação
      const valid = validator(data)
      
      const errors = []
      const warnings = []
      
      if (!valid && validator.errors) {
        for (const error of validator.errors) {
          const errorObj = {
            message: error.message,
            path: error.instancePath || error.dataPath || '',
            value: error.data,
            schema: error.schema,
            code: error.keyword?.toUpperCase() || 'VALIDATION_ERROR',
            params: error.params
          }
          
          // Classificar como warning ou error baseado na severidade
          if (this.isWarningError(error)) {
            warnings.push(errorObj)
          } else {
            errors.push(errorObj)
          }
        }
      }
      
      // Validações customizadas
      if (options.customValidations) {
        const customResults = await this.runCustomValidations(data, options.customValidations)
        errors.push(...customResults.errors)
        warnings.push(...customResults.warnings)
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings
      }
      
    } catch (error) {
      this.logger.error('Erro na validação JSON Schema:', error)
      return {
        valid: false,
        errors: [{
          message: `Erro interno de validação: ${error.message}`,
          path: '',
          code: 'INTERNAL_ERROR'
        }],
        warnings: []
      }
    }
  }

  async validateAvroSchema(schema, data, options) {
    try {
      // Obter tipo Avro compilado
      const avroType = await this.getCompiledAvroSchema(schema)
      
      const errors = []
      const warnings = []
      
      try {
        // Validar e serializar
        const buffer = avroType.toBuffer(data)
        
        // Deserializar para verificar integridade
        const roundTrip = avroType.fromBuffer(buffer)
        
        // Verificar se há perda de dados
        if (JSON.stringify(data) !== JSON.stringify(roundTrip)) {
          warnings.push({
            message: 'Dados podem ter sido modificados durante serialização/deserialização',
            path: '',
            code: 'DATA_TRANSFORMATION_WARNING'
          })
        }
        
      } catch (error) {
        errors.push({
          message: error.message,
          path: error.path || '',
          code: 'AVRO_VALIDATION_ERROR'
        })
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings
      }
      
    } catch (error) {
      this.logger.error('Erro na validação Avro Schema:', error)
      return {
        valid: false,
        errors: [{
          message: `Erro interno de validação Avro: ${error.message}`,
          path: '',
          code: 'INTERNAL_ERROR'
        }],
        warnings: []
      }
    }
  }

  async getCompiledJsonSchema(schema) {
    const schemaKey = this.generateSchemaKey(schema)
    
    if (this.compiledSchemas.has(schemaKey)) {
      return this.compiledSchemas.get(schemaKey)
    }
    
    try {
      const validator = this.ajv.compile(schema)
      this.compiledSchemas.set(schemaKey, validator)
      
      // Limitar tamanho do cache
      if (this.compiledSchemas.size > this.config.maxCompiledSchemas) {
        const firstKey = this.compiledSchemas.keys().next().value
        this.compiledSchemas.delete(firstKey)
      }
      
      return validator
    } catch (error) {
      this.logger.error('Erro ao compilar JSON Schema:', error)
      throw new Error(`Falha ao compilar esquema: ${error.message}`)
    }
  }

  async getCompiledAvroSchema(schema) {
    const schemaKey = this.generateSchemaKey(schema)
    
    if (this.compiledSchemas.has(schemaKey)) {
      return this.compiledSchemas.get(schemaKey)
    }
    
    try {
      const avroType = avro.Type.forSchema(schema)
      this.compiledSchemas.set(schemaKey, avroType)
      
      // Limitar tamanho do cache
      if (this.compiledSchemas.size > this.config.maxCompiledSchemas) {
        const firstKey = this.compiledSchemas.keys().next().value
        this.compiledSchemas.delete(firstKey)
      }
      
      return avroType
    } catch (error) {
      this.logger.error('Erro ao compilar Avro Schema:', error)
      throw new Error(`Falha ao compilar esquema Avro: ${error.message}`)
    }
  }

  async validateBatch(validations) {
    try {
      this.logger.info(`Iniciando validação em lote de ${validations.length} mensagens`)
      
      const results = []
      const batchSize = this.config.batchSize || 10
      
      // Processar em lotes para evitar sobrecarga
      for (let i = 0; i < validations.length; i += batchSize) {
        const batch = validations.slice(i, i + batchSize)
        
        const batchPromises = batch.map(async (validation, index) => {
          try {
            const result = await this.validateMessage(
              validation.subject,
              validation.data,
              validation.version,
              validation.options
            )
            
            return {
              index: i + index,
              success: true,
              result
            }
          } catch (error) {
            return {
              index: i + index,
              success: false,
              error: error.message
            }
          }
        })
        
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
        
        // Pequena pausa entre lotes
        if (i + batchSize < validations.length) {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }
      
      const summary = {
        total: validations.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        valid: results.filter(r => r.success && r.result.valid).length,
        invalid: results.filter(r => r.success && !r.result.valid).length
      }
      
      this.logger.info('Validação em lote concluída:', summary)
      
      return {
        results,
        summary
      }
      
    } catch (error) {
      this.logger.error('Erro na validação em lote:', error)
      throw error
    }
  }

  async runCustomValidations(data, customValidations) {
    const errors = []
    const warnings = []
    
    try {
      for (const validation of customValidations) {
        const result = await this.executeCustomValidation(data, validation)
        
        if (!result.valid) {
          if (result.severity === 'warning') {
            warnings.push({
              message: result.message,
              path: result.path || '',
              code: 'CUSTOM_WARNING'
            })
          } else {
            errors.push({
              message: result.message,
              path: result.path || '',
              code: 'CUSTOM_ERROR'
            })
          }
        }
      }
    } catch (error) {
      this.logger.error('Erro nas validações customizadas:', error)
      errors.push({
        message: `Erro na validação customizada: ${error.message}`,
        path: '',
        code: 'CUSTOM_VALIDATION_ERROR'
      })
    }
    
    return { errors, warnings }
  }

  async executeCustomValidation(data, validation) {
    // Implementar lógica de validação customizada
    // Por exemplo: validações de negócio, formatação específica, etc.
    
    switch (validation.type) {
      case 'business_rule':
        return this.validateBusinessRule(data, validation.rule)
      case 'format_check':
        return this.validateFormat(data, validation.format)
      case 'range_check':
        return this.validateRange(data, validation.range)
      default:
        return { valid: true }
    }
  }

  validateBusinessRule(data, rule) {
    // Implementar validações de regras de negócio
    return { valid: true }
  }

  validateFormat(data, format) {
    // Implementar validações de formato
    return { valid: true }
  }

  validateRange(data, range) {
    // Implementar validações de intervalo
    return { valid: true }
  }

  async applyTransformations(schemaRecord, data, transformations) {
    try {
      let transformedData = JSON.parse(JSON.stringify(data)) // deep clone
      
      for (const transformation of transformations) {
        transformedData = await this.applyTransformation(transformedData, transformation)
      }
      
      return transformedData
    } catch (error) {
      this.logger.error('Erro nas transformações:', error)
      throw new Error(`Falha na transformação: ${error.message}`)
    }
  }

  async applyTransformation(data, transformation) {
    // Implementar transformações de dados
    switch (transformation.type) {
      case 'normalize':
        return this.normalizeData(data, transformation.config)
      case 'sanitize':
        return this.sanitizeData(data, transformation.config)
      case 'enrich':
        return this.enrichData(data, transformation.config)
      default:
        return data
    }
  }

  normalizeData(data, config) {
    // Implementar normalização
    return data
  }

  sanitizeData(data, config) {
    // Implementar sanitização
    return data
  }

  enrichData(data, config) {
    // Implementar enriquecimento
    return data
  }

  isWarningError(error) {
    // Classificar erros como warnings baseado no tipo
    const warningKeywords = ['format', 'pattern']
    return warningKeywords.includes(error.keyword)
  }

  generateSchemaKey(schema) {
    return require('crypto')
      .createHash('md5')
      .update(JSON.stringify(schema))
      .digest('hex')
  }

  clearCompiledSchema(subject) {
    // Limpar esquemas compilados relacionados ao subject
    const keysToDelete = []
    
    for (const key of this.compiledSchemas.keys()) {
      if (key.includes(subject)) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => this.compiledSchemas.delete(key))
    
    this.logger.debug(`Limpeza de cache: removidos ${keysToDelete.length} esquemas compilados para ${subject}`)
  }

  async recordValidationStats(subject, valid, duration, error = null) {
    try {
      if (!this.validationStats.has(subject)) {
        this.validationStats.set(subject, {
          total: 0,
          valid: 0,
          invalid: 0,
          errors: 0,
          avgDuration: 0,
          lastValidation: null,
          commonErrors: new Map()
        })
      }
      
      const stats = this.validationStats.get(subject)
      
      stats.total++
      if (valid) {
        stats.valid++
      } else {
        stats.invalid++
      }
      
      if (error) {
        stats.errors++
        const errorCount = stats.commonErrors.get(error) || 0
        stats.commonErrors.set(error, errorCount + 1)
      }
      
      // Calcular média móvel da duração
      stats.avgDuration = (stats.avgDuration * (stats.total - 1) + duration) / stats.total
      stats.lastValidation = new Date().toISOString()
      
      // Persistir estatísticas periodicamente
      if (stats.total % 100 === 0) {
        await this.persistValidationStats()
      }
      
    } catch (error) {
      this.logger.error('Erro ao registrar estatísticas de validação:', error)
    }
  }

  async persistValidationStats() {
    try {
      await this.cache.set(
        'validation_stats',
        JSON.stringify([...this.validationStats.entries()]),
        this.config.statsRetention || 86400 // 24 horas
      )
    } catch (error) {
      this.logger.error('Erro ao persistir estatísticas:', error)
    }
  }

  async getValidationStats(subject = null) {
    if (subject) {
      return this.validationStats.get(subject) || null
    }
    
    const allStats = {}
    for (const [subj, stats] of this.validationStats.entries()) {
      allStats[subj] = {
        ...stats,
        commonErrors: [...stats.commonErrors.entries()]
      }
    }
    
    return allStats
  }

  async getSystemStats() {
    return {
      compiledSchemasCount: this.compiledSchemas.size,
      validationStatsCount: this.validationStats.size,
      totalValidations: [...this.validationStats.values()].reduce((sum, stats) => sum + stats.total, 0),
      cacheHitRate: this.calculateCacheHitRate(),
      avgValidationDuration: this.calculateAvgValidationDuration()
    }
  }

  calculateCacheHitRate() {
    // Implementar cálculo de taxa de acerto do cache
    return 0.95 // placeholder
  }

  calculateAvgValidationDuration() {
    const stats = [...this.validationStats.values()]
    if (stats.length === 0) return 0
    
    const totalDuration = stats.reduce((sum, stat) => sum + stat.avgDuration, 0)
    return totalDuration / stats.length
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Validation Service...')
      
      // Persistir estatísticas finais
      await this.persistValidationStats()
      
      // Limpar caches
      this.compiledSchemas.clear()
      
      this.isInitialized = false
      this.logger.info('Validation Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Validation Service:', error)
      throw error
    }
  }
}

module.exports = ValidationService