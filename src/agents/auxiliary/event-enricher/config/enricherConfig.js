/**
 * Event Enricher Agent Configuration
 * Configurações para o agente de enriquecimento de eventos
 */

module.exports = {
  // Configurações do servidor
  server: {
    port: process.env.EVENT_ENRICHER_PORT || 3018,
    host: process.env.EVENT_ENRICHER_HOST || '0.0.0.0'
  },

  // Configurações de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    maxFiles: 5,
    maxSize: '10m'
  },

  // Configurações de segurança
  security: {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    },
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 1000 // máximo 1000 requests por IP por janela
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"]
        }
      }
    }
  },

  // Configurações de enriquecimento
  enrichment: {
    // Estratégias de enriquecimento
    strategies: {
      metadata: {
        enabled: true,
        priority: 1,
        fields: ['timestamp', 'source', 'version', 'environment']
      },
      geolocation: {
        enabled: true,
        priority: 2,
        fields: ['country', 'region', 'city', 'timezone']
      },
      userAgent: {
        enabled: true,
        priority: 3,
        fields: ['browser', 'os', 'device', 'mobile']
      },
      sessionInfo: {
        enabled: true,
        priority: 4,
        fields: ['sessionId', 'userId', 'sessionDuration']
      },
      contextual: {
        enabled: true,
        priority: 5,
        fields: ['referrer', 'campaign', 'medium', 'source']
      }
    },

    // Configurações de cache
    cache: {
      enabled: true,
      ttl: 300, // 5 minutos
      maxSize: 1000,
      strategy: 'lru'
    },

    // Limites de processamento
    limits: {
      maxEventSize: 1024 * 1024, // 1MB
      maxFieldsPerEvent: 100,
      maxEnrichmentTime: 5000, // 5 segundos
      maxConcurrentEvents: 50
    },

    // Configurações de retry
    retry: {
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 1000
    }
  },

  // Configurações de contexto
  context: {
    // Fontes de contexto
    sources: {
      database: {
        enabled: true,
        connectionString: process.env.DATABASE_URL,
        timeout: 2000
      },
      redis: {
        enabled: true,
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        timeout: 1000
      },
      external: {
        enabled: false,
        endpoints: [],
        timeout: 3000
      }
    },

    // Cache de contexto
    cache: {
      enabled: true,
      ttl: 600, // 10 minutos
      maxSize: 5000
    },

    // Configurações de lookup
    lookup: {
      maxConcurrent: 10,
      timeout: 2000,
      retryAttempts: 2
    }
  },

  // Configurações de validação
  validation: {
    // Esquemas de validação
    schemas: {
      strict: false,
      allowAdditionalFields: true,
      validateTypes: true
    },

    // Regras de validação
    rules: {
      required: ['id', 'type', 'timestamp'],
      optional: ['source', 'data', 'metadata'],
      formats: {
        timestamp: 'iso8601',
        id: 'uuid',
        type: 'string'
      }
    },

    // Configurações de sanitização
    sanitization: {
      enabled: true,
      removeEmpty: true,
      trimStrings: true,
      normalizeCase: false
    }
  },

  // Configurações SQS
  sqs: {
    region: process.env.AWS_REGION || 'us-east-1',
    queues: {
      input: {
        rawEvents: process.env.SQS_RAW_EVENTS_QUEUE || 'raw-events',
        incomingEvents: process.env.SQS_INCOMING_EVENTS_QUEUE || 'incoming-events'
      },
      output: {
        enrichedEvents: process.env.SQS_ENRICHED_EVENTS_QUEUE || 'enriched-events',
        validationErrors: process.env.SQS_VALIDATION_ERRORS_QUEUE || 'validation-errors'
      }
    },
    polling: {
      maxMessages: 10,
      waitTimeSeconds: 20,
      visibilityTimeout: 30
    },
    deadLetterQueue: {
      enabled: true,
      maxReceiveCount: 3
    }
  },

  // Configurações de métricas
  metrics: {
    enabled: true,
    prefix: 'event_enricher_',
    labels: {
      service: 'event-enricher-agent',
      version: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    },
    collection: {
      interval: 15000, // 15 segundos
      timeout: 5000
    }
  },

  // Configurações de health check
  health: {
    enabled: true,
    interval: 30000, // 30 segundos
    timeout: 5000,
    checks: {
      sqs: true,
      database: true,
      redis: true,
      memory: true,
      disk: false
    },
    thresholds: {
      memory: 0.9, // 90%
      cpu: 0.8, // 80%
      responseTime: 5000 // 5 segundos
    }
  },

  // Configurações de desenvolvimento
  development: {
    mockExternalServices: process.env.NODE_ENV === 'development',
    debugMode: process.env.DEBUG === 'true',
    verboseLogging: process.env.VERBOSE === 'true'
  }
};