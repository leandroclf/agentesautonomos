/**
 * Schema Routes - Message Schema Registry
 * Rotas RESTful para gerenciamento de esquemas
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
  if (!req.schemaService) {
    return res.status(500).json({
      success: false,
      error: 'Schema service not available'
    });
  }
  next();
};

/**
 * GET /api/v1/schemas
 * Lista todos os esquemas com paginação e filtros
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('subject').optional().isString().withMessage('Subject must be a string'),
    query('format').optional().isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid format'),
    query('version').optional().isString().withMessage('Version must be a string'),
    query('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility'),
    query('status').optional().isIn(['active', 'deprecated', 'disabled']).withMessage('Invalid status')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        subject,
        format,
        version,
        compatibility,
        status
      } = req.query;

      const filters = {};
      if (subject) filters.subject = subject;
      if (format) filters.format = format;
      if (version) filters.version = version;
      if (compatibility) filters.compatibility = compatibility;
      if (status) filters.status = status;

      const result = await req.schemaService.listSchemas({
        page: parseInt(page),
        limit: parseInt(limit),
        filters
      });

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_list_requests_total');
      }

      res.json({
        success: true,
        data: result.schemas,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          pages: Math.ceil(result.total / parseInt(limit))
        }
      });
    } catch (error) {
      req.logger?.error('Error listing schemas:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_list_errors_total');
      }

      res.status(500).json({
        success: false,
        error: 'Failed to list schemas',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/schemas/:subject
 * Obtém informações de um esquema específico
 */
router.get('/:subject',
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

      const schema = await req.schemaService.getSchema(subject, version);
      
      if (!schema) {
        return res.status(404).json({
          success: false,
          error: 'Schema not found',
          subject,
          version
        });
      }

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_get_requests_total', { subject });
      }

      res.json({
        success: true,
        data: schema
      });
    } catch (error) {
      req.logger?.error('Error getting schema:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_get_errors_total', { subject: req.params.subject });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get schema',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/v1/schemas
 * Registra um novo esquema
 */
router.post('/',
  [
    body('subject').isString().notEmpty().withMessage('Subject is required'),
    body('schema').isObject().withMessage('Schema must be an object'),
    body('format').isIn(['json-schema', 'avro', 'protobuf']).withMessage('Invalid format'),
    body('version').optional().isString().withMessage('Version must be a string'),
    body('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const {
        subject,
        schema,
        format,
        version,
        compatibility,
        description,
        tags,
        metadata
      } = req.body;

      const registrationData = {
        subject,
        schema,
        format,
        version,
        compatibility,
        description,
        tags,
        metadata
      };

      const result = await req.schemaService.registerSchema(registrationData);

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_registrations_total', { subject, format });
      }

      // Enviar alerta de sucesso
      if (req.alertService) {
        await req.alertService.createAlert({
          type: 'Schema Registration Success',
          severity: 'info',
          message: `Schema ${subject} v${result.version} registered successfully`,
          metadata: { subject, version: result.version, format }
        });
      }

      res.status(201).json({
        success: true,
        data: result,
        message: 'Schema registered successfully'
      });
    } catch (error) {
      req.logger?.error('Error registering schema:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_registration_errors_total', { 
          subject: req.body.subject,
          format: req.body.format 
        });
      }

      // Enviar alerta de erro
      if (req.alertService) {
        await req.alertService.createAlert({
          type: 'Schema Registration Failed',
          severity: 'error',
          message: `Failed to register schema ${req.body.subject}: ${error.message}`,
          metadata: { subject: req.body.subject, error: error.message }
        });
      }

      const statusCode = error.name === 'ValidationError' ? 400 : 
                        error.name === 'CompatibilityError' ? 409 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to register schema',
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/v1/schemas/:subject
 * Atualiza um esquema existente
 */
router.put('/:subject',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required'),
    body('schema').isObject().withMessage('Schema must be an object'),
    body('version').optional().isString().withMessage('Version must be a string'),
    body('compatibility').optional().isIn(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).withMessage('Invalid compatibility'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const updateData = req.body;

      const result = await req.schemaService.updateSchema(subject, updateData);

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_updates_total', { subject });
      }

      res.json({
        success: true,
        data: result,
        message: 'Schema updated successfully'
      });
    } catch (error) {
      req.logger?.error('Error updating schema:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_update_errors_total', { subject: req.params.subject });
      }

      const statusCode = error.name === 'ValidationError' ? 400 : 
                        error.name === 'CompatibilityError' ? 409 : 
                        error.name === 'NotFoundError' ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to update schema',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/v1/schemas/:subject
 * Remove um esquema
 */
router.delete('/:subject',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required'),
    query('version').optional().isString().withMessage('Version must be a string'),
    query('force').optional().isBoolean().withMessage('Force must be a boolean')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const { version, force = false } = req.query;

      const result = await req.schemaService.deleteSchema(subject, version, force);

      // Atualizar métricas
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_deletions_total', { subject });
      }

      res.json({
        success: true,
        data: result,
        message: 'Schema deleted successfully'
      });
    } catch (error) {
      req.logger?.error('Error deleting schema:', error);
      
      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_schema_deletion_errors_total', { subject: req.params.subject });
      }

      const statusCode = error.name === 'NotFoundError' ? 404 : 
                        error.name === 'ConflictError' ? 409 : 500;

      res.status(statusCode).json({
        success: false,
        error: 'Failed to delete schema',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/schemas/:subject/versions
 * Lista todas as versões de um esquema
 */
router.get('/:subject/versions',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;

      const versions = await req.schemaService.getSchemaVersions(subject);

      res.json({
        success: true,
        data: versions
      });
    } catch (error) {
      req.logger?.error('Error getting schema versions:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get schema versions',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/schemas/:subject/latest
 * Obtém a versão mais recente de um esquema
 */
router.get('/:subject/latest',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;

      const schema = await req.schemaService.getLatestSchema(subject);
      
      if (!schema) {
        return res.status(404).json({
          success: false,
          error: 'Schema not found',
          subject
        });
      }

      res.json({
        success: true,
        data: schema
      });
    } catch (error) {
      req.logger?.error('Error getting latest schema:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get latest schema',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/v1/schemas/:subject/deprecate
 * Deprecia um esquema
 */
router.post('/:subject/deprecate',
  [
    param('subject').isString().notEmpty().withMessage('Subject is required'),
    body('version').optional().isString().withMessage('Version must be a string'),
    body('reason').optional().isString().withMessage('Reason must be a string')
  ],
  handleValidationErrors,
  injectServices,
  async (req, res) => {
    try {
      const { subject } = req.params;
      const { version, reason } = req.body;

      const result = await req.schemaService.deprecateSchema(subject, version, reason);

      res.json({
        success: true,
        data: result,
        message: 'Schema deprecated successfully'
      });
    } catch (error) {
      req.logger?.error('Error deprecating schema:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to deprecate schema',
        message: error.message
      });
    }
  }
);

module.exports = router;