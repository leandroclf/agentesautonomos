/**
 * Event Enricher Agent Tests
 * Testes unitários e de integração para o Event Enricher Agent
 */

const request = require('supertest');
const express = require('express');
const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

// Importar serviços
const EnrichmentService = require('../services/enrichmentService');
const ContextService = require('../services/contextService');
const ValidationService = require('../services/validationService');
const NormalizationService = require('../services/normalizationService');
const enricherRoutes = require('../routes/enricherRoutes');
const config = require('../config/enricherConfig');

describe('Event Enricher Agent', () => {
  let app;
  let logger;
  let enrichmentService;
  let contextService;
  let validationService;
  let normalizationService;
  
  before(async () => {
    // Configurar logger para testes
    logger = winston.createLogger({
      level: 'error', // Apenas erros durante testes
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({ silent: true })
      ]
    });
    
    // Inicializar serviços
    enrichmentService = new EnrichmentService(logger);
    contextService = new ContextService(logger);
    validationService = new ValidationService(logger);
    normalizationService = new NormalizationService(logger);
    
    // Configurar aplicação Express para testes
    app = express();
    app.use(express.json());
    app.use('/api/enricher', enricherRoutes(
      enrichmentService,
      contextService,
      validationService,
      normalizationService,
      logger
    ));
    
    // Iniciar serviços
    await enrichmentService.start();
    await contextService.start();
    await validationService.start();
    await normalizationService.start();
  });
  
  after(async () => {
    // Parar serviços
    await enrichmentService.stop();
    await contextService.stop();
    await validationService.stop();
    await normalizationService.stop();
  });
  
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/enricher/health')
        .expect(200);
      
      expect(response.body).to.have.property('status', 'healthy');
      expect(response.body).to.have.property('services');
      expect(response.body.services.enrichment).to.be.true;
      expect(response.body.services.context).to.be.true;
      expect(response.body.services.validation).to.be.true;
      expect(response.body.services.normalization).to.be.true;
    });
  });
  
  describe('Status Endpoint', () => {
    it('should return detailed status', async () => {
      const response = await request(app)
        .get('/api/enricher/status')
        .expect(200);
      
      expect(response.body).to.have.property('agent', 'event-enricher');
      expect(response.body).to.have.property('status', 'running');
      expect(response.body).to.have.property('services');
      expect(response.body).to.have.property('system');
    });
  });
  
  describe('Statistics Endpoint', () => {
    it('should return service statistics', async () => {
      const response = await request(app)
        .get('/api/enricher/stats')
        .expect(200);
      
      expect(response.body).to.have.property('enrichment');
      expect(response.body).to.have.property('context');
      expect(response.body).to.have.property('validation');
      expect(response.body).to.have.property('normalization');
    });
  });
  
  describe('Event Enrichment', () => {
    it('should enrich a valid event', async () => {
      const testEvent = {
        id: 'test-event-1',
        type: 'user.login',
        source: 'web-app',
        timestamp: new Date().toISOString(),
        data: {
          action: 'login',
          userId: 'user-123'
        },
        userId: 'user-123',
        sessionId: 'session-456'
      };
      
      const response = await request(app)
        .post('/api/enricher/enrich')
        .send(testEvent)
        .expect(200);
      
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('original');
      expect(response.body).to.have.property('enriched');
      
      const enrichedEvent = response.body.enriched;
      expect(enrichedEvent).to.have.property('id', testEvent.id);
      expect(enrichedEvent).to.have.property('type', testEvent.type);
      expect(enrichedEvent).to.have.property('enrichment');
    });
    
    it('should reject invalid event data', async () => {
      const response = await request(app)
        .post('/api/enricher/enrich')
        .send('invalid data')
        .expect(400);
      
      expect(response.body).to.have.property('error', 'Invalid event data');
    });
    
    it('should handle missing required fields', async () => {
      const invalidEvent = {
        data: {
          action: 'test'
        }
      };
      
      const response = await request(app)
        .post('/api/enricher/enrich')
        .send(invalidEvent)
        .expect(200); // Enrichment should handle and normalize
      
      const enrichedEvent = response.body.enriched;
      expect(enrichedEvent).to.have.property('id'); // Should be generated
      expect(enrichedEvent).to.have.property('timestamp'); // Should be generated
      expect(enrichedEvent).to.have.property('source'); // Should be defaulted
    });
  });
  
  describe('Event Validation', () => {
    it('should validate a correct event', async () => {
      const validEvent = {
        id: 'test-event-2',
        type: 'user.register',
        source: 'mobile-app',
        timestamp: new Date().toISOString(),
        data: {
          action: 'register',
          email: 'test@example.com'
        }
      };
      
      const response = await request(app)
        .post('/api/enricher/validate')
        .send(validEvent)
        .expect(200);
      
      expect(response.body).to.have.property('isValid', true);
      expect(response.body).to.have.property('event');
      expect(response.body.errors).to.be.an('array').that.is.empty;
    });
    
    it('should reject event with validation errors', async () => {
      const invalidEvent = {
        id: 'test-event-3',
        type: 'invalid-type',
        source: 'test',
        data: 'invalid-data' // Should be object
      };
      
      const response = await request(app)
        .post('/api/enricher/validate')
        .send(invalidEvent)
        .expect(200);
      
      expect(response.body).to.have.property('isValid', false);
      expect(response.body.errors).to.be.an('array').that.is.not.empty;
    });
  });
  
  describe('Event Normalization', () => {
    it('should normalize event fields', async () => {
      const unnormalizedEvent = {
        event_type: 'login', // Should be normalized to 'type'
        user_id: 'user-123', // Should be normalized to 'userId'
        created_at: Date.now(), // Should be normalized to ISO string
        data: {
          action: 'login'
        }
      };
      
      const response = await request(app)
        .post('/api/enricher/normalize')
        .send(unnormalizedEvent)
        .expect(200);
      
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('normalized');
      
      const normalizedEvent = response.body.normalized;
      expect(normalizedEvent).to.have.property('type', 'user.login'); // Normalized type
      expect(normalizedEvent).to.have.property('userId', 'user-123'); // Normalized field
      expect(normalizedEvent.timestamp).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); // ISO format
    });
  });
  
  describe('Validation Schemas', () => {
    it('should return available validation schemas', async () => {
      const response = await request(app)
        .get('/api/enricher/validation/schemas')
        .expect(200);
      
      expect(response.body).to.have.property('schemas');
      expect(response.body.schemas).to.be.an('array');
      expect(response.body.schemas).to.include('base');
      expect(response.body.schemas).to.include('user');
      expect(response.body.schemas).to.include('system');
    });
  });
  
  describe('Normalization Mappings', () => {
    it('should return normalization mappings', async () => {
      const response = await request(app)
        .get('/api/enricher/normalization/mappings')
        .expect(200);
      
      expect(response.body).to.have.property('mappings');
      expect(response.body.mappings).to.have.property('fields');
      expect(response.body.mappings).to.have.property('types');
      expect(response.body.mappings).to.have.property('formatters');
    });
  });
  
  describe('Metrics Endpoint', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/api/enricher/metrics')
        .expect(200);
      
      expect(response.text).to.include('event_enricher_enrichments_total');
      expect(response.text).to.include('event_enricher_validations_total');
      expect(response.text).to.include('event_enricher_normalizations_total');
      expect(response.text).to.include('event_enricher_service_status');
    });
  });
  
  describe('Service Control', () => {
    it('should handle service restart', async () => {
      // Parar serviço
      await request(app)
        .post('/api/enricher/services/enrichment/stop')
        .expect(200);
      
      // Verificar status
      const statusResponse = await request(app)
        .get('/api/enricher/status')
        .expect(200);
      
      expect(statusResponse.body.services.enrichment.running).to.be.false;
      
      // Reiniciar serviço
      await request(app)
        .post('/api/enricher/services/enrichment/start')
        .expect(200);
      
      // Verificar status novamente
      const statusResponse2 = await request(app)
        .get('/api/enricher/status')
        .expect(200);
      
      expect(statusResponse2.body.services.enrichment.running).to.be.true;
    });
    
    it('should reject invalid service names', async () => {
      await request(app)
        .post('/api/enricher/services/invalid/start')
        .expect(400);
    });
  });
});

describe('EnrichmentService Unit Tests', () => {
  let enrichmentService;
  let logger;
  
  beforeEach(() => {
    logger = {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub()
    };
    
    enrichmentService = new EnrichmentService(logger);
  });
  
  describe('Service Lifecycle', () => {
    it('should start successfully', async () => {
      await enrichmentService.start();
      expect(enrichmentService.isRunning).to.be.true;
    });
    
    it('should stop successfully', async () => {
      await enrichmentService.start();
      await enrichmentService.stop();
      expect(enrichmentService.isRunning).to.be.false;
    });
    
    it('should not start if already running', async () => {
      await enrichmentService.start();
      await enrichmentService.start(); // Second start
      expect(logger.warn.calledWith('Enrichment Service already running')).to.be.true;
    });
  });
  
  describe('Event Enrichment', () => {
    beforeEach(async () => {
      await enrichmentService.start();
    });
    
    afterEach(async () => {
      await enrichmentService.stop();
    });
    
    it('should add metadata to event', async () => {
      const event = {
        id: 'test-1',
        type: 'test.event',
        source: 'test',
        data: {}
      };
      
      const enrichedEvent = await enrichmentService.enrichEvent(event);
      
      expect(enrichedEvent).to.have.property('enrichment');
      expect(enrichedEvent.enrichment).to.have.property('metadata');
      expect(enrichedEvent.enrichment.metadata).to.have.property('timestamp');
      expect(enrichedEvent.enrichment.metadata).to.have.property('version');
    });
    
    it('should preserve original event data', async () => {
      const event = {
        id: 'test-2',
        type: 'test.event',
        source: 'test',
        data: { key: 'value' }
      };
      
      const enrichedEvent = await enrichmentService.enrichEvent(event);
      
      expect(enrichedEvent.id).to.equal(event.id);
      expect(enrichedEvent.type).to.equal(event.type);
      expect(enrichedEvent.source).to.equal(event.source);
      expect(enrichedEvent.data).to.deep.equal(event.data);
    });
  });
  
  describe('Statistics', () => {
    it('should track enrichment statistics', async () => {
      await enrichmentService.start();
      
      const initialStats = enrichmentService.getStats();
      expect(initialStats.totalEnrichments).to.equal(0);
      
      const event = {
        id: 'test-3',
        type: 'test.event',
        source: 'test',
        data: {}
      };
      
      await enrichmentService.enrichEvent(event);
      
      const updatedStats = enrichmentService.getStats();
      expect(updatedStats.totalEnrichments).to.equal(1);
      expect(updatedStats.successfulEnrichments).to.equal(1);
      
      await enrichmentService.stop();
    });
  });
});

describe('ValidationService Unit Tests', () => {
  let validationService;
  let logger;
  
  beforeEach(async () => {
    logger = {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub()
    };
    
    validationService = new ValidationService(logger);
    await validationService.start();
  });
  
  afterEach(async () => {
    await validationService.stop();
  });
  
  describe('Event Validation', () => {
    it('should validate correct event structure', async () => {
      const validEvent = {
        id: 'test-1',
        type: 'user.login',
        timestamp: new Date().toISOString(),
        source: 'web',
        data: {
          action: 'login'
        }
      };
      
      const result = await validationService.validateEvent(validEvent);
      
      expect(result.isValid).to.be.true;
      expect(result.event).to.deep.equal(validEvent);
      expect(result.errors).to.be.empty;
    });
    
    it('should reject event with missing required fields', async () => {
      const invalidEvent = {
        type: 'user.login'
        // Missing id, timestamp, source, data
      };
      
      const result = await validationService.validateEvent(invalidEvent);
      
      expect(result.isValid).to.be.false;
      expect(result.errors).to.not.be.empty;
    });
    
    it('should reject event with invalid timestamp', async () => {
      const invalidEvent = {
        id: 'test-2',
        type: 'user.login',
        timestamp: 'invalid-date',
        source: 'web',
        data: {
          action: 'login'
        }
      };
      
      const result = await validationService.validateEvent(invalidEvent);
      
      expect(result.isValid).to.be.false;
    });
  });
});

describe('NormalizationService Unit Tests', () => {
  let normalizationService;
  let logger;
  
  beforeEach(async () => {
    logger = {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub()
    };
    
    normalizationService = new NormalizationService(logger);
    await normalizationService.start();
  });
  
  afterEach(async () => {
    await normalizationService.stop();
  });
  
  describe('Field Normalization', () => {
    it('should normalize field names', async () => {
      const event = {
        event_type: 'login',
        user_id: 'user-123',
        created_at: new Date().toISOString(),
        data: {}
      };
      
      const normalized = await normalizationService.normalizeEvent(event);
      
      expect(normalized).to.have.property('type', 'user.login');
      expect(normalized).to.have.property('userId', 'user-123');
      expect(normalized).to.have.property('timestamp');
    });
    
    it('should ensure required fields', async () => {
      const incompleteEvent = {
        data: { action: 'test' }
      };
      
      const normalized = await normalizationService.normalizeEvent(incompleteEvent);
      
      expect(normalized).to.have.property('id');
      expect(normalized).to.have.property('timestamp');
      expect(normalized).to.have.property('source');
      expect(normalized).to.have.property('type');
    });
  });
  
  describe('Type Normalization', () => {
    it('should normalize event types', async () => {
      const event = {
        id: 'test-1',
        type: 'login',
        source: 'test',
        data: {}
      };
      
      const normalized = await normalizationService.normalizeEvent(event);
      
      expect(normalized.type).to.equal('user.login');
      expect(normalized.metadata.original.type).to.equal('login');
    });
  });
});

describe('ContextService Unit Tests', () => {
  let contextService;
  let logger;
  
  beforeEach(async () => {
    logger = {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub()
    };
    
    contextService = new ContextService(logger);
    await contextService.start();
  });
  
  afterEach(async () => {
    await contextService.stop();
  });
  
  describe('Context Addition', () => {
    it('should add context to event', async () => {
      const event = {
        id: 'test-1',
        type: 'user.login',
        userId: 'user-123',
        sessionId: 'session-456',
        data: {}
      };
      
      const contextualizedEvent = await contextService.addContext(event);
      
      expect(contextualizedEvent).to.have.property('context');
      expect(contextualizedEvent.context).to.have.property('_contextMetadata');
    });
    
    it('should handle events without context identifiers', async () => {
      const event = {
        id: 'test-2',
        type: 'system.info',
        data: { message: 'test' }
      };
      
      const contextualizedEvent = await contextService.addContext(event);
      
      expect(contextualizedEvent).to.have.property('context');
    });
  });
});