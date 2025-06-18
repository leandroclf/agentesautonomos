/**
 * Testes para Event Agent
 * Testa processamento de eventos, coordenação e gerenciamento de estado
 */

const request = require('supertest');
const EventAgent = require('../../../src/agents/core/event-agent');

describe('Event Agent', () => {
  let agent;
  let app;

  beforeEach(async () => {
    agent = new EventAgent();
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
      expect(agent.agentId).toBe('event-agent');
      expect(agent.isRunning).toBe(false);
      expect(agent.processingEvents).toBeInstanceOf(Map);
    });

    test('should setup metrics correctly', () => {
      expect(agent.metrics).toHaveProperty('eventsReceived', 0);
      expect(agent.metrics).toHaveProperty('eventsProcessed', 0);
      expect(agent.metrics).toHaveProperty('eventsFailed', 0);
      expect(agent.metrics).toHaveProperty('startedAt');
    });
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('agent', 'event-agent');
      expect(response.body).toHaveProperty('metrics');
    });
  });

  describe('Event Processing', () => {
    test('should process valid event', async () => {
      const testEvent = global.testUtils.generateTestEvent('user_request', {
        action: 'create_resource',
        parameters: { name: 'test' }
      });

      const response = await request(app)
        .post('/process')
        .send(testEvent)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'processed');
      expect(response.body).toHaveProperty('eventId', testEvent.id);
    });

    test('should validate event schema', async () => {
      const invalidEvent = {
        invalidField: 'test'
      };

      const response = await request(app)
        .post('/process')
        .send(invalidEvent)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('validation');
    });

    test('should handle duplicate events', async () => {
      const testEvent = global.testUtils.generateTestEvent();
      
      // Processar o mesmo evento duas vezes
      await request(app)
        .post('/process')
        .send(testEvent)
        .expect(200);

      const response = await request(app)
        .post('/process')
        .send(testEvent)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('duplicate');
    });
  });

  describe('Event Coordination', () => {
    test('should coordinate with planning agent', async () => {
      const testEvent = global.testUtils.generateTestEvent('planning_request');
      
      const response = await request(app)
        .post('/process')
        .send(testEvent)
        .expect(200);

      expect(agent.sqsService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          QueueUrl: expect.stringContaining('planning'),
          MessageBody: expect.any(String)
        })
      );
    });

    test('should handle coordination errors', async () => {
      agent.sqsService.sendMessage.mockRejectedValue(new Error('Coordination failed'));
      
      const testEvent = global.testUtils.generateTestEvent();
      
      const response = await request(app)
        .post('/process')
        .send(testEvent)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Event State Management', () => {
    test('should track processing events', async () => {
      const testEvent = global.testUtils.generateTestEvent();
      
      expect(agent.processingEvents.size).toBe(0);
      
      // Simular processamento assíncrono
      const processPromise = request(app)
        .post('/process')
        .send(testEvent);

      // Durante o processamento, o evento deve estar no mapa
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await processPromise.expect(200);
      
      // Após o processamento, o evento deve ser removido
      expect(agent.processingEvents.has(testEvent.id)).toBe(false);
    });

    test('should provide event status', async () => {
      const testEvent = global.testUtils.generateTestEvent();
      
      // Iniciar processamento
      const processPromise = request(app)
        .post('/process')
        .send(testEvent);

      // Verificar status durante processamento
      const statusResponse = await request(app)
        .get(`/events/${testEvent.id}/status`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('status');
      expect(['processing', 'completed']).toContain(statusResponse.body.status);
      
      await processPromise;
    });
  });

  describe('Retry Mechanism', () => {
    test('should retry failed events', async () => {
      // Mock falha temporária
      agent.sqsService.sendMessage
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ MessageId: 'retry-success' });
      
      const testEvent = global.testUtils.generateTestEvent();
      
      const response = await request(app)
        .post('/process')
        .send(testEvent)
        .expect(200);

      expect(agent.metrics.eventsRetried).toBeGreaterThan(0);
      expect(agent.sqsService.sendMessage).toHaveBeenCalledTimes(2);
    });

    test('should send to DLQ after max retries', async () => {
      // Mock falhas consecutivas
      agent.sqsService.sendMessage.mockRejectedValue(new Error('Persistent failure'));
      
      const testEvent = global.testUtils.generateTestEvent();
      
      const response = await request(app)
        .post('/process')
        .send(testEvent)
        .expect(500);

      expect(agent.metrics.eventsFailed).toBeGreaterThan(0);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should update metrics on event processing', async () => {
      const initialMetrics = { ...agent.metrics };
      
      const testEvent = global.testUtils.generateTestEvent();
      
      await request(app)
        .post('/process')
        .send(testEvent)
        .expect(200);

      expect(agent.metrics.eventsReceived).toBeGreaterThan(initialMetrics.eventsReceived);
      expect(agent.metrics.eventsProcessed).toBeGreaterThan(initialMetrics.eventsProcessed);
      expect(agent.metrics.lastProcessedAt).not.toBeNull();
    });

    test('should calculate average processing time', async () => {
      const testEvent = global.testUtils.generateTestEvent();
      
      await request(app)
        .post('/process')
        .send(testEvent)
        .expect(200);

      expect(agent.metrics.averageProcessingTime).toBeGreaterThan(0);
    });
  });

  describe('SQS Integration', () => {
    test('should start SQS polling when agent starts', async () => {
      await agent.start();
      
      expect(agent.isRunning).toBe(true);
      expect(agent.sqsService.receiveMessages).toHaveBeenCalled();
    });

    test('should stop SQS polling when agent stops', async () => {
      await agent.start();
      await agent.stop();
      
      expect(agent.isRunning).toBe(false);
    });
  });
});