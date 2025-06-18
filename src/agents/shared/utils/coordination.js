const axios = require('axios');
const ValidationUtils = require('./validation');
const FormattingUtils = require('./formatting');

/**
 * Utilitários para coordenação entre agentes autônomos
 */
class CoordinationUtils {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.agentClients = new Map();
    this.circuitBreakers = new Map();
    
    // Configurações de circuit breaker
    this.circuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    };
  }

  /**
   * Inicializa clientes para outros agentes
   */
  async initializeAgentClients() {
    const agents = ['interface', 'event', 'planning', 'execution'];
    
    for (const agentName of agents) {
      if (this.config.agents && this.config.agents[agentName]) {
        const agentConfig = this.config.agents[agentName];
        
        const client = axios.create({
          baseURL: `http://${agentConfig.host}:${agentConfig.port}`,
          timeout: agentConfig.timeout || 30000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': `Agent-${this.config.name || 'unknown'}`
          }
        });
        
        // Adicionar interceptors para logging e retry
        this.setupClientInterceptors(client, agentName);
        
        this.agentClients.set(agentName, client);
        this.initializeCircuitBreaker(agentName);
        
        this.logger.debug('Agent client initialized', {
          agentName,
          baseURL: client.defaults.baseURL
        });
      }
    }
  }

  /**
   * Configura interceptors para cliente HTTP
   */
  setupClientInterceptors(client, agentName) {
    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        config.metadata = {
          startTime: Date.now(),
          agentName
        };
        
        this.logger.debug('HTTP request sent', {
          agent: agentName,
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: config.headers
        });
        
        return config;
      },
      (error) => {
        this.logger.error('HTTP request error', {
          agent: agentName,
          error: error.message
        });
        return Promise.reject(error);
      }
    );
    
    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        this.logger.debug('HTTP response received', {
          agent: agentName,
          status: response.status,
          duration: FormattingUtils.formatDuration(duration),
          url: response.config.url
        });
        
        // Registrar sucesso no circuit breaker
        this.recordCircuitBreakerSuccess(agentName);
        
        return response;
      },
      (error) => {
        const duration = error.config?.metadata ? 
          Date.now() - error.config.metadata.startTime : 0;
        
        this.logger.error('HTTP response error', {
          agent: agentName,
          status: error.response?.status,
          duration: FormattingUtils.formatDuration(duration),
          url: error.config?.url,
          error: error.message
        });
        
        // Registrar falha no circuit breaker
        this.recordCircuitBreakerFailure(agentName);
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Inicializa circuit breaker para um agente
   */
  initializeCircuitBreaker(agentName) {
    this.circuitBreakers.set(agentName, {
      state: 'closed', // closed, open, half-open
      failures: 0,
      lastFailureTime: null,
      nextAttemptTime: null
    });
  }

  /**
   * Registra sucesso no circuit breaker
   */
  recordCircuitBreakerSuccess(agentName) {
    const breaker = this.circuitBreakers.get(agentName);
    if (breaker) {
      breaker.failures = 0;
      breaker.state = 'closed';
      breaker.lastFailureTime = null;
      breaker.nextAttemptTime = null;
    }
  }

  /**
   * Registra falha no circuit breaker
   */
  recordCircuitBreakerFailure(agentName) {
    const breaker = this.circuitBreakers.get(agentName);
    if (breaker) {
      breaker.failures++;
      breaker.lastFailureTime = Date.now();
      
      if (breaker.failures >= this.circuitBreakerConfig.failureThreshold) {
        breaker.state = 'open';
        breaker.nextAttemptTime = Date.now() + this.circuitBreakerConfig.resetTimeout;
        
        this.logger.warn('Circuit breaker opened', {
          agentName,
          failures: breaker.failures,
          nextAttemptTime: FormattingUtils.formatTimestamp(breaker.nextAttemptTime)
        });
      }
    }
  }

  /**
   * Verifica se circuit breaker permite requisição
   */
  isCircuitBreakerOpen(agentName) {
    const breaker = this.circuitBreakers.get(agentName);
    if (!breaker) return false;
    
    if (breaker.state === 'closed') {
      return false;
    }
    
    if (breaker.state === 'open') {
      if (Date.now() >= breaker.nextAttemptTime) {
        breaker.state = 'half-open';
        this.logger.info('Circuit breaker half-open', { agentName });
        return false;
      }
      return true;
    }
    
    // half-open state
    return false;
  }

  /**
   * Envia requisição para outro agente
   */
  async sendToAgent(agentName, endpoint, data = null, options = {}) {
    // Verificar circuit breaker
    if (this.isCircuitBreakerOpen(agentName)) {
      throw new Error(`Circuit breaker is open for agent: ${agentName}`);
    }
    
    const client = this.agentClients.get(agentName);
    if (!client) {
      throw new Error(`No client configured for agent: ${agentName}`);
    }
    
    const {
      method = 'POST',
      timeout = 30000,
      retries = 3,
      retryDelay = 1000
    } = options;
    
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const requestConfig = {
          method,
          url: endpoint,
          timeout,
          ...(data && { data })
        };
        
        const response = await client.request(requestConfig);
        
        this.logger.debug('Agent request successful', {
          agentName,
          endpoint,
          method,
          attempt: attempt + 1,
          status: response.status
        });
        
        return response.data;
        
      } catch (error) {
        lastError = error;
        
        // Não tentar novamente em alguns casos
        if (error.response?.status === 400 || error.response?.status === 404) {
          break;
        }
        
        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          
          this.logger.warn('Agent request failed, retrying', {
            agentName,
            endpoint,
            attempt: attempt + 1,
            maxRetries: retries + 1,
            delay: FormattingUtils.formatDuration(delay),
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    this.logger.error('Agent request failed after all retries', {
      agentName,
      endpoint,
      retries: retries + 1,
      error: lastError.message
    });
    
    throw lastError;
  }

  /**
   * Verifica saúde de um agente
   */
  async checkAgentHealth(agentName) {
    try {
      const response = await this.sendToAgent(agentName, '/health', null, {
        method: 'GET',
        timeout: 5000,
        retries: 1
      });
      
      return {
        agent: agentName,
        status: 'healthy',
        details: response
      };
      
    } catch (error) {
      return {
        agent: agentName,
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Verifica saúde de todos os agentes
   */
  async checkAllAgentsHealth() {
    const healthChecks = [];
    
    for (const agentName of this.agentClients.keys()) {
      healthChecks.push(this.checkAgentHealth(agentName));
    }
    
    const results = await Promise.allSettled(healthChecks);
    
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          agent: 'unknown',
          status: 'error',
          error: result.reason.message
        };
      }
    });
  }

  /**
   * Envia evento para o Event Agent
   */
  async sendEvent(event) {
    const validation = ValidationUtils.validateEvent(event);
    if (!validation.isValid) {
      throw new Error(`Invalid event: ${validation.errors.join(', ')}`);
    }
    
    return await this.sendToAgent('event', '/events', event);
  }

  /**
   * Solicita análise de planejamento
   */
  async requestPlanning(planningRequest) {
    if (!planningRequest || typeof planningRequest !== 'object') {
      throw new Error('Planning request must be an object');
    }
    
    return await this.sendToAgent('planning', '/analyze', planningRequest);
  }

  /**
   * Solicita execução de plano
   */
  async requestExecution(executionRequest) {
    if (!executionRequest || typeof executionRequest !== 'object') {
      throw new Error('Execution request must be an object');
    }
    
    return await this.sendToAgent('execution', '/execute', executionRequest);
  }

  /**
   * Obtém status de execução
   */
  async getExecutionStatus(executionId) {
    if (!ValidationUtils.isValidUuid(executionId)) {
      throw new Error('Invalid execution ID');
    }
    
    return await this.sendToAgent('execution', `/executions/${executionId}`, null, {
      method: 'GET'
    });
  }

  /**
   * Para execução
   */
  async stopExecution(executionId) {
    if (!ValidationUtils.isValidUuid(executionId)) {
      throw new Error('Invalid execution ID');
    }
    
    return await this.sendToAgent('execution', `/executions/${executionId}/stop`, null, {
      method: 'POST'
    });
  }

  /**
   * Coordena fluxo completo: evento -> planejamento -> execução
   */
  async coordinateFullFlow(initialEvent, options = {}) {
    const {
      trackProgress = true,
      timeout = 300000 // 5 minutos
    } = options;
    
    const flowId = ValidationUtils.generateUuid();
    const startTime = Date.now();
    
    this.logger.info('Starting coordinated flow', {
      flowId,
      eventType: initialEvent.type,
      eventId: initialEvent.id
    });
    
    try {
      // 1. Enviar evento
      const eventResult = await this.sendEvent({
        ...initialEvent,
        metadata: {
          ...initialEvent.metadata,
          flowId,
          coordinatedFlow: true
        }
      });
      
      this.logger.debug('Event sent successfully', {
        flowId,
        eventResult
      });
      
      // 2. Aguardar processamento e solicitar planejamento
      await new Promise(resolve => setTimeout(resolve, 1000)); // Pequena pausa
      
      const planningRequest = {
        eventId: initialEvent.id,
        flowId,
        requirements: initialEvent.payload?.requirements || {},
        context: initialEvent.payload?.context || {}
      };
      
      const planningResult = await this.requestPlanning(planningRequest);
      
      this.logger.debug('Planning completed', {
        flowId,
        planId: planningResult.planId
      });
      
      // 3. Executar plano
      const executionRequest = {
        planId: planningResult.planId,
        flowId,
        priority: initialEvent.metadata?.priority || 'normal'
      };
      
      const executionResult = await this.requestExecution(executionRequest);
      
      this.logger.debug('Execution started', {
        flowId,
        executionId: executionResult.executionId
      });
      
      // 4. Monitorar execução se solicitado
      if (trackProgress) {
        const finalStatus = await this.monitorExecution(
          executionResult.executionId,
          timeout - (Date.now() - startTime)
        );
        
        const totalDuration = Date.now() - startTime;
        
        this.logger.info('Coordinated flow completed', {
          flowId,
          finalStatus: finalStatus.status,
          duration: FormattingUtils.formatDuration(totalDuration)
        });
        
        return {
          flowId,
          eventResult,
          planningResult,
          executionResult,
          finalStatus,
          duration: totalDuration
        };
      }
      
      return {
        flowId,
        eventResult,
        planningResult,
        executionResult
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Coordinated flow failed', {
        flowId,
        duration: FormattingUtils.formatDuration(duration),
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Monitora execução até completar
   */
  async monitorExecution(executionId, timeout = 300000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 segundos
    
    while (Date.now() - startTime < timeout) {
      try {
        const status = await this.getExecutionStatus(executionId);
        
        if (['completed', 'failed', 'cancelled'].includes(status.status)) {
          return status;
        }
        
        this.logger.debug('Execution still running', {
          executionId,
          status: status.status,
          progress: status.progress
        });
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        this.logger.warn('Failed to check execution status', {
          executionId,
          error: error.message
        });
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error(`Execution monitoring timeout after ${FormattingUtils.formatDuration(timeout)}`);
  }

  /**
   * Obtém métricas de coordenação
   */
  getCoordinationMetrics() {
    const metrics = {
      agentClients: this.agentClients.size,
      circuitBreakers: {}
    };
    
    for (const [agentName, breaker] of this.circuitBreakers.entries()) {
      metrics.circuitBreakers[agentName] = {
        state: breaker.state,
        failures: breaker.failures,
        lastFailureTime: breaker.lastFailureTime ? 
          FormattingUtils.formatTimestamp(breaker.lastFailureTime) : null
      };
    }
    
    return metrics;
  }

  /**
   * Limpa recursos
   */
  async cleanup() {
    this.logger.info('Cleaning up coordination utils');
    
    // Limpar timers e recursos se houver
    this.agentClients.clear();
    this.circuitBreakers.clear();
    
    this.logger.info('Coordination utils cleanup completed');
  }
}

module.exports = CoordinationUtils;