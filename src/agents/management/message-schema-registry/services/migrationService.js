/**
 * Migration Service - Migração de Dados
 * Responsável por migrar dados entre versões de esquemas
 */

const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const avro = require('avsc')
const { EventEmitter } = require('events')
const { Transform } = require('stream')

class MigrationService extends EventEmitter {
  constructor({ config, schema, version, compatibility, validation, metrics, alert, cache, logger }) {
    super()
    this.config = config
    this.schema = schema
    this.version = version
    this.compatibility = compatibility
    this.validation = validation
    this.metrics = metrics
    this.alert = alert
    this.cache = cache
    this.logger = logger
    
    this.ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(this.ajv)
    
    this.migrationStrategies = new Map()
    this.activeMigrations = new Map()
    this.migrationHistory = new Map()
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Migration Service...')
      
      // Carregar estratégias de migração
      await this.loadMigrationStrategies()
      
      // Carregar histórico de migrações
      await this.loadMigrationHistory()
      
      // Configurar estratégias padrão
      this.setupDefaultStrategies()
      
      this.isInitialized = true
      this.logger.info('Migration Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Migration Service:', error)
      throw error
    }
  }

  async loadMigrationStrategies() {
    try {
      // Carregar estratégias customizadas do cache se existirem
      const cachedStrategies = await this.cache?.get('migration:strategies')
      if (cachedStrategies) {
        for (const [key, strategy] of Object.entries(cachedStrategies)) {
          this.migrationStrategies.set(key, strategy)
        }
      }
      
      this.logger.info('Estratégias de migração carregadas')
    } catch (error) {
      this.logger.warn('Erro ao carregar estratégias de migração:', error)
    }
  }

  async loadMigrationHistory() {
    try {
      // Carregar histórico de migrações do cache
      const cachedHistory = await this.cache?.get('migration:history')
      if (cachedHistory) {
        for (const [key, history] of Object.entries(cachedHistory)) {
          this.migrationHistory.set(key, history)
        }
      }
      
      this.logger.info('Histórico de migrações carregado')
    } catch (error) {
      this.logger.warn('Erro ao carregar histórico de migrações:', error)
    }
  }

  setupDefaultStrategies() {
    // Estratégia de migração automática
    this.migrationStrategies.set('auto', {
      name: 'Migração Automática',
      description: 'Migração automática baseada em compatibilidade',
      handler: this.autoMigrationHandler.bind(this)
    })
    
    // Estratégia de migração manual
    this.migrationStrategies.set('manual', {
      name: 'Migração Manual',
      description: 'Migração com transformações customizadas',
      handler: this.manualMigrationHandler.bind(this)
    })
    
    // Estratégia de migração por mapeamento
    this.migrationStrategies.set('mapping', {
      name: 'Migração por Mapeamento',
      description: 'Migração usando mapeamento de campos',
      handler: this.mappingMigrationHandler.bind(this)
    })
    
    // Estratégia de migração por script
    this.migrationStrategies.set('script', {
      name: 'Migração por Script',
      description: 'Migração usando scripts de transformação',
      handler: this.scriptMigrationHandler.bind(this)
    })
  }

  async migrateData(subject, data, fromVersion, toVersion, options = {}) {
    try {
      this.logger.info('Iniciando migração de dados:', {
        subject,
        fromVersion,
        toVersion,
        dataType: Array.isArray(data) ? 'array' : typeof data,
        dataSize: Array.isArray(data) ? data.length : 1
      })
      
      // Validar parâmetros
      if (!subject || !data || !fromVersion || !toVersion) {
        throw new Error('Parâmetros obrigatórios não fornecidos')
      }
      
      // Verificar se migração é necessária
      if (fromVersion === toVersion) {
        return {
          success: true,
          data,
          migrated: false,
          reason: 'Versões são iguais, migração não necessária'
        }
      }
      
      // Obter esquemas
      const fromSchema = await this.schema.getSchema(subject, fromVersion)
      const toSchema = await this.schema.getSchema(subject, toVersion)
      
      if (!fromSchema || !toSchema) {
        throw new Error('Esquemas não encontrados para as versões especificadas')
      }
      
      // Verificar compatibilidade
      const compatibilityResult = await this.compatibility.checkCompatibility(
        subject,
        toSchema,
        fromVersion
      )
      
      // Determinar estratégia de migração
      const strategy = this.determineMigrationStrategy(
        fromSchema,
        toSchema,
        compatibilityResult,
        options
      )
      
      // Executar migração
      const migrationResult = await this.executeMigration(
        data,
        fromSchema,
        toSchema,
        strategy,
        options
      )
      
      // Registrar migração no histórico
      await this.recordMigration({
        subject,
        fromVersion,
        toVersion,
        strategy: strategy.name,
        success: migrationResult.success,
        recordCount: Array.isArray(data) ? data.length : 1,
        migratedCount: migrationResult.migratedCount || 0,
        errorCount: migrationResult.errorCount || 0,
        timestamp: new Date().toISOString()
      })
      
      // Atualizar métricas
      this.metrics?.incrementCounter('data_migrations', {
        subject,
        strategy: strategy.name,
        success: migrationResult.success.toString()
      })
      
      this.logger.info('Migração de dados concluída:', {
        subject,
        fromVersion,
        toVersion,
        success: migrationResult.success,
        strategy: strategy.name
      })
      
      return {
        success: migrationResult.success,
        data: migrationResult.data,
        migrated: true,
        strategy: strategy.name,
        fromVersion,
        toVersion,
        stats: migrationResult.stats,
        errors: migrationResult.errors
      }
      
    } catch (error) {
      this.logger.error('Erro na migração de dados:', error)
      this.metrics?.incrementCounter('migration_errors')
      
      // Registrar erro no histórico
      await this.recordMigration({
        subject,
        fromVersion,
        toVersion,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
      
      throw error
    }
  }

  determineMigrationStrategy(fromSchema, toSchema, compatibilityResult, options) {
    // Estratégia especificada nas opções
    if (options.strategy && this.migrationStrategies.has(options.strategy)) {
      return this.migrationStrategies.get(options.strategy)
    }
    
    // Estratégia baseada na compatibilidade
    if (compatibilityResult.compatible) {
      return this.migrationStrategies.get('auto')
    }
    
    // Estratégia baseada no tipo de mudanças
    const hasBreakingChanges = compatibilityResult.details.some(
      detail => detail.severity === 'error'
    )
    
    if (hasBreakingChanges) {
      // Se há transformações customizadas, usar migração manual
      if (options.transformations || options.mapping) {
        return options.mapping 
          ? this.migrationStrategies.get('mapping')
          : this.migrationStrategies.get('manual')
      }
      
      // Caso contrário, usar migração por script
      return this.migrationStrategies.get('script')
    }
    
    // Padrão: migração automática
    return this.migrationStrategies.get('auto')
  }

  async executeMigration(data, fromSchema, toSchema, strategy, options) {
    try {
      const migrationId = this.generateMigrationId()
      
      // Registrar migração ativa
      this.activeMigrations.set(migrationId, {
        startTime: Date.now(),
        strategy: strategy.name,
        status: 'running'
      })
      
      // Executar estratégia de migração
      const result = await strategy.handler(
        data,
        fromSchema,
        toSchema,
        options,
        migrationId
      )
      
      // Remover migração ativa
      this.activeMigrations.delete(migrationId)
      
      return result
      
    } catch (error) {
      this.logger.error('Erro na execução da migração:', error)
      throw error
    }
  }

  async autoMigrationHandler(data, fromSchema, toSchema, options, migrationId) {
    try {
      const results = {
        success: true,
        data: null,
        stats: {
          total: 0,
          migrated: 0,
          errors: 0,
          warnings: 0
        },
        errors: []
      }
      
      // Processar dados
      if (Array.isArray(data)) {
        results.data = []
        results.stats.total = data.length
        
        for (let i = 0; i < data.length; i++) {
          try {
            const migratedItem = await this.autoMigrateItem(
              data[i],
              fromSchema,
              toSchema
            )
            results.data.push(migratedItem)
            results.stats.migrated++
          } catch (error) {
            results.stats.errors++
            results.errors.push({
              index: i,
              error: error.message,
              data: data[i]
            })
            
            if (options.stopOnError) {
              throw error
            }
          }
        }
      } else {
        results.stats.total = 1
        try {
          results.data = await this.autoMigrateItem(data, fromSchema, toSchema)
          results.stats.migrated = 1
        } catch (error) {
          results.stats.errors = 1
          results.errors.push({
            error: error.message,
            data
          })
          results.success = false
        }
      }
      
      // Determinar sucesso geral
      results.success = results.stats.errors === 0 || 
        (results.stats.migrated > 0 && !options.requireAllSuccess)
      
      return results
      
    } catch (error) {
      this.logger.error('Erro na migração automática:', error)
      throw error
    }
  }

  async autoMigrateItem(item, fromSchema, toSchema) {
    try {
      // Validar item com esquema de origem
      const validationResult = await this.validation.validateMessage(
        fromSchema.subject,
        item,
        fromSchema.version
      )
      
      if (!validationResult.valid) {
        throw new Error(`Item inválido para esquema de origem: ${validationResult.errors.join(', ')}`)
      }
      
      // Aplicar transformações automáticas baseadas no formato
      let migratedItem
      
      if (fromSchema.format === 'json-schema') {
        migratedItem = await this.autoMigrateJsonSchema(item, fromSchema.schema, toSchema.schema)
      } else if (fromSchema.format === 'avro') {
        migratedItem = await this.autoMigrateAvro(item, fromSchema.schema, toSchema.schema)
      } else {
        throw new Error(`Formato não suportado para migração automática: ${fromSchema.format}`)
      }
      
      // Validar item migrado com esquema de destino
      const targetValidation = await this.validation.validateMessage(
        toSchema.subject,
        migratedItem,
        toSchema.version
      )
      
      if (!targetValidation.valid) {
        throw new Error(`Item migrado inválido: ${targetValidation.errors.join(', ')}`)
      }
      
      return migratedItem
      
    } catch (error) {
      this.logger.error('Erro na migração automática de item:', error)
      throw error
    }
  }

  async autoMigrateJsonSchema(item, fromSchema, toSchema) {
    const migratedItem = { ...item }
    
    // Adicionar campos com valores padrão
    if (toSchema.properties) {
      for (const [fieldName, fieldSchema] of Object.entries(toSchema.properties)) {
        if (!(fieldName in migratedItem) && fieldSchema.default !== undefined) {
          migratedItem[fieldName] = fieldSchema.default
        }
      }
    }
    
    // Remover campos que não existem no novo esquema
    if (toSchema.properties) {
      for (const fieldName of Object.keys(migratedItem)) {
        if (!(fieldName in toSchema.properties)) {
          delete migratedItem[fieldName]
        }
      }
    }
    
    return migratedItem
  }

  async autoMigrateAvro(item, fromSchema, toSchema) {
    const migratedItem = { ...item }
    
    // Adicionar campos com valores padrão
    if (toSchema.fields) {
      for (const field of toSchema.fields) {
        if (!(field.name in migratedItem) && field.default !== undefined) {
          migratedItem[field.name] = field.default
        }
      }
    }
    
    // Remover campos que não existem no novo esquema
    if (toSchema.fields) {
      const validFields = new Set(toSchema.fields.map(f => f.name))
      for (const fieldName of Object.keys(migratedItem)) {
        if (!validFields.has(fieldName)) {
          delete migratedItem[fieldName]
        }
      }
    }
    
    return migratedItem
  }

  async manualMigrationHandler(data, fromSchema, toSchema, options, migrationId) {
    try {
      if (!options.transformations || typeof options.transformations !== 'function') {
        throw new Error('Transformações customizadas não fornecidas para migração manual')
      }
      
      const results = {
        success: true,
        data: null,
        stats: {
          total: 0,
          migrated: 0,
          errors: 0
        },
        errors: []
      }
      
      // Processar dados com transformações customizadas
      if (Array.isArray(data)) {
        results.data = []
        results.stats.total = data.length
        
        for (let i = 0; i < data.length; i++) {
          try {
            const transformedItem = await options.transformations(
              data[i],
              fromSchema,
              toSchema,
              { index: i, migrationId }
            )
            results.data.push(transformedItem)
            results.stats.migrated++
          } catch (error) {
            results.stats.errors++
            results.errors.push({
              index: i,
              error: error.message,
              data: data[i]
            })
            
            if (options.stopOnError) {
              throw error
            }
          }
        }
      } else {
        results.stats.total = 1
        try {
          results.data = await options.transformations(
            data,
            fromSchema,
            toSchema,
            { migrationId }
          )
          results.stats.migrated = 1
        } catch (error) {
          results.stats.errors = 1
          results.errors.push({
            error: error.message,
            data
          })
          results.success = false
        }
      }
      
      results.success = results.stats.errors === 0
      
      return results
      
    } catch (error) {
      this.logger.error('Erro na migração manual:', error)
      throw error
    }
  }

  async mappingMigrationHandler(data, fromSchema, toSchema, options, migrationId) {
    try {
      if (!options.mapping || typeof options.mapping !== 'object') {
        throw new Error('Mapeamento de campos não fornecido para migração por mapeamento')
      }
      
      const results = {
        success: true,
        data: null,
        stats: {
          total: 0,
          migrated: 0,
          errors: 0
        },
        errors: []
      }
      
      // Processar dados com mapeamento
      if (Array.isArray(data)) {
        results.data = []
        results.stats.total = data.length
        
        for (let i = 0; i < data.length; i++) {
          try {
            const mappedItem = this.applyFieldMapping(data[i], options.mapping)
            results.data.push(mappedItem)
            results.stats.migrated++
          } catch (error) {
            results.stats.errors++
            results.errors.push({
              index: i,
              error: error.message,
              data: data[i]
            })
            
            if (options.stopOnError) {
              throw error
            }
          }
        }
      } else {
        results.stats.total = 1
        try {
          results.data = this.applyFieldMapping(data, options.mapping)
          results.stats.migrated = 1
        } catch (error) {
          results.stats.errors = 1
          results.errors.push({
            error: error.message,
            data
          })
          results.success = false
        }
      }
      
      results.success = results.stats.errors === 0
      
      return results
      
    } catch (error) {
      this.logger.error('Erro na migração por mapeamento:', error)
      throw error
    }
  }

  applyFieldMapping(item, mapping) {
    const mappedItem = {}
    
    for (const [targetField, sourceField] of Object.entries(mapping)) {
      if (typeof sourceField === 'string') {
        // Mapeamento simples
        if (sourceField in item) {
          mappedItem[targetField] = item[sourceField]
        }
      } else if (typeof sourceField === 'function') {
        // Mapeamento com função de transformação
        mappedItem[targetField] = sourceField(item)
      } else if (typeof sourceField === 'object' && sourceField.source) {
        // Mapeamento com configuração
        if (sourceField.source in item) {
          let value = item[sourceField.source]
          
          // Aplicar transformações
          if (sourceField.transform) {
            value = sourceField.transform(value)
          }
          
          mappedItem[targetField] = value
        } else if (sourceField.default !== undefined) {
          mappedItem[targetField] = sourceField.default
        }
      }
    }
    
    return mappedItem
  }

  async scriptMigrationHandler(data, fromSchema, toSchema, options, migrationId) {
    try {
      // Implementar migração por script
      // Por enquanto, usar migração automática como fallback
      this.logger.warn('Migração por script não implementada, usando migração automática')
      return await this.autoMigrationHandler(data, fromSchema, toSchema, options, migrationId)
    } catch (error) {
      this.logger.error('Erro na migração por script:', error)
      throw error
    }
  }

  async createMigrationPlan(subject, fromVersion, toVersion) {
    try {
      this.logger.info('Criando plano de migração:', { subject, fromVersion, toVersion })
      
      // Obter esquemas
      const fromSchema = await this.schema.getSchema(subject, fromVersion)
      const toSchema = await this.schema.getSchema(subject, toVersion)
      
      if (!fromSchema || !toSchema) {
        throw new Error('Esquemas não encontrados')
      }
      
      // Verificar compatibilidade
      const compatibilityResult = await this.compatibility.checkCompatibility(
        subject,
        toSchema,
        fromVersion
      )
      
      // Analisar mudanças
      const changes = this.analyzeSchemaChanges(fromSchema.schema, toSchema.schema)
      
      // Determinar estratégia recomendada
      const recommendedStrategy = this.determineMigrationStrategy(
        fromSchema,
        toSchema,
        compatibilityResult,
        {}
      )
      
      const plan = {
        subject,
        fromVersion,
        toVersion,
        fromSchema: {
          id: fromSchema.id,
          format: fromSchema.format,
          hash: fromSchema.hash
        },
        toSchema: {
          id: toSchema.id,
          format: toSchema.format,
          hash: toSchema.hash
        },
        compatibility: compatibilityResult,
        changes,
        recommendedStrategy: recommendedStrategy.name,
        availableStrategies: Array.from(this.migrationStrategies.keys()),
        estimatedComplexity: this.estimateMigrationComplexity(changes),
        recommendations: this.generateMigrationRecommendations(changes, compatibilityResult),
        createdAt: new Date().toISOString()
      }
      
      return plan
      
    } catch (error) {
      this.logger.error('Erro ao criar plano de migração:', error)
      throw error
    }
  }

  analyzeSchemaChanges(fromSchema, toSchema) {
    const changes = {
      fieldsAdded: [],
      fieldsRemoved: [],
      fieldsModified: [],
      typeChanges: [],
      requiredChanges: []
    }
    
    // Implementar análise detalhada de mudanças
    // Por enquanto, retornar estrutura básica
    
    return changes
  }

  estimateMigrationComplexity(changes) {
    let complexity = 'low'
    
    const totalChanges = 
      changes.fieldsAdded.length +
      changes.fieldsRemoved.length +
      changes.fieldsModified.length +
      changes.typeChanges.length +
      changes.requiredChanges.length
    
    if (totalChanges > 10) {
      complexity = 'high'
    } else if (totalChanges > 5) {
      complexity = 'medium'
    }
    
    return complexity
  }

  generateMigrationRecommendations(changes, compatibilityResult) {
    const recommendations = []
    
    if (compatibilityResult.compatible) {
      recommendations.push({
        type: 'strategy',
        message: 'Esquemas são compatíveis, migração automática recomendada',
        priority: 'low'
      })
    } else {
      recommendations.push({
        type: 'strategy',
        message: 'Esquemas incompatíveis, migração manual ou por mapeamento recomendada',
        priority: 'high'
      })
    }
    
    // Adicionar mais recomendações baseadas nas mudanças
    
    return recommendations
  }

  async recordMigration(migrationRecord) {
    try {
      const key = `${migrationRecord.subject}:${migrationRecord.fromVersion}:${migrationRecord.toVersion}`
      
      if (!this.migrationHistory.has(key)) {
        this.migrationHistory.set(key, [])
      }
      
      this.migrationHistory.get(key).push(migrationRecord)
      
      // Persistir no cache
      await this.persistMigrationHistory()
      
      this.emit('migration.recorded', migrationRecord)
      
    } catch (error) {
      this.logger.error('Erro ao registrar migração:', error)
    }
  }

  async persistMigrationHistory() {
    try {
      const historyObject = Object.fromEntries(this.migrationHistory)
      await this.cache?.set('migration:history', historyObject, this.config.historyTtl)
    } catch (error) {
      this.logger.error('Erro ao persistir histórico de migrações:', error)
    }
  }

  async getMigrationHistory(subject, fromVersion = null, toVersion = null) {
    try {
      const history = []
      
      for (const [key, records] of this.migrationHistory.entries()) {
        const [recordSubject, recordFromVersion, recordToVersion] = key.split(':')
        
        if (recordSubject === subject) {
          if ((!fromVersion || recordFromVersion === fromVersion) &&
              (!toVersion || recordToVersion === toVersion)) {
            history.push(...records)
          }
        }
      }
      
      return history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      
    } catch (error) {
      this.logger.error('Erro ao obter histórico de migrações:', error)
      throw error
    }
  }

  async getMigrationStats() {
    try {
      const stats = {
        totalMigrations: 0,
        successfulMigrations: 0,
        failedMigrations: 0,
        strategiesUsed: {},
        subjectsWithMigrations: new Set(),
        averageMigrationTime: 0,
        recentMigrations: []
      }
      
      for (const records of this.migrationHistory.values()) {
        for (const record of records) {
          stats.totalMigrations++
          
          if (record.success) {
            stats.successfulMigrations++
          } else {
            stats.failedMigrations++
          }
          
          if (record.strategy) {
            stats.strategiesUsed[record.strategy] = 
              (stats.strategiesUsed[record.strategy] || 0) + 1
          }
          
          stats.subjectsWithMigrations.add(record.subject)
        }
      }
      
      stats.subjectsWithMigrations = stats.subjectsWithMigrations.size
      
      return stats
      
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas de migração:', error)
      throw error
    }
  }

  generateMigrationId() {
    return `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  async getActiveMigrations() {
    return Array.from(this.activeMigrations.entries()).map(([id, migration]) => ({
      id,
      ...migration,
      duration: Date.now() - migration.startTime
    }))
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Migration Service...')
      
      // Aguardar migrações ativas
      if (this.activeMigrations.size > 0) {
        this.logger.info(`Aguardando ${this.activeMigrations.size} migrações ativas...`)
        // Implementar timeout para migrações ativas
      }
      
      // Persistir estado
      await this.persistMigrationHistory()
      
      // Limpar caches
      this.migrationStrategies.clear()
      this.activeMigrations.clear()
      this.migrationHistory.clear()
      
      this.isInitialized = false
      this.logger.info('Migration Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Migration Service:', error)
      throw error
    }
  }
}

module.exports = MigrationService