/**
 * Health Routes - Message Schema Registry
 * Rotas para health check e monitoramento do sistema
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
const router = express.Router();

/**
 * Middleware para validação de erros
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /api/v1/health
 * Health check básico
 */
router.get('/',
  async (req, res) => {
    try {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      };

      // Verificar serviços essenciais se disponíveis
      if (req.healthService) {
        const serviceChecks = await req.healthService.checkServices();
        healthStatus.services = serviceChecks;
        
        // Se algum serviço crítico estiver down, marcar como unhealthy
        const criticalServices = ['database', 'cache', 'storage'];
        const hasCriticalIssues = criticalServices.some(service => 
          serviceChecks[service] && serviceChecks[service].status !== 'healthy'
        );
        
        if (hasCriticalIssues) {
          healthStatus.status = 'unhealthy';
          return res.status(503).json(healthStatus);
        }
      }

      res.json(healthStatus);
    } catch (error) {
      req.logger?.error('Health check failed:', error);

      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
);

/**
 * GET /api/v1/health/detailed
 * Health check detalhado com informações de sistema
 */
router.get('/detailed',
  async (req, res) => {
    try {
      const startTime = Date.now();
      
      const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
          },
          cpu: {
            loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
            cpuCount: require('os').cpus().length
          }
        }
      };

      // Verificações detalhadas de serviços
      if (req.healthService) {
        const detailedChecks = await req.healthService.performDetailedChecks();
        healthData.services = detailedChecks.services;
        healthData.dependencies = detailedChecks.dependencies;
        healthData.performance = detailedChecks.performance;
        
        // Determinar status geral
        const allChecks = [...Object.values(detailedChecks.services), ...Object.values(detailedChecks.dependencies)];
        const hasErrors = allChecks.some(check => check.status === 'error');
        const hasWarnings = allChecks.some(check => check.status === 'warning');
        
        if (hasErrors) {
          healthData.status = 'unhealthy';
        } else if (hasWarnings) {
          healthData.status = 'degraded';
        }
      }

      const responseTime = Date.now() - startTime;
      healthData.responseTime = responseTime;

      // Atualizar métricas se disponível
      if (req.metricsService) {
        req.metricsService.recordHistogram('msr_health_check_duration_ms', responseTime);
        req.metricsService.incrementCounter('msr_health_checks_total', {
          type: 'detailed',
          status: healthData.status
        });
      }

      const statusCode = healthData.status === 'healthy' ? 200 : 
                        healthData.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(healthData);
    } catch (error) {
      req.logger?.error('Detailed health check failed:', error);

      if (req.metricsService) {
        req.metricsService.incrementCounter('msr_health_check_errors_total', {
          type: 'detailed'
        });
      }

      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        responseTime: Date.now() - (req.startTime || Date.now())
      });
    }
  }
);

/**
 * GET /api/v1/health/readiness
 * Readiness probe para Kubernetes
 */
router.get('/readiness',
  async (req, res) => {
    try {
      const readinessChecks = {
        timestamp: new Date().toISOString(),
        ready: true,
        checks: {}
      };

      if (req.healthService) {
        const checks = await req.healthService.checkReadiness();
        readinessChecks.checks = checks;
        
        // Verificar se todos os checks passaram
        readinessChecks.ready = Object.values(checks).every(check => check.ready);
      }

      const statusCode = readinessChecks.ready ? 200 : 503;
      res.status(statusCode).json(readinessChecks);
    } catch (error) {
      req.logger?.error('Readiness check failed:', error);

      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
);

/**
 * GET /api/v1/health/liveness
 * Liveness probe para Kubernetes
 */
router.get('/liveness',
  async (req, res) => {
    try {
      const livenessData = {
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid
      };

      // Verificações básicas de liveness
      if (req.healthService) {
        const livenessChecks = await req.healthService.checkLiveness();
        livenessData.checks = livenessChecks;
        
        // Se algum check crítico falhar, marcar como not alive
        livenessData.alive = Object.values(livenessChecks).every(check => check.alive);
      }

      const statusCode = livenessData.alive ? 200 : 503;
      res.status(statusCode).json(livenessData);
    } catch (error) {
      req.logger?.error('Liveness check failed:', error);

      res.status(503).json({
        alive: false,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
);

/**
 * GET /api/v1/health/metrics
 * Métricas de saúde do sistema
 */
router.get('/metrics',
  [
    query('format').optional().isIn(['json', 'prometheus']).withMessage('Invalid format'),
    query('include').optional().isString().withMessage('Include must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { format = 'json', include } = req.query;
      const includeMetrics = include ? include.split(',').map(m => m.trim()) : null;

      if (!req.metricsService) {
        return res.status(503).json({
          success: false,
          error: 'Metrics service not available'
        });
      }

      if (format === 'prometheus') {
        const prometheusMetrics = await req.metricsService.getPrometheusMetrics(includeMetrics);
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        return res.send(prometheusMetrics);
      }

      const metrics = await req.metricsService.getMetrics(includeMetrics);
      
      res.json({
        success: true,
        data: {
          metrics,
          timestamp: new Date().toISOString(),
          format,
          include: includeMetrics
        }
      });
    } catch (error) {
      req.logger?.error('Error getting metrics:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get metrics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/health/dependencies
 * Status das dependências externas
 */
router.get('/dependencies',
  async (req, res) => {
    try {
      const dependencyStatus = {
        timestamp: new Date().toISOString(),
        overall: 'healthy',
        dependencies: {}
      };

      if (req.healthService) {
        const deps = await req.healthService.checkDependencies();
        dependencyStatus.dependencies = deps;
        
        // Determinar status geral
        const statuses = Object.values(deps).map(dep => dep.status);
        if (statuses.includes('error')) {
          dependencyStatus.overall = 'unhealthy';
        } else if (statuses.includes('warning')) {
          dependencyStatus.overall = 'degraded';
        }
      }

      const statusCode = dependencyStatus.overall === 'healthy' ? 200 : 
                        dependencyStatus.overall === 'degraded' ? 200 : 503;

      res.status(statusCode).json(dependencyStatus);
    } catch (error) {
      req.logger?.error('Error checking dependencies:', error);

      res.status(503).json({
        overall: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
);

/**
 * GET /api/v1/health/performance
 * Métricas de performance do sistema
 */
router.get('/performance',
  [
    query('period').optional().isIn(['1m', '5m', '15m', '1h']).withMessage('Invalid period')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { period = '5m' } = req.query;
      
      const performanceData = {
        timestamp: new Date().toISOString(),
        period,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      };

      if (req.healthService) {
        const perfMetrics = await req.healthService.getPerformanceMetrics(period);
        performanceData.application = perfMetrics;
      }

      if (req.metricsService) {
        const metrics = await req.metricsService.getPerformanceMetrics(period);
        performanceData.metrics = metrics;
      }

      res.json({
        success: true,
        data: performanceData
      });
    } catch (error) {
      req.logger?.error('Error getting performance metrics:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get performance metrics',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/v1/health/test
 * Executa testes de saúde sob demanda
 */
router.post('/test',
  [
    query('component').optional().isString().withMessage('Component must be a string'),
    query('deep').optional().isBoolean().withMessage('Deep must be a boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { component, deep = false } = req.query;
      
      if (!req.healthService) {
        return res.status(503).json({
          success: false,
          error: 'Health service not available'
        });
      }

      const testResults = await req.healthService.runHealthTests({
        component,
        deep
      });

      const overallStatus = testResults.every(test => test.passed) ? 'passed' : 'failed';

      res.json({
        success: true,
        data: {
          overall: overallStatus,
          tests: testResults,
          component,
          deep,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error running health tests:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to run health tests',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/v1/health/alerts
 * Obtém alertas ativos relacionados à saúde do sistema
 */
router.get('/alerts',
  [
    query('severity').optional().isIn(['info', 'warning', 'error', 'critical']).withMessage('Invalid severity'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { severity, limit = 20 } = req.query;
      
      if (!req.alertService) {
        return res.status(503).json({
          success: false,
          error: 'Alert service not available'
        });
      }

      const alerts = await req.alertService.getHealthAlerts({
        severity,
        limit: parseInt(limit),
        active: true
      });

      res.json({
        success: true,
        data: {
          alerts,
          count: alerts.length,
          severity,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      req.logger?.error('Error getting health alerts:', error);

      res.status(500).json({
        success: false,
        error: 'Failed to get health alerts',
        message: error.message
      });
    }
  }
);

module.exports = router;