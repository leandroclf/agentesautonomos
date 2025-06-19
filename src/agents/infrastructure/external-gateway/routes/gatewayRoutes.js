/**
 * Gateway Routes
 * Rotas REST para o External Event API Gateway
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const gatewayMiddleware = require('../middleware/gatewayMiddleware');

module.exports = function(dependencies) {
  const router = express.Router();
  const { eventGatewayService, authService, logger, metrics } = dependencies;

  /**
   * Health Check
   */
  router.get('/health', async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'external-event-api-gateway',
        version: '1.0.0'
      };

      // Verifica saúde dos serviços
      if (eventGatewayService) {
        health.eventGateway = await eventGatewayService.checkHealth();
      }

      if (authService) {
        health.auth = await authService.checkHealth();
      }

      // Determina status geral
      const hasUnhealthyDependency = Object.values(health)
        .filter(dep => typeof dep === 'object' && dep.status)
        .some(dep => dep.status === 'unhealthy');

      if (hasUnhealthyDependency) {
        health.status = 'unhealthy';
        res.status(503);
      }

      res.json(health);
    } catch (error) {
      logger.error('Erro no health check:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Status detalhado
   */
  router.get('/status', 
    gatewayMiddleware.requireAuth(authService, ['events:read']),
    async (req, res) => {
      try {
        const status = {
          service: 'external-event-api-gateway',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development'
        };

        if (eventGatewayService) {
          status.eventGateway = eventGatewayService.getStatus();
        }

        if (authService) {
          status.auth = authService.getStatus();
        }

        res.json(status);
      } catch (error) {
        logger.error('Erro ao obter status:', error);
        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * Estatísticas consolidadas
   */
  router.get('/stats',
    gatewayMiddleware.requireAuth(authService, ['events:read']),
    async (req, res) => {
      try {
        const stats = {
          timestamp: new Date().toISOString()
        };

        if (eventGatewayService) {
          stats.eventGateway = eventGatewayService.getStats();
        }

        if (authService) {
          stats.auth = authService.getStats();
        }

        res.json(stats);
      } catch (error) {
        logger.error('Erro ao obter estatísticas:', error);
        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * Recebe evento único
   */
  router.post('/events',
    gatewayMiddleware.requireAuth(authService, ['events:write']),
    [
      body('eventType').notEmpty().withMessage('eventType é obrigatório'),
      body('timestamp').notEmpty().withMessage('timestamp é obrigatório'),
      body('source').notEmpty().withMessage('source é obrigatório')
    ],
    async (req, res) => {
      try {
        // Verifica erros de validação
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation error',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        // Extrai informações do cliente
        const clientInfo = {
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          apiKey: req.apiKey
        };

        // Processa evento
        const result = await eventGatewayService.processEvent(req.body, clientInfo);

        res.status(201).json({
          success: true,
          message: 'Event received and processed',
          ...result
        });

      } catch (error) {
        logger.error('Erro ao processar evento:', error);

        if (error.isValidationError) {
          return res.status(400).json({
            error: 'Validation error',
            message: error.message,
            type: error.type,
            details: error.details,
            timestamp: new Date().toISOString()
          });
        }

        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to process event',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * Recebe batch de eventos
   */
  router.post('/events/batch',
    gatewayMiddleware.requireAuth(authService, ['events:write']),
    [
      body('events').isArray({ min: 1, max: 100 }).withMessage('events deve ser um array com 1-100 elementos')
    ],
    async (req, res) => {
      try {
        // Verifica erros de validação
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation error',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        // Extrai informações do cliente
        const clientInfo = {
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          apiKey: req.apiKey
        };

        // Processa batch
        const result = await eventGatewayService.processBatchEvents(req.body, clientInfo);

        res.status(201).json({
          success: true,
          message: 'Batch received and processed',
          ...result
        });

      } catch (error) {
        logger.error('Erro ao processar batch:', error);

        if (error.isValidationError) {
          return res.status(400).json({
            error: 'Validation error',
            message: error.message,
            type: error.type,
            timestamp: new Date().toISOString()
          });
        }

        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to process batch',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * Valida evento sem processar
   */
  router.post('/events/validate',
    gatewayMiddleware.requireAuth(authService, ['events:write']),
    async (req, res) => {
      try {
        // Valida evento usando o serviço
        const validatedEvent = await eventGatewayService.validateEvent(req.body);

        res.json({
          valid: true,
          message: 'Event is valid',
          validatedEvent,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        if (error.isValidationError) {
          return res.status(400).json({
            valid: false,
            error: 'Validation error',
            message: error.message,
            type: error.type,
            details: error.details,
            timestamp: new Date().toISOString()
          });
        }

        logger.error('Erro na validação:', error);
        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * Gerenciamento de API Keys
   */
  
  // Lista API keys
  router.get('/api-keys',
    gatewayMiddleware.requireAuth(authService, ['admin']),
    async (req, res) => {
      try {
        const apiKeys = await authService.listApiKeys();
        res.json({
          apiKeys,
          total: apiKeys.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Erro ao listar API keys:', error);
        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  // Cria nova API key
  router.post('/api-keys',
    gatewayMiddleware.requireAuth(authService, ['admin']),
    [
      body('name').notEmpty().withMessage('name é obrigatório'),
      body('permissions').isArray().withMessage('permissions deve ser um array')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation error',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const result = await authService.createApiKey({
          ...req.body,
          createdBy: req.keyData?.id || 'unknown'
        });

        res.status(201).json({
          success: true,
          message: 'API key created successfully',
          apiKey: result.apiKey,
          keyData: result.keyData,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Erro ao criar API key:', error);
        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  // Revoga API key
  router.delete('/api-keys/:apiKey',
    gatewayMiddleware.requireAuth(authService, ['admin']),
    async (req, res) => {
      try {
        await authService.revokeApiKey(req.params.apiKey);
        
        res.json({
          success: true,
          message: 'API key revoked successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Erro ao revogar API key:', error);
        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * Endpoints de desenvolvimento (apenas em ambiente de desenvolvimento)
   */
  if (process.env.NODE_ENV === 'development') {
    // Endpoint de teste
    router.get('/test', (req, res) => {
      res.json({
        message: 'External Event API Gateway is running',
        timestamp: new Date().toISOString(),
        environment: 'development'
      });
    });

    // Endpoint para gerar evento de teste
    router.post('/test/event', async (req, res) => {
      try {
        const testEvent = {
          eventType: 'test',
          timestamp: new Date().toISOString(),
          source: 'test-endpoint',
          data: {
            message: 'This is a test event',
            generatedAt: new Date().toISOString()
          }
        };

        const clientInfo = {
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          apiKey: 'test-endpoint'
        };

        const result = await eventGatewayService.processEvent(testEvent, clientInfo);

        res.json({
          success: true,
          message: 'Test event generated and processed',
          testEvent,
          result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Erro ao gerar evento de teste:', error);
        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  return router;
};