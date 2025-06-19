/**
 * Metrics Middleware
 * Middleware de métricas para o Recovery Agent
 */

const promClient = require('prom-client');
const config = require('../config/recoveryConfig');

// Configurar registro de métricas
const register = new promClient.Registry();

// Adicionar métricas padrão
promClient.collectDefaultMetrics({
  register,
  prefix: 'recovery_agent_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

// Métricas customizadas

// Contador de requests HTTP
const httpRequestsTotal = new promClient.Counter({
  name: 'recovery_agent_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Histograma de duração de requests
const httpRequestDuration = new promClient.Histogram({
  name: 'recovery_agent_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register]
});

// Gauge de requests ativas
const httpRequestsActive = new promClient.Gauge({
  name: 'recovery_agent_http_requests_active',
  help: 'Number of active HTTP requests',
  registers: [register]
});

// Métricas de recuperação
const recoveryOperationsTotal = new promClient.Counter({
  name: 'recovery_agent_recovery_operations_total',
  help: 'Total number of recovery operations',
  labelNames: ['agent', 'strategy', 'status'],
  registers: [register]
});

const recoveryOperationDuration = new promClient.Histogram({
  name: 'recovery_agent_recovery_operation_duration_seconds',
  help: 'Duration of recovery operations in seconds',
  labelNames: ['agent', 'strategy', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

const activeRecoveries = new promClient.Gauge({
  name: 'recovery_agent_active_recoveries',
  help: 'Number of active recovery operations',
  registers: [register]
});

// Métricas de restart
const restartOperationsTotal = new promClient.Counter({
  name: 'recovery_agent_restart_operations_total',
  help: 'Total number of restart operations',
  labelNames: ['agent', 'method', 'status'],
  registers: [register]
});

const restartOperationDuration = new promClient.Histogram({
  name: 'recovery_agent_restart_operation_duration_seconds',
  help: 'Duration of restart operations in seconds',
  labelNames: ['agent', 'method', 'status'],
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [register]
});

// Métricas de escalação
const escalationOperationsTotal = new promClient.Counter({
  name: 'recovery_agent_escalation_operations_total',
  help: 'Total number of escalation operations',
  labelNames: ['level', 'reason', 'status'],
  registers: [register]
});

const escalationOperationDuration = new promClient.Histogram({
  name: 'recovery_agent_escalation_operation_duration_seconds',
  help: 'Duration of escalation operations in seconds',
  labelNames: ['level', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

const activeEscalations = new promClient.Gauge({
  name: 'recovery_agent_active_escalations',
  help: 'Number of active escalation operations',
  registers: [register]
});

// Métricas de notificação
const notificationsTotal = new promClient.Counter({
  name: 'recovery_agent_notifications_total',
  help: 'Total number of notifications sent',
  labelNames: ['type', 'status'],
  registers: [register]
});

const notificationDuration = new promClient.Histogram({
  name: 'recovery_agent_notification_duration_seconds',
  help: 'Duration of notification operations in seconds',
  labelNames: ['type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// Métricas de sistema
const systemHealth = new promClient.Gauge({
  name: 'recovery_agent_system_health',
  help: 'System health status (1 = healthy, 0 = unhealthy)',
  registers: [register]
});

const memoryUsage = new promClient.Gauge({
  name: 'recovery_agent_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'],
  registers: [register]
});

const cpuUsage = new promClient.Gauge({
  name: 'recovery_agent_cpu_usage_percent',
  help: 'CPU usage percentage',
  registers: [register]
});

// Middleware de métricas HTTP
const httpMetrics = (req, res, next) => {
  const startTime = Date.now();
  
  // Incrementar requests ativos
  httpRequestsActive.inc();
  
  // Interceptar o fim da resposta
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode.toString();
    
    // Atualizar métricas
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestsActive.dec();
  });
  
  next();
};

// Funções para atualizar métricas de negócio
const recordRecoveryOperation = (agent, strategy, status, duration) => {
  recoveryOperationsTotal.inc({ agent, strategy, status });
  if (duration !== undefined) {
    recoveryOperationDuration.observe({ agent, strategy, status }, duration / 1000);
  }
};

const recordRestartOperation = (agent, method, status, duration) => {
  restartOperationsTotal.inc({ agent, method, status });
  if (duration !== undefined) {
    restartOperationDuration.observe({ agent, method, status }, duration / 1000);
  }
};

const recordEscalationOperation = (level, reason, status, duration) => {
  escalationOperationsTotal.inc({ level, reason, status });
  if (duration !== undefined) {
    escalationOperationDuration.observe({ level, status }, duration / 1000);
  }
};

const recordNotification = (type, status, duration) => {
  notificationsTotal.inc({ type, status });
  if (duration !== undefined) {
    notificationDuration.observe({ type, status }, duration / 1000);
  }
};

const updateActiveRecoveries = (count) => {
  activeRecoveries.set(count);
};

const updateActiveEscalations = (count) => {
  activeEscalations.set(count);
};

const updateSystemHealth = (healthy) => {
  systemHealth.set(healthy ? 1 : 0);
};

const updateMemoryUsage = () => {
  const usage = process.memoryUsage();
  memoryUsage.set({ type: 'rss' }, usage.rss);
  memoryUsage.set({ type: 'heapTotal' }, usage.heapTotal);
  memoryUsage.set({ type: 'heapUsed' }, usage.heapUsed);
  memoryUsage.set({ type: 'external' }, usage.external);
};

const updateCpuUsage = (usage) => {
  cpuUsage.set(usage);
};

// Função para inicializar coleta de métricas do sistema
const startSystemMetricsCollection = () => {
  // Atualizar métricas de memória a cada 30 segundos
  setInterval(() => {
    updateMemoryUsage();
  }, 30000);
  
  // Atualizar métricas de CPU a cada 60 segundos
  setInterval(() => {
    const startUsage = process.cpuUsage();
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const totalUsage = endUsage.user + endUsage.system;
      const percentage = (totalUsage / 1000000) * 100; // Converter para porcentagem
      updateCpuUsage(percentage);
    }, 1000);
  }, 60000);
  
  // Inicializar métricas
  updateMemoryUsage();
  updateSystemHealth(true);
};

// Middleware para endpoint de métricas
const metricsEndpoint = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to collect metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Função para obter métricas específicas
const getMetricsSummary = async () => {
  try {
    const metrics = await register.getMetricsAsJSON();
    
    const summary = {
      timestamp: new Date().toISOString(),
      http: {
        totalRequests: getMetricValue(metrics, 'recovery_agent_http_requests_total'),
        activeRequests: getMetricValue(metrics, 'recovery_agent_http_requests_active'),
        averageResponseTime: getMetricAverage(metrics, 'recovery_agent_http_request_duration_seconds')
      },
      recovery: {
        totalOperations: getMetricValue(metrics, 'recovery_agent_recovery_operations_total'),
        activeOperations: getMetricValue(metrics, 'recovery_agent_active_recoveries'),
        averageDuration: getMetricAverage(metrics, 'recovery_agent_recovery_operation_duration_seconds')
      },
      restart: {
        totalOperations: getMetricValue(metrics, 'recovery_agent_restart_operations_total'),
        averageDuration: getMetricAverage(metrics, 'recovery_agent_restart_operation_duration_seconds')
      },
      escalation: {
        totalOperations: getMetricValue(metrics, 'recovery_agent_escalation_operations_total'),
        activeOperations: getMetricValue(metrics, 'recovery_agent_active_escalations'),
        averageDuration: getMetricAverage(metrics, 'recovery_agent_escalation_operation_duration_seconds')
      },
      notifications: {
        totalSent: getMetricValue(metrics, 'recovery_agent_notifications_total'),
        averageDuration: getMetricAverage(metrics, 'recovery_agent_notification_duration_seconds')
      },
      system: {
        health: getMetricValue(metrics, 'recovery_agent_system_health'),
        memoryUsage: getMetricValue(metrics, 'recovery_agent_memory_usage_bytes'),
        cpuUsage: getMetricValue(metrics, 'recovery_agent_cpu_usage_percent')
      }
    };
    
    return summary;
  } catch (error) {
    throw new Error(`Failed to get metrics summary: ${error.message}`);
  }
};

// Funções auxiliares
function getMetricValue(metrics, name) {
  const metric = metrics.find(m => m.name === name);
  if (!metric || !metric.values || metric.values.length === 0) {
    return 0;
  }
  
  if (metric.type === 'counter' || metric.type === 'gauge') {
    return metric.values.reduce((sum, v) => sum + v.value, 0);
  }
  
  return metric.values[0].value;
}

function getMetricAverage(metrics, name) {
  const metric = metrics.find(m => m.name === name);
  if (!metric || !metric.values || metric.values.length === 0) {
    return 0;
  }
  
  if (metric.type === 'histogram') {
    const sum = metric.values.find(v => v.metricName && v.metricName.includes('_sum'));
    const count = metric.values.find(v => v.metricName && v.metricName.includes('_count'));
    
    if (sum && count && count.value > 0) {
      return sum.value / count.value;
    }
  }
  
  return 0;
}

// Função para resetar métricas (útil para testes)
const resetMetrics = () => {
  register.resetMetrics();
};

// Exportar funcionalidades
module.exports = {
  // Middleware
  httpMetrics,
  metricsEndpoint,
  
  // Funções de registro
  recordRecoveryOperation,
  recordRestartOperation,
  recordEscalationOperation,
  recordNotification,
  
  // Funções de atualização
  updateActiveRecoveries,
  updateActiveEscalations,
  updateSystemHealth,
  updateMemoryUsage,
  updateCpuUsage,
  
  // Funções de controle
  startSystemMetricsCollection,
  getMetricsSummary,
  resetMetrics,
  
  // Registry
  register
};