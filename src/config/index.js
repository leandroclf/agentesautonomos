/**
 * Configuração Central do Sistema de Agentes Autônomos
 * Fase 1: Configuração base com mocks e SQS
 */

require('dotenv').config();

const config = {
  // Ambiente
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 3000,
  
  // AWS SQS Configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sqs: {
      queues: {
        // Core Agents Queues
        core: {
          event: process.env.SQS_EVENT_AGENT_QUEUE || 'event-agent-queue-dev',
          planning: process.env.SQS_PLANNING_AGENT_QUEUE || 'planning-agent-queue-dev',
          execution: process.env.SQS_EXECUTION_AGENT_QUEUE || 'execution-agent-queue-dev'
        },
        
        // Auxiliary Agents Queues
        auxiliary: {
          monitoring: process.env.SQS_MONITORING_AGENT_QUEUE || 'monitoring-agent-queue-dev',
          security: process.env.SQS_SECURITY_AGENT_QUEUE || 'security-agent-queue-dev',
          policy: process.env.SQS_POLICY_AGENT_QUEUE || 'policy-agent-queue-dev'
        },
        
        // Future Agents (Phase 3+)
        future: {
          mediation: process.env.SQS_MEDIATION_AGENT_QUEUE || 'mediation-agent-queue-dev',
          learning: process.env.SQS_LEARNING_AGENT_QUEUE || 'learning-agent-queue-dev',
          recovery: process.env.SQS_RECOVERY_AGENT_QUEUE || 'recovery-agent-queue-dev',
          persistence: process.env.SQS_PERSISTENCE_AGENT_QUEUE || 'persistence-agent-queue-dev',
          enrichment: process.env.SQS_ENRICHMENT_AGENT_QUEUE || 'enrichment-agent-queue-dev',
          lifecycle: process.env.SQS_LIFECYCLE_AGENT_QUEUE || 'lifecycle-agent-queue-dev',
          externalApiGateway: process.env.SQS_EXTERNAL_API_GATEWAY_QUEUE || 'external-api-gateway-queue-dev'
        }
      },
      
      // DLQ Configuration
      dlqSuffix: process.env.SQS_DLQ_SUFFIX || '-dlq',
      dlqMaxReceiveCount: parseInt(process.env.SQS_DLQ_MAX_RECEIVE_COUNT) || 3,
      
      // SQS Polling Configuration
      polling: {
        maxMessages: parseInt(process.env.SQS_MAX_MESSAGES) || 10,
        waitTimeSeconds: parseInt(process.env.SQS_WAIT_TIME) || 20,
        visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT) || 300
      },
      
      // Retry Configuration
      retry: {
        maxAttempts: parseInt(process.env.SQS_MAX_RETRY_ATTEMPTS) || 3,
        backoffMultiplier: parseFloat(process.env.SQS_BACKOFF_MULTIPLIER) || 2,
        initialDelay: parseInt(process.env.SQS_INITIAL_DELAY) || 1000
      }
    }
  },
  
  // Mock APIs (Anti-Deadlock Strategy - Phase 1)
  mocks: {
    policyApi: process.env.MOCK_POLICY_API_URL || 'http://localhost:3001',
    stateApi: process.env.MOCK_STATE_API_URL || 'http://localhost:3002',
    schemaRegistry: process.env.MOCK_SCHEMA_REGISTRY_URL || 'http://localhost:3003'
  },
  
  // Real APIs (Phase 4+)
  apis: {
    policyApi: process.env.POLICY_API_URL || 'https://api.policy.internal',
    stateApi: process.env.STATE_API_URL || 'https://api.state.internal',
    schemaRegistry: process.env.SCHEMA_REGISTRY_URL || 'https://schema.registry.internal'
  },
  
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'agentes_autonomos',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  },
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD
  },
  
  // Observability
  observability: {
    metricsPort: parseInt(process.env.METRICS_PORT) || 9090,
    prometheusEndpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics',
    logLevel: process.env.LOG_LEVEL || 'info',
    logFormat: process.env.LOG_FORMAT || 'json'
  },
  
  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
    apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  // Kubernetes
  kubernetes: {
    namespace: process.env.K8S_NAMESPACE || 'agentes-autonomos',
    serviceAccount: process.env.K8S_SERVICE_ACCOUNT || 'agentes-sa'
  },
  
  // Health Checks
  health: {
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    checkTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000
  },
  
  // Agent-specific configurations
  agents: {
    // Event Agent
    event: {
      port: parseInt(process.env.EVENT_AGENT_PORT) || 3003,
      maxEventSize: process.env.EVENT_MAX_SIZE || '5mb',
      eventTimeout: parseInt(process.env.EVENT_TIMEOUT) || 15000,
      retryAttempts: parseInt(process.env.EVENT_RETRY_ATTEMPTS) || 3,
      retryDelay: parseInt(process.env.EVENT_RETRY_DELAY) || 1000
    },
    
    // Planning Agent
    planning: {
      port: parseInt(process.env.PLANNING_AGENT_PORT) || 3004,
      maxPlanComplexity: parseInt(process.env.PLANNING_MAX_COMPLEXITY) || 100,
      planTimeout: parseInt(process.env.PLANNING_TIMEOUT) || 60000,
      cacheEnabled: process.env.PLANNING_CACHE_ENABLED !== 'false',
      cacheTimeout: parseInt(process.env.PLANNING_CACHE_TIMEOUT) || 300000
    },
    
    // Execution Agent
    execution: {
      port: parseInt(process.env.EXECUTION_AGENT_PORT) || 3005,
      maxConcurrentExecutions: parseInt(process.env.EXECUTION_MAX_CONCURRENT) || 10,
      executionTimeout: parseInt(process.env.EXECUTION_TIMEOUT) || 300000,
      retryAttempts: parseInt(process.env.EXECUTION_RETRY_ATTEMPTS) || 3,
      retryDelay: parseInt(process.env.EXECUTION_RETRY_DELAY) || 2000
    },
    
    // Monitoring Agent
    monitoring: {
      port: parseInt(process.env.MONITORING_AGENT_PORT) || 3008,
      metricsInterval: parseInt(process.env.MONITORING_METRICS_INTERVAL) || 60000,
      alertThresholds: {
        errorRate: parseFloat(process.env.MONITORING_ERROR_RATE_THRESHOLD) || 0.05,
        responseTime: parseInt(process.env.MONITORING_RESPONSE_TIME_THRESHOLD) || 5000,
        memoryUsage: parseFloat(process.env.MONITORING_MEMORY_THRESHOLD) || 0.8,
        cpuUsage: parseFloat(process.env.MONITORING_CPU_THRESHOLD) || 0.8,
        queueDepth: parseInt(process.env.MONITORING_QUEUE_DEPTH_THRESHOLD) || 100
      },
      retentionPeriod: parseInt(process.env.MONITORING_RETENTION_PERIOD) || 7 * 24 * 60 * 60 * 1000
    },
    
    // Security Agent
    security: {
      port: parseInt(process.env.SECURITY_AGENT_PORT) || 3007,
      sessionTimeout: parseInt(process.env.SECURITY_SESSION_TIMEOUT) || 60 * 60 * 1000,
      maxLoginAttempts: parseInt(process.env.SECURITY_MAX_LOGIN_ATTEMPTS) || 5,
      lockoutDuration: parseInt(process.env.SECURITY_LOCKOUT_DURATION) || 15 * 60 * 1000,
      tokenCleanupInterval: parseInt(process.env.SECURITY_TOKEN_CLEANUP_INTERVAL) || 60 * 60 * 1000
    },
    
    // ACL Middleware Agent
    acl: {
      port: parseInt(process.env.ACL_AGENT_PORT) || 3006,
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'X-Requested-With']
      },
      rateLimiting: {
        windowMs: 15 * 60 * 1000,
        max: 1000
      }
    },
    
    // Policy Agent
    policy: {
      port: parseInt(process.env.POLICY_AGENT_PORT) || 3009,
      cacheTimeout: parseInt(process.env.POLICY_CACHE_TIMEOUT) || 300000,
      maxViolationHistory: parseInt(process.env.POLICY_MAX_VIOLATION_HISTORY) || 1000,
      auditRetention: parseInt(process.env.POLICY_AUDIT_RETENTION) || 30 * 24 * 60 * 60 * 1000,
      enforcementModes: ['warn', 'block', 'audit'],
      severityLevels: ['low', 'medium', 'high', 'critical']
    },
    
    // State Management Agent
    state: {
      port: parseInt(process.env.STATE_AGENT_PORT) || 3007,
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
      },
      rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        message: 'Too many requests from this IP'
      },
      stateRetention: parseInt(process.env.STATE_RETENTION_PERIOD) || 7 * 24 * 60 * 60 * 1000,
      maxStateSize: parseInt(process.env.MAX_STATE_SIZE) || 1048576,
      compressionEnabled: process.env.STATE_COMPRESSION_ENABLED !== 'false'
    }
  },
  
  // MARL Configuration
  marl: {
    learningRate: parseFloat(process.env.MARL_LEARNING_RATE) || 0.01,
    discountFactor: parseFloat(process.env.MARL_DISCOUNT_FACTOR) || 0.95,
    explorationRate: parseFloat(process.env.MARL_EXPLORATION_RATE) || 0.1,
    updateFrequency: parseInt(process.env.MARL_UPDATE_FREQUENCY) || 100
  },

  // Shared Configuration
  shared: {
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
      enableFile: process.env.LOG_ENABLE_FILE === 'true',
      logDirectory: process.env.LOG_DIRECTORY || './logs',
      maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE) || 5242880,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
    },
    metrics: {
      histogramBuckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    },
    sqs: {
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.SQS_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  }
};

// Validação de configurações críticas
function validateConfig() {
  const errors = [];
  
  if (config.env === 'production') {
    if (!config.aws.accessKeyId || !config.aws.secretAccessKey) {
      errors.push('AWS credentials are required in production');
    }
    
    if (config.security.jwtSecret === 'default-jwt-secret-change-in-production') {
      errors.push('JWT secret must be changed in production');
    }
    
    if (!config.database.password) {
      errors.push('Database password is required in production');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Função para obter URL da API baseada no ambiente
function getApiUrl(apiType) {
  const useMocks = config.env === 'development' || config.env === 'test';
  return useMocks ? config.mocks[apiType] : config.apis[apiType];
}

// Função para obter nome completo da fila SQS com ambiente
function getQueueName(queueType, environment = null) {
  const env = environment || config.env;
  const baseName = config.aws.sqs[queueType];
  
  if (baseName.includes(env)) {
    return baseName;
  }
  
  return `${baseName.replace('-dev', '').replace('-staging', '').replace('-prod', '')}-${env}`;
}

// Função para obter nome da DLQ
function getDLQName(queueType, environment = null) {
  return getQueueName(queueType, environment) + config.aws.sqs.dlqSuffix;
}

module.exports = {
  ...config,
  validateConfig,
  getApiUrl,
  getQueueName,
  getDLQName
};