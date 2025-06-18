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
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const config = require('../../../config');
const SQSService = require('../../../services/sqs-service');
const Logger = require('../../../utils/logger');
const HealthCheck = require('../../../utils/health-check');

class InterfaceAgent {
  constructor() {
    this.agentId = 'interface-agent';
    this.version = '1.0.0';
    this.status = 'initializing';
    this.app = express();
    this.sqsService = new SQSService();
    this.logger = new Logger(this.agentId);
    this.healthCheck = new HealthCheck(this.agentId);
    this.metrics = {
      requestsReceived: 0,
      requestsProcessed: 0,
      requestsFailed: 0,
      averageResponseTime: 0,
      lastRequestTime: null
    };
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
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