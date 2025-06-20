/**
 * Utilitários de Logging
 * Funções auxiliares para logging estruturado
 */

const AdvancedLogger = require('./advancedLogger');

class LoggingUtils {
  /**
   * Criar middleware de logging para Express
   */
  static createExpressMiddleware(component) {
    const logger = new AdvancedLogger(`${component}-http`);
    
    return (req, res, next) => {
      const start = Date.now();
      
      // Log da requisição
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        requestId: req.headers['x-request-id'] || `req-${Date.now()}`
      });
      
      // Override do res.end para capturar resposta
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - start;
        
        logger.info('HTTP Response', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          requestId: req.headers['x-request-id']
        });
        
        originalEnd.apply(this, args);
      };
      
      next();
    };
  }

  /**
   * Decorator para logging de métodos
   */
  static logMethod(target, propertyName, descriptor) {
    const originalMethod = descriptor.value;
    const logger = new AdvancedLogger(target.constructor.name);
    
    descriptor.value = async function(...args) {
      const start = Date.now();
      
      logger.debug(`Method ${propertyName} started`, {
        args: args.length,
        method: propertyName
      });
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;
        
        logger.performance(propertyName, duration, {
          success: true,
          resultType: typeof result
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        
        logger.error(`Method ${propertyName} failed`, {
          error: error.message,
          duration,
          method: propertyName
        });
        
        throw error;
      }
    };
    
    return descriptor;
  }

  /**
   * Wrapper para logging de promises
   */
  static async logPromise(promise, operation, logger) {
    const start = Date.now();
    
    try {
      logger.debug(`Operation ${operation} started`);
      const result = await promise;
      const duration = Date.now() - start;
      
      logger.performance(operation, duration, { success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.error(`Operation ${operation} failed`, {
        error: error.message,
        duration
      });
      
      throw error;
    }
  }

  /**
   * Criar logger específico para agente
   */
  static createAgentLogger(agentName, options = {}) {
    return new AdvancedLogger(agentName, {
      ...options,
      enableFile: true,
      enableMetrics: true
    });
  }

  /**
   * Configurar logging global de erros não capturados
   */
  static setupGlobalErrorLogging() {
    const logger = new AdvancedLogger('global-error-handler');
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        type: 'uncaughtException'
      });
      
      // Dar tempo para o log ser escrito antes de sair
      setTimeout(() => process.exit(1), 1000);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        type: 'unhandledRejection'
      });
    });
  }

  /**
   * Coletar métricas de todos os loggers
   */
  static collectMetrics() {
    // TODO: Implementar coleta de métricas de todos os loggers ativos
    return {
      timestamp: new Date().toISOString(),
      loggers: []
    };
  }
}

module.exports = LoggingUtils;
