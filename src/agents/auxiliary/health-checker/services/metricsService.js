/**
 * Metrics Service - Serviço de coleta e agregação de métricas
 * Responsável por coletar, processar e armazenar métricas de saúde
 */

const EventEmitter = require('events');
const config = require('../config/healthConfig');
const Logger = require('../../../../utils/logger');

class MetricsService extends EventEmitter {
  constructor() {
    super();
    this.logger = new Logger('metrics-service');
    this.metrics = new Map();
    this.aggregatedMetrics = new Map();
    this.aggregationInterval = null;
    this.isRunning = false;
    
    // Configurações
    this.retentionHours = config.metrics.historyRetention;
    this.aggregationIntervalMs = config.metrics.aggregationInterval;
    
    // Inicializar estruturas de dados
    this.initializeMetrics();
  }

  /**
   * Inicializar estruturas de métricas
   */
  initializeMetrics() {
    // Métricas por agente
    config.monitoredAgents.forEach(agent => {
      this.metrics.set(agent.name, {
        agentName: agent.name,
        responseTime: {
          current: 0,
          min: Infinity,
          max: 0,
          avg: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          history: []
        },
        availability: {
          current: 0,
          uptime: 0,
          downtime: 0,
          totalChecks: 0,
          successfulChecks: 0,
          failedChecks: 0
        },
        errors: {
          total: 0,
          rate: 0,
          lastError: null,
          errorTypes: new Map()
        },
        trends: {
          responseTimeTrend: 'stable',
          availabilityTrend: 'stable',
          errorRateTrend: 'stable'
        },
        lastUpdated: new Date().toISOString()
      });
    });
    
    // Métricas do sistema
    this.systemMetrics = {
      overall: {
        healthyAgents: 0,
        degradedAgents: 0,
        downAgents: 0,
        totalAgents: config.monitoredAgents.length,
        systemHealth: 100
      },
      performance: {
        avgResponseTime: 0,
        totalThroughput: 0,
        errorRate: 0
      },
      alerts: {
        active: 0,
        total24h: 0,
        criticalCount: 0
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Iniciar o serviço de métricas
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Metrics service já está em execução');
      return;
    }

    this.logger.info('Iniciando Metrics Service', {
      aggregationInterval: this.aggregationIntervalMs,
      retentionHours: this.retentionHours
    });

    this.isRunning = true;
    this.startAggregation();
    
    this.emit('started');
  }

  /**
   * Parar o serviço de métricas
   */
  stop() {
    if (!this.isRunning) {
      this.logger.warn('Metrics service não está em execução');
      return;
    }

    this.logger.info('Parando Metrics Service');
    
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = null;
    }
    
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Iniciar agregação periódica de métricas
   */
  startAggregation() {
    this.aggregationInterval = setInterval(() => {
      this.aggregateMetrics();
      this.cleanupOldMetrics();
    }, this.aggregationIntervalMs);
  }

  /**
   * Processar atualização de status de agente
   */
  processAgentStatusUpdate(eventData) {
    const { agentName, status, responseTime, timestamp, error } = eventData;
    const agentMetrics = this.metrics.get(agentName);
    
    if (!agentMetrics) {
      this.logger.warn(`Métricas não encontradas para agente: ${agentName}`);
      return;
    }

    // Atualizar métricas de tempo de resposta
    if (responseTime !== undefined) {
      this.updateResponseTimeMetrics(agentMetrics, responseTime);
    }

    // Atualizar métricas de disponibilidade
    this.updateAvailabilityMetrics(agentMetrics, status);

    // Atualizar métricas de erro
    if (error) {
      this.updateErrorMetrics(agentMetrics, error);
    }

    // Atualizar timestamp
    agentMetrics.lastUpdated = timestamp;

    this.logger.debug(`Métricas atualizadas para ${agentName}`, {
      status,
      responseTime,
      availability: agentMetrics.availability.current
    });

    this.emit('metricsUpdated', { agentName, metrics: agentMetrics });
  }

  /**
   * Atualizar métricas de tempo de resposta
   */
  updateResponseTimeMetrics(agentMetrics, responseTime) {
    const rt = agentMetrics.responseTime;
    
    rt.current = responseTime;
    rt.min = Math.min(rt.min, responseTime);
    rt.max = Math.max(rt.max, responseTime);
    
    // Adicionar ao histórico
    rt.history.push({
      value: responseTime,
      timestamp: new Date().toISOString()
    });
    
    // Limitar histórico (últimas 1000 medições)
    if (rt.history.length > 1000) {
      rt.history.shift();
    }
    
    // Calcular estatísticas
    this.calculateResponseTimeStats(agentMetrics);
  }

  /**
   * Calcular estatísticas de tempo de resposta
   */
  calculateResponseTimeStats(agentMetrics) {
    const history = agentMetrics.responseTime.history;
    if (history.length === 0) return;
    
    const values = history.map(h => h.value).sort((a, b) => a - b);
    const rt = agentMetrics.responseTime;
    
    // Média
    rt.avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Percentis
    rt.p50 = this.calculatePercentile(values, 50);
    rt.p95 = this.calculatePercentile(values, 95);
    rt.p99 = this.calculatePercentile(values, 99);
  }

  /**
   * Calcular percentil
   */
  calculatePercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Atualizar métricas de disponibilidade
   */
  updateAvailabilityMetrics(agentMetrics, status) {
    const availability = agentMetrics.availability;
    
    availability.totalChecks++;
    
    if (status === 'healthy') {
      availability.successfulChecks++;
    } else {
      availability.failedChecks++;
    }
    
    // Calcular disponibilidade atual
    availability.current = (availability.successfulChecks / availability.totalChecks) * 100;
    
    // Calcular uptime/downtime (baseado nos últimos checks)
    const recentChecks = Math.min(availability.totalChecks, 100); // Últimos 100 checks
    const recentSuccesses = Math.min(availability.successfulChecks, recentChecks);
    
    availability.uptime = (recentSuccesses / recentChecks) * 100;
    availability.downtime = 100 - availability.uptime;
  }

  /**
   * Atualizar métricas de erro
   */
  updateErrorMetrics(agentMetrics, error) {
    const errors = agentMetrics.errors;
    
    errors.total++;
    errors.lastError = {
      message: error,
      timestamp: new Date().toISOString()
    };
    
    // Categorizar tipo de erro
    const errorType = this.categorizeError(error);
    const currentCount = errors.errorTypes.get(errorType) || 0;
    errors.errorTypes.set(errorType, currentCount + 1);
    
    // Calcular taxa de erro
    const availability = agentMetrics.availability;
    if (availability.totalChecks > 0) {
      errors.rate = (errors.total / availability.totalChecks) * 100;
    }
  }

  /**
   * Categorizar tipo de erro
   */
  categorizeError(errorMessage) {
    const message = errorMessage.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('connection')) return 'connection';
    if (message.includes('404')) return 'not_found';
    if (message.includes('500')) return 'server_error';
    if (message.includes('503')) return 'service_unavailable';
    
    return 'unknown';
  }

  /**
   * Agregar métricas do sistema
   */
  aggregateMetrics() {
    this.logger.debug('Agregando métricas do sistema');
    
    const agents = Array.from(this.metrics.values());
    const systemMetrics = this.systemMetrics;
    
    // Contar status dos agentes
    let healthyCount = 0;
    let degradedCount = 0;
    let downCount = 0;
    let totalResponseTime = 0;
    let totalErrors = 0;
    let totalChecks = 0;
    
    agents.forEach(agent => {
      // Determinar status baseado na disponibilidade
      if (agent.availability.current >= 95) {
        healthyCount++;
      } else if (agent.availability.current >= 80) {
        degradedCount++;
      } else {
        downCount++;
      }
      
      totalResponseTime += agent.responseTime.avg;
      totalErrors += agent.errors.total;
      totalChecks += agent.availability.totalChecks;
    });
    
    // Atualizar métricas do sistema
    systemMetrics.overall.healthyAgents = healthyCount;
    systemMetrics.overall.degradedAgents = degradedCount;
    systemMetrics.overall.downAgents = downCount;
    
    // Calcular saúde geral do sistema
    const healthPercentage = (healthyCount / agents.length) * 100;
    systemMetrics.overall.systemHealth = healthPercentage;
    
    // Métricas de performance
    systemMetrics.performance.avgResponseTime = agents.length > 0 ? 
      totalResponseTime / agents.length : 0;
    
    systemMetrics.performance.errorRate = totalChecks > 0 ? 
      (totalErrors / totalChecks) * 100 : 0;
    
    systemMetrics.lastUpdated = new Date().toISOString();
    
    // Detectar anomalias
    this.detectAnomalies();
    
    this.emit('systemMetricsUpdated', systemMetrics);
  }

  /**
   * Detectar anomalias nas métricas
   */
  detectAnomalies() {
    const thresholds = config.metrics.thresholds;
    
    // Verificar tempo de resposta
    if (this.systemMetrics.performance.avgResponseTime > thresholds.responseTime) {
      this.emit('anomalyDetected', {
        type: 'high_response_time',
        value: this.systemMetrics.performance.avgResponseTime,
        threshold: thresholds.responseTime,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar taxa de erro
    if (this.systemMetrics.performance.errorRate > thresholds.errorRate * 100) {
      this.emit('anomalyDetected', {
        type: 'high_error_rate',
        value: this.systemMetrics.performance.errorRate,
        threshold: thresholds.errorRate * 100,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar saúde do sistema
    if (this.systemMetrics.overall.systemHealth < 80) {
      this.emit('anomalyDetected', {
        type: 'low_system_health',
        value: this.systemMetrics.overall.systemHealth,
        threshold: 80,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Limpar métricas antigas
   */
  cleanupOldMetrics() {
    const cutoffTime = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);
    
    this.metrics.forEach(agentMetrics => {
      // Limpar histórico de tempo de resposta
      agentMetrics.responseTime.history = agentMetrics.responseTime.history.filter(
        entry => new Date(entry.timestamp) > cutoffTime
      );
    });
    
    // Limpar métricas agregadas antigas
    for (const [timestamp, _] of this.aggregatedMetrics.entries()) {
      if (new Date(timestamp) < cutoffTime) {
        this.aggregatedMetrics.delete(timestamp);
      }
    }
  }

  /**
   * Obter métricas de um agente específico
   */
  getAgentMetrics(agentName) {
    return this.metrics.get(agentName);
  }

  /**
   * Obter métricas do sistema
   */
  getSystemMetrics() {
    return this.systemMetrics;
  }

  /**
   * Obter todas as métricas
   */
  getAllMetrics() {
    return {
      system: this.systemMetrics,
      agents: Object.fromEntries(this.metrics),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Obter histórico de métricas
   */
  getMetricsHistory(agentName, hours = 1) {
    const agentMetrics = this.metrics.get(agentName);
    if (!agentMetrics) return null;
    
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return agentMetrics.responseTime.history.filter(
      entry => new Date(entry.timestamp) > cutoffTime
    );
  }

  /**
   * Gerar relatório de métricas
   */
  generateReport() {
    const agents = Array.from(this.metrics.values());
    
    return {
      summary: {
        totalAgents: agents.length,
        healthyAgents: this.systemMetrics.overall.healthyAgents,
        systemHealth: this.systemMetrics.overall.systemHealth,
        avgResponseTime: this.systemMetrics.performance.avgResponseTime,
        errorRate: this.systemMetrics.performance.errorRate
      },
      agents: agents.map(agent => ({
        name: agent.agentName,
        availability: agent.availability.current,
        avgResponseTime: agent.responseTime.avg,
        errorRate: agent.errors.rate,
        lastUpdated: agent.lastUpdated
      })),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = MetricsService;