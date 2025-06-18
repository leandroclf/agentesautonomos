/**
 * Testes para Interface Agent
 * Testa funcionalidades de entrada HTTP, validação e publicação de eventos
 */

const request = require('supertest');
const InterfaceAgent = require('../../../src/agents/core/interface-agent');

describe('Interface Agent', () => {
  let agent;
  let app;

  beforeEach(async () => {
    agent = new InterfaceAgent();
    app = agent.app;
    
    // Mock do SQS Service
    agent.sqsService = {
      sendMessage: jest.fn().mockResolvedValue({ MessageId: 'test-id' }),
      isConnected: jest.fn().mockReturnValue(true)
    };
  });

  afterEach(async () => {
    if (agent && agent.server) {
      await agent.stop();
    }
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('agent');
      expect(response.body.agent).toBe('interface-agent');
    });
  });

  describe('Metrics', () => {
    test('should return agent metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('requestsReceived');
      expect(response.body).toHaveProperty('requestsProcessed');
      expect(response.body).toHaveProperty('requestsFailed');
    });
  });

  describe('Event Processing', () => {
    test('should accept and process valid event', async () => {
      const eventData = {
        type: 'user_request',
        data: {
          action: 'create_resource',
          parameters: { name: 'test-resource' }
        }
      };

      const response = await request(app)
        .post('/events')
        .send(eventData)
        .expect(202);

      expect(response.body).toHaveProperty('eventId');
      expect(response.body).toHaveProperty('status', 'accepted');
      expect(agent.sqsService.sendMessage).toHaveBeenCalled();
    });

    test('should reject invalid event format', async () => {
      const invalidEvent = {
        invalidField: 'test'
      };

      const response = await request(app)
        .post('/events')
        .send(invalidEvent)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(agent.sqsService.sendMessage).not.toHaveBeenCalled();
    });

    test('should handle SQS service errors', async () => {
      agent.sqsService.sendMessage.mockRejectedValue(new Error('SQS Error'));

      const eventData = {
        type: 'user_request',
        data: { action: 'test' }
      };

      const response = await request(app)
        .post('/events')
        .send(eventData)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting', async () => {
      const eventData = {
        type: 'user_request',
        data: { action: 'test' }
      };

      // Fazer muitas requisições rapidamente
      const promises = Array(20).fill().map(() => 
        request(app).post('/events').send(eventData)
      );

      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('WebSocket Support', () => {
    test('should handle WebSocket connections', (done) => {
      // Este teste seria implementado com socket.io-client
      // Por simplicidade, apenas verificamos se o endpoint existe
      request(app)
        .get('/socket.io/')
        .expect(400) // Socket.io retorna 400 para requisições HTTP normais
        .end(done);
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 routes', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/events')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Metrics Tracking', () => {
    test('should update metrics on requests', async () => {
      const initialMetrics = { ...agent.metrics };

      await request(app)
        .get('/health')
        .expect(200);

      expect(agent.metrics.requestsReceived).toBeGreaterThan(initialMetrics.requestsReceived);
    });
  });
});