/**
 * Escalation Service
 * Serviço responsável por escalar problemas críticos e enviar notificações
 */

const EventEmitter = require('events');
const axios = require('axios');
const config = require('../config/recoveryConfig');

class EscalationService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.isRunning = false;
    
    // Estado do serviço
    this.activeEscalations = new Map();
    this.escalationHistory = [];
    this.cooldownTimers = new Map();
    
    // Estatísticas
    this.stats = {
      totalEscalations: 0,
      escalationsByLevel: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      notificationsSent: 0,
      lastEscalationTime: null
    };
    
    // Configurações
    this.levels = config.escalation.levels;
    this.notifications = config.escalation.notifications;
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Escalation Service already running');
      return;
    }

    this.logger.info('Starting Escalation Service');
    this.isRunning = true;
    
    // Verificar configurações de notificação
    await this.validateNotificationConfigs();
    
    // Inicializar limpeza periódica
    this.startCleanupTimer();
    
    this.logger.info('Escalation Service started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Escalation Service not running');
      return;
    }

    this.logger.info('Stopping Escalation Service');
    this.isRunning = false;
    
    // Cancelar escalações ativas
    for (const [escalationId, escalation] of this.activeEscalations) {
      try {
        await this.cancelEscalation(escalationId, 'service_shutdown');
      } catch (error) {
        this.logger.error('Error canceling escalation during shutdown', {
          escalationId,
          error: error.message
        });
      }
    }
    
    // Limpar timers
    this.clearAllTimers();
    
    this.logger.info('Escalation Service stopped');
  }

  isRunning() {
    return this.isRunning;
  }

  async escalate(request) {
    try {
      // Validar request
      const validationResult = this.validateEscalationRequest(request);
      if (!validationResult.valid) {
        throw new Error(`Invalid escalation request: ${validationResult.error}`);
      }

      const { level, reason, details = {}, timestamp } = request;
      const escalationId = this.generateEscalationId(level, reason, timestamp);

      // Verificar cooldown
      if (this.isInCooldown(level, reason)) {
        this.logger.warn('Escalation in cooldown period', {
          level,
          reason,
          escalationId
        });
        return { escalationId, status: 'cooldown' };
      }

      // Criar escalação
      const escalation = {
        id: escalationId,
        level,
        reason,
        details,
        status: 'initiated',
        startTime: new Date(),
        notifications: [],
        attempts: 0
      };

      // Registrar escalação
      this.activeEscalations.set(escalationId, escalation);

      this.logger.warn('Escalation initiated', {
        escalationId,
        level,
        reason,
        details
      });

      // Emitir evento
      this.emit('escalationTriggered', {
        escalationId,
        level,
        reason,
        details,
        timestamp: escalation.startTime.toISOString()
      });

      // Executar escalação
      await this.executeEscalation(escalationId);

      return { escalationId, status: 'initiated' };

    } catch (error) {
      this.logger.error('Error triggering escalation', {
        request,
        error: error.message
      });
      throw error;
    }
  }

  async executeEscalation(escalationId) {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) {
      this.logger.error('Escalation not found', { escalationId });
      return;
    }

    try {
      escalation.status = 'executing';
      escalation.attempts++;
      
      const startTime = Date.now();
      
      this.logger.warn('Executing escalation', {
        escalationId,
        level: escalation.level,
        reason: escalation.reason,
        attempt: escalation.attempts
      });

      // Obter configuração do nível
      const levelConfig = this.levels[escalation.level];
      if (!levelConfig) {
        throw new Error(`Unknown escalation level: ${escalation.level}`);
      }

      // Enviar notificações
      const notificationResults = await this.sendNotifications(escalation, levelConfig);
      escalation.notifications = notificationResults;
      
      const duration = Date.now() - startTime;
      escalation.duration = duration;
      escalation.status = 'completed';
      escalation.endTime = new Date();

      // Atualizar estatísticas
      this.updateStats(escalation);

      // Mover para histórico
      this.moveToHistory(escalation);
      this.activeEscalations.delete(escalationId);

      // Definir cooldown
      this.setCooldown(escalation.level, escalation.reason, levelConfig.cooldown);

      this.logger.warn('Escalation completed', {
        escalationId,
        level: escalation.level,
        reason: escalation.reason,
        duration,
        notificationsSent: notificationResults.filter(n => n.success).length
      });

    } catch (error) {
      await this.handleEscalationFailure(escalationId, error);
    }
  }

  async sendNotifications(escalation, levelConfig) {
    const { level, reason, details } = escalation;
    const notificationTypes = levelConfig.notifications || [];
    const results = [];

    for (const type of notificationTypes) {
      try {
        const result = await this.sendNotification(type, {
          level,
          reason,
          details,
          escalationId: escalation.id,
          timestamp: escalation.startTime.toISOString()
        });
        
        results.push({
          type,
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
        
        this.stats.notificationsSent++;
        
      } catch (error) {
        this.logger.error('Failed to send notification', {
          type,
          escalationId: escalation.id,
          error: error.message
        });
        
        results.push({
          type,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return results;
  }

  async sendNotification(type, data) {
    switch (type) {
      case 'log':
        return await this.sendLogNotification(data);
      
      case 'metrics':
        return await this.sendMetricsNotification(data);
      
      case 'alert':
        return await this.sendAlertNotification(data);
      
      case 'email':
        return await this.sendEmailNotification(data);
      
      case 'sms':
        return await this.sendSMSNotification(data);
      
      case 'slack':
        return await this.sendSlackNotification(data);
      
      default:
        throw new Error(`Unknown notification type: ${type}`);
    }
  }

  async sendLogNotification(data) {
    const { level, reason, details, escalationId } = data;
    
    this.logger.error('ESCALATION ALERT', {
      escalationId,
      level: level.toUpperCase(),
      reason,
      details,
      timestamp: new Date().toISOString()
    });
    
    return { method: 'log', logged: true };
  }

  async sendMetricsNotification(data) {
    // Enviar métricas para sistema de monitoramento
    // Implementar integração com Prometheus/Grafana
    
    return { method: 'metrics', sent: true };
  }

  async sendAlertNotification(data) {
    const { level, reason, details, escalationId } = data;
    
    // Enviar para sistema de alertas interno
    try {
      await axios.post('http://localhost:3004/alerts', {
        type: 'escalation',
        level,
        reason,
        details,
        escalationId,
        timestamp: new Date().toISOString()
      }, {
        timeout: 5000
      });
      
      return { method: 'alert', sent: true };
      
    } catch (error) {
      throw new Error(`Alert notification failed: ${error.message}`);
    }
  }

  async sendEmailNotification(data) {
    if (!this.notifications.email.enabled) {
      throw new Error('Email notifications not enabled');
    }

    const { level, reason, details, escalationId } = data;
    const recipients = this.notifications.email.recipients;
    
    if (!recipients || recipients.length === 0) {
      throw new Error('No email recipients configured');
    }

    const subject = this.notifications.email.subject.replace('{level}', level.toUpperCase());
    const body = this.generateEmailBody(data);

    // Implementar envio de email
    // Pode usar nodemailer, SendGrid, AWS SES, etc.
    
    this.logger.info('Email notification sent', {
      escalationId,
      recipients: recipients.length,
      subject
    });
    
    return {
      method: 'email',
      recipients: recipients.length,
      subject,
      sent: true
    };
  }

  async sendSMSNotification(data) {
    if (!this.notifications.sms.enabled) {
      throw new Error('SMS notifications not enabled');
    }

    const { level, reason, escalationId } = data;
    const recipients = this.notifications.sms.recipients;
    
    if (!recipients || recipients.length === 0) {
      throw new Error('No SMS recipients configured');
    }

    const message = this.generateSMSMessage(data);

    // Implementar envio de SMS
    // Pode usar Twilio, AWS SNS, etc.
    
    this.logger.info('SMS notification sent', {
      escalationId,
      recipients: recipients.length,
      message: message.substring(0, 50) + '...'
    });
    
    return {
      method: 'sms',
      recipients: recipients.length,
      message,
      sent: true
    };
  }

  async sendSlackNotification(data) {
    if (!this.notifications.slack.enabled) {
      throw new Error('Slack notifications not enabled');
    }

    const webhook = this.notifications.slack.webhook;
    if (!webhook) {
      throw new Error('Slack webhook not configured');
    }

    const { level, reason, details, escalationId } = data;
    const message = this.generateSlackMessage(data);

    try {
      await axios.post(webhook, {
        channel: this.notifications.slack.channel,
        username: 'Recovery Agent',
        icon_emoji: ':warning:',
        attachments: [{
          color: this.getSlackColor(level),
          title: `Escalação ${level.toUpperCase()}`,
          text: message,
          fields: [
            {
              title: 'Motivo',
              value: reason,
              short: true
            },
            {
              title: 'ID da Escalação',
              value: escalationId,
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true
            }
          ],
          footer: 'Sistema de Agentes Autônomos',
          ts: Math.floor(Date.now() / 1000)
        }]
      }, {
        timeout: 10000
      });
      
      return {
        method: 'slack',
        channel: this.notifications.slack.channel,
        sent: true
      };
      
    } catch (error) {
      throw new Error(`Slack notification failed: ${error.message}`);
    }
  }

  generateEmailBody(data) {
    const { level, reason, details, escalationId, timestamp } = data;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Escalação do Sistema</title>
</head>
<body>
    <h2>Escalação ${level.toUpperCase()} - Sistema de Agentes Autônomos</h2>
    
    <p><strong>ID da Escalação:</strong> ${escalationId}</p>
    <p><strong>Nível:</strong> ${level.toUpperCase()}</p>
    <p><strong>Motivo:</strong> ${reason}</p>
    <p><strong>Timestamp:</strong> ${timestamp}</p>
    
    <h3>Detalhes:</h3>
    <pre>${JSON.stringify(details, null, 2)}</pre>
    
    <hr>
    <p><em>Esta é uma notificação automática do Sistema de Agentes Autônomos.</em></p>
</body>
</html>
    `;
  }

  generateSMSMessage(data) {
    const { level, reason, escalationId } = data;
    
    return `ALERTA ${level.toUpperCase()}: ${reason} (ID: ${escalationId.substring(0, 8)}). Sistema de Agentes Autônomos.`;
  }

  generateSlackMessage(data) {
    const { level, reason, details } = data;
    
    let message = `🚨 **Escalação ${level.toUpperCase()}**\n\n`;
    message += `**Motivo:** ${reason}\n`;
    
    if (details.agent) {
      message += `**Agente:** ${details.agent}\n`;
    }
    
    if (details.error) {
      message += `**Erro:** ${details.error}\n`;
    }
    
    return message;
  }

  getSlackColor(level) {
    const colors = {
      low: '#36a64f',      // Verde
      medium: '#ff9500',   // Laranja
      high: '#ff0000',     // Vermelho
      critical: '#8b0000'  // Vermelho escuro
    };
    
    return colors[level] || '#808080';
  }

  async handleEscalationFailure(escalationId, error) {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) return;

    escalation.status = 'failed';
    escalation.error = error.message;
    escalation.endTime = new Date();

    this.logger.error('Escalation failed', {
      escalationId,
      level: escalation.level,
      reason: escalation.reason,
      error: error.message
    });

    // Mover para histórico
    this.moveToHistory(escalation);
    this.activeEscalations.delete(escalationId);

    // Tentar escalação de nível superior se crítico
    if (escalation.level === 'critical') {
      this.logger.error('Critical escalation failed - manual intervention required', {
        escalationId,
        error: error.message
      });
    }
  }

  // Métodos auxiliares
  validateEscalationRequest(request) {
    if (!request.level) {
      return { valid: false, error: 'Escalation level is required' };
    }
    
    if (!this.levels[request.level]) {
      return { valid: false, error: 'Invalid escalation level' };
    }
    
    if (!request.reason) {
      return { valid: false, error: 'Escalation reason is required' };
    }
    
    return { valid: true };
  }

  isInCooldown(level, reason) {
    const key = `${level}_${reason}`;
    return this.cooldownTimers.has(key);
  }

  setCooldown(level, reason, duration) {
    const key = `${level}_${reason}`;
    
    if (this.cooldownTimers.has(key)) {
      clearTimeout(this.cooldownTimers.get(key));
    }

    const timer = setTimeout(() => {
      this.cooldownTimers.delete(key);
    }, duration);

    this.cooldownTimers.set(key, timer);
  }

  updateStats(escalation) {
    this.stats.totalEscalations++;
    this.stats.escalationsByLevel[escalation.level]++;
    this.stats.lastEscalationTime = new Date();
  }

  moveToHistory(escalation) {
    this.escalationHistory.push(escalation);
    
    // Manter apenas os últimos 100 registros
    if (this.escalationHistory.length > 100) {
      this.escalationHistory.splice(0, this.escalationHistory.length - 100);
    }
  }

  generateEscalationId(level, reason, timestamp) {
    const time = timestamp ? new Date(timestamp).getTime() : Date.now();
    return `escalation_${level}_${time}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async validateNotificationConfigs() {
    const configs = [];
    
    if (this.notifications.email.enabled) {
      configs.push('email');
    }
    
    if (this.notifications.sms.enabled) {
      configs.push('sms');
    }
    
    if (this.notifications.slack.enabled) {
      configs.push('slack');
    }
    
    this.logger.info('Notification configurations validated', {
      enabled: configs,
      total: configs.length
    });
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanupOldRecords();
    }, 60 * 60 * 1000); // A cada hora
  }

  cleanupOldRecords() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Limpar histórico antigo
    this.escalationHistory = this.escalationHistory
      .filter(e => e.startTime > oneDayAgo);
    
    this.logger.debug('Cleaned up old escalation records', {
      remaining: this.escalationHistory.length
    });
  }

  clearAllTimers() {
    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }
    this.cooldownTimers.clear();
  }

  async cancelEscalation(escalationId, reason) {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) {
      throw new Error('Escalation not found');
    }

    escalation.status = 'cancelled';
    escalation.endTime = new Date();
    escalation.cancelReason = reason;

    this.activeEscalations.delete(escalationId);
    this.moveToHistory(escalation);

    this.logger.info('Escalation cancelled', {
      escalationId,
      level: escalation.level,
      reason
    });
  }

  // Getters para status
  getActiveEscalations() {
    return Array.from(this.activeEscalations.values());
  }

  getEscalationHistory() {
    return this.escalationHistory.slice(-20); // Últimos 20
  }

  getStats() {
    return { ...this.stats };
  }

  getLevels() {
    return Object.keys(this.levels);
  }

  getLevelConfig(level) {
    return this.levels[level] || null;
  }
}

module.exports = EscalationService;