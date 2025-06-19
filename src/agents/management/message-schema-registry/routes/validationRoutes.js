/**
 * Validation Routes - Message Schema Registry
 * Rotas para validação de mensagens contra esquemas
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
  if (!req.validationService) {
    return res.status(500).json({
      success: false,
      error: 'Validation service not available'
    });
  }
  next();
};

/**
 * POST /api/v1/validate
 * Valida uma mensagem contra um esquema específico
 */
router.post('/',
  [
    body('subject').isString().notEmpty().withMessage('Subject is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('version').optional().isString().withMessage('Version must be a string'),
    body('format').optional().isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid format'),
    body('strict').optional().isBoolean().withMessage('Strict must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        subject,
        message,
        version = 'latest',
        format,
        strict = false
      } = req.body;

      const startTime = Date.now();

      const validationResult = await req.validationService.validateMessage({
        subject,
        message,
        version,
        format,
        strict
      });

      const validationTime = Date.now() - startTime;

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_validation_requests_total', {
          subject,
          version,
          valid: validationResult.valid.toString()
        });
        req.metricsService.recordHistogram('msr_validation_duration_ms', validationTime, {
          subject,
          version
        });
      }

      // Log de auditoria
      if (req.logger) {
        req.logger.info('Message validation performed', {
          subject,
          version,
          valid: validationResult.valid,
          validationTime,
          errorCount: validationResult.errors?.length || 0
        });
      }

      const response = {
        success: true,
        data: {
          valid: validationResult.valid,
          subject,
          version: validationResult.version,
          format: validationResult.format,
          validationTime,
          timestamp: new Date().toISOString()
        }
      };

      if (!validationResult.valid) {
        response.data.errors = validationResult.errors;
        response.data.warnings = validationResult.warnings;
      }

      if (validationResult.warnings && validationResult.warnings.length > 0) {
        response.data.warnings = validationResult.warnings;
      }

      res.json(response);
    } catch (error) {
      req.logger?.error('Error validating message:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_validation_errors_total', {
          subject: req.body.subject,
          error_type: error.name || 'unknown'
        });
      }

      const statusCode = error.name === 'SchemaNotFoundError' ? 404 : 
                        error.name === 'ValidationError' ? 400 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Validation failed',
        message: error.message,
        subject: req.body.subject,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/validate/batch
 * Valida múltiplas mensagens em lote
 */
router.post('/batch',
  [
    body('validations').isArray({ min: 1, max: 100 }).withMessage('Validations must be an array with 1-100 items'),
    body('validations.*.subject').isString().notEmpty().withMessage('Subject is required for each validation'),
    body('validations.*.message').notEmpty().withMessage('Message is required for each validation'),
    body('validations.*.version').optional().isString().withMessage('Version must be a string'),
    body('validations.*.format').optional().isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid format'),
    body('continueOnError').optional().isBoolean().withMessage('ContinueOnError must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { validations, continueOnError = true } = req.body;
      const startTime = Date.now();

      const results = await req.validationService.validateBatch(validations, {
        continueOnError
      });

      const totalTime = Date.now() - startTime;
      const validCount = results.filter(r => r.valid).length;
      const invalidCount = results.length - validCount;

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_batch_validation_requests_total');
        req.metricsService.recordHistogram('msr_batch_validation_duration_ms', totalTime);
        req.metricsService.recordGauge('msr_batch_validation_size', results.length);
        req.metricsService.recordGauge('msr_batch_validation_valid_count', validCount);
        req.metricsService.recordGauge('msr_batch_validation_invalid_count', invalidCount);
      }

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            valid: validCount,
            invalid: invalidCount,
            validationTime: totalTime,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      req.logger?.error('Error in batch validation:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_batch_validation_errors_total');
      }

      res.status(500).json({
        success: false,
        error: 'Batch validation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/validate/compatibility
 * Verifica compatibilidade entre esquemas
 */
router.post('/compatibility',
  [
    body('subject').isString().notEmpty().withMessage('Subject is required'),
    body('newSchema').isObject().withMessage('New schema must be an object'),
    body('version').optional().isString().withMessage('Version must be a string'),
    body('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        subject,
        newSchema,
        version = 'latest',
        compatibility
      } = req.body;

      const compatibilityResult = await req.validationService.checkCompatibility({
        subject,
        newSchema,
        version,
        compatibility
      });

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_compatibility_checks_total', {
          subject,
          compatible: compatibilityResult.compatible.toString()
        });
      }

      res.json({
        success: true,
        data: {
          compatible: compatibilityResult.compatible,
          subject,
          version: compatibilityResult.version,
          compatibility: compatibilityResult.compatibility,
          issues: compatibilityResult.issues || [],
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error checking compatibility:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_compatibility_check_errors_total', {
          subject: req.body.subject
        });
      }

      res.status(500).json({
        success: false,
        error: 'Compatibility check failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * GET /api/v1/validate/schema/:subject
 * Valida a estrutura de um esquema registrado
 */
router.get('/schema/:subject',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required'),
    query('version').optional().isString().withMessage('Version must be a string')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const { version = 'latest' } = req.query;

      const schemaValidation = await req.validationService.validateSchema(subject, version);

      res.json({
        success: true,
        data: {
          valid: schemaValidation.valid,
          subject,
          version: schemaValidation.version,
          format: schemaValidation.format,
          issues: schemaValidation.issues || [],
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error validating schema:', error);

      const statusCode = error.name === 'SchemaNotFoundError' ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Schema validation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/validate/transform
 * Valida e transforma uma mensagem entre formatos
 */
router.post('/transform',
  [
    body('subject').isString().notEmpty().withMessage('Subject is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('sourceFormat').isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid source format'),
    body('targetFormat').isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid target format'),
    body('version').optional().isString().withMessage('Version must be a string')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        subject,
        message,
        sourceFormat,
        targetFormat,
        version = 'latest'
      } = req.body;

      const transformResult = await req.validationService.transformMessage({
        subject,
        message,
        sourceFormat,
        targetFormat,
        version
      });

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_transform_requests_total', {
          subject,
          sourceFormat,
          targetFormat,
          success: transformResult.success.toString()
        });
      }

      res.json({
        success: true,
        data: {
          transformed: transformResult.success,
          subject,
          version: transformResult.version,
          sourceFormat,
          targetFormat,
          transformedMessage: transformResult.transformedMessage,
          warnings: transformResult.warnings || [],
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error transforming message:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_transform_errors_total', {
          subject: req.body.subject,
          sourceFormat: req.body.sourceFormat,
          targetFormat: req.body.targetFormat
        });
      }

      res.status(500).json({
        success: false,
        error: 'Message transformation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * GET /api/v1/validate/stats
 * Obtém estatísticas de validação
 */
router.get('/stats',
  [
    query('subject').optional().isString().withMessage('Subject must be a string'),
    query('period').optional().isIn(['1h', '24h', '7d', '30d']).withMessage('Invalid period'),
    query('format').optional().isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid format')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject, period = '24h', format } = req.query;

      const stats = await req.validationService.getValidationStats({
        subject,
        period,
        format
      });

      res.json({
        success: true,
        data: {
          stats,
          period,
          subject,
          format,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error getting validation stats:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get validation stats',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/validate/dry-run
 * Executa uma validação de teste sem persistir resultados
 */
router.post('/dry-run',
  [
    body('subject').isString().notEmpty().withMessage('Subject is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('schema').isObject().withMessage('Schema must be an object'),
    body('format').isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid format'),
    body('strict').optional().isBoolean().withMessage('Strict must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        subject,
        message,
        schema,
        format,
        strict = false
      } = req.body;

      const validationResult = await req.validationService.dryRunValidation({
        subject,
        message,
        schema,
        format,
        strict
      });

      res.json({
        success: true,
        data: {
          valid: validationResult.valid,
          subject,
          format,
          errors: validationResult.errors || [],
          warnings: validationResult.warnings || [],
          dryRun: true,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error in dry-run validation:', error);

      res.status(500).json({
        success: false,
        error: 'Dry-run validation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

module.exports = router;