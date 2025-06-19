/**
 * Health Checker Agent - Agente de Verificação de Saúde
 * Fase 6: Complementação do Sistema
 * 
 * Responsabilidades:
 * - Verificação proativa de saúde de todos os agentes
 * - Detecção precoce de falhas e degradação
 * - Monitoramento de métricas vitais
 * - Alertas automáticos
 * - Coleta e agregação de métricas de saúde
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config/healthConfig');
const HealthService = require('./services/healthService');
const AlertService = require('./services/alertService');
const MetricsService = require('./services/metricsService');
const SQSService = require('../../../services/sqs-service');
const Logger = require('../../../utils/logger');

class HealthCheckerAgent {
  constructor() {
    this.agentId = config.agent.id;
    this.logger = new Logger(this.agentId);
    this.app = express();
    this.server = null;
    this.isRunning = false;
    
    // Serviços
    this.healthService = new HealthService();
    this.alertService = new AlertService();
    this.metricsService = new MetricsService();
    this.sqsService = null;
    
    // Estado do agente
    this.startTime = new Date();
    this.stats = {
      totalHealthChecks: 0,
      alertsSent: 0,
      uptime: 0
    };
    
    this.setupServices();
    this.setupExpress();
    this.setupRoutes();
  }

  /**
   * Configurar serviços e event listeners
   */
  setupServices() {
    // Health Service Events
    this.healthService.on('agentDown', (eventData) => {
      this.handleAgentDown(eventData);
    });
    
    this.healthService.on('agentDegraded', (eventData) => {
      this.handleAgentDegraded(eventData);
    });
    
    this.healthService.on('agentRecovered', (eventData) => {
      this.handleAgentRecovered(eventData);
    });
    
    this.healthService.on('agentStatusUpdated', (eventData) => {
      this.metricsService.processAgentStatusUpdate(eventData);
    });
    
    this.healthService.on('healthCheckCompleted', (eventData) => {
      this.stats.totalHealthChecks++;
    });
    
    // Alert Service Events
    this.alertService.on('alertSent', (alert) => {
      this.stats.alertsSent++;
      this.publishHealthEvent('alert_sent', alert);
    });
    
    // Metrics Service Events
    this.metricsService.on('anomalyDetected', (anomaly) => {
      this.handleAnomalyDetected(anomaly);
    });
    
    this.metricsService.on('systemMetricsUpdated', (metrics) => {
      this.publishHealthEvent('system_metrics_updated', metrics);
    });
  }

  /**
   * Configurar Express
   */
  setupExpress() {
    // Segurança
    this.app.use(helmet());
    this.app.use(cors(config.security.cors));
    
    // Rate limiting
    const limiter = rateLimit(config.security.rateLimit);
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
      });
      next();
    });
  }

  /**
   * Configurar rotas do Express
   */
  setupRoutes() {
    // Health check do próprio agente
    this.app.get('/health', (req, res) => {
      const health = {
        status: this.isRunning ? 'healthy' : 'unhealthy',
        agent: this.agentId,
        version: config.agent.version,
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
        memory: process.memoryUsage(),
        services: {
          healthService: this.healthService.isHealthy(),
          alertService: this.alertService.isEnabled,
          metricsService: this.metricsService.isRunning,
          sqsConnected: this.sqsService?.isConnected() || false
        },
        stats: this.stats
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Status geral do sistema
    this.app.get('/status', (req, res) => {
      const systemStatus = this.healthService.getSystemStatus();
      res.json({
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        systemStatus
      });
    });
    
    // Métricas do sistema
    this.app.get('/metrics', (req, res) => {
      const metrics = this.metricsService.getAllMetrics();
      res.json({
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        metrics
      });
    });
    
    // Métricas de agente específico
    this.app.get('/metrics/agents/:agentName', (req, res) => {
      const { agentName } = req.params;
      const agentMetrics = this.metricsService.getAgentMetrics(agentName);
      
      if (!agentMetrics) {
        return res.status(404).json({
          error: 'Agent not found',
          agentName
        });
      }
      
      res.json({
        agent: this.agentId,
        agentName,
        metrics: agentMetrics,
        timestamp: new Date().toISOString()
      });
    });
    
    // Histórico de métricas
    this.app.get('/metrics/history/:agentName', (req, res) => {
      const { agentName } = req.params;
      const { hours = 1 } = req.query;
      
      const history = this.metricsService.getMetricsHistory(agentName, parseInt(hours));
      
      if (!history) {
        return res.status(404).json({
          error: 'Agent not found',
          agentName
        });
      }
      
      res.json({
        agent: this.agentId,
        agentName,
        history,
        period: `${hours} hours`,
        timestamp: new Date().toISOString()
      });
    });
    
    // Alertas
    this.app.get('/alerts', (req, res) => {
      const { limit = 100 } = req.query;
      const alerts = this.alertService.getAlertHistory(parseInt(limit));
      
      res.json({
        agent: this.agentId,
        alerts,
        stats: this.alertService.getAlertStats(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Relatório de saúde
    this.app.get('/report', (req, res) => {
      const report = this.generateHealthReport();
      res.json(report);
    });
    
    // Forçar verificação de saúde
    this.app.post('/check', async (req, res) => {
      try {
        await this.healthService.performHealthChecks();
        res.json({
          message: 'Health check executado com sucesso',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Erro ao executar health check',
          message: error.message
        });
      }
    });
    
    // Limpar histórico de alertas
    this.app.delete('/alerts', (req, res) => {
      this.alertService.clearHistory();
      res.json({
        message: 'Histórico de alertas limpo',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Inicializar o agente
   */
  async initialize() {
    try {
      this.logger.info('Inicializando Health Checker Agent', {
        version: config.agent.version,
        environment: config.agent.environment,
        port: config.agent.port
      });
      
      // Inicializar SQS
      await this.initializeSQS();
      
      // Inicializar serviços
      this.alertService.initialize();
      this.metricsService.start();
      this.healthService.start();
      
      this.logger.info('Health Checker Agent inicializado com sucesso');
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Health Checker Agent', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Inicializar SQS
   */
  async initializeSQS() {
    try {
      this.sqsService = new SQSService({
        region: config.sqs.region,
        queues: config.sqs.queues
      });
      
      await this.sqsService.initialize();
      
      this.logger.info('SQS inicializado', {
        region: config.sqs.region,
        queues: Object.keys(config.sqs.queues)
      });
      
    } catch (error) {
      this.logger.error('Erro ao inicializar SQS', { error: error.message });
      // Continuar sem SQS se necessário
    }
  }

  /**
   * Iniciar o servidor
   */
  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(config.agent.port, () => {
        this.isRunning = true;
        this.logger.info(`Health Checker Agent iniciado na porta ${config.agent.port}`);
      });
      
      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      
    } catch (error) {
      this.logger.error('Erro ao iniciar Health Checker Agent', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Parar o agente
   */
  async shutdown() {
    this.logger.info('Iniciando shutdown do Health Checker Agent');
    
    this.isRunning = false;
    
    // Parar serviços
    this.healthService.stop();
    this.metricsService.stop();
    
    // Fechar servidor HTTP
    if (this.server) {
      this.server.close();
    }
    
    // Fechar SQS
    if (this.sqsService) {
      await this.sqsService.disconnect();
    }
    
    this.logger.info('Health Checker Agent finalizado');
    process.exit(0);
  }

  /**
   * Processar agente down
   */
  async handleAgentDown(eventData) {
    this.logger.warn('Agente DOWN detectado', eventData);
    
    // Enviar alerta
    await this.alertService.handleAgentDown(eventData);
    
    // Publicar evento SQS
    await this.publishAgentFailureEvent(eventData);
  }

  /**
   * Processar agente degradado
   */
  async handleAgentDegraded(eventData) {
    this.logger.warn('Agente DEGRADADO detectado', eventData);
    
    // Enviar alerta
    await this.alertService.handleAgentDegraded(eventData);
  }

  /**
   * Processar agente recuperado
   */
  async handleAgentRecovered(eventData) {
    this.logger.info('Agente RECUPERADO', eventData);
    
    // Enviar alerta de recuperação
    await this.alertService.handleAgentRecovered(eventData);
  }

  /**
   * Processar anomalia detectada
   */
  async handleAnomalyDetected(anomaly) {
    this.logger.warn('Anomalia detectada', anomaly);
    
    // Enviar alerta de sobrecarga se necessário
    if (anomaly.type === 'low_system_health') {
      await this.alertService.handleSystemOverload({
        timestamp: anomaly.timestamp,
        metrics: anomaly
      });
    }
  }

  /**
   * Publicar evento de saúde no SQS
   */
  async publishHealthEvent(eventType, data) {
    if (!this.sqsService) return;
    
    try {
      const message = {
        eventType,
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data
      };
      
      await this.sqsService.sendMessage('healthEvents', message);
      
    } catch (error) {
      this.logger.error('Erro ao publicar evento de saúde', {
        eventType,
        error: error.message
      });
    }
  }

  /**
   * Publicar evento de falha de agente no SQS
   */
  async publishAgentFailureEvent(eventData) {
    if (!this.sqsService) return;
    
    try {
      const message = {
        eventType: 'agent_failure',
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        failedAgent: eventData.agentName,
        critical: eventData.critical,
        error: eventData.error,
        consecutiveFailures: eventData.consecutiveFailures
      };
      
      await this.sqsService.sendMessage('agentFailureEvents', message);
      
    } catch (error) {
      this.logger.error('Erro ao publicar evento de falha', {
        agentName: eventData.agentName,
        error: error.message
      });
    }
  }

  /**
   * Gerar relatório de saúde
   */
  generateHealthReport() {
    const systemStatus = this.healthService.getSystemStatus();
    const metricsReport = this.metricsService.generateReport();
    const alertStats = this.alertService.getAlertStats();
    
    return {
      agent: this.agentId,
      version: config.agent.version,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      systemStatus,
      metrics: metricsReport,
      alerts: alertStats,
      stats: this.stats
    };
  }
}

// Inicializar e iniciar o agente se executado diretamente
if (require.main === module) {
  const agent = new HealthCheckerAgent();
  agent.start().catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = HealthCheckerAgent;