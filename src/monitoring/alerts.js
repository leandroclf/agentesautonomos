/**
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
        this.logger.error(`Error checking alert rule '${name}'`, error);
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
    
    this.logger.warn(`Alert fired: ${alert.name}`, alertData);
    
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
    
    this.logger.info(`Alert resolved: ${alert.name}`, resolutionData);
    
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
