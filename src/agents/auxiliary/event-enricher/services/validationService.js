/**
 * Validation Service
 * Serviço responsável por validar e sanitizar eventos
 */

const EventEmitter = require('events');
const Joi = require('joi');
const DOMPurify = require('isomorphic-dompurify');
const config = require('../config/enricherConfig');

class ValidationService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.isRunning = false;
    
    // Schemas de validação
    this.schemas = new Map();
    
    // Estatísticas
    this.stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      sanitizations: 0,
      averageValidationTime: 0
    };
    
    // Configurações
    this.validation = config.validation;
    this.sanitization = config.sanitization;
    
    // Inicializar schemas padrão
    this.initializeSchemas();
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Validation Service already running');
      return;
    }

    this.logger.info('Starting Validation Service');
    
    try {
      this.isRunning = true;
      this.logger.info('Validation Service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Validation Service', {
        error: error.message
      });
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Validation Service not running');
      return;
    }

    this.logger.info('Stopping Validation Service');
    this.isRunning = false;
    
    try {
      this.schemas.clear();
      this.logger.info('Validation Service stopped');
      
    } catch (error) {
      this.logger.error('Error stopping Validation Service', {
        error: error.message
      });
    }
  }

  initializeSchemas() {
    // Schema base para eventos
    const baseEventSchema = Joi.object({
      id: Joi.string().required(),
      type: Joi.string().required(),
      timestamp: Joi.string().isoDate().required(),
      source: Joi.string().required(),
      data: Joi.object().required(),
      metadata: Joi.object().optional(),
      context: Joi.object().optional(),
      userId: Joi.string().optional(),
      sessionId: Joi.string().optional(),
      organizationId: Joi.string().optional(),
      applicationId: Joi.string().optional(),
      user: Joi.object({
        id: Joi.string().required(),
        name: Joi.string().optional(),
        email: Joi.string().email().optional()
      }).optional(),
      session: Joi.object({
        id: Joi.string().required(),
        startTime: Joi.string().isoDate().optional()
      }).optional(),
      org: Joi.object({
        id: Joi.string().required(),
        name: Joi.string().optional()
      }).optional(),
      app: Joi.object({
        id: Joi.string().required(),
        name: Joi.string().optional(),
        version: Joi.string().optional()
      }).optional()
    });
    
    this.schemas.set('base', baseEventSchema);
    
    // Schema para eventos de usuário
    const userEventSchema = baseEventSchema.keys({
      type: Joi.string().valid(
        'user.login',
        'user.logout',
        'user.register',
        'user.update',
        'user.delete'
      ).required(),
      data: Joi.object({
        action: Joi.string().required(),
        details: Joi.object().optional()
      }).required()
    });
    
    this.schemas.set('user', userEventSchema);
    
    // Schema para eventos de sistema
    const systemEventSchema = baseEventSchema.keys({
      type: Joi.string().valid(
        'system.start',
        'system.stop',
        'system.error',
        'system.warning',
        'system.info'
      ).required(),
      data: Joi.object({
        level: Joi.string().valid('info', 'warning', 'error').required(),
        message: Joi.string().required(),
        component: Joi.string().optional(),
        stack: Joi.string().optional()
      }).required()
    });
    
    this.schemas.set('system', systemEventSchema);
    
    // Schema para eventos de aplicação
    const applicationEventSchema = baseEventSchema.keys({
      type: Joi.string().valid(
        'app.pageview',
        'app.click',
        'app.form.submit',
        'app.api.call',
        'app.error'
      ).required(),
      data: Joi.object({
        url: Joi.string().uri().optional(),
        element: Joi.string().optional(),
        form: Joi.object().optional(),
        api: Joi.object().optional(),
        error: Joi.object().optional()
      }).required()
    });
    
    this.schemas.set('application', applicationEventSchema);
    
    this.logger.info('Validation schemas initialized', {
      schemas: Array.from(this.schemas.keys())
    });
  }

  async validateEvent(event) {
    const startTime = Date.now();
    
    try {
      this.emit('validationStarted', {
        eventId: event.id,
        type: event.type,
        timestamp: new Date().toISOString()
      });
      
      // Determinar schema apropriado
      const schema = this.getSchemaForEvent(event);
      
      // Validar estrutura básica
      const { error, value } = schema.validate(event, {
        allowUnknown: this.validation.allowUnknown,
        stripUnknown: this.validation.stripUnknown,
        abortEarly: false
      });
      
      if (error) {
        this.stats.failedValidations++;
        
        const validationError = {
          eventId: event.id,
          type: 'validation_error',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          })),
          timestamp: new Date().toISOString()
        };
        
        this.emit('validationFailed', validationError);
        
        this.logger.warn('Event validation failed', {
          eventId: event.id,
          errors: validationError.errors
        });
        
        return {
          isValid: false,
          event: null,
          errors: validationError.errors
        };
      }
      
      // Sanitizar dados se habilitado
      let sanitizedEvent = value;
      if (this.sanitization.enabled) {
        sanitizedEvent = await this.sanitizeEvent(value);
      }
      
      // Validações customizadas
      const customValidationResult = await this.performCustomValidations(sanitizedEvent);
      if (!customValidationResult.isValid) {
        this.stats.failedValidations++;
        
        this.emit('validationFailed', {
          eventId: event.id,
          type: 'custom_validation_error',
          errors: customValidationResult.errors,
          timestamp: new Date().toISOString()
        });
        
        return customValidationResult;
      }
      
      // Atualizar estatísticas
      this.stats.totalValidations++;
      this.stats.successfulValidations++;
      this.updateAverageValidationTime(Date.now() - startTime);
      
      this.emit('validationCompleted', {
        eventId: event.id,
        validationTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      return {
        isValid: true,
        event: sanitizedEvent,
        errors: []
      };
      
    } catch (error) {
      this.stats.failedValidations++;
      
      this.logger.error('Validation error', {
        eventId: event.id,
        error: error.message
      });
      
      return {
        isValid: false,
        event: null,
        errors: [{
          field: 'general',
          message: 'Internal validation error',
          value: error.message
        }]
      };
    }
  }

  getSchemaForEvent(event) {
    // Determinar schema baseado no tipo do evento
    if (event.type && event.type.startsWith('user.')) {
      return this.schemas.get('user');
    }
    
    if (event.type && event.type.startsWith('system.')) {
      return this.schemas.get('system');
    }
    
    if (event.type && event.type.startsWith('app.')) {
      return this.schemas.get('application');
    }
    
    // Schema base como fallback
    return this.schemas.get('base');
  }

  async sanitizeEvent(event) {
    try {
      const sanitizedEvent = JSON.parse(JSON.stringify(event));
      
      // Sanitizar strings recursivamente
      this.sanitizeObject(sanitizedEvent);
      
      this.stats.sanitizations++;
      
      this.logger.debug('Event sanitized', {
        eventId: event.id
      });
      
      return sanitizedEvent;
      
    } catch (error) {
      this.logger.error('Sanitization error', {
        eventId: event.id,
        error: error.message
      });
      
      return event; // Retornar original em caso de erro
    }
  }

  sanitizeObject(obj) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if (typeof value === 'string') {
          // Sanitizar HTML
          if (this.sanitization.html) {
            obj[key] = DOMPurify.sanitize(value);
          }
          
          // Remover caracteres de controle
          if (this.sanitization.controlChars) {
            obj[key] = obj[key].replace(/[\x00-\x1F\x7F]/g, '');
          }
          
          // Limitar tamanho
          if (this.sanitization.maxLength && obj[key].length > this.sanitization.maxLength) {
            obj[key] = obj[key].substring(0, this.sanitization.maxLength);
          }
          
        } else if (typeof value === 'object' && value !== null) {
          this.sanitizeObject(value);
        }
      }
    }
  }

  async performCustomValidations(event) {
    const errors = [];
    
    try {
      // Validação de timestamp
      if (event.timestamp) {
        const eventTime = new Date(event.timestamp);
        const now = new Date();
        const timeDiff = Math.abs(now - eventTime);
        
        // Rejeitar eventos muito antigos ou futuros
        if (timeDiff > this.validation.rules.maxTimeDrift) {
          errors.push({
            field: 'timestamp',
            message: 'Event timestamp is too far from current time',
            value: event.timestamp
          });
        }
      }
      
      // Validação de tamanho do evento
      const eventSize = JSON.stringify(event).length;
      if (eventSize > this.validation.rules.maxEventSize) {
        errors.push({
          field: 'size',
          message: 'Event size exceeds maximum allowed',
          value: eventSize
        });
      }
      
      // Validação de campos obrigatórios por tipo
      const requiredFields = this.getRequiredFieldsForType(event.type);
      for (const field of requiredFields) {
        if (!this.hasNestedProperty(event, field)) {
          errors.push({
            field: field,
            message: `Required field missing for event type ${event.type}`,
            value: undefined
          });
        }
      }
      
      // Validação de formato de IDs
      const idFields = ['id', 'userId', 'sessionId', 'organizationId', 'applicationId'];
      for (const field of idFields) {
        if (event[field] && !this.isValidId(event[field])) {
          errors.push({
            field: field,
            message: 'Invalid ID format',
            value: event[field]
          });
        }
      }
      
      return {
        isValid: errors.length === 0,
        event: errors.length === 0 ? event : null,
        errors: errors
      };
      
    } catch (error) {
      this.logger.error('Custom validation error', {
        eventId: event.id,
        error: error.message
      });
      
      return {
        isValid: false,
        event: null,
        errors: [{
          field: 'custom_validation',
          message: 'Custom validation failed',
          value: error.message
        }]
      };
    }
  }

  getRequiredFieldsForType(eventType) {
    const typeRequirements = {
      'user.login': ['userId', 'data.action'],
      'user.logout': ['userId', 'data.action'],
      'user.register': ['data.action'],
      'app.pageview': ['data.url'],
      'app.click': ['data.element'],
      'app.form.submit': ['data.form'],
      'system.error': ['data.level', 'data.message']
    };
    
    return typeRequirements[eventType] || [];
  }

  hasNestedProperty(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined || !current.hasOwnProperty(key)) {
        return false;
      }
      current = current[key];
    }
    
    return current !== null && current !== undefined;
  }

  isValidId(id) {
    // Validar formato de ID (UUID, nanoid, etc.)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const nanoidRegex = /^[A-Za-z0-9_-]{21}$/;
    const simpleIdRegex = /^[a-zA-Z0-9_-]+$/;
    
    return uuidRegex.test(id) || nanoidRegex.test(id) || (simpleIdRegex.test(id) && id.length >= 3 && id.length <= 50);
  }

  addCustomSchema(name, schema) {
    try {
      this.schemas.set(name, schema);
      this.logger.info('Custom schema added', { name });
      
    } catch (error) {
      this.logger.error('Failed to add custom schema', {
        name,
        error: error.message
      });
    }
  }

  removeCustomSchema(name) {
    if (this.schemas.has(name) && !['base', 'user', 'system', 'application'].includes(name)) {
      this.schemas.delete(name);
      this.logger.info('Custom schema removed', { name });
      return true;
    }
    
    return false;
  }

  updateAverageValidationTime(duration) {
    const total = this.stats.averageValidationTime * (this.stats.totalValidations - 1);
    this.stats.averageValidationTime = (total + duration) / this.stats.totalValidations;
  }

  getStats() {
    return {
      ...this.stats,
      schemasCount: this.schemas.size,
      isRunning: this.isRunning,
      successRate: this.stats.totalValidations > 0 
        ? (this.stats.successfulValidations / this.stats.totalValidations * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  getSchemas() {
    return Array.from(this.schemas.keys());
  }
}

module.exports = ValidationService;