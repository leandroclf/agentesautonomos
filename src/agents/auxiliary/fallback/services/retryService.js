/**
 * Retry Service - Implementa estratégias de retry com backoff
 * Suporta backoff exponencial, linear e customizado
 */

const EventEmitter = require('events');

class RetryService extends EventEmitter {
  constructor(config, logger, metrics) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    
    this.isRunning = false;
    
    // Estatísticas de retry
    this.stats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
      maxAttemptsReached: 0
    };
    
    // Tipos de backoff suportados
    this.BACKOFF_TYPES = {
      EXPONENTIAL: 'exponential',
      LINEAR: 'linear',
      FIXED: 'fixed',
      CUSTOM: 'custom'
    };
  }
  
  async initialize() {
    try {
      this.logger.info('Inicializando Retry Service...');
      
      this.isRunning = true;
      this.logger.info('Retry Service inicializado com sucesso');
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Retry Service:', error);
      throw error;
    }
  }
  
  async execute(operation, options = {}) {
    const config = this.buildRetryConfig(options);
    const operationId = this.generateOperationId();
    
    this.logger.info(`Iniciando operação com retry: ${operationId}`, {
      maxAttempts: config.maxAttempts,
      backoffType: config.backoffType
    });
    
    let lastError = null;
    let attempt = 0;
    const startTime = Date.now();
    
    while (attempt < config.maxAttempts) {
      attempt++;
      
      try {
        this.logger.debug(`Tentativa ${attempt}/${config.maxAttempts} para operação: ${operationId}`);
        
        // Registrar tentativa nas métricas
        this.metrics.retryAttempts.inc({
          operation: operationId,
          attempt: attempt.toString(),
          status: 'started'
        });
        
        // Executar operação
        const result = await this.executeWithTimeout(operation, config.timeout);
        
        // Sucesso!
        const duration = (Date.now() - startTime) / 1000;
        
        this.logger.info(`Operação bem-sucedida na tentativa ${attempt}: ${operationId}`, {
          duration,
          totalAttempts: attempt
        });
        
        // Atualizar estatísticas
        this.updateSuccessStats(attempt);
        
        // Registrar sucesso nas métricas
        this.metrics.retryAttempts.inc({
          operation: operationId,
          attempt: attempt.toString(),
          status: 'success'
        });
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        this.logger.warn(`Tentativa ${attempt} falhou para operação: ${operationId}`, {
          error: error.message,
          remainingAttempts: config.maxAttempts - attempt
        });
        
        // Registrar falha nas métricas
        this.metrics.retryAttempts.inc({
          operation: operationId,
          attempt: attempt.toString(),
          status: 'failed'
        });
        
        // Verificar se deve continuar tentando
        if (!this.shouldRetry(error, config)) {
          this.logger.info(`Parando tentativas para operação: ${operationId} (erro não recuperável)`);
          break;
        }
        
        // Se não é a última tentativa, aguardar antes da próxima
        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(attempt, config);
          
          this.logger.debug(`Aguardando ${delay}ms antes da próxima tentativa: ${operationId}`);
          await this.sleep(delay);
        }
      }
    }
    
    // Todas as tentativas falharam
    const duration = (Date.now() - startTime) / 1000;
    
    this.logger.error(`Todas as tentativas falharam para operação: ${operationId}`, {
      totalAttempts: attempt,
      duration,
      lastError: lastError.message
    });
    
    // Atualizar estatísticas
    this.updateFailureStats(attempt);
    
    // Lançar o último erro
    throw new Error(`Operação falhou após ${attempt} tentativas: ${lastError.message}`);
  }
  
  buildRetryConfig(options) {
    const defaultConfig = this.config.fallback.retry;
    
    return {
      maxAttempts: options.maxAttempts || defaultConfig.maxAttempts,
      baseDelay: options.baseDelay || defaultConfig.baseDelay,
      maxDelay: options.maxDelay || defaultConfig.maxDelay,
      backoffMultiplier: options.backoffMultiplier || defaultConfig.backoffMultiplier,
      backoffType: options.backoffType || defaultConfig.backoffType || this.BACKOFF_TYPES.EXPONENTIAL,
      timeout: options.timeout || defaultConfig.timeout,
      retryableErrors: options.retryableErrors || defaultConfig.retryableErrors || [],
      nonRetryableErrors: options.nonRetryableErrors || defaultConfig.nonRetryableErrors || [],
      jitter: options.jitter !== undefined ? options.jitter : defaultConfig.jitter,
      customBackoffFunction: options.customBackoffFunction
    };
  }
  
  shouldRetry(error, config) {
    // Verificar erros não recuperáveis
    if (config.nonRetryableErrors.length > 0) {
      for (const nonRetryableError of config.nonRetryableErrors) {
        if (error.message.includes(nonRetryableError) || 
            error.code === nonRetryableError ||
            error.name === nonRetryableError) {
          return false;
        }
      }
    }
    
    // Verificar erros recuperáveis específicos
    if (config.retryableErrors.length > 0) {
      for (const retryableError of config.retryableErrors) {
        if (error.message.includes(retryableError) || 
            error.code === retryableError ||
            error.name === retryableError) {
          return true;
        }
      }
      // Se há lista de erros recuperáveis e o erro não está nela, não retry
      return false;
    }
    
    // Por padrão, tentar novamente para a maioria dos erros
    return true;
  }
  
  calculateDelay(attempt, config) {
    let delay;
    
    switch (config.backoffType) {
      case this.BACKOFF_TYPES.EXPONENTIAL:
        delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        break;
        
      case this.BACKOFF_TYPES.LINEAR:
        delay = config.baseDelay * attempt;
        break;
        
      case this.BACKOFF_TYPES.FIXED:
        delay = config.baseDelay;
        break;
        
      case this.BACKOFF_TYPES.CUSTOM:
        if (config.customBackoffFunction) {
          delay = config.customBackoffFunction(attempt, config);
        } else {
          delay = config.baseDelay;
        }
        break;
        
      default:
        delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    }
    
    // Aplicar limite máximo
    delay = Math.min(delay, config.maxDelay);
    
    // Aplicar jitter se configurado
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% de jitter
      const jitterOffset = (Math.random() - 0.5) * 2 * jitterAmount;
      delay = Math.max(0, delay + jitterOffset);
    }
    
    return Math.round(delay);
  }
  
  async executeWithTimeout(operation, timeout) {
    if (!timeout) {
      return await operation();
    }
    
    return await Promise.race([
      operation(),
      this.createTimeoutPromise(timeout)
    ]);
  }
  
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operação excedeu timeout de ${timeout}ms`));
      }, timeout);
    });
  }
  
  generateOperationId() {
    return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  updateSuccessStats(attempts) {
    this.stats.totalRetries++;
    this.stats.successfulRetries++;
    
    // Atualizar média de tentativas
    this.stats.averageAttempts = 
      (this.stats.averageAttempts * (this.stats.totalRetries - 1) + attempts) / 
      this.stats.totalRetries;
  }
  
  updateFailureStats(attempts) {
    this.stats.totalRetries++;
    this.stats.failedRetries++;
    
    if (attempts >= this.config.fallback.retry.maxAttempts) {
      this.stats.maxAttemptsReached++;
    }
    
    // Atualizar média de tentativas
    this.stats.averageAttempts = 
      (this.stats.averageAttempts * (this.stats.totalRetries - 1) + attempts) / 
      this.stats.totalRetries;
  }
  
  // Métodos de conveniência para diferentes tipos de backoff
  async executeWithExponentialBackoff(operation, options = {}) {
    return await this.execute(operation, {
      ...options,
      backoffType: this.BACKOFF_TYPES.EXPONENTIAL
    });
  }
  
  async executeWithLinearBackoff(operation, options = {}) {
    return await this.execute(operation, {
      ...options,
      backoffType: this.BACKOFF_TYPES.LINEAR
    });
  }
  
  async executeWithFixedDelay(operation, options = {}) {
    return await this.execute(operation, {
      ...options,
      backoffType: this.BACKOFF_TYPES.FIXED
    });
  }
  
  async executeWithCustomBackoff(operation, backoffFunction, options = {}) {
    return await this.execute(operation, {
      ...options,
      backoffType: this.BACKOFF_TYPES.CUSTOM,
      customBackoffFunction: backoffFunction
    });
  }
  
  // Retry com circuit breaker integrado
  async executeWithCircuitBreaker(operation, circuitBreakerService, service, options = {}) {
    if (!circuitBreakerService.canExecute(service)) {
      throw new Error(`Circuit breaker aberto para serviço: ${service}`);
    }
    
    try {
      const result = await this.execute(operation, options);
      circuitBreakerService.recordSuccess(service);
      return result;
    } catch (error) {
      circuitBreakerService.recordFailure(service);
      throw error;
    }
  }
  
  // Retry com rate limiting
  async executeWithRateLimit(operation, rateLimiter, options = {}) {
    await rateLimiter.acquire();
    
    try {
      return await this.execute(operation, options);
    } finally {
      rateLimiter.release();
    }
  }
  
  // Batch retry para múltiplas operações
  async executeBatch(operations, options = {}) {
    const batchConfig = {
      ...options,
      concurrency: options.concurrency || 5,
      failFast: options.failFast || false
    };
    
    const results = [];
    const errors = [];
    
    // Processar em lotes com concorrência limitada
    for (let i = 0; i < operations.length; i += batchConfig.concurrency) {
      const batch = operations.slice(i, i + batchConfig.concurrency);
      
      const batchPromises = batch.map(async (operation, index) => {
        try {
          const result = await this.execute(operation, options);
          return { index: i + index, result, success: true };
        } catch (error) {
          const errorResult = { index: i + index, error, success: false };
          
          if (batchConfig.failFast) {
            throw errorResult;
          }
          
          return errorResult;
        }
      });
      
      try {
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result.success) {
            results[result.index] = result.result;
          } else {
            errors[result.index] = result.error;
          }
        }
        
      } catch (error) {
        if (batchConfig.failFast) {
          throw error;
        }
      }
    }
    
    return {
      results,
      errors,
      successCount: results.filter(r => r !== undefined).length,
      errorCount: errors.filter(e => e !== undefined).length
    };
  }
  
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRetries > 0 ? 
        this.stats.successfulRetries / this.stats.totalRetries : 0,
      failureRate: this.stats.totalRetries > 0 ? 
        this.stats.failedRetries / this.stats.totalRetries : 0,
      maxAttemptsRate: this.stats.totalRetries > 0 ? 
        this.stats.maxAttemptsReached / this.stats.totalRetries : 0
    };
  }
  
  resetStats() {
    this.stats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
      maxAttemptsReached: 0
    };
    
    this.logger.info('Estatísticas de retry resetadas');
  }
  
  isHealthy() {
    return this.isRunning;
  }
  
  getStatus() {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      stats: this.getStats(),
      supportedBackoffTypes: Object.values(this.BACKOFF_TYPES)
    };
  }
  
  async stop() {
    this.logger.info('Parando Retry Service...');
    
    this.isRunning = false;
    
    this.logger.info('Retry Service parado');
  }
}

module.exports = RetryService;