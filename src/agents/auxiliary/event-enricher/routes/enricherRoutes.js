/**
 * Event Enricher Routes
 * Rotas para gerenciamento e monitoramento do Event Enricher Agent
 */

const express = require('express');
const router = express.Router();

// Middleware para validação de autenticação (se necessário)
const authMiddleware = (req, res, next) => {
  // Implementar validação de autenticação se necessário
  next();
};

// Middleware para validação de entrada
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};

module.exports = (enrichmentService, contextService, validationService, normalizationService, logger) => {
  
  // Health check
  router.get('/health', (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          enrichment: enrichmentService.isRunning,
          context: contextService.isRunning,
          validation: validationService.isRunning,
          normalization: normalizationService.isRunning
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
        agent: 'event-enricher',
        status: 'running',
        timestamp: new Date().toISOString(),
        services: {
          enrichment: {
            running: enrichmentService.isRunning,
            stats: enrichmentService.getStats()
          },
          context: {
            running: contextService.isRunning,
            stats: contextService.getStats()
          },
          validation: {
            running: validationService.isRunning,
            stats: validationService.getStats()
          },
          normalization: {
            running: normalizationService.isRunning,
            stats: normalizationService.getStats()
          }
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          nodeVersion: process.version,
          platform: process.platform
        }
      };
      
      res.json(status);
      
    } catch (error) {
      logger.error('Status check failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to get status',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Estatísticas consolidadas
  router.get('/stats', (req, res) => {
    try {
      const stats = {
        enrichment: enrichmentService.getStats(),
        context: contextService.getStats(),
        validation: validationService.getStats(),
        normalization: normalizationService.getStats(),
        timestamp: new Date().toISOString()
      };
      
      res.json(stats);
      
    } catch (error) {
      logger.error('Stats retrieval failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Configurações de validação
  router.get('/validation/schemas', (req, res) => {
    try {
      const schemas = validationService.getSchemas();
      res.json({
        schemas: schemas,
        count: schemas.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to get validation schemas', { error: error.message });
      res.status(500).json({
        error: 'Failed to get validation schemas',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Mapeamentos de normalização
  router.get('/normalization/mappings', (req, res) => {
    try {
      const mappings = normalizationService.getMappings();
      res.json({
        mappings: mappings,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to get normalization mappings', { error: error.message });
      res.status(500).json({
        error: 'Failed to get normalization mappings',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Endpoint para enriquecer evento manualmente (para testes)
  router.post('/enrich', async (req, res) => {
    try {
      const event = req.body;
      
      if (!event || typeof event !== 'object') {
        return res.status(400).json({
          error: 'Invalid event data',
          message: 'Event must be a valid object',
          timestamp: new Date().toISOString()
        });
      }
      
      logger.info('Manual enrichment requested', {
        eventId: event.id,
        type: event.type
      });
      
      // Processar evento através do pipeline completo
      const enrichedEvent = await enrichmentService.enrichEvent(event);
      
      res.json({
        success: true,
        original: event,
        enriched: enrichedEvent,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Manual enrichment failed', {
        error: error.message,
        eventId: req.body?.id
      });
      
      res.status(500).json({
        error: 'Enrichment failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Endpoint para validar evento manualmente
  router.post('/validate', async (req, res) => {
    try {
      const event = req.body;
      
      if (!event || typeof event !== 'object') {
        return res.status(400).json({
          error: 'Invalid event data',
          message: 'Event must be a valid object',
          timestamp: new Date().toISOString()
        });
      }
      
      const validationResult = await validationService.validateEvent(event);
      
      res.json({
        ...validationResult,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Manual validation failed', {
        error: error.message,
        eventId: req.body?.id
      });
      
      res.status(500).json({
        error: 'Validation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Endpoint para normalizar evento manualmente
  router.post('/normalize', async (req, res) => {
    try {
      const event = req.body;
      
      if (!event || typeof event !== 'object') {
        return res.status(400).json({
          error: 'Invalid event data',
          message: 'Event must be a valid object',
          timestamp: new Date().toISOString()
        });
      }
      
      const normalizedEvent = await normalizationService.normalizeEvent(event);
      
      res.json({
        success: true,
        original: event,
        normalized: normalizedEvent,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Manual normalization failed', {
        error: error.message,
        eventId: req.body?.id
      });
      
      res.status(500).json({
        error: 'Normalization failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Controle de serviços
  router.post('/services/:service/start', authMiddleware, async (req, res) => {
    try {
      const { service } = req.params;
      let targetService;
      
      switch (service) {
        case 'enrichment':
          targetService = enrichmentService;
          break;
        case 'context':
          targetService = contextService;
          break;
        case 'validation':
          targetService = validationService;
          break;
        case 'normalization':
          targetService = normalizationService;
          break;
        default:
          return res.status(400).json({
            error: 'Invalid service name',
            validServices: ['enrichment', 'context', 'validation', 'normalization'],
            timestamp: new Date().toISOString()
          });
      }
      
      if (targetService.isRunning) {
        return res.status(400).json({
          error: 'Service already running',
          service: service,
          timestamp: new Date().toISOString()
        });
      }
      
      await targetService.start();
      
      logger.info(`Service started manually`, { service });
      
      res.json({
        success: true,
        message: `${service} service started`,
        service: service,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to start service', {
        service: req.params.service,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to start service',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  router.post('/services/:service/stop', authMiddleware, async (req, res) => {
    try {
      const { service } = req.params;
      let targetService;
      
      switch (service) {
        case 'enrichment':
          targetService = enrichmentService;
          break;
        case 'context':
          targetService = contextService;
          break;
        case 'validation':
          targetService = validationService;
          break;
        case 'normalization':
          targetService = normalizationService;
          break;
        default:
          return res.status(400).json({
            error: 'Invalid service name',
            validServices: ['enrichment', 'context', 'validation', 'normalization'],
            timestamp: new Date().toISOString()
          });
      }
      
      if (!targetService.isRunning) {
        return res.status(400).json({
          error: 'Service not running',
          service: service,
          timestamp: new Date().toISOString()
        });
      }
      
      await targetService.stop();
      
      logger.info(`Service stopped manually`, { service });
      
      res.json({
        success: true,
        message: `${service} service stopped`,
        service: service,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to stop service', {
        service: req.params.service,
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to stop service',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Métricas em formato Prometheus
  router.get('/metrics', (req, res) => {
    try {
      const enrichmentStats = enrichmentService.getStats();
      const contextStats = contextService.getStats();
      const validationStats = validationService.getStats();
      const normalizationStats = normalizationService.getStats();
      
      const metrics = [
        `# HELP event_enricher_enrichments_total Total number of enrichments`,
        `# TYPE event_enricher_enrichments_total counter`,
        `event_enricher_enrichments_total{status="success"} ${enrichmentStats.successfulEnrichments}`,
        `event_enricher_enrichments_total{status="failed"} ${enrichmentStats.failedEnrichments}`,
        ``,
        `# HELP event_enricher_validations_total Total number of validations`,
        `# TYPE event_enricher_validations_total counter`,
        `event_enricher_validations_total{status="success"} ${validationStats.successfulValidations}`,
        `event_enricher_validations_total{status="failed"} ${validationStats.failedValidations}`,
        ``,
        `# HELP event_enricher_normalizations_total Total number of normalizations`,
        `# TYPE event_enricher_normalizations_total counter`,
        `event_enricher_normalizations_total{status="success"} ${normalizationStats.successfulNormalizations}`,
        `event_enricher_normalizations_total{status="failed"} ${normalizationStats.failedNormalizations}`,
        ``,
        `# HELP event_enricher_context_lookups_total Total number of context lookups`,
        `# TYPE event_enricher_context_lookups_total counter`,
        `event_enricher_context_lookups_total{status="success"} ${contextStats.successfulLookups}`,
        `event_enricher_context_lookups_total{status="failed"} ${contextStats.failedLookups}`,
        ``,
        `# HELP event_enricher_cache_hits_total Total number of cache hits`,
        `# TYPE event_enricher_cache_hits_total counter`,
        `event_enricher_cache_hits_total ${contextStats.cacheHits}`,
        ``,
        `# HELP event_enricher_cache_misses_total Total number of cache misses`,
        `# TYPE event_enricher_cache_misses_total counter`,
        `event_enricher_cache_misses_total ${contextStats.cacheMisses}`,
        ``,
        `# HELP event_enricher_average_processing_time_ms Average processing time in milliseconds`,
        `# TYPE event_enricher_average_processing_time_ms gauge`,
        `event_enricher_average_processing_time_ms{operation="enrichment"} ${enrichmentStats.averageEnrichmentTime}`,
        `event_enricher_average_processing_time_ms{operation="validation"} ${validationStats.averageValidationTime}`,
        `event_enricher_average_processing_time_ms{operation="normalization"} ${normalizationStats.averageNormalizationTime}`,
        `event_enricher_average_processing_time_ms{operation="context_lookup"} ${contextStats.averageLookupTime}`,
        ``,
        `# HELP event_enricher_service_status Service status (1 = running, 0 = stopped)`,
        `# TYPE event_enricher_service_status gauge`,
        `event_enricher_service_status{service="enrichment"} ${enrichmentService.isRunning ? 1 : 0}`,
        `event_enricher_service_status{service="context"} ${contextService.isRunning ? 1 : 0}`,
        `event_enricher_service_status{service="validation"} ${validationService.isRunning ? 1 : 0}`,
        `event_enricher_service_status{service="normalization"} ${normalizationService.isRunning ? 1 : 0}`,
        ``
      ].join('\n');
      
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
      
    } catch (error) {
      logger.error('Failed to generate metrics', { error: error.message });
      res.status(500).send('# Error generating metrics\n');
    }
  });
  
  // Middleware de tratamento de erros
  router.use((error, req, res, next) => {
    logger.error('Route error', {
      path: req.path,
      method: req.method,
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