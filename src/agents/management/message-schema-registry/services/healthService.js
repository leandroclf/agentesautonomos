/**
 * Health Service - Monitoramento de Saúde
 * Responsável por verificar a saúde dos serviços e dependências
 */

const { EventEmitter } = require('events')

class HealthService extends EventEmitter {
  constructor({ config, schema, validation, version, compatibility, migration, sqs, cache, metrics, logger }) {
    super()
    this.config = config
    this.schema = schema
    this.validation = validation
    this.version = version
    this.compatibility = compatibility
    this.migration = migration
    this.sqs = sqs
    this.cache = cache
    this.metrics = metrics
    this.logger = logger
    
    this.healthChecks = new Map()
    this.healthStatus = {
      status: 'unknown',
      timestamp: null,
      services: {},
      dependencies: {},
      metrics: {}
    }
    
    this.checkInterval = null
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Health Service...')
      
      // Registrar verificações de saúde
      this.registerHealthChecks()
      
      // Executar verificação inicial
      await this.performHealthCheck()
      
      // Iniciar verificações periódicas
      if (this.config.healthCheck.enabled) {
        this.startPeriodicChecks()
      }
      
      this.isInitialized = true
      this.logger.info('Health Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Health Service:', error)
      throw error
    }
  }

  registerHealthChecks() {
    // Verificação dos serviços principais
    this.healthChecks.set('schema-service', {
      name: 'Schema Service',
      check: () => this.checkSchemaService(),
      timeout: 5000,
      critical: true
    })
    
    this.healthChecks.set('validation-service', {
      name: 'Validation Service',
      check: () => this.checkValidationService(),
      timeout: 5000,
      critical: true
    })
    
    this.healthChecks.set('version-service', {
      name: 'Version Service',
      check: () => this.checkVersionService(),
      timeout: 5000,
      critical: true
    })
    
    this.healthChecks.set('compatibility-service', {
      name: 'Compatibility Service',
      check: () => this.checkCompatibilityService(),
      timeout: 5000,
      critical: false
    })
    
    this.healthChecks.set('migration-service', {
      name: 'Migration Service',
      check: () => this.checkMigrationService(),
      timeout: 5000,
      critical: false
    })
    
    // Verificação das dependências
    this.healthChecks.set('sqs-connection', {
      name: 'SQS Connection',
      check: () => this.checkSQSConnection(),
      timeout: 10000,
      critical: false
    })
    
    this.healthChecks.set('cache-connection', {
      name: 'Cache Connection',
      check: () => this.checkCacheConnection(),
      timeout: 5000,
      critical: false
    })
    
    // Verificação de recursos do sistema
    this.healthChecks.set('memory-usage', {
      name: 'Memory Usage',
      check: () => this.checkMemoryUsage(),
      timeout: 1000,
      critical: false
    })
    
    this.healthChecks.set('disk-space', {
      name: 'Disk Space',
      check: () => this.checkDiskSpace(),
      timeout: 2000,
      critical: false
    })
  }

  async performHealthCheck() {
    try {
      this.logger.debug('Executando verificação de saúde...')
      
      const startTime = Date.now()
      const results = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {},
        dependencies: {},
        metrics: {
          checkDuration: 0,
          totalChecks: this.healthChecks.size,
          passedChecks: 0,
          failedChecks: 0,
          criticalFailures: 0
        }
      }
      
      // Executar todas as verificações
      for (const [key, healthCheck] of this.healthChecks.entries()) {
        try {
          const checkResult = await this.executeHealthCheck(healthCheck)
          
          // Categorizar resultado
          const category = this.categorizeHealthCheck(key)
          results[category][key] = {
            name: healthCheck.name,
            status: checkResult.status,
            message: checkResult.message,
            duration: checkResult.duration,
            timestamp: checkResult.timestamp,
            critical: healthCheck.critical,
            details: checkResult.details
          }
          
          // Atualizar métricas
          if (checkResult.status === 'healthy') {
            results.metrics.passedChecks++
          } else {
            results.metrics.failedChecks++
            if (healthCheck.critical) {
              results.metrics.criticalFailures++
            }
          }
          
        } catch (error) {
          this.logger.error(`Erro na verificação ${key}:`, error)
          
          const category = this.categorizeHealthCheck(key)
          results[category][key] = {
            name: healthCheck.name,
            status: 'unhealthy',
            message: `Erro na verificação: ${error.message}`,
            duration: 0,
            timestamp: new Date().toISOString(),
            critical: healthCheck.critical,
            error: error.message
          }
          
          results.metrics.failedChecks++
          if (healthCheck.critical) {
            results.metrics.criticalFailures++
          }
        }
      }
      
      // Determinar status geral
      if (results.metrics.criticalFailures > 0) {
        results.status = 'unhealthy'
      } else if (results.metrics.failedChecks > 0) {
        results.status = 'degraded'
      } else {
        results.status = 'healthy'
      }
      
      results.metrics.checkDuration = Date.now() - startTime
      
      // Atualizar status interno
      this.healthStatus = results
      
      // Emitir evento de mudança de status
      this.emit('health.checked', results)
      
      // Alertar sobre mudanças críticas
      if (results.status === 'unhealthy') {
        this.emit('health.critical', results)
      }
      
      this.logger.debug('Verificação de saúde concluída:', {
        status: results.status,
        duration: results.metrics.checkDuration,
        passed: results.metrics.passedChecks,
        failed: results.metrics.failedChecks
      })
      
      return results
      
    } catch (error) {
      this.logger.error('Erro na verificação de saúde:', error)
      
      const errorResult = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        services: {},
        dependencies: {},
        metrics: {
          checkDuration: 0,
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          criticalFailures: 1
        }
      }
      
      this.healthStatus = errorResult
      return errorResult
    }
  }

  async executeHealthCheck(healthCheck) {
    const startTime = Date.now()
    
    try {
      // Executar verificação com timeout
      const result = await Promise.race([
        healthCheck.check(),
        this.createTimeout(healthCheck.timeout)
      ])
      
      return {
        status: result.status || 'healthy',
        message: result.message || 'OK',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        details: result.details
      }
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error.message
      }
    }
  }

  createTimeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout after ${ms}ms`))
      }, ms)
    })
  }

  categorizeHealthCheck(key) {
    if (key.includes('service')) {
      return 'services'
    }
    return 'dependencies'
  }

  // Verificações específicas dos serviços
  async checkSchemaService() {
    try {
      if (!this.schema || !this.schema.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'Schema Service não inicializado'
        }
      }
      
      // Verificar funcionalidade básica
      const stats = await this.schema.getStats()
      
      return {
        status: 'healthy',
        message: 'Schema Service operacional',
        details: {
          totalSchemas: stats.totalSchemas,
          totalSubjects: stats.totalSubjects
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Schema Service com erro: ${error.message}`
      }
    }
  }

  async checkValidationService() {
    try {
      if (!this.validation || !this.validation.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'Validation Service não inicializado'
        }
      }
      
      const stats = await this.validation.getStats()
      
      return {
        status: 'healthy',
        message: 'Validation Service operacional',
        details: {
          totalValidations: stats.totalValidations,
          successRate: stats.successRate
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Validation Service com erro: ${error.message}`
      }
    }
  }

  async checkVersionService() {
    try {
      if (!this.version || !this.version.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'Version Service não inicializado'
        }
      }
      
      const stats = await this.version.getStats()
      
      return {
        status: 'healthy',
        message: 'Version Service operacional',
        details: {
          totalVersions: stats.totalVersions,
          totalSubjects: stats.totalSubjects
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Version Service com erro: ${error.message}`
      }
    }
  }

  async checkCompatibilityService() {
    try {
      if (!this.compatibility || !this.compatibility.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'Compatibility Service não inicializado'
        }
      }
      
      const stats = await this.compatibility.getCompatibilityStats()
      
      return {
        status: 'healthy',
        message: 'Compatibility Service operacional',
        details: {
          totalChecks: stats.totalChecks,
          compatibleChecks: stats.compatibleChecks
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Compatibility Service com erro: ${error.message}`
      }
    }
  }

  async checkMigrationService() {
    try {
      if (!this.migration || !this.migration.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'Migration Service não inicializado'
        }
      }
      
      const stats = await this.migration.getMigrationStats()
      const activeMigrations = await this.migration.getActiveMigrations()
      
      return {
        status: 'healthy',
        message: 'Migration Service operacional',
        details: {
          totalMigrations: stats.totalMigrations,
          activeMigrations: activeMigrations.length,
          successRate: stats.totalMigrations > 0 
            ? (stats.successfulMigrations / stats.totalMigrations * 100).toFixed(2) + '%'
            : 'N/A'
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Migration Service com erro: ${error.message}`
      }
    }
  }

  // Verificações de dependências
  async checkSQSConnection() {
    try {
      if (!this.sqs || !this.sqs.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'SQS Service não inicializado'
        }
      }
      
      const stats = await this.sqs.getQueueStats()
      
      return {
        status: 'healthy',
        message: 'SQS Connection operacional',
        details: {
          activeConsumers: Object.keys(stats.consumers).length,
          queuesMonitored: Object.keys(stats.queues).length
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `SQS Connection com erro: ${error.message}`
      }
    }
  }

  async checkCacheConnection() {
    try {
      if (!this.cache) {
        return {
          status: 'degraded',
          message: 'Cache não configurado'
        }
      }
      
      // Teste básico de cache
      const testKey = 'health-check-test'
      const testValue = Date.now().toString()
      
      await this.cache.set(testKey, testValue, 10)
      const retrievedValue = await this.cache.get(testKey)
      
      if (retrievedValue === testValue) {
        return {
          status: 'healthy',
          message: 'Cache operacional'
        }
      } else {
        return {
          status: 'unhealthy',
          message: 'Cache não está funcionando corretamente'
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Cache com erro: ${error.message}`
      }
    }
  }

  // Verificações de recursos do sistema
  async checkMemoryUsage() {
    try {
      const memUsage = process.memoryUsage()
      const totalMem = require('os').totalmem()
      const freeMem = require('os').freemem()
      
      const usedMemoryMB = Math.round(memUsage.rss / 1024 / 1024)
      const totalMemoryMB = Math.round(totalMem / 1024 / 1024)
      const freeMemoryMB = Math.round(freeMem / 1024 / 1024)
      const memoryUsagePercent = Math.round((memUsage.rss / totalMem) * 100)
      
      const threshold = this.config.healthCheck.thresholds?.memoryUsage || 80
      
      let status = 'healthy'
      let message = `Uso de memória: ${memoryUsagePercent}%`
      
      if (memoryUsagePercent > threshold) {
        status = 'unhealthy'
        message = `Uso de memória alto: ${memoryUsagePercent}% (limite: ${threshold}%)`
      } else if (memoryUsagePercent > threshold * 0.8) {
        status = 'degraded'
        message = `Uso de memória elevado: ${memoryUsagePercent}%`
      }
      
      return {
        status,
        message,
        details: {
          usedMB: usedMemoryMB,
          totalMB: totalMemoryMB,
          freeMB: freeMemoryMB,
          usagePercent: memoryUsagePercent,
          heap: {
            usedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
            totalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
          }
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Erro ao verificar memória: ${error.message}`
      }
    }
  }

  async checkDiskSpace() {
    try {
      // Verificação básica de espaço em disco
      // Em produção, seria necessário usar uma biblioteca específica
      return {
        status: 'healthy',
        message: 'Espaço em disco OK',
        details: {
          note: 'Verificação de disco não implementada completamente'
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Erro ao verificar disco: ${error.message}`
      }
    }
  }

  startPeriodicChecks() {
    const interval = this.config.healthCheck.interval || 30000 // 30 segundos
    
    this.checkInterval = setInterval(async () => {
      try {
        await this.performHealthCheck()
      } catch (error) {
        this.logger.error('Erro na verificação periódica de saúde:', error)
      }
    }, interval)
    
    this.logger.info(`Verificações periódicas de saúde iniciadas (intervalo: ${interval}ms)`)
  }

  stopPeriodicChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
      this.logger.info('Verificações periódicas de saúde paradas')
    }
  }

  getHealthStatus() {
    return this.healthStatus
  }

  getHealthSummary() {
    return {
      status: this.healthStatus.status,
      timestamp: this.healthStatus.timestamp,
      services: Object.keys(this.healthStatus.services).length,
      dependencies: Object.keys(this.healthStatus.dependencies).length,
      metrics: this.healthStatus.metrics
    }
  }

  async getDetailedHealth() {
    // Executar verificação em tempo real se necessário
    const lastCheck = new Date(this.healthStatus.timestamp)
    const now = new Date()
    const timeSinceLastCheck = now - lastCheck
    
    // Se a última verificação foi há mais de 1 minuto, executar nova verificação
    if (timeSinceLastCheck > 60000) {
      await this.performHealthCheck()
    }
    
    return this.healthStatus
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Health Service...')
      
      // Parar verificações periódicas
      this.stopPeriodicChecks()
      
      // Limpar recursos
      this.healthChecks.clear()
      
      this.isInitialized = false
      this.logger.info('Health Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Health Service:', error)
      throw error
    }
  }
}

module.exports = HealthService