/**
 * State Management Agent - Agente Core Crítico
 * Fase 2: Base para todos os outros agentes
 * 
 * Responsabilidades:
 * - Gerenciar estado global do sistema
 * - Armazenar e versionar estados de agentes
 * - Publicar eventos de mudança de estado
 * - Fornecer API REST para consulta/atualização de estados
 * - Manter histórico de mudanças
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const StateStore = require('./src/stateStore');
const StateApi = require('./src/stateApi');
const SQSNotifier = require('./src/sqsNotifier');
const config = require('../../../config');

class StateManagementAgent {
  constructor() {
    this.agentId = 'state-management-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService(this.logger);
    this.metrics = this.setupMetrics();
    this.stateStore = new StateStore();
    this.sqsNotifier = new SQSNotifier(this.sqsService, this.logger);
    this.stateApi = new StateApi(this.stateStore, this.sqsNotifier, this.logger);
    this.isShuttingDown = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
  }

  setupLogger() {
    return winston.createLogger({
      level: config.shared.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        config.shared.logging.format === 'json' 
          ? winston.format.json()
          : winston.format.simple()
      ),
      defaultMeta: { service: this.agentId },
      transports: [
        ...(config.shared.logging.enableConsole ? [
          new winston.transports.Console()
        ] : []),
        ...(config.shared.logging.enableFile ? [
          new winston.transports.File({ 
            filename: `logs/${this.agentId}-error.log`, 
            level: 'error' 
          }),
          new winston.transports.File({ 
            filename: `logs/${this.agentId}.log` 
          })
        ] : [])
      ]
    });
  }

  setupMetrics() {
    // Registrar métricas específicas do State Management
    const stateOperationsTotal = new promClient.Counter({
      name: 'state_operations_total',
      help: 'Total number of state operations',
      labelNames: ['operation', 'agent_id', 'status']
    });

    const stateSize = new promClient.Gauge({
      name: 'state_size_bytes',
      help: 'Current size of state in bytes',
      labelNames: ['agent_id']
    });

    const stateVersions = new promClient.Gauge({
      name: 'state_versions_total',
      help: 'Total number of state versions stored',
      labelNames: ['agent_id']
    });

    const stateLatency = new promClient.Histogram({
      name: 'state_operation_duration_seconds',
      help: 'Duration of state operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
    });

    return {
      stateOperationsTotal,
      stateSize,
      stateVersions,
      stateLatency
    };
  }

  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors(config.state.cors));
    
    // Rate limiting
    this.app.use(rateLimit(config.state.rateLimiting));
    
    // Compressão
    this.app.use(compression());
    
    // Parse JSON
    this.app.use(express.json({ limit: config.state.validation.maxPayloadSize }));
    
    // Logging de requests
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.headers['x-request-id']
      });
      next();
    });

    // Middleware de métricas
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.metrics.stateLatency
          .labels(req.method.toLowerCase())
          .observe(duration);
      });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ status: 'shutting_down' });
      }
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        agent: this.agentId,
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        stateStats: this.stateStore.getStats()
      };
      
      res.json(health);
    });

    // Métricas Prometheus
    this.app.get('/metrics', async (req, res) => {
      try {
        // Atualizar métricas de estado
        this.updateStateMetrics();
        
        res.set('Content-Type', promClient.register.contentType);
        res.end(await promClient.register.metrics());
      } catch (error) {
        this.logger.error('Error generating metrics', { error: error.message });
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });

    // Rotas da API de Estado
    this.app.use('/api/v1/state', this.stateApi.getRouter());

    // Rota de informações do agente
    this.app.get('/info', (req, res) => {
      res.json({
        agent: this.agentId,
        version: process.env.npm_package_version || '1.0.0',
        description: 'State Management Agent - Gerencia estado global do sistema',
        capabilities: [
          'state_storage',
          'state_versioning',
          'state_querying',
          'change_notification',
          'history_tracking'
        ],
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          state: '/api/v1/state',
          info: '/info'
        }
      });
    });

    // Handler de erro global
    this.app.use((error, req, res, next) => {
      this.logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });
      
      this.metrics.stateOperationsTotal
        .labels('error', 'unknown', 'failed')
        .inc();
      
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.headers['x-request-id']
      });
    });

    // Handler 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
      });
    });
  }

  updateStateMetrics() {
    const stats = this.stateStore.getStats();
    
    // Atualizar métricas por agente
    Object.entries(stats.agentStates).forEach(([agentId, agentStats]) => {
      this.metrics.stateSize
        .labels(agentId)
        .set(agentStats.sizeBytes);
      
      this.metrics.stateVersions
        .labels(agentId)
        .set(agentStats.versions);
    });
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      this.isShuttingDown = true;
      
      if (this.server) {
        this.server.close(() => {
          this.logger.info('HTTP server closed');
          process.exit(0);
        });
        
        // Force close after 30 seconds
        setTimeout(() => {
          this.logger.error('Forced shutdown after timeout');
          process.exit(1);
        }, 30000);
      }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async start() {
    try {
      // Inicializar componentes
      await this.stateStore.initialize();
      await this.sqsNotifier.initialize();
      
      // Iniciar servidor HTTP
      const port = config.state.port;
      this.server = this.app.listen(port, () => {
        this.logger.info(`State Management Agent started on port ${port}`, {
          agent: this.agentId,
          port,
          environment: process.env.NODE_ENV || 'development'
        });
      });
      
      // Registrar métricas iniciais
      this.metrics.stateOperationsTotal
        .labels('startup', this.agentId, 'success')
        .inc();
      
    } catch (error) {
      this.logger.error('Failed to start State Management Agent', {
        error: error.message,
        stack: error.stack
      });
      
      this.metrics.stateOperationsTotal
        .labels('startup', this.agentId, 'failed')
        .inc();
      
      process.exit(1);
    }
  }
}

// Inicializar e iniciar o agente se executado diretamente
if (require.main === module) {
  const agent = new StateManagementAgent();
  agent.start().catch(error => {
    console.error('Failed to start State Management Agent:', error);
    process.exit(1);
  });
}

module.exports = StateManagementAgent;