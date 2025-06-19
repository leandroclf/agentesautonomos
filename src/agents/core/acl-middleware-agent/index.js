/**
 * ACL Middleware Agent - Agente Core Crítico
 * Fase 2.5: Controle de Acesso e Transformação de Mensagens
 * 
 * Responsabilidades:
 * - Interceptar mensagens do Interface Agent
 * - Aplicar controles de acesso (ACL)
 * - Transformar e normalizar mensagens
 * - Rotear para agentes apropriados
 * - Implementar rate limiting e throttling
 * - Auditoria de acesso
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const ACLService = require('./services/aclService');
const MessageTransformer = require('./services/messageTransformer');
const AuditLogger = require('./services/auditLogger');
const config = require('../config');

class ACLMiddlewareAgent {
  constructor() {
    this.agentId = 'acl-middleware-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService();
    this.metrics = this.setupMetrics();
    this.aclService = new ACLService(this.logger);
    this.messageTransformer = new MessageTransformer(this.logger);
    this.auditLogger = new AuditLogger(this.logger);
    this.isShuttingDown = false;
    
    // Filas SQS
    this.inputQueue = 'interface-incoming-intentions';
    this.outputQueue = 'acl-outgoing';
    
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
            filename: `logs/${this.agentId}.log`,
            maxsize: 10485760, // 10MB
            maxFiles: 5
          })
        ] : [])
      ]
    });
  }

  setupMetrics() {
    const register = new promClient.Registry();
    
    const metrics = {
      messagesProcessed: new promClient.Counter({
        name: 'acl_messages_processed_total',
        help: 'Total number of messages processed by ACL middleware',
        labelNames: ['status', 'source', 'destination'],
        registers: [register]
      }),
      
      processingDuration: new promClient.Histogram({
        name: 'acl_processing_duration_seconds',
        help: 'Time spent processing messages',
        buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
        registers: [register]
      }),
      
      accessDenied: new promClient.Counter({
        name: 'acl_access_denied_total',
        help: 'Total number of access denied events',
        labelNames: ['reason', 'source'],
        registers: [register]
      }),
      
      transformationErrors: new promClient.Counter({
        name: 'acl_transformation_errors_total',
        help: 'Total number of message transformation errors',
        labelNames: ['error_type'],
        registers: [register]
      })
    };
    
    register.setDefaultLabels({
      agent: this.agentId,
      version: process.env.npm_package_version || '1.0.0'
    });
    
    return { register, ...metrics };
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);
    
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        queues: {
          input: this.inputQueue,
          output: this.outputQueue
        }
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', this.metrics.register.contentType);
        const metrics = await this.metrics.register.metrics();
        res.send(metrics);
      } catch (error) {
        this.logger.error('Error generating metrics:', error);
        res.status(500).send('Error generating metrics');
      }
    });

    // ACL status and configuration
    this.app.get('/api/v1/acl/status', (req, res) => {
      res.json({
        status: 'active',
        rules: this.aclService.getRulesCount(),
        lastUpdate: this.aclService.getLastUpdate(),
        processedMessages: this.metrics.messagesProcessed.get(),
        timestamp: new Date().toISOString()
      });
    });

    // Manual message processing endpoint (for testing)
    this.app.post('/api/v1/process', async (req, res) => {
      try {
        const message = req.body;
        const result = await this.processMessage(message);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Manual processing error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Error handling
    this.app.use((err, req, res, next) => {
      this.logger.error('Express error:', err);
      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
  }

  async processMessage(message) {
    const startTime = Date.now();
    const timer = this.metrics.processingDuration.startTimer();
    
    try {
      // 1. Audit incoming message
      await this.auditLogger.logIncoming(message);
      
      // 2. Apply ACL rules
      const aclResult = await this.aclService.checkAccess(message);
      if (!aclResult.allowed) {
        this.metrics.accessDenied.inc({
          reason: aclResult.reason,
          source: message.source || 'unknown'
        });
        
        await this.auditLogger.logAccessDenied(message, aclResult.reason);
        
        throw new Error(`Access denied: ${aclResult.reason}`);
      }
      
      // 3. Transform message
      const transformedMessage = await this.messageTransformer.transform(message, aclResult.transformations);
      
      // 4. Route to appropriate destination
      const destination = this.determineDestination(transformedMessage);
      
      // 5. Send to output queue
      await this.sqsService.sendMessage(this.outputQueue, {
        ...transformedMessage,
        destination,
        processedBy: this.agentId,
        processedAt: new Date().toISOString(),
        aclApplied: aclResult.rulesApplied
      });
      
      // 6. Update metrics
      this.metrics.messagesProcessed.inc({
        status: 'success',
        source: message.source || 'unknown',
        destination
      });
      
      // 7. Audit outgoing message
      await this.auditLogger.logOutgoing(transformedMessage, destination);
      
      const processingTime = Date.now() - startTime;
      this.logger.info('Message processed successfully', {
        messageId: message.id,
        source: message.source,
        destination,
        processingTime,
        rulesApplied: aclResult.rulesApplied.length
      });
      
      return {
        messageId: transformedMessage.id,
        destination,
        processingTime,
        rulesApplied: aclResult.rulesApplied.length
      };
      
    } catch (error) {
      this.metrics.messagesProcessed.inc({
        status: 'error',
        source: message.source || 'unknown',
        destination: 'none'
      });
      
      if (error.message.includes('transformation')) {
        this.metrics.transformationErrors.inc({
          error_type: 'transformation_failed'
        });
      }
      
      this.logger.error('Message processing failed:', {
        messageId: message.id,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    } finally {
      timer();
    }
  }

  determineDestination(message) {
    // Logic to determine which agent should receive the message
    const messageType = message.type || message.eventType;
    
    switch (messageType) {
      case 'user_intention':
      case 'external_event':
        return 'event-agent';
      case 'planning_request':
        return 'planning-agent';
      case 'execution_request':
        return 'execution-agent';
      case 'state_query':
      case 'state_update':
        return 'state-management-agent';
      default:
        return 'event-agent'; // Default fallback
    }
  }

  async startSQSConsumer() {
    try {
      await this.sqsService.startConsumer(
        this.inputQueue,
        async (message) => {
          try {
            await this.processMessage(message);
          } catch (error) {
            this.logger.error('SQS message processing failed:', error);
            throw error; // Will be sent to DLQ
          }
        },
        {
          maxConcurrentMessages: 10,
          visibilityTimeout: 30,
          waitTimeSeconds: 20
        }
      );
      
      this.logger.info(`Started SQS consumer for queue: ${this.inputQueue}`);
    } catch (error) {
      this.logger.error('Failed to start SQS consumer:', error);
      throw error;
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      this.logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        // Stop SQS consumer
        await this.sqsService.stopConsumer();
        
        // Close HTTP server
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
        }
        
        this.logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async start() {
    try {
      // Initialize services
      await this.aclService.initialize();
      await this.messageTransformer.initialize();
      await this.auditLogger.initialize();
      
      // Start SQS consumer
      await this.startSQSConsumer();
      
      // Start HTTP server
      const port = process.env.PORT || 3010;
      this.server = this.app.listen(port, () => {
        this.logger.info(`ACL Middleware Agent started on port ${port}`);
      });
      
      this.logger.info('ACL Middleware Agent fully initialized');
    } catch (error) {
      this.logger.error('Failed to start ACL Middleware Agent:', error);
      throw error;
    }
  }

  async stop() {
    this.isShuttingDown = true;
    
    try {
      await this.sqsService.stopConsumer();
      
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      this.logger.info('ACL Middleware Agent stopped');
    } catch (error) {
      this.logger.error('Error stopping ACL Middleware Agent:', error);
      throw error;
    }
  }
}

module.exports = ACLMiddlewareAgent;

// Start if run directly
if (require.main === module) {
  const agent = new ACLMiddlewareAgent();
  agent.start().catch((error) => {
    console.error('Failed to start ACL Middleware Agent:', error);
    process.exit(1);
  });
}