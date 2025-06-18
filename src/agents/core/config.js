/**
 * Configurações específicas para Agentes Core
 * Centraliza configurações de comportamento, limites e integrações
 */

const config = {
  // Configurações do Interface Agent
  interface: {
    port: process.env.INTERFACE_AGENT_PORT || 3001,
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100, // máximo 100 requests por janela
      message: 'Too many requests from this IP'
    },
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    },
    validation: {
      maxPayloadSize: '10mb',
      strictMode: process.env.NODE_ENV === 'production'
    },
    websocket: {
      enabled: process.env.WEBSOCKET_ENABLED === 'true',
      pingTimeout: 60000,
      pingInterval: 25000
    }
  },

  // Configurações do Event Agent
  event: {
    port: process.env.EVENT_AGENT_PORT || 3002,
    processing: {
      maxConcurrentEvents: parseInt(process.env.MAX_CONCURRENT_EVENTS) || 50,
      processingTimeout: 30000, // 30 segundos
      retryAttempts: 3,
      retryDelay: 1000, // 1 segundo
      exponentialBackoff: true
    },
    queues: {
      input: process.env.EVENT_INPUT_QUEUE || 'event-input-queue',
      output: process.env.EVENT_OUTPUT_QUEUE || 'event-output-queue',
      dlq: process.env.EVENT_DLQ || 'event-dlq',
      planning: process.env.PLANNING_QUEUE || 'planning-queue'
    },
    validation: {
      requiredFields: ['id', 'type', 'source', 'timestamp'],
      maxEventSize: 1024 * 1024, // 1MB
      allowedTypes: [
        'user_request',
        'system_event',
        'planning_request',
        'execution_request',
        'monitoring_event'
      ]
    }
  },

  // Configurações do Planning Agent
  planning: {
    port: process.env.PLANNING_AGENT_PORT || 3003,
    analysis: {
      maxAnalysisTime: 60000, // 1 minuto
      complexityThresholds: {
        simple: 1,
        moderate: 3,
        complex: 5,
        critical: 10
      },
      cacheEnabled: true,
      cacheTTL: 3600000 // 1 hora
    },
    planning: {
      maxStepsPerPlan: 100,
      maxDependencyDepth: 10,
      optimizationEnabled: true,
      parallelizationEnabled: true
    },
    queues: {
      input: process.env.PLANNING_INPUT_QUEUE || 'planning-input-queue',
      output: process.env.PLANNING_OUTPUT_QUEUE || 'planning-output-queue',
      execution: process.env.EXECUTION_QUEUE || 'execution-queue'
    },
    templates: {
      directory: './src/agents/core/planning-agent/templates',
      autoLoad: true,
      customTemplatesEnabled: true
    }
  },

  // Configurações do Execution Agent
  execution: {
    port: process.env.EXECUTION_AGENT_PORT || 3004,
    execution: {
      maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS) || 10,
      maxStepsPerExecution: 1000,
      executionTimeout: 3600000, // 1 hora
      stepTimeout: 300000, // 5 minutos
      healthCheckInterval: 30000 // 30 segundos
    },
    workers: {
      poolSize: parseInt(process.env.WORKER_POOL_SIZE) || 5,
      workerTimeout: 300000, // 5 minutos
      restartOnFailure: true,
      maxRestarts: 3
    },
    retry: {
      maxRetries: 3,
      retryDelay: 2000, // 2 segundos
      exponentialBackoff: true,
      maxRetryDelay: 30000 // 30 segundos
    },
    rollback: {
      enabled: true,
      autoRollbackOnFailure: process.env.AUTO_ROLLBACK === 'true',
      rollbackTimeout: 600000, // 10 minutos
      preserveRollbackLogs: true
    },
    queues: {
      input: process.env.EXECUTION_INPUT_QUEUE || 'execution-input-queue',
      status: process.env.EXECUTION_STATUS_QUEUE || 'execution-status-queue',
      dlq: process.env.EXECUTION_DLQ || 'execution-dlq'
    }
  },

  // Configurações compartilhadas
  shared: {
    // Configurações de logging
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      enableConsole: process.env.ENABLE_CONSOLE_LOG !== 'false',
      enableFile: process.env.ENABLE_FILE_LOG === 'true',
      logDirectory: process.env.LOG_DIRECTORY || './logs',
      maxFileSize: '20m',
      maxFiles: '14d'
    },

    // Configurações de métricas
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      port: process.env.METRICS_PORT || 9090,
      endpoint: process.env.METRICS_ENDPOINT || '/metrics',
      collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL) || 15000,
      histogramBuckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    },

    // Configurações de health check
    health: {
      enabled: true,
      endpoint: '/health',
      checkInterval: 30000, // 30 segundos
      timeout: 5000, // 5 segundos
      dependencies: {
        sqs: true,
        database: false, // Será habilitado quando implementarmos
        redis: false // Será habilitado quando implementarmos
      }
    },

    // Configurações de SQS
    sqs: {
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.SQS_ENDPOINT, // Para LocalStack
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      messageRetentionPeriod: 1209600, // 14 dias
      visibilityTimeout: 300, // 5 minutos
      receiveMessageWaitTime: 20, // Long polling
      maxReceiveCount: 3 // Para DLQ
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
        }
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 1000
      }
    },

    // Configurações de monitoramento
    monitoring: {
      enabled: process.env.MONITORING_ENABLED !== 'false',
      alerting: {
        enabled: process.env.ALERTING_ENABLED === 'true',
        thresholds: {
          errorRate: 0.05, // 5%
          responseTime: 5000, // 5 segundos
          queueDepth: 1000,
          memoryUsage: 0.8 // 80%
        }
      },
      tracing: {
        enabled: process.env.TRACING_ENABLED === 'true',
        serviceName: 'agentes-autonomos',
        jaegerEndpoint: process.env.JAEGER_ENDPOINT
      }
    }
  },

  // Configurações de ambiente
  environment: {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test'
  },

  // Configurações de integração
  integration: {
    // APIs externas (quando implementadas)
    externalApis: {
      timeout: 30000,
      retries: 3,
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        timeout: 60000
      }
    },

    // Webhooks
    webhooks: {
      enabled: process.env.WEBHOOKS_ENABLED === 'true',
      timeout: 10000,
      retries: 2
    }
  }
};

// Validação de configurações críticas
function validateConfig() {
  const errors = [];

  // Validar configurações de SQS
  if (!config.shared.sqs.region) {
    errors.push('AWS_REGION is required');
  }

  // Validar portas únicas
  const ports = [
    config.interface.port,
    config.event.port,
    config.planning.port,
    config.execution.port
  ];
  
  const uniquePorts = new Set(ports);
  if (uniquePorts.size !== ports.length) {
    errors.push('Agent ports must be unique');
  }

  // Validar limites de concorrência
  if (config.event.processing.maxConcurrentEvents <= 0) {
    errors.push('MAX_CONCURRENT_EVENTS must be greater than 0');
  }

  if (config.execution.execution.maxConcurrentExecutions <= 0) {
    errors.push('MAX_CONCURRENT_EXECUTIONS must be greater than 0');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Executar validação se não estivermos em ambiente de teste
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

module.exports = config;