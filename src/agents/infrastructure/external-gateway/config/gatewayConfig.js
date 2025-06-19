/**
 * Configuração do External Event API Gateway
 * Responsável por receber eventos externos via REST API
 */

module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.GATEWAY_PORT || 3007,
    host: process.env.GATEWAY_HOST || '0.0.0.0',
    timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    maxPayloadSize: process.env.MAX_PAYLOAD_SIZE || '10mb',
    environment: process.env.NODE_ENV || 'development'
  },

  // Configurações de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    enableConsole: process.env.ENABLE_CONSOLE_LOG !== 'false',
    enableFile: process.env.ENABLE_FILE_LOG === 'true',
    logFile: process.env.LOG_FILE || 'logs/gateway.log',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: process.env.LOG_MAX_SIZE || '20m'
  },

  // Configurações de segurança
  security: {
    enableApiKeys: process.env.ENABLE_API_KEYS !== 'false',
    apiKeyHeader: process.env.API_KEY_HEADER || 'x-api-key',
    enableCors: process.env.ENABLE_CORS !== 'false',
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
    enableHelmet: process.env.ENABLE_HELMET !== 'false',
    trustProxy: process.env.TRUST_PROXY === 'true'
  },

  // Configurações de rate limiting
  rateLimiting: {
    enabled: process.env.ENABLE_RATE_LIMITING !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minuto
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
    standardHeaders: process.env.RATE_LIMIT_STANDARD_HEADERS !== 'false',
    legacyHeaders: process.env.RATE_LIMIT_LEGACY_HEADERS === 'true'
  },

  // Configurações de validação de eventos
  validation: {
    enableStrictValidation: process.env.ENABLE_STRICT_VALIDATION !== 'false',
    maxEventSize: parseInt(process.env.MAX_EVENT_SIZE) || 1048576, // 1MB
    requiredFields: ['eventType', 'timestamp', 'source'],
    allowedEventTypes: process.env.ALLOWED_EVENT_TYPES ? 
      process.env.ALLOWED_EVENT_TYPES.split(',') : 
      ['user', 'system', 'application', 'security', 'business'],
    timestampTolerance: parseInt(process.env.TIMESTAMP_TOLERANCE) || 300000 // 5 minutos
  },

  // Configurações de transformação de eventos
  transformation: {
    enableTransformation: process.env.ENABLE_TRANSFORMATION !== 'false',
    addGatewayMetadata: process.env.ADD_GATEWAY_METADATA !== 'false',
    normalizeTimestamps: process.env.NORMALIZE_TIMESTAMPS !== 'false',
    generateEventIds: process.env.GENERATE_EVENT_IDS !== 'false',
    enrichWithClientInfo: process.env.ENRICH_CLIENT_INFO !== 'false'
  },

  // Configurações do Redis (para cache e rate limiting)
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 2,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'gateway:',
    ttl: parseInt(process.env.REDIS_TTL) || 3600, // 1 hora
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 100,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3
  },

  // Configurações das filas SQS
  sqs: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.SQS_ENDPOINT,
    
    // Filas de saída
    outputQueues: {
      rawEvents: {
        url: process.env.SQS_RAW_EVENTS_QUEUE || 'raw-events',
        enabled: process.env.ENABLE_RAW_EVENTS_QUEUE !== 'false'
      },
      incomingEvents: {
        url: process.env.SQS_INCOMING_EVENTS_QUEUE || 'incoming-events',
        enabled: process.env.ENABLE_INCOMING_EVENTS_QUEUE !== 'false'
      },
      validationErrors: {
        url: process.env.SQS_VALIDATION_ERRORS_QUEUE || 'validation-errors',
        enabled: process.env.ENABLE_VALIDATION_ERRORS_QUEUE !== 'false'
      }
    },

    // Configurações de envio
    sendMessage: {
      delaySeconds: parseInt(process.env.SQS_DELAY_SECONDS) || 0,
      messageRetentionPeriod: parseInt(process.env.SQS_RETENTION_PERIOD) || 1209600, // 14 dias
      visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT) || 30,
      maxReceiveCount: parseInt(process.env.SQS_MAX_RECEIVE_COUNT) || 3
    }
  },

  // Configurações de métricas
  metrics: {
    enabled: process.env.ENABLE_METRICS !== 'false',
    port: parseInt(process.env.METRICS_PORT) || 9090,
    path: process.env.METRICS_PATH || '/metrics',
    collectDefaultMetrics: process.env.COLLECT_DEFAULT_METRICS !== 'false',
    prefix: process.env.METRICS_PREFIX || 'gateway_',
    labels: {
      service: 'external-event-api-gateway',
      version: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  },

  // Configurações de health check
  healthCheck: {
    enabled: process.env.ENABLE_HEALTH_CHECK !== 'false',
    path: process.env.HEALTH_CHECK_PATH || '/api/gateway/health',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES) || 3,
    
    dependencies: {
      redis: process.env.HEALTH_CHECK_REDIS !== 'false',
      sqs: process.env.HEALTH_CHECK_SQS !== 'false'
    }
  },

  // Configurações de desenvolvimento
  development: {
    enableDebugLogs: process.env.ENABLE_DEBUG_LOGS === 'true',
    enableMockMode: process.env.ENABLE_MOCK_MODE === 'true',
    enableTestEndpoints: process.env.ENABLE_TEST_ENDPOINTS === 'true',
    logRequestBodies: process.env.LOG_REQUEST_BODIES === 'true',
    logResponseBodies: process.env.LOG_RESPONSE_BODIES === 'true'
  }
};