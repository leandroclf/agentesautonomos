/**
 * Alert Service - Serviço de alertas e notificações
 * Responsável por enviar alertas quando problemas são detectados
 */

const axios = require('axios');
const EventEmitter = require('events');
const config = require('../config/healthConfig');
const Logger = require('../../../../utils/logger');

class AlertService extends EventEmitter {
  constructor() {
    super();
    this.logger = new Logger('alert-service');
    this.alertHistory = new Map();
    this.cooldownTimers = new Map();
    this.isEnabled = config.alerts.enabled;
  }

  /**
   * Inicializar o serviço de alertas
   */
  initialize() {
    if (!this.isEnabled) {
      this.logger.info('Serviço de alertas desabilitado');
      return;
    }

    this.logger.info('Inicializando Alert Service', {
      webhookEnabled: !!config.alerts.webhookUrl,
      emailEnabled: config.alerts.emailEnabled,
      slackEnabled: config.alerts.slackEnabled
    });
  }

  /**
   * Processar alerta de agente down
   */
  async handleAgentDown(eventData) {
    const alertType = 'AGENT_DOWN';
    const alertKey = `${alertType}_${eventData.agentName}`;
    
    if (this.isInCooldown(alertKey)) {
      this.logger.debug(`Alerta em cooldown: ${alertKey}`);
      return;
    }

    const alert = {
      type: alertType,
      severity: config.alerts.types[alertType].severity,
      agentName: eventData.agentName,
      timestamp: eventData.timestamp,
      message: `Agente ${eventData.agentName} está DOWN`,
      details: {
        error: eventData.error,
        consecutiveFailures: eventData.consecutiveFailures,
        critical: eventData.critical
      }
    };

    await this.sendAlert(alert);
    this.setCooldown(alertKey, config.alerts.types[alertType].cooldown);
  }

  /**
   * Processar alerta de agente degradado
   */
  async handleAgentDegraded(eventData) {
    const alertType = 'AGENT_DEGRADED';
    const alertKey = `${alertType}_${eventData.agentName}`;
    
    if (this.isInCooldown(alertKey)) {
      this.logger.debug(`Alerta em cooldown: ${alertKey}`);
      return;
    }

    const alert = {
      type: alertType,
      severity: config.alerts.types[alertType].severity,
      agentName: eventData.agentName,
      timestamp: eventData.timestamp,
      message: `Agente ${eventData.agentName} está DEGRADADO`,
      details: {
        error: eventData.error,
        responseTime: eventData.responseTime
      }
    };

    await this.sendAlert(alert);
    this.setCooldown(alertKey, config.alerts.types[alertType].cooldown);
  }

  /**
   * Processar alerta de agente recuperado
   */
  async handleAgentRecovered(eventData) {
    const alertType = 'AGENT_RECOVERED';
    const alertKey = `${alertType}_${eventData.agentName}`;
    
    // Limpar cooldowns relacionados ao agente
    this.clearAgentCooldowns(eventData.agentName);

    const alert = {
      type: alertType,
      severity: config.alerts.types[alertType].severity,
      agentName: eventData.agentName,
      timestamp: eventData.timestamp,
      message: `Agente ${eventData.agentName} foi RECUPERADO`,
      details: {
        previousStatus: eventData.previousStatus,
        currentStatus: eventData.currentStatus,
        responseTime: eventData.responseTime
      }
    };

    await this.sendAlert(alert);
  }

  /**
   * Processar alerta de sobrecarga do sistema
   */
  async handleSystemOverload(eventData) {
    const alertType = 'SYSTEM_OVERLOAD';
    const alertKey = alertType;
    
    if (this.isInCooldown(alertKey)) {
      this.logger.debug(`Alerta em cooldown: ${alertKey}`);
      return;
    }

    const alert = {
      type: alertType,
      severity: config.alerts.types[alertType].severity,
      timestamp: eventData.timestamp,
      message: 'Sistema apresenta sinais de sobrecarga',
      details: eventData.metrics
    };

    await this.sendAlert(alert);
    this.setCooldown(alertKey, config.alerts.types[alertType].cooldown);
  }

  /**
   * Enviar alerta através dos canais configurados
   */
  async sendAlert(alert) {
    this.logger.info('Enviando alerta', {
      type: alert.type,
      severity: alert.severity,
      agentName: alert.agentName
    });

    // Armazenar no histórico
    this.storeAlert(alert);

    // Emitir evento
    this.emit('alertSent', alert);

    const promises = [];

    // Webhook
    if (config.alerts.webhookUrl) {
      promises.push(this.sendWebhookAlert(alert));
    }

    // Slack (se configurado)
    if (config.alerts.slackEnabled && process.env.SLACK_WEBHOOK_URL) {
      promises.push(this.sendSlackAlert(alert));
    }

    // Email (se configurado)
    if (config.alerts.emailEnabled) {
      promises.push(this.sendEmailAlert(alert));
    }

    // Executar todos os envios em paralelo
    const results = await Promise.allSettled(promises);
    
    // Log dos resultados
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error('Falha ao enviar alerta', {
          channel: ['webhook', 'slack', 'email'][index],
          error: result.reason.message
        });
      }
    });
  }

  /**
   * Enviar alerta via webhook
   */
  async sendWebhookAlert(alert) {
    try {
      const payload = {
        timestamp: alert.timestamp,
        service: 'health-checker-agent',
        alert: {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          agentName: alert.agentName,
          details: alert.details
        }
      };

      await axios.post(config.alerts.webhookUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Health-Checker-Agent/1.0'
        }
      });

      this.logger.debug('Alerta enviado via webhook', { type: alert.type });
      
    } catch (error) {
      this.logger.error('Erro ao enviar webhook', { error: error.message });
      throw error;
    }
  }

  /**
   * Enviar alerta via Slack
   */
  async sendSlackAlert(alert) {
    try {
      const color = this.getSeverityColor(alert.severity);
      const emoji = this.getSeverityEmoji(alert.severity);
      
      const payload = {
        text: `${emoji} *${alert.message}*`,
        attachments: [
          {
            color: color,
            fields: [
              {
                title: 'Agente',
                value: alert.agentName || 'Sistema',
                short: true
              },
              {
                title: 'Severidade',
                value: alert.severity.toUpperCase(),
                short: true
              },
              {
                title: 'Timestamp',
                value: alert.timestamp,
                short: false
              }
            ],
            footer: 'Health Checker Agent',
            ts: Math.floor(new Date(alert.timestamp).getTime() / 1000)
          }
        ]
      };

      if (alert.details) {
        payload.attachments[0].fields.push({
          title: 'Detalhes',
          value: JSON.stringify(alert.details, null, 2),
          short: false
        });
      }

      await axios.post(process.env.SLACK_WEBHOOK_URL, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.logger.debug('Alerta enviado via Slack', { type: alert.type });
      
    } catch (error) {
      this.logger.error('Erro ao enviar Slack', { error: error.message });
      throw error;
    }
  }

  /**
   * Enviar alerta via email (placeholder)
   */
  async sendEmailAlert(alert) {
    // TODO: Implementar envio de email
    // Por enquanto, apenas log
    this.logger.info('Email alert (não implementado)', {
      type: alert.type,
      message: alert.message
    });
  }

  /**
   * Obter cor baseada na severidade
   */
  getSeverityColor(severity) {
    const colors = {
      critical: '#FF0000',
      warning: '#FFA500',
      info: '#00FF00'
    };
    return colors[severity] || '#808080';
  }

  /**
   * Obter emoji baseado na severidade
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return emojis[severity] || '📢';
  }

  /**
   * Verificar se um alerta está em cooldown
   */
  isInCooldown(alertKey) {
    return this.cooldownTimers.has(alertKey);
  }

  /**
   * Definir cooldown para um tipo de alerta
   */
  setCooldown(alertKey, cooldownMs) {
    if (cooldownMs <= 0) return;

    const timer = setTimeout(() => {
      this.cooldownTimers.delete(alertKey);
      this.logger.debug(`Cooldown expirado: ${alertKey}`);
    }, cooldownMs);

    this.cooldownTimers.set(alertKey, timer);
    this.logger.debug(`Cooldown definido: ${alertKey} por ${cooldownMs}ms`);
  }

  /**
   * Limpar cooldowns de um agente específico
   */
  clearAgentCooldowns(agentName) {
    const keysToDelete = [];
    
    for (const [key, timer] of this.cooldownTimers.entries()) {
      if (key.includes(agentName)) {
        clearTimeout(timer);
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.cooldownTimers.delete(key);
      this.logger.debug(`Cooldown limpo: ${key}`);
    });
  }

  /**
   * Armazenar alerta no histórico
   */
  storeAlert(alert) {
    const alertId = `${alert.type}_${alert.timestamp}`;
    this.alertHistory.set(alertId, {
      ...alert,
      id: alertId
    });

    // Limitar histórico (manter apenas últimos 1000 alertas)
    if (this.alertHistory.size > 1000) {
      const oldestKey = this.alertHistory.keys().next().value;
      this.alertHistory.delete(oldestKey);
    }
  }

  /**
   * Obter histórico de alertas
   */
  getAlertHistory(limit = 100) {
    const alerts = Array.from(this.alertHistory.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
    
    return alerts;
  }

  /**
   * Obter estatísticas de alertas
   */
  getAlertStats() {
    const alerts = Array.from(this.alertHistory.values());
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recent = alerts.filter(alert => 
      new Date(alert.timestamp) >= last24h
    );
    
    const stats = {
      total: alerts.length,
      last24h: recent.length,
      bySeverity: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length
      },
      byType: {}
    };
    
    // Contar por tipo
    alerts.forEach(alert => {
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
    });
    
    return stats;
  }

  /**
   * Limpar histórico de alertas
   */
  clearHistory() {
    this.alertHistory.clear();
    this.logger.info('Histórico de alertas limpo');
  }
}

module.exports = AlertService;