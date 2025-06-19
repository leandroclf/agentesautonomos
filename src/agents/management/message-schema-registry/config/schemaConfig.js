/**
 * Message Schema Registry Configuration
 * Configurações para gerenciamento de esquemas de mensagens
 */

module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.PORT || 3022,
    host: process.env.HOST || '0.0.0.0',
    name: 'message-schema-registry',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // Configurações de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
  },

  // Configurações de segurança
  security: {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:']
        }
      },
      crossOriginEmbedderPolicy: false
    },
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Schema-Version']
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: 'Muitas requisições deste IP'
    },
    apiKey: process.env.API_KEY || 'schema-registry-api-key',
    jwtSecret: process.env.JWT_SECRET || 'schema-registry-jwt-secret'
  },

  // Configurações AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_SQS_ENDPOINT
  },

  // Configurações SQS
  sqs: {
    queues: {
      schemaEvents: process.env.SQS_QUEUE_SCHEMA_EVENTS || 'schema-registry-events',
      validationEvents: process.env.SQS_QUEUE_VALIDATION_EVENTS || 'schema-validation-events',
      migrationEvents: process.env.SQS_QUEUE_MIGRATION_EVENTS || 'schema-migration-events',
      dlq: process.env.SQS_QUEUE_DLQ || 'schema-registry-dlq'
    },
    polling: {
      waitTimeSeconds: parseInt(process.env.SQS_POLLING_WAIT_TIME) || 20,
      maxNumberOfMessages: parseInt(process.env.SQS_MAX_MESSAGES) || 10,
      visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT) || 300
    },
    messageRetention: parseInt(process.env.SQS_MESSAGE_RETENTION) || 1209600,
    maxRetries: parseInt(process.env.SQS_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.SQS_RETRY_DELAY) || 5000
  },

  // Configurações de esquemas
  schema: {
    // Formatos suportados
    supportedFormats: ['json-schema', 'avro', 'protobuf'],
    defaultFormat: 'json-schema',
    
    // Versionamento
    versioning: {
      strategy: process.env.SCHEMA_VERSIONING_STRATEGY || 'semantic', // semantic, sequential
      autoIncrement: process.env.SCHEMA_AUTO_INCREMENT === 'true',
      maxVersions: parseInt(process.env.SCHEMA_MAX_VERSIONS) || 100
    },
    
    // Políticas de compatibilidade
    compatibility: {
      default: process.env.SCHEMA_COMPATIBILITY_DEFAULT || 'backward', // backward, forward, full, none
      enforceOnRegistration: process.env.SCHEMA_ENFORCE_COMPATIBILITY === 'true',
      allowBreakingChanges: process.env.SCHEMA_ALLOW_BREAKING_CHANGES === 'true'
    },
    
    // Validação
    validation: {
      enabled: process.env.SCHEMA_VALIDATION_ENABLED !== 'false',
      strictMode: process.env.SCHEMA_STRICT_MODE === 'true',
      validateOnRegistration: process.env.SCHEMA_VALIDATE_ON_REGISTRATION !== 'false',
      cacheValidationResults: process.env.SCHEMA_CACHE_VALIDATION === 'true',
      maxValidationErrors: parseInt(process.env.SCHEMA_MAX_VALIDATION_ERRORS) || 10
    },
    
    // Armazenamento
    storage: {
      type: process.env.SCHEMA_STORAGE_TYPE || 'memory', // memory, redis, mongodb
      ttl: parseInt(process.env.SCHEMA_STORAGE_TTL) || 3600000, // 1 hora
      maxSize: parseInt(process.env.SCHEMA_STORAGE_MAX_SIZE) || 1000,
      compression: process.env.SCHEMA_STORAGE_COMPRESSION === 'true'
    }
  },

  // Configurações de migração
  migration: {
    enabled: process.env.MIGRATION_ENABLED !== 'false',
    autoMigration: process.env.MIGRATION_AUTO === 'true',
    batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE) || 100,
    timeout: parseInt(process.env.MIGRATION_TIMEOUT) || 300000, // 5 minutos
    retryAttempts: parseInt(process.env.MIGRATION_RETRY_ATTEMPTS) || 3,
    backupBeforeMigration: process.env.MIGRATION_BACKUP === 'true'
  },

  // Configurações de cache
  cache: {
    type: process.env.CACHE_TYPE || 'memory', // memory, redis
    ttl: parseInt(process.env.CACHE_TTL) || 300000, // 5 minutos
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
    
    // Redis (se usado)
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'schema:'
    }
  },

  // Configurações de métricas
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT) || 9090,
    path: process.env.METRICS_PATH || '/metrics',
    prometheus: {
      enabled: process.env.PROMETHEUS_ENABLED !== 'false',
      collectDefaultMetrics: true,
      timeout: 5000
    },
    collectionInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL) || 15000
  },

  // Configurações de alertas
  alerts: {
    enabled: process.env.ALERT_ENABLED !== 'false',
    
    // Webhook
    webhook: {
      url: process.env.ALERT_WEBHOOK_URL,
      timeout: parseInt(process.env.ALERT_WEBHOOK_TIMEOUT) || 5000,
      retries: parseInt(process.env.ALERT_WEBHOOK_RETRIES) || 3
    },
    
    // Email
    email: {
      enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
      host: process.env.ALERT_EMAIL_HOST,
      port: parseInt(process.env.ALERT_EMAIL_PORT) || 587,
      secure: process.env.ALERT_EMAIL_SECURE === 'true',
      user: process.env.ALERT_EMAIL_USER,
      pass: process.env.ALERT_EMAIL_PASS,
      from: process.env.ALERT_EMAIL_FROM,
      to: process.env.ALERT_EMAIL_TO
    },
    
    // Tipos de alertas
    types: {
      schemaRegistrationFailed: { severity: 'high', enabled: true },
      validationFailed: { severity: 'medium', enabled: true },
      compatibilityViolation: { severity: 'high', enabled: true },
      migrationFailed: { severity: 'critical', enabled: true },
      storageError: { severity: 'high', enabled: true },
      highValidationErrorRate: { severity: 'medium', enabled: true }
    }
  },

  // Configurações de health check
  health: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES) || 3,
    
    // Dependências para verificar
    dependencies: {
      sqs: {
        enabled: true,
        timeout: 5000
      },
      cache: {
        enabled: true,
        timeout: 3000
      },
      storage: {
        enabled: true,
        timeout: 5000
      }
    },
    
    // Thresholds
    thresholds: {
      memoryUsage: 0.9, // 90%
      cpuUsage: 0.8,    // 80%
      responseTime: 5000, // 5 segundos
      errorRate: 0.1     // 10%
    }
  },

  // Configurações de API
  api: {
    version: 'v1',
    basePath: '/api/v1',
    
    // Documentação
    docs: {
      enabled: process.env.API_DOCS_ENABLED !== 'false',
      path: '/docs',
      title: 'Message Schema Registry API',
      description: 'API para gerenciamento de esquemas de mensagens'
    },
    
    // Paginação
    pagination: {
      defaultLimit: parseInt(process.env.API_DEFAULT_LIMIT) || 20,
      maxLimit: parseInt(process.env.API_MAX_LIMIT) || 100
    },
    
    // Timeouts
    timeouts: {
      request: parseInt(process.env.API_REQUEST_TIMEOUT) || 30000,
      response: parseInt(process.env.API_RESPONSE_TIMEOUT) || 30000
    }
  },

  // Configurações de desenvolvimento
  development: {
    debug: process.env.DEBUG_ENABLED === 'true',
    mockMode: process.env.MOCK_MODE === 'true',
    testMode: process.env.TEST_MODE === 'true',
    hotReload: process.env.HOT_RELOAD === 'true',
    verboseLogging: process.env.VERBOSE_LOGGING === 'true'
  },

  // Configurações de performance
  performance: {
    maxConcurrentValidations: parseInt(process.env.MAX_CONCURRENT_VALIDATIONS) || 50,
    validationTimeout: parseInt(process.env.VALIDATION_TIMEOUT) || 10000,
    batchValidationSize: parseInt(process.env.BATCH_VALIDATION_SIZE) || 10,
    compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false',
    compressionLevel: parseInt(process.env.COMPRESSION_LEVEL) || 6
  },

  // Configurações de backup
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    interval: parseInt(process.env.BACKUP_INTERVAL) || 3600000, // 1 hora
    retention: parseInt(process.env.BACKUP_RETENTION_DAYS) || 7,
    location: process.env.BACKUP_LOCATION || './backups',
    compression: process.env.BACKUP_COMPRESSION === 'true',
    encryption: process.env.BACKUP_ENCRYPTION === 'true'
  },

  // Registro de agentes conhecidos
  knownAgents: {
    'data-ingestion': {
      name: 'Data Ingestion Agent',
      port: 3001,
      schemas: ['data-ingestion-event', 'raw-data-schema']
    },
    'nlp-processor': {
      name: 'NLP Processor Agent',
      port: 3002,
      schemas: ['nlp-request', 'nlp-response', 'text-analysis-result']
    },
    'ml-inference': {
      name: 'ML Inference Agent',
      port: 3003,
      schemas: ['inference-request', 'prediction-result', 'model-metadata']
    },
    'data-processor': {
      name: 'Data Processor Agent',
      port: 3004,
      schemas: ['processing-task', 'processed-data', 'transformation-rule']
    },
    'api-gateway': {
      name: 'API Gateway Agent',
      port: 3005,
      schemas: ['api-request', 'api-response', 'route-config']
    },
    'user-interaction': {
      name: 'User Interaction Agent',
      port: 3006,
      schemas: ['user-message', 'bot-response', 'conversation-context']
    },
    'message-queue': {
      name: 'Message Queue Agent',
      port: 3007,
      schemas: ['queue-message', 'queue-config', 'delivery-receipt']
    },
    'external-gateway': {
      name: 'External Gateway Agent',
      port: 3008,
      schemas: ['external-request', 'external-response', 'integration-config']
    },
    'mediator': {
      name: 'Mediator Agent',
      port: 3009,
      schemas: ['mediation-request', 'coordination-message', 'agent-status']
    },
    'marl-coordinator': {
      name: 'MARL Coordinator Agent',
      port: 3010,
      schemas: ['coordination-task', 'agent-action', 'reward-signal']
    },
    'marl-learner': {
      name: 'MARL Learner Agent',
      port: 3011,
      schemas: ['learning-episode', 'policy-update', 'experience-replay']
    },
    'marl-environment': {
      name: 'MARL Environment Agent',
      port: 3012,
      schemas: ['environment-state', 'action-space', 'reward-function']
    },
    'bdi-belief': {
      name: 'BDI Belief Agent',
      port: 3013,
      schemas: ['belief-update', 'knowledge-base', 'fact-assertion']
    },
    'bdi-desire': {
      name: 'BDI Desire Agent',
      port: 3014,
      schemas: ['goal-definition', 'desire-priority', 'goal-achievement']
    },
    'health-checker': {
      name: 'Health Checker Agent',
      port: 3015,
      schemas: ['health-check-request', 'health-status', 'diagnostic-info']
    },
    'observability': {
      name: 'Observability Agent',
      port: 3016,
      schemas: ['metric-data', 'trace-span', 'log-entry']
    },
    'security-auth': {
      name: 'Security Authentication Agent',
      port: 3017,
      schemas: ['auth-request', 'auth-token', 'permission-check']
    },
    'persistence': {
      name: 'Persistence Agent',
      port: 3018,
      schemas: ['persistence-request', 'data-snapshot', 'backup-metadata']
    },
    'recovery': {
      name: 'Recovery Agent',
      port: 3019,
      schemas: ['recovery-request', 'recovery-plan', 'recovery-status']
    },
    'fallback': {
      name: 'Fallback Agent',
      port: 3020,
      schemas: ['fallback-trigger', 'circuit-breaker-state', 'degradation-config']
    },
    'agent-lifecycle-manager': {
      name: 'Agent Lifecycle Manager',
      port: 3021,
      schemas: ['lifecycle-command', 'agent-state', 'deployment-config']
    }
  }
}