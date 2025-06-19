/**
 * Fallback Agent - Agente de Estratégias de Fallback
 * Implementa circuit breaker, retry, degradação graceful e outras estratégias de resiliência
 */

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const promClient = require('prom-client');

const config = require('./fallbackConfig');
const FallbackService = require('./services/fallbackService');
const CircuitBreakerService = require('./services/circuitBreakerService');
const RetryService = require('./services/retryService');
const DegradationService = require('./services/degradationService');

// Inicializar aplicação Express
const app = express();

// Configurar logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'fallback-agent' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new DailyRotateFile({
      filename: `${config.logging.directory}/fallback-agent-%DATE%.log`,
      datePattern: config.logging.datePattern,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      compress: config.logging.compress
    })
  ]
});

// Configurar métricas Prometheus
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register, prefix: config.metrics.prefix });

// Métricas customizadas
const metrics = {
  fallbackOperations: new promClient.Counter({
    name: `${config.metrics.prefix}operations_total`,
    help: 'Total de operações de fallback',
    labelNames: ['strategy', 'status', 'agent'],
    registers: [register]
  }),
  
  operationDuration: new promClient.Histogram({
    name: `${config.metrics.prefix}operation_duration_seconds`,
    help: 'Duração das operações de fallback',
    labelNames: ['strategy', 'agent'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [register]
  }),
  
  circuitBreakerState: new promClient.Gauge({
    name: `${config.metrics.prefix}circuit_breaker_state`,
    help: 'Estado do circuit breaker (0=closed, 1=open, 2=half-open)',
    labelNames: ['service'],
    registers: [register]
  }),
  
  retryAttempts: new promClient.Counter({
    name: `${config.metrics.prefix}retry_attempts_total`,
    help: 'Total de tentativas de retry',
    labelNames: ['operation', 'attempt', 'status'],
    registers: [register]
  }),
  
  degradationLevel: new promClient.Gauge({
    name: `${config.metrics.prefix}degradation_level`,
    help: 'Nível atual de degradação (1=minimal, 2=reduced, 3=normal)',
    registers: [register]
  }),
  
  errorCount: new promClient.Counter({
    name: `${config.metrics.prefix}errors_total`,
    help: 'Total de erros',
    labelNames: ['type', 'operation'],
    registers: [register]
  })
};

// Inicializar serviços
let fallbackService;
let circuitBreakerService;
let retryService;
let degradationService;

// Middleware de segurança
app.use(helmet(config.security.helmet));
app.use(compression());
app.use(cors(config.security.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
if (config.security.rateLimit) {
  const limiter = rateLimit(config.security.rateLimit);
  app.use(limiter);
}

// Middleware de logging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
});

// Middleware de métricas
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    metrics.operationDuration.observe(
      { strategy: 'http', agent: 'fallback' },
      duration
    );
  });
  
  next();
});

// Rotas de métricas
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Erro ao gerar métricas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota de health check
app.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Erro no health check:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rota de status detalhado
app.get('/status', async (req, res) => {
  try {
    const status = {
      service: 'fallback-agent',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: config.server.environment,
      
      services: {
        fallback: fallbackService?.getStatus() || { status: 'not_initialized' },
        circuitBreaker: circuitBreakerService?.getStatus() || { status: 'not_initialized' },
        retry: retryService?.getStatus() || { status: 'not_initialized' },
        degradation: degradationService?.getStatus() || { status: 'not_initialized' }
      },
      
      metrics: {
        totalOperations: await metrics.fallbackOperations.get(),
        errorCount: await metrics.errorCount.get(),
        currentDegradationLevel: await metrics.degradationLevel.get()
      },
      
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };
    
    res.json(status);
  } catch (error) {
    logger.error('Erro ao obter status:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para executar fallback manual
app.post('/fallback', async (req, res) => {
  try {
    const { strategy, operation, data } = req.body;
    
    if (!strategy || !operation) {
      return res.status(400).json({
        error: 'Parâmetros obrigatórios: strategy, operation'
      });
    }
    
    const result = await fallbackService.executeFallback(strategy, operation, data);
    
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro na execução de fallback:', error);
    metrics.errorCount.inc({ type: 'fallback_execution', operation: 'manual' });
    
    res.status(500).json({
      error: 'Erro na execução de fallback',
      message: error.message
    });
  }
});

// Rota para obter estado do circuit breaker
app.get('/circuit-breaker/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const state = circuitBreakerService.getState(service);
    
    res.json({
      service,
      state,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter estado do circuit breaker:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para resetar circuit breaker
app.post('/circuit-breaker/:service/reset', async (req, res) => {
  try {
    const { service } = req.params;
    circuitBreakerService.reset(service);
    
    logger.info(`Circuit breaker resetado para serviço: ${service}`);
    
    res.json({
      success: true,
      message: `Circuit breaker resetado para ${service}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao resetar circuit breaker:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para alterar nível de degradação
app.post('/degradation/level', async (req, res) => {
  try {
    const { level } = req.body;
    
    if (!level || !['minimal', 'reduced', 'normal'].includes(level)) {
      return res.status(400).json({
        error: 'Nível inválido. Use: minimal, reduced, normal'
      });
    }
    
    await degradationService.setLevel(level);
    
    res.json({
      success: true,
      level,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao alterar nível de degradação:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Middleware de tratamento de erros 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  logger.error('Erro não tratado:', error);
  metrics.errorCount.inc({ type: 'unhandled', operation: 'request' });
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: config.server.environment === 'development' ? error.message : undefined,
    timestamp: new Date().toISOString()
  });
});

// Função para obter status de saúde
async function getHealthStatus() {
  const checks = {
    fallbackService: fallbackService?.isHealthy() || false,
    circuitBreakerService: circuitBreakerService?.isHealthy() || false,
    retryService: retryService?.isHealthy() || false,
    degradationService: degradationService?.isHealthy() || false
  };
  
  const allHealthy = Object.values(checks).every(check => check === true);
  
  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
    version: '1.0.0'
  };
}

// Função para inicializar serviços
async function initializeServices() {
  try {
    logger.info('Inicializando serviços do Fallback Agent...');
    
    // Inicializar Circuit Breaker Service
    circuitBreakerService = new CircuitBreakerService(config, logger, metrics);
    await circuitBreakerService.initialize();
    
    // Inicializar Retry Service
    retryService = new RetryService(config, logger, metrics);
    await retryService.initialize();
    
    // Inicializar Degradation Service
    degradationService = new DegradationService(config, logger, metrics);
    await degradationService.initialize();
    
    // Inicializar Fallback Service principal
    fallbackService = new FallbackService(
      config,
      logger,
      metrics,
      {
        circuitBreaker: circuitBreakerService,
        retry: retryService,
        degradation: degradationService
      }
    );
    await fallbackService.initialize();
    
    logger.info('Todos os serviços inicializados com sucesso');
  } catch (error) {
    logger.error('Erro ao inicializar serviços:', error);
    throw error;
  }
}

// Função para parar serviços gracefully
async function stopServices() {
  logger.info('Parando serviços do Fallback Agent...');
  
  try {
    if (fallbackService) {
      await fallbackService.stop();
    }
    
    if (circuitBreakerService) {
      await circuitBreakerService.stop();
    }
    
    if (retryService) {
      await retryService.stop();
    }
    
    if (degradationService) {
      await degradationService.stop();
    }
    
    logger.info('Todos os serviços parados com sucesso');
  } catch (error) {
    logger.error('Erro ao parar serviços:', error);
  }
}

// Tratamento de sinais do sistema
process.on('SIGTERM', async () => {
  logger.info('Recebido SIGTERM, iniciando shutdown graceful...');
  await stopServices();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Recebido SIGINT, iniciando shutdown graceful...');
  await stopServices();
  process.exit(0);
});

// Tratamento de exceções não capturadas
process.on('uncaughtException', (error) => {
  logger.error('Exceção não capturada:', error);
  metrics.errorCount.inc({ type: 'uncaught_exception', operation: 'process' });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', { reason, promise });
  metrics.errorCount.inc({ type: 'unhandled_rejection', operation: 'process' });
});

// Inicializar aplicação
async function startServer() {
  try {
    // Inicializar serviços
    await initializeServices();
    
    // Iniciar servidor HTTP
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`Fallback Agent iniciado na porta ${config.server.port}`, {
        environment: config.server.environment,
        version: '1.0.0',
        pid: process.pid
      });
    });
    
    // Configurar timeout do servidor
    server.timeout = 30000;
    
    return server;
  } catch (error) {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Iniciar aplicação se executado diretamente
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, stopServices };