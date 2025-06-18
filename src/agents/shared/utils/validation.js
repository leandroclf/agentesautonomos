const { v4: uuidv4, validate: validateUuid } = require('uuid');

/**
 * Utilitários de validação para os agentes autônomos
 */
class ValidationUtils {
  /**
   * Valida se um valor é uma string não vazia
   */
  static isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Valida se um valor é um número válido
   */
  static isValidNumber(value, options = {}) {
    const { min, max, integer = false } = options;
    
    if (typeof value !== 'number' || isNaN(value)) {
      return false;
    }
    
    if (integer && !Number.isInteger(value)) {
      return false;
    }
    
    if (typeof min === 'number' && value < min) {
      return false;
    }
    
    if (typeof max === 'number' && value > max) {
      return false;
    }
    
    return true;
  }

  /**
   * Valida se um valor é um UUID válido
   */
  static isValidUuid(value) {
    return typeof value === 'string' && validateUuid(value);
  }

  /**
   * Valida se um valor é uma data válida
   */
  static isValidDate(value) {
    if (value instanceof Date) {
      return !isNaN(value.getTime());
    }
    
    if (typeof value === 'string') {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
    
    return false;
  }

  /**
   * Valida se um valor é um timestamp válido
   */
  static isValidTimestamp(value) {
    if (typeof value === 'number') {
      return value > 0 && value <= Date.now() + 86400000; // Até 1 dia no futuro
    }
    
    if (typeof value === 'string') {
      return this.isValidDate(value);
    }
    
    return false;
  }

  /**
   * Valida se um valor é um email válido
   */
  static isValidEmail(value) {
    if (!this.isNonEmptyString(value)) {
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  /**
   * Valida se um valor é uma URL válida
   */
  static isValidUrl(value) {
    if (!this.isNonEmptyString(value)) {
      return false;
    }
    
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Valida estrutura de evento
   */
  static validateEvent(event) {
    const errors = [];
    
    // Campos obrigatórios
    if (!event || typeof event !== 'object') {
      errors.push('Event must be an object');
      return { isValid: false, errors };
    }
    
    if (!this.isValidUuid(event.id)) {
      errors.push('Event ID must be a valid UUID');
    }
    
    if (!this.isNonEmptyString(event.type)) {
      errors.push('Event type is required');
    }
    
    if (!this.isValidTimestamp(event.timestamp)) {
      errors.push('Event timestamp must be valid');
    }
    
    if (!this.isNonEmptyString(event.source)) {
      errors.push('Event source is required');
    }
    
    // Validar payload se presente
    if (event.payload !== undefined && typeof event.payload !== 'object') {
      errors.push('Event payload must be an object');
    }
    
    // Validar metadata se presente
    if (event.metadata !== undefined && typeof event.metadata !== 'object') {
      errors.push('Event metadata must be an object');
    }
    
    // Validar tamanho total
    const eventSize = JSON.stringify(event).length;
    if (eventSize > 256000) { // 256KB limit
      errors.push('Event size exceeds maximum limit (256KB)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida estrutura de plano
   */
  static validatePlan(plan) {
    const errors = [];
    
    if (!plan || typeof plan !== 'object') {
      errors.push('Plan must be an object');
      return { isValid: false, errors };
    }
    
    if (!this.isValidUuid(plan.id)) {
      errors.push('Plan ID must be a valid UUID');
    }
    
    if (!this.isNonEmptyString(plan.name)) {
      errors.push('Plan name is required');
    }
    
    if (!Array.isArray(plan.steps)) {
      errors.push('Plan steps must be an array');
    } else {
      plan.steps.forEach((step, index) => {
        const stepErrors = this.validatePlanStep(step);
        if (!stepErrors.isValid) {
          errors.push(`Step ${index}: ${stepErrors.errors.join(', ')}`);
        }
      });
    }
    
    if (!this.isValidTimestamp(plan.createdAt)) {
      errors.push('Plan createdAt must be valid');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida estrutura de step do plano
   */
  static validatePlanStep(step) {
    const errors = [];
    
    if (!step || typeof step !== 'object') {
      errors.push('Step must be an object');
      return { isValid: false, errors };
    }
    
    if (!this.isValidUuid(step.id)) {
      errors.push('Step ID must be a valid UUID');
    }
    
    if (!this.isNonEmptyString(step.name)) {
      errors.push('Step name is required');
    }
    
    if (!this.isNonEmptyString(step.type)) {
      errors.push('Step type is required');
    }
    
    if (!this.isValidNumber(step.order, { min: 0, integer: true })) {
      errors.push('Step order must be a non-negative integer');
    }
    
    // Validar dependências se presentes
    if (step.dependencies && !Array.isArray(step.dependencies)) {
      errors.push('Step dependencies must be an array');
    }
    
    // Validar configuração se presente
    if (step.config !== undefined && typeof step.config !== 'object') {
      errors.push('Step config must be an object');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida estrutura de execução
   */
  static validateExecution(execution) {
    const errors = [];
    
    if (!execution || typeof execution !== 'object') {
      errors.push('Execution must be an object');
      return { isValid: false, errors };
    }
    
    if (!this.isValidUuid(execution.id)) {
      errors.push('Execution ID must be a valid UUID');
    }
    
    if (!this.isValidUuid(execution.planId)) {
      errors.push('Execution planId must be a valid UUID');
    }
    
    const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(execution.status)) {
      errors.push(`Execution status must be one of: ${validStatuses.join(', ')}`);
    }
    
    if (!this.isValidTimestamp(execution.createdAt)) {
      errors.push('Execution createdAt must be valid');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida configuração de agente
   */
  static validateAgentConfig(config) {
    const errors = [];
    
    if (!config || typeof config !== 'object') {
      errors.push('Config must be an object');
      return { isValid: false, errors };
    }
    
    if (!this.isNonEmptyString(config.name)) {
      errors.push('Agent name is required');
    }
    
    if (!this.isValidNumber(config.port, { min: 1, max: 65535, integer: true })) {
      errors.push('Port must be a valid port number (1-65535)');
    }
    
    if (config.timeout && !this.isValidNumber(config.timeout, { min: 1000, integer: true })) {
      errors.push('Timeout must be a positive integer (minimum 1000ms)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitiza string removendo caracteres perigosos
   */
  static sanitizeString(value, options = {}) {
    if (typeof value !== 'string') {
      return '';
    }
    
    const { maxLength = 1000, allowHtml = false } = options;
    
    let sanitized = value.trim();
    
    // Remover HTML se não permitido
    if (!allowHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }
    
    // Limitar tamanho
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized;
  }

  /**
   * Valida e sanitiza objeto de entrada
   */
  static sanitizeObject(obj, schema) {
    if (!obj || typeof obj !== 'object') {
      return {};
    }
    
    const sanitized = {};
    
    for (const [key, rules] of Object.entries(schema)) {
      const value = obj[key];
      
      // Verificar se é obrigatório
      if (rules.required && (value === undefined || value === null)) {
        throw new Error(`Field '${key}' is required`);
      }
      
      // Pular se não obrigatório e não presente
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }
      
      // Aplicar validação e sanitização baseada no tipo
      switch (rules.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`Field '${key}' must be a string`);
          }
          sanitized[key] = this.sanitizeString(value, rules.options);
          break;
          
        case 'number':
          if (!this.isValidNumber(value, rules.options)) {
            throw new Error(`Field '${key}' must be a valid number`);
          }
          sanitized[key] = value;
          break;
          
        case 'uuid':
          if (!this.isValidUuid(value)) {
            throw new Error(`Field '${key}' must be a valid UUID`);
          }
          sanitized[key] = value;
          break;
          
        case 'date':
          if (!this.isValidDate(value)) {
            throw new Error(`Field '${key}' must be a valid date`);
          }
          sanitized[key] = new Date(value).toISOString();
          break;
          
        case 'email':
          if (!this.isValidEmail(value)) {
            throw new Error(`Field '${key}' must be a valid email`);
          }
          sanitized[key] = value.toLowerCase();
          break;
          
        case 'url':
          if (!this.isValidUrl(value)) {
            throw new Error(`Field '${key}' must be a valid URL`);
          }
          sanitized[key] = value;
          break;
          
        case 'array':
          if (!Array.isArray(value)) {
            throw new Error(`Field '${key}' must be an array`);
          }
          sanitized[key] = value;
          break;
          
        case 'object':
          if (typeof value !== 'object') {
            throw new Error(`Field '${key}' must be an object`);
          }
          sanitized[key] = value;
          break;
          
        default:
          sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Gera UUID v4
   */
  static generateUuid() {
    return uuidv4();
  }

  /**
   * Gera timestamp atual
   */
  static generateTimestamp() {
    return new Date().toISOString();
  }
}

module.exports = ValidationUtils;