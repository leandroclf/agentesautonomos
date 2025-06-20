/**
 * Sistema de Health Check
 * Verificação de saúde dos componentes do sistema
 */

const AdvancedLogger = require('../utils/advancedLogger');
const { metrics } = require('./metrics');

class HealthChecker {
  constructor() {
    this.logger = new AdvancedLogger('health-checker');
    this.checks = new Map();
    this.results = new Map();
  }

  /**
   * Registrar check de saúde
   */
  register(name, checkFunction, options = {}) {
    this.checks.set(name, {
      fn: checkFunction,
      timeout: options.timeout || 5000,
      interval: options.interval || 30000,
      critical: options.critical || false,
      description: options.description || name
    });
  }

  /**
   * Executar um check específico
   */
  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    const start = Date.now();
    let result;

    try {
      // Executar com timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
      });

      const checkResult = await Promise.race([
        check.fn(),
        timeoutPromise
      ]);

      result = {
        name,
        status: 'healthy',
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        details: checkResult || {},
        critical: check.critical
      };

      metrics.histogram('health_check_duration', result.duration, { check: name, status: 'healthy' });
      metrics.increment('health_check_total', { check: name, status: 'healthy' });

    } catch (error) {
      result = {
        name,
        status: 'unhealthy',
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        error: error.message,
        critical: check.critical
      };

      metrics.histogram('health_check_duration', result.duration, { check: name, status: 'unhealthy' });
      metrics.increment('health_check_total', { check: name, status: 'unhealthy' });

      this.logger.error(`Health check '${name}' failed`, {
        error: error.message,
        duration: result.duration,
        critical: check.critical
      });
    }

    this.results.set(name, result);
    return result;
  }

  /**
   * Executar todos os checks
   */
  async runAllChecks() {
    const results = [];
    
    for (const name of this.checks.keys()) {
      try {
        const result = await this.runCheck(name);
        results.push(result);
      } catch (error) {
        results.push({
          name,
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return results;
  }

  /**
   * Obter status geral do sistema
   */
  getOverallStatus() {
    const results = Array.from(this.results.values());
    
    if (results.length === 0) {
      return { status: 'unknown', message: 'No health checks configured' };
    }
    
    const unhealthy = results.filter(r => r.status === 'unhealthy');
    const criticalUnhealthy = unhealthy.filter(r => r.critical);
    
    if (criticalUnhealthy.length > 0) {
      return {
        status: 'critical',
        message: `${criticalUnhealthy.length} critical health checks failing`,
        failing: criticalUnhealthy.map(r => r.name)
      };
    }
    
    if (unhealthy.length > 0) {
      return {
        status: 'degraded',
        message: `${unhealthy.length} health checks failing`,
        failing: unhealthy.map(r => r.name)
      };
    }
    
    return {
      status: 'healthy',
      message: 'All health checks passing'
    };
  }

  /**
   * Iniciar monitoramento contínuo
   */
  startContinuousMonitoring() {
    for (const [name, check] of this.checks) {
      setInterval(async () => {
        try {
          await this.runCheck(name);
        } catch (error) {
          this.logger.error(`Continuous health check failed for ${name}`, error);
        }
      }, check.interval);
    }
    
    this.logger.info('Started continuous health monitoring');
  }
}

// Instância global
const globalHealthChecker = new HealthChecker();

// Registrar checks básicos do sistema
globalHealthChecker.register('memory', async () => {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
  
  return {
    heapUsedPercent,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    healthy: heapUsedPercent < 90
  };
}, { critical: true, description: 'Memory usage check' });

globalHealthChecker.register('uptime', async () => {
  const uptime = process.uptime();
  return {
    uptime,
    healthy: uptime > 0
  };
}, { description: 'Process uptime check' });

module.exports = {
  HealthChecker,
  healthChecker: globalHealthChecker
};
