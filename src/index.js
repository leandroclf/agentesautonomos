/**
 * Sistema de Agentes Autônomos - Inicializador Principal
 * Fase 1 - Infraestrutura Base
 * 
 * Coordena a inicialização de todos os componentes do sistema
 */

const logger = require('./utils/logger');
const MetricsServer = require('./utils/metrics-server');
const ObservabilityService = require('./utils/observability');

class AgentesAutonomosSystem {
  constructor() {
    this.components = new Map();
    this.isRunning = false;
    this.observability = new ObservabilityService();
    this.metricsServer = new MetricsServer();
  }

  async initialize() {
    try {
      logger.info('🚀 Inicializando Sistema de Agentes Autônomos...');
      
      // Verificar saúde da infraestrutura
      logger.info('🔍 Verificando infraestrutura...');
      const health = await this.observability.healthCheck();
      
      const healthyServices = Object.entries(health)
        .filter(([, status]) => status === 'healthy')
        .map(([service]) => service);
      
      const unhealthyServices = Object.entries(health)
        .filter(([, status]) => status !== 'healthy')
        .map(([service]) => service);
      
      if (healthyServices.length > 0) {
        logger.info(`✅ Serviços saudáveis: ${healthyServices.join(', ')}`);
      }
      
      if (unhealthyServices.length > 0) {
        logger.warn(`⚠️  Serviços com problemas: ${unhealthyServices.join(', ')}`);
        logger.warn('Sistema continuará com funcionalidade limitada');
      }
      
      // Iniciar servidor de métricas
      logger.info('📊 Iniciando servidor de métricas...');
      await this.metricsServer.start();
      this.components.set('metrics-server', this.metricsServer);
      
      // Iniciar monitoramento
      logger.info('👁️  Iniciando monitoramento...');
      this.observability.startMonitoring();
      this.components.set('observability', this.observability);
      
      this.isRunning = true;
      
      logger.info('🎉 Sistema inicializado com sucesso!');
      logger.info('📊 Dashboard: http://localhost:9090/dashboard');
      logger.info('🏥 Health Check: http://localhost:9090/health');
      
      // Exibir status inicial
      await this.displaySystemStatus();
      
    } catch (error) {
      logger.error('❌ Falha na inicialização do sistema:', error);
      throw error;
    }
  }

  async displaySystemStatus() {
    try {
      const metrics = this.observability.getMetrics();
      const health = this.observability.getHealthStatus();
      
      logger.info('\n📋 Status do Sistema:');
      logger.info('━'.repeat(50));
      
      // Status dos serviços
      Object.entries(health).forEach(([service, status]) => {
        const icon = status === 'healthy' ? '✅' : '❌';
        logger.info(`${icon} ${service}: ${status}`);
      });
      
      // Métricas de filas
      if (Object.keys(metrics.queueDepth).length > 0) {
        logger.info('\n📈 Filas SQS:');
        Object.entries(metrics.queueDepth).forEach(([queue, data]) => {
          logger.info(`  📦 ${queue}: ${data.messagesVisible} visíveis, ${data.messagesInFlight} processando`);
        });
      }
      
      // Métricas de DLQ
      if (Object.keys(metrics.dlqMessages).length > 0) {
        logger.info('\n⚠️  Dead Letter Queues:');
        Object.entries(metrics.dlqMessages).forEach(([queue, data]) => {
          if (data.messagesVisible > 0) {
            logger.warn(`  💀 ${queue}: ${data.messagesVisible} mensagens`);
          }
        });
      }
      
      logger.info('━'.repeat(50));
      
    } catch (error) {
      logger.error('Erro ao exibir status do sistema:', error);
    }
  }

  async shutdown() {
    if (!this.isRunning) {
      logger.info('Sistema já está parado');
      return;
    }
    
    logger.info('🛑 Iniciando shutdown do sistema...');
    
    try {
      // Parar componentes na ordem inversa
      for (const [name, component] of this.components) {
        logger.info(`Parando ${name}...`);
        if (component.stop) {
          await component.stop();
        }
      }
      
      this.components.clear();
      this.isRunning = false;
      
      logger.info('✅ Sistema parado com sucesso');
      
    } catch (error) {
      logger.error('❌ Erro durante shutdown:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      components: Array.from(this.components.keys()),
      uptime: this.isRunning ? process.uptime() : 0
    };
  }
}

// Função principal
async function main() {
  const system = new AgentesAutonomosSystem();
  
  try {
    // Configurar handlers de shutdown graceful
    process.on('SIGINT', async () => {
      logger.info('\n🛑 Recebido SIGINT, iniciando shutdown...');
      await system.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('\n🛑 Recebido SIGTERM, iniciando shutdown...');
      await system.shutdown();
      process.exit(0);
    });
    
    process.on('uncaughtException', async (error) => {
      logger.error('❌ Exceção não capturada:', error);
      await system.shutdown();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('❌ Promise rejeitada não tratada:', reason);
      await system.shutdown();
      process.exit(1);
    });
    
    // Inicializar sistema
    await system.initialize();
    
    // Manter processo vivo
    logger.info('🔄 Sistema em execução. Pressione Ctrl+C para parar.');
    
    // Status periódico (opcional)
    if (process.env.NODE_ENV !== 'production') {
      setInterval(async () => {
        await system.displaySystemStatus();
      }, 60000); // A cada minuto
    }
    
  } catch (error) {
    logger.error('❌ Falha crítica do sistema:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(error => {
    console.error('Falha na inicialização:', error);
    process.exit(1);
  });
}

module.exports = AgentesAutonomosSystem;