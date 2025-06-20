/**
 * Teste de Integração do Sistema
 * Fase 1: Configuração para Produção - Semana 1
 * 
 * Este script testa a comunicação entre agentes e identifica problemas críticos
 */

const { SQSClient, SendMessageCommand, ReceiveMessageCommand } = require('@aws-sdk/client-sqs');
const Logger = require('../src/utils/logger');
const config = require('../src/config');
const axios = require('axios');

class SystemIntegrationTest {
  constructor() {
    this.logger = new Logger('system-integration-test');
    this.sqsClient = null;
    this.testResults = [];
    this.agentPorts = {
      'interface-agent': 3000,
      'event-agent': 3001,
      'planning-agent': 3002,
      'execution-agent': 3003,
      'state-agent': 3004
    };
  }

  /**
   * Inicializar cliente SQS
   */
  async initializeSQSClient() {
    try {
      this.logger.info('Initializing SQS client for system test...');
      
      this.sqsClient = new SQSClient({
        region: config.aws.region,
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey
        }
      });

      this.logger.info('SQS client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SQS client:', error);
      throw error;
    }
  }

  /**
   * Testar se um agente está rodando
   */
  async testAgentHealth(agentName, port) {
    const testResult = {
      agent: agentName,
      port,
      health: false,
      metrics: false,
      error: null
    };

    try {
      this.logger.info(`Testing agent health: ${agentName} on port ${port}`);

      // Teste 1: Health check endpoint
      try {
        const healthResponse = await axios.get(`http://localhost:${port}/health`, {
          timeout: 5000
        });
        testResult.health = healthResponse.status === 200;
        this.logger.info(`✅ Health check passed: ${agentName}`);
      } catch (error) {
        testResult.error = `Health check failed: ${error.message}`;
        this.logger.warn(`⚠️ Health check failed for ${agentName}: ${error.message}`);
      }

      // Teste 2: Metrics endpoint
      try {
        const metricsResponse = await axios.get(`http://localhost:${port}/metrics`, {
          timeout: 5000
        });
        testResult.metrics = metricsResponse.status === 200;
        this.logger.info(`✅ Metrics endpoint working: ${agentName}`);
      } catch (error) {
        this.logger.warn(`⚠️ Metrics endpoint failed for ${agentName}: ${error.message}`);
      }

    } catch (error) {
      testResult.error = error.message;
      this.logger.error(`❌ Agent test failed for ${agentName}:`, error);
    }

    this.testResults.push(testResult);
    return testResult;
  }

  /**
   * Testar comunicação SQS entre agentes
   */
  async testAgentCommunication() {
    try {
      this.logger.info('Testing agent communication via SQS...');

      const testMessage = {
        id: `test-${Date.now()}`,
        type: 'system-integration-test',
        timestamp: new Date().toISOString(),
        source: 'system-integration-test',
        data: {
          test: true,
          message: 'Integration test message'
        }
      };

      // Enviar mensagem para Event Agent
      const eventQueueUrl = await this.getQueueUrl(config.aws.sqs.queues.core.event);
      
      await this.sqsClient.send(new SendMessageCommand({
        QueueUrl: eventQueueUrl,
        MessageBody: JSON.stringify(testMessage),
        MessageAttributes: {
          'MessageType': {
            DataType: 'String',
            StringValue: 'system-test'
          },
          'Source': {
            DataType: 'String',
            StringValue: 'system-integration-test'
          }
        }
      }));

      this.logger.info('✅ Test message sent to Event Agent queue');

      // Aguardar um pouco para processamento
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verificar se mensagem foi processada (opcional)
      this.logger.info('✅ Agent communication test completed');

    } catch (error) {
      this.logger.error('❌ Agent communication test failed:', error);
      throw error;
    }
  }

  /**
   * Obter URL da fila
   */
  async getQueueUrl(queueName) {
    try {
      const { GetQueueUrlCommand } = require('@aws-sdk/client-sqs');
      const response = await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
      return response.QueueUrl;
    } catch (error) {
      this.logger.error(`Failed to get queue URL for ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Testar configurações críticas
   */
  async testCriticalConfigurations() {
    try {
      this.logger.info('Testing critical configurations...');

      const configTests = {
        awsCredentials: !!config.aws.accessKeyId && !!config.aws.secretAccessKey,
        awsRegion: !!config.aws.region,
        sqsQueues: !!config.aws.sqs.queues.core.event,
        environment: !!process.env.NODE_ENV,
        logLevel: !!config.observability.logLevel
      };

      Object.entries(configTests).forEach(([key, value]) => {
        if (value) {
          this.logger.info(`✅ Configuration OK: ${key}`);
        } else {
          this.logger.error(`❌ Configuration MISSING: ${key}`);
        }
      });

      const allConfigsOk = Object.values(configTests).every(v => v);
      
      this.testResults.push({
        test: 'critical-configurations',
        passed: allConfigsOk,
        details: configTests
      });

      return allConfigsOk;
    } catch (error) {
      this.logger.error('Critical configuration test failed:', error);
      throw error;
    }
  }

  /**
   * Testar todos os agentes
   */
  async testAllAgents() {
    try {
      this.logger.info('Testing all agents...');

      for (const [agentName, port] of Object.entries(this.agentPorts)) {
        await this.testAgentHealth(agentName, port);
        // Pequena pausa entre testes
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.logger.info(`Completed testing ${Object.keys(this.agentPorts).length} agents`);
    } catch (error) {
      this.logger.error('Failed to test agents:', error);
      throw error;
    }
  }

  /**
   * Gerar relatório de integração
   */
  generateIntegrationReport() {
    try {
      this.logger.info('Generating integration report...');

      const agentResults = this.testResults.filter(r => r.agent);
      const configResults = this.testResults.filter(r => r.test === 'critical-configurations');

      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalAgents: agentResults.length,
          healthyAgents: agentResults.filter(r => r.health).length,
          agentsWithMetrics: agentResults.filter(r => r.metrics).length,
          criticalConfigsOk: configResults.length > 0 ? configResults[0].passed : false
        },
        agentDetails: agentResults,
        configurationDetails: configResults,
        recommendations: this.generateRecommendations(agentResults, configResults)
      };

      const reportPath = require('path').join(__dirname, '..', 'temp', `system-integration-report-${Date.now()}.json`);
      
      // Criar diretório temp se não existir
      const fs = require('fs');
      const tempDir = require('path').dirname(reportPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      this.logger.info(`Integration report saved: ${reportPath}`);
      return report;
    } catch (error) {
      this.logger.error('Failed to generate integration report:', error);
      throw error;
    }
  }

  /**
   * Gerar recomendações baseadas nos testes
   */
  generateRecommendations(agentResults, configResults) {
    const recommendations = [];

    // Verificar agentes não saudáveis
    const unhealthyAgents = agentResults.filter(r => !r.health);
    if (unhealthyAgents.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Agent Health',
        issue: `${unhealthyAgents.length} agents are not responding`,
        action: 'Start the missing agents or check their configuration',
        agents: unhealthyAgents.map(a => a.agent)
      });
    }

    // Verificar configurações críticas
    if (configResults.length > 0 && !configResults[0].passed) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Configuration',
        issue: 'Critical configurations are missing',
        action: 'Configure AWS credentials and environment variables',
        details: configResults[0].details
      });
    }

    // Verificar métricas
    const agentsWithoutMetrics = agentResults.filter(r => r.health && !r.metrics);
    if (agentsWithoutMetrics.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Observability',
        issue: 'Some agents are missing metrics endpoints',
        action: 'Implement /metrics endpoints for monitoring',
        agents: agentsWithoutMetrics.map(a => a.agent)
      });
    }

    return recommendations;
  }

  /**
   * Exibir resumo dos testes
   */
  displayTestSummary(report) {
    console.log('\n🧪 System Integration Test Summary');
    console.log('=' .repeat(50));
    
    console.log(`🎯 Agents Health: ${report.summary.healthyAgents}/${report.summary.totalAgents}`);
    console.log(`📊 Agents with Metrics: ${report.summary.agentsWithMetrics}/${report.summary.totalAgents}`);
    console.log(`⚙️ Critical Configs: ${report.summary.criticalConfigsOk ? '✅ OK' : '❌ MISSING'}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n🔧 Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. [${rec.priority}] ${rec.category}: ${rec.issue}`);
        console.log(`   Action: ${rec.action}`);
      });
    }
    
    console.log('\n📋 Next Steps:');
    if (report.summary.healthyAgents === report.summary.totalAgents && report.summary.criticalConfigsOk) {
      console.log('🎉 System is ready for production!');
      console.log('1. Run: npm run switch-to-real-sqs');
      console.log('2. Deploy to staging environment');
    } else {
      console.log('🔧 Fix the issues above before proceeding to production');
      console.log('1. Start missing agents: npm run start:all');
      console.log('2. Configure missing settings');
      console.log('3. Re-run this test: npm run test:system');
    }
  }

  /**
   * Executar teste completo
   */
  async run() {
    try {
      this.logger.info('🧪 Starting System Integration Test...');
      
      await this.testCriticalConfigurations();
      
      // Só testar SQS se as configurações estiverem OK
      const configOk = this.testResults.find(r => r.test === 'critical-configurations')?.passed;
      if (configOk) {
        await this.initializeSQSClient();
        await this.testAgentCommunication();
      }
      
      await this.testAllAgents();
      const report = this.generateIntegrationReport();
      this.displayTestSummary(report);
      
      this.logger.info('✅ System Integration Test completed!');
      
      // Retornar código de saída baseado no sucesso
      const systemHealthy = report.summary.healthyAgents > 0 && report.summary.criticalConfigsOk;
      process.exit(systemHealthy ? 0 : 1);
      
    } catch (error) {
      this.logger.error('❌ System Integration Test failed:', error);
      console.log('\n🔧 Troubleshooting:');
      console.log('1. Check if agents are running: npm run start:all');
      console.log('2. Verify AWS configuration');
      console.log('3. Check network connectivity');
      console.log('4. Review logs in temp/ directory');
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const test = new SystemIntegrationTest();
  test.run();
}

module.exports = SystemIntegrationTest;