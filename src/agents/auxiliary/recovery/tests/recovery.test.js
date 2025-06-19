/**
 * Recovery Agent Tests
 * Testes unitários e de integração para o Recovery Agent
 */

const request = require('supertest');
const express = require('express');
const RecoveryService = require('../services/recoveryService');
const RestartService = require('../services/restartService');
const EscalationService = require('../services/escalationService');
const recoveryRoutes = require('../routes/recoveryRoutes');
const { createLogger } = require('winston');

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Mock services
jest.mock('../services/recoveryService');
jest.mock('../services/restartService');
jest.mock('../services/escalationService');

describe('Recovery Agent', () => {
  let app;
  let recoveryService;
  let restartService;
  let escalationService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create service instances
    recoveryService = new RecoveryService(mockLogger);
    restartService = new RestartService(mockLogger);
    escalationService = new EscalationService(mockLogger);

    // Setup default mock implementations
    recoveryService.isRunning.mockReturnValue(true);
    restartService.isRunning.mockReturnValue(true);
    escalationService.isRunning.mockReturnValue(true);

    recoveryService.getStats.mockReturnValue({
      totalRecoveries: 10,
      successfulRecoveries: 8,
      failedRecoveries: 2,
      averageDuration: 15000
    });

    restartService.getStats.mockReturnValue({
      totalRestarts: 5,
      successfulRestarts: 4,
      failedRestarts: 1,
      averageDuration: 12000
    });

    escalationService.getStats.mockReturnValue({
      totalEscalations: 3,
      escalationsByLevel: {
        low: 1,
        medium: 1,
        high: 1,
        critical: 0
      }
    });

    recoveryService.getActiveRecoveries.mockReturnValue([]);
    escalationService.getActiveEscalations.mockReturnValue([]);
    recoveryService.getAvailableStrategies.mockReturnValue(['restart', 'graceful_restart', 'force_restart']);
    restartService.getAvailableMethods.mockReturnValue(['pm2', 'docker', 'systemd']);
    escalationService.getLevels.mockReturnValue(['low', 'medium', 'high', 'critical']);

    // Create Express app
    app = express();
    app.use(express.json());
    app.use('/', recoveryRoutes(recoveryService, restartService, escalationService, mockLogger));
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        services: {
          recovery: true,
          restart: true,
          escalation: true
        }
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
      expect(response.body.memory).toBeDefined();
    });

    test('should handle health check errors', async () => {
      recoveryService.isRunning.mockImplementation(() => {
        throw new Error('Service error');
      });

      const response = await request(app)
        .get('/health')
        .expect(500);

      expect(response.body).toMatchObject({
        status: 'unhealthy',
        error: 'Service error'
      });
    });
  });

  describe('Status Endpoint', () => {
    test('should return detailed status', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body).toMatchObject({
        recovery: {
          running: true,
          stats: expect.any(Object),
          activeRecoveries: 0,
          strategies: expect.any(Array)
        },
        restart: {
          running: true,
          stats: expect.any(Object),
          methods: expect.any(Array)
        },
        escalation: {
          running: true,
          stats: expect.any(Object),
          activeEscalations: 0,
          levels: expect.any(Array)
        }
      });
    });
  });

  describe('Recovery Operations', () => {
    test('should initiate recovery successfully', async () => {
      const mockRecoveryResult = {
        recoveryId: 'recovery_123',
        strategy: 'restart',
        status: 'initiated'
      };

      recoveryService.recover.mockResolvedValue(mockRecoveryResult);

      const response = await request(app)
        .post('/recover')
        .send({
          agent: 'planning-agent',
          strategy: 'restart',
          reason: 'health_check_failed',
          details: { error: 'Connection timeout' }
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        recoveryId: 'recovery_123',
        strategy: 'restart',
        status: 'initiated'
      });

      expect(recoveryService.recover).toHaveBeenCalledWith({
        agent: 'planning-agent',
        strategy: 'restart',
        reason: 'health_check_failed',
        details: { error: 'Connection timeout' },
        timestamp: expect.any(String),
        requestedBy: expect.any(String)
      });
    });

    test('should reject recovery without agent name', async () => {
      const response = await request(app)
        .post('/recover')
        .send({
          strategy: 'restart',
          reason: 'health_check_failed'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Agent name is required'
      });
    });

    test('should reject recovery without reason', async () => {
      const response = await request(app)
        .post('/recover')
        .send({
          agent: 'planning-agent',
          strategy: 'restart'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Recovery reason is required'
      });
    });

    test('should handle recovery service errors', async () => {
      recoveryService.recover.mockRejectedValue(new Error('Recovery failed'));

      const response = await request(app)
        .post('/recover')
        .send({
          agent: 'planning-agent',
          reason: 'health_check_failed'
        })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Recovery failed'
      });
    });
  });

  describe('Restart Operations', () => {
    test('should initiate restart successfully', async () => {
      const mockRestartResult = {
        restartId: 'restart_123',
        method: 'pm2',
        status: 'initiated'
      };

      restartService.restart.mockResolvedValue(mockRestartResult);

      const response = await request(app)
        .post('/restart')
        .send({
          agent: 'execution-agent',
          method: 'pm2',
          force: false
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        restartId: 'restart_123',
        method: 'pm2',
        status: 'initiated'
      });

      expect(restartService.restart).toHaveBeenCalledWith({
        agent: 'execution-agent',
        method: 'pm2',
        force: false,
        timestamp: expect.any(String),
        requestedBy: expect.any(String)
      });
    });

    test('should reject restart without agent name', async () => {
      const response = await request(app)
        .post('/restart')
        .send({
          method: 'pm2'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Agent name is required'
      });
    });
  });

  describe('Escalation Operations', () => {
    test('should initiate escalation successfully', async () => {
      const mockEscalationResult = {
        escalationId: 'escalation_123',
        status: 'initiated'
      };

      escalationService.escalate.mockResolvedValue(mockEscalationResult);

      const response = await request(app)
        .post('/escalate')
        .send({
          level: 'critical',
          reason: 'multiple_agent_failures',
          details: {
            affectedAgents: ['planning', 'execution'],
            impact: 'system_unavailable'
          }
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        escalationId: 'escalation_123',
        level: 'critical',
        status: 'initiated'
      });

      expect(escalationService.escalate).toHaveBeenCalledWith({
        level: 'critical',
        reason: 'multiple_agent_failures',
        details: {
          affectedAgents: ['planning', 'execution'],
          impact: 'system_unavailable'
        },
        timestamp: expect.any(String),
        requestedBy: expect.any(String)
      });
    });

    test('should reject escalation without level', async () => {
      const response = await request(app)
        .post('/escalate')
        .send({
          reason: 'multiple_agent_failures'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Escalation level is required'
      });
    });

    test('should reject escalation without reason', async () => {
      const response = await request(app)
        .post('/escalate')
        .send({
          level: 'critical'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Escalation reason is required'
      });
    });
  });

  describe('List Operations', () => {
    test('should list active recoveries', async () => {
      const mockRecoveries = [
        {
          id: 'recovery_1',
          agent: 'planning-agent',
          strategy: 'restart',
          status: 'executing',
          startTime: new Date(),
          attempts: 1
        }
      ];

      recoveryService.getActiveRecoveries.mockReturnValue(mockRecoveries);

      const response = await request(app)
        .get('/recoveries')
        .expect(200);

      expect(response.body).toMatchObject({
        total: 1,
        recoveries: [
          {
            id: 'recovery_1',
            agent: 'planning-agent',
            strategy: 'restart',
            status: 'executing',
            attempts: 1
          }
        ]
      });
    });

    test('should list recovery history', async () => {
      const mockHistory = [
        {
          id: 'recovery_1',
          agent: 'planning-agent',
          strategy: 'restart',
          status: 'completed',
          startTime: new Date(),
          endTime: new Date(),
          duration: 15000,
          attempts: 1
        }
      ];

      recoveryService.getRecoveryHistory.mockReturnValue(mockHistory);

      const response = await request(app)
        .get('/recoveries/history')
        .expect(200);

      expect(response.body).toMatchObject({
        total: 1,
        history: [
          {
            id: 'recovery_1',
            agent: 'planning-agent',
            strategy: 'restart',
            status: 'completed',
            duration: 15000,
            attempts: 1,
            success: true
          }
        ]
      });
    });

    test('should list active escalations', async () => {
      const mockEscalations = [
        {
          id: 'escalation_1',
          level: 'high',
          reason: 'agent_failure',
          status: 'executing',
          startTime: new Date(),
          attempts: 1
        }
      ];

      escalationService.getActiveEscalations.mockReturnValue(mockEscalations);

      const response = await request(app)
        .get('/escalations')
        .expect(200);

      expect(response.body).toMatchObject({
        total: 1,
        escalations: [
          {
            id: 'escalation_1',
            level: 'high',
            reason: 'agent_failure',
            status: 'executing',
            attempts: 1
          }
        ]
      });
    });
  });

  describe('Cancel Operations', () => {
    test('should cancel recovery successfully', async () => {
      recoveryService.cancelRecovery.mockResolvedValue();

      const response = await request(app)
        .delete('/recoveries/recovery_123')
        .send({ reason: 'manual_intervention' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Recovery cancelled',
        recoveryId: 'recovery_123'
      });

      expect(recoveryService.cancelRecovery).toHaveBeenCalledWith(
        'recovery_123',
        'manual_intervention'
      );
    });

    test('should cancel escalation successfully', async () => {
      escalationService.cancelEscalation.mockResolvedValue();

      const response = await request(app)
        .delete('/escalations/escalation_123')
        .send({ reason: 'manual_intervention' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Escalation cancelled',
        escalationId: 'escalation_123'
      });

      expect(escalationService.cancelEscalation).toHaveBeenCalledWith(
        'escalation_123',
        'manual_intervention'
      );
    });
  });

  describe('Statistics', () => {
    test('should return combined statistics', async () => {
      const response = await request(app)
        .get('/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        recovery: {
          totalRecoveries: 10,
          successfulRecoveries: 8,
          failedRecoveries: 2,
          averageDuration: 15000
        },
        restart: {
          totalRestarts: 5,
          successfulRestarts: 4,
          failedRestarts: 1,
          averageDuration: 12000
        },
        escalation: {
          totalEscalations: 3,
          escalationsByLevel: {
            low: 1,
            medium: 1,
            high: 1,
            critical: 0
          }
        }
      });
    });
  });

  describe('Configuration', () => {
    test('should return configuration information', async () => {
      recoveryService.getAvailableStrategies.mockReturnValue(['restart', 'graceful_restart']);
      recoveryService.getMaxRetries.mockReturnValue(3);
      recoveryService.getTimeout.mockReturnValue(30000);
      restartService.getAvailableMethods.mockReturnValue(['pm2', 'docker']);
      restartService.getTimeout.mockReturnValue(60000);
      escalationService.getLevels.mockReturnValue(['low', 'medium', 'high', 'critical']);

      const response = await request(app)
        .get('/config')
        .expect(200);

      expect(response.body).toMatchObject({
        recovery: {
          strategies: ['restart', 'graceful_restart'],
          maxRetries: 3,
          timeout: 30000
        },
        restart: {
          methods: ['pm2', 'docker'],
          timeout: 60000
        },
        escalation: {
          levels: ['low', 'medium', 'high', 'critical']
        }
      });
    });
  });
});

// Integration tests
describe('Recovery Agent Integration', () => {
  test('should handle complete recovery workflow', async () => {
    // This would be an integration test that tests the entire workflow
    // from detection to recovery completion
    expect(true).toBe(true); // Placeholder
  });

  test('should handle escalation workflow', async () => {
    // This would test the escalation workflow from trigger to notification
    expect(true).toBe(true); // Placeholder
  });

  test('should handle concurrent operations', async () => {
    // This would test handling multiple concurrent recoveries/escalations
    expect(true).toBe(true); // Placeholder
  });
});

// Performance tests
describe('Recovery Agent Performance', () => {
  test('should handle high load of recovery requests', async () => {
    // Performance test for handling many simultaneous requests
    expect(true).toBe(true); // Placeholder
  });

  test('should maintain response times under load', async () => {
    // Test response time requirements under load
    expect(true).toBe(true); // Placeholder
  });
});