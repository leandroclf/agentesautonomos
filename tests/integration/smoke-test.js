/**
 * Smoke Test - Fase 2.5
 * Teste de integração básico para validar o fluxo end-to-end dos agentes core
 */

const axios = require('axios');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Configuração dos agentes
const AGENTS = {
  interface: { port: 3001, name: 'interface-agent' },
  event: { port: 3002, name: 'event-agent' },
  planning: { port: 3003, name: 'planning-agent' },
  execution: { port: 3004, name: 'execution-agent' },
  state: { port: 3005, name: 'state-management-agent' },
  acl: { port: 3006, name: 'acl-middleware-agent' }
};

// Configuração SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.SQS_ENDPOINT || undefined,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
});

class SmokeTest {
  constructor() {
    this.testId = uuidv4();
    this.environment = process.env.NODE_ENV || 'development';
    this.queuePrefix = process.env.QUEUE_PREFIX || `agents-${this.environment}`;
    this.results = {
      timestamp: new Date().toISOString(),
      testId: this.testId,
      environment: this.environment,
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
  }

  async runAllTests() {
    console.log('🧪 INICIANDO SMOKE TEST - FASE 2.5');
    console.log('===================================');
    console.log(`Test ID: ${this.testId}`);
    console.log(`Ambiente: ${this.environment}`);
    console.log(`Timestamp: ${this.results.timestamp}`);
    console.log('');

    try {
      // Testes de conectividade
      await this.testAgentConnectivity();
      
      // Testes de SQS
      await this.testSQSConnectivity();
      
      // Testes de fluxo end-to-end
      await this.testEndToEndFlow();
      
      // Testes de observabilidade
      await this.testObservability();
      
      // Testes de recuperação de falhas
      await this.testFailureRecovery();
      
      // Gerar relatório
      await this.generateReport();
      
      console.log('✅ Smoke Test concluído!');
      
    } catch (error) {
      console.error('❌ Erro durante o smoke test:', error);
      throw error;
    }
  }

  async testAgentConnectivity() {
    console.log('🔍 Testando conectividade dos agentes...');
    
    for (const [agentKey, config] of Object.entries(AGENTS)) {
      const testName = `agent-connectivity-${agentKey}`;
      const startTime = Date.now();
      
      try {
        const response = await axios.get(`http://localhost:${config.port}/health`, {
          timeout: 5000
        });
        
        const duration = Date.now() - startTime;
        
        if (response.status === 200) {
          this.addTestResult(testName, 'passed', {
            agent: config.name,
            port: config.port,
            responseTime: duration,
            status: response.data
          });
          console.log(`✅ ${config.name} (porta ${config.port}) - ${duration}ms`);
        } else {
          throw new Error(`Status inesperado: ${response.status}`);
        }
        
      } catch (error) {
        this.addTestResult(testName, 'failed', {
          agent: config.name,
          port: config.port,
          error: error.message
        });
        console.log(`❌ ${config.name} (porta ${config.port}) - ${error.message}`);
      }
    }
  }

  async testSQSConnectivity() {
    console.log('🔍 Testando conectividade SQS...');
    
    const testName = 'sqs-connectivity';
    const startTime = Date.now();
    
    try {
      // Listar filas com o prefixo do projeto
      const result = await sqs.listQueues({
        QueueNamePrefix: this.queuePrefix
      }).promise();
      
      const duration = Date.now() - startTime;
      const queueCount = result.QueueUrls ? result.QueueUrls.length : 0;
      
      this.addTestResult(testName, 'passed', {
        queueCount,
        responseTime: duration,
        queues: result.QueueUrls || []
      });
      
      console.log(`✅ SQS conectado - ${queueCount} filas encontradas - ${duration}ms`);
      
    } catch (error) {
      this.addTestResult(testName, 'failed', {
        error: error.message
      });
      console.log(`❌ SQS falhou - ${error.message}`);
    }
  }

  async testEndToEndFlow() {
    console.log('🔍 Testando fluxo end-to-end...');
    
    const testName = 'end-to-end-flow';
    const startTime = Date.now();
    
    try {
      // 1. Enviar requisição para Interface Agent
      const taskRequest = {
        id: uuidv4(),
        type: 'user_intention',
        intention: 'create_simple_task',
        data: {
          title: `Smoke Test Task ${this.testId}`,
          description: 'Tarefa criada durante o smoke test',
          priority: 'medium'
        },
        metadata: {
          userId: 'smoke-test-user',
          sessionId: this.testId,
          timestamp: new Date().toISOString()
        }
      };
      
      console.log(`   📤 Enviando requisição para Interface Agent...`);
      const interfaceResponse = await axios.post(
        `http://localhost:${AGENTS.interface.port}/api/intentions`,
        taskRequest,
        { timeout: 10000 }
      );
      
      if (interfaceResponse.status !== 200 && interfaceResponse.status !== 202) {
        throw new Error(`Interface Agent retornou status ${interfaceResponse.status}`);
      }
      
      console.log(`   ✅ Interface Agent respondeu: ${interfaceResponse.status}`);
      
      // 2. Aguardar processamento (simular tempo de processamento)
      console.log(`   ⏳ Aguardando processamento...`);
      await this.sleep(3000);
      
      // 3. Verificar estado no State Management Agent
      console.log(`   📋 Verificando estado...`);
      const stateResponse = await axios.get(
        `http://localhost:${AGENTS.state.port}/api/state/tasks/${taskRequest.id}`,
        { timeout: 5000 }
      );
      
      const duration = Date.now() - startTime;
      
      this.addTestResult(testName, 'passed', {
        taskId: taskRequest.id,
        interfaceStatus: interfaceResponse.status,
        stateStatus: stateResponse.status,
        processingTime: duration,
        taskState: stateResponse.data
      });
      
      console.log(`✅ Fluxo end-to-end concluído - ${duration}ms`);
      
    } catch (error) {
      this.addTestResult(testName, 'failed', {
        error: error.message,
        stack: error.stack
      });
      console.log(`❌ Fluxo end-to-end falhou - ${error.message}`);
    }
  }

  async testObservability() {
    console.log('🔍 Testando observabilidade...');
    
    for (const [agentKey, config] of Object.entries(AGENTS)) {
      const testName = `observability-${agentKey}`;
      
      try {
        // Testar endpoint de métricas
        const metricsResponse = await axios.get(
          `http://localhost:${config.port}/metrics`,
          { timeout: 5000 }
        );
        
        if (metricsResponse.status === 200) {
          const metricsData = metricsResponse.data;
          const hasPrometheusMetrics = typeof metricsData === 'string' && 
                                     metricsData.includes('# HELP');
          
          this.addTestResult(testName, 'passed', {
            agent: config.name,
            hasMetrics: hasPrometheusMetrics,
            metricsSize: metricsData.length
          });
          
          console.log(`✅ ${config.name} métricas OK`);
        } else {
          throw new Error(`Status inesperado: ${metricsResponse.status}`);
        }
        
      } catch (error) {
        this.addTestResult(testName, 'failed', {
          agent: config.name,
          error: error.message
        });
        console.log(`❌ ${config.name} métricas falhou - ${error.message}`);
      }
    }
  }

  async testFailureRecovery() {
    console.log('🔍 Testando recuperação de falhas...');
    
    const testName = 'failure-recovery';
    
    try {
      // Simular requisição inválida
      console.log(`   🚫 Enviando requisição inválida...`);
      
      try {
        await axios.post(
          `http://localhost:${AGENTS.interface.port}/api/intentions`,
          { invalid: 'data' },
          { timeout: 5000 }
        );
      } catch (error) {
        // Esperamos que falhe
        if (error.response && error.response.status >= 400) {
          console.log(`   ✅ Requisição inválida rejeitada corretamente: ${error.response.status}`);
        }
      }
      
      // Verificar se os agentes ainda estão funcionais
      console.log(`   🔄 Verificando funcionalidade após erro...`);
      
      let allHealthy = true;
      for (const [agentKey, config] of Object.entries(AGENTS)) {
        try {
          const response = await axios.get(`http://localhost:${config.port}/health`, {
            timeout: 3000
          });
          
          if (response.status !== 200) {
            allHealthy = false;
            break;
          }
        } catch (error) {
          allHealthy = false;
          break;
        }
      }
      
      this.addTestResult(testName, allHealthy ? 'passed' : 'failed', {
        allAgentsHealthy: allHealthy,
        recoveryTest: 'completed'
      });
      
      console.log(`${allHealthy ? '✅' : '❌'} Recuperação de falhas: ${allHealthy ? 'OK' : 'FALHOU'}`);
      
    } catch (error) {
      this.addTestResult(testName, 'failed', {
        error: error.message
      });
      console.log(`❌ Teste de recuperação falhou - ${error.message}`);
    }
  }

  addTestResult(name, status, data = {}) {
    this.results.tests.push({
      name,
      status,
      timestamp: new Date().toISOString(),
      data
    });
    
    this.results.summary.total++;
    this.results.summary[status]++;
  }

  async generateReport() {
    console.log('');
    console.log('📊 RELATÓRIO DO SMOKE TEST');
    console.log('===========================');
    console.log(`Test ID: ${this.testId}`);
    console.log(`Ambiente: ${this.environment}`);
    console.log(`Total de testes: ${this.results.summary.total}`);
    console.log(`✅ Passou: ${this.results.summary.passed}`);
    console.log(`❌ Falhou: ${this.results.summary.failed}`);
    console.log(`⏭️  Pulou: ${this.results.summary.skipped}`);
    
    const successRate = this.results.summary.total > 0 ? 
      (this.results.summary.passed / this.results.summary.total * 100).toFixed(2) : 0;
    console.log(`📈 Taxa de sucesso: ${successRate}%`);
    
    // Testes que falharam
    const failedTests = this.results.tests.filter(test => test.status === 'failed');
    if (failedTests.length > 0) {
      console.log('');
      console.log('❌ TESTES QUE FALHARAM:');
      failedTests.forEach(test => {
        console.log(`   ${test.name}: ${test.data.error || 'Erro desconhecido'}`);
      });
    }
    
    // Salvar relatório
    const reportPath = path.join(__dirname, '..', '..', 'logs', `smoke-test-${this.environment}-${Date.now()}.json`);
    
    try {
      // Ensure logs directory exists
      const logsDir = path.dirname(reportPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      console.log(`📄 Relatório salvo em: ${reportPath}`);
    } catch (error) {
      console.error('❌ Erro ao salvar relatório:', error.message);
    }
    
    // Determinar se o teste passou
    const testPassed = this.results.summary.failed === 0 && this.results.summary.passed > 0;
    
    console.log('');
    console.log(`🎯 RESULTADO FINAL: ${testPassed ? '✅ PASSOU' : '❌ FALHOU'}`);
    
    if (!testPassed) {
      process.exit(1);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Execução do script
async function main() {
  const smokeTest = new SmokeTest();
  
  try {
    await smokeTest.runAllTests();
  } catch (error) {
    console.error('💥 Erro fatal no smoke test:', error);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = SmokeTest;