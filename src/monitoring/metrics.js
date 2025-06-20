/**
 * Sistema de Métricas Básico
 * Coleta e exposição de métricas do sistema
 */

const AdvancedLogger = require('../utils/advancedLogger');

class MetricsCollector {
  constructor() {
    this.logger = new AdvancedLogger('metrics-collector');
    this.metrics = new Map();
    this.startTime = Date.now();
  }

  /**
   * Incrementar contador
   */
  increment(name, labels = {}, value = 1) {
    const key = this.createKey(name, labels);
    const current = this.metrics.get(key) || { type: 'counter', value: 0, labels };
    current.value += value;
    current.lastUpdated = Date.now();
    this.metrics.set(key, current);
  }

  /**
   * Definir gauge
   */
  gauge(name, value, labels = {}) {
    const key = this.createKey(name, labels);
    this.metrics.set(key, {
      type: 'gauge',
      value,
      labels,
      lastUpdated: Date.now()
    });
  }

  /**
   * Registrar histograma (duração)
   */
  histogram(name, value, labels = {}) {
    const key = this.createKey(name, labels);
    const current = this.metrics.get(key) || {
      type: 'histogram',
      values: [],
      labels,
      count: 0,
      sum: 0
    };
    
    current.values.push(value);
    current.count++;
    current.sum += value;
    current.lastUpdated = Date.now();
    
    // Manter apenas os últimos 1000 valores
    if (current.values.length > 1000) {
      current.values = current.values.slice(-1000);
    }
    
    this.metrics.set(key, current);
  }

  /**
   * Criar chave única para métrica
   */
  createKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  /**
   * Obter todas as métricas
   */
  getAllMetrics() {
    const result = {};
    
    for (const [key, metric] of this.metrics) {
      result[key] = {
        ...metric,
        age: Date.now() - metric.lastUpdated
      };
      
      // Calcular estatísticas para histogramas
      if (metric.type === 'histogram' && metric.values.length > 0) {
        const sorted = [...metric.values].sort((a, b) => a - b);
        result[key].min = sorted[0];
        result[key].max = sorted[sorted.length - 1];
        result[key].avg = metric.sum / metric.count;
        result[key].p50 = sorted[Math.floor(sorted.length * 0.5)];
        result[key].p95 = sorted[Math.floor(sorted.length * 0.95)];
        result[key].p99 = sorted[Math.floor(sorted.length * 0.99)];
      }
    }
    
    return result;
  }

  /**
   * Obter métricas do sistema
   */
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      pid: process.pid,
      version: process.version,
      platform: process.platform
    };
  }

  /**
   * Exportar métricas no formato Prometheus
   */
  exportPrometheus() {
    let output = '';
    
    for (const [key, metric] of this.metrics) {
      const name = key.split('{')[0];
      const labels = key.includes('{') ? key.split('{')[1].replace('}', '') : '';
      
      switch (metric.type) {
        case 'counter':
          output += `# TYPE ${name} counter\n`;
          output += `${name}${labels ? `{${labels}}` : ''} ${metric.value}\n`;
          break;
        case 'gauge':
          output += `# TYPE ${name} gauge\n`;
          output += `${name}${labels ? `{${labels}}` : ''} ${metric.value}\n`;
          break;
        case 'histogram':
          output += `# TYPE ${name} histogram\n`;
          output += `${name}_count${labels ? `{${labels}}` : ''} ${metric.count}\n`;
          output += `${name}_sum${labels ? `{${labels}}` : ''} ${metric.sum}\n`;
          break;
      }
    }
    
    return output;
  }

  /**
   * Limpar métricas antigas
   */
  cleanup(maxAge = 3600000) { // 1 hora
    const now = Date.now();
    for (const [key, metric] of this.metrics) {
      if (now - metric.lastUpdated > maxAge) {
        this.metrics.delete(key);
      }
    }
  }
}

// Instância global
const globalMetrics = new MetricsCollector();

module.exports = {
  MetricsCollector,
  metrics: globalMetrics
};
