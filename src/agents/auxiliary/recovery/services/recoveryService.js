/**
 * Recovery Service
 * Serviço responsável pela lógica de recuperação automática de agentes
 */

const EventEmitter = require('events');
const axios = require('axios');
const config = require('../config/recoveryConfig');

class RecoveryService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.isRunning = false;
    
    // Estado do serviço
    this.activeRecoveries = new Map();
    this.recentRecoveries = [];
    this.recoveryHistory = new Map();
    this.cooldownTimers = new Map();
    
    // Estatísticas
    this.stats = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0,
      lastRecoveryTime: null
    };
    
    // Configurações
    this.strategies = config.recovery.strategies;
    this.limits = config.recovery.limits;
    this.timeouts = config.recovery.timeouts;
    this.retry = config.recovery.retry;
    this.cooldown = config.recovery.cooldown;
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Recovery Service already running');
      return;
    }

    this.logger.info('Starting Recovery Service');
    this.isRunning = true;
    
    // Inicializar limpeza periódica
    this.startCleanupTimer();
    
    this.logger.info('Recovery Service started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Recovery Service not running');
      return;
    }

    this.logger.info('Stopping Recovery Service');
    this.isRunning = false;
    
    // Cancelar recoveries ativas
    for (const [recoveryId, recovery] of this.activeRecoveries) {
      try {
        await this.cancelRecovery(recoveryId, 'service_shutdown');
      } catch (error) {
        this.logger.error('Error canceling recovery during shutdown', {
          recoveryId,
          error: error.message
        });
      }
    }
    
    // Limpar timers
    this.clearAllTimers();
    
    this.logger.info('Recovery Service stopped');
  }

  isRunning() {
    return this.isRunning;
  }

  async triggerRecovery(request) {
    try {
      // Validar request
      const validationResult = this.validateRecoveryRequest(request);
      if (!validationResult.valid) {
        throw new Error(`Invalid recovery request: ${validationResult.error}`);
      }

      const { agent, strategy = 'auto', reason, details = {}, timestamp } = request;
      const recoveryId = this.generateRecoveryId(agent, timestamp);

      // Verificar limites
      if (!this.checkLimits(agent)) {
        throw new Error('Recovery limits exceeded for agent');
      }

      // Verificar cooldown
      if (this.isInCooldown(agent)) {
        throw new Error('Agent is in cooldown period');
      }

      // Determinar estratégia
      const selectedStrategy = this.selectStrategy(strategy, agent, reason);
      
      // Criar recovery
      const recovery = {
        id: recoveryId,
        agent,
        strategy: selectedStrategy,
        reason,
        details,
        status: 'initiated',
        startTime: new Date(),
        attempts: 0,
        maxAttempts: this.strategies[selectedStrategy].maxAttempts,
        timeout: this.strategies[selectedStrategy].timeout,
        history: []
      };

      // Registrar recovery
      this.activeRecoveries.set(recoveryId, recovery);
      this.updateRecoveryHistory(agent, recovery);

      this.logger.info('Recovery initiated', {
        recoveryId,
        agent,
        strategy: selectedStrategy,
        reason
      });

      // Emitir evento
      this.emit('recoveryStarted', {
        recoveryId,
        agent,
        strategy: selectedStrategy,
        reason,
        timestamp: recovery.startTime.toISOString()
      });

      // Executar recovery
      this.executeRecovery(recoveryId);

      return { recoveryId, strategy: selectedStrategy };

    } catch (error) {
      this.logger.error('Error triggering recovery', {
        request,
        error: error.message
      });
      throw error;
    }
  }

  async executeRecovery(recoveryId) {
    const recovery = this.activeRecoveries.get(recoveryId);
    if (!recovery) {
      this.logger.error('Recovery not found', { recoveryId });
      return;
    }

    try {
      recovery.status = 'executing';
      recovery.attempts++;
      
      const startTime = Date.now();
      
      this.logger.info('Executing recovery', {
        recoveryId,
        agent: recovery.agent,
        strategy: recovery.strategy,
        attempt: recovery.attempts
      });

      // Executar estratégia específica
      const result = await this.executeStrategy(recovery);
      
      const duration = Date.now() - startTime;
      recovery.duration = duration;
      recovery.status = 'completed';
      recovery.endTime = new Date();
      recovery.result = result;

      // Atualizar estatísticas
      this.updateStats(recovery, true);

      // Mover para histórico
      this.moveToHistory(recovery);
      this.activeRecoveries.delete(recoveryId);

      // Definir cooldown
      this.setCooldown(recovery.agent, this.cooldown.betweenRecoveries);

      this.logger.info('Recovery completed successfully', {
        recoveryId,
        agent: recovery.agent,
        strategy: recovery.strategy,
        duration,
        result
      });

      // Emitir evento
      this.emit('recoveryCompleted', {
        recoveryId,
        agent: recovery.agent,
        strategy: recovery.strategy,
        duration,
        result,
        timestamp: recovery.endTime.toISOString()
      });

    } catch (error) {
      await this.handleRecoveryFailure(recoveryId, error);
    }
  }

  async executeStrategy(recovery) {
    const { strategy, agent } = recovery;
    
    switch (strategy) {
      case 'restart':
        return await this.executeRestart(recovery);
      
      case 'graceful_restart':
        return await this.executeGracefulRestart(recovery);
      
      case 'force_restart':
        return await this.executeForceRestart(recovery);
      
      case 'health_reset':
        return await this.executeHealthReset(recovery);
      
      case 'service_restart':
        return await this.executeServiceRestart(recovery);
      
      default:
        throw new Error(`Unknown recovery strategy: ${strategy}`);
    }
  }

  async executeRestart(recovery) {
    const { agent } = recovery;
    
    // Obter informações do agente
    const agentInfo = await this.getAgentInfo(agent);
    if (!agentInfo) {
      throw new Error(`Agent info not found: ${agent}`);
    }

    // Executar restart via RestartService
    const RestartService = require('./restartService');
    const restartService = new RestartService(this.logger);
    
    const result = await restartService.restartAgent(agent, {
      method: 'auto',
      timeout: recovery.timeout,
      verify: true
    });

    return {
      method: 'restart',
      success: result.success,
      details: result
    };
  }

  async executeGracefulRestart(recovery) {
    const { agent } = recovery;
    
    try {
      // Tentar shutdown gracioso primeiro
      await this.sendGracefulShutdown(agent);
      
      // Aguardar um pouco
      await this.sleep(5000);
      
      // Verificar se parou
      const isRunning = await this.checkAgentStatus(agent);
      if (isRunning) {
        // Se ainda está rodando, forçar parada
        await this.executeForceRestart(recovery);
      } else {
        // Iniciar novamente
        await this.startAgent(agent);
      }
      
      return {
        method: 'graceful_restart',
        success: true,
        details: 'Agent restarted gracefully'
      };
      
    } catch (error) {
      // Fallback para restart normal
      return await this.executeRestart(recovery);
    }
  }

  async executeForceRestart(recovery) {
    const { agent } = recovery;
    
    // Forçar parada do agente
    await this.forceStopAgent(agent);
    
    // Aguardar um pouco
    await this.sleep(2000);
    
    // Iniciar novamente
    await this.startAgent(agent);
    
    return {
      method: 'force_restart',
      success: true,
      details: 'Agent force restarted'
    };
  }

  async executeHealthReset(recovery) {
    const { agent } = recovery;
    
    try {
      // Resetar estado de saúde
      await this.resetAgentHealth(agent);
      
      // Verificar se voltou ao normal
      const healthStatus = await this.checkAgentHealth(agent);
      
      return {
        method: 'health_reset',
        success: healthStatus.healthy,
        details: healthStatus
      };
      
    } catch (error) {
      throw new Error(`Health reset failed: ${error.message}`);
    }
  }

  async executeServiceRestart(recovery) {
    const { agent, details } = recovery;
    
    try {
      // Reiniciar serviços específicos do agente
      const services = details.services || ['main'];
      const results = [];
      
      for (const service of services) {
        const result = await this.restartAgentService(agent, service);
        results.push(result);
      }
      
      return {
        method: 'service_restart',
        success: results.every(r => r.success),
        details: results
      };
      
    } catch (error) {
      throw new Error(`Service restart failed: ${error.message}`);
    }
  }

  async handleRecoveryFailure(recoveryId, error) {
    const recovery = this.activeRecoveries.get(recoveryId);
    if (!recovery) return;

    recovery.status = 'failed';
    recovery.error = error.message;
    recovery.endTime = new Date();

    this.logger.error('Recovery failed', {
      recoveryId,
      agent: recovery.agent,
      strategy: recovery.strategy,
      attempt: recovery.attempts,
      error: error.message
    });

    // Verificar se deve tentar novamente
    if (recovery.attempts < recovery.maxAttempts) {
      const delay = this.calculateRetryDelay(recovery.attempts);
      
      this.logger.info('Scheduling recovery retry', {
        recoveryId,
        attempt: recovery.attempts + 1,
        delay
      });
      
      setTimeout(() => {
        this.executeRecovery(recoveryId);
      }, delay);
      
      return;
    }

    // Falha definitiva
    this.updateStats(recovery, false);
    this.moveToHistory(recovery);
    this.activeRecoveries.delete(recoveryId);

    // Definir cooldown maior após falha
    this.setCooldown(recovery.agent, this.cooldown.afterFailure);

    // Determinar se deve escalar
    const shouldEscalate = this.shouldEscalate(recovery);

    // Emitir evento
    this.emit('recoveryFailed', {
      recoveryId,
      agent: recovery.agent,
      strategy: recovery.strategy,
      error: error.message,
      attempts: recovery.attempts,
      shouldEscalate,
      timestamp: recovery.endTime.toISOString()
    });
  }

  // Métodos auxiliares
  validateRecoveryRequest(request) {
    if (!request.agent) {
      return { valid: false, error: 'Agent name is required' };
    }
    
    if (request.strategy && !this.strategies[request.strategy] && request.strategy !== 'auto') {
      return { valid: false, error: 'Invalid recovery strategy' };
    }
    
    return { valid: true };
  }

  selectStrategy(requestedStrategy, agent, reason) {
    if (requestedStrategy !== 'auto' && this.strategies[requestedStrategy]) {
      return requestedStrategy;
    }

    // Lógica de seleção automática baseada no motivo
    switch (reason) {
      case 'health_check_failure':
        return 'health_reset';
      case 'agent_failure':
        return 'restart';
      case 'service_failure':
        return 'service_restart';
      case 'critical_error':
        return 'force_restart';
      default:
        return 'restart';
    }
  }

  checkLimits(agent) {
    // Verificar limite de recoveries concorrentes
    if (this.activeRecoveries.size >= this.limits.maxConcurrentRecoveries) {
      return false;
    }

    // Verificar limite por agente
    const agentRecoveries = Array.from(this.activeRecoveries.values())
      .filter(r => r.agent === agent);
    
    if (agentRecoveries.length >= this.limits.maxRecoveriesPerAgent) {
      return false;
    }

    // Verificar limite por hora
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRecoveries = this.recentRecoveries
      .filter(r => r.startTime > oneHourAgo && r.agent === agent);
    
    if (recentRecoveries.length >= this.limits.maxRecoveriesPerHour) {
      return false;
    }

    return true;
  }

  isInCooldown(agent) {
    return this.cooldownTimers.has(agent);
  }

  setCooldown(agent, duration) {
    if (this.cooldownTimers.has(agent)) {
      clearTimeout(this.cooldownTimers.get(agent));
    }

    const timer = setTimeout(() => {
      this.cooldownTimers.delete(agent);
    }, duration);

    this.cooldownTimers.set(agent, timer);
  }

  calculateRetryDelay(attempt) {
    const baseDelay = this.retry.baseDelay;
    const multiplier = this.retry.backoffMultiplier;
    const maxDelay = this.retry.maxDelay;
    
    const delay = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), maxDelay);
    return delay;
  }

  shouldEscalate(recovery) {
    const agentHistory = this.recoveryHistory.get(recovery.agent) || [];
    const recentFailures = agentHistory
      .filter(r => r.status === 'failed')
      .filter(r => Date.now() - r.endTime.getTime() < 60 * 60 * 1000); // última hora
    
    return recentFailures.length >= 3; // Escalar após 3 falhas na última hora
  }

  updateStats(recovery, success) {
    this.stats.totalRecoveries++;
    
    if (success) {
      this.stats.successfulRecoveries++;
    } else {
      this.stats.failedRecoveries++;
    }
    
    if (recovery.duration) {
      const totalTime = this.stats.averageRecoveryTime * (this.stats.totalRecoveries - 1) + recovery.duration;
      this.stats.averageRecoveryTime = totalTime / this.stats.totalRecoveries;
    }
    
    this.stats.lastRecoveryTime = new Date();
  }

  updateRecoveryHistory(agent, recovery) {
    if (!this.recoveryHistory.has(agent)) {
      this.recoveryHistory.set(agent, []);
    }
    
    const history = this.recoveryHistory.get(agent);
    history.push(recovery);
    
    // Manter apenas os últimos 50 registros
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  moveToHistory(recovery) {
    this.recentRecoveries.push(recovery);
    
    // Manter apenas os últimos 100 registros
    if (this.recentRecoveries.length > 100) {
      this.recentRecoveries.splice(0, this.recentRecoveries.length - 100);
    }
  }

  generateRecoveryId(agent, timestamp) {
    const time = timestamp ? new Date(timestamp).getTime() : Date.now();
    return `recovery_${agent}_${time}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanupOldRecords();
    }, 60 * 60 * 1000); // A cada hora
  }

  cleanupOldRecords() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Limpar histórico antigo
    this.recentRecoveries = this.recentRecoveries
      .filter(r => r.startTime > oneDayAgo);
    
    // Limpar histórico por agente
    for (const [agent, history] of this.recoveryHistory) {
      const filteredHistory = history.filter(r => r.startTime > oneDayAgo);
      if (filteredHistory.length === 0) {
        this.recoveryHistory.delete(agent);
      } else {
        this.recoveryHistory.set(agent, filteredHistory);
      }
    }
  }

  clearAllTimers() {
    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }
    this.cooldownTimers.clear();
  }

  // Métodos de integração com agentes
  async getAgentInfo(agent) {
    // Implementar lógica para obter informações do agente
    // Pode consultar um registry de agentes ou configuração
    return {
      name: agent,
      port: this.getAgentPort(agent),
      healthEndpoint: '/health'
    };
  }

  getAgentPort(agent) {
    // Mapear agentes para suas portas
    const portMap = {
      'planning-agent': 3001,
      'execution-agent': 3002,
      'event-agent': 3003,
      'monitoring-agent': 3004,
      'learning-agent': 3005,
      'coordination-agent': 3006,
      'marl-agent': 3007,
      'mediation-agent': 3008,
      'orchestration-agent': 3009,
      'data-collection-agent': 3010,
      'notification-agent': 3011,
      'security-agent': 3012,
      'health-checker-agent': 3013
    };
    
    return portMap[agent] || 3000;
  }

  async checkAgentStatus(agent) {
    try {
      const agentInfo = await this.getAgentInfo(agent);
      const response = await axios.get(`http://localhost:${agentInfo.port}/health`, {
        timeout: 5000
      });
      
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async checkAgentHealth(agent) {
    try {
      const agentInfo = await this.getAgentInfo(agent);
      const response = await axios.get(`http://localhost:${agentInfo.port}/health`, {
        timeout: 5000
      });
      
      return {
        healthy: response.status === 200,
        status: response.data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async sendGracefulShutdown(agent) {
    const agentInfo = await this.getAgentInfo(agent);
    await axios.post(`http://localhost:${agentInfo.port}/shutdown`, {}, {
      timeout: 10000
    });
  }

  async resetAgentHealth(agent) {
    const agentInfo = await this.getAgentInfo(agent);
    await axios.post(`http://localhost:${agentInfo.port}/health/reset`, {}, {
      timeout: 5000
    });
  }

  async forceStopAgent(agent) {
    // Implementar lógica para forçar parada do agente
    // Pode usar PM2, Docker, ou outros métodos
    this.logger.info('Force stopping agent', { agent });
  }

  async startAgent(agent) {
    // Implementar lógica para iniciar agente
    // Pode usar PM2, Docker, ou outros métodos
    this.logger.info('Starting agent', { agent });
  }

  async restartAgentService(agent, service) {
    // Implementar lógica para reiniciar serviço específico
    this.logger.info('Restarting agent service', { agent, service });
    return { success: true };
  }

  async cancelRecovery(recoveryId, reason) {
    const recovery = this.activeRecoveries.get(recoveryId);
    if (!recovery) {
      throw new Error('Recovery not found');
    }

    recovery.status = 'cancelled';
    recovery.endTime = new Date();
    recovery.cancelReason = reason;

    this.activeRecoveries.delete(recoveryId);
    this.moveToHistory(recovery);

    this.logger.info('Recovery cancelled', {
      recoveryId,
      agent: recovery.agent,
      reason
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getters para status
  getActiveRecoveries() {
    return Array.from(this.activeRecoveries.values());
  }

  getRecentRecoveries() {
    return this.recentRecoveries.slice(-20); // Últimos 20
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = RecoveryService;