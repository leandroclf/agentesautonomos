/**
 * Agent Lifecycle Manager - Configurações
 * Gerencia o ciclo de vida de todos os agentes do sistema
 */

const config = {
  // Configurações do servidor
  server: {
    port: process.env.PORT || 3021,
    host: process.env.HOST || '0.0.0.0',
    name: 'agent-lifecycle-manager',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // Configurações de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: {
      enabled: process.env.LOG_FILE_ENABLED === 'true',
      path: process.env.LOG_FILE_PATH || './logs/lifecycle-manager.log',
      maxSize: process.env.LOG_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
    },
    debug: {
      lifecycle: process.env.DEBUG_LIFECYCLE === 'true',
      dependencies: process.env.DEBUG_DEPENDENCIES === 'true',
      deployment: process.env.DEBUG_DEPLOYMENT === 'true'
    }
  },

  // Configurações de segurança
  security: {
    helmet: {
      enabled: process.env.HELMET_ENABLED !== 'false',
      contentSecurityPolicy: process.env.HELMET_CONTENT_SECURITY_POLICY !== 'false',
      hstsMaxAge: parseInt(process.env.HELMET_HSTS_MAX_AGE) || 31536000
    },
    cors: {
      enabled: process.env.CORS_ENABLED !== 'false',
      origin: process.env.CORS_ORIGIN || '*',
      methods: process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,OPTIONS',
      allowedHeaders: process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-Requested-With'
    },
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutos
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests from this IP'
    }
  },

  // Configurações AWS SQS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    endpoint: process.env.AWS_SQS_ENDPOINT
  },

  // Filas SQS
  sqs: {
    queues: {
      lifecycle: process.env.SQS_LIFECYCLE_QUEUE_URL,
      healthCheck: process.env.SQS_HEALTH_CHECK_QUEUE_URL,
      recovery: process.env.SQS_RECOVERY_QUEUE_URL,
      fallback: process.env.SQS_FALLBACK_QUEUE_URL,
      dlq: process.env.SQS_DLQ_URL
    },
    polling: {
      waitTimeSeconds: parseInt(process.env.SQS_POLLING_WAIT_TIME) || 20,
      maxMessages: parseInt(process.env.SQS_MAX_MESSAGES) || 10,
      visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT) || 300
    },
    retry: {
      attempts: parseInt(process.env.SQS_RETRY_ATTEMPTS) || 3,
      delay: parseInt(process.env.SQS_RETRY_DELAY) || 1000,
      backoff: process.env.SQS_RETRY_BACKOFF || 'exponential'
    }
  },

  // Configurações de gerenciamento de ciclo de vida
  lifecycle: {
    enabled: process.env.LIFECYCLE_ENABLED !== 'false',
    monitoringInterval: parseInt(process.env.LIFECYCLE_MONITORING_INTERVAL) || 30000, // 30 segundos
    healthCheckInterval: parseInt(process.env.LIFECYCLE_HEALTH_CHECK_INTERVAL) || 15000, // 15 segundos
    restartDelay: parseInt(process.env.LIFECYCLE_RESTART_DELAY) || 5000, // 5 segundos
    maxRestartAttempts: parseInt(process.env.LIFECYCLE_MAX_RESTART_ATTEMPTS) || 3,
    gracefulShutdownTimeout: parseInt(process.env.LIFECYCLE_GRACEFUL_SHUTDOWN_TIMEOUT) || 30000, // 30 segundos
    
    // Estados dos agentes
    states: {
      starting: 'starting',
      running: 'running',
      stopping: 'stopping',
      stopped: 'stopped',
      failed: 'failed',
      unknown: 'unknown'
    },

    // Ações de ciclo de vida
    actions: {
      start: 'start',
      stop: 'stop',
      restart: 'restart',
      healthCheck: 'health_check',
      update: 'update',
      scale: 'scale'
    }
  },

  // Configurações de dependências entre agentes
  dependencies: {
    enabled: process.env.DEPENDENCIES_ENABLED !== 'false',
    checkInterval: parseInt(process.env.DEPENDENCIES_CHECK_INTERVAL) || 10000, // 10 segundos
    maxWaitTime: parseInt(process.env.DEPENDENCIES_MAX_WAIT_TIME) || 300000, // 5 minutos
    
    // Mapa de dependências (agente -> suas dependências)
    map: {
      'interface-agent': [],
      'event-agent': ['interface-agent'],
      'planning-agent': ['event-agent'],
      'execution-agent': ['planning-agent'],
      'state-agent': ['execution-agent'],
      'acl-agent': ['state-agent'],
      'monitoring-agent': ['acl-agent'],
      'policy-agent': ['monitoring-agent'],
      'security-agent': ['policy-agent'],
      'marl-agent': ['security-agent'],
      'coordination-agent': ['marl-agent'],
      'mediator-agent': ['coordination-agent'],
      'orchestrator-agent': ['mediator-agent'],
      'health-checker-agent': ['orchestrator-agent'],
      'persistence-agent': ['health-checker-agent'],
      'recovery-agent': ['persistence-agent'],
      'event-enricher-agent': ['recovery-agent'],
      'external-event-api-gateway-agent': ['event-enricher-agent'],
      'fallback-agent': ['external-event-api-gateway-agent']
    },

    // Grupos de inicialização
    groups: {
      core: ['interface-agent', 'event-agent', 'planning-agent', 'execution-agent'],
      state: ['state-agent', 'acl-agent'],
      monitoring: ['monitoring-agent', 'policy-agent', 'security-agent'],
      marl: ['marl-agent', 'coordination-agent'],
      mediation: ['mediator-agent', 'orchestrator-agent'],
      auxiliary: ['health-checker-agent', 'persistence-agent', 'recovery-agent'],
      enrichment: ['event-enricher-agent', 'external-event-api-gateway-agent'],
      resilience: ['fallback-agent']
    }
  },

  // Configurações de deployment
  deployment: {
    enabled: process.env.DEPLOYMENT_ENABLED !== 'false',
    strategy: process.env.DEPLOYMENT_STRATEGY || 'rolling', // rolling, blue-green, canary
    maxConcurrent: parseInt(process.env.DEPLOYMENT_MAX_CONCURRENT) || 3,
    healthCheckTimeout: parseInt(process.env.DEPLOYMENT_HEALTH_CHECK_TIMEOUT) || 60000, // 1 minuto
    rollbackOnFailure: process.env.DEPLOYMENT_ROLLBACK_ON_FAILURE !== 'false',
    
    // Configurações por estratégia
    strategies: {
      rolling: {
        batchSize: parseInt(process.env.DEPLOYMENT_ROLLING_BATCH_SIZE) || 1,
        maxUnavailable: parseInt(process.env.DEPLOYMENT_ROLLING_MAX_UNAVAILABLE) || 1
      },
      blueGreen: {
        switchTimeout: parseInt(process.env.DEPLOYMENT_BLUE_GREEN_SWITCH_TIMEOUT) || 300000, // 5 minutos
        testDuration: parseInt(process.env.DEPLOYMENT_BLUE_GREEN_TEST_DURATION) || 120000 // 2 minutos
      },
      canary: {
        percentage: parseInt(process.env.DEPLOYMENT_CANARY_PERCENTAGE) || 10,
        duration: parseInt(process.env.DEPLOYMENT_CANARY_DURATION) || 300000, // 5 minutos
        successThreshold: parseFloat(process.env.DEPLOYMENT_CANARY_SUCCESS_THRESHOLD) || 0.95
      }
    }
  },

  // Configurações de agentes
  agents: {
    registry: {
      'interface-agent': {
        name: 'Interface Agent',
        port: 3001,
        healthEndpoint: '/health',
        url: process.env.INTERFACE_AGENT_URL || 'http://localhost:3001',
        timeout: parseInt(process.env.INTERFACE_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'event-agent': {
        name: 'Event Agent',
        port: 3002,
        healthEndpoint: '/health',
        url: process.env.EVENT_AGENT_URL || 'http://localhost:3002',
        timeout: parseInt(process.env.EVENT_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'planning-agent': {
        name: 'Planning Agent',
        port: 3003,
        healthEndpoint: '/health',
        url: process.env.PLANNING_AGENT_URL || 'http://localhost:3003',
        timeout: parseInt(process.env.PLANNING_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'execution-agent': {
        name: 'Execution Agent',
        port: 3004,
        healthEndpoint: '/health',
        url: process.env.EXECUTION_AGENT_URL || 'http://localhost:3004',
        timeout: parseInt(process.env.EXECUTION_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'state-agent': {
        name: 'State Agent',
        port: 3005,
        healthEndpoint: '/health',
        url: process.env.STATE_AGENT_URL || 'http://localhost:3005',
        timeout: parseInt(process.env.STATE_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'acl-agent': {
        name: 'ACL Agent',
        port: 3006,
        healthEndpoint: '/health',
        url: process.env.ACL_AGENT_URL || 'http://localhost:3006',
        timeout: parseInt(process.env.ACL_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'monitoring-agent': {
        name: 'Monitoring Agent',
        port: 3007,
        healthEndpoint: '/health',
        url: process.env.MONITORING_AGENT_URL || 'http://localhost:3007',
        timeout: parseInt(process.env.MONITORING_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'policy-agent': {
        name: 'Policy Agent',
        port: 3008,
        healthEndpoint: '/health',
        url: process.env.POLICY_AGENT_URL || 'http://localhost:3008',
        timeout: parseInt(process.env.POLICY_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'security-agent': {
        name: 'Security Agent',
        port: 3009,
        healthEndpoint: '/health',
        url: process.env.SECURITY_AGENT_URL || 'http://localhost:3009',
        timeout: parseInt(process.env.SECURITY_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'marl-agent': {
        name: 'MARL Agent',
        port: 3011,
        healthEndpoint: '/health',
        url: process.env.MARL_AGENT_URL || 'http://localhost:3011',
        timeout: parseInt(process.env.MARL_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'coordination-agent': {
        name: 'Coordination Agent',
        port: 3012,
        healthEndpoint: '/health',
        url: process.env.COORDINATION_AGENT_URL || 'http://localhost:3012',
        timeout: parseInt(process.env.COORDINATION_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'mediator-agent': {
        name: 'Mediator Agent',
        port: 3013,
        healthEndpoint: '/health',
        url: process.env.MEDIATOR_AGENT_URL || 'http://localhost:3013',
        timeout: parseInt(process.env.MEDIATOR_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'orchestrator-agent': {
        name: 'Orchestrator Agent',
        port: 3014,
        healthEndpoint: '/health',
        url: process.env.ORCHESTRATOR_AGENT_URL || 'http://localhost:3014',
        timeout: parseInt(process.env.ORCHESTRATOR_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'health-checker-agent': {
        name: 'Health Checker Agent',
        port: 3015,
        healthEndpoint: '/health',
        url: process.env.HEALTH_CHECKER_AGENT_URL || 'http://localhost:3015',
        timeout: parseInt(process.env.HEALTH_CHECKER_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'persistence-agent': {
        name: 'Persistence Agent',
        port: 3016,
        healthEndpoint: '/health',
        url: process.env.PERSISTENCE_AGENT_URL || 'http://localhost:3016',
        timeout: parseInt(process.env.PERSISTENCE_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'recovery-agent': {
        name: 'Recovery Agent',
        port: 3017,
        healthEndpoint: '/health',
        url: process.env.RECOVERY_AGENT_URL || 'http://localhost:3017',
        timeout: parseInt(process.env.RECOVERY_AGENT_TIMEOUT) || 5000,
        critical: true
      },
      'event-enricher-agent': {
        name: 'Event Enricher Agent',
        port: 3018,
        healthEndpoint: '/health',
        url: process.env.EVENT_ENRICHER_AGENT_URL || 'http://localhost:3018',
        timeout: parseInt(process.env.EVENT_ENRICHER_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'external-event-api-gateway-agent': {
        name: 'External Event API Gateway Agent',
        port: 3019,
        healthEndpoint: '/health',
        url: process.env.EXTERNAL_EVENT_API_GATEWAY_AGENT_URL || 'http://localhost:3019',
        timeout: parseInt(process.env.EXTERNAL_EVENT_API_GATEWAY_AGENT_TIMEOUT) || 5000,
        critical: false
      },
      'fallback-agent': {
        name: 'Fallback Agent',
        port: 3020,
        healthEndpoint: '/health',
        url: process.env.FALLBACK_AGENT_URL || 'http://localhost:3020',
        timeout: parseInt(process.env.FALLBACK_AGENT_TIMEOUT) || 5000,
        critical: true
      }
    }
  },

  // Configurações de métricas
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT) || 3021,
    path: process.env.METRICS_PATH || '/metrics',
    prefix: process.env.METRICS_PREFIX || 'lifecycle_',
    collectDefault: process.env.METRICS_COLLECT_DEFAULT !== 'false',
    
    // Métricas customizadas
    custom: {
      agentStatus: process.env.METRICS_AGENT_STATUS !== 'false',
      lifecycle: process.env.METRICS_LIFECYCLE !== 'false',
      dependencies: process.env.METRICS_DEPENDENCIES !== 'false',
      deployment: process.env.METRICS_DEPLOYMENT !== 'false'
    },

    // Coleta de métricas
    collection: {
      interval: parseInt(process.env.METRICS_COLLECTION_INTERVAL) || 10000, // 10 segundos
      retention: parseInt(process.env.METRICS_RETENTION_PERIOD) || 3600000 // 1 hora
    }
  },

  // Configurações de health check
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    path: process.env.HEALTH_CHECK_PATH || '/health',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 segundos
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
    
    // Dependências para verificar
    dependencies: process.env.HEALTH_CHECK_DEPENDENCIES ? 
      JSON.parse(process.env.HEALTH_CHECK_DEPENDENCIES) : 
      ['sqs', 'agents'],
    
    // Dependências críticas
    criticalDependencies: process.env.HEALTH_CHECK_CRITICAL_DEPENDENCIES ? 
      JSON.parse(process.env.HEALTH_CHECK_CRITICAL_DEPENDENCIES) : 
      ['sqs'],

    // Thresholds
    thresholds: {
      memory: parseInt(process.env.HEALTH_CHECK_MEMORY_THRESHOLD) || 90,
      cpu: parseInt(process.env.HEALTH_CHECK_CPU_THRESHOLD) || 95,
      disk: parseInt(process.env.HEALTH_CHECK_DISK_THRESHOLD) || 90,
      agentFailures: parseInt(process.env.HEALTH_CHECK_AGENT_FAILURES_THRESHOLD) || 3
    }
  },

  // Configurações de cache
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    type: process.env.CACHE_TYPE || 'memory', // memory, redis
    ttl: parseInt(process.env.CACHE_TTL) || 300000, // 5 minutos
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD) || 60000, // 1 minuto

    // Redis (se type=redis)
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'lifecycle:',
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 5000,
      commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 3000
    }
  },

  // Configurações de alertas
  alerts: {
    enabled: process.env.ALERTS_ENABLED !== 'false',
    
    // Webhook
    webhook: {
      enabled: process.env.ALERT_WEBHOOK_ENABLED === 'true',
      url: process.env.ALERT_WEBHOOK_URL,
      timeout: parseInt(process.env.ALERT_WEBHOOK_TIMEOUT) || 5000,
      retryAttempts: parseInt(process.env.ALERT_WEBHOOK_RETRY_ATTEMPTS) || 2
    },

    // Email
    email: {
      enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
      smtp: {
        host: process.env.ALERT_EMAIL_SMTP_HOST,
        port: parseInt(process.env.ALERT_EMAIL_SMTP_PORT) || 587,
        secure: process.env.ALERT_EMAIL_SMTP_SECURE === 'true',
        auth: {
          user: process.env.ALERT_EMAIL_USER,
          pass: process.env.ALERT_EMAIL_PASS
        }
      },
      from: process.env.ALERT_EMAIL_FROM,
      to: process.env.ALERT_EMAIL_TO
    },

    // Thresholds para alertas
    thresholds: {
      agentDown: parseInt(process.env.ALERT_AGENT_DOWN_THRESHOLD) || 1,
      systemFailure: parseInt(process.env.ALERT_SYSTEM_FAILURE_THRESHOLD) || 3,
      deploymentFailure: parseInt(process.env.ALERT_DEPLOYMENT_FAILURE_THRESHOLD) || 1,
      dependencyFailure: parseInt(process.env.ALERT_DEPENDENCY_FAILURE_THRESHOLD) || 2
    }
  },

  // Configurações de desenvolvimento
  development: {
    enabled: process.env.NODE_ENV === 'development',
    autoReload: process.env.DEV_AUTO_RELOAD === 'true',
    mockAgents: process.env.DEV_MOCK_AGENTS === 'true',
    simulateFailures: process.env.DEV_SIMULATE_FAILURES === 'true',
    
    // Configurações de teste
    test: {
      mode: process.env.TEST_MODE === 'true',
      sqsEndpoint: process.env.TEST_SQS_ENDPOINT,
      redisDb: parseInt(process.env.TEST_REDIS_DB) || 15,
      timeout: parseInt(process.env.TEST_TIMEOUT) || 10000
    }
  }
}

module.exports = config