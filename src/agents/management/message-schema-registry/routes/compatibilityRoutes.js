/**
 * Compatibility Routes - Message Schema Registry
 * Rotas para gerenciamento de compatibilidade entre esquemas
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

/**
 * Middleware para validação de erros
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * Middleware para injeção de serviços
 */
const injectServices = (req, res, next) => {
  if (!req.compatibilityService) {
    return res.status(500).json({
      success: false,
      error: 'Compatibility service not available'
    });
  }
  next();
};

/**
 * GET /api/v1/compatibility/config
 * Obtém configuração global de compatibilidade
 */
router.get('/config',
  injectServices,
  async (req, res) => {
    try {
      const config = await req.compatibilityService.getGlobalConfig();

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      req.logger?.error('Error getting compatibility config:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get compatibility config',
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/v1/compatibility/config
 * Atualiza configuração global de compatibilidade
 */
router.put('/config',
  [
    body('compatibility').isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility level'),
    body('checkTransitivity').optional().isBoolean().withMessage('CheckTransitivity must be a boolean'),
    body('allowBreakingChanges').optional().isBoolean().withMessage('AllowBreakingChanges must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const config = await req.compatibilityService.updateGlobalConfig(req.body);

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_compatibility_config_updates_total');
      }

      // Log de auditoria
      if (req.logger) {
        req.logger.info('Global compatibility config updated', {
          newConfig: req.body,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: config,
        message: 'Compatibility config updated successfully'
      });
    } catch (error) {
      req.logger?.error('Error updating compatibility config:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to update compatibility config',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/compatibility/subjects/:subject
 * Obtém configuração de compatibilidade para um subject específico
 */
router.get('/subjects/:subject',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const config = await req.compatibilityService.getSubjectConfig(subject);

      res.json({
        success: true,
        data: {
          subject,
          ...config
        }
      });
    } catch (error) {
      req.logger?.error('Error getting subject compatibility config:', error);

      const statusCode = error.name === 'SubjectNotFoundError' ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to get subject compatibility config',
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/v1/compatibility/subjects/:subject
 * Atualiza configuração de compatibilidade para um subject específico
 */
router.put('/subjects/:subject',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required'),
    body('compatibility').isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility level'),
    body('checkTransitivity').optional().isBoolean().withMessage('CheckTransitivity must be a boolean'),
    body('allowBreakingChanges').optional().isBoolean().withMessage('AllowBreakingChanges must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const config = await req.compatibilityService.updateSubjectConfig(subject, req.body);

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_subject_compatibility_config_updates_total', { subject });
      }

      res.json({
        success: true,
        data: {
          subject,
          ...config
        },
        message: 'Subject compatibility config updated successfully'
      });
    } catch (error) {
      req.logger?.error('Error updating subject compatibility config:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to update subject compatibility config',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/v1/compatibility/subjects/:subject
 * Remove configuração específica de compatibilidade (volta para global)
 */
router.delete('/subjects/:subject',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      await req.compatibilityService.deleteSubjectConfig(subject);

      res.json({
        success: true,
        message: 'Subject compatibility config deleted successfully',
        subject
      });
    } catch (error) {
      req.logger?.error('Error deleting subject compatibility config:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to delete subject compatibility config',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/v1/compatibility/test
 * Testa compatibilidade entre dois esquemas
 */
router.post('/test',
  [
    body('subject').isString().notEmpty().withMessage('Subject is required'),
    body('version').optional().isString().withMessage('Version must be a string'),
    body('schema').isObject().withMessage('Schema must be an object'),
    body('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility level')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        subject,
        version = 'latest',
        schema,
        compatibility
      } = req.body;

      const startTime = Date.now();

      const result = await req.compatibilityService.testCompatibility({
        subject,
        version,
        schema,
        compatibility
      });

      const testTime = Date.now() - startTime;

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_compatibility_tests_total', {
          subject,
          compatible: result.compatible.toString(),
          compatibility: result.compatibility
        });
        req.metricsService.recordHistogram('msr_compatibility_test_duration_ms', testTime, {
          subject,
          compatibility: result.compatibility
        });
      }

      res.json({
        success: true,
        data: {
          compatible: result.compatible,
          subject,
          version: result.version,
          compatibility: result.compatibility,
          issues: result.issues || [],
          testTime,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error testing compatibility:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_compatibility_test_errors_total', {
          subject: req.body.subject
        });
      }

      const statusCode = error.name === 'SchemaNotFoundError' ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Compatibility test failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/compatibility/test/batch
 * Testa compatibilidade em lote
 */
router.post('/test/batch',
  [
    body('tests').isArray({ min: 1, max: 50 }).withMessage('Tests must be an array with 1-50 items'),
    body('tests.*.subject').isString().notEmpty().withMessage('Subject is required for each test'),
    body('tests.*.schema').isObject().withMessage('Schema must be an object for each test'),
    body('tests.*.version').optional().isString().withMessage('Version must be a string'),
    body('tests.*.compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility level'),
    body('continueOnError').optional().isBoolean().withMessage('ContinueOnError must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { tests, continueOnError = true } = req.body;
      const startTime = Date.now();

      const results = await req.compatibilityService.testBatchCompatibility(tests, {
        continueOnError
      });

      const totalTime = Date.now() - startTime;
      const compatibleCount = results.filter(r => r.compatible).length;
      const incompatibleCount = results.length - compatibleCount;

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_batch_compatibility_tests_total');
        req.metricsService.recordHistogram('msr_batch_compatibility_test_duration_ms', totalTime);
        req.metricsService.recordGauge('msr_batch_compatibility_test_size', results.length);
      }

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            compatible: compatibleCount,
            incompatible: incompatibleCount,
            testTime: totalTime,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      req.logger?.error('Error in batch compatibility test:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_batch_compatibility_test_errors_total');
      }

      res.status(500).json({
        success: false,
        error: 'Batch compatibility test failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * GET /api/v1/compatibility/subjects/:subject/versions
 * Lista versões compatíveis de um subject
 */
router.get('/subjects/:subject/versions',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required'),
    query('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility level'),
    query('includeDeprecated').optional().isBoolean().withMessage('IncludeDeprecated must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const { compatibility, includeDeprecated = false } = req.query;

      const versions = await req.compatibilityService.getCompatibleVersions(subject, {
        compatibility,
        includeDeprecated
      });

      res.json({
        success: true,
        data: {
          subject,
          versions,
          compatibility,
          includeDeprecated,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error getting compatible versions:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get compatible versions',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/compatibility/matrix
 * Obtém matriz de compatibilidade entre subjects
 */
router.get('/matrix',
  [
    query('subjects').optional().isString().withMessage('Subjects must be a comma-separated string'),
    query('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility level'),
    query('format').optional().isIn(['json', 'csv']).withMessage('Invalid format')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        subjects,
        compatibility,
        format = 'json'
      } = req.query;

      const subjectList = subjects ? subjects.split(',').map(s => s.trim()) : null;

      const matrix = await req.compatibilityService.getCompatibilityMatrix({
        subjects: subjectList,
        compatibility
      });

      if (format === 'csv') {
        const csv = req.compatibilityService.formatMatrixAsCSV(matrix);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="compatibility-matrix.csv"');
        return res.send(csv);
      }

      res.json({
        success: true,
        data: {
          matrix,
          compatibility,
          subjects: subjectList,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error getting compatibility matrix:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get compatibility matrix',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/compatibility/report/:subject
 * Gera relatório detalhado de compatibilidade
 */
router.get('/report/:subject',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required'),
    query('fromVersion').optional().isString().withMessage('FromVersion must be a string'),
    query('toVersion').optional().isString().withMessage('ToVersion must be a string'),
    query('includeDetails').optional().isBoolean().withMessage('IncludeDetails must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const {
        fromVersion,
        toVersion,
        includeDetails = true
      } = req.query;

      const report = await req.compatibilityService.generateCompatibilityReport(subject, {
        fromVersion,
        toVersion,
        includeDetails
      });

      res.json({
        success: true,
        data: {
          subject,
          report,
          fromVersion,
          toVersion,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error generating compatibility report:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to generate compatibility report',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/compatibility/stats
 * Obtém estatísticas de compatibilidade
 */
router.get('/stats',
  [
    query('period').optional().isIn(['1h', '24h', '7d', '30d']).withMessage('Invalid period'),
    query('subject').optional().isString().withMessage('Subject must be a string'),
    query('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility level')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        period = '24h',
        subject,
        compatibility
      } = req.query;

      const stats = await req.compatibilityService.getCompatibilityStats({
        period,
        subject,
        compatibility
      });

      res.json({
        success: true,
        data: {
          stats,
          period,
          subject,
          compatibility,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error getting compatibility stats:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get compatibility stats',
        message: error.message
      });
    }
  }
);

module.exports = router;