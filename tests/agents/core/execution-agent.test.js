/**
 * Testes para Execution Agent
 * Testa execução de planos, coordenação de tarefas e gerenciamento de paralelismo
 */

const request = require('supertest');
const ExecutionAgent = require('../../../src/agents/core/execution-agent');

describe('Execution Agent', () => {
  let agent;
  let app;

  beforeEach(async () => {
    agent = new ExecutionAgent();
    app = agent.app;
    
    // Mock do SQS Service
    agent.sqsService = {
      receiveMessages: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue({ MessageId: 'test-id' }),
      deleteMessage: jest.fn().mockResolvedValue({}),
      isConnected: jest.fn().mockReturnValue(true)
    };
  });

  afterEach(async () => {
    if (agent && agent.isRunning) {
      await agent.stop();
    }
  });

  describe('Initialization', () => {
    test('should initialize with correct agent ID', () => {
      expect(agent.agentId).toBe('execution-agent');
      expect(agent.isRunning).toBe(false);
      expect(agent.activeExecutions).toBeInstanceOf(Map);
      expect(agent.workerPool).toBeInstanceOf(Map);
    });

    test('should setup metrics correctly', () => {
      expect(agent.metrics).toHaveProperty('plansExecuted', 0);
      expect(agent.metrics).toHaveProperty('stepsExecuted', 0);
      expect(agent.metrics).toHaveProperty('stepsSucceeded', 0);
      expect(agent.metrics).toHaveProperty('stepsFailed', 0);
      expect(agent.metrics).toHaveProperty('startedAt');
    });

    test('should respect max concurrent executions', () => {
      expect(agent.maxConcurrentExecutions).toBeGreaterThan(0);
    });
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('agent', 'execution-agent');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('activeExecutions');
    });
  });

  describe('Plan Execution', () => {
    test('should execute valid plan', async () => {
      const testPlan = global.testUtils.generateTestPlan([
        {
          id: 'step-1',
          name: 'Create Resource',
          type: 'create',
          config: { resourceType: 'database' },
          dependencies: []
        }
      ]);

      const response = await request(app)
        .post('/execute')
        .send({ plan: testPlan })
        .expect(202);

      expect(response.body).toHaveProperty('executionId');
      expect(response.body).toHaveProperty('status', 'started');
      expect(agent.activeExecutions.size).toBeGreaterThan(0);
    });

    test('should validate plan before execution', async () => {
      const invalidPlan = {
        id: 'invalid-plan',
        steps: [] // Empty steps
      };

      const response = await request(app)
        .post('/execute')
        .send({ plan: invalidPlan })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('validation');
    });

    test('should handle concurrent execution limit', async () => {
      // Criar múltiplos planos para exceder o limite
      const plans = Array(agent.maxConcurrentExecutions + 2).fill().map((_, i) => 
        global.testUtils.generateTestPlan([{
          id: `step-${i}`,
          name: `Step ${i}`,
          type: 'test',
          config: {},
          dependencies: []
        }])
      );

      const promises = plans.map(plan => 
        request(app).post('/execute').send({ plan })
      );

      const responses = await Promise.all(promises);
      const queuedResponses = responses.filter(r => r.body.status === 'queued');
      
      expect(queuedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Step Execution', () => {
    test('should execute individual step', async () => {
      const testStep = {
        id: 'step-test',
        name: 'Test Step',
        type: 'test_action',
        config: { param1: 'value1' },
        dependencies: []
      };

      const response = await request(app)
        .post('/execute-step')
        .send({ step: testStep, executionId: 'exec-123' })
        .expect(200);

      expect(response.body).toHaveProperty('stepId', 'step-test');
      expect(response.body).toHaveProperty('status');
    });

    test('should handle step dependencies', async () => {
      const dependentStep = {
        id: 'step-dependent',
        name: 'Dependent Step',
        type: 'test_action',
        config: {},
        dependencies: ['step-prerequisite']
      };

      const response = await request(app)
        .post('/execute-step')
        .send({ step: dependentStep, executionId: 'exec-123' })
        .expect(400);

      expect(response.body.error).toContain('dependencies not met');
    });

    test('should retry failed steps', async () => {
      const failingStep = {
        id: 'step-failing',
        name: 'Failing Step',
        type: 'failing_action',
        config: { shouldFail: true },
        dependencies: [],
        retryConfig: { maxRetries: 2, retryDelay: 100 }
      };

      const response = await request(app)
        .post('/execute-step')
        .send({ step: failingStep, executionId: 'exec-retry' })
        .expect(500);

      expect(agent.metrics.stepsRetried).toBeGreaterThan(0);
    });
  });

  describe('Parallel Execution', () => {
    test('should execute independent steps in parallel', async () => {
      const parallelPlan = global.testUtils.generateTestPlan([
        {
          id: 'step-1',
          name: 'Parallel Step 1',
          type: 'test',
          config: {},
          dependencies: []
        },
        {
          id: 'step-2',
          name: 'Parallel Step 2',
          type: 'test',
          config: {},
          dependencies: []
        }
      ]);

      const startTime = Date.now();
      
      const response = await request(app)
        .post('/execute')
        .send({ plan: parallelPlan })
        .expect(202);

      // Aguardar um pouco para permitir execução paralela
      await global.testUtils.waitFor(() => {
        const execution = agent.activeExecutions.get(response.body.executionId);
        return execution && execution.completedSteps >= 2;
      }, 3000);

      const executionTime = Date.now() - startTime;
      expect(executionTime).toBeLessThan(2000); // Deve ser mais rápido que execução sequencial
    });

    test('should respect step dependencies in parallel execution', async () => {
      const dependencyPlan = global.testUtils.generateTestPlan([
        {
          id: 'step-1',
          name: 'First Step',
          type: 'test',
          config: {},
          dependencies: []
        },
        {
          id: 'step-2',
          name: 'Dependent Step',
          type: 'test',
          config: {},
          dependencies: ['step-1']
        }
      ]);

      const response = await request(app)
        .post('/execute')
        .send({ plan: dependencyPlan })
        .expect(202);

      // Verificar que step-2 só executa após step-1
      await global.testUtils.waitFor(() => {
        const execution = agent.activeExecutions.get(response.body.executionId);
        return execution && execution.status === 'completed';
      }, 3000);

      const execution = agent.activeExecutions.get(response.body.executionId);
      expect(execution.stepExecutionOrder).toEqual(['step-1', 'step-2']);
    });
  });

  describe('Rollback Mechanism', () => {
    test('should rollback on execution failure', async () => {
      const rollbackPlan = global.testUtils.generateTestPlan([
        {
          id: 'step-1',
          name: 'Successful Step',
          type: 'test',
          config: {},
          dependencies: [],
          rollbackAction: 'cleanup_step_1'
        },
        {
          id: 'step-2',
          name: 'Failing Step',
          type: 'failing_action',
          config: { shouldFail: true },
          dependencies: ['step-1']
        }
      ]);

      const response = await request(app)
        .post('/execute')
        .send({ plan: rollbackPlan, rollbackOnFailure: true })
        .expect(202);

      await global.testUtils.waitFor(() => {
        const execution = agent.activeExecutions.get(response.body.executionId);
        return execution && execution.status === 'rolled_back';
      }, 3000);

      const execution = agent.activeExecutions.get(response.body.executionId);
      expect(execution.rollbackSteps).toContain('step-1');
    });

    test('should provide rollback status', async () => {
      const executionId = 'exec-rollback-test';
      agent.activeExecutions.set(executionId, {
        id: executionId,
        status: 'rolling_back',
        rollbackSteps: ['step-1'],
        rollbackProgress: 50
      });

      const response = await request(app)
        .get(`/executions/${executionId}/rollback-status`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'rolling_back');
      expect(response.body).toHaveProperty('progress', 50);
    });
  });

  describe('Execution Monitoring', () => {
    test('should provide execution status', async () => {
      const executionId = 'exec-monitor-test';
      agent.activeExecutions.set(executionId, {
        id: executionId,
        status: 'running',
        totalSteps: 3,
        completedSteps: 1,
        progress: 33
      });

      const response = await request(app)
        .get(`/executions/${executionId}/status`)
        .expect(200);

      expect(response.body).toHaveProperty('executionId', executionId);
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('progress', 33);
    });

    test('should list active executions', async () => {
      agent.activeExecutions.set('exec-1', { id: 'exec-1', status: 'running' });
      agent.activeExecutions.set('exec-2', { id: 'exec-2', status: 'queued' });

      const response = await request(app)
        .get('/executions')
        .expect(200);

      expect(response.body).toHaveProperty('executions');
      expect(response.body.executions).toHaveLength(2);
    });

    test('should provide execution logs', async () => {
      const executionId = 'exec-logs-test';
      agent.activeExecutions.set(executionId, {
        id: executionId,
        logs: [
          { timestamp: new Date().toISOString(), level: 'info', message: 'Execution started' },
          { timestamp: new Date().toISOString(), level: 'info', message: 'Step 1 completed' }
        ]
      });

      const response = await request(app)
        .get(`/executions/${executionId}/logs`)
        .expect(200);

      expect(response.body).toHaveProperty('logs');
      expect(response.body.logs).toHaveLength(2);
    });
  });

  describe('Worker Pool Management', () => {
    test('should manage worker pool', () => {
      expect(agent.workerPool).toBeInstanceOf(Map);
      expect(agent.maxConcurrentExecutions).toBeGreaterThan(0);
    });

    test('should provide worker pool status', async () => {
      const response = await request(app)
        .get('/workers/status')
        .expect(200);

      expect(response.body).toHaveProperty('totalWorkers');
      expect(response.body).toHaveProperty('activeWorkers');
      expect(response.body).toHaveProperty('availableWorkers');
    });
  });

  describe('Metrics and Performance', () => {
    test('should update metrics on execution', async () => {
      const initialMetrics = { ...agent.metrics };
      
      const testPlan = global.testUtils.generateTestPlan();
      
      await request(app)
        .post('/execute')
        .send({ plan: testPlan })
        .expect(202);

      expect(agent.metrics.plansExecuted).toBeGreaterThan(initialMetrics.plansExecuted);
    });

    test('should calculate average execution times', async () => {
      const testPlan = global.testUtils.generateTestPlan();
      
      await request(app)
        .post('/execute')
        .send({ plan: testPlan })
        .expect(202);

      // Aguardar conclusão
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(agent.metrics.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle execution errors gracefully', async () => {
      const errorPlan = {
        id: 'error-plan',
        steps: [{
          id: 'error-step',
          type: 'unknown_action',
          config: {}
        }]
      };

      const response = await request(app)
        .post('/execute')
        .send({ plan: errorPlan })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle worker failures', async () => {
      // Simular falha de worker
      const testPlan = global.testUtils.generateTestPlan();
      
      // Mock worker failure
      const originalWorkerPool = agent.workerPool;
      agent.workerPool = {
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
        delete: jest.fn()
      };

      const response = await request(app)
        .post('/execute')
        .send({ plan: testPlan })
        .expect(500);

      expect(response.body).toHaveProperty('error');
      
      // Restaurar worker pool
      agent.workerPool = originalWorkerPool;
    });
  });
});