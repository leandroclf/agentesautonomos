/**
 * Script de Teste de Conectividade SQS
 * Fase 1: Configuração para Produção - Semana 1
 * 
 * Este script testa a conectividade com SQS real antes de substituir o MockSQSService
 */

const { SQSClient, SendMessageCommand, ReceiveMessageCommand, GetQueueUrlCommand } = require('@aws-sdk/client-sqs');
const Logger = require('../src/utils/logger');
const config = require('../src/config');

class SQSConnectivityTest {
  constructor() {
    this.logger = new Logger('sqs-connectivity-test');
    this.sqsClient = null;
    this.testResults = [];
  }

  /**
   * Inicializar cliente SQS
   */
  async initializeSQSClient() {
    try {
      this.logger.info('Initializing SQS client for connectivity test...');
      
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
   * Testar conectividade de uma fila
   */
  async testQueueConnectivity(queueName) {
    const testResult = {
      queueName,
      urlTest: false,
      sendTest: false,
      receiveTest: false,
      error: null
    };

    try {
      this.logger.info(`Testing queue: ${queueName}`);

      // Teste 1: Obter URL da fila
      let queueUrl;
      try {
        const urlResponse = await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
        queueUrl = urlResponse.QueueUrl;
        testResult.urlTest = true;
        this.logger.info(`✅ URL test passed: ${queueName} -> ${queueUrl}`);
      } catch (error) {
        testResult.error = `URL test failed: ${error.message}`;
        this.logger.error(`❌ URL test failed for ${queueName}:`, error.message);
        return testResult;
      }

      // Teste 2: Enviar mensagem de teste
      try {
        const testMessage = {
          id: `test-${Date.now()}`,
          type: 'connectivity-test',
          timestamp: new Date().toISOString(),
          data: { test: true }
        };

        await this.sqsClient.send(new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(testMessage),
          MessageAttributes: {
            'MessageType': {
              DataType: 'String',
              StringValue: 'connectivity-test'
            }
          }
        }));

        testResult.sendTest = true;
        this.logger.info(`✅ Send test passed: ${queueName}`);
      } catch (error) {
        testResult.error = `Send test failed: ${error.message}`;
        this.logger.error(`❌ Send test failed for ${queueName}:`, error.message);
        return testResult;
      }

      // Teste 3: Receber mensagem (opcional)
      try {
        const receiveResponse = await this.sqsClient.send(new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 2
        }));

        testResult.receiveTest = true;
        this.logger.info(`✅ Receive test passed: ${queueName} (${receiveResponse.Messages?.length || 0} messages)`);
      } catch (error) {
        testResult.error = `Receive test failed: ${error.message}`;
        this.logger.warn(`⚠️ Receive test failed for ${queueName}:`, error.message);
        // Não é crítico se o receive falhar
      }

    } catch (error) {
      testResult.error = error.message;
      this.logger.error(`❌ General test failed for ${queueName}:`, error);
    }

    this.testResults.push(testResult);
    return testResult;
  }

  /**
   * Testar todas as filas configuradas
   */
  async testAllQueues() {
    try {
      this.logger.info('Testing all configured queues...');

      const queuesToTest = [
        // Core Agents
        config.aws.sqs.queues.core.event,
        config.aws.sqs.queues.core.planning,
        config.aws.sqs.queues.core.execution,
        
        // Auxiliary Agents
        config.aws.sqs.queues.auxiliary.monitoring,
        config.aws.sqs.queues.auxiliary.security,
        config.aws.sqs.queues.auxiliary.policy
      ];

      for (const queueName of queuesToTest) {
        await this.testQueueConnectivity(queueName);
        // Pequena pausa entre testes
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      this.logger.info(`Completed testing ${this.testResults.length} queues`);
    } catch (error) {
      this.logger.error('Failed to test queues:', error);
      throw error;
    }
  }

  /**
   * Gerar relatório de conectividade
   */
  generateConnectivityReport() {
    try {
      this.logger.info('Generating connectivity report...');

      const report = {
        timestamp: new Date().toISOString(),
        totalQueues: this.testResults.length,
        successfulQueues: this.testResults.filter(r => r.urlTest && r.sendTest).length,
        failedQueues: this.testResults.filter(r => !r.urlTest || !r.sendTest).length,
        details: this.testResults
      };

      // Salvar relatório
      const reportPath = require('path').join(__dirname, '..', 'temp', `sqs-connectivity-report-${Date.now()}.json`);
      
      // Criar diretório temp se não existir
      const fs = require('fs');
      const tempDir = require('path').dirname(reportPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      this.logger.info(`Connectivity report saved: ${reportPath}`);
      return report;
    } catch (error) {
      this.logger.error('Failed to generate connectivity report:', error);
      throw error;
    }
  }

  /**
   * Exibir resumo dos testes
   */
  displayTestSummary() {
    console.log('\n📊 SQS Connectivity Test Summary');
    console.log('=' .repeat(50));
    
    const successful = this.testResults.filter(r => r.urlTest && r.sendTest);
    const failed = this.testResults.filter(r => !r.urlTest || !r.sendTest);
    
    console.log(`✅ Successful: ${successful.length}/${this.testResults.length}`);
    console.log(`❌ Failed: ${failed.length}/${this.testResults.length}`);
    
    if (successful.length > 0) {
      console.log('\n✅ Working Queues:');
      successful.forEach(result => {
        console.log(`  - ${result.queueName}`);
      });
    }
    
    if (failed.length > 0) {
      console.log('\n❌ Failed Queues:');
      failed.forEach(result => {
        console.log(`  - ${result.queueName}: ${result.error}`);
      });
    }
    
    console.log('\n📋 Next Steps:');
    if (failed.length === 0) {
      console.log('🎉 All queues are working! Ready to switch from MockSQSService to real SQS.');
      console.log('Run: npm run switch-to-real-sqs');
    } else {
      console.log('🔧 Fix the failed queues before proceeding:');
      console.log('1. Check AWS credentials and permissions');
      console.log('2. Verify queue names and regions');
      console.log('3. Run: npm run setup:aws-production');
    }
  }

  /**
   * Executar teste completo
   */
  async run() {
    try {
      this.logger.info('🧪 Starting SQS Connectivity Test...');
      
      await this.initializeSQSClient();
      await this.testAllQueues();
      const report = this.generateConnectivityReport();
      this.displayTestSummary();
      
      this.logger.info('✅ SQS Connectivity Test completed!');
      
      // Retornar código de saída baseado no sucesso
      const allPassed = this.testResults.every(r => r.urlTest && r.sendTest);
      process.exit(allPassed ? 0 : 1);
      
    } catch (error) {
      this.logger.error('❌ SQS Connectivity Test failed:', error);
      console.log('\n🔧 Troubleshooting:');
      console.log('1. Check AWS credentials: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
      console.log('2. Verify AWS region configuration');
      console.log('3. Ensure SQS queues exist: npm run setup:aws-production');
      console.log('4. Check network connectivity to AWS');
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const test = new SQSConnectivityTest();
  test.run();
}

module.exports = SQSConnectivityTest;