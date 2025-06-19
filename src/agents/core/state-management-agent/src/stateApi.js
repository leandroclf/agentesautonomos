/**
 * StateApi - API REST para Gerenciamento de Estados
 * 
 * Responsabilidades:
 * - Fornecer endpoints REST para operações de estado
 * - Validar requisições e respostas
 * - Implementar autenticação e autorização
 * - Gerenciar rate limiting específico
 * - Notificar mudanças via SQS
 */

const express = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');

class StateApi {
  constructor(stateStore, sqsNotifier, logger) {
    this.stateStore = stateStore;
    this.sqsNotifier = sqsNotifier;
    this.logger = logger;
    this.router = express.Router();
    
    this.setupValidationSchemas();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupValidationSchemas() {
    this.schemas = {
      setState: Joi.object({
        state: Joi.object().required(),
        metadata: Joi.object({
          agentType: Joi.string(),
          priority: Joi.string().valid('low', 'medium', 'high'),
          tags: Joi.array().items(Joi.string()),
          ttl: Joi.number().positive()
        }).optional()
      }),
      
      listAgents: Joi.object({
        status: Joi.string().optional(),
        type: Joi.string().optional(),
        since: Joi.date().iso().optional(),
        limit: Joi.number().integer().min(1).max(1000).default(100),
        offset: Joi.number().integer().min(0).default(0)
      }),
      
      agentId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required()
    };
  }

  setupMiddleware() {
    // Rate limiting específico para operações de estado
    const stateRateLimit = rateLimit({
      windowMs: 60 * 1000, // 1 minuto
      max: 100, // 100 requests por minuto
      message: {
        error: 'Too many state operations',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    
    this.router.use(stateRateLimit);
    
    // Middleware de validação de agentId
    this.router.param('agentId', (req, res, next, agentId) => {
      const { error } = this.schemas.agentId.validate(agentId);
      if (error) {
        return res.status(400).json({
          error: 'Invalid agent ID format',
          details: error.details[0].message
        });
      }
      req.agentId = agentId;
      next();
    });
    
    // Middleware de logging
    this.router.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('State API request', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          agentId: req.agentId,
          ip: req.ip
        });
      });
      
      next();
    });
  }

  setupRoutes() {
    // GET /global - Obter estado global do sistema
    this.router.get('/global', async (req, res) => {
      try {
        const globalState = this.stateStore.getGlobalState();
        res.json({
          success: true,
          data: globalState,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to get global state');
      }
    });

    // GET /agents - Listar todos os agentes
    this.router.get('/agents', async (req, res) => {
      try {
        const { error, value: filters } = this.schemas.listAgents.validate(req.query);
        if (error) {
          return res.status(400).json({
            error: 'Invalid query parameters',
            details: error.details[0].message
          });
        }
        
        const agents = this.stateStore.listAgents(filters);
        
        // Aplicar paginação
        const total = agents.length;
        const paginatedAgents = agents.slice(filters.offset, filters.offset + filters.limit);
        
        res.json({
          success: true,
          data: paginatedAgents,
          pagination: {
            total,
            limit: filters.limit,
            offset: filters.offset,
            hasMore: filters.offset + filters.limit < total
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to list agents');
      }
    });

    // GET /agents/:agentId - Obter estado de um agente específico
    this.router.get('/agents/:agentId', async (req, res) => {
      try {
        const options = {
          includeHistory: req.query.includeHistory === 'true',
          historyLimit: parseInt(req.query.historyLimit) || 10,
          includeHistoryState: req.query.includeHistoryState === 'true'
        };
        
        const agentState = this.stateStore.getState(req.agentId, options);
        
        if (!agentState) {
          return res.status(404).json({
            error: 'Agent not found',
            agentId: req.agentId
          });
        }
        
        res.json({
          success: true,
          data: agentState,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to get agent state');
      }
    });

    // PUT /agents/:agentId - Criar ou atualizar estado de um agente
    this.router.put('/agents/:agentId', async (req, res) => {
      try {
        const { error, value: payload } = this.schemas.setState.validate(req.body);
        if (error) {
          return res.status(400).json({
            error: 'Invalid request payload',
            details: error.details[0].message
          });
        }
        
        // Adicionar metadados da requisição
        const metadata = {
          ...payload.metadata,
          updatedBy: req.headers['x-agent-id'] || 'unknown',
          requestId: req.headers['x-request-id'],
          userAgent: req.headers['user-agent']
        };
        
        const result = this.stateStore.setState(req.agentId, payload.state, metadata);
        
        // Notificar mudança via SQS
        await this.sqsNotifier.notifyStateChange({
          agentId: req.agentId,
          version: result.version,
          timestamp: result.timestamp,
          changeType: 'state_updated',
          metadata
        });
        
        res.status(200).json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to set agent state');
      }
    });

    // GET /agents/:agentId/versions/:version - Obter versão específica
    this.router.get('/agents/:agentId/versions/:version', async (req, res) => {
      try {
        const version = req.params.version;
        const agentState = this.stateStore.getStateVersion(req.agentId, version);
        
        if (!agentState) {
          return res.status(404).json({
            error: 'Agent or version not found',
            agentId: req.agentId,
            version
          });
        }
        
        res.json({
          success: true,
          data: agentState,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to get agent state version');
      }
    });

    // DELETE /agents/:agentId - Remover estado de um agente
    this.router.delete('/agents/:agentId', async (req, res) => {
      try {
        const removed = this.stateStore.removeState(req.agentId);
        
        if (!removed) {
          return res.status(404).json({
            error: 'Agent not found',
            agentId: req.agentId
          });
        }
        
        // Notificar remoção via SQS
        await this.sqsNotifier.notifyStateChange({
          agentId: req.agentId,
          changeType: 'state_removed',
          timestamp: new Date().toISOString(),
          metadata: {
            removedBy: req.headers['x-agent-id'] || 'unknown',
            requestId: req.headers['x-request-id']
          }
        });
        
        res.json({
          success: true,
          message: 'Agent state removed successfully',
          agentId: req.agentId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to remove agent state');
      }
    });

    // POST /agents/:agentId/actions - Executar ações no estado
    this.router.post('/agents/:agentId/actions', async (req, res) => {
      try {
        const { action, parameters } = req.body;
        
        if (!action) {
          return res.status(400).json({
            error: 'Action is required'
          });
        }
        
        const result = await this.executeStateAction(req.agentId, action, parameters);
        
        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to execute state action');
      }
    });

    // GET /stats - Obter estatísticas do store
    this.router.get('/stats', async (req, res) => {
      try {
        const stats = this.stateStore.getStats();
        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to get stats');
      }
    });

    // POST /bulk - Operações em lote
    this.router.post('/bulk', async (req, res) => {
      try {
        const { operations } = req.body;
        
        if (!Array.isArray(operations) || operations.length === 0) {
          return res.status(400).json({
            error: 'Operations array is required'
          });
        }
        
        if (operations.length > 100) {
          return res.status(400).json({
            error: 'Maximum 100 operations per bulk request'
          });
        }
        
        const results = await this.executeBulkOperations(operations);
        
        res.json({
          success: true,
          data: results,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.handleError(res, error, 'Failed to execute bulk operations');
      }
    });
  }

  async executeStateAction(agentId, action, parameters = {}) {
    const agentState = this.stateStore.getState(agentId);
    
    if (!agentState) {
      throw new Error('Agent not found');
    }
    
    switch (action) {
      case 'restart':
        return this.restartAgent(agentId, parameters);
      case 'pause':
        return this.pauseAgent(agentId, parameters);
      case 'resume':
        return this.resumeAgent(agentId, parameters);
      case 'reset':
        return this.resetAgent(agentId, parameters);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async restartAgent(agentId, parameters) {
    const currentState = this.stateStore.getState(agentId);
    const newState = {
      ...currentState.state,
      status: 'restarting',
      lastRestart: new Date().toISOString(),
      restartReason: parameters.reason || 'manual'
    };
    
    return this.stateStore.setState(agentId, newState, {
      action: 'restart',
      ...parameters
    });
  }

  async pauseAgent(agentId, parameters) {
    const currentState = this.stateStore.getState(agentId);
    const newState = {
      ...currentState.state,
      status: 'paused',
      pausedAt: new Date().toISOString(),
      pauseReason: parameters.reason || 'manual'
    };
    
    return this.stateStore.setState(agentId, newState, {
      action: 'pause',
      ...parameters
    });
  }

  async resumeAgent(agentId, parameters) {
    const currentState = this.stateStore.getState(agentId);
    const newState = {
      ...currentState.state,
      status: 'running',
      resumedAt: new Date().toISOString(),
      pausedAt: undefined,
      pauseReason: undefined
    };
    
    return this.stateStore.setState(agentId, newState, {
      action: 'resume',
      ...parameters
    });
  }

  async resetAgent(agentId, parameters) {
    const agentState = this.stateStore.getState(agentId);
    const initialState = {
      status: 'initializing',
      resetAt: new Date().toISOString(),
      resetReason: parameters.reason || 'manual',
      version: '1.0.0'
    };
    
    return this.stateStore.setState(agentId, initialState, {
      action: 'reset',
      previousType: agentState.metadata.agentType,
      ...parameters
    });
  }

  async executeBulkOperations(operations) {
    const results = [];
    
    for (const operation of operations) {
      try {
        let result;
        
        switch (operation.type) {
          case 'setState':
            result = this.stateStore.setState(
              operation.agentId,
              operation.state,
              operation.metadata
            );
            break;
          case 'getState':
            result = this.stateStore.getState(operation.agentId, operation.options);
            break;
          case 'removeState':
            result = this.stateStore.removeState(operation.agentId);
            break;
          default:
            throw new Error(`Unknown operation type: ${operation.type}`);
        }
        
        results.push({
          success: true,
          operation: operation.type,
          agentId: operation.agentId,
          result
        });
      } catch (error) {
        results.push({
          success: false,
          operation: operation.type,
          agentId: operation.agentId,
          error: error.message
        });
      }
    }
    
    return results;
  }

  handleError(res, error, message) {
    this.logger.error(message, {
      error: error.message,
      stack: error.stack
    });
    
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: message,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }

  getRouter() {
    return this.router;
  }
}

module.exports = StateApi;