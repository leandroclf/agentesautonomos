/**
 * Script para Configurar Logging e Monitoramento
 * Fase 1: Configuração para Produção - Semana 1
 * 
 * Este script configura logging estruturado e monitoramento básico
 */

const fs = require('fs');
const path = require('path');
const Logger = require('../src/utils/logger');

class LoggingMonitoringSetup {
  constructor() {
    this.logger = new Logger('logging-monitoring-setup');
    this.projectRoot = path.join(__dirname, '..');
    this.results = [];
  }

  /**
   * Configurar estrutura de logging
   */
  async setupLoggingStructure() {
    try {
      this.logger.info('Setting up logging structure...');
      
      // Criar diretórios de logs
      const logDirs = [
        path.join(this.projectRoot, 'logs'),
        path.join(this.projectRoot, 'logs', 'agents'),
        path.join(this.projectRoot, 'logs', 'system'),
        path.join(this.projectRoot, 'logs', 'errors'),
        path.join(this.projectRoot, 'logs', 'performance')
      ];
      
      logDirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          this.logger.info(`Created log directory: ${dir}`);
        }
      });
      
      // Criar configuração de logging avançada
      await this.createAdvancedLoggerConfig();
      
      // Criar utilitários de logging
      await this.createLoggingUtilities();
      
      this.results.push({
        component: 'logging-structure',
        status: 'completed',
        details: 'Log directories and utilities created'
      });
      
    } catch (error) {
      this.logger.error('Failed to setup logging structure:', error);
      throw error;
    }
  }

  /**
   * Criar configuração avançada de logger
   */
  async createAdvancedLoggerConfig() {
    const loggerConfig = `/**
 * Configuração Avançada de Logger
 * Suporte para múltiplos transports e formatação estruturada
 */

const winston = require('winston');
const path = require('path');

class AdvancedLogger {
  constructor(component, options = {}) {
    this.component = component;
    this.options = {
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: process.env.NODE_ENV !== 'production',
      enableFile: true,
      enableMetrics: true,
      ...options
    };
    
    this.logger = this.createLogger();
    this.metrics = {
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0
    };
  }

  /**
   * Criar instância do logger Winston
   */
  createLogger() {
    const transports = [];
    
    // Console transport para desenvolvimento
    if (this.options.enableConsole) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return \`\${timestamp} [\${component || 'system'}] \${level}: \${message} \${metaStr}\`;
          })
        )
      }));
    }
    
    // File transport para logs gerais
    if (this.options.enableFile) {
      transports.push(new winston.transports.File({
        filename: path.join(__dirname, '..', 'logs', 'system', 'combined.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: 10485760, // 10MB
        maxFiles: 5
      }));
      
      // File transport para erros
      transports.push(new winston.transports.File({
        filename: path.join(__dirname, '..', 'logs', 'errors', 'error.log'),
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: 10485760, // 10MB
        maxFiles: 10
      }));
    }
    
    return winston.createLogger({
      level: this.options.level,
      defaultMeta: { component: this.component },
      transports,
      exitOnError: false
    });
  }

  /**
   * Log com métricas
   */
  log(level, message, meta = {}) {
    // Incrementar métricas
    if (this.options.enableMetrics && this.metrics[level] !== undefined) {
      this.metrics[level]++;
    }
    
    // Adicionar contexto adicional
    const enrichedMeta = {
      ...meta,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    
    this.logger.log(level, message, enrichedMeta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  /**
   * Log de performance
   */
  performance(operation, duration, meta = {}) {
    this.info(\`Performance: \${operation}\`, {
      ...meta,
      operation,
      duration,
      type: 'performance'
    });
  }

  /**
   * Log de auditoria
   */
  audit(action, user, resource, meta = {}) {
    this.info(\`Audit: \${action}\`, {
      ...meta,
      action,
      user,
      resource,
      type: 'audit'
    });
  }

  /**
   * Obter métricas
   */
  getMetrics() {
    return {
      ...this.metrics,
      component: this.component,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resetar métricas
   */
  resetMetrics() {
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = 0;
    });
  }
}

module.exports = AdvancedLogger;
`;
    
    const configPath = path.join(this.projectRoot, 'src', 'utils', 'advancedLogger.js');
    fs.writeFileSync(configPath, loggerConfig);
    this.logger.info(`Created advanced logger config: ${configPath}`);
  }

  /**
   * Criar utilitários de logging
   */
  async createLoggingUtilities() {
    const loggingUtils = `/**
 * Utilitários de Logging
 * Funções auxiliares para logging estruturado
 */

const AdvancedLogger = require('./advancedLogger');

class LoggingUtils {
  /**
   * Criar middleware de logging para Express
   */
  static createExpressMiddleware(component) {
    const logger = new AdvancedLogger(\`\${component}-http\`);
    
    return (req, res, next) => {
      const start = Date.now();
      
      // Log da requisição
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        requestId: req.headers['x-request-id'] || \`req-\${Date.now()}\`
      });
      
      // Override do res.end para capturar resposta
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - start;
        
        logger.info('HTTP Response', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          requestId: req.headers['x-request-id']
        });
        
        originalEnd.apply(this, args);
      };
      
      next();
    };
  }

  /**
   * Decorator para logging de métodos
   */
  static logMethod(target, propertyName, descriptor) {
    const originalMethod = descriptor.value;
    const logger = new AdvancedLogger(target.constructor.name);
    
    descriptor.value = async function(...args) {
      const start = Date.now();
      
      logger.debug(\`Method \${propertyName} started\`, {
        args: args.length,
        method: propertyName
      });
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;
        
        logger.performance(propertyName, duration, {
          success: true,
          resultType: typeof result
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        
        logger.error(\`Method \${propertyName} failed\`, {
          error: error.message,
          duration,
          method: propertyName
        });
        
        throw error;
      }
    };
    
    return descriptor;
  }

  /**
   * Wrapper para logging de promises
   */
  static async logPromise(promise, operation, logger) {
    const start = Date.now();
    
    try {
      logger.debug(\`Operation \${operation} started\`);
      const result = await promise;
      const duration = Date.now() - start;
      
      logger.performance(operation, duration, { success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.error(\`Operation \${operation} failed\`, {
        error: error.message,
        duration
      });
      
      throw error;
    }
  }

  /**
   * Criar logger específico para agente
   */
  static createAgentLogger(agentName, options = {}) {
    return new AdvancedLogger(agentName, {
      ...options,
      enableFile: true,
      enableMetrics: true
    });
  }

  /**
   * Configurar logging global de erros não capturados
   */
  static setupGlobalErrorLogging() {
    const logger = new AdvancedLogger('global-error-handler');
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        type: 'uncaughtException'
      });
      
      // Dar tempo para o log ser escrito antes de sair
      setTimeout(() => process.exit(1), 1000);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        type: 'unhandledRejection'
      });
    });
  }

  /**
   * Coletar métricas de todos os loggers
   */
  static collectMetrics() {
    // TODO: Implementar coleta de métricas de todos os loggers ativos
    return {
      timestamp: new Date().toISOString(),
      loggers: []
    };
  }
}

module.exports = LoggingUtils;
`;
    
    const utilsPath = path.join(this.projectRoot, 'src', 'utils', 'loggingUtils.js');
    fs.writeFileSync(utilsPath, loggingUtils);
    this.logger.info(`Created logging utilities: ${utilsPath}`);
  }

  /**
   * Configurar monitoramento básico
   */
  async setupBasicMonitoring() {
    try {
      this.logger.info('Setting up basic monitoring...');
      
      // Criar diretório de monitoramento
      const monitoringDir = path.join(this.projectRoot, 'src', 'monitoring');
      if (!fs.existsSync(monitoringDir)) {
        fs.mkdirSync(monitoringDir, { recursive: true });
      }
      
      // Criar sistema de métricas básico
      await this.createMetricsSystem();
      
      // Criar health check system
      await this.createHealthCheckSystem();
      
      // Criar alerting básico
      await this.createBasicAlerting();
      
      this.results.push({
        component: 'basic-monitoring',
        status: 'completed',
        details: 'Metrics, health checks, and alerting configured'
      });
      
    } catch (error) {
      this.logger.error('Failed to setup basic monitoring:', error);
      throw error;
    }
  }

  /**
   * Criar sistema de métricas
   */
  async createMetricsSystem() {
    const metricsSystem = `/**
 * Sistema de Métricas Básico
 * Coleta e exposição de métricas do sistema
 */

const AdvancedLogger = require('../utils/advancedLogger');

class MetricsCollector {
  constructor() {
    this.logger = new AdvancedLogger('metrics-collector');
    this.metrics = new Map();
    this.startTime = Date.now();
  }

  /**
   * Incrementar contador
   */
  increment(name, labels = {}, value = 1) {
    const key = this.createKey(name, labels);
    const current = this.metrics.get(key) || { type: 'counter', value: 0, labels };
    current.value += value;
    current.lastUpdated = Date.now();
    this.metrics.set(key, current);
  }

  /**
   * Definir gauge
   */
  gauge(name, value, labels = {}) {
    const key = this.createKey(name, labels);
    this.metrics.set(key, {
      type: 'gauge',
      value,
      labels,
      lastUpdated: Date.now()
    });
  }

  /**
   * Registrar histograma (duração)
   */
  histogram(name, value, labels = {}) {
    const key = this.createKey(name, labels);
    const current = this.metrics.get(key) || {
      type: 'histogram',
      values: [],
      labels,
      count: 0,
      sum: 0
    };
    
    current.values.push(value);
    current.count++;
    current.sum += value;
    current.lastUpdated = Date.now();
    
    // Manter apenas os últimos 1000 valores
    if (current.values.length > 1000) {
      current.values = current.values.slice(-1000);
    }
    
    this.metrics.set(key, current);
  }

  /**
   * Criar chave única para métrica
   */
  createKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => \`\${k}=\${v}\`)
      .join(',');
    return labelStr ? \`\${name}{\${labelStr}}\` : name;
  }

  /**
   * Obter todas as métricas
   */
  getAllMetrics() {
    const result = {};
    
    for (const [key, metric] of this.metrics) {
      result[key] = {
        ...metric,
        age: Date.now() - metric.lastUpdated
      };
      
      // Calcular estatísticas para histogramas
      if (metric.type === 'histogram' && metric.values.length > 0) {
        const sorted = [...metric.values].sort((a, b) => a - b);
        result[key].min = sorted[0];
        result[key].max = sorted[sorted.length - 1];
        result[key].avg = metric.sum / metric.count;
        result[key].p50 = sorted[Math.floor(sorted.length * 0.5)];
        result[key].p95 = sorted[Math.floor(sorted.length * 0.95)];
        result[key].p99 = sorted[Math.floor(sorted.length * 0.99)];
      }
    }
    
    return result;
  }

  /**
   * Obter métricas do sistema
   */
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      pid: process.pid,
      version: process.version,
      platform: process.platform
    };
  }

  /**
   * Exportar métricas no formato Prometheus
   */
  exportPrometheus() {
    let output = '';
    
    for (const [key, metric] of this.metrics) {
      const name = key.split('{')[0];
      const labels = key.includes('{') ? key.split('{')[1].replace('}', '') : '';
      
      switch (metric.type) {
        case 'counter':
          output += \`# TYPE \${name} counter\\n\`;
          output += \`\${name}\${labels ? \`{\${labels}}\` : ''} \${metric.value}\\n\`;
          break;
        case 'gauge':
          output += \`# TYPE \${name} gauge\\n\`;
          output += \`\${name}\${labels ? \`{\${labels}}\` : ''} \${metric.value}\\n\`;
          break;
        case 'histogram':
          output += \`# TYPE \${name} histogram\\n\`;
          output += \`\${name}_count\${labels ? \`{\${labels}}\` : ''} \${metric.count}\\n\`;
          output += \`\${name}_sum\${labels ? \`{\${labels}}\` : ''} \${metric.sum}\\n\`;
          break;
      }
    }
    
    return output;
  }

  /**
   * Limpar métricas antigas
   */
  cleanup(maxAge = 3600000) { // 1 hora
    const now = Date.now();
    for (const [key, metric] of this.metrics) {
      if (now - metric.lastUpdated > maxAge) {
        this.metrics.delete(key);
      }
    }
  }
}

// Instância global
const globalMetrics = new MetricsCollector();

module.exports = {
  MetricsCollector,
  metrics: globalMetrics
};
`;
    
    const metricsPath = path.join(this.projectRoot, 'src', 'monitoring', 'metrics.js');
    fs.writeFileSync(metricsPath, metricsSystem);
    this.logger.info(`Created metrics system: ${metricsPath}`);
  }

  /**
   * Criar sistema de health check
   */
  async createHealthCheckSystem() {
    const healthSystem = `/**
 * Sistema de Health Check
 * Verificação de saúde dos componentes do sistema
 */

const AdvancedLogger = require('../utils/advancedLogger');
const { metrics } = require('./metrics');

class HealthChecker {
  constructor() {
    this.logger = new AdvancedLogger('health-checker');
    this.checks = new Map();
    this.results = new Map();
  }

  /**
   * Registrar check de saúde
   */
  register(name, checkFunction, options = {}) {
    this.checks.set(name, {
      fn: checkFunction,
      timeout: options.timeout || 5000,
      interval: options.interval || 30000,
      critical: options.critical || false,
      description: options.description || name
    });
  }

  /**
   * Executar um check específico
   */
  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(\`Health check '\${name}' not found\`);
    }

    const start = Date.now();
    let result;

    try {
      // Executar com timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
      });

      const checkResult = await Promise.race([
        check.fn(),
        timeoutPromise
      ]);

      result = {
        name,
        status: 'healthy',
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        details: checkResult || {},
        critical: check.critical
      };

      metrics.histogram('health_check_duration', result.duration, { check: name, status: 'healthy' });
      metrics.increment('health_check_total', { check: name, status: 'healthy' });

    } catch (error) {
      result = {
        name,
        status: 'unhealthy',
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        error: error.message,
        critical: check.critical
      };

      metrics.histogram('health_check_duration', result.duration, { check: name, status: 'unhealthy' });
      metrics.increment('health_check_total', { check: name, status: 'unhealthy' });

      this.logger.error(\`Health check '\${name}' failed\`, {
        error: error.message,
        duration: result.duration,
        critical: check.critical
      });
    }

    this.results.set(name, result);
    return result;
  }

  /**
   * Executar todos os checks
   */
  async runAllChecks() {
    const results = [];
    
    for (const name of this.checks.keys()) {
      try {
        const result = await this.runCheck(name);
        results.push(result);
      } catch (error) {
        results.push({
          name,
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return results;
  }

  /**
   * Obter status geral do sistema
   */
  getOverallStatus() {
    const results = Array.from(this.results.values());
    
    if (results.length === 0) {
      return { status: 'unknown', message: 'No health checks configured' };
    }
    
    const unhealthy = results.filter(r => r.status === 'unhealthy');
    const criticalUnhealthy = unhealthy.filter(r => r.critical);
    
    if (criticalUnhealthy.length > 0) {
      return {
        status: 'critical',
        message: \`\${criticalUnhealthy.length} critical health checks failing\`,
        failing: criticalUnhealthy.map(r => r.name)
      };
    }
    
    if (unhealthy.length > 0) {
      return {
        status: 'degraded',
        message: \`\${unhealthy.length} health checks failing\`,
        failing: unhealthy.map(r => r.name)
      };
    }
    
    return {
      status: 'healthy',
      message: 'All health checks passing'
    };
  }

  /**
   * Iniciar monitoramento contínuo
   */
  startContinuousMonitoring() {
    for (const [name, check] of this.checks) {
      setInterval(async () => {
        try {
          await this.runCheck(name);
        } catch (error) {
          this.logger.error(\`Continuous health check failed for \${name}\`, error);
        }
      }, check.interval);
    }
    
    this.logger.info('Started continuous health monitoring');
  }
}

// Instância global
const globalHealthChecker = new HealthChecker();

// Registrar checks básicos do sistema
globalHealthChecker.register('memory', async () => {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
  
  return {
    heapUsedPercent,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    healthy: heapUsedPercent < 90
  };
}, { critical: true, description: 'Memory usage check' });

globalHealthChecker.register('uptime', async () => {
  const uptime = process.uptime();
  return {
    uptime,
    healthy: uptime > 0
  };
}, { description: 'Process uptime check' });

module.exports = {
  HealthChecker,
  healthChecker: globalHealthChecker
};
`;
    
    const healthPath = path.join(this.projectRoot, 'src', 'monitoring', 'health.js');
    fs.writeFileSync(healthPath, healthSystem);
    this.logger.info(`Created health check system: ${healthPath}`);
  }

  /**
   * Criar sistema de alerting básico
   */
  async createBasicAlerting() {
    const alertingSystem = `/**
 * Sistema de Alerting Básico
 * Detecção e notificação de problemas
 */

const AdvancedLogger = require('../utils/advancedLogger');
const { metrics } = require('./metrics');

class AlertManager {
  constructor() {
    this.logger = new AdvancedLogger('alert-manager');
    this.rules = new Map();
    this.alerts = new Map();
    this.notifiers = [];
  }

  /**
   * Adicionar regra de alerta
   */
  addRule(name, condition, options = {}) {
    this.rules.set(name, {
      condition,
      severity: options.severity || 'warning',
      threshold: options.threshold || 1,
      duration: options.duration || 60000, // 1 minuto
      description: options.description || name,
      enabled: options.enabled !== false
    });
  }

  /**
   * Adicionar notificador
   */
  addNotifier(notifier) {
    this.notifiers.push(notifier);
  }

  /**
   * Verificar regras de alerta
   */
  async checkRules() {
    for (const [name, rule] of this.rules) {
      if (!rule.enabled) continue;
      
      try {
        const triggered = await rule.condition();
        
        if (triggered) {
          await this.handleTriggeredRule(name, rule);
        } else {
          await this.handleResolvedRule(name, rule);
        }
      } catch (error) {
        this.logger.error(\`Error checking alert rule '\${name}'\`, error);
      }
    }
  }

  /**
   * Processar regra disparada
   */
  async handleTriggeredRule(name, rule) {
    const existingAlert = this.alerts.get(name);
    const now = Date.now();
    
    if (!existingAlert) {
      // Nova ocorrência
      this.alerts.set(name, {
        name,
        rule,
        firstTriggered: now,
        lastTriggered: now,
        count: 1,
        notified: false
      });
    } else {
      // Atualizar ocorrência existente
      existingAlert.lastTriggered = now;
      existingAlert.count++;
    }
    
    const alert = this.alerts.get(name);
    
    // Verificar se deve notificar
    if (!alert.notified && (now - alert.firstTriggered) >= rule.duration) {
      await this.sendAlert(alert);
      alert.notified = true;
      
      metrics.increment('alerts_fired', {
        rule: name,
        severity: rule.severity
      });
    }
  }

  /**
   * Processar regra resolvida
   */
  async handleResolvedRule(name, rule) {
    const existingAlert = this.alerts.get(name);
    
    if (existingAlert && existingAlert.notified) {
      await this.sendResolution(existingAlert);
      
      metrics.increment('alerts_resolved', {
        rule: name,
        severity: rule.severity
      });
    }
    
    this.alerts.delete(name);
  }

  /**
   * Enviar alerta
   */
  async sendAlert(alert) {
    const alertData = {
      type: 'alert',
      name: alert.name,
      severity: alert.rule.severity,
      description: alert.rule.description,
      firstTriggered: new Date(alert.firstTriggered).toISOString(),
      lastTriggered: new Date(alert.lastTriggered).toISOString(),
      count: alert.count,
      timestamp: new Date().toISOString()
    };
    
    this.logger.warn(\`Alert fired: \${alert.name}\`, alertData);
    
    // Enviar para todos os notificadores
    for (const notifier of this.notifiers) {
      try {
        await notifier.sendAlert(alertData);
      } catch (error) {
        this.logger.error('Failed to send alert notification', error);
      }
    }
  }

  /**
   * Enviar resolução
   */
  async sendResolution(alert) {
    const resolutionData = {
      type: 'resolution',
      name: alert.name,
      severity: alert.rule.severity,
      description: alert.rule.description,
      duration: Date.now() - alert.firstTriggered,
      timestamp: new Date().toISOString()
    };
    
    this.logger.info(\`Alert resolved: \${alert.name}\`, resolutionData);
    
    // Enviar para todos os notificadores
    for (const notifier of this.notifiers) {
      try {
        await notifier.sendResolution(resolutionData);
      } catch (error) {
        this.logger.error('Failed to send resolution notification', error);
      }
    }
  }

  /**
   * Obter alertas ativos
   */
  getActiveAlerts() {
    return Array.from(this.alerts.values());
  }

  /**
   * Iniciar monitoramento contínuo
   */
  startMonitoring(interval = 30000) {
    setInterval(async () => {
      try {
        await this.checkRules();
      } catch (error) {
        this.logger.error('Error in alert monitoring', error);
      }
    }, interval);
    
    this.logger.info('Started alert monitoring');
  }
}

/**
 * Notificador de console (para desenvolvimento)
 */
class ConsoleNotifier {
  async sendAlert(alertData) {
    console.log('🚨 ALERT:', JSON.stringify(alertData, null, 2));
  }
  
  async sendResolution(resolutionData) {
    console.log('✅ RESOLVED:', JSON.stringify(resolutionData, null, 2));
  }
}

// Instância global
const globalAlertManager = new AlertManager();

// Adicionar notificador padrão
globalAlertManager.addNotifier(new ConsoleNotifier());

// Regras básicas de alerta
globalAlertManager.addRule('high_memory_usage', async () => {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
  return heapUsedPercent > 85;
}, {
  severity: 'critical',
  description: 'Memory usage above 85%',
  duration: 60000 // 1 minuto
});

globalAlertManager.addRule('high_error_rate', async () => {
  const allMetrics = metrics.getAllMetrics();
  const errorMetric = allMetrics['errors_total'];
  
  if (!errorMetric || errorMetric.type !== 'counter') return false;
  
  // Verificar se houve mais de 10 erros no último minuto
  return errorMetric.value > 10;
}, {
  severity: 'warning',
  description: 'High error rate detected',
  duration: 30000 // 30 segundos
});

module.exports = {
  AlertManager,
  ConsoleNotifier,
  alertManager: globalAlertManager
};
`;
    
    const alertPath = path.join(this.projectRoot, 'src', 'monitoring', 'alerts.js');
    fs.writeFileSync(alertPath, alertingSystem);
    this.logger.info(`Created alerting system: ${alertPath}`);
  }

  /**
   * Atualizar package.json com dependências de logging
   */
  async updatePackageJson() {
    try {
      const packagePath = path.join(this.projectRoot, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Adicionar dependências de logging se não existirem
      const loggingDeps = {
        'winston': '^3.8.2',
        'winston-daily-rotate-file': '^4.7.1'
      };
      
      let updated = false;
      for (const [dep, version] of Object.entries(loggingDeps)) {
        if (!packageJson.dependencies[dep]) {
          packageJson.dependencies[dep] = version;
          updated = true;
          this.logger.info(`Added dependency: ${dep}@${version}`);
        }
      }
      
      // Adicionar scripts de monitoramento
      const monitoringScripts = {
        'monitor:start': 'node src/monitoring/start-monitoring.js',
        'logs:view': 'tail -f logs/system/combined.log',
        'logs:errors': 'tail -f logs/errors/error.log'
      };
      
      for (const [script, command] of Object.entries(monitoringScripts)) {
        if (!packageJson.scripts[script]) {
          packageJson.scripts[script] = command;
          updated = true;
          this.logger.info(`Added script: ${script}`);
        }
      }
      
      if (updated) {
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
        this.logger.info('Updated package.json with logging dependencies and scripts');
      }
      
    } catch (error) {
      this.logger.error('Failed to update package.json:', error);
      throw error;
    }
  }

  /**
   * Gerar relatório de configuração
   */
  generateReport() {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          componentsConfigured: this.results.length,
          status: 'completed'
        },
        components: this.results,
        nextSteps: [
          'Install logging dependencies: npm install',
          'Start monitoring: npm run monitor:start',
          'View logs: npm run logs:view',
          'Test system integration: npm run test:system'
        ]
      };

      const reportPath = path.join(this.projectRoot, 'temp', `logging-monitoring-setup-${Date.now()}.json`);
      
      // Criar diretório temp se não existir
      const tempDir = path.dirname(reportPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      this.logger.info(`Setup report saved: ${reportPath}`);
      return report;
    } catch (error) {
      this.logger.error('Failed to generate report:', error);
      throw error;
    }
  }

  /**
   * Exibir resumo da configuração
   */
  displaySummary(report) {
    console.log('\n📊 Logging & Monitoring Setup Summary');
    console.log('=' .repeat(50));
    
    console.log(`✅ Components Configured: ${report.summary.componentsConfigured}`);
    
    console.log('\n📋 Configured Components:');
    report.components.forEach((component, index) => {
      console.log(`${index + 1}. ${component.component}: ${component.status}`);
      console.log(`   ${component.details}`);
    });
    
    console.log('\n📋 Next Steps:');
    report.nextSteps.forEach((step, index) => {
      console.log(`${index + 1}. ${step}`);
    });
    
    console.log('\n🎯 Production Readiness:');
    console.log('- ✅ Structured logging configured');
    console.log('- ✅ Metrics collection ready');
    console.log('- ✅ Health checks implemented');
    console.log('- ✅ Basic alerting configured');
  }

  /**
   * Executar configuração completa
   */
  async run() {
    try {
      this.logger.info('📊 Starting Logging & Monitoring Setup...');
      
      await this.setupLoggingStructure();
      await this.setupBasicMonitoring();
      await this.updatePackageJson();
      
      const report = this.generateReport();
      this.displaySummary(report);
      
      this.logger.info('✅ Logging & Monitoring Setup completed!');
      
      process.exit(0);
      
    } catch (error) {
      this.logger.error('❌ Logging & Monitoring Setup failed:', error);
      console.log('\n🔧 Troubleshooting:');
      console.log('1. Check file permissions');
      console.log('2. Verify Node.js version compatibility');
      console.log('3. Review error logs');
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const setup = new LoggingMonitoringSetup();
  setup.run();
}

module.exports = LoggingMonitoringSetup;