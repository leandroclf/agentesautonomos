/**
 * Validation Middleware - Message Schema Registry
 * Middleware para validação de entrada e sanitização de dados
 */

const { body, param, query, validationResult } = require('express-validator');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { getLogger } = require('./logging');

const logger = getLogger();

/**
 * Configuração do AJV para validação de schemas
 */
const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
  strict: false
});

// Adicionar formatos padrão (date, email, etc.)
addFormats(ajv);

/**
 * Schemas de validação comuns
 */
const commonSchemas = {
  // Schema para ID de subject
  subjectId: {
    type: 'string',
    pattern: '^[a-zA-Z0-9._-]+$',
    minLength: 1,
    maxLength: 255
  },
  
  // Schema para versão
  version: {
    type: 'integer',
    minimum: 1,
    maximum: 999999
  },
  
  // Schema para tipo de compatibilidade
  compatibilityType: {
    type: 'string',
    enum: ['BACKWARD', 'BACKWARD_TRANSITIVE', 'FORWARD', 'FORWARD_TRANSITIVE', 'FULL', 'FULL_TRANSITIVE', 'NONE']
  },
  
  // Schema para formato de schema
  schemaFormat: {
    type: 'string',
    enum: ['AVRO', 'JSON', 'PROTOBUF']
  },
  
  // Schema para paginação
  pagination: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        default: 50
      },
      sort: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'asc'
      },
      sortBy: {
        type: 'string',
        enum: ['subject', 'version', 'createdAt', 'updatedAt'],
        default: 'subject'
      }
    },
    additionalProperties: false
  }
};

/**
 * Schemas para validação de requests
 */
const requestSchemas = {
  // Registro de schema
  registerSchema: {
    type: 'object',
    properties: {
      subject: commonSchemas.subjectId,
      schema: {
        type: 'string',
        minLength: 1,
        maxLength: 1000000 // 1MB
      },
      schemaType: commonSchemas.schemaFormat,
      references: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            subject: commonSchemas.subjectId,
            version: commonSchemas.version
          },
          required: ['name', 'subject', 'version'],
          additionalProperties: false
        },
        maxItems: 100
      },
      metadata: {
        type: 'object',
        properties: {
          description: { type: 'string', maxLength: 1000 },
          tags: {
            type: 'array',
            items: { type: 'string', maxLength: 50 },
            maxItems: 20
          },
          owner: { type: 'string', maxLength: 100 },
          documentation: { type: 'string', format: 'uri' }
        },
        additionalProperties: false
      }
    },
    required: ['subject', 'schema', 'schemaType'],
    additionalProperties: false
  },
  
  // Atualização de schema
  updateSchema: {
    type: 'object',
    properties: {
      schema: {
        type: 'string',
        minLength: 1,
        maxLength: 1000000
      },
      schemaType: commonSchemas.schemaFormat,
      references: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            subject: commonSchemas.subjectId,
            version: commonSchemas.version
          },
          required: ['name', 'subject', 'version'],
          additionalProperties: false
        },
        maxItems: 100
      },
      metadata: {
        type: 'object',
        properties: {
          description: { type: 'string', maxLength: 1000 },
          tags: {
            type: 'array',
            items: { type: 'string', maxLength: 50 },
            maxItems: 20
          },
          owner: { type: 'string', maxLength: 100 },
          documentation: { type: 'string', format: 'uri' }
        },
        additionalProperties: false
      }
    },
    required: ['schema'],
    additionalProperties: false
  },
  
  // Validação de mensagem
  validateMessage: {
    type: 'object',
    properties: {
      subject: commonSchemas.subjectId,
      version: commonSchemas.version,
      message: {
        type: 'object'
      },
      schemaId: {
        type: 'integer',
        minimum: 1
      }
    },
    oneOf: [
      { required: ['subject', 'message'] },
      { required: ['schemaId', 'message'] }
    ],
    additionalProperties: false
  },
  
  // Validação em lote
  validateBatch: {
    type: 'object',
    properties: {
      subject: commonSchemas.subjectId,
      version: commonSchemas.version,
      messages: {
        type: 'array',
        items: { type: 'object' },
        minItems: 1,
        maxItems: 1000
      },
      schemaId: {
        type: 'integer',
        minimum: 1
      },
      stopOnFirstError: {
        type: 'boolean',
        default: false
      }
    },
    oneOf: [
      { required: ['subject', 'messages'] },
      { required: ['schemaId', 'messages'] }
    ],
    additionalProperties: false
  },
  
  // Teste de compatibilidade
  testCompatibility: {
    type: 'object',
    properties: {
      schema: {
        type: 'string',
        minLength: 1,
        maxLength: 1000000
      },
      schemaType: commonSchemas.schemaFormat,
      references: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            subject: commonSchemas.subjectId,
            version: commonSchemas.version
          },
          required: ['name', 'subject', 'version'],
          additionalProperties: false
        },
        maxItems: 100
      }
    },
    required: ['schema'],
    additionalProperties: false
  },
  
  // Configuração de compatibilidade
  compatibilityConfig: {
    type: 'object',
    properties: {
      compatibility: commonSchemas.compatibilityType
    },
    required: ['compatibility'],
    additionalProperties: false
  }
};

/**
 * Middleware para validação de entrada usando express-validator
 */
const createValidationRules = (schema) => {
  const rules = [];
  
  // Adicionar regras baseadas no schema
  if (schema.properties) {
    Object.entries(schema.properties).forEach(([field, fieldSchema]) => {
      if (fieldSchema.type === 'string') {
        let rule = body(field);
        
        if (schema.required && schema.required.includes(field)) {
          rule = rule.notEmpty().withMessage(`${field} is required`);
        }
        
        if (fieldSchema.minLength) {
          rule = rule.isLength({ min: fieldSchema.minLength })
            .withMessage(`${field} must be at least ${fieldSchema.minLength} characters`);
        }
        
        if (fieldSchema.maxLength) {
          rule = rule.isLength({ max: fieldSchema.maxLength })
            .withMessage(`${field} must be at most ${fieldSchema.maxLength} characters`);
        }
        
        if (fieldSchema.pattern) {
          rule = rule.matches(new RegExp(fieldSchema.pattern))
            .withMessage(`${field} format is invalid`);
        }
        
        if (fieldSchema.enum) {
          rule = rule.isIn(fieldSchema.enum)
            .withMessage(`${field} must be one of: ${fieldSchema.enum.join(', ')}`);
        }
        
        rules.push(rule);
      }
      
      if (fieldSchema.type === 'integer') {
        let rule = body(field);
        
        if (schema.required && schema.required.includes(field)) {
          rule = rule.notEmpty().withMessage(`${field} is required`);
        }
        
        rule = rule.isInt().withMessage(`${field} must be an integer`);
        
        if (fieldSchema.minimum !== undefined) {
          rule = rule.isInt({ min: fieldSchema.minimum })
            .withMessage(`${field} must be at least ${fieldSchema.minimum}`);
        }
        
        if (fieldSchema.maximum !== undefined) {
          rule = rule.isInt({ max: fieldSchema.maximum })
            .withMessage(`${field} must be at most ${fieldSchema.maximum}`);
        }
        
        rules.push(rule);
      }
    });
  }
  
  return rules;
};

/**
 * Middleware para validação de parâmetros de rota
 */
const validateParams = {
  subject: param('subject')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Subject must contain only alphanumeric characters, dots, underscores, and hyphens')
    .isLength({ min: 1, max: 255 })
    .withMessage('Subject must be between 1 and 255 characters'),
    
  version: param('version')
    .isInt({ min: 1, max: 999999 })
    .withMessage('Version must be an integer between 1 and 999999'),
    
  schemaId: param('schemaId')
    .isInt({ min: 1 })
    .withMessage('Schema ID must be a positive integer')
};

/**
 * Middleware para validação de query parameters
 */
const validateQuery = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
      
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
      
    query('sort')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort must be either asc or desc'),
      
    query('sortBy')
      .optional()
      .isIn(['subject', 'version', 'createdAt', 'updatedAt'])
      .withMessage('SortBy must be one of: subject, version, createdAt, updatedAt')
  ],
  
  deleted: query('deleted')
    .optional()
    .isBoolean()
    .withMessage('Deleted must be a boolean value'),
    
  latest: query('latest')
    .optional()
    .isBoolean()
    .withMessage('Latest must be a boolean value')
};

/**
 * Middleware para processar erros de validação
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));
    
    req.logger?.warn('Validation failed', {
      errors: formattedErrors,
      path: req.path,
      method: req.method,
      body: req.body,
      params: req.params,
      query: req.query
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formattedErrors
    });
  }
  
  next();
};

/**
 * Middleware para validação usando AJV
 */
const validateWithAjv = (schema) => {
  const validate = ajv.compile(schema);
  
  return (req, res, next) => {
    const valid = validate(req.body);
    
    if (!valid) {
      const errors = validate.errors.map(error => ({
        field: error.instancePath.replace('/', '') || error.params?.missingProperty,
        message: error.message,
        value: error.data,
        allowedValues: error.params?.allowedValues
      }));
      
      req.logger?.warn('AJV validation failed', {
        errors,
        path: req.path,
        method: req.method,
        body: req.body
      });
      
      return res.status(400).json({
        success: false,
        error: 'Schema validation failed',
        details: errors
      });
    }
    
    next();
  };
};

/**
 * Middleware para sanitização de dados
 */
const sanitizeInput = (req, res, next) => {
  // Sanitizar strings no body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitizar query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

/**
 * Função para sanitizar objeto recursivamente
 */
const sanitizeObject = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(item => 
      typeof item === 'object' && item !== null ? sanitizeObject(item) : sanitizeValue(item)
    );
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = sanitizeValue(value);
      }
    }
    
    return sanitized;
  }
  
  return sanitizeValue(obj);
};

/**
 * Função para sanitizar valor individual
 */
const sanitizeValue = (value) => {
  if (typeof value === 'string') {
    // Remover caracteres de controle
    return value.replace(/[\x00-\x1F\x7F]/g, '')
                .trim();
  }
  
  return value;
};

/**
 * Middleware para validação de content-type
 */
const validateContentType = (expectedTypes = ['application/json']) => {
  return (req, res, next) => {
    const contentType = req.get('Content-Type');
    
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      if (!contentType || !expectedTypes.some(type => contentType.includes(type))) {
        return res.status(415).json({
          success: false,
          error: 'Unsupported Media Type',
          message: `Content-Type must be one of: ${expectedTypes.join(', ')}`,
          received: contentType
        });
      }
    }
    
    next();
  };
};

/**
 * Middleware para validação de tamanho do body
 */
const validateBodySize = (maxSize = 10 * 1024 * 1024) => { // 10MB default
  return (req, res, next) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      return res.status(413).json({
        success: false,
        error: 'Payload Too Large',
        message: `Request body size exceeds maximum allowed size of ${maxSize} bytes`,
        received: contentLength
      });
    }
    
    next();
  };
};

/**
 * Validações específicas para diferentes endpoints
 */
const validations = {
  // Schema routes
  registerSchema: [
    validateContentType(),
    validateBodySize(),
    validateWithAjv(requestSchemas.registerSchema),
    handleValidationErrors
  ],
  
  updateSchema: [
    validateParams.subject,
    validateParams.version,
    validateContentType(),
    validateBodySize(),
    validateWithAjv(requestSchemas.updateSchema),
    handleValidationErrors
  ],
  
  getSchema: [
    validateParams.subject,
    validateParams.version,
    handleValidationErrors
  ],
  
  deleteSchema: [
    validateParams.subject,
    validateParams.version,
    handleValidationErrors
  ],
  
  listSchemas: [
    ...validateQuery.pagination,
    validateQuery.deleted,
    handleValidationErrors
  ],
  
  // Validation routes
  validateMessage: [
    validateContentType(),
    validateBodySize(),
    validateWithAjv(requestSchemas.validateMessage),
    handleValidationErrors
  ],
  
  validateBatch: [
    validateContentType(),
    validateBodySize(50 * 1024 * 1024), // 50MB para batch
    validateWithAjv(requestSchemas.validateBatch),
    handleValidationErrors
  ],
  
  // Compatibility routes
  testCompatibility: [
    validateParams.subject,
    validateParams.version,
    validateContentType(),
    validateBodySize(),
    validateWithAjv(requestSchemas.testCompatibility),
    handleValidationErrors
  ],
  
  updateCompatibility: [
    validateContentType(),
    validateWithAjv(requestSchemas.compatibilityConfig),
    handleValidationErrors
  ],
  
  // Common validations
  subjectParam: [
    validateParams.subject,
    handleValidationErrors
  ],
  
  versionParam: [
    validateParams.version,
    handleValidationErrors
  ],
  
  schemaIdParam: [
    validateParams.schemaId,
    handleValidationErrors
  ]
};

module.exports = {
  validations,
  validateParams,
  validateQuery,
  handleValidationErrors,
  validateWithAjv,
  sanitizeInput,
  validateContentType,
  validateBodySize,
  requestSchemas,
  commonSchemas
};