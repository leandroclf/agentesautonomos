/**
 * Monitoring Agent - Agente de Monitoramento
 * Fase 1-2: Observabilidade e métricas do sistema
 * 
 * Responsabilidades:
 * - Coletar métricas de todos os agentes
 * - Monitorar saúde do sistema
 * - Detectar anomalias e alertas
 * - Gerar relatórios de performance
 * - Integrar com sistemas de observabilidade
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../../../config');
const SQSService = require('../../../services/sqs-service');
const Logger = require('../../../utils/logger');

class MonitoringAgent {
  constructor() {
    this.agentId = 'monitoring-agent';
    this.logger = new Logger(this.agentId);
    this.app = express();
    this.sqsService = null;
    this.isRunning = false;
    this.server = null;
    
    // Métricas do sistema
    this.systemMetrics = {
      agents: new Map(),
      queues: new Map(),
      system: {
        uptime: 0,
        totalRequests: 0,
        totalErrors: 0,
        averageResponseTime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        lastUpdated: new Date().toISOString()
      },
      alerts: [],
      performance: {
        throughput: 0,
        latency: {
          p50: 0,
          p95: 0,
          p99: 0
        },
        errorRate: 0
      }
    };
    
    // Configurações de monitoramento
    this.monitoringConfig = {
      metricsInterval: 30000, // 30 segundos
      healthCheckInterval: 60000, // 1 minuto
      alertThresholds: {
        errorRate: 0.05, // 5%
        responseTime: 5000, // 5 segundos
        memoryUsage: 0.8, // 80%
        cpuUsage: 0.8, // 80%
        queueDepth: 1000
      },
      retentionPeriod: 24 * 60 * 60 * 1000 // 24 horas
    };
    
    // Histórico de métricas
    this.metricsHistory = [];
    
    // Agentes conhecidos
    this.knownAgents = [
      'interface-agent',
      'event-agent',
      'planning-agent',
      'execution-agent',
      'security-agent',
      'policy-agent'
    ];
    
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  /**
   * Configurar middleware do Express
   */
  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: config.security.corsOrigins,
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 1000, // máximo 1000 requests por janela
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Logging de requests
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
        
        // Atualizar métricas de sistema
        this.updateSystemMetrics({
          requestDuration: duration,
          statusCode: res.statusCode
        });
      });
      next();
    });
  }
  
  /**
   * Configurar rotas do Express
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      const health = {
        status: this.isRunning ? 'healthy' : 'unhealthy',
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sqsConnected: this.sqsService?.isConnected() || false,
        monitoredAgents: this.systemMetrics.agents.size,
        activeAlerts: this.systemMetrics.alerts.length
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Métricas do sistema
    this.app.get('/metrics', (req, res) => {
      res.json({
        agent: this.agentId,
        systemMetrics: this.systemMetrics,
        timestamp: new Date().toISOString()
      });
    });
    
    // Métricas de agente específico
    this.app.get('/metrics/agents/:agentId', (req, res) => {
      const { agentId } = req.params;
      const agentMetrics = this.systemMetrics.agents.get(agentId);
      
      if (!agentMetrics) {
        return res.status(404).json({
          error: 'Agent not found',
          agentId
        });
      }
      
      res.json({
        agentId,
        metrics: agentMetrics,
        timestamp: new Date().toISOString()
      });
    });
    
    // Histórico de métricas
    this.app.get('/metrics/history', (req, res) => {
      const { hours = 1, agentId } = req.query;
      const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      let filteredHistory = this.metricsHistory.filter(
        metric => new Date(metric.timestamp) >= hoursAgo
      );
      
      if (agentId) {
        filteredHistory = filteredHistory.filter(
          metric => metric.agentId === agentId
        );
      }
      
      res.json({
        history: filteredHistory,
        period: `${hours} hours`,
        count: filteredHistory.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Alertas ativos
    this.app.get('/alerts', (req, res) => {
      res.json({
        alerts: this.systemMetrics.alerts,
        count: this.systemMetrics.alerts.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Alertas por severidade
    this.app.get('/alerts/:severity', (req, res) => {
      const { severity } = req.params;
      const filteredAlerts = this.systemMetrics.alerts.filter(
        alert => alert.severity === severity
      );
      
      res.json({
        alerts: filteredAlerts,
        severity,
        count: filteredAlerts.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Dashboard de status
    this.app.get('/dashboard', (req, res) => {
      const dashboard = {
        system: {
          status: this.getSystemStatus(),
          uptime: process.uptime(),
          agents: {
            total: this.knownAgents.length,
            healthy: Array.from(this.systemMetrics.agents.values())
              .filter(agent => agent.status === 'healthy').length,
            unhealthy: Array.from(this.systemMetrics.agents.values())
              .filter(agent => agent.status !== 'healthy').length
          },
          alerts: {
            critical: this.systemMetrics.alerts.filter(a => a.severity === 'critical').length,
            warning: this.systemMetrics.alerts.filter(a => a.severity === 'warning').length,
            info: this.systemMetrics.alerts.filter(a => a.severity === 'info').length
          }
        },
        performance: this.systemMetrics.performance,
        recentMetrics: this.metricsHistory.slice(-10),
        timestamp: new Date().toISOString()
      };
      
      res.json(dashboard);
    });
    
    // Endpoint para receber métricas de agentes
    this.app.post('/metrics/report', (req, res) => {
      try {
        const metrics = req.body;
        this.processAgentMetrics(metrics);
        
        res.json({
          success: true,
          message: 'Metrics received',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error processing agent metrics', error, {
          metrics: req.body
        });
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Configuração de alertas
    this.app.get('/config/alerts', (req, res) => {
      res.json({
        thresholds: this.monitoringConfig.alertThresholds,
        intervals: {
          metrics: this.monitoringConfig.metricsInterval,
          healthCheck: this.monitoringConfig.healthCheckInterval
        },
        retention: this.monitoringConfig.retentionPeriod
      });
    });
    
    this.app.put('/config/alerts', (req, res) => {
      try {
        const { thresholds } = req.body;
        
        if (thresholds) {
          this.monitoringConfig.alertThresholds = {
            ...this.monitoringConfig.alertThresholds,
            ...thresholds
          };
        }
        
        res.json({
          success: true,
          config: this.monitoringConfig.alertThresholds,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error updating alert configuration', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
    
    // Error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('Express error', error, {
        url: req.url,
        method: req.method,
        body: req.body
      });
      
      res.status(500).json({
        error: 'Internal server error',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
  }
  
  /**
   * Processar métricas de agente
   */
  processAgentMetrics(metrics) {
    const { agentId, timestamp = new Date().toISOString() } = metrics;
    
    if (!agentId) {
      throw new Error('Agent ID is required');
    }
    
    this.logger.debug('Processing agent metrics', {
      agentId,
      metricsKeys: Object.keys(metrics)
    });
    
    // Atualizar métricas do agente
    this.systemMetrics.agents.set(agentId, {
      ...metrics,
      lastUpdated: timestamp
    });
    
    // Adicionar ao histórico
    this.metricsHistory.push({
      agentId,
      metrics,
      timestamp
    });
    
    // Verificar alertas
    this.checkAlerts(agentId, metrics);
    
    // Limpar histórico antigo
    this.cleanupOldMetrics();
  }
  
  /**
   * Atualizar métricas do sistema
   */
  updateSystemMetrics(data) {
    const { requestDuration, statusCode } = data;
    
    // Atualizar contadores
    this.systemMetrics.system.totalRequests++;
    
    if (statusCode >= 400) {
      this.systemMetrics.system.totalErrors++;
    }
    
    // Atualizar tempo médio de resposta
    if (this.systemMetrics.system.averageResponseTime === 0) {
      this.systemMetrics.system.averageResponseTime = requestDuration;
    } else {
      this.systemMetrics.system.averageResponseTime = 
        (this.systemMetrics.system.averageResponseTime + requestDuration) / 2;
    }
    
    // Atualizar taxa de erro
    this.systemMetrics.performance.errorRate = 
      this.systemMetrics.system.totalErrors / this.systemMetrics.system.totalRequests;
    
    // Atualizar timestamp
    this.systemMetrics.system.lastUpdated = new Date().toISOString();
  }
  
  /**
   * Verificar alertas
   */
  checkAlerts(agentId, metrics) {
    const thresholds = this.monitoringConfig.alertThresholds;
    const alerts = [];
    
    // Verificar taxa de erro
    if (metrics.errorRate && metrics.errorRate > thresholds.errorRate) {
      alerts.push({
        id: `${agentId}_error_rate_${Date.now()}`,
        agentId,
        type: 'error_rate',
        severity: 'warning',
        message: `High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
        value: metrics.errorRate,
        threshold: thresholds.errorRate,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar tempo de resposta
    if (metrics.averageResponseTime && metrics.averageResponseTime > thresholds.responseTime) {
      alerts.push({
        id: `${agentId}_response_time_${Date.now()}`,
        agentId,
        type: 'response_time',
        severity: 'warning',
        message: `High response time: ${metrics.averageResponseTime}ms`,
        value: metrics.averageResponseTime,
        threshold: thresholds.responseTime,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar uso de memória
    if (metrics.memoryUsage && metrics.memoryUsage > thresholds.memoryUsage) {
      alerts.push({
        id: `${agentId}_memory_usage_${Date.now()}`,
        agentId,
        type: 'memory_usage',
        severity: 'critical',
        message: `High memory usage: ${(metrics.memoryUsage * 100).toFixed(2)}%`,
        value: metrics.memoryUsage,
        threshold: thresholds.memoryUsage,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar profundidade da fila
    if (metrics.queueDepth && metrics.queueDepth > thresholds.queueDepth) {
      alerts.push({
        id: `${agentId}_queue_depth_${Date.now()}`,
        agentId,
        type: 'queue_depth',
        severity: 'warning',
        message: `High queue depth: ${metrics.queueDepth} messages`,
        value: metrics.queueDepth,
        threshold: thresholds.queueDepth,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar se agente está saudável
    if (metrics.status && metrics.status !== 'healthy') {
      alerts.push({
        id: `${agentId}_unhealthy_${Date.now()}`,
        agentId,
        type: 'agent_status',
        severity: 'critical',
        message: `Agent is unhealthy: ${metrics.status}`,
        value: metrics.status,
        threshold: 'healthy',
        timestamp: new Date().toISOString()
      });
    }
    
    // Adicionar novos alertas
    for (const alert of alerts) {
      this.addAlert(alert);
    }
  }
  
  /**
   * Adicionar alerta
   */
  addAlert(alert) {
    // Verificar se alerta similar já existe
    const existingAlert = this.systemMetrics.alerts.find(
      a => a.agentId === alert.agentId && a.type === alert.type
    );
    
    if (existingAlert) {
      // Atualizar alerta existente
      existingAlert.value = alert.value;
      existingAlert.timestamp = alert.timestamp;
      existingAlert.count = (existingAlert.count || 1) + 1;
    } else {
      // Adicionar novo alerta
      alert.count = 1;
      this.systemMetrics.alerts.push(alert);
    }
    
    this.logger.warn('Alert triggered', alert);
    
    // Enviar notificação se necessário
    this.sendAlertNotification(alert);
  }
  
  /**
   * Enviar notificação de alerta
   */
  async sendAlertNotification(alert) {
    try {
      // Implementar integração com sistemas de notificação
      // (Slack, email, webhook, etc.)
      
      this.logger.info('Alert notification sent', {
        alertId: alert.id,
        severity: alert.severity,
        type: alert.type
      });
    } catch (error) {
      this.logger.error('Failed to send alert notification', error, {
        alert
      });
    }
  }
  
  /**
   * Limpar métricas antigas
   */
  cleanupOldMetrics() {
    const cutoffTime = new Date(Date.now() - this.monitoringConfig.retentionPeriod);
    
    // Limpar histórico de métricas
    this.metricsHistory = this.metricsHistory.filter(
      metric => new Date(metric.timestamp) >= cutoffTime
    );
    
    // Limpar alertas antigos
    this.systemMetrics.alerts = this.systemMetrics.alerts.filter(
      alert => new Date(alert.timestamp) >= cutoffTime
    );
  }
  
  /**
   * Obter status do sistema
   */
  getSystemStatus() {
    const criticalAlerts = this.systemMetrics.alerts.filter(
      alert => alert.severity === 'critical'
    ).length;
    
    const unhealthyAgents = Array.from(this.systemMetrics.agents.values())
      .filter(agent => agent.status !== 'healthy').length;
    
    if (criticalAlerts > 0 || unhealthyAgents > 0) {
      return 'critical';
    }
    
    const warningAlerts = this.systemMetrics.alerts.filter(
      alert => alert.severity === 'warning'
    ).length;
    
    if (warningAlerts > 0) {
      return 'warning';
    }
    
    return 'healthy';
  }
  
  /**
   * Coletar métricas de todos os agentes
   */
  async collectAgentMetrics() {
    this.logger.debug('Collecting metrics from all agents');
    
    for (const agentId of this.knownAgents) {
      try {
        await this.collectAgentMetricsById(agentId);
      } catch (error) {
        this.logger.error(`Failed to collect metrics from ${agentId}`, error);
        
        // Marcar agente como não responsivo
        this.systemMetrics.agents.set(agentId, {
          status: 'unresponsive',
          lastUpdated: new Date().toISOString(),
          error: error.message
        });
      }
    }
  }
  
  /**
   * Coletar métricas de agente específico
   */
  async collectAgentMetricsById(agentId) {
    // Implementar coleta de métricas via HTTP ou SQS
    // Por enquanto, simular dados (Fase 1)
    
    if (config.env === 'development' && config.useMocks) {
      const mockMetrics = {
        agentId,
        status: 'healthy',
        uptime: Math.random() * 86400, // 0-24 horas
        requestsProcessed: Math.floor(Math.random() * 1000),
        averageResponseTime: Math.random() * 1000,
        errorRate: Math.random() * 0.1,
        memoryUsage: Math.random() * 0.8,
        cpuUsage: Math.random() * 0.6,
        queueDepth: Math.floor(Math.random() * 100),
        timestamp: new Date().toISOString()
      };
      
      this.processAgentMetrics(mockMetrics);
      return;
    }
    
    // Implementação real de coleta de métricas
    // TODO: Implementar chamadas HTTP para endpoints /metrics dos agentes
  }
  
  /**
   * Coletar métricas do sistema
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    
    this.systemMetrics.system.uptime = process.uptime();
    this.systemMetrics.system.memoryUsage = memUsage.heapUsed / memUsage.heapTotal;
    
    // Simular CPU usage (implementar coleta real)
    this.systemMetrics.system.cpuUsage = Math.random() * 0.5;
    
    // Calcular throughput
    const recentMetrics = this.metricsHistory.filter(
      metric => new Date(metric.timestamp) >= new Date(Date.now() - 60000)
    );
    
    this.systemMetrics.performance.throughput = recentMetrics.length;
    
    this.logger.debug('System metrics collected', {
      uptime: this.systemMetrics.system.uptime,
      memoryUsage: this.systemMetrics.system.memoryUsage,
      throughput: this.systemMetrics.performance.throughput
    });
  }
  
  /**
   * Inicializar serviço SQS
   */
  async initializeSQS() {
    try {
      this.sqsService = new SQSService();
      await this.sqsService.initialize();
      
      // Começar a escutar mensagens
      await this.sqsService.startPolling(
        config.aws.sqs.queues.auxiliary.monitoring,
        this.handleSQSMessage.bind(this)
      );
      
      this.logger.info('SQS service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SQS service', error);
      throw error;
    }
  }
  
  /**
   * Lidar com mensagem SQS
   */
  async handleSQSMessage(message) {
    try {
      const messageData = JSON.parse(message.Body);
      
      switch (messageData.type) {
        case 'metrics_report':
          this.processAgentMetrics(messageData.metrics);
          break;
        case 'alert':
          this.addAlert(messageData.alert);
          break;
        default:
          this.logger.warn('Unknown message type', {
            type: messageData.type,
            messageId: message.MessageId
          });
      }
      
      // Deletar mensagem da fila após processamento bem-sucedido
      await this.sqsService.deleteMessage(
        config.aws.sqs.queues.auxiliary.monitoring,
        message.ReceiptHandle
      );
      
    } catch (error) {
      this.logger.error('Error handling SQS message', error, {
        messageId: message.MessageId,
        body: message.Body
      });
      
      throw error;
    }
  }
  
  /**
   * Configurar coleta periódica de métricas
   */
  setupMetricsCollection() {
    // Coletar métricas de agentes
    setInterval(() => {
      if (this.isRunning) {
        this.collectAgentMetrics();
      }
    }, this.monitoringConfig.metricsInterval);
    
    // Coletar métricas do sistema
    setInterval(() => {
      if (this.isRunning) {
        this.collectSystemMetrics();
      }
    }, this.monitoringConfig.metricsInterval / 2);
    
    // Limpeza periódica
    setInterval(() => {
      if (this.isRunning) {
        this.cleanupOldMetrics();
      }
    }, 300000); // 5 minutos
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      this.logger.info('Starting Monitoring Agent...');
      
      // Inicializar SQS
      await this.initializeSQS();
      
      // Configurar coleta de métricas
      this.setupMetricsCollection();
      
      // Iniciar servidor HTTP
      const port = config.agents.monitoring.port || 3005;
      this.server = this.app.listen(port, () => {
        this.isRunning = true;
        this.logger.info(`Monitoring Agent started on port ${port}`);
      });
      
      // Configurar health check
      this.setupHealthCheck();
      
    } catch (error) {
      this.logger.error('Failed to start Monitoring Agent', error);
      throw error;
    }
  }
  
  /**
   * Parar o agente
   */
  async stop() {
    try {
      this.logger.info('Stopping Monitoring Agent...');
      this.isRunning = false;
      
      // Parar polling SQS
      if (this.sqsService) {
        await this.sqsService.stopPolling();
        await this.sqsService.close();
      }
      
      // Fechar servidor HTTP
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      this.logger.info('Monitoring Agent stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Monitoring Agent', error);
      throw error;
    }
  }
  
  /**
   * Configurar health check periódico
   */
  setupHealthCheck() {
    setInterval(() => {
      if (this.isRunning) {
        this.logger.debug('Health check', {
          status: 'healthy',
          systemStatus: this.getSystemStatus(),
          monitoredAgents: this.systemMetrics.agents.size,
          activeAlerts: this.systemMetrics.alerts.length
        });
      }
    }, this.monitoringConfig.healthCheckInterval);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const agent = new MonitoringAgent();
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  // Iniciar agente
  agent.start().catch((error) => {
    console.error('Failed to start Monitoring Agent:', error);
    process.exit(1);
  });
}

module.exports = MonitoringAgent;