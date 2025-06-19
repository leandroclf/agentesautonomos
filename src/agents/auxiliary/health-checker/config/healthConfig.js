/**
 * Health Checker Agent Configuration
 * Configurações para monitoramento de saúde dos agentes
 */

module.exports = {
  // Configurações gerais
  agent: {
    id: 'health-checker-agent',
    name: 'Health Checker Agent',
    version: '1.0.0',
    port: process.env.HEALTH_CHECKER_PORT || 3020,
    environment: process.env.NODE_ENV || 'development'
  },

  // Configurações de health check
  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 segundos
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,     // 5 segundos
    retryAttempts: parseInt(process.env.HEALTH_CHECK_RETRIES) || 3,
    retryDelay: parseInt(process.env.HEALTH_CHECK_RETRY_DELAY) || 1000, // 1 segundo
    alertThreshold: parseInt(process.env.HEALTH_ALERT_THRESHOLD) || 2, // Falhas consecutivas
    recoveryThreshold: parseInt(process.env.HEALTH_RECOVERY_THRESHOLD) || 2 // Sucessos consecutivos
  },

  // Agentes monitorados
  monitoredAgents: [
    {
      name: 'interface-agent',
      url: process.env.INTERFACE_AGENT_URL || 'http://localhost:3001',
      healthEndpoint: '/health',
      critical: true,
      timeout: 5000
    },
    {
      name: 'event-agent',
      url: process.env.EVENT_AGENT_URL || 'http://localhost:3002',
      healthEndpoint: '/health',
      critical: true,
      timeout: 5000
    },
    {
      name: 'planning-agent',
      url: process.env.PLANNING_AGENT_URL || 'http://localhost:3003',
      healthEndpoint: '/health',
      critical: true,
      timeout: 5000
    },
    {
      name: 'execution-agent',
      url: process.env.EXECUTION_AGENT_URL || 'http://localhost:3004',
      healthEndpoint: '/health',
      critical: true,
      timeout: 5000
    },
    {
      name: 'state-management-agent',
      url: process.env.STATE_AGENT_URL || 'http://localhost:3005',
      healthEndpoint: '/health',
      critical: true,
      timeout: 5000
    },
    {
      name: 'acl-middleware-agent',
      url: process.env.ACL_AGENT_URL || 'http://localhost:3006',
      healthEndpoint: '/health',
      critical: true,
      timeout: 5000
    },
    {
      name: 'monitoring-agent',
      url: process.env.MONITORING_AGENT_URL || 'http://localhost:3007',
      healthEndpoint: '/health',
      critical: false,
      timeout: 5000
    },
    {
      name: 'policy-agent',
      url: process.env.POLICY_AGENT_URL || 'http://localhost:3008',
      healthEndpoint: '/health',
      critical: false,
      timeout: 5000
    },
    {
      name: 'security-agent',
      url: process.env.SECURITY_AGENT_URL || 'http://localhost:3009',
      healthEndpoint: '/health',
      critical: false,
      timeout: 5000
    },
    {
      name: 'marl-agent',
      url: process.env.MARL_AGENT_URL || 'http://localhost:3010',
      healthEndpoint: '/health',
      critical: false,
      timeout: 5000
    },
    {
      name: 'coordination-agent',
      url: process.env.COORDINATION_AGENT_URL || 'http://localhost:3011',
      healthEndpoint: '/health',
      critical: false,
      timeout: 5000
    },
    {
      name: 'mediator-agent',
      url: process.env.MEDIATOR_AGENT_URL || 'http://localhost:3012',
      healthEndpoint: '/health',
      critical: false,
      timeout: 5000
    },
    {
      name: 'orchestrator-agent',
      url: process.env.ORCHESTRATOR_AGENT_URL || 'http://localhost:3013',
      healthEndpoint: '/health',
      critical: false,
      timeout: 5000
    }
  ],

  // Configurações de alertas
  alerts: {
    enabled: process.env.ALERTS_ENABLED !== 'false',
    webhookUrl: process.env.ALERT_WEBHOOK_URL,
    emailEnabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
    slackEnabled: process.env.SLACK_ALERTS_ENABLED === 'true',
    
    // Tipos de alertas
    types: {
      AGENT_DOWN: {
        severity: 'critical',
        cooldown: 300000 // 5 minutos
      },
      AGENT_DEGRADED: {
        severity: 'warning',
        cooldown: 600000 // 10 minutos
      },
      AGENT_RECOVERED: {
        severity: 'info',
        cooldown: 0
      },
      SYSTEM_OVERLOAD: {
        severity: 'warning',
        cooldown: 900000 // 15 minutos
      }
    }
  },

  // Configurações de métricas
  metrics: {
    enabled: true,
    historyRetention: parseInt(process.env.METRICS_RETENTION_HOURS) || 24, // 24 horas
    aggregationInterval: parseInt(process.env.METRICS_AGGREGATION_INTERVAL) || 60000, // 1 minuto
    
    // Thresholds para alertas
    thresholds: {
      responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD) || 5000, // 5 segundos
      errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.05, // 5%
      memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.85, // 85%
      cpuUsage: parseFloat(process.env.CPU_USAGE_THRESHOLD) || 0.80 // 80%
    }
  },

  // Configurações SQS
  sqs: {
    region: process.env.AWS_REGION || 'us-east-1',
    queues: {
      healthEvents: process.env.SQS_HEALTH_EVENTS_QUEUE || 'health-events',
      agentFailureEvents: process.env.SQS_AGENT_FAILURE_QUEUE || 'agent-failure-events'
    },
    messageRetention: 1209600, // 14 dias
    visibilityTimeout: 30
  },

  // Configurações de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: process.env.LOG_MAX_SIZE || '10m'
  },

  // Configurações de segurança
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 1000 // máximo 1000 requests por janela
    },
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }
  }
};