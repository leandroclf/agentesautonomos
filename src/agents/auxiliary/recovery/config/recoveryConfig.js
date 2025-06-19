/**
 * Recovery Agent Configuration
 * Configurações específicas para o agente de recuperação
 */

const config = {
  agent: {
    id: 'recovery-agent',
    name: 'Recovery Agent',
    version: '1.0.0',
    port: process.env.RECOVERY_AGENT_PORT || 3014,
    environment: process.env.NODE_ENV || 'development'
  },

  // Configurações de Recovery
  recovery: {
    // Estratégias de recuperação disponíveis
    strategies: {
      restart: {
        name: 'restart',
        description: 'Restart do agente',
        timeout: 30000, // 30 segundos
        maxAttempts: 3,
        backoffMultiplier: 2
      },
      graceful_restart: {
        name: 'graceful_restart',
        description: 'Restart gracioso do agente',
        timeout: 60000, // 60 segundos
        maxAttempts: 2,
        backoffMultiplier: 1.5
      },
      force_restart: {
        name: 'force_restart',
        description: 'Restart forçado do agente',
        timeout: 15000, // 15 segundos
        maxAttempts: 1,
        backoffMultiplier: 1
      },
      health_reset: {
        name: 'health_reset',
        description: 'Reset do estado de saúde',
        timeout: 10000, // 10 segundos
        maxAttempts: 5,
        backoffMultiplier: 1.2
      },
      service_restart: {
        name: 'service_restart',
        description: 'Restart de serviços específicos',
        timeout: 45000, // 45 segundos
        maxAttempts: 2,
        backoffMultiplier: 1.5
      }
    },

    // Configurações de timeout
    timeouts: {
      default: 30000, // 30 segundos
      restart: 60000, // 60 segundos
      healthCheck: 10000, // 10 segundos
      escalation: 120000 // 2 minutos
    },

    // Configurações de retry
    retry: {
      maxAttempts: 3,
      baseDelay: 1000, // 1 segundo
      maxDelay: 30000, // 30 segundos
      backoffMultiplier: 2
    },

    // Configurações de cooldown
    cooldown: {
      betweenRecoveries: 5000, // 5 segundos
      afterFailure: 30000, // 30 segundos
      afterEscalation: 60000 // 60 segundos
    },

    // Limites de recovery
    limits: {
      maxConcurrentRecoveries: 5,
      maxRecoveriesPerAgent: 10,
      maxRecoveriesPerHour: 50,
      maxEscalationsPerHour: 10
    }
  },

  // Configurações de Escalação
  escalation: {
    levels: {
      low: {
        name: 'low',
        description: 'Escalação de baixa prioridade',
        threshold: 3, // Após 3 falhas
        cooldown: 300000, // 5 minutos
        notifications: ['log', 'metrics']
      },
      medium: {
        name: 'medium',
        description: 'Escalação de média prioridade',
        threshold: 2, // Após 2 falhas
        cooldown: 180000, // 3 minutos
        notifications: ['log', 'metrics', 'alert']
      },
      high: {
        name: 'high',
        description: 'Escalação de alta prioridade',
        threshold: 1, // Após 1 falha
        cooldown: 60000, // 1 minuto
        notifications: ['log', 'metrics', 'alert', 'email']
      },
      critical: {
        name: 'critical',
        description: 'Escalação crítica',
        threshold: 1, // Imediata
        cooldown: 30000, // 30 segundos
        notifications: ['log', 'metrics', 'alert', 'email', 'sms']
      }
    },

    // Configurações de notificação
    notifications: {
      email: {
        enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
        recipients: (process.env.ESCALATION_EMAIL_RECIPIENTS || '').split(',').filter(Boolean),
        subject: 'Sistema de Agentes - Escalação {level}'
      },
      sms: {
        enabled: process.env.SMS_NOTIFICATIONS_ENABLED === 'true',
        recipients: (process.env.ESCALATION_SMS_RECIPIENTS || '').split(',').filter(Boolean)
      },
      slack: {
        enabled: process.env.SLACK_NOTIFICATIONS_ENABLED === 'true',
        webhook: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts'
      }
    }
  },

  // Configurações de Restart
  restart: {
    methods: {
      pm2: {
        name: 'pm2',
        description: 'Restart via PM2',
        command: 'pm2 restart',
        timeout: 30000,
        enabled: true
      },
      docker: {
        name: 'docker',
        description: 'Restart via Docker',
        command: 'docker restart',
        timeout: 45000,
        enabled: process.env.DOCKER_ENABLED === 'true'
      },
      systemd: {
        name: 'systemd',
        description: 'Restart via Systemd',
        command: 'systemctl restart',
        timeout: 60000,
        enabled: process.env.SYSTEMD_ENABLED === 'true'
      },
      kubernetes: {
        name: 'kubernetes',
        description: 'Restart via Kubernetes',
        command: 'kubectl delete pod',
        timeout: 120000,
        enabled: process.env.KUBERNETES_ENABLED === 'true'
      }
    },

    // Configurações de verificação pós-restart
    verification: {
      enabled: true,
      timeout: 30000, // 30 segundos
      maxAttempts: 5,
      interval: 5000, // 5 segundos
      healthCheckPath: '/health'
    }
  },

  // Configurações de Monitoramento
  monitoring: {
    // Métricas
    metrics: {
      enabled: true,
      interval: 30000, // 30 segundos
      retention: 86400000 // 24 horas
    },

    // Health checks
    healthCheck: {
      enabled: true,
      interval: 10000, // 10 segundos
      timeout: 5000, // 5 segundos
      endpoints: [
        '/health',
        '/metrics',
        '/status'
      ]
    },

    // Alertas
    alerts: {
      enabled: true,
      thresholds: {
        recoveryFailureRate: 0.5, // 50%
        escalationRate: 0.2, // 20%
        responseTime: 5000, // 5 segundos
        errorRate: 0.1 // 10%
      }
    }
  },

  // Configurações de Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    maxFiles: 5,
    maxSize: '10m',
    datePattern: 'YYYY-MM-DD',
    auditFile: 'logs/audit.json',
    
    // Logs específicos
    recovery: {
      enabled: true,
      level: 'info',
      file: 'logs/recovery.log'
    },
    escalation: {
      enabled: true,
      level: 'warn',
      file: 'logs/escalation.log'
    },
    restart: {
      enabled: true,
      level: 'info',
      file: 'logs/restart.log'
    }
  },

  // Configurações de Segurança
  security: {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
      optionsSuccessStatus: 200
    },
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100, // máximo 100 requests por IP
      message: 'Too many requests from this IP'
    },
    authentication: {
      enabled: process.env.AUTH_ENABLED === 'true',
      secret: process.env.JWT_SECRET || 'recovery-agent-secret',
      expiresIn: '1h'
    }
  },

  // Configurações de SQS
  sqs: {
    region: process.env.AWS_REGION || 'us-east-1',
    queues: {
      input: {
        healthEvents: process.env.SQS_HEALTH_EVENTS_QUEUE || 'health-events',
        agentFailureEvents: process.env.SQS_AGENT_FAILURE_EVENTS_QUEUE || 'agent-failure-events',
        recoveryRequests: process.env.SQS_RECOVERY_REQUESTS_QUEUE || 'recovery-requests'
      },
      output: {
        recoveryEvents: process.env.SQS_RECOVERY_EVENTS_QUEUE || 'recovery-events',
        escalationEvents: process.env.SQS_ESCALATION_EVENTS_QUEUE || 'escalation-events',
        systemNotifications: process.env.SQS_SYSTEM_NOTIFICATIONS_QUEUE || 'system-notifications'
      }
    },
    polling: {
      maxMessages: 10,
      waitTimeSeconds: 20,
      visibilityTimeoutSeconds: 300
    }
  },

  // Configurações de Performance
  performance: {
    // Configurações de concorrência
    concurrency: {
      maxConcurrentRecoveries: 5,
      maxConcurrentRestarts: 3,
      maxConcurrentEscalations: 2
    },

    // Configurações de cache
    cache: {
      enabled: true,
      ttl: 300000, // 5 minutos
      maxSize: 1000
    },

    // Configurações de pool de conexões
    connectionPool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200
    }
  },

  // Configurações de Desenvolvimento
  development: {
    mockMode: process.env.MOCK_MODE === 'true',
    debugMode: process.env.DEBUG_MODE === 'true',
    testMode: process.env.TEST_MODE === 'true',
    simulateFailures: process.env.SIMULATE_FAILURES === 'true'
  }
};

module.exports = config;