/**
 * Testes para External Event API Gateway
 */

const request = require('supertest');
const express = require('express');
const { ExternalEventAPIGateway } = require('../index');
const config = require('../gatewayConfig');

// Mock das dependências
jest.mock('aws-sdk');
jest.mock('redis');
jest.mock('winston');

describe('External Event API Gateway', () => {
  let gateway;
  let app;
  
  beforeAll(async () => {
    // Configuração de teste
    const testConfig = {
      ...config,
      server: {
        ...config.server,
        port: 0 // Porta aleatória para testes
      },
      redis: {
        ...config.redis,
        enabled: false // Desabilita Redis nos testes
      },
      sqs: {
        ...config.sqs,
        endpoint: 'http://localhost:9324' // LocalStack
      }
    };
    
    gateway = new ExternalEventAPIGateway(testConfig);
    await gateway.initialize();
    app = gateway.app;
  });
  
  afterAll(async () => {
    if (gateway) {
      await gateway.shutdown();
    }
  });
  
  describe('Health Checks', () => {
    test('GET /health - deve retornar status saudável', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
    
    test('GET /status - deve retornar status detalhado', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);
      
      expect(response.body).toHaveProperty('gateway');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('dependencies');
    });
  });
  
  describe('Event Processing', () => {
    const validEvent = {
      eventType: 'user.created',
      eventId: 'evt_123',
      timestamp: new Date().toISOString(),
      source: 'user-service',
      data: {
        userId: '12345',
        email: 'test@example.com',
        name: 'Test User'
      },
      metadata: {
        version: '1.0',
        correlationId: 'corr_123'
      }
    };
    
    test('POST /events - deve processar evento válido', async () => {
      const response = await request(app)
        .post('/events')
        .set('x-api-key', 'test-key-123')
        .send(validEvent)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('eventId');
      expect(response.body).toHaveProperty('timestamp');
    });
    
    test('POST /events - deve rejeitar evento inválido', async () => {
      const invalidEvent = {
        eventType: '', // Tipo vazio
        data: {}
      };
      
      const response = await request(app)
        .post('/events')
        .set('x-api-key', 'test-key-123')
        .send(invalidEvent)
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });
    
    test('POST /events - deve rejeitar sem API key', async () => {
      await request(app)
        .post('/events')
        .send(validEvent)
        .expect(401);
    });
    
    test('POST /events/batch - deve processar lote de eventos', async () => {
      const batchPayload = {
        events: [validEvent, { ...validEvent, eventId: 'evt_124' }]
      };
      
      const response = await request(app)
        .post('/events/batch')
        .set('x-api-key', 'test-key-123')
        .send(batchPayload)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('processed', 2);
      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toHaveLength(2);
    });
  });
  
  describe('Authentication', () => {
    test('deve aceitar API key válida', async () => {
      await request(app)
        .get('/status')
        .set('x-api-key', 'test-key-123')
        .expect(200);
    });
    
    test('deve rejeitar API key inválida', async () => {
      await request(app)
        .get('/status')
        .set('x-api-key', 'invalid-key')
        .expect(401);
    });
    
    test('deve aceitar Bearer token', async () => {
      await request(app)
        .get('/status')
        .set('authorization', 'Bearer test-key-123')
        .expect(200);
    });
  });
  
  describe('Rate Limiting', () => {
    test('deve aplicar rate limiting', async () => {
      const requests = [];
      
      // Faz múltiplas requisições rapidamente
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .get('/health')
            .set('x-api-key', 'test-key-123')
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Algumas devem ser rejeitadas por rate limiting
      const rateLimited = responses.filter(res => res.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
  
  describe('Validation', () => {
    test('POST /events/validate - deve validar evento', async () => {
      const response = await request(app)
        .post('/events/validate')
        .set('x-api-key', 'test-key-123')
        .send(validEvent)
        .expect(200);
      
      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('event');
    });
    
    test('POST /events/validate - deve detectar evento inválido', async () => {
      const invalidEvent = {
        eventType: 'invalid-type!@#',
        data: 'not-an-object'
      };
      
      const response = await request(app)
        .post('/events/validate')
        .send(invalidEvent)
        .expect(400);
      
      expect(response.body).toHaveProperty('valid', false);
      expect(response.body).toHaveProperty('errors');
    });
  });
  
  describe('API Key Management', () => {
    test('GET /api-keys - deve listar chaves', async () => {
      const response = await request(app)
        .get('/api-keys')
        .set('x-api-key', 'admin-key-123')
        .expect(200);
      
      expect(response.body).toHaveProperty('keys');
      expect(Array.isArray(response.body.keys)).toBe(true);
    });
    
    test('POST /api-keys - deve criar nova chave', async () => {
      const keyData = {
        name: 'Test Key',
        permissions: ['events:write'],
        rateLimit: {
          requests: 100,
          window: 3600
        }
      };
      
      const response = await request(app)
        .post('/api-keys')
        .set('x-api-key', 'admin-key-123')
        .send(keyData)
        .expect(201);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('keyId');
      expect(response.body).toHaveProperty('apiKey');
    });
    
    test('DELETE /api-keys/:keyId - deve revogar chave', async () => {
      const response = await request(app)
        .delete('/api-keys/test-key-id')
        .set('x-api-key', 'admin-key-123')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
    });
  });
  
  describe('Metrics', () => {
    test('GET /metrics - deve retornar métricas Prometheus', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);
      
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
    });
  });
  
  describe('Error Handling', () => {
    test('deve retornar 404 para rota inexistente', async () => {
      await request(app)
        .get('/nonexistent')
        .expect(404);
    });
    
    test('deve tratar erro de JSON malformado', async () => {
      await request(app)
        .post('/events')
        .set('x-api-key', 'test-key-123')
        .set('content-type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
    
    test('deve tratar payload muito grande', async () => {
      const largePayload = {
        eventType: 'test',
        data: 'x'.repeat(11 * 1024 * 1024) // 11MB
      };
      
      await request(app)
        .post('/events')
        .set('x-api-key', 'test-key-123')
        .send(largePayload)
        .expect(413);
    });
  });
  
  describe('CORS', () => {
    test('deve incluir headers CORS', async () => {
      const response = await request(app)
        .options('/events')
        .set('Origin', 'https://example.com')
        .expect(204);
      
      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });
  
  describe('Security Headers', () => {
    test('deve incluir headers de segurança', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
    });
  });
  
  describe('Request ID', () => {
    test('deve adicionar Request ID', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
  
  describe('Development Endpoints', () => {
    beforeAll(() => {
      process.env.NODE_ENV = 'development';
    });
    
    afterAll(() => {
      process.env.NODE_ENV = 'test';
    });
    
    test('GET /dev/test - deve estar disponível em desenvolvimento', async () => {
      const response = await request(app)
        .get('/dev/test')
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'Test endpoint');
    });
    
    test('POST /dev/mock-event - deve aceitar evento mock', async () => {
      const response = await request(app)
        .post('/dev/mock-event')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('mockEvent');
    });
  });
});

// Testes de integração
describe('Integration Tests', () => {
  let gateway;
  
  beforeAll(async () => {
    // Configuração com serviços reais (LocalStack)
    const integrationConfig = {
      ...config,
      server: { ...config.server, port: 0 },
      sqs: {
        ...config.sqs,
        endpoint: 'http://localhost:9324'
      },
      redis: {
        ...config.redis,
        host: 'localhost',
        port: 6379
      }
    };
    
    gateway = new ExternalEventAPIGateway(integrationConfig);
    await gateway.initialize();
  });
  
  afterAll(async () => {
    if (gateway) {
      await gateway.shutdown();
    }
  });
  
  test('deve processar evento e enviar para SQS', async () => {
    const event = {
      eventType: 'integration.test',
      eventId: 'int_test_123',
      timestamp: new Date().toISOString(),
      source: 'integration-test',
      data: { test: true }
    };
    
    const response = await request(gateway.app)
      .post('/events')
      .set('x-api-key', 'test-key-123')
      .send(event)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    
    // Verifica se o evento foi processado
    const status = await gateway.getStatus();
    expect(status.services.eventGateway.stats.eventsProcessed).toBeGreaterThan(0);
  });
  
  test('deve manter estatísticas de processamento', async () => {
    const initialStats = await gateway.getStatus();
    const initialCount = initialStats.services.eventGateway.stats.eventsProcessed;
    
    // Processa alguns eventos
    for (let i = 0; i < 5; i++) {
      await request(gateway.app)
        .post('/events')
        .set('x-api-key', 'test-key-123')
        .send({
          eventType: 'stats.test',
          eventId: `stats_${i}`,
          timestamp: new Date().toISOString(),
          source: 'stats-test',
          data: { index: i }
        });
    }
    
    const finalStats = await gateway.getStatus();
    const finalCount = finalStats.services.eventGateway.stats.eventsProcessed;
    
    expect(finalCount).toBe(initialCount + 5);
  });
});

// Testes de performance
describe('Performance Tests', () => {
  let gateway;
  
  beforeAll(async () => {
    gateway = new ExternalEventAPIGateway({
      ...config,
      server: { ...config.server, port: 0 },
      redis: { ...config.redis, enabled: false }
    });
    await gateway.initialize();
  });
  
  afterAll(async () => {
    if (gateway) {
      await gateway.shutdown();
    }
  });
  
  test('deve processar múltiplos eventos concorrentemente', async () => {
    const startTime = Date.now();
    const eventCount = 100;
    const requests = [];
    
    for (let i = 0; i < eventCount; i++) {
      requests.push(
        request(gateway.app)
          .post('/events')
          .set('x-api-key', 'test-key-123')
          .send({
            eventType: 'performance.test',
            eventId: `perf_${i}`,
            timestamp: new Date().toISOString(),
            source: 'performance-test',
            data: { index: i }
          })
      );
    }
    
    const responses = await Promise.all(requests);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verifica se todos foram processados com sucesso
    const successCount = responses.filter(res => res.status === 200).length;
    expect(successCount).toBe(eventCount);
    
    // Verifica performance (deve processar 100 eventos em menos de 5 segundos)
    expect(duration).toBeLessThan(5000);
    
    console.log(`Processados ${eventCount} eventos em ${duration}ms (${(eventCount / duration * 1000).toFixed(2)} eventos/s)`);
  });
});