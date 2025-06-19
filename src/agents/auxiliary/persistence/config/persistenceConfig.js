/**
 * Configuração do Persistence Agent
 * Responsável por persistência avançada de dados e estado
 */

module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.PERSISTENCE_PORT || 3015,
    host: process.env.PERSISTENCE_HOST || 'localhost',
    timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    maxPayloadSize: process.env.MAX_PAYLOAD_SIZE || '10mb',
    environment: process.env.NODE_ENV || 'development'
  },

  // Configurações de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined',
    enableConsole: process.env.LOG_CONSOLE !== 'false',
    enableFile: process.env.LOG_FILE !== 'false',
    filename: process.env.LOG_FILENAME || 'logs/persistence-agent.log',
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: process.env.LOG_MAX_FILES || '5',
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
  },

  // Configurações de segurança
  security: {
    enableHelmet: process.env.ENABLE_HELMET !== 'false',
    enableCors: process.env.ENABLE_CORS !== 'false',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    trustProxy: process.env.TRUST_PROXY === 'true',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutos
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100
  },

  // Configurações SQS
  sqs: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.SQS_ENDPOINT || 'https://sqs.us-east-1.amazonaws.com',
    queuePrefix: process.env.QUEUE_PREFIX || 'agents-development',
    queues: {
      persistenceEvents: process.env.PERSISTENCE_EVENTS_QUEUE || 'persistence-events',
      stateChangeEvents: process.env.STATE_CHANGE_EVENTS_QUEUE || 'state-change-events',
      auditEvents: process.env.AUDIT_EVENTS_QUEUE || 'audit-events'
    },
    polling: {
      maxMessages: parseInt(process.env.SQS_MAX_MESSAGES) || 10,
      waitTimeSeconds: parseInt(process.env.SQS_WAIT_TIME) || 20,
      visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT) || 300
    },
    retry: {
      maxRetries: parseInt(process.env.SQS_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.SQS_RETRY_DELAY) || 1000
    }
  },

  // Configurações de persistência
  persistence: {
    // Configurações do banco de dados
    database: {
      type: process.env.DB_TYPE || 'mongodb', // mongodb, postgresql, mysql
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 27017,
      name: process.env.DB_NAME || 'agents_persistence',
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
      poolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
      timeout: parseInt(process.env.DB_TIMEOUT) || 30000
    },

    // Configurações de cache
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      type: process.env.CACHE_TYPE || 'redis', // redis, memory
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'persistence:',
      ttl: parseInt(process.env.CACHE_TTL) || 3600, // 1 hora
      maxMemory: process.env.CACHE_MAX_MEMORY || '100mb'
    },

    // Configurações de backup
    backup: {
      enabled: process.env.BACKUP_ENABLED !== 'false',
      interval: parseInt(process.env.BACKUP_INTERVAL) || 86400000, // 24 horas
      retention: parseInt(process.env.BACKUP_RETENTION) || 7, // 7 dias
      compression: process.env.BACKUP_COMPRESSION !== 'false',
      location: process.env.BACKUP_LOCATION || './backups',
      s3: {
        enabled: process.env.S3_BACKUP_ENABLED === 'true',
        bucket: process.env.S3_BACKUP_BUCKET,
        region: process.env.S3_BACKUP_REGION || 'us-east-1',
        prefix: process.env.S3_BACKUP_PREFIX || 'persistence-backups/'
      }
    },

    // Configurações de replicação
    replication: {
      enabled: process.env.REPLICATION_ENABLED === 'true',
      mode: process.env.REPLICATION_MODE || 'master-slave', // master-slave, master-master
      replicas: process.env.REPLICATION_REPLICAS ? process.env.REPLICATION_REPLICAS.split(',') : [],
      syncInterval: parseInt(process.env.REPLICATION_SYNC_INTERVAL) || 5000,
      conflictResolution: process.env.CONFLICT_RESOLUTION || 'timestamp' // timestamp, version, manual
    },

    // Configurações de particionamento
    partitioning: {
      enabled: process.env.PARTITIONING_ENABLED === 'true',
      strategy: process.env.PARTITIONING_STRATEGY || 'date', // date, hash, range
      partitionSize: parseInt(process.env.PARTITION_SIZE) || 1000000, // 1M registros
      autoPartition: process.env.AUTO_PARTITION !== 'false'
    }
  },

  // Configurações de validação
  validation: {
    strictMode: process.env.VALIDATION_STRICT_MODE !== 'false',
    maxDocumentSize: parseInt(process.env.MAX_DOCUMENT_SIZE) || 16777216, // 16MB
    requiredFields: process.env.REQUIRED_FIELDS ? process.env.REQUIRED_FIELDS.split(',') : ['id', 'timestamp', 'type'],
    allowedTypes: process.env.ALLOWED_TYPES ? process.env.ALLOWED_TYPES.split(',') : [
      'state', 'event', 'log', 'metric', 'audit', 'backup'
    ],
    schemaValidation: process.env.SCHEMA_VALIDATION !== 'false'
  },

  // Configurações de transformação
  transformation: {
    enabled: process.env.TRANSFORMATION_ENABLED !== 'false',
    addMetadata: process.env.ADD_METADATA !== 'false',
    normalizeTimestamp: process.env.NORMALIZE_TIMESTAMP !== 'false',
    generateId: process.env.GENERATE_ID !== 'false',
    encryptSensitiveData: process.env.ENCRYPT_SENSITIVE_DATA === 'true',
    compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false',
    compressionLevel: parseInt(process.env.COMPRESSION_LEVEL) || 6
  },

  // Configurações de métricas
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT) || 9090,
    path: process.env.METRICS_PATH || '/metrics',
    collectDefaultMetrics: process.env.COLLECT_DEFAULT_METRICS !== 'false',
    prefix: process.env.METRICS_PREFIX || 'persistence_',
    labels: {
      service: 'persistence-agent',
      version: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  },

  // Configurações de health check
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    path: process.env.HEALTH_CHECK_PATH || '/health',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES) || 3,
    dependencies: {
      database: process.env.HEALTH_CHECK_DATABASE !== 'false',
      cache: process.env.HEALTH_CHECK_CACHE !== 'false',
      sqs: process.env.HEALTH_CHECK_SQS !== 'false'
    }
  },

  // Configurações de desenvolvimento
  development: {
    enableDebugLogs: process.env.DEBUG_LOGS === 'true',
    mockMode: process.env.MOCK_MODE === 'true',
    testEndpoints: process.env.TEST_ENDPOINTS === 'true',
    logRequestBody: process.env.LOG_REQUEST_BODY === 'true',
    logResponseBody: process.env.LOG_RESPONSE_BODY === 'true',
    enableProfiler: process.env.ENABLE_PROFILER === 'true'
  }
};