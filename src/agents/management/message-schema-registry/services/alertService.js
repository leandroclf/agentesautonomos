/**
 * Alert Service - Sistema de Alertas
 * Responsável por gerenciar e enviar alertas do sistema
 */

const { EventEmitter } = require('events')

class AlertService extends EventEmitter {
  constructor({ config, logger }) {
    super()
    this.config = config
    this.logger = logger
    
    this.alertRules = new Map()
    this.alertHistory = []
    this.activeAlerts = new Map()
    this.suppressedAlerts = new Set()
    
    this.alertChannels = new Map()
    this.alertQueue = []
    
    this.processInterval = null
    this.cleanupInterval = null
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Alert Service...')
      
      // Carregar regras de alerta
      this.loadAlertRules()
      
      // Configurar canais de alerta
      this.setupAlertChannels()
      
      // Iniciar processamento de alertas
      this.startAlertProcessing()
      
      // Iniciar limpeza periódica
      this.startPeriodicCleanup()
      
      this.isInitialized = true
      this.logger.info('Alert Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Alert Service:', error)
      throw error
    }
  }

  loadAlertRules() {
    // Regras de alerta para saúde do sistema
    this.alertRules.set('health_check_failed', {
      name: 'Health Check Failed',
      description: 'Verificação de saúde falhou',
      severity: 'critical',
      threshold: 1,
      window: 60000, // 1 minuto
      cooldown: 300000, // 5 minutos
      channels: ['email', 'slack'],
      enabled: true
    })
    
    this.alertRules.set('high_error_rate', {
      name: 'High Error Rate',
      description: 'Taxa de erro alta detectada',
      severity: 'warning',
      threshold: 10, // 10 erros
      window: 300000, // 5 minutos
      cooldown: 600000, // 10 minutos
      channels: ['slack'],
      enabled: true
    })
    
    this.alertRules.set('memory_usage_high', {
      name: 'High Memory Usage',
      description: 'Uso de memória alto',
      severity: 'warning',
      threshold: 80, // 80%
      window: 120000, // 2 minutos
      cooldown: 900000, // 15 minutos
      channels: ['email'],
      enabled: true
    })
    
    this.alertRules.set('validation_failures', {
      name: 'Validation Failures',
      description: 'Falhas de validação frequentes',
      severity: 'info',
      threshold: 50,
      window: 600000, // 10 minutos
      cooldown: 1800000, // 30 minutos
      channels: ['slack'],
      enabled: true
    })
    
    this.alertRules.set('compatibility_issues', {
      name: 'Compatibility Issues',
      description: 'Problemas de compatibilidade detectados',
      severity: 'warning',
      threshold: 5,
      window: 300000, // 5 minutos
      cooldown: 600000, // 10 minutos
      channels: ['email', 'slack'],
      enabled: true
    })
    
    this.alertRules.set('migration_failures', {
      name: 'Migration Failures',
      description: 'Falhas em migrações',
      severity: 'critical',
      threshold: 1,
      window: 60000, // 1 minuto
      cooldown: 300000, // 5 minutos
      channels: ['email', 'slack', 'pagerduty'],
      enabled: true
    })
    
    this.alertRules.set('sqs_connection_lost', {
      name: 'SQS Connection Lost',
      description: 'Conexão com SQS perdida',
      severity: 'critical',
      threshold: 1,
      window: 30000, // 30 segundos
      cooldown: 180000, // 3 minutos
      channels: ['email', 'slack'],
      enabled: true
    })
    
    this.alertRules.set('cache_performance_degraded', {
      name: 'Cache Performance Degraded',
      description: 'Performance do cache degradada',
      severity: 'warning',
      threshold: 50, // 50% hit rate
      window: 600000, // 10 minutos
      cooldown: 1800000, // 30 minutos
      channels: ['slack'],
      enabled: true
    })
    
    this.logger.info(`${this.alertRules.size} regras de alerta carregadas`)
  }

  setupAlertChannels() {
    // Canal de Email
    this.alertChannels.set('email', {
      name: 'Email',
      enabled: this.config.alerts.channels.email.enabled,
      config: this.config.alerts.channels.email,
      send: this.sendEmailAlert.bind(this)
    })
    
    // Canal do Slack
    this.alertChannels.set('slack', {
      name: 'Slack',
      enabled: this.config.alerts.channels.slack.enabled,
      config: this.config.alerts.channels.slack,
      send: this.sendSlackAlert.bind(this)
    })
    
    // Canal do PagerDuty
    this.alertChannels.set('pagerduty', {
      name: 'PagerDuty',
      enabled: this.config.alerts.channels.pagerduty.enabled,
      config: this.config.alerts.channels.pagerduty,
      send: this.sendPagerDutyAlert.bind(this)
    })
    
    // Canal de Webhook
    this.alertChannels.set('webhook', {
      name: 'Webhook',
      enabled: this.config.alerts.channels.webhook.enabled,
      config: this.config.alerts.channels.webhook,
      send: this.sendWebhookAlert.bind(this)
    })
    
    const enabledChannels = Array.from(this.alertChannels.values())
      .filter(channel => channel.enabled)
      .map(channel => channel.name)
    
    this.logger.info(`Canais de alerta configurados: ${enabledChannels.join(', ')}`)
  }

  // Método principal para criar alertas
  async createAlert(type, data = {}, options = {}) {
    try {
      const rule = this.alertRules.get(type)
      if (!rule || !rule.enabled) {
        return false
      }
      
      // Verificar se o alerta está suprimido
      if (this.suppressedAlerts.has(type)) {
        return false
      }
      
      // Verificar cooldown
      if (this.isInCooldown(type)) {
        return false
      }
      
      // Criar objeto de alerta
      const alert = {
        id: this.generateAlertId(),
        type,
        rule,
        data,
        severity: options.severity || rule.severity,
        timestamp: new Date().toISOString(),
        status: 'active',
        attempts: 0,
        maxAttempts: options.maxAttempts || 3,
        channels: options.channels || rule.channels,
        metadata: {
          source: options.source || 'system',
          environment: this.config.environment,
          service: 'message-schema-registry'
        }
      }
      
      // Adicionar à fila de processamento
      this.alertQueue.push(alert)
      
      // Adicionar ao histórico
      this.alertHistory.push(alert)
      
      // Manter apenas os últimos 1000 alertas no histórico
      if (this.alertHistory.length > 1000) {
        this.alertHistory = this.alertHistory.slice(-1000)
      }
      
      // Emitir evento
      this.emit('alert.created', alert)
      
      this.logger.info(`Alerta criado: ${type}`, {
        alertId: alert.id,
        severity: alert.severity,
        data: alert.data
      })
      
      return alert.id
      
    } catch (error) {
      this.logger.error(`Erro ao criar alerta ${type}:`, error)
      return false
    }
  }

  // Processamento de alertas
  startAlertProcessing() {
    const interval = this.config.alerts.processingInterval || 5000 // 5 segundos
    
    this.processInterval = setInterval(async () => {
      await this.processAlertQueue()
    }, interval)
    
    this.logger.debug(`Processamento de alertas iniciado (intervalo: ${interval}ms)`)
  }

  stopAlertProcessing() {
    if (this.processInterval) {
      clearInterval(this.processInterval)
      this.processInterval = null
      this.logger.debug('Processamento de alertas parado')
    }
  }

  async processAlertQueue() {
    if (this.alertQueue.length === 0) {
      return
    }
    
    const batchSize = this.config.alerts.batchSize || 10
    const batch = this.alertQueue.splice(0, batchSize)
    
    for (const alert of batch) {
      try {
        await this.processAlert(alert)
      } catch (error) {
        this.logger.error(`Erro ao processar alerta ${alert.id}:`, error)
        
        // Recolocar na fila se não excedeu tentativas
        if (alert.attempts < alert.maxAttempts) {
          alert.attempts++
          this.alertQueue.push(alert)
        } else {
          this.logger.error(`Alerta ${alert.id} falhou após ${alert.maxAttempts} tentativas`)
          alert.status = 'failed'
          this.emit('alert.failed', alert)
        }
      }
    }
  }

  async processAlert(alert) {
    try {
      alert.attempts++
      
      // Enviar para todos os canais configurados
      const results = []
      for (const channelName of alert.channels) {
        const channel = this.alertChannels.get(channelName)
        if (channel && channel.enabled) {
          try {
            const result = await channel.send(alert)
            results.push({ channel: channelName, success: true, result })
          } catch (error) {
            results.push({ channel: channelName, success: false, error: error.message })
            this.logger.error(`Erro ao enviar alerta ${alert.id} para ${channelName}:`, error)
          }
        }
      }
      
      // Verificar se pelo menos um canal foi bem-sucedido
      const successfulChannels = results.filter(r => r.success)
      if (successfulChannels.length > 0) {
        alert.status = 'sent'
        alert.sentAt = new Date().toISOString()
        alert.results = results
        
        // Adicionar aos alertas ativos
        this.activeAlerts.set(alert.id, alert)
        
        // Configurar cooldown
        this.setCooldown(alert.type, alert.rule.cooldown)
        
        this.emit('alert.sent', alert)
        
        this.logger.info(`Alerta ${alert.id} enviado com sucesso para ${successfulChannels.length} canais`)
      } else {
        throw new Error('Falha ao enviar para todos os canais')
      }
      
    } catch (error) {
      this.logger.error(`Erro ao processar alerta ${alert.id}:`, error)
      throw error
    }
  }

  // Implementações dos canais de alerta
  async sendEmailAlert(alert) {
    // Placeholder para implementação de email
    // Em uma implementação real, usaria nodemailer ou similar
    
    const emailData = {
      to: this.config.alerts.channels.email.recipients,
      subject: `[${alert.severity.toUpperCase()}] ${alert.rule.name}`,
      body: this.formatAlertMessage(alert, 'email')
    }
    
    this.logger.debug(`Email alert enviado (placeholder):`, emailData)
    
    // Simular envio
    return { messageId: `email-${Date.now()}`, status: 'sent' }
  }

  async sendSlackAlert(alert) {
    // Placeholder para implementação do Slack
    // Em uma implementação real, usaria @slack/web-api
    
    const slackData = {
      channel: this.config.alerts.channels.slack.channel,
      text: this.formatAlertMessage(alert, 'slack'),
      attachments: [{
        color: this.getSeverityColor(alert.severity),
        fields: [
          { title: 'Severity', value: alert.severity, short: true },
          { title: 'Type', value: alert.type, short: true },
          { title: 'Timestamp', value: alert.timestamp, short: true }
        ]
      }]
    }
    
    this.logger.debug(`Slack alert enviado (placeholder):`, slackData)
    
    // Simular envio
    return { ts: `slack-${Date.now()}`, status: 'sent' }
  }

  async sendPagerDutyAlert(alert) {
    // Placeholder para implementação do PagerDuty
    
    const pagerDutyData = {
      routing_key: this.config.alerts.channels.pagerduty.routingKey,
      event_action: 'trigger',
      dedup_key: `${alert.type}-${Date.now()}`,
      payload: {
        summary: alert.rule.name,
        severity: alert.severity,
        source: alert.metadata.service,
        custom_details: alert.data
      }
    }
    
    this.logger.debug(`PagerDuty alert enviado (placeholder):`, pagerDutyData)
    
    // Simular envio
    return { dedup_key: pagerDutyData.dedup_key, status: 'sent' }
  }

  async sendWebhookAlert(alert) {
    // Placeholder para implementação de webhook
    
    const webhookData = {
      url: this.config.alerts.channels.webhook.url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.config.alerts.channels.webhook.auth
      },
      body: {
        alert,
        message: this.formatAlertMessage(alert, 'webhook')
      }
    }
    
    this.logger.debug(`Webhook alert enviado (placeholder):`, webhookData)
    
    // Simular envio
    return { status: 'sent', timestamp: new Date().toISOString() }
  }

  // Formatação de mensagens
  formatAlertMessage(alert, format) {
    const baseMessage = `${alert.rule.name}: ${alert.rule.description}`
    
    switch (format) {
      case 'email':
        return `
          Alert: ${alert.rule.name}
          Severity: ${alert.severity}
          Description: ${alert.rule.description}
          Timestamp: ${alert.timestamp}
          Data: ${JSON.stringify(alert.data, null, 2)}
          
          Service: ${alert.metadata.service}
          Environment: ${alert.metadata.environment}
        `
      
      case 'slack':
        return `🚨 *${alert.rule.name}*\n${alert.rule.description}\n\`\`\`${JSON.stringify(alert.data, null, 2)}\`\`\``
      
      case 'webhook':
        return baseMessage
      
      default:
        return baseMessage
    }
  }

  getSeverityColor(severity) {
    switch (severity) {
      case 'critical': return 'danger'
      case 'warning': return 'warning'
      case 'info': return 'good'
      default: return 'good'
    }
  }

  // Gerenciamento de cooldown
  setCooldown(alertType, duration) {
    setTimeout(() => {
      // Cooldown expirado
      this.emit('alert.cooldown.expired', { type: alertType })
    }, duration)
  }

  isInCooldown(alertType) {
    // Verificar se existe um alerta ativo recente do mesmo tipo
    const recentAlert = Array.from(this.activeAlerts.values())
      .find(alert => {
        if (alert.type !== alertType) return false
        
        const alertTime = new Date(alert.timestamp).getTime()
        const now = Date.now()
        const cooldownPeriod = alert.rule.cooldown
        
        return (now - alertTime) < cooldownPeriod
      })
    
    return !!recentAlert
  }

  // Supressão de alertas
  suppressAlert(alertType, duration = null) {
    this.suppressedAlerts.add(alertType)
    
    if (duration) {
      setTimeout(() => {
        this.suppressedAlerts.delete(alertType)
        this.emit('alert.suppression.expired', { type: alertType })
      }, duration)
    }
    
    this.logger.info(`Alerta ${alertType} suprimido${duration ? ` por ${duration}ms` : ' indefinidamente'}`)
  }

  unsuppressAlert(alertType) {
    const removed = this.suppressedAlerts.delete(alertType)
    if (removed) {
      this.logger.info(`Supressão do alerta ${alertType} removida`)
    }
    return removed
  }

  // Resolução de alertas
  resolveAlert(alertId, resolution = {}) {
    const alert = this.activeAlerts.get(alertId)
    if (!alert) {
      return false
    }
    
    alert.status = 'resolved'
    alert.resolvedAt = new Date().toISOString()
    alert.resolution = resolution
    
    this.activeAlerts.delete(alertId)
    
    this.emit('alert.resolved', alert)
    
    this.logger.info(`Alerta ${alertId} resolvido`, resolution)
    return true
  }

  // Limpeza periódica
  startPeriodicCleanup() {
    const interval = this.config.alerts.cleanupInterval || 3600000 // 1 hora
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldAlerts()
    }, interval)
    
    this.logger.debug(`Limpeza periódica de alertas iniciada (intervalo: ${interval}ms)`)
  }

  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      this.logger.debug('Limpeza periódica de alertas parada')
    }
  }

  cleanupOldAlerts() {
    const maxAge = this.config.alerts.maxAge || 86400000 // 24 horas
    const now = Date.now()
    let cleaned = 0
    
    // Limpar alertas ativos antigos
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      const alertTime = new Date(alert.timestamp).getTime()
      if ((now - alertTime) > maxAge) {
        this.activeAlerts.delete(alertId)
        cleaned++
      }
    }
    
    // Limpar histórico antigo
    const oldHistoryLength = this.alertHistory.length
    this.alertHistory = this.alertHistory.filter(alert => {
      const alertTime = new Date(alert.timestamp).getTime()
      return (now - alertTime) <= maxAge
    })
    
    cleaned += oldHistoryLength - this.alertHistory.length
    
    if (cleaned > 0) {
      this.logger.debug(`Limpeza de alertas: ${cleaned} alertas antigos removidos`)
    }
  }

  // Métodos de consulta
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values())
  }

  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit)
  }

  getAlertStats() {
    const now = Date.now()
    const last24h = now - 86400000
    const last1h = now - 3600000
    
    const recent24h = this.alertHistory.filter(alert => {
      return new Date(alert.timestamp).getTime() > last24h
    })
    
    const recent1h = this.alertHistory.filter(alert => {
      return new Date(alert.timestamp).getTime() > last1h
    })
    
    const bySeverity = {
      critical: recent24h.filter(a => a.severity === 'critical').length,
      warning: recent24h.filter(a => a.severity === 'warning').length,
      info: recent24h.filter(a => a.severity === 'info').length
    }
    
    return {
      active: this.activeAlerts.size,
      suppressed: this.suppressedAlerts.size,
      total24h: recent24h.length,
      total1h: recent1h.length,
      bySeverity,
      queueSize: this.alertQueue.length,
      historySize: this.alertHistory.length
    }
  }

  // Utilitários
  generateAlertId() {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  // Métodos de configuração
  updateAlertRule(type, updates) {
    const rule = this.alertRules.get(type)
    if (!rule) {
      return false
    }
    
    Object.assign(rule, updates)
    this.logger.info(`Regra de alerta ${type} atualizada`, updates)
    return true
  }

  addAlertRule(type, rule) {
    this.alertRules.set(type, rule)
    this.logger.info(`Nova regra de alerta adicionada: ${type}`)
  }

  removeAlertRule(type) {
    const removed = this.alertRules.delete(type)
    if (removed) {
      this.logger.info(`Regra de alerta removida: ${type}`)
    }
    return removed
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Alert Service...')
      
      // Parar processamento
      this.stopAlertProcessing()
      this.stopPeriodicCleanup()
      
      // Processar alertas pendentes na fila
      if (this.alertQueue.length > 0) {
        this.logger.info(`Processando ${this.alertQueue.length} alertas pendentes...`)
        await this.processAlertQueue()
      }
      
      // Limpar recursos
      this.alertRules.clear()
      this.activeAlerts.clear()
      this.suppressedAlerts.clear()
      this.alertChannels.clear()
      this.alertQueue.length = 0
      
      this.isInitialized = false
      this.logger.info('Alert Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Alert Service:', error)
      throw error
    }
  }
}

module.exports = AlertService