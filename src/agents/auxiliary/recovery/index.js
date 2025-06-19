/**
 * Recovery Agent - Agente de Recuperação Automática
 * Fase 6: Complementação do Sistema
 * 
 * Responsabilidades:
 * - Recuperação automática de falhas
 * - Restart de agentes com falha
 * - Escalação de problemas críticos
 * - Coordenação com Health Checker
 * - Implementação de estratégias de recovery
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const RecoveryService = require('./services/recoveryService');
const RestartService = require('./services/restartService');
const EscalationService = require('./services/escalationService');
const config = require('./config/recoveryConfig');

class RecoveryAgent {
  constructor() {
    this.agentId = 'recovery-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService(this.logger);
    this.metrics = this.setupMetrics();
    this.isShuttingDown = false;
    
    // Serviços especializados
    this.recoveryService = new RecoveryService(this.logger);
    this.restartService = new RestartService(this.logger);
    this.escalationService = new EscalationService(this.logger);
    
    // Estado do agente
    this.startTime = new Date();
    this.stats = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      escalations: 0,
      uptime: 0
    };
    
    // Filas SQS
    this.inputQueues = [
      'health-events',
      'agent-failure-events',
      'recovery-requests'
    ];
    this.outputQueues = [
      'recovery-events',
      'escalation-events',
      'system-notifications'
    ];
    
    this.setupServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
  }

  setupLogger() {
    return winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: this.agentId },
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
          filename: `logs/${this.agentId}.log`,
          maxsize: 10485760, // 10MB
          maxFiles: 5
        })
      ]
    });
  }

  setupMetrics() {
    const register = new promClient.Registry();
    
    const metrics = {
      // Recovery Metrics
      recoveryAttempts: new promClient.Counter({
        name: 'recovery_agent_recovery_attempts_total',
        help: 'Total number of recovery attempts',
        labelNames: ['agent', 'strategy', 'result'],
        registers: [register]
      }),
      recoveryDuration: new promClient.Histogram({
        name: 'recovery_agent_recovery_duration_seconds',
        help: 'Duration of recovery operations in seconds',
        labelNames: ['agent', 'strategy'],
        buckets: [1, 5, 10, 30, 60, 120, 300],
        registers: [register]
      }),
      escalations: new promClient.Counter({
        name: 'recovery_agent_escalations_total',
        help: 'Total number of escalations',
        labelNames: ['level', 'reason'],
        registers: [register]
      }),
      agentRestarts: new promClient.Counter({
        name: 'recovery_agent_restarts_total',
        help: 'Total number of agent restarts',
        labelNames: ['agent', 'method'],
        registers: [register]
      }),
      
      // HTTP Metrics
      httpRequests: new promClient.Counter({
        name: 'recovery_agent_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
        registers: [register]
      }),
      requestDuration: new promClient.Histogram({
        name: 'recovery_agent_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'endpoint'],
        buckets: [0.1, 0.5, 1, 2, 5],
        registers: [register]
      })
    };
    
    // Registrar métricas padrão
    promClient.collectDefaultMetrics({ register });
    
    return { ...metrics, register };
  }

  setupServices() {
    // Recovery Service Events
    this.recoveryService.on('recoveryStarted', (data) => {
      this.handleRecoveryStarted(data);
    });
    
    this.recoveryService.on('recoveryCompleted', (data) => {
      this.handleRecoveryCompleted(data);
    });
    
    this.recoveryService.on('recoveryFailed', (data) => {
      this.handleRecoveryFailed(data);
    });
    
    // Restart Service Events
    this.restartService.on('restartInitiated', (data) => {
      this.handleRestartInitiated(data);
    });
    
    this.restartService.on('restartCompleted', (data) => {
      this.handleRestartCompleted(data);
    });
    
    this.restartService.on('restartFailed', (data) => {
      this.handleRestartFailed(data);
    });
    
    // Escalation Service Events
    this.escalationService.on('escalationTriggered', (data) => {
      this.handleEscalationTriggered(data);
    });
  }

  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    this.app.use(cors(config.security.cors));
    
    // Rate limiting
    this.app.use(rateLimit({
      windowMs: config.security.rateLimiting.windowMs,
      max: config.security.rateLimiting.max,
      message: 'Too many requests from this IP'
    }));
    
    // Compressão e parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Middleware de métricas
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.metrics.httpRequests.inc({
          method: req.method,
          route: req.route?.path || req.path,
          status: res.statusCode
        });
        this.metrics.requestDuration.observe(
          { method: req.method, endpoint: req.path },
          duration
        );
      });
      
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      const uptime = Date.now() - this.startTime.getTime();
      this.stats.uptime = uptime;
      
      res.json({
        status: 'healthy',
        agent: this.agentId,
        uptime,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        stats: this.stats,
        services: {
          recoveryService: this.recoveryService.isRunning(),
          restartService: this.restartService.isRunning(),
          escalationService: this.escalationService.isRunning()
        }
      });
    });
    
    // Métricas Prometheus
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', this.metrics.register.contentType);
        res.end(await this.metrics.register.metrics());
      } catch (error) {
        this.logger.error('Error generating metrics', { error: error.message });
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });
    
    // API de Recovery
    this.app.post('/recovery/trigger', async (req, res) => {
      try {
        const { agent, strategy, reason } = req.body;
        
        if (!agent) {
          return res.status(400).json({ error: 'Agent name is required' });
        }
        
        const result = await this.recoveryService.triggerRecovery({
          agent,
          strategy: strategy || 'auto',
          reason: reason || 'manual_trigger',
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          recoveryId: result.recoveryId,
          message: 'Recovery initiated successfully'
        });
        
      } catch (error) {
        this.logger.error('Error triggering recovery', { error: error.message });
        res.status(500).json({ error: 'Failed to trigger recovery' });
      }
    });
    
    // Status de Recovery
    this.app.get('/recovery/status', (req, res) => {
      res.json({
        activeRecoveries: this.recoveryService.getActiveRecoveries(),
        recentRecoveries: this.recoveryService.getRecentRecoveries(),
        statistics: this.stats
      });
    });
    
    // Escalação manual
    this.app.post('/escalation/trigger', async (req, res) => {
      try {
        const { level, reason, details } = req.body;
        
        if (!level || !reason) {
          return res.status(400).json({ error: 'Level and reason are required' });
        }
        
        await this.escalationService.escalate({
          level,
          reason,
          details: details || {},
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          message: 'Escalation triggered successfully'
        });
        
      } catch (error) {
        this.logger.error('Error triggering escalation', { error: error.message });
        res.status(500).json({ error: 'Failed to trigger escalation' });
      }
    });
  }

  // Event Handlers
  handleRecoveryStarted(data) {
    this.logger.info('Recovery started', data);
    this.metrics.recoveryAttempts.inc({
      agent: data.agent,
      strategy: data.strategy,
      result: 'started'
    });
    
    this.publishEvent('recovery-events', {
      type: 'recovery_started',
      ...data
    });
  }

  handleRecoveryCompleted(data) {
    this.logger.info('Recovery completed successfully', data);
    this.stats.totalRecoveries++;
    this.stats.successfulRecoveries++;
    
    this.metrics.recoveryAttempts.inc({
      agent: data.agent,
      strategy: data.strategy,
      result: 'success'
    });
    
    if (data.duration) {
      this.metrics.recoveryDuration.observe(
        { agent: data.agent, strategy: data.strategy },
        data.duration / 1000
      );
    }
    
    this.publishEvent('recovery-events', {
      type: 'recovery_completed',
      ...data
    });
  }

  handleRecoveryFailed(data) {
    this.logger.error('Recovery failed', data);
    this.stats.totalRecoveries++;
    this.stats.failedRecoveries++;
    
    this.metrics.recoveryAttempts.inc({
      agent: data.agent,
      strategy: data.strategy,
      result: 'failed'
    });
    
    // Considerar escalação
    if (data.shouldEscalate) {
      this.escalationService.escalate({
        level: 'high',
        reason: 'recovery_failed',
        details: data,
        timestamp: new Date().toISOString()
      });
    }
    
    this.publishEvent('recovery-events', {
      type: 'recovery_failed',
      ...data
    });
  }

  handleRestartInitiated(data) {
    this.logger.info('Agent restart initiated', data);
    this.metrics.agentRestarts.inc({
      agent: data.agent,
      method: data.method
    });
  }

  handleRestartCompleted(data) {
    this.logger.info('Agent restart completed', data);
  }

  handleRestartFailed(data) {
    this.logger.error('Agent restart failed', data);
    
    // Escalação automática para falhas de restart
    this.escalationService.escalate({
      level: 'critical',
      reason: 'restart_failed',
      details: data,
      timestamp: new Date().toISOString()
    });
  }

  handleEscalationTriggered(data) {
    this.logger.warn('Escalation triggered', data);
    this.stats.escalations++;
    
    this.metrics.escalations.inc({
      level: data.level,
      reason: data.reason
    });
    
    this.publishEvent('escalation-events', {
      type: 'escalation_triggered',
      ...data
    });
  }

  async publishEvent(queue, event) {
    try {
      await this.sqsService.sendMessage(queue, event);
    } catch (error) {
      this.logger.error('Failed to publish event', {
        queue,
        event: event.type,
        error: error.message
      });
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      this.isShuttingDown = true;
      
      try {
        // Parar serviços
        await this.recoveryService.stop();
        await this.restartService.stop();
        await this.escalationService.stop();
        
        // Fechar servidor HTTP
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
        }
        
        this.logger.info('Graceful shutdown completed');
        process.exit(0);
        
      } catch (error) {
        this.logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async start() {
    try {
      // Inicializar SQS
      await this.sqsService.initialize();
      
      // Iniciar serviços
      await this.recoveryService.start();
      await this.restartService.start();
      await this.escalationService.start();
      
      // Iniciar servidor HTTP
      const port = config.agent.port;
      this.server = this.app.listen(port, () => {
        this.logger.info(`Recovery Agent started on port ${port}`, {
          agentId: this.agentId,
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development'
        });
      });
      
      // Configurar processamento de filas SQS
      this.setupSQSProcessing();
      
    } catch (error) {
      this.logger.error('Failed to start Recovery Agent', { error: error.message });
      process.exit(1);
    }
  }

  async setupSQSProcessing() {
    // Processar eventos de saúde
    this.sqsService.startPolling('health-events', async (message) => {
      await this.processHealthEvent(message);
    });
    
    // Processar eventos de falha de agentes
    this.sqsService.startPolling('agent-failure-events', async (message) => {
      await this.processAgentFailureEvent(message);
    });
    
    // Processar requisições de recovery
    this.sqsService.startPolling('recovery-requests', async (message) => {
      await this.processRecoveryRequest(message);
    });
  }

  async processHealthEvent(message) {
    try {
      const event = JSON.parse(message.Body);
      
      if (event.type === 'agent_down') {
        await this.recoveryService.triggerRecovery({
          agent: event.agent,
          strategy: 'auto',
          reason: 'health_check_failure',
          details: event,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      this.logger.error('Error processing health event', {
        error: error.message,
        messageId: message.MessageId
      });
    }
  }

  async processAgentFailureEvent(message) {
    try {
      const event = JSON.parse(message.Body);
      
      await this.recoveryService.triggerRecovery({
        agent: event.agent,
        strategy: event.strategy || 'restart',
        reason: 'agent_failure',
        details: event,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Error processing agent failure event', {
        error: error.message,
        messageId: message.MessageId
      });
    }
  }

  async processRecoveryRequest(message) {
    try {
      const request = JSON.parse(message.Body);
      
      await this.recoveryService.triggerRecovery(request);
      
    } catch (error) {
      this.logger.error('Error processing recovery request', {
        error: error.message,
        messageId: message.MessageId
      });
    }
  }
}

// Inicializar e iniciar o agente se executado diretamente
if (require.main === module) {
  const agent = new RecoveryAgent();
  agent.start().catch(error => {
    console.error('Failed to start Recovery Agent:', error);
    process.exit(1);
  });
}

module.exports = RecoveryAgent;