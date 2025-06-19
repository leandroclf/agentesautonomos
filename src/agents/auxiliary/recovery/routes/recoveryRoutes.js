/**
 * Recovery Routes
 * Rotas para o Recovery Agent
 */

const express = require('express');
const router = express.Router();

module.exports = (recoveryService, restartService, escalationService, logger) => {
  // Middleware para logging
  router.use((req, res, next) => {
    logger.info('Recovery API request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    next();
  });

  // Health check
  router.get('/health', (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          recovery: recoveryService.isRunning(),
          restart: restartService.isRunning(),
          escalation: escalationService.isRunning()
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      };

      res.json(health);
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Status detalhado
  router.get('/status', (req, res) => {
    try {
      const status = {
        recovery: {
          running: recoveryService.isRunning(),
          stats: recoveryService.getStats(),
          activeRecoveries: recoveryService.getActiveRecoveries().length,
          strategies: recoveryService.getAvailableStrategies()
        },
        restart: {
          running: restartService.isRunning(),
          stats: restartService.getStats(),
          methods: restartService.getAvailableMethods()
        },
        escalation: {
          running: escalationService.isRunning(),
          stats: escalationService.getStats(),
          activeEscalations: escalationService.getActiveEscalations().length,
          levels: escalationService.getLevels()
        },
        timestamp: new Date().toISOString()
      };

      res.json(status);
    } catch (error) {
      logger.error('Status check failed', { error: error.message });
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Iniciar recuperação
  router.post('/recover', async (req, res) => {
    try {
      const { agent, strategy, reason, details } = req.body;

      if (!agent) {
        return res.status(400).json({
          error: 'Agent name is required',
          timestamp: new Date().toISOString()
        });
      }

      if (!reason) {
        return res.status(400).json({
          error: 'Recovery reason is required',
          timestamp: new Date().toISOString()
        });
      }

      const recoveryRequest = {
        agent,
        strategy: strategy || 'auto',
        reason,
        details: details || {},
        timestamp: new Date().toISOString(),
        requestedBy: req.ip
      };

      logger.info('Recovery requested via API', recoveryRequest);

      const result = await recoveryService.recover(recoveryRequest);

      res.json({
        success: true,
        recoveryId: result.recoveryId,
        strategy: result.strategy,
        status: result.status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Recovery request failed', {
        body: req.body,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Reiniciar agente
  router.post('/restart', async (req, res) => {
    try {
      const { agent, method, force } = req.body;

      if (!agent) {
        return res.status(400).json({
          error: 'Agent name is required',
          timestamp: new Date().toISOString()
        });
      }

      const restartRequest = {
        agent,
        method: method || 'auto',
        force: force || false,
        timestamp: new Date().toISOString(),
        requestedBy: req.ip
      };

      logger.info('Restart requested via API', restartRequest);

      const result = await restartService.restart(restartRequest);

      res.json({
        success: true,
        restartId: result.restartId,
        method: result.method,
        status: result.status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Restart request failed', {
        body: req.body,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Escalar problema
  router.post('/escalate', async (req, res) => {
    try {
      const { level, reason, details } = req.body;

      if (!level) {
        return res.status(400).json({
          error: 'Escalation level is required',
          timestamp: new Date().toISOString()
        });
      }

      if (!reason) {
        return res.status(400).json({
          error: 'Escalation reason is required',
          timestamp: new Date().toISOString()
        });
      }

      const escalationRequest = {
        level,
        reason,
        details: details || {},
        timestamp: new Date().toISOString(),
        requestedBy: req.ip
      };

      logger.warn('Escalation requested via API', escalationRequest);

      const result = await escalationService.escalate(escalationRequest);

      res.json({
        success: true,
        escalationId: result.escalationId,
        level,
        status: result.status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Escalation request failed', {
        body: req.body,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Listar recuperações ativas
  router.get('/recoveries', (req, res) => {
    try {
      const recoveries = recoveryService.getActiveRecoveries();
      
      res.json({
        total: recoveries.length,
        recoveries: recoveries.map(r => ({
          id: r.id,
          agent: r.agent,
          strategy: r.strategy,
          status: r.status,
          startTime: r.startTime,
          attempts: r.attempts
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get active recoveries', { error: error.message });
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Histórico de recuperações
  router.get('/recoveries/history', (req, res) => {
    try {
      const history = recoveryService.getRecoveryHistory();
      
      res.json({
        total: history.length,
        history: history.map(r => ({
          id: r.id,
          agent: r.agent,
          strategy: r.strategy,
          status: r.status,
          startTime: r.startTime,
          endTime: r.endTime,
          duration: r.duration,
          attempts: r.attempts,
          success: r.status === 'completed'
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get recovery history', { error: error.message });
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Listar escalações ativas
  router.get('/escalations', (req, res) => {
    try {
      const escalations = escalationService.getActiveEscalations();
      
      res.json({
        total: escalations.length,
        escalations: escalations.map(e => ({
          id: e.id,
          level: e.level,
          reason: e.reason,
          status: e.status,
          startTime: e.startTime,
          attempts: e.attempts
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get active escalations', { error: error.message });
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Histórico de escalações
  router.get('/escalations/history', (req, res) => {
    try {
      const history = escalationService.getEscalationHistory();
      
      res.json({
        total: history.length,
        history: history.map(e => ({
          id: e.id,
          level: e.level,
          reason: e.reason,
          status: e.status,
          startTime: e.startTime,
          endTime: e.endTime,
          duration: e.duration,
          notifications: e.notifications ? e.notifications.length : 0
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get escalation history', { error: error.message });
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Cancelar recuperação
  router.delete('/recoveries/:recoveryId', async (req, res) => {
    try {
      const { recoveryId } = req.params;
      const { reason } = req.body;

      await recoveryService.cancelRecovery(recoveryId, reason || 'cancelled_via_api');

      res.json({
        success: true,
        message: 'Recovery cancelled',
        recoveryId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to cancel recovery', {
        recoveryId: req.params.recoveryId,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Cancelar escalação
  router.delete('/escalations/:escalationId', async (req, res) => {
    try {
      const { escalationId } = req.params;
      const { reason } = req.body;

      await escalationService.cancelEscalation(escalationId, reason || 'cancelled_via_api');

      res.json({
        success: true,
        message: 'Escalation cancelled',
        escalationId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to cancel escalation', {
        escalationId: req.params.escalationId,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Estatísticas
  router.get('/stats', (req, res) => {
    try {
      const stats = {
        recovery: recoveryService.getStats(),
        restart: restartService.getStats(),
        escalation: escalationService.getStats(),
        timestamp: new Date().toISOString()
      };

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get stats', { error: error.message });
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Configurações
  router.get('/config', (req, res) => {
    try {
      const config = {
        recovery: {
          strategies: recoveryService.getAvailableStrategies(),
          maxRetries: recoveryService.getMaxRetries(),
          timeout: recoveryService.getTimeout()
        },
        restart: {
          methods: restartService.getAvailableMethods(),
          timeout: restartService.getTimeout()
        },
        escalation: {
          levels: escalationService.getLevels(),
          notifications: Object.keys(escalationService.notifications || {})
        },
        timestamp: new Date().toISOString()
      };

      res.json(config);
    } catch (error) {
      logger.error('Failed to get config', { error: error.message });
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Middleware de tratamento de erros
  router.use((error, req, res, next) => {
    logger.error('Recovery API error', {
      method: req.method,
      path: req.path,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  });

  return router;
};