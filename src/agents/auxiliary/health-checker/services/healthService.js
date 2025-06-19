/**
 * Health Service - Serviço de verificação de saúde dos agentes
 * Responsável por executar health checks e detectar falhas
 */

const axios = require('axios');
const EventEmitter = require('events');
const config = require('../config/healthConfig');
const Logger = require('../../../../utils/logger');

class HealthService extends EventEmitter {
  constructor() {
    super();
    this.logger = new Logger('health-service');
    this.agentStatus = new Map();
    this.healthCheckInterval = null;
    this.isRunning = false;
    this.metrics = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      lastCheckTime: null
    };
    
    // Inicializar status dos agentes
    this.initializeAgentStatus();
  }

  /**
   * Inicializar status dos agentes monitorados
   */
  initializeAgentStatus() {
    config.monitoredAgents.forEach(agent => {
      this.agentStatus.set(agent.name, {
        name: agent.name,
        url: agent.url,
        status: 'unknown',
        lastCheck: null,
        lastSuccess: null,
        lastFailure: null,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        responseTime: null,
        errorMessage: null,
        critical: agent.critical,
        uptime: 0,
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0
      });
    });
  }

  /**
   * Iniciar o serviço de health checking
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Health service já está em execução');
      return;
    }

    this.logger.info('Iniciando Health Service', {
      interval: config.healthCheck.interval,
      agentsCount: config.monitoredAgents.length
    });

    this.isRunning = true;
    this.startHealthChecks();
    
    this.emit('started');
  }

  /**
   * Parar o serviço de health checking
   */
  stop() {
    if (!this.isRunning) {
      this.logger.warn('Health service não está em execução');
      return;
    }

    this.logger.info('Parando Health Service');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Iniciar verificações periódicas de saúde
   */
  startHealthChecks() {
    // Executar primeira verificação imediatamente
    this.performHealthChecks();
    
    // Configurar verificações periódicas
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, config.healthCheck.interval);
  }

  /**
   * Executar verificações de saúde em todos os agentes
   */
  async performHealthChecks() {
    const startTime = Date.now();
    this.logger.debug('Iniciando verificações de saúde');

    const checkPromises = config.monitoredAgents.map(agent => 
      this.checkAgentHealth(agent)
    );

    try {
      await Promise.allSettled(checkPromises);
      
      const duration = Date.now() - startTime;
      this.updateMetrics(duration);
      
      this.logger.debug('Verificações de saúde concluídas', {
        duration,
        totalAgents: config.monitoredAgents.length
      });
      
      this.emit('healthCheckCompleted', {
        duration,
        timestamp: new Date().toISOString(),
        agentStatus: this.getSystemStatus()
      });
      
    } catch (error) {
      this.logger.error('Erro durante verificações de saúde', { error: error.message });
    }
  }

  /**
   * Verificar saúde de um agente específico
   */
  async checkAgentHealth(agentConfig) {
    const agentName = agentConfig.name;
    const startTime = Date.now();
    
    try {
      const response = await this.makeHealthRequest(agentConfig);
      const responseTime = Date.now() - startTime;
      
      this.handleSuccessfulCheck(agentName, response, responseTime);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.handleFailedCheck(agentName, error, responseTime);
    }
  }

  /**
   * Fazer requisição de health check para um agente
   */
  async makeHealthRequest(agentConfig) {
    const url = `${agentConfig.url}${agentConfig.healthEndpoint}`;
    const timeout = agentConfig.timeout || config.healthCheck.timeout;
    
    const response = await axios.get(url, {
      timeout,
      validateStatus: (status) => status < 500, // Aceitar 2xx, 3xx, 4xx
      headers: {
        'User-Agent': 'Health-Checker-Agent/1.0',
        'Accept': 'application/json'
      }
    });
    
    return response;
  }

  /**
   * Processar verificação bem-sucedida
   */
  handleSuccessfulCheck(agentName, response, responseTime) {
    const agentStatus = this.agentStatus.get(agentName);
    const now = new Date().toISOString();
    const wasDown = agentStatus.status === 'down';
    
    // Atualizar status
    agentStatus.status = response.status === 200 ? 'healthy' : 'degraded';
    agentStatus.lastCheck = now;
    agentStatus.lastSuccess = now;
    agentStatus.responseTime = responseTime;
    agentStatus.errorMessage = null;
    agentStatus.consecutiveFailures = 0;
    agentStatus.consecutiveSuccesses++;
    agentStatus.totalChecks++;
    agentStatus.successfulChecks++;
    
    // Calcular uptime
    if (agentStatus.status === 'healthy') {
      agentStatus.uptime = this.calculateUptime(agentStatus);
    }
    
    this.logger.debug(`Health check bem-sucedido para ${agentName}`, {
      status: agentStatus.status,
      responseTime,
      consecutiveSuccesses: agentStatus.consecutiveSuccesses
    });
    
    // Emitir evento de recuperação se o agente estava down
    if (wasDown && agentStatus.consecutiveSuccesses >= config.healthCheck.recoveryThreshold) {
      this.emit('agentRecovered', {
        agentName,
        timestamp: now,
        responseTime,
        previousStatus: 'down',
        currentStatus: agentStatus.status
      });
    }
    
    // Emitir evento de status atualizado
    this.emit('agentStatusUpdated', {
      agentName,
      status: agentStatus.status,
      responseTime,
      timestamp: now
    });
  }

  /**
   * Processar verificação falhada
   */
  handleFailedCheck(agentName, error, responseTime) {
    const agentStatus = this.agentStatus.get(agentName);
    const now = new Date().toISOString();
    const wasHealthy = agentStatus.status === 'healthy';
    
    // Atualizar status
    agentStatus.lastCheck = now;
    agentStatus.lastFailure = now;
    agentStatus.responseTime = responseTime;
    agentStatus.errorMessage = error.message;
    agentStatus.consecutiveFailures++;
    agentStatus.consecutiveSuccesses = 0;
    agentStatus.totalChecks++;
    agentStatus.failedChecks++;
    
    // Determinar status baseado no número de falhas consecutivas
    if (agentStatus.consecutiveFailures >= config.healthCheck.alertThreshold) {
      agentStatus.status = 'down';
    } else {
      agentStatus.status = 'degraded';
    }
    
    this.logger.warn(`Health check falhou para ${agentName}`, {
      error: error.message,
      responseTime,
      consecutiveFailures: agentStatus.consecutiveFailures,
      status: agentStatus.status
    });
    
    // Emitir evento de falha se atingiu o threshold
    if (agentStatus.consecutiveFailures === config.healthCheck.alertThreshold) {
      this.emit('agentDown', {
        agentName,
        timestamp: now,
        error: error.message,
        consecutiveFailures: agentStatus.consecutiveFailures,
        critical: agentStatus.critical
      });
    }
    
    // Emitir evento de degradação se era saudável
    if (wasHealthy && agentStatus.status === 'degraded') {
      this.emit('agentDegraded', {
        agentName,
        timestamp: now,
        error: error.message,
        responseTime
      });
    }
    
    // Emitir evento de status atualizado
    this.emit('agentStatusUpdated', {
      agentName,
      status: agentStatus.status,
      error: error.message,
      timestamp: now
    });
  }

  /**
   * Calcular uptime do agente
   */
  calculateUptime(agentStatus) {
    if (agentStatus.totalChecks === 0) return 0;
    return (agentStatus.successfulChecks / agentStatus.totalChecks) * 100;
  }

  /**
   * Atualizar métricas gerais
   */
  updateMetrics(duration) {
    this.metrics.totalChecks++;
    this.metrics.lastCheckTime = new Date().toISOString();
    
    // Calcular média de tempo de resposta
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = duration;
    } else {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime + duration) / 2;
    }
    
    // Contar sucessos e falhas
    let successCount = 0;
    let failureCount = 0;
    
    this.agentStatus.forEach(status => {
      if (status.status === 'healthy') {
        successCount++;
      } else {
        failureCount++;
      }
    });
    
    this.metrics.successfulChecks = successCount;
    this.metrics.failedChecks = failureCount;
  }

  /**
   * Obter status do sistema
   */
  getSystemStatus() {
    const agents = Array.from(this.agentStatus.values());
    const healthyAgents = agents.filter(a => a.status === 'healthy').length;
    const degradedAgents = agents.filter(a => a.status === 'degraded').length;
    const downAgents = agents.filter(a => a.status === 'down').length;
    const criticalDown = agents.filter(a => a.status === 'down' && a.critical).length;
    
    return {
      overall: criticalDown > 0 ? 'critical' : downAgents > 0 ? 'degraded' : 'healthy',
      totalAgents: agents.length,
      healthyAgents,
      degradedAgents,
      downAgents,
      criticalDown,
      lastCheck: this.metrics.lastCheckTime,
      agents: agents.map(agent => ({
        name: agent.name,
        status: agent.status,
        responseTime: agent.responseTime,
        uptime: agent.uptime,
        lastCheck: agent.lastCheck,
        critical: agent.critical
      }))
    };
  }

  /**
   * Obter status de um agente específico
   */
  getAgentStatus(agentName) {
    return this.agentStatus.get(agentName);
  }

  /**
   * Obter métricas do serviço
   */
  getMetrics() {
    return {
      ...this.metrics,
      systemStatus: this.getSystemStatus()
    };
  }

  /**
   * Verificar se o serviço está em execução
   */
  isHealthy() {
    return this.isRunning;
  }
}

module.exports = HealthService;