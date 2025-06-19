/**
 * Agent Lifecycle Manager Configuration
 * Configurações para gerenciamento do ciclo de vida dos agentes
 */

module.exports = {
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
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-ID']
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: 'Muitas requisições deste IP'
    },
    apiKey: process.env.API_KEY || 'lifecycle-manager-api-key'
  },

  // Configurações de monitoramento
  monitoring: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 segundos
    metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000, // 1 minuto
    agentTimeout: parseInt(process.env.AGENT_TIMEOUT) || 10000, // 10 segundos
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 5000 // 5 segundos
  },

  // Configurações de filas SQS
  sqs: {
    queues: {
      // Filas que o agente consome
      recoveryActions: 'recovery-actions',
      fallbackActions: 'fallback-actions',
      
      // Filas que o agente produz
      lifecycleEvents: 'lifecycle-events',
      agentFailureEvents: 'agent-failure-events'
    },
    polling: {
      maxMessages: 10,
      waitTimeSeconds: 20,
      visibilityTimeoutSeconds: 300
    },
    deadLetterQueue: {
      maxReceiveCount: 3,
      retentionPeriod: 1209600 // 14 dias
    }
  },

  // Configurações dos agentes gerenciados
  agents: {
    registry: {
      // Agentes Core
      'interface-agent': {
        port: 3001,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/core/interface/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 5,
        restartDelay: 10000,
        dependencies: []
      },
      'event-agent': {
        port: 3002,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/core/event/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 5,
        restartDelay: 10000,
        dependencies: ['interface-agent']
      },
      'planning-agent': {
        port: 3003,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/core/planning/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 5,
        restartDelay: 10000,
        dependencies: ['event-agent']
      },
      'execution-agent': {
        port: 3004,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/core/execution/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 5,
        restartDelay: 10000,
        dependencies: ['planning-agent']
      },
      'state-management-agent': {
        port: 3005,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/core/state-management/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 5,
        restartDelay: 10000,
        dependencies: []
      },
      'acl-middleware-agent': {
        port: 3006,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/core/acl-middleware/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 5,
        restartDelay: 10000,
        dependencies: ['interface-agent']
      },
      
      // Agentes Auxiliares
      'monitoring-agent': {
        port: 3007,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/monitoring/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: []
      },
      'policy-agent': {
        port: 3008,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/policy/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: []
      },
      'security-agent': {
        port: 3009,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/security/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: []
      },
      'health-checker-agent': {
        port: 3015,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/health-checker/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: []
      },
      'recovery-agent': {
        port: 3017,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/recovery/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: ['health-checker-agent']
      },
      'event-enricher-agent': {
        port: 3018,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/event-enricher/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: ['event-agent']
      },
      'external-event-api-gateway': {
        port: 3019,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/external-event-api-gateway/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: []
      },
      'persistence-agent': {
        port: 3016,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/persistence/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: ['state-management-agent']
      },
      'fallback-agent': {
        port: 3020,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/auxiliary/fallback/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: []
      },
      
      // Agentes MARL
      'marl-agent': {
        port: 3011,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/marl/marl/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'on-failure',
        maxRestarts: 3,
        restartDelay: 20000,
        dependencies: []
      },
      'coordination-agent': {
        port: 3012,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/marl/coordination/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'on-failure',
        maxRestarts: 3,
        restartDelay: 20000,
        dependencies: ['marl-agent']
      },
      
      // Agentes de Mediação
      'mediator-agent': {
        port: 3013,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/mediation/mediator/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'on-failure',
        maxRestarts: 3,
        restartDelay: 20000,
        dependencies: ['coordination-agent']
      },
      'orchestrator-agent': {
        port: 3014,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/mediation/orchestrator/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'on-failure',
        maxRestarts: 3,
        restartDelay: 20000,
        dependencies: ['mediator-agent']
      },
      
      // Agentes de Gerenciamento
      'message-schema-registry': {
        port: 3022,
        healthEndpoint: '/health',
        startCommand: 'node src/agents/management/message-schema-registry/index.js',
        workingDirectory: process.cwd(),
        restartPolicy: 'always',
        maxRestarts: 3,
        restartDelay: 15000,
        dependencies: []
      }
    },
    
    // Políticas de restart
    restartPolicies: {
      always: 'Sempre reinicia o agente quando para',
      'on-failure': 'Reinicia apenas em caso de falha',
      'unless-stopped': 'Reinicia a menos que seja parado manualmente',
      never: 'Nunca reinicia automaticamente'
    },
    
    // Estados possíveis dos agentes
    states: {
      STOPPED: 'stopped',
      STARTING: 'starting',
      RUNNING: 'running',
      STOPPING: 'stopping',
      FAILED: 'failed',
      UNKNOWN: 'unknown'
    }
  },

  // Configurações de eventos
  events: {
    types: {
      AGENT_STARTED: 'agent.started',
      AGENT_STOPPED: 'agent.stopped',
      AGENT_FAILED: 'agent.failed',
      AGENT_RESTARTED: 'agent.restarted',
      AGENT_REGISTERED: 'agent.registered',
      AGENT_UNREGISTERED: 'agent.unregistered',
      LIFECYCLE_MANAGER_STARTED: 'lifecycle.manager.started',
      LIFECYCLE_MANAGER_STOPPED: 'lifecycle.manager.stopped',
      RECOVERY_ACTION_RECEIVED: 'recovery.action.received',
      FALLBACK_ACTION_RECEIVED: 'fallback.action.received'
    },
    retention: {
      maxEvents: 10000,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    }
  },

  // Configurações de métricas
  metrics: {
    enabled: true,
    collectInterval: 60000, // 1 minuto
    histogramBuckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    labels: {
      service: 'agent-lifecycle-manager',
      version: '1.0.0'
    }
  },

  // Configurações de cache
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutos
    maxSize: 1000,
    checkPeriod: 60000 // 1 minuto
  }
}