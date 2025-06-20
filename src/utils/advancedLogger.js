/**
 * Configuração Avançada de Logger
 * Suporte para múltiplos transports e formatação estruturada
 */

const winston = require('winston');
const path = require('path');

class AdvancedLogger {
  constructor(component, options = {}) {
    this.component = component;
    this.options = {
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: process.env.NODE_ENV !== 'production',
      enableFile: true,
      enableMetrics: true,
      ...options
    };
    
    this.logger = this.createLogger();
    this.metrics = {
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0
    };
  }

  /**
   * Criar instância do logger Winston
   */
  createLogger() {
    const transports = [];
    
    // Console transport para desenvolvimento
    if (this.options.enableConsole) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${component || 'system'}] ${level}: ${message} ${metaStr}`;
          })
        )
      }));
    }
    
    // File transport para logs gerais
    if (this.options.enableFile) {
      transports.push(new winston.transports.File({
        filename: path.join(__dirname, '..', 'logs', 'system', 'combined.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: 10485760, // 10MB
        maxFiles: 5
      }));
      
      // File transport para erros
      transports.push(new winston.transports.File({
        filename: path.join(__dirname, '..', 'logs', 'errors', 'error.log'),
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: 10485760, // 10MB
        maxFiles: 10
      }));
    }
    
    return winston.createLogger({
      level: this.options.level,
      defaultMeta: { component: this.component },
      transports,
      exitOnError: false
    });
  }

  /**
   * Log com métricas
   */
  log(level, message, meta = {}) {
    // Incrementar métricas
    if (this.options.enableMetrics && this.metrics[level] !== undefined) {
      this.metrics[level]++;
    }
    
    // Adicionar contexto adicional
    const enrichedMeta = {
      ...meta,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    
    this.logger.log(level, message, enrichedMeta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  /**
   * Log de performance
   */
  performance(operation, duration, meta = {}) {
    this.info(`Performance: ${operation}`, {
      ...meta,
      operation,
      duration,
      type: 'performance'
    });
  }

  /**
   * Log de auditoria
   */
  audit(action, user, resource, meta = {}) {
    this.info(`Audit: ${action}`, {
      ...meta,
      action,
      user,
      resource,
      type: 'audit'
    });
  }

  /**
   * Obter métricas
   */
  getMetrics() {
    return {
      ...this.metrics,
      component: this.component,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resetar métricas
   */
  resetMetrics() {
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = 0;
    });
  }
}

module.exports = AdvancedLogger;
