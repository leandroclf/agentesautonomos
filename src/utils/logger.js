/**
 * Logger Utility - Sistema de Logging Padronizado
 * Fase 1-2: Logging estruturado para todos os agentes
 * 
 * Responsabilidades:
 * - Logging estruturado em JSON
 * - Diferentes níveis de log
 * - Contexto por agente
 * - Integração com observabilidade
 */

const winston = require('winston');
const config = require('../config/index.js');

class Logger {
  constructor(agentId, options = {}) {
    this.agentId = agentId;
    this.options = {
      level: options.level || config.observability.logLevel,
      format: options.format || config.observability.logFormat,
      ...options
    };
    
    this.logger = this.createLogger();
  }
  
  /**
   * Criar instância do Winston Logger
   */
  createLogger() {
    const formats = [];
    
    // Adicionar timestamp
    formats.push(winston.format.timestamp());
    
    // Adicionar contexto do agente
    formats.push(winston.format((info) => {
      info.agent = this.agentId;
      info.environment = config.env;
      return info;
    })());
    
    // Formato de saída
    if (this.options.format === 'json') {
      formats.push(winston.format.json());
    } else {
      formats.push(winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, agent, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${agent}] ${level}: ${message} ${metaStr}`;
        })
      ));
    }
    
    // Transports
    const transports = [
      new winston.transports.Console({
        level: this.options.level
      })
    ];
    
    // Adicionar arquivo de log em produção
    if (config.env === 'production') {
      transports.push(
        new winston.transports.File({
          filename: `logs/${this.agentId}-error.log`,
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: `logs/${this.agentId}.log`,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      );
    }
    
    return winston.createLogger({
      level: this.options.level,
      format: winston.format.combine(...formats),
      transports,
      exitOnError: false
    });
  }
  
  /**
   * Log de debug
   */
  debug(message, meta = {}) {
    this.logger.debug(message, this.enrichMeta(meta));
  }
  
  /**
   * Log de informação
   */
  info(message, meta = {}) {
    this.logger.info(message, this.enrichMeta(meta));
  }
  
  /**
   * Log de warning
   */
  warn(message, meta = {}) {
    this.logger.warn(message, this.enrichMeta(meta));
  }
  
  /**
   * Log de erro
   */
  error(message, error = null, meta = {}) {
    const enrichedMeta = this.enrichMeta(meta);
    
    if (error) {
      if (error instanceof Error) {
        enrichedMeta.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
      } else {
        enrichedMeta.error = error;
      }
    }
    
    this.logger.error(message, enrichedMeta);
  }
  
  /**
   * Log de evento crítico
   */
  critical(message, meta = {}) {
    const enrichedMeta = this.enrichMeta({
      ...meta,
      severity: 'critical'
    });
    
    this.logger.error(`[CRITICAL] ${message}`, enrichedMeta);
  }
  
  /**
   * Log de métricas
   */
  metric(metricName, value, unit = 'count', meta = {}) {
    this.logger.info('Metric recorded', this.enrichMeta({
      ...meta,
      metric: {
        name: metricName,
        value,
        unit,
        timestamp: new Date().toISOString()
      }
    }));
  }
  
  /**
   * Log de evento de auditoria
   */
  audit(action, resource, result, meta = {}) {
    this.logger.info('Audit event', this.enrichMeta({
      ...meta,
      audit: {
        action,
        resource,
        result,
        timestamp: new Date().toISOString()
      }
    }));
  }
  
  /**
   * Log de performance
   */
  performance(operation, duration, meta = {}) {
    this.logger.info('Performance measurement', this.enrichMeta({
      ...meta,
      performance: {
        operation,
        duration,
        unit: 'ms',
        timestamp: new Date().toISOString()
      }
    }));
  }
  
  /**
   * Log de evento de negócio
   */
  business(event, data, meta = {}) {
    this.logger.info('Business event', this.enrichMeta({
      ...meta,
      business: {
        event,
        data,
        timestamp: new Date().toISOString()
      }
    }));
  }
  
  /**
   * Log de trace distribuído
   */
  trace(traceId, spanId, operation, meta = {}) {
    this.logger.debug('Distributed trace', this.enrichMeta({
      ...meta,
      trace: {
        traceId,
        spanId,
        operation,
        timestamp: new Date().toISOString()
      }
    }));
  }
  
  /**
   * Enriquecer metadados com informações do contexto
   */
  enrichMeta(meta = {}) {
    return {
      ...meta,
      pid: process.pid,
      hostname: require('os').hostname(),
      version: require('../../package.json').version
    };
  }
  
  /**
   * Criar logger filho com contexto adicional
   */
  child(context = {}) {
    const childLogger = new Logger(this.agentId, this.options);
    
    // Sobrescrever enrichMeta para incluir contexto
    const originalEnrichMeta = childLogger.enrichMeta.bind(childLogger);
    childLogger.enrichMeta = (meta = {}) => {
      return originalEnrichMeta({
        ...context,
        ...meta
      });
    };
    
    return childLogger;
  }
  
  /**
   * Configurar nível de log dinamicamente
   */
  setLevel(level) {
    this.logger.level = level;
    this.options.level = level;
  }
  
  /**
   * Obter nível atual de log
   */
  getLevel() {
    return this.logger.level;
  }
  
  /**
   * Verificar se um nível está habilitado
   */
  isLevelEnabled(level) {
    return this.logger.isLevelEnabled(level);
  }
  
  /**
   * Flush logs (útil para testes)
   */
  async flush() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
  
  /**
   * Obter estatísticas do logger
   */
  getStats() {
    return {
      agentId: this.agentId,
      level: this.logger.level,
      format: this.options.format,
      transports: this.logger.transports.length
    };
  }
}

/**
 * Factory function para criar loggers
 */
function createLogger(agentId, options = {}) {
  return new Logger(agentId, options);
}

/**
 * Logger global para uso geral
 */
const globalLogger = new Logger('system');

module.exports = Logger;
module.exports.createLogger = createLogger;
module.exports.globalLogger = globalLogger;

// Configurar tratamento de exceções não capturadas
if (config.env === 'production') {
  process.on('uncaughtException', (error) => {
    globalLogger.critical('Uncaught Exception', { error });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    globalLogger.critical('Unhandled Rejection', {
      reason,
      promise: promise.toString()
    });
  });
}