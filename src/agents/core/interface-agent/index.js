/**
 * Interface Agent - Agente Core
 * Fase 1-2: Ponto de entrada do sistema
 * 
 * Responsabilidades:
 * - Receber requisições externas via HTTP/WebSocket
 * - Validar e normalizar dados de entrada
 * - Publicar eventos no Event Agent via SQS
 * - Retornar respostas para clientes
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const InterfaceService = require('./services/interfaceService');
const config = require('../../../config');

// Classe simples para HealthCheck
class HealthCheck {
  constructor(logger) {
    this.logger = logger;
    this.isRunning = false;
    this.status = 'healthy';
  }
  
  start() {
    this.isRunning = true;
    this.logger.info('Health check started');
  }
  
  stop() {
    this.isRunning = false;
    this.logger.info('Health check stopped');
  }
  
  getStatus() {
    return {
      status: this.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}

class InterfaceAgent {
  constructor() {
    this.agentId = 'interface-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService(this.logger);
    this.metrics = this.setupMetrics();
    this.interfaceService = null;
    this.healthCheck = new HealthCheck(this.logger);
    
    this.setupMiddleware();
    this.setupRoutes();
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
            filename: `${config.shared.logging.logDirectory}/${this.agentId}.log`,
            maxsize: config.shared.logging.maxFileSize,
            maxFiles: config.shared.logging.maxFiles
          })
        ] : [])
      ]
    });
  }

  setupMetrics() {
    const register = new promClient.Registry();
    
    const metrics = {
      // HTTP Metrics
      httpRequests: new promClient.Counter({
        name: 'interface_agent_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
        registers: [register]
      }),
      requestDuration: new promClient.Histogram({
        name: 'interface_agent_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'endpoint'],
        buckets: config.shared.metrics.histogramBuckets,
        registers: [register]
      }),
      
      // Event Metrics
      eventsSubmitted: new promClient.Counter({
        name: 'interface_agent_events_submitted_total',
        help: 'Total number of events submitted',
        labelNames: ['type'],
        registers: [register]
      }),
      eventValidationErrors: new promClient.Counter({
        name: 'interface_agent_event_validation_errors_total',
        help: 'Total number of event validation errors',
        registers: [register]
      }),
      eventSizeErrors: new promClient.Counter({
        name: 'interface_agent_event_size_errors_total',
        help: 'Total number of event size errors',
        registers: [register]
      }),
      eventSubmissionErrors: new promClient.Counter({
        name: 'interface_agent_event_submission_errors_total',
        help: 'Total number of event submission errors',
        registers: [register]
      }),
      eventProcessingDuration: new promClient.Histogram({
        name: 'interface_agent_event_processing_duration_seconds',
        help: 'Duration of event processing in seconds',
        labelNames: ['type'],
        buckets: config.shared.metrics.histogramBuckets,
        registers: [register]
      }),
      
      // Status Query Metrics
      statusCacheHits: new promClient.Counter({
        name: 'interface_agent_status_cache_hits_total',
        help: 'Total number of status cache hits',
        registers: [register]
      }),
      statusCacheMisses: new promClient.Counter({
        name: 'interface_agent_status_cache_misses_total',
        help: 'Total number of status cache misses',
        registers: [register]
      }),
      statusQueryErrors: new promClient.Counter({
        name: 'interface_agent_status_query_errors_total',
        help: 'Total number of status query errors',
        registers: [register]
      }),
      listEventsErrors: new promClient.Counter({
        name: 'interface_agent_list_events_errors_total',
        help: 'Total number of list events errors',
        registers: [register]
      }),
      
      // WebSocket Metrics
      websocketConnections: new promClient.Counter({
        name: 'interface_agent_websocket_connections_total',
        help: 'Total number of WebSocket connections',
        registers: [register]
      }),
      websocketActiveConnections: new promClient.Gauge({
        name: 'interface_agent_websocket_active_connections',
        help: 'Number of active WebSocket connections',
        registers: [register]
      }),
      websocketDisconnections: new promClient.Counter({
        name: 'interface_agent_websocket_disconnections_total',
        help: 'Total number of WebSocket disconnections',
        labelNames: ['code'],
        registers: [register]
      }),
      websocketMessagesReceived: new promClient.Counter({
        name: 'interface_agent_websocket_messages_received_total',
        help: 'Total number of WebSocket messages received',
        labelNames: ['type'],
        registers: [register]
      }),
      websocketMessagesSent: new promClient.Counter({
        name: 'interface_agent_websocket_messages_sent_total',
        help: 'Total number of WebSocket messages sent',
        labelNames: ['type'],
        registers: [register]
      }),
      websocketMessageErrors: new promClient.Counter({
        name: 'interface_agent_websocket_message_errors_total',
        help: 'Total number of WebSocket message errors',
        registers: [register]
      }),
      websocketConnectionErrors: new promClient.Counter({
        name: 'interface_agent_websocket_connection_errors_total',
        help: 'Total number of WebSocket connection errors',
        registers: [register]
      }),
      websocketServerErrors: new promClient.Counter({
        name: 'interface_agent_websocket_server_errors_total',
        help: 'Total number of WebSocket server errors',
        registers: [register]
      }),
      websocketSubscriptions: new promClient.Counter({
        name: 'interface_agent_websocket_subscriptions_total',
        help: 'Total number of WebSocket subscriptions',
        labelNames: ['topics'],
        registers: [register]
      })
    };
    
    // Registrar métricas padrão do Node.js
    promClient.collectDefaultMetrics({ register });
    
    return { ...metrics, register };
  }
  
  /**
   * Configurar middleware do Express
   */
  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(morgan('combined', {
      stream: { write: (message) => this.logger.info(message.trim()) }
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Middleware de métricas
    this.app.use((req, res, next) => {
      req.startTime = Date.now();
      this.metrics.requestsReceived++;
      this.metrics.lastRequestTime = new Date().toISOString();
      next();
    });
  }
  
  /**
   * Configurar rotas da API
   */
  setupRoutes() {
    // Health Check
    this.app.get('/health', (req, res) => {
      res.json(this.healthCheck.getStatus());
    });
    
    // Métricas
    this.app.get('/metrics', (req, res) => {
      res.json({
        agent: this.agentId,
        version: this.version,
        status: this.status,
        metrics: this.metrics,
        timestamp: new Date().toISOString()
      });
    });
    
    // Endpoint principal para receber requisições
    this.app.post('/api/v1/request', async (req, res) => {
      await this.handleRequest(req, res);
    });
    
    // Endpoint para comandos diretos
    this.app.post('/api/v1/command', async (req, res) => {
      await this.handleCommand(req, res);
    });
    
    // Endpoint para queries
    this.app.get('/api/v1/query/:type', async (req, res) => {
      await this.handleQuery(req, res);
    });
    
    // WebSocket endpoint (futuro)
    this.app.get('/ws', (req, res) => {
      res.status(501).json({
        message: 'WebSocket support coming in Phase 3',
        code: 'NOT_IMPLEMENTED'
      });
    });
  }
  
  /**
   * Processar requisição principal
   */
  async handleRequest(req, res) {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    try {
      this.logger.info(`Processing request ${requestId}`, { body: req.body });
      
      // Validar dados de entrada
      const validationResult = this.validateRequest(req.body);
      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validationResult.errors,
          requestId
        });
      }
      
      // Criar evento para o Event Agent
      const event = {
        id: uuidv4(),
        type: 'user-request',
        source: this.agentId,
        target: 'event-agent',
        payload: {
          requestId,
          originalRequest: req.body,
          clientInfo: {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }
        },
        timestamp: new Date().toISOString(),
        correlationId: requestId
      };
      
      // Publicar no SQS
      await this.sqsService.sendMessage(
        config.getQueueName('eventAgent'),
        event
      );
      
      // Atualizar métricas
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, true);
      
      this.logger.info(`Request ${requestId} processed successfully`);
      
      res.json({
        requestId,
        status: 'accepted',
        message: 'Request received and being processed',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error(`Error processing request ${requestId}:`, error);
      this.updateMetrics(Date.now() - startTime, false);
      
      res.status(500).json({
        error: 'Internal server error',
        requestId,
        code: 'PROCESSING_ERROR'
      });
    }
  }
  
  /**
   * Processar comando direto
   */
  async handleCommand(req, res) {
    const commandId = uuidv4();
    
    try {
      const { command, parameters } = req.body;
      
      if (!command) {
        return res.status(400).json({
          error: 'Command is required',
          commandId
        });
      }
      
      this.logger.info(`Processing command ${commandId}: ${command}`);
      
      // Criar evento de comando
      const event = {
        id: uuidv4(),
        type: 'command',
        source: this.agentId,
        target: 'planning-agent',
        payload: {
          commandId,
          command,
          parameters: parameters || {}
        },
        timestamp: new Date().toISOString(),
        correlationId: commandId
      };
      
      await this.sqsService.sendMessage(
        config.getQueueName('planningAgent'),
        event
      );
      
      res.json({
        commandId,
        status: 'accepted',
        command,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error(`Error processing command ${commandId}:`, error);
      
      res.status(500).json({
        error: 'Internal server error',
        commandId,
        code: 'COMMAND_ERROR'
      });
    }
  }
  
  /**
   * Processar query
   */
  async handleQuery(req, res) {
    const queryId = uuidv4();
    
    try {
      const { type } = req.params;
      const { filters, limit, offset } = req.query;
      
      this.logger.info(`Processing query ${queryId}: ${type}`);
      
      // Para Phase 1, retornar dados mock
      const mockData = this.generateMockQueryResponse(type, { filters, limit, offset });
      
      res.json({
        queryId,
        type,
        data: mockData,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error(`Error processing query ${queryId}:`, error);
      
      res.status(500).json({
        error: 'Internal server error',
        queryId,
        code: 'QUERY_ERROR'
      });
    }
  }
  
  /**
   * Validar dados da requisição
   */
  validateRequest(data) {
    const errors = [];
    
    if (!data || typeof data !== 'object') {
      errors.push('Request body must be a valid JSON object');
    }
    
    // Validações básicas
    if (data && !data.action && !data.query && !data.command) {
      errors.push('Request must contain at least one of: action, query, or command');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Gerar resposta mock para queries
   */
  generateMockQueryResponse(type, options) {
    const limit = parseInt(options.limit) || 10;
    
    switch (type) {
      case 'agents':
        return Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
          id: `agent-${i + 1}`,
          type: 'core',
          status: 'active',
          lastSeen: new Date().toISOString()
        }));
        
      case 'requests':
        return Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
          id: `req-${i + 1}`,
          status: 'completed',
          timestamp: new Date(Date.now() - i * 60000).toISOString()
        }));
        
      default:
        return { message: `Mock data for type '${type}'` };
    }
  }
  
  /**
   * Atualizar métricas
   */
  updateMetrics(responseTime, success) {
    if (success) {
      this.metrics.requestsProcessed++;
    } else {
      this.metrics.requestsFailed++;
    }
    
    // Calcular média móvel do tempo de resposta
    const totalRequests = this.metrics.requestsProcessed + this.metrics.requestsFailed;
    this.metrics.averageResponseTime = (
      (this.metrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests
    );
  }
  
  /**
   * Configurar tratamento de erros
   */
  setupErrorHandling() {
    this.app.use((err, req, res, next) => {
      this.logger.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal server error',
        code: 'UNHANDLED_ERROR'
      });
    });
    
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND'
      });
    });
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      this.logger.info('Starting Interface Agent...');
      
      // Inicializar SQS Service
      await this.sqsService.initialize();
      
      // Iniciar servidor HTTP
      const port = config.port;
      this.server = this.app.listen(port, () => {
        this.status = 'active';
        this.logger.info(`Interface Agent running on port ${port}`);
        this.logger.info('Available endpoints:');
        this.logger.info('  POST /api/v1/request - Main request endpoint');
        this.logger.info('  POST /api/v1/command - Direct commands');
        this.logger.info('  GET  /api/v1/query/:type - Query data');
        this.logger.info('  GET  /health - Health check');
        this.logger.info('  GET  /metrics - Agent metrics');
      });
      
      // Iniciar health check
      this.healthCheck.start();
      
    } catch (error) {
      this.logger.error('Failed to start Interface Agent:', error);
      this.status = 'error';
      throw error;
    }
  }
  
  /**
   * Parar o agente
   */
  async stop() {
    this.logger.info('Stopping Interface Agent...');
    this.status = 'stopping';
    
    if (this.server) {
      this.server.close();
    }
    
    this.healthCheck.stop();
    await this.sqsService.close();
    
    this.status = 'stopped';
    this.logger.info('Interface Agent stopped');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const agent = new InterfaceAgent();
  
  agent.start().catch(error => {
    console.error('Failed to start Interface Agent:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
  });
}

module.exports = InterfaceAgent;