/**
 * Inicializador do Sistema de Monitoramento
 * Inicia todos os componentes de monitoramento e logging
 */

const AdvancedLogger = require('../utils/advancedLogger');
const LoggingUtils = require('../utils/loggingUtils');
const { metrics } = require('./metrics');
const { healthChecker } = require('./health');
const { alertManager } = require('./alerts');
const express = require('express');
const path = require('path');

class MonitoringService {
  constructor() {
    this.logger = new AdvancedLogger('monitoring-service');
    this.app = express();
    this.port = process.env.MONITORING_PORT || 3001;
    this.isRunning = false;
  }

  /**
   * Inicializar sistema de monitoramento
   */
  async initialize() {
    try {
      this.logger.info('Initializing monitoring system...');
      
      // Configurar logging global
      LoggingUtils.setupGlobalErrorLogging();
      
      // Configurar middleware de logging
      this.app.use(LoggingUtils.createExpressMiddleware('monitoring-api'));
      
      // Configurar rotas de monitoramento
      this.setupRoutes();
      
      // Registrar health checks específicos
      this.registerHealthChecks();
      
      // Configurar regras de alerta específicas
      this.setupAlertRules();
      
      // Iniciar monitoramento contínuo
      this.startContinuousMonitoring();
      
      this.logger.info('Monitoring system initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize monitoring system:', error);
      throw error;
    }
  }

  /**
   * Configurar rotas da API de monitoramento
   */
  setupRoutes() {
    // Rota de health check geral
    this.app.get('/health', async (req, res) => {
      try {
        const results = await healthChecker.runAllChecks();
        const overall = healthChecker.getOverallStatus();
        
        res.status(overall.status === 'healthy' ? 200 : 503).json({
          status: overall.status,
          message: overall.message,
          timestamp: new Date().toISOString(),
          checks: results
        });
      } catch (error) {
        this.logger.error('Health check endpoint error:', error);
        res.status(500).json({
          status: 'error',
          message: 'Health check failed',
          error: error.message
        });
      }
    });

    // Rota de métricas
    this.app.get('/metrics', (req, res) => {
      try {
        const format = req.query.format || 'json';
        
        if (format === 'prometheus') {
          res.set('Content-Type', 'text/plain');
          res.send(metrics.exportPrometheus());
        } else {
          res.json({
            timestamp: new Date().toISOString(),
            system: metrics.getSystemMetrics(),
            application: metrics.getAllMetrics()
          });
        }
      } catch (error) {
        this.logger.error('Metrics endpoint error:', error);
        res.status(500).json({
          error: 'Failed to retrieve metrics',
          message: error.message
        });
      }
    });

    // Rota de alertas ativos
    this.app.get('/alerts', (req, res) => {
      try {
        const activeAlerts = alertManager.getActiveAlerts();
        
        res.json({
          timestamp: new Date().toISOString(),
          count: activeAlerts.length,
          alerts: activeAlerts
        });
      } catch (error) {
        this.logger.error('Alerts endpoint error:', error);
        res.status(500).json({
          error: 'Failed to retrieve alerts',
          message: error.message
        });
      }
    });

    // Rota de logs recentes
    this.app.get('/logs', (req, res) => {
      try {
        const level = req.query.level || 'info';
        const limit = parseInt(req.query.limit) || 100;
        
        // TODO: Implementar leitura de logs do arquivo
        res.json({
          timestamp: new Date().toISOString(),
          level,
          limit,
          logs: [] // Placeholder
        });
      } catch (error) {
        this.logger.error('Logs endpoint error:', error);
        res.status(500).json({
          error: 'Failed to retrieve logs',
          message: error.message
        });
      }
    });

    // Rota de status do sistema
    this.app.get('/status', (req, res) => {
      try {
        const systemMetrics = metrics.getSystemMetrics();
        const overallHealth = healthChecker.getOverallStatus();
        const activeAlerts = alertManager.getActiveAlerts();
        
        res.json({
          timestamp: new Date().toISOString(),
          service: 'monitoring',
          version: process.env.npm_package_version || '1.0.0',
          uptime: systemMetrics.uptime,
          health: overallHealth,
          alerts: {
            active: activeAlerts.length,
            critical: activeAlerts.filter(a => a.rule.severity === 'critical').length
          },
          memory: {
            used: systemMetrics.memory.heapUsed,
            total: systemMetrics.memory.heapTotal,
            percentage: (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal * 100).toFixed(2)
          }
        });
      } catch (error) {
        this.logger.error('Status endpoint error:', error);
        res.status(500).json({
          error: 'Failed to retrieve status',
          message: error.message
        });
      }
    });

    // Middleware de tratamento de erros
    this.app.use((error, req, res, next) => {
      this.logger.error('API error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Registrar health checks específicos do sistema
   */
  registerHealthChecks() {
    // Health check para SQS (se configurado)
    if (process.env.AWS_SQS_REGION) {
      healthChecker.register('sqs_connectivity', async () => {
        // TODO: Implementar verificação de conectividade SQS
        return { healthy: true, message: 'SQS connectivity check placeholder' };
      }, {
        critical: true,
        description: 'AWS SQS connectivity check',
        timeout: 10000
      });
    }

    // Health check para Redis (se configurado)
    if (process.env.REDIS_URL) {
      healthChecker.register('redis_connectivity', async () => {
        // TODO: Implementar verificação de conectividade Redis
        return { healthy: true, message: 'Redis connectivity check placeholder' };
      }, {
        critical: true,
        description: 'Redis connectivity check',
        timeout: 5000
      });
    }

    // Health check para banco de dados (se configurado)
    if (process.env.DATABASE_URL) {
      healthChecker.register('database_connectivity', async () => {
        // TODO: Implementar verificação de conectividade do banco
        return { healthy: true, message: 'Database connectivity check placeholder' };
      }, {
        critical: true,
        description: 'Database connectivity check',
        timeout: 10000
      });
    }

    // Health check para agentes
    healthChecker.register('agents_status', async () => {
      // TODO: Implementar verificação de status dos agentes
      return {
        healthy: true,
        agents: {
          running: 0,
          stopped: 0,
          error: 0
        }
      };
    }, {
      critical: false,
      description: 'Agents status check',
      timeout: 5000
    });

    this.logger.info('Health checks registered');
  }

  /**
   * Configurar regras de alerta específicas
   */
  setupAlertRules() {
    // Alerta para falha de health checks críticos
    alertManager.addRule('critical_health_check_failure', async () => {
      const overallStatus = healthChecker.getOverallStatus();
      return overallStatus.status === 'critical';
    }, {
      severity: 'critical',
      description: 'Critical health check failure detected',
      duration: 30000 // 30 segundos
    });

    // Alerta para uso excessivo de CPU
    alertManager.addRule('high_cpu_usage', async () => {
      const cpuUsage = process.cpuUsage();
      // Simplificado - em produção usar biblioteca específica
      return false; // Placeholder
    }, {
      severity: 'warning',
      description: 'High CPU usage detected',
      duration: 120000 // 2 minutos
    });

    // Alerta para muitos erros de API
    alertManager.addRule('api_error_rate', async () => {
      const allMetrics = metrics.getAllMetrics();
      const errorMetric = allMetrics['http_requests_total{status="5xx"}'];
      
      if (!errorMetric) return false;
      
      // Verificar se houve mais de 5 erros 5xx no último minuto
      return errorMetric.value > 5;
    }, {
      severity: 'warning',
      description: 'High API error rate detected',
      duration: 60000 // 1 minuto
    });

    this.logger.info('Alert rules configured');
  }

  /**
   * Iniciar monitoramento contínuo
   */
  startContinuousMonitoring() {
    // Iniciar health checks contínuos
    healthChecker.startContinuousMonitoring();
    
    // Iniciar monitoramento de alertas
    alertManager.startMonitoring();
    
    // Coletar métricas do sistema periodicamente
    setInterval(() => {
      try {
        const systemMetrics = metrics.getSystemMetrics();
        
        // Registrar métricas do sistema
        metrics.gauge('system_memory_heap_used', systemMetrics.memory.heapUsed);
        metrics.gauge('system_memory_heap_total', systemMetrics.memory.heapTotal);
        metrics.gauge('system_uptime', systemMetrics.uptime);
        
        // Limpar métricas antigas
        metrics.cleanup();
        
      } catch (error) {
        this.logger.error('Error collecting system metrics:', error);
      }
    }, 30000); // A cada 30 segundos
    
    this.logger.info('Continuous monitoring started');
  }

  /**
   * Iniciar servidor de monitoramento
   */
  async start() {
    try {
      if (this.isRunning) {
        this.logger.warn('Monitoring service is already running');
        return;
      }

      await this.initialize();
      
      this.server = this.app.listen(this.port, () => {
        this.isRunning = true;
        this.logger.info(`Monitoring service started on port ${this.port}`);
        
        console.log('\n📊 Monitoring Service Started');
        console.log('=' .repeat(40));
        console.log(`🌐 API: http://localhost:${this.port}`);
        console.log(`🏥 Health: http://localhost:${this.port}/health`);
        console.log(`📈 Metrics: http://localhost:${this.port}/metrics`);
        console.log(`🚨 Alerts: http://localhost:${this.port}/alerts`);
        console.log(`📊 Status: http://localhost:${this.port}/status`);
        console.log('=' .repeat(40));
      });
      
      // Registrar métricas de inicialização
      metrics.increment('monitoring_service_starts');
      metrics.gauge('monitoring_service_start_time', Date.now());
      
    } catch (error) {
      this.logger.error('Failed to start monitoring service:', error);
      throw error;
    }
  }

  /**
   * Parar servidor de monitoramento
   */
  async stop() {
    try {
      if (!this.isRunning) {
        this.logger.warn('Monitoring service is not running');
        return;
      }

      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          this.logger.info('Monitoring service stopped');
        });
      }
      
      metrics.increment('monitoring_service_stops');
      
    } catch (error) {
      this.logger.error('Error stopping monitoring service:', error);
      throw error;
    }
  }

  /**
   * Obter status do serviço
   */
  getStatus() {
    return {
      running: this.isRunning,
      port: this.port,
      uptime: this.isRunning ? process.uptime() : 0
    };
  }
}

// Instância global
const monitoringService = new MonitoringService();

// Tratamento de sinais para shutdown graceful
process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down monitoring service...');
  await monitoringService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down monitoring service...');
  await monitoringService.stop();
  process.exit(0);
});

// Executar se chamado diretamente
if (require.main === module) {
  monitoringService.start().catch(error => {
    console.error('❌ Failed to start monitoring service:', error);
    process.exit(1);
  });
}

module.exports = {
  MonitoringService,
  monitoringService
};