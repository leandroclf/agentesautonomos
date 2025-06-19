/**
 * Circuit Breaker Service - Implementa o padrão Circuit Breaker
 * Monitora falhas e previne cascata de erros
 */

const EventEmitter = require('events');

class CircuitBreakerService extends EventEmitter {
  constructor(config, logger, metrics) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    
    // Estados dos circuit breakers por serviço
    this.circuits = new Map();
    
    // Pools de recursos para bulkhead
    this.resourcePools = new Map();
    
    // Intervalos de monitoramento
    this.monitoringInterval = null;
    this.resetInterval = null;
    
    this.isRunning = false;
    
    // Estados possíveis: 'closed', 'open', 'half-open'
    this.STATES = {
      CLOSED: 'closed',
      OPEN: 'open',
      HALF_OPEN: 'half-open'
    };
  }
  
  async initialize() {
    try {
      this.logger.info('Inicializando Circuit Breaker Service...');
      
      // Inicializar circuit breakers para serviços configurados
      this.initializeCircuits();
      
      // Inicializar pools de recursos
      this.initializeResourcePools();
      
      // Iniciar monitoramento
      this.startMonitoring();
      
      this.isRunning = true;
      this.logger.info('Circuit Breaker Service inicializado com sucesso');
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Circuit Breaker Service:', error);
      throw error;
    }
  }
  
  initializeCircuits() {
    const services = this.config.fallback.circuitBreaker.services || ['default'];
    
    for (const service of services) {
      this.circuits.set(service, {
        state: this.STATES.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        nextAttemptTime: null,
        totalRequests: 0,
        config: {
          failureThreshold: this.config.fallback.circuitBreaker.failureThreshold,
          recoveryTimeout: this.config.fallback.circuitBreaker.recoveryTimeout,
          successThreshold: this.config.fallback.circuitBreaker.successThreshold,
          timeout: this.config.fallback.circuitBreaker.timeout
        }
      });
      
      this.logger.info(`Circuit breaker inicializado para serviço: ${service}`);
    }
  }
  
  initializeResourcePools() {
    const pools = this.config.fallback.bulkhead.pools || { default: 10 };
    
    for (const [poolName, maxResources] of Object.entries(pools)) {
      this.resourcePools.set(poolName, {
        maxResources,
        usedResources: 0,
        waitingQueue: [],
        stats: {
          totalRequests: 0,
          rejectedRequests: 0,
          averageWaitTime: 0
        }
      });
      
      this.logger.info(`Pool de recursos inicializado: ${poolName} (${maxResources} recursos)`);
    }
  }
  
  startMonitoring() {
    // Monitoramento geral
    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();
      this.checkCircuitStates();
    }, this.config.fallback.circuitBreaker.monitoringInterval || 5000);
    
    // Reset automático de circuit breakers
    this.resetInterval = setInterval(() => {
      this.attemptCircuitReset();
    }, this.config.fallback.circuitBreaker.resetInterval || 30000);
    
    this.logger.info('Monitoramento de circuit breakers iniciado');
  }
  
  updateMetrics() {
    for (const [service, circuit] of this.circuits.entries()) {
      // Atualizar métrica de estado
      const stateValue = this.getStateValue(circuit.state);
      this.metrics.circuitBreakerState.set({ service }, stateValue);
    }
  }
  
  getStateValue(state) {
    switch (state) {
      case this.STATES.CLOSED: return 0;
      case this.STATES.OPEN: return 1;
      case this.STATES.HALF_OPEN: return 2;
      default: return -1;
    }
  }
  
  checkCircuitStates() {
    const now = Date.now();
    
    for (const [service, circuit] of this.circuits.entries()) {
      // Verificar se circuit breaker deve ser aberto
      if (circuit.state === this.STATES.CLOSED) {
        const failureRate = circuit.totalRequests > 0 ? 
          circuit.failureCount / circuit.totalRequests : 0;
          
        if (circuit.failureCount >= circuit.config.failureThreshold && 
            failureRate >= 0.5) {
          this.openCircuit(service);
        }
      }
      
      // Verificar se circuit breaker pode tentar half-open
      if (circuit.state === this.STATES.OPEN && 
          circuit.nextAttemptTime && 
          now >= circuit.nextAttemptTime) {
        this.halfOpenCircuit(service);
      }
    }
  }
  
  attemptCircuitReset() {
    for (const [service, circuit] of this.circuits.entries()) {
      if (circuit.state === this.STATES.HALF_OPEN) {
        // Verificar se houve sucessos suficientes para fechar
        if (circuit.successCount >= circuit.config.successThreshold) {
          this.closeCircuit(service);
        }
      }
    }
  }
  
  recordSuccess(service) {
    const circuit = this.circuits.get(service);
    if (!circuit) {
      this.logger.warn(`Circuit breaker não encontrado para serviço: ${service}`);
      return;
    }
    
    circuit.successCount++;
    circuit.totalRequests++;
    circuit.lastSuccessTime = Date.now();
    
    // Reset failure count em caso de sucesso
    if (circuit.state === this.STATES.CLOSED) {
      circuit.failureCount = Math.max(0, circuit.failureCount - 1);
    }
    
    // Verificar se pode fechar circuit em half-open
    if (circuit.state === this.STATES.HALF_OPEN && 
        circuit.successCount >= circuit.config.successThreshold) {
      this.closeCircuit(service);
    }
    
    this.logger.debug(`Sucesso registrado para serviço: ${service}`, {
      state: circuit.state,
      successCount: circuit.successCount,
      failureCount: circuit.failureCount
    });
  }
  
  recordFailure(service) {
    const circuit = this.circuits.get(service);
    if (!circuit) {
      this.logger.warn(`Circuit breaker não encontrado para serviço: ${service}`);
      return;
    }
    
    circuit.failureCount++;
    circuit.totalRequests++;
    circuit.lastFailureTime = Date.now();
    
    // Reset success count em caso de falha
    if (circuit.state === this.STATES.HALF_OPEN) {
      circuit.successCount = 0;
      this.openCircuit(service);
    }
    
    this.logger.debug(`Falha registrada para serviço: ${service}`, {
      state: circuit.state,
      successCount: circuit.successCount,
      failureCount: circuit.failureCount
    });
  }
  
  openCircuit(service) {
    const circuit = this.circuits.get(service);
    if (!circuit) return;
    
    circuit.state = this.STATES.OPEN;
    circuit.nextAttemptTime = Date.now() + circuit.config.recoveryTimeout;
    
    this.logger.warn(`Circuit breaker ABERTO para serviço: ${service}`, {
      failureCount: circuit.failureCount,
      nextAttemptTime: new Date(circuit.nextAttemptTime).toISOString()
    });
    
    this.emit('circuitOpened', { service, circuit });
  }
  
  halfOpenCircuit(service) {
    const circuit = this.circuits.get(service);
    if (!circuit) return;
    
    circuit.state = this.STATES.HALF_OPEN;
    circuit.successCount = 0;
    circuit.failureCount = 0;
    
    this.logger.info(`Circuit breaker MEIO-ABERTO para serviço: ${service}`);
    
    this.emit('circuitHalfOpened', { service, circuit });
  }
  
  closeCircuit(service) {
    const circuit = this.circuits.get(service);
    if (!circuit) return;
    
    circuit.state = this.STATES.CLOSED;
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.nextAttemptTime = null;
    
    this.logger.info(`Circuit breaker FECHADO para serviço: ${service}`);
    
    this.emit('circuitClosed', { service, circuit });
  }
  
  getState(service) {
    const circuit = this.circuits.get(service);
    return circuit ? circuit.state : this.STATES.CLOSED;
  }
  
  isCircuitOpen(service) {
    return this.getState(service) === this.STATES.OPEN;
  }
  
  isCircuitClosed(service) {
    return this.getState(service) === this.STATES.CLOSED;
  }
  
  isCircuitHalfOpen(service) {
    return this.getState(service) === this.STATES.HALF_OPEN;
  }
  
  canExecute(service) {
    const state = this.getState(service);
    return state === this.STATES.CLOSED || state === this.STATES.HALF_OPEN;
  }
  
  reset(service) {
    const circuit = this.circuits.get(service);
    if (!circuit) {
      this.logger.warn(`Circuit breaker não encontrado para reset: ${service}`);
      return;
    }
    
    this.closeCircuit(service);
    this.logger.info(`Circuit breaker resetado manualmente: ${service}`);
  }
  
  resetAll() {
    for (const service of this.circuits.keys()) {
      this.reset(service);
    }
    
    this.logger.info('Todos os circuit breakers foram resetados');
  }
  
  // Métodos para Bulkhead Pattern
  hasAvailableResources(poolName = 'default') {
    const pool = this.resourcePools.get(poolName);
    if (!pool) {
      this.logger.warn(`Pool de recursos não encontrado: ${poolName}`);
      return false;
    }
    
    return pool.usedResources < pool.maxResources;
  }
  
  reserveResource(poolName = 'default') {
    const pool = this.resourcePools.get(poolName);
    if (!pool) {
      throw new Error(`Pool de recursos não encontrado: ${poolName}`);
    }
    
    if (pool.usedResources >= pool.maxResources) {
      pool.stats.rejectedRequests++;
      throw new Error(`Pool de recursos esgotado: ${poolName}`);
    }
    
    pool.usedResources++;
    pool.stats.totalRequests++;
    
    this.logger.debug(`Recurso reservado no pool: ${poolName}`, {
      used: pool.usedResources,
      max: pool.maxResources
    });
    
    return true;
  }
  
  releaseResource(poolName = 'default') {
    const pool = this.resourcePools.get(poolName);
    if (!pool) {
      this.logger.warn(`Pool de recursos não encontrado: ${poolName}`);
      return;
    }
    
    if (pool.usedResources > 0) {
      pool.usedResources--;
      
      this.logger.debug(`Recurso liberado no pool: ${poolName}`, {
        used: pool.usedResources,
        max: pool.maxResources
      });
    }
  }
  
  getPoolStats(poolName = 'default') {
    const pool = this.resourcePools.get(poolName);
    if (!pool) {
      return null;
    }
    
    return {
      poolName,
      maxResources: pool.maxResources,
      usedResources: pool.usedResources,
      availableResources: pool.maxResources - pool.usedResources,
      utilizationRate: pool.usedResources / pool.maxResources,
      stats: { ...pool.stats }
    };
  }
  
  getAllPoolStats() {
    const stats = {};
    
    for (const poolName of this.resourcePools.keys()) {
      stats[poolName] = this.getPoolStats(poolName);
    }
    
    return stats;
  }
  
  getCircuitStats(service) {
    const circuit = this.circuits.get(service);
    if (!circuit) {
      return null;
    }
    
    const now = Date.now();
    const failureRate = circuit.totalRequests > 0 ? 
      circuit.failureCount / circuit.totalRequests : 0;
    
    return {
      service,
      state: circuit.state,
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      totalRequests: circuit.totalRequests,
      failureRate,
      lastFailureTime: circuit.lastFailureTime ? 
        new Date(circuit.lastFailureTime).toISOString() : null,
      lastSuccessTime: circuit.lastSuccessTime ? 
        new Date(circuit.lastSuccessTime).toISOString() : null,
      nextAttemptTime: circuit.nextAttemptTime ? 
        new Date(circuit.nextAttemptTime).toISOString() : null,
      timeUntilNextAttempt: circuit.nextAttemptTime ? 
        Math.max(0, circuit.nextAttemptTime - now) : null
    };
  }
  
  getAllCircuitStats() {
    const stats = {};
    
    for (const service of this.circuits.keys()) {
      stats[service] = this.getCircuitStats(service);
    }
    
    return stats;
  }
  
  // Configuração dinâmica
  updateCircuitConfig(service, config) {
    const circuit = this.circuits.get(service);
    if (!circuit) {
      this.logger.warn(`Circuit breaker não encontrado para configuração: ${service}`);
      return false;
    }
    
    Object.assign(circuit.config, config);
    
    this.logger.info(`Configuração atualizada para circuit breaker: ${service}`, config);
    return true;
  }
  
  updatePoolConfig(poolName, maxResources) {
    const pool = this.resourcePools.get(poolName);
    if (!pool) {
      this.logger.warn(`Pool de recursos não encontrado para configuração: ${poolName}`);
      return false;
    }
    
    pool.maxResources = maxResources;
    
    this.logger.info(`Configuração atualizada para pool: ${poolName}`, { maxResources });
    return true;
  }
  
  isHealthy() {
    return this.isRunning;
  }
  
  getStatus() {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      circuits: this.getAllCircuitStats(),
      resourcePools: this.getAllPoolStats(),
      totalCircuits: this.circuits.size,
      totalPools: this.resourcePools.size
    };
  }
  
  async stop() {
    this.logger.info('Parando Circuit Breaker Service...');
    
    this.isRunning = false;
    
    // Parar intervalos
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }
    
    this.logger.info('Circuit Breaker Service parado');
  }
}

module.exports = CircuitBreakerService;