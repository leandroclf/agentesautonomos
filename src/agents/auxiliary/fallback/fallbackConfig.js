/**
 * Fallback Agent Configuration
 * Configurações para estratégias de fallback e recuperação
 */

module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.PORT || 3020,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // Configurações de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    compress: process.env.LOG_COMPRESS === 'true',
    directory: process.env.LOG_DIR || './logs'
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
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    },
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
      message: 'Muitas requisições deste IP'
    }
  },

  // Configurações AWS SQS
  sqs: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.SQS_ENDPOINT,
    queues: {
      fallback: {
        url: process.env.SQS_FALLBACK_QUEUE_URL || 'https://sqs.us-east-1.amazonaws.com/123456789/fallback-events',
        dlq: process.env.SQS_FALLBACK_DLQ_URL || 'https://sqs.us-east-1.amazonaws.com/123456789/fallback-events-dlq'
      },
      recovery: {
        url: process.env.SQS_RECOVERY_QUEUE_URL || 'https://sqs.us-east-1.amazonaws.com/123456789/recovery-events'
      },
      healthCheck: {
        url: process.env.SQS_HEALTH_CHECK_QUEUE_URL || 'https://sqs.us-east-1.amazonaws.com/123456789/health-check-events'
      }
    },
    polling: {
      maxMessages: parseInt(process.env.SQS_MAX_MESSAGES) || 10,
      waitTimeSeconds: parseInt(process.env.SQS_WAIT_TIME) || 20,
      visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT) || 300
    },
    retry: {
      maxAttempts: parseInt(process.env.SQS_RETRY_MAX_ATTEMPTS) || 3,
      delayMs: parseInt(process.env.SQS_RETRY_DELAY_MS) || 1000,
      exponentialBackoff: process.env.SQS_RETRY_EXPONENTIAL_BACKOFF === 'true'
    }
  },

  // Configurações de Fallback
  fallback: {
    // Estratégias de fallback
    strategies: {
      // Circuit Breaker
      circuitBreaker: {
        enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
        failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD) || 5,
        recoveryTimeout: parseInt(process.env.CIRCUIT_BREAKER_RECOVERY_TIMEOUT) || 60000,
        monitoringPeriod: parseInt(process.env.CIRCUIT_BREAKER_MONITORING_PERIOD) || 10000,
        expectedExceptionTypes: ['TimeoutError', 'ConnectionError', 'ServiceUnavailableError']
      },

      // Retry com backoff
      retry: {
        enabled: process.env.RETRY_ENABLED !== 'false',
        maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS) || 3,
        initialDelay: parseInt(process.env.RETRY_INITIAL_DELAY) || 1000,
        maxDelay: parseInt(process.env.RETRY_MAX_DELAY) || 30000,
        backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER) || 2.0,
        jitter: process.env.RETRY_JITTER === 'true',
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']
      },

      // Degradação graceful
      gracefulDegradation: {
        enabled: process.env.GRACEFUL_DEGRADATION_ENABLED !== 'false',
        levels: {
          minimal: {
            description: 'Funcionalidade mínima essencial',
            disabledFeatures: ['analytics', 'logging', 'metrics'],
            priority: 1
          },
          reduced: {
            description: 'Funcionalidade reduzida',
            disabledFeatures: ['analytics', 'advanced-logging'],
            priority: 2
          },
          normal: {
            description: 'Funcionalidade completa',
            disabledFeatures: [],
            priority: 3
          }
        },
        autoDowngrade: process.env.AUTO_DOWNGRADE === 'true',
        upgradeThreshold: parseFloat(process.env.UPGRADE_THRESHOLD) || 0.8,
        downgradeThreshold: parseFloat(process.env.DOWNGRADE_THRESHOLD) || 0.3
      },

      // Timeout adaptativo
      adaptiveTimeout: {
        enabled: process.env.ADAPTIVE_TIMEOUT_ENABLED !== 'false',
        baseTimeout: parseInt(process.env.ADAPTIVE_TIMEOUT_BASE) || 5000,
        maxTimeout: parseInt(process.env.ADAPTIVE_TIMEOUT_MAX) || 30000,
        minTimeout: parseInt(process.env.ADAPTIVE_TIMEOUT_MIN) || 1000,
        adjustmentFactor: parseFloat(process.env.ADAPTIVE_TIMEOUT_ADJUSTMENT) || 1.5,
        windowSize: parseInt(process.env.ADAPTIVE_TIMEOUT_WINDOW_SIZE) || 100
      },

      // Bulkhead (isolamento)
      bulkhead: {
        enabled: process.env.BULKHEAD_ENABLED !== 'false',
        pools: {
          critical: {
            maxConcurrent: parseInt(process.env.BULKHEAD_CRITICAL_MAX) || 10,
            queueSize: parseInt(process.env.BULKHEAD_CRITICAL_QUEUE) || 50
          },
          normal: {
            maxConcurrent: parseInt(process.env.BULKHEAD_NORMAL_MAX) || 20,
            queueSize: parseInt(process.env.BULKHEAD_NORMAL_QUEUE) || 100
          },
          background: {
            maxConcurrent: parseInt(process.env.BULKHEAD_BACKGROUND_MAX) || 5,
            queueSize: parseInt(process.env.BULKHEAD_BACKGROUND_QUEUE) || 200
          }
        }
      }
    },

    // Configurações de monitoramento
    monitoring: {
      enabled: process.env.FALLBACK_MONITORING_ENABLED !== 'false',
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
      metricsCollectionInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL) || 10000,
      alertThresholds: {
        errorRate: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD) || 0.1,
        responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_THRESHOLD) || 5000,
        circuitBreakerOpen: process.env.ALERT_CIRCUIT_BREAKER_OPEN === 'true'
      }
    },

    // Cache de decisões de fallback
    cache: {
      enabled: process.env.FALLBACK_CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.FALLBACK_CACHE_TTL) || 300000, // 5 minutos
      maxSize: parseInt(process.env.FALLBACK_CACHE_MAX_SIZE) || 1000,
      cleanupInterval: parseInt(process.env.FALLBACK_CACHE_CLEANUP_INTERVAL) || 60000
    }
  },

  // Configurações de integração com outros agentes
  integration: {
    // Recovery Agent
    recovery: {
      enabled: process.env.RECOVERY_INTEGRATION_ENABLED !== 'false',
      endpoint: process.env.RECOVERY_AGENT_ENDPOINT || 'http://localhost:3017',
      timeout: parseInt(process.env.RECOVERY_AGENT_TIMEOUT) || 10000,
      retries: parseInt(process.env.RECOVERY_AGENT_RETRIES) || 2
    },

    // Health Checker Agent
    healthChecker: {
      enabled: process.env.HEALTH_CHECKER_INTEGRATION_ENABLED !== 'false',
      endpoint: process.env.HEALTH_CHECKER_AGENT_ENDPOINT || 'http://localhost:3015',
      timeout: parseInt(process.env.HEALTH_CHECKER_AGENT_TIMEOUT) || 5000,
      retries: parseInt(process.env.HEALTH_CHECKER_AGENT_RETRIES) || 1
    },

    // Persistence Agent
    persistence: {
      enabled: process.env.PERSISTENCE_INTEGRATION_ENABLED !== 'false',
      endpoint: process.env.PERSISTENCE_AGENT_ENDPOINT || 'http://localhost:3016',
      timeout: parseInt(process.env.PERSISTENCE_AGENT_TIMEOUT) || 15000,
      retries: parseInt(process.env.PERSISTENCE_AGENT_RETRIES) || 2
    }
  },

  // Configurações de métricas
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT) || 3020,
    path: process.env.METRICS_PATH || '/metrics',
    collectDefaultMetrics: process.env.METRICS_COLLECT_DEFAULT !== 'false',
    prefix: process.env.METRICS_PREFIX || 'fallback_',
    labels: {
      agent: 'fallback-agent',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  },

  // Configurações de health check
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    path: process.env.HEALTH_CHECK_PATH || '/health',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 10000,
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES) || 3,
    dependencies: [
      'sqs',
      'recovery-agent',
      'health-checker-agent',
      'persistence-agent'
    ]
  },

  // Configurações de desenvolvimento
  development: {
    mockExternalServices: process.env.DEV_MOCK_EXTERNAL_SERVICES === 'true',
    enableDebugLogs: process.env.DEV_ENABLE_DEBUG_LOGS === 'true',
    disableAuth: process.env.DEV_DISABLE_AUTH === 'true',
    simulateFailures: process.env.DEV_SIMULATE_FAILURES === 'true',
    failureRate: parseFloat(process.env.DEV_FAILURE_RATE) || 0.1
  },

  // Configurações de alertas
  alerts: {
    enabled: process.env.ALERTS_ENABLED !== 'false',
    channels: {
      webhook: {
        enabled: process.env.ALERT_WEBHOOK_ENABLED === 'true',
        url: process.env.ALERT_WEBHOOK_URL,
        timeout: parseInt(process.env.ALERT_WEBHOOK_TIMEOUT) || 5000
      },
      email: {
        enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
        smtp: {
          host: process.env.ALERT_EMAIL_SMTP_HOST,
          port: parseInt(process.env.ALERT_EMAIL_SMTP_PORT) || 587,
          secure: process.env.ALERT_EMAIL_SMTP_SECURE === 'true',
          auth: {
            user: process.env.ALERT_EMAIL_SMTP_USER,
            pass: process.env.ALERT_EMAIL_SMTP_PASS
          }
        },
        from: process.env.ALERT_EMAIL_FROM,
        to: process.env.ALERT_EMAIL_TO
      }
    },
    thresholds: {
      errorRate: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD) || 0.1,
      responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_THRESHOLD) || 5000,
      queueSize: parseInt(process.env.ALERT_QUEUE_SIZE_THRESHOLD) || 1000,
      circuitBreakerOpen: process.env.ALERT_CIRCUIT_BREAKER_OPEN === 'true'
    }
  }
};