/**
 * Testes para Planning Agent
 * Testa análise de requisições, criação de planos e coordenação
 */

const request = require('supertest');
const PlanningAgent = require('../../../src/agents/core/planning-agent');

describe('Planning Agent', () => {
  let agent;
  let app;

  beforeEach(async () => {
    agent = new PlanningAgent();
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
      expect(agent.agentId).toBe('planning-agent');
      expect(agent.isRunning).toBe(false);
      expect(agent.activePlans).toBeInstanceOf(Map);
      expect(agent.planTemplates).toBeInstanceOf(Map);
    });

    test('should setup metrics correctly', () => {
      expect(agent.metrics).toHaveProperty('requestsAnalyzed', 0);
      expect(agent.metrics).toHaveProperty('plansCreated', 0);
      expect(agent.metrics).toHaveProperty('plansFailed', 0);
      expect(agent.metrics).toHaveProperty('startedAt');
    });
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('agent', 'planning-agent');
      expect(response.body).toHaveProperty('metrics');
    });
  });

  describe('Request Analysis', () => {
    test('should analyze valid request', async () => {
      const analysisRequest = {
        id: 'req-123',
        type: 'resource_creation',
        data: {
          resourceType: 'database',
          parameters: {
            name: 'test-db',
            size: 'small',
            region: 'us-east-1'
          }
        }
      };

      const response = await request(app)
        .post('/analyze')
        .send(analysisRequest)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'analyzed');
      expect(response.body).toHaveProperty('requestId', 'req-123');
      expect(response.body).toHaveProperty('complexity');
    });

    test('should reject invalid request format', async () => {
      const invalidRequest = {
        invalidField: 'test'
      };

      const response = await request(app)
        .post('/analyze')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('validation');
    });

    test('should calculate request complexity', async () => {
      const complexRequest = {
        id: 'req-complex',
        type: 'multi_resource_deployment',
        data: {
          resources: [
            { type: 'database', dependencies: [] },
            { type: 'api', dependencies: ['database'] },
            { type: 'frontend', dependencies: ['api'] }
          ]
        }
      };

      const response = await request(app)
        .post('/analyze')
        .send(complexRequest)
        .expect(200);

      expect(response.body.complexity).toBeGreaterThan(1);
    });
  });

  describe('Plan Creation', () => {
    test('should create execution plan', async () => {
      const planRequest = {
        requestId: 'req-123',
        analysisResult: {
          complexity: 2,
          resourceType: 'database',
          dependencies: []
        }
      };

      const response = await request(app)
        .post('/create-plan')
        .send(planRequest)
        .expect(201);

      expect(response.body).toHaveProperty('planId');
      expect(response.body).toHaveProperty('steps');
      expect(response.body.steps).toBeInstanceOf(Array);
      expect(response.body.steps.length).toBeGreaterThan(0);
    });

    test('should use plan templates', async () => {
      const templateRequest = {
        requestId: 'req-template',
        analysisResult: {
          complexity: 1,
          resourceType: 'api',
          template: 'standard_api_deployment'
        }
      };

      const response = await request(app)
        .post('/create-plan')
        .send(templateRequest)
        .expect(201);

      expect(response.body.template).toBe('standard_api_deployment');
    });

    test('should handle plan creation errors', async () => {
      const invalidPlanRequest = {
        requestId: 'req-invalid',
        analysisResult: {
          complexity: -1, // Invalid complexity
          resourceType: 'unknown'
        }
      };

      const response = await request(app)
        .post('/create-plan')
        .send(invalidPlanRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Plan Optimization', () => {
    test('should optimize plan execution sequence', async () => {
      const optimizationRequest = {
        planId: 'plan-123',
        steps: [
          { id: 'step-3', dependencies: ['step-1', 'step-2'] },
          { id: 'step-1', dependencies: [] },
          { id: 'step-2', dependencies: ['step-1'] }
        ]
      };

      const response = await request(app)
        .post('/optimize-plan')
        .send(optimizationRequest)
        .expect(200);

      expect(response.body).toHaveProperty('optimizedSteps');
      expect(response.body.optimizedSteps[0].id).toBe('step-1'); // Should be first
    });

    test('should detect circular dependencies', async () => {
      const circularRequest = {
        planId: 'plan-circular',
        steps: [
          { id: 'step-1', dependencies: ['step-2'] },
          { id: 'step-2', dependencies: ['step-1'] }
        ]
      };

      const response = await request(app)
        .post('/optimize-plan')
        .send(circularRequest)
        .expect(400);

      expect(response.body.error).toContain('circular dependency');
    });
  });

  describe('Execution Coordination', () => {
    test('should coordinate with execution agent', async () => {
      const testPlan = global.testUtils.generateTestPlan();
      
      const response = await request(app)
        .post('/execute-plan')
        .send({ planId: testPlan.id })
        .expect(202);

      expect(response.body).toHaveProperty('status', 'scheduled');
      expect(agent.sqsService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          QueueUrl: expect.stringContaining('execution'),
          MessageBody: expect.any(String)
        })
      );
    });

    test('should handle execution coordination errors', async () => {
      agent.sqsService.sendMessage.mockRejectedValue(new Error('Execution queue unavailable'));
      
      const response = await request(app)
        .post('/execute-plan')
        .send({ planId: 'plan-123' })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Plan Management', () => {
    test('should track active plans', async () => {
      const testPlan = global.testUtils.generateTestPlan();
      
      expect(agent.activePlans.size).toBe(0);
      
      await request(app)
        .post('/create-plan')
        .send({
          requestId: 'req-123',
          analysisResult: { complexity: 1, resourceType: 'test' }
        })
        .expect(201);

      expect(agent.activePlans.size).toBeGreaterThan(0);
    });

    test('should provide plan status', async () => {
      const testPlan = global.testUtils.generateTestPlan();
      agent.activePlans.set(testPlan.id, testPlan);
      
      const response = await request(app)
        .get(`/plans/${testPlan.id}/status`)
        .expect(200);

      expect(response.body).toHaveProperty('planId', testPlan.id);
      expect(response.body).toHaveProperty('status');
    });

    test('should list active plans', async () => {
      const testPlan1 = global.testUtils.generateTestPlan();
      const testPlan2 = global.testUtils.generateTestPlan();
      
      agent.activePlans.set(testPlan1.id, testPlan1);
      agent.activePlans.set(testPlan2.id, testPlan2);
      
      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(response.body).toHaveProperty('plans');
      expect(response.body.plans).toHaveLength(2);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should update metrics on analysis', async () => {
      const initialMetrics = { ...agent.metrics };
      
      const analysisRequest = {
        id: 'req-metrics',
        type: 'test_request',
        data: { test: true }
      };
      
      await request(app)
        .post('/analyze')
        .send(analysisRequest)
        .expect(200);

      expect(agent.metrics.requestsAnalyzed).toBeGreaterThan(initialMetrics.requestsAnalyzed);
      expect(agent.metrics.lastAnalyzedAt).not.toBeNull();
    });

    test('should calculate average analysis time', async () => {
      const analysisRequest = {
        id: 'req-timing',
        type: 'test_request',
        data: { test: true }
      };
      
      await request(app)
        .post('/analyze')
        .send(analysisRequest)
        .expect(200);

      expect(agent.metrics.averageAnalysisTime).toBeGreaterThan(0);
    });
  });

  describe('Template Management', () => {
    test('should load plan templates on initialization', () => {
      expect(agent.planTemplates.size).toBeGreaterThan(0);
    });

    test('should provide available templates', async () => {
      const response = await request(app)
        .get('/templates')
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(response.body.templates).toBeInstanceOf(Array);
    });
  });
});