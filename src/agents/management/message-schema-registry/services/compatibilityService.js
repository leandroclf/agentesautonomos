/**
 * Compatibility Service - Verificação de Compatibilidade
 * Responsável por verificar compatibilidade entre versões de esquemas
 */

const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const avro = require('avsc')
const { EventEmitter } = require('events')

class CompatibilityService extends EventEmitter {
  constructor({ config, schema, version, metrics, alert, logger }) {
    super()
    this.config = config
    this.schema = schema
    this.version = version
    this.metrics = metrics
    this.alert = alert
    this.logger = logger
    
    this.ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(this.ajv)
    
    this.compatibilityCache = new Map()
    this.compatibilityRules = new Map()
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Compatibility Service...')
      
      // Carregar regras de compatibilidade
      await this.loadCompatibilityRules()
      
      // Configurar políticas padrão
      this.setupDefaultPolicies()
      
      this.isInitialized = true
      this.logger.info('Compatibility Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Compatibility Service:', error)
      throw error
    }
  }

  async loadCompatibilityRules() {
    try {
      // Carregar regras customizadas do cache se existirem
      // Por enquanto, usar regras padrão
      this.logger.info('Regras de compatibilidade carregadas')
    } catch (error) {
      this.logger.warn('Erro ao carregar regras de compatibilidade:', error)
    }
  }

  setupDefaultPolicies() {
    // Políticas de compatibilidade padrão
    this.compatibilityRules.set('BACKWARD', {
      name: 'Backward Compatibility',
      description: 'Novos esquemas devem ser compatíveis com versões anteriores',
      rules: [
        'no_required_field_addition',
        'no_field_removal',
        'no_type_change',
        'allow_optional_field_addition',
        'allow_default_value_change'
      ]
    })
    
    this.compatibilityRules.set('FORWARD', {
      name: 'Forward Compatibility',
      description: 'Versões anteriores devem ser compatíveis com novos esquemas',
      rules: [
        'no_field_addition',
        'allow_field_removal',
        'no_type_change',
        'allow_optional_to_required'
      ]
    })
    
    this.compatibilityRules.set('FULL', {
      name: 'Full Compatibility',
      description: 'Compatibilidade bidirecional completa',
      rules: [
        'no_field_addition',
        'no_field_removal',
        'no_type_change',
        'no_required_change'
      ]
    })
    
    this.compatibilityRules.set('NONE', {
      name: 'No Compatibility',
      description: 'Sem verificação de compatibilidade',
      rules: []
    })
  }

  async checkCompatibility(subject, newSchema, targetVersion = 'latest', policy = null) {
    try {
      this.logger.info('Verificando compatibilidade:', { subject, targetVersion, policy })
      
      // Obter esquema de referência
      const referenceSchema = await this.schema.getSchema(subject, targetVersion)
      if (!referenceSchema) {
        return {
          compatible: true,
          reason: 'Nenhum esquema de referência encontrado',
          details: []
        }
      }
      
      // Determinar política de compatibilidade
      const effectivePolicy = policy || referenceSchema.compatibility || this.config.defaultPolicy
      
      // Verificar cache
      const cacheKey = this.generateCacheKey(referenceSchema, newSchema, effectivePolicy)
      if (this.compatibilityCache.has(cacheKey)) {
        this.metrics?.incrementCounter('compatibility_cache_hits')
        return this.compatibilityCache.get(cacheKey)
      }
      
      // Executar verificação de compatibilidade
      const result = await this.performCompatibilityCheck(
        referenceSchema,
        newSchema,
        effectivePolicy
      )
      
      // Cachear resultado
      this.compatibilityCache.set(cacheKey, result)
      
      // Limitar tamanho do cache
      if (this.compatibilityCache.size > this.config.maxCacheSize) {
        const firstKey = this.compatibilityCache.keys().next().value
        this.compatibilityCache.delete(firstKey)
      }
      
      // Atualizar métricas
      this.metrics?.incrementCounter('compatibility_checks', {
        subject,
        policy: effectivePolicy,
        compatible: result.compatible.toString()
      })
      
      // Alertar sobre incompatibilidades
      if (!result.compatible && this.config.alertOnIncompatibility) {
        await this.alert.sendAlert({
          type: 'schema_incompatibility',
          subject,
          policy: effectivePolicy,
          details: result.details,
          severity: 'warning'
        })
      }
      
      this.logger.info('Verificação de compatibilidade concluída:', {
        subject,
        compatible: result.compatible,
        policy: effectivePolicy,
        issueCount: result.details.length
      })
      
      return result
      
    } catch (error) {
      this.logger.error('Erro na verificação de compatibilidade:', error)
      this.metrics?.incrementCounter('compatibility_check_errors')
      throw error
    }
  }

  async performCompatibilityCheck(referenceSchema, newSchema, policy) {
    try {
      const policyRules = this.compatibilityRules.get(policy.toUpperCase())
      if (!policyRules) {
        throw new Error(`Política de compatibilidade desconhecida: ${policy}`)
      }
      
      // Se política é NONE, sempre compatível
      if (policy.toUpperCase() === 'NONE') {
        return {
          compatible: true,
          policy,
          reason: 'Política de compatibilidade: NONE',
          details: []
        }
      }
      
      const issues = []
      
      // Verificar compatibilidade baseada no formato
      if (referenceSchema.format !== newSchema.format) {
        issues.push({
          type: 'format_mismatch',
          severity: 'error',
          message: `Formatos diferentes: ${referenceSchema.format} vs ${newSchema.format}`,
          rule: 'format_consistency'
        })
      } else {
        // Verificar compatibilidade específica do formato
        const formatIssues = await this.checkFormatCompatibility(
          referenceSchema,
          newSchema,
          policyRules.rules
        )
        issues.push(...formatIssues)
      }
      
      // Separar erros e warnings
      const errors = issues.filter(issue => issue.severity === 'error')
      const warnings = issues.filter(issue => issue.severity === 'warning')
      
      const compatible = errors.length === 0
      
      return {
        compatible,
        policy,
        reason: compatible 
          ? 'Esquemas são compatíveis' 
          : `${errors.length} incompatibilidade(s) encontrada(s)`,
        details: issues,
        summary: {
          errors: errors.length,
          warnings: warnings.length,
          total: issues.length
        }
      }
      
    } catch (error) {
      this.logger.error('Erro na execução da verificação de compatibilidade:', error)
      return {
        compatible: false,
        policy,
        reason: `Erro na verificação: ${error.message}`,
        details: [{
          type: 'check_error',
          severity: 'error',
          message: error.message,
          rule: 'internal_error'
        }]
      }
    }
  }

  async checkFormatCompatibility(referenceSchema, newSchema, rules) {
    const format = referenceSchema.format
    
    switch (format) {
      case 'json-schema':
        return await this.checkJsonSchemaCompatibility(referenceSchema.schema, newSchema.schema, rules)
      case 'avro':
        return await this.checkAvroCompatibility(referenceSchema.schema, newSchema.schema, rules)
      default:
        return [{
          type: 'unsupported_format',
          severity: 'error',
          message: `Formato não suportado para verificação de compatibilidade: ${format}`,
          rule: 'format_support'
        }]
    }
  }

  async checkJsonSchemaCompatibility(referenceSchema, newSchema, rules) {
    const issues = []
    
    try {
      // Extrair propriedades dos esquemas
      const refProps = this.extractJsonSchemaProperties(referenceSchema)
      const newProps = this.extractJsonSchemaProperties(newSchema)
      
      // Verificar cada regra
      for (const rule of rules) {
        const ruleIssues = await this.applyJsonSchemaRule(rule, refProps, newProps)
        issues.push(...ruleIssues)
      }
      
    } catch (error) {
      this.logger.error('Erro na verificação de compatibilidade JSON Schema:', error)
      issues.push({
        type: 'compatibility_check_error',
        severity: 'error',
        message: `Erro na verificação: ${error.message}`,
        rule: 'internal_error'
      })
    }
    
    return issues
  }

  async checkAvroCompatibility(referenceSchema, newSchema, rules) {
    const issues = []
    
    try {
      // Extrair campos dos esquemas Avro
      const refFields = this.extractAvroFields(referenceSchema)
      const newFields = this.extractAvroFields(newSchema)
      
      // Verificar cada regra
      for (const rule of rules) {
        const ruleIssues = await this.applyAvroRule(rule, refFields, newFields)
        issues.push(...ruleIssues)
      }
      
    } catch (error) {
      this.logger.error('Erro na verificação de compatibilidade Avro:', error)
      issues.push({
        type: 'compatibility_check_error',
        severity: 'error',
        message: `Erro na verificação: ${error.message}`,
        rule: 'internal_error'
      })
    }
    
    return issues
  }

  async applyJsonSchemaRule(rule, refProps, newProps) {
    const issues = []
    
    switch (rule) {
      case 'no_required_field_addition':
        for (const [fieldName, newField] of Object.entries(newProps)) {
          if (newField.required && !refProps[fieldName]) {
            issues.push({
              type: 'required_field_added',
              severity: 'error',
              message: `Campo obrigatório adicionado: ${fieldName}`,
              field: fieldName,
              rule
            })
          }
        }
        break
        
      case 'no_field_removal':
        for (const [fieldName, refField] of Object.entries(refProps)) {
          if (!newProps[fieldName]) {
            issues.push({
              type: 'field_removed',
              severity: 'error',
              message: `Campo removido: ${fieldName}`,
              field: fieldName,
              rule
            })
          }
        }
        break
        
      case 'no_type_change':
        for (const [fieldName, newField] of Object.entries(newProps)) {
          const refField = refProps[fieldName]
          if (refField && refField.type !== newField.type) {
            issues.push({
              type: 'type_changed',
              severity: 'error',
              message: `Tipo do campo alterado: ${fieldName} (${refField.type} -> ${newField.type})`,
              field: fieldName,
              oldType: refField.type,
              newType: newField.type,
              rule
            })
          }
        }
        break
        
      case 'allow_optional_field_addition':
        for (const [fieldName, newField] of Object.entries(newProps)) {
          if (!newField.required && !refProps[fieldName]) {
            issues.push({
              type: 'optional_field_added',
              severity: 'info',
              message: `Campo opcional adicionado: ${fieldName}`,
              field: fieldName,
              rule
            })
          }
        }
        break
        
      case 'allow_default_value_change':
        for (const [fieldName, newField] of Object.entries(newProps)) {
          const refField = refProps[fieldName]
          if (refField && refField.default !== newField.default) {
            issues.push({
              type: 'default_value_changed',
              severity: 'info',
              message: `Valor padrão alterado: ${fieldName}`,
              field: fieldName,
              oldDefault: refField.default,
              newDefault: newField.default,
              rule
            })
          }
        }
        break
    }
    
    return issues
  }

  async applyAvroRule(rule, refFields, newFields) {
    const issues = []
    
    switch (rule) {
      case 'no_required_field_addition':
        for (const newField of newFields) {
          const refField = refFields.find(f => f.name === newField.name)
          if (!refField && !newField.hasDefault) {
            issues.push({
              type: 'required_field_added',
              severity: 'error',
              message: `Campo obrigatório adicionado: ${newField.name}`,
              field: newField.name,
              rule
            })
          }
        }
        break
        
      case 'no_field_removal':
        for (const refField of refFields) {
          const newField = newFields.find(f => f.name === refField.name)
          if (!newField) {
            issues.push({
              type: 'field_removed',
              severity: 'error',
              message: `Campo removido: ${refField.name}`,
              field: refField.name,
              rule
            })
          }
        }
        break
        
      case 'no_type_change':
        for (const newField of newFields) {
          const refField = refFields.find(f => f.name === newField.name)
          if (refField && !this.areAvroTypesCompatible(refField.type, newField.type)) {
            issues.push({
              type: 'type_changed',
              severity: 'error',
              message: `Tipo do campo alterado: ${newField.name} (${refField.type} -> ${newField.type})`,
              field: newField.name,
              oldType: refField.type,
              newType: newField.type,
              rule
            })
          }
        }
        break
    }
    
    return issues
  }

  extractJsonSchemaProperties(schema) {
    const properties = {}
    
    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        properties[name] = {
          type: prop.type,
          required: schema.required?.includes(name) || false,
          default: prop.default,
          format: prop.format,
          enum: prop.enum
        }
      }
    }
    
    return properties
  }

  extractAvroFields(schema) {
    const fields = []
    
    if (schema.fields) {
      for (const field of schema.fields) {
        fields.push({
          name: field.name,
          type: this.normalizeAvroType(field.type),
          hasDefault: field.default !== undefined,
          default: field.default,
          doc: field.doc
        })
      }
    }
    
    return fields
  }

  normalizeAvroType(type) {
    if (typeof type === 'string') {
      return type
    }
    
    if (Array.isArray(type)) {
      // Union type
      return type.map(t => this.normalizeAvroType(t)).join('|')
    }
    
    if (typeof type === 'object') {
      return type.type || 'complex'
    }
    
    return 'unknown'
  }

  areAvroTypesCompatible(oldType, newType) {
    // Implementar lógica de compatibilidade de tipos Avro
    if (oldType === newType) {
      return true
    }
    
    // Algumas conversões compatíveis
    const compatibleConversions = {
      'int': ['long', 'float', 'double'],
      'long': ['float', 'double'],
      'float': ['double'],
      'string': ['bytes'],
      'bytes': ['string']
    }
    
    return compatibleConversions[oldType]?.includes(newType) || false
  }

  async checkBackwardCompatibility(subject, newSchema, versions = ['latest']) {
    try {
      const results = []
      
      for (const version of versions) {
        const result = await this.checkCompatibility(subject, newSchema, version, 'BACKWARD')
        results.push({
          version,
          ...result
        })
      }
      
      const allCompatible = results.every(r => r.compatible)
      
      return {
        compatible: allCompatible,
        policy: 'BACKWARD',
        results,
        summary: {
          total: results.length,
          compatible: results.filter(r => r.compatible).length,
          incompatible: results.filter(r => !r.compatible).length
        }
      }
      
    } catch (error) {
      this.logger.error('Erro na verificação de compatibilidade backward:', error)
      throw error
    }
  }

  async checkForwardCompatibility(subject, newSchema, versions = ['latest']) {
    try {
      const results = []
      
      for (const version of versions) {
        const result = await this.checkCompatibility(subject, newSchema, version, 'FORWARD')
        results.push({
          version,
          ...result
        })
      }
      
      const allCompatible = results.every(r => r.compatible)
      
      return {
        compatible: allCompatible,
        policy: 'FORWARD',
        results,
        summary: {
          total: results.length,
          compatible: results.filter(r => r.compatible).length,
          incompatible: results.filter(r => !r.compatible).length
        }
      }
      
    } catch (error) {
      this.logger.error('Erro na verificação de compatibilidade forward:', error)
      throw error
    }
  }

  async checkFullCompatibility(subject, newSchema, versions = ['latest']) {
    try {
      const backwardResult = await this.checkBackwardCompatibility(subject, newSchema, versions)
      const forwardResult = await this.checkForwardCompatibility(subject, newSchema, versions)
      
      const compatible = backwardResult.compatible && forwardResult.compatible
      
      return {
        compatible,
        policy: 'FULL',
        backward: backwardResult,
        forward: forwardResult,
        summary: {
          backwardCompatible: backwardResult.compatible,
          forwardCompatible: forwardResult.compatible,
          fullCompatible: compatible
        }
      }
      
    } catch (error) {
      this.logger.error('Erro na verificação de compatibilidade full:', error)
      throw error
    }
  }

  generateCacheKey(referenceSchema, newSchema, policy) {
    const refHash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(referenceSchema))
      .digest('hex')
      
    const newHash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(newSchema))
      .digest('hex')
      
    return `${refHash}:${newHash}:${policy}`
  }

  async getCompatibilityStats() {
    try {
      const stats = {
        totalChecks: 0,
        compatibleChecks: 0,
        incompatibleChecks: 0,
        cacheHits: 0,
        cacheMisses: 0,
        policiesUsed: {},
        commonIssues: {}
      }
      
      // Implementar coleta de estatísticas
      // Por enquanto, retornar estrutura básica
      
      return stats
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas de compatibilidade:', error)
      throw error
    }
  }

  async setCompatibilityPolicy(subject, policy) {
    try {
      this.logger.info('Definindo política de compatibilidade:', { subject, policy })
      
      if (!this.compatibilityRules.has(policy.toUpperCase())) {
        throw new Error(`Política de compatibilidade inválida: ${policy}`)
      }
      
      // Implementar persistência da política por subject
      // Por enquanto, apenas log
      
      this.emit('policy.set', { subject, policy })
      
      return {
        subject,
        policy,
        setAt: new Date().toISOString()
      }
      
    } catch (error) {
      this.logger.error('Erro ao definir política de compatibilidade:', error)
      throw error
    }
  }

  async getCompatibilityPolicy(subject) {
    try {
      // Implementar recuperação da política por subject
      // Por enquanto, retornar política padrão
      return this.config.defaultPolicy || 'BACKWARD'
    } catch (error) {
      this.logger.error('Erro ao obter política de compatibilidade:', error)
      return this.config.defaultPolicy || 'BACKWARD'
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Compatibility Service...')
      
      // Limpar caches
      this.compatibilityCache.clear()
      
      this.isInitialized = false
      this.logger.info('Compatibility Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Compatibility Service:', error)
      throw error
    }
  }
}

module.exports = CompatibilityService