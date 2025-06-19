/**
 * Metrics Service - Coleta e Exposição de Métricas
 * Responsável por coletar, armazenar e expor métricas do sistema
 */

const { EventEmitter } = require('events')
const promClient = require('prom-client')

class MetricsService extends EventEmitter {
  constructor({ config, logger }) {
    super()
    this.config = config
    this.logger = logger
    
    this.registry = new promClient.Registry()
    this.metrics = new Map()
    this.customMetrics = new Map()
    
    this.collectInterval = null
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Metrics Service...')
      
      // Configurar registro de métricas
      this.setupRegistry()
      
      // Registrar métricas padrão
      this.registerDefaultMetrics()
      
      // Registrar métricas customizadas
      this.registerCustomMetrics()
      
      // Iniciar coleta periódica
      if (this.config.metrics.enabled) {
        this.startPeriodicCollection()
      }
      
      this.isInitialized = true
      this.logger.info('Metrics Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Metrics Service:', error)
      throw error
    }
  }

  setupRegistry() {
    // Configurar prefixo para métricas
    this.registry.setDefaultLabels({
      service: 'message-schema-registry',
      version: this.config.version || '1.0.0',
      environment: this.config.environment || 'development'
    })
    
    // Registrar métricas padrão do Node.js
    if (this.config.metrics.collectDefaultMetrics) {
      promClient.collectDefaultMetrics({
        register: this.registry,
        prefix: 'msr_',
        timeout: 5000
      })
    }
  }

  registerDefaultMetrics() {
    // Métricas de requisições HTTP
    this.metrics.set('http_requests_total', new promClient.Counter({
      name: 'msr_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry]
    }))
    
    this.metrics.set('http_request_duration', new promClient.Histogram({
      name: 'msr_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry]
    }))
    
    // Métricas de schemas
    this.metrics.set('schemas_total', new promClient.Gauge({
      name: 'msr_schemas_total',
      help: 'Total number of registered schemas',
      labelNames: ['format'],
      registers: [this.registry]
    }))
    
    this.metrics.set('schema_operations_total', new promClient.Counter({
      name: 'msr_schema_operations_total',
      help: 'Total number of schema operations',
      labelNames: ['operation', 'format', 'status'],
      registers: [this.registry]
    }))
    
    // Métricas de validação
    this.metrics.set('validations_total', new promClient.Counter({
      name: 'msr_validations_total',
      help: 'Total number of validations performed',
      labelNames: ['subject', 'version', 'format', 'status'],
      registers: [this.registry]
    }))
    
    this.metrics.set('validation_duration', new promClient.Histogram({
      name: 'msr_validation_duration_seconds',
      help: 'Duration of validations in seconds',
      labelNames: ['subject', 'format'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry]
    }))
    
    this.metrics.set('validation_errors_total', new promClient.Counter({
      name: 'msr_validation_errors_total',
      help: 'Total number of validation errors',
      labelNames: ['subject', 'error_type'],
      registers: [this.registry]
    }))
    
    // Métricas de versionamento
    this.metrics.set('versions_total', new promClient.Gauge({
      name: 'msr_versions_total',
      help: 'Total number of schema versions',
      labelNames: ['subject'],
      registers: [this.registry]
    }))
    
    this.metrics.set('version_operations_total', new promClient.Counter({
      name: 'msr_version_operations_total',
      help: 'Total number of version operations',
      labelNames: ['operation', 'change_type'],
      registers: [this.registry]
    }))
    
    // Métricas de compatibilidade
    this.metrics.set('compatibility_checks_total', new promClient.Counter({
      name: 'msr_compatibility_checks_total',
      help: 'Total number of compatibility checks',
      labelNames: ['policy', 'result'],
      registers: [this.registry]
    }))
    
    this.metrics.set('compatibility_check_duration', new promClient.Histogram({
      name: 'msr_compatibility_check_duration_seconds',
      help: 'Duration of compatibility checks in seconds',
      labelNames: ['policy'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
      registers: [this.registry]
    }))
    
    // Métricas de migração
    this.metrics.set('migrations_total', new promClient.Counter({
      name: 'msr_migrations_total',
      help: 'Total number of migrations performed',
      labelNames: ['strategy', 'status'],
      registers: [this.registry]
    }))
    
    this.metrics.set('migration_duration', new promClient.Histogram({
      name: 'msr_migration_duration_seconds',
      help: 'Duration of migrations in seconds',
      labelNames: ['strategy'],
      buckets: [1, 5, 10, 30, 60, 300, 600],
      registers: [this.registry]
    }))
    
    this.metrics.set('active_migrations', new promClient.Gauge({
      name: 'msr_active_migrations',
      help: 'Number of currently active migrations',
      registers: [this.registry]
    }))
    
    // Métricas de SQS
    this.metrics.set('sqs_messages_total', new promClient.Counter({
      name: 'msr_sqs_messages_total',
      help: 'Total number of SQS messages processed',
      labelNames: ['queue', 'operation', 'status'],
      registers: [this.registry]
    }))
    
    this.metrics.set('sqs_message_processing_duration', new promClient.Histogram({
      name: 'msr_sqs_message_processing_duration_seconds',
      help: 'Duration of SQS message processing in seconds',
      labelNames: ['queue'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry]
    }))
    
    // Métricas de cache
    this.metrics.set('cache_operations_total', new promClient.Counter({
      name: 'msr_cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['operation', 'result'],
      registers: [this.registry]
    }))
    
    this.metrics.set('cache_hit_ratio', new promClient.Gauge({
      name: 'msr_cache_hit_ratio',
      help: 'Cache hit ratio',
      registers: [this.registry]
    }))
    
    // Métricas de saúde
    this.metrics.set('health_check_status', new promClient.Gauge({
      name: 'msr_health_check_status',
      help: 'Health check status (1=healthy, 0=unhealthy)',
      labelNames: ['check_name'],
      registers: [this.registry]
    }))
    
    this.metrics.set('health_check_duration', new promClient.Histogram({
      name: 'msr_health_check_duration_seconds',
      help: 'Duration of health checks in seconds',
      labelNames: ['check_name'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry]
    }))
  }

  registerCustomMetrics() {
    // Métricas customizadas podem ser adicionadas aqui
    // Exemplo: métricas de negócio específicas
    
    this.customMetrics.set('business_events_total', new promClient.Counter({
      name: 'msr_business_events_total',
      help: 'Total number of business events',
      labelNames: ['event_type', 'source'],
      registers: [this.registry]
    }))
    
    this.customMetrics.set('data_quality_score', new promClient.Gauge({
      name: 'msr_data_quality_score',
      help: 'Data quality score (0-100)',
      labelNames: ['subject'],
      registers: [this.registry]
    }))
  }

  // Métodos para incrementar métricas
  incrementHttpRequests(method, route, statusCode) {
    const metric = this.metrics.get('http_requests_total')
    if (metric) {
      metric.inc({ method, route, status_code: statusCode })
    }
  }

  recordHttpRequestDuration(method, route, statusCode, duration) {
    const metric = this.metrics.get('http_request_duration')
    if (metric) {
      metric.observe({ method, route, status_code: statusCode }, duration)
    }
  }

  updateSchemasTotal(format, count) {
    const metric = this.metrics.get('schemas_total')
    if (metric) {
      metric.set({ format }, count)
    }
  }

  incrementSchemaOperations(operation, format, status) {
    const metric = this.metrics.get('schema_operations_total')
    if (metric) {
      metric.inc({ operation, format, status })
    }
  }

  incrementValidations(subject, version, format, status) {
    const metric = this.metrics.get('validations_total')
    if (metric) {
      metric.inc({ subject, version, format, status })
    }
  }

  recordValidationDuration(subject, format, duration) {
    const metric = this.metrics.get('validation_duration')
    if (metric) {
      metric.observe({ subject, format }, duration)
    }
  }

  incrementValidationErrors(subject, errorType) {
    const metric = this.metrics.get('validation_errors_total')
    if (metric) {
      metric.inc({ subject, error_type: errorType })
    }
  }

  updateVersionsTotal(subject, count) {
    const metric = this.metrics.get('versions_total')
    if (metric) {
      metric.set({ subject }, count)
    }
  }

  incrementVersionOperations(operation, changeType) {
    const metric = this.metrics.get('version_operations_total')
    if (metric) {
      metric.inc({ operation, change_type: changeType })
    }
  }

  incrementCompatibilityChecks(policy, result) {
    const metric = this.metrics.get('compatibility_checks_total')
    if (metric) {
      metric.inc({ policy, result })
    }
  }

  recordCompatibilityCheckDuration(policy, duration) {
    const metric = this.metrics.get('compatibility_check_duration')
    if (metric) {
      metric.observe({ policy }, duration)
    }
  }

  incrementMigrations(strategy, status) {
    const metric = this.metrics.get('migrations_total')
    if (metric) {
      metric.inc({ strategy, status })
    }
  }

  recordMigrationDuration(strategy, duration) {
    const metric = this.metrics.get('migration_duration')
    if (metric) {
      metric.observe({ strategy }, duration)
    }
  }

  updateActiveMigrations(count) {
    const metric = this.metrics.get('active_migrations')
    if (metric) {
      metric.set(count)
    }
  }

  incrementSQSMessages(queue, operation, status) {
    const metric = this.metrics.get('sqs_messages_total')
    if (metric) {
      metric.inc({ queue, operation, status })
    }
  }

  recordSQSMessageProcessingDuration(queue, duration) {
    const metric = this.metrics.get('sqs_message_processing_duration')
    if (metric) {
      metric.observe({ queue }, duration)
    }
  }

  incrementCacheOperations(operation, result) {
    const metric = this.metrics.get('cache_operations_total')
    if (metric) {
      metric.inc({ operation, result })
    }
  }

  updateCacheHitRatio(ratio) {
    const metric = this.metrics.get('cache_hit_ratio')
    if (metric) {
      metric.set(ratio)
    }
  }

  updateHealthCheckStatus(checkName, status) {
    const metric = this.metrics.get('health_check_status')
    if (metric) {
      metric.set({ check_name: checkName }, status === 'healthy' ? 1 : 0)
    }
  }

  recordHealthCheckDuration(checkName, duration) {
    const metric = this.metrics.get('health_check_duration')
    if (metric) {
      metric.observe({ check_name: checkName }, duration)
    }
  }

  // Métodos para métricas customizadas
  incrementBusinessEvents(eventType, source) {
    const metric = this.customMetrics.get('business_events_total')
    if (metric) {
      metric.inc({ event_type: eventType, source })
    }
  }

  updateDataQualityScore(subject, score) {
    const metric = this.customMetrics.get('data_quality_score')
    if (metric) {
      metric.set({ subject }, score)
    }
  }

  // Método para criar métricas dinâmicas
  createCustomMetric(name, type, help, labelNames = []) {
    try {
      let metric
      
      switch (type.toLowerCase()) {
        case 'counter':
          metric = new promClient.Counter({
            name: `msr_${name}`,
            help,
            labelNames,
            registers: [this.registry]
          })
          break
        case 'gauge':
          metric = new promClient.Gauge({
            name: `msr_${name}`,
            help,
            labelNames,
            registers: [this.registry]
          })
          break
        case 'histogram':
          metric = new promClient.Histogram({
            name: `msr_${name}`,
            help,
            labelNames,
            buckets: [0.1, 0.5, 1, 2, 5, 10],
            registers: [this.registry]
          })
          break
        case 'summary':
          metric = new promClient.Summary({
            name: `msr_${name}`,
            help,
            labelNames,
            registers: [this.registry]
          })
          break
        default:
          throw new Error(`Tipo de métrica não suportado: ${type}`)
      }
      
      this.customMetrics.set(name, metric)
      this.logger.debug(`Métrica customizada criada: ${name}`)
      
      return metric
    } catch (error) {
      this.logger.error(`Erro ao criar métrica customizada ${name}:`, error)
      throw error
    }
  }

  // Método para obter uma métrica
  getMetric(name) {
    return this.metrics.get(name) || this.customMetrics.get(name)
  }

  // Método para coletar todas as métricas
  async collectMetrics() {
    try {
      return await this.registry.metrics()
    } catch (error) {
      this.logger.error('Erro ao coletar métricas:', error)
      throw error
    }
  }

  // Método para obter métricas em formato JSON
  async getMetricsAsJSON() {
    try {
      return await this.registry.getMetricsAsJSON()
    } catch (error) {
      this.logger.error('Erro ao obter métricas em JSON:', error)
      throw error
    }
  }

  // Método para resetar métricas
  resetMetrics() {
    try {
      this.registry.resetMetrics()
      this.logger.info('Métricas resetadas')
    } catch (error) {
      this.logger.error('Erro ao resetar métricas:', error)
      throw error
    }
  }

  // Coleta periódica de métricas do sistema
  startPeriodicCollection() {
    const interval = this.config.metrics.collectionInterval || 30000 // 30 segundos
    
    this.collectInterval = setInterval(async () => {
      try {
        await this.collectSystemMetrics()
      } catch (error) {
        this.logger.error('Erro na coleta periódica de métricas:', error)
      }
    }, interval)
    
    this.logger.info(`Coleta periódica de métricas iniciada (intervalo: ${interval}ms)`)
  }

  stopPeriodicCollection() {
    if (this.collectInterval) {
      clearInterval(this.collectInterval)
      this.collectInterval = null
      this.logger.info('Coleta periódica de métricas parada')
    }
  }

  async collectSystemMetrics() {
    try {
      // Coletar métricas de memória
      const memUsage = process.memoryUsage()
      const memoryMetric = this.getMetric('memory_usage') || this.createCustomMetric(
        'memory_usage_bytes',
        'gauge',
        'Memory usage in bytes',
        ['type']
      )
      
      memoryMetric.set({ type: 'rss' }, memUsage.rss)
      memoryMetric.set({ type: 'heap_used' }, memUsage.heapUsed)
      memoryMetric.set({ type: 'heap_total' }, memUsage.heapTotal)
      memoryMetric.set({ type: 'external' }, memUsage.external)
      
      // Coletar métricas de CPU
      const cpuUsage = process.cpuUsage()
      const cpuMetric = this.getMetric('cpu_usage') || this.createCustomMetric(
        'cpu_usage_microseconds',
        'gauge',
        'CPU usage in microseconds',
        ['type']
      )
      
      cpuMetric.set({ type: 'user' }, cpuUsage.user)
      cpuMetric.set({ type: 'system' }, cpuUsage.system)
      
      // Coletar métricas de uptime
      const uptimeMetric = this.getMetric('uptime') || this.createCustomMetric(
        'uptime_seconds',
        'gauge',
        'Process uptime in seconds'
      )
      
      uptimeMetric.set(process.uptime())
      
      // Emitir evento de coleta
      this.emit('metrics.collected', {
        timestamp: new Date().toISOString(),
        memory: memUsage,
        cpu: cpuUsage,
        uptime: process.uptime()
      })
      
    } catch (error) {
      this.logger.error('Erro ao coletar métricas do sistema:', error)
    }
  }

  // Método para obter estatísticas das métricas
  getMetricsStats() {
    return {
      totalMetrics: this.metrics.size + this.customMetrics.size,
      defaultMetrics: this.metrics.size,
      customMetrics: this.customMetrics.size,
      registryMetrics: this.registry.getMetricsAsArray().length,
      isCollecting: !!this.collectInterval
    }
  }

  // Método para exportar configuração de métricas
  exportMetricsConfig() {
    const config = {
      metrics: [],
      customMetrics: []
    }
    
    // Exportar métricas padrão
    for (const [name, metric] of this.metrics.entries()) {
      config.metrics.push({
        name,
        type: metric.constructor.name,
        help: metric.help,
        labelNames: metric.labelNames
      })
    }
    
    // Exportar métricas customizadas
    for (const [name, metric] of this.customMetrics.entries()) {
      config.customMetrics.push({
        name,
        type: metric.constructor.name,
        help: metric.help,
        labelNames: metric.labelNames
      })
    }
    
    return config
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Metrics Service...')
      
      // Parar coleta periódica
      this.stopPeriodicCollection()
      
      // Limpar registro
      this.registry.clear()
      
      // Limpar métricas
      this.metrics.clear()
      this.customMetrics.clear()
      
      this.isInitialized = false
      this.logger.info('Metrics Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Metrics Service:', error)
      throw error
    }
  }
}

module.exports = MetricsService