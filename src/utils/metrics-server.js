/**
 * Servidor de Métricas HTTP
 * Fase 1 - Observabilidade Básica
 * 
 * Expõe métricas de infraestrutura via HTTP para monitoramento
 */

const express = require('express');
const cors = require('cors');
const ObservabilityService = require('./observability');
const logger = require('./logger');

class MetricsServer {
  constructor(port = process.env.METRICS_PORT || 9090) {
    this.app = express();
    this.port = port;
    this.observability = new ObservabilityService();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Middleware de logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.observability.healthCheck();
        const isHealthy = Object.values(health).every(status => status === 'healthy');
        
        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: health
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Métricas gerais
    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = this.observability.getMetrics();
        res.json({
          timestamp: new Date().toISOString(),
          metrics
        });
      } catch (error) {
        logger.error('Failed to get metrics:', error);
        res.status(500).json({
          error: 'Failed to retrieve metrics',
          message: error.message
        });
      }
    });

    // Métricas específicas de DLQ
    this.app.get('/metrics/dlq', async (req, res) => {
      try {
        const dlqMetrics = await this.observability.monitorDLQs();
        res.json({
          timestamp: new Date().toISOString(),
          dlqMetrics
        });
      } catch (error) {
        logger.error('Failed to get DLQ metrics:', error);
        res.status(500).json({
          error: 'Failed to retrieve DLQ metrics',
          message: error.message
        });
      }
    });

    // Métricas de SQS
    this.app.get('/metrics/sqs', async (req, res) => {
      try {
        const sqsMetrics = await this.observability.collectSQSMetrics();
        res.json({
          timestamp: new Date().toISOString(),
          sqsMetrics
        });
      } catch (error) {
        logger.error('Failed to get SQS metrics:', error);
        res.status(500).json({
          error: 'Failed to retrieve SQS metrics',
          message: error.message
        });
      }
    });

    // Endpoint para forçar coleta de métricas
    this.app.post('/metrics/collect', async (req, res) => {
      try {
        const [dlqMetrics, sqsMetrics, health] = await Promise.all([
          this.observability.monitorDLQs(),
          this.observability.collectSQSMetrics(),
          this.observability.healthCheck()
        ]);
        
        res.json({
          message: 'Metrics collected successfully',
          timestamp: new Date().toISOString(),
          data: {
            dlqMetrics,
            sqsMetrics,
            health
          }
        });
      } catch (error) {
        logger.error('Failed to collect metrics:', error);
        res.status(500).json({
          error: 'Failed to collect metrics',
          message: error.message
        });
      }
    });

    // Endpoint de informações do sistema
    this.app.get('/info', (req, res) => {
      res.json({
        service: 'Agentes Autônomos - Metrics Server',
        version: '1.0.0',
        phase: 'Fase 1 - Infraestrutura Base',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          dlqMetrics: '/metrics/dlq',
          sqsMetrics: '/metrics/sqs',
          collectMetrics: 'POST /metrics/collect',
          info: '/info'
        }
      });
    });

    // Endpoint para dashboard simples
    this.app.get('/dashboard', async (req, res) => {
      try {
        const metrics = this.observability.getMetrics();
        const health = this.observability.getHealthStatus();
        
        // HTML simples para visualização
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Agentes Autônomos - Dashboard</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .status-healthy { color: #28a745; }
            .status-unhealthy { color: #dc3545; }
            .metric { display: inline-block; margin: 10px; padding: 10px; background: #e9ecef; border-radius: 4px; }
            h1, h2 { color: #333; }
            .refresh { margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🤖 Agentes Autônomos - Dashboard</h1>
            <div class="refresh">
              <button onclick="location.reload()">🔄 Atualizar</button>
              <span>Última atualização: ${new Date().toLocaleString()}</span>
            </div>
            
            <div class="card">
              <h2>🏥 Status dos Serviços</h2>
              ${Object.entries(health).map(([service, status]) => 
                `<div class="metric">
                  <strong>${service}:</strong> 
                  <span class="status-${status}">${status}</span>
                </div>`
              ).join('')}
            </div>
            
            <div class="card">
              <h2>📊 Métricas DLQ</h2>
              ${Object.keys(metrics.dlqMessages).length === 0 ? 
                '<p>Nenhuma métrica DLQ disponível</p>' :
                Object.entries(metrics.dlqMessages).map(([queue, data]) => 
                  `<div class="metric">
                    <strong>${queue}:</strong> ${data.messagesVisible} mensagens
                  </div>`
                ).join('')
              }
            </div>
            
            <div class="card">
              <h2>📈 Métricas SQS</h2>
              ${Object.keys(metrics.queueDepth).length === 0 ? 
                '<p>Nenhuma métrica SQS disponível</p>' :
                Object.entries(metrics.queueDepth).map(([queue, data]) => 
                  `<div class="metric">
                    <strong>${queue}:</strong> ${data.messagesVisible} visíveis, ${data.messagesInFlight} em processamento
                  </div>`
                ).join('')
              }
            </div>
          </div>
        </body>
        </html>`;
        
        res.send(html);
      } catch (error) {
        logger.error('Failed to render dashboard:', error);
        res.status(500).send('<h1>Erro ao carregar dashboard</h1>');
      }
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`🚀 Metrics Server iniciado na porta ${this.port}`);
        logger.info(`📊 Dashboard disponível em: http://localhost:${this.port}/dashboard`);
        logger.info(`🏥 Health check em: http://localhost:${this.port}/health`);
        
        // Iniciar monitoramento contínuo
        this.observability.startMonitoring();
        
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('Metrics Server parado');
    }
  }
}

module.exports = MetricsServer;

// Se executado diretamente
if (require.main === module) {
  const server = new MetricsServer();
  server.start().catch(error => {
    logger.error('Falha ao iniciar Metrics Server:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Recebido SIGINT, parando servidor...');
    server.stop();
    process.exit(0);
  });
}