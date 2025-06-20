/**
 * Script para criar automaticamente as filas SQS necessárias no LocalStack
 * Execução: node scripts/setup-sqs-queues.js
 */

const { SQSClient, CreateQueueCommand, ListQueuesCommand } = require('@aws-sdk/client-sqs');
const path = require('path');

// Carregar configuração do ambiente de desenvolvimento
require('dotenv').config({ path: path.join(__dirname, '..', 'config', 'environments', '.env.development') });

const config = require('../src/config');

class SQSSetup {
  constructor() {
    this.client = new SQSClient({
      region: config.shared.sqs.region,
      endpoint: config.shared.sqs.endpoint,
      credentials: {
        accessKeyId: config.shared.sqs.accessKeyId,
        secretAccessKey: config.shared.sqs.secretAccessKey
      }
    });

    // Filas necessárias para o sistema
    this.requiredQueues = [
      'event-agent-queue-dev',
      'planning-agent-queue-dev', 
      'execution-agent-queue-dev',
      'monitoring-agent-queue-dev',
      'state-agent-queue-dev',
      'security-agent-queue-dev',
      'acl-agent-queue-dev',
      'policy-agent-queue-dev',
      // DLQs (Dead Letter Queues)
      'event-agent-dlq-dev',
      'planning-agent-dlq-dev',
      'execution-agent-dlq-dev',
      'monitoring-agent-dlq-dev',
      'state-agent-dlq-dev',
      'security-agent-dlq-dev',
      'acl-agent-dlq-dev',
      'policy-agent-dlq-dev'
    ];
  }

  async setupQueues() {
    console.log('🚀 Iniciando configuração das filas SQS...');
    console.log(`📍 Endpoint: ${config.shared.sqs.endpoint}`);
    console.log(`🌍 Região: ${config.shared.sqs.region}`);
    console.log('');

    try {
      // Verificar filas existentes
      console.log('🔍 Verificando filas existentes...');
      const existingQueues = await this.listExistingQueues();
      console.log(`📋 Encontradas ${existingQueues.length} filas existentes`);
      console.log('');

      // Criar filas necessárias
      let createdCount = 0;
      let skippedCount = 0;

      for (const queueName of this.requiredQueues) {
        const queueExists = existingQueues.some(url => url.includes(queueName));
        
        if (queueExists) {
          console.log(`⏭️  Fila já existe: ${queueName}`);
          skippedCount++;
        } else {
          console.log(`🔧 Criando fila: ${queueName}`);
          await this.createQueue(queueName);
          createdCount++;
        }
      }

      console.log('');
      console.log('📊 Resumo:');
      console.log(`✅ Filas criadas: ${createdCount}`);
      console.log(`⏭️  Filas já existentes: ${skippedCount}`);
      console.log(`📋 Total de filas necessárias: ${this.requiredQueues.length}`);
      
      // Verificação final
      console.log('');
      console.log('🔍 Verificação final...');
      const finalQueues = await this.listExistingQueues();
      console.log(`📋 Total de filas no sistema: ${finalQueues.length}`);
      
      console.log('');
      console.log('🎉 Configuração das filas SQS concluída com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro durante a configuração:', error.message);
      process.exit(1);
    }
  }

  async listExistingQueues() {
    try {
      const command = new ListQueuesCommand({});
      const response = await this.client.send(command);
      return response.QueueUrls || [];
    } catch (error) {
      console.error('❌ Erro ao listar filas:', error.message);
      return [];
    }
  }

  async createQueue(queueName) {
    try {
      const command = new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {
          'VisibilityTimeout': '30',
          'MessageRetentionPeriod': '1209600', // 14 dias
          'ReceiveMessageWaitTimeSeconds': '20' // Long polling
        }
      });
      
      const response = await this.client.send(command);
      console.log(`✅ Fila criada com sucesso: ${response.QueueUrl}`);
      return response.QueueUrl;
    } catch (error) {
      console.error(`❌ Erro ao criar fila ${queueName}:`, error.message);
      throw error;
    }
  }
}

// Executar configuração
if (require.main === module) {
  const setup = new SQSSetup();
  setup.setupQueues().catch(error => {
    console.error('❌ Falha na configuração:', error);
    process.exit(1);
  });
}

module.exports = SQSSetup;