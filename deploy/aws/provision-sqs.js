/**
 * SQS Provisioning Script
 * Cria todas as filas SQS necessárias para o sistema de agentes autônomos
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configuração AWS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.SQS_ENDPOINT || undefined, // Para LocalStack
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
});

// Definição das filas conforme o plano de implementação
const QUEUE_DEFINITIONS = {
  // Filas principais dos agentes core
  'agent-interface-queue': {
    description: 'Fila para receber requisições do Interface Agent',
    attributes: {
      VisibilityTimeoutSeconds: '30',
      MessageRetentionPeriod: '1209600', // 14 dias
      ReceiveMessageWaitTimeSeconds: '20', // Long polling
      MaxReceiveCount: '3'
    },
    dlq: true
  },
  'agent-event-queue': {
    description: 'Fila para eventos do Event Agent',
    attributes: {
      VisibilityTimeoutSeconds: '60',
      MessageRetentionPeriod: '1209600',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '3'
    },
    dlq: true
  },
  'agent-planning-queue': {
    description: 'Fila para tarefas do Planning Agent',
    attributes: {
      VisibilityTimeoutSeconds: '300', // 5 minutos para planejamento
      MessageRetentionPeriod: '1209600',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '2'
    },
    dlq: true
  },
  'agent-execution-queue': {
    description: 'Fila para execução de tarefas do Execution Agent',
    attributes: {
      VisibilityTimeoutSeconds: '600', // 10 minutos para execução
      MessageRetentionPeriod: '1209600',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '2'
    },
    dlq: true
  },
  'agent-state-queue': {
    description: 'Fila para atualizações de estado do State Management Agent',
    attributes: {
      VisibilityTimeoutSeconds: '30',
      MessageRetentionPeriod: '1209600',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '5'
    },
    dlq: true
  },
  'agent-acl-queue': {
    description: 'Fila para o ACL Middleware Agent',
    attributes: {
      VisibilityTimeoutSeconds: '30',
      MessageRetentionPeriod: '1209600',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '3'
    },
    dlq: true
  },
  
  // Filas auxiliares
  'agent-monitoring-queue': {
    description: 'Fila para métricas e monitoramento',
    attributes: {
      VisibilityTimeoutSeconds: '30',
      MessageRetentionPeriod: '604800', // 7 dias
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '3'
    },
    dlq: true
  },
  'agent-policy-queue': {
    description: 'Fila para atualizações de políticas',
    attributes: {
      VisibilityTimeoutSeconds: '60',
      MessageRetentionPeriod: '1209600',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '3'
    },
    dlq: true
  },
  'agent-security-queue': {
    description: 'Fila para eventos de segurança',
    attributes: {
      VisibilityTimeoutSeconds: '30',
      MessageRetentionPeriod: '2592000', // 30 dias
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '5'
    },
    dlq: true
  },
  
  // Filas de coordenação
  'coordination-queue': {
    description: 'Fila para coordenação entre agentes',
    attributes: {
      VisibilityTimeoutSeconds: '60',
      MessageRetentionPeriod: '1209600',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '3'
    },
    dlq: true
  },
  'broadcast-queue': {
    description: 'Fila para mensagens broadcast',
    attributes: {
      VisibilityTimeoutSeconds: '30',
      MessageRetentionPeriod: '604800',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '2'
    },
    dlq: true
  },
  
  // Filas de notificação
  'notification-queue': {
    description: 'Fila para notificações do sistema',
    attributes: {
      VisibilityTimeoutSeconds: '30',
      MessageRetentionPeriod: '604800',
      ReceiveMessageWaitTimeSeconds: '20',
      MaxReceiveCount: '3'
    },
    dlq: true
  }
};

class SQSProvisioner {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.queuePrefix = process.env.QUEUE_PREFIX || `agents-${this.environment}`;
    this.createdQueues = [];
    this.errors = [];
  }

  async provisionAll() {
    console.log(`🚀 Iniciando provisionamento SQS para ambiente: ${this.environment}`);
    console.log(`📋 Prefixo das filas: ${this.queuePrefix}`);
    console.log(`🔧 Endpoint SQS: ${process.env.SQS_ENDPOINT || 'AWS Default'}`);
    console.log('');

    try {
      // Verificar conectividade
      await this.testConnection();
      
      // Criar filas principais
      await this.createQueues();
      
      // Criar Dead Letter Queues
      await this.createDeadLetterQueues();
      
      // Configurar redrive policies
      await this.configureRedrivePolicy();
      
      // Gerar relatório
      await this.generateReport();
      
      console.log('✅ Provisionamento SQS concluído com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro durante o provisionamento:', error);
      throw error;
    }
  }

  async testConnection() {
    console.log('🔍 Testando conectividade com SQS...');
    try {
      await sqs.listQueues({ MaxResults: 1 }).promise();
      console.log('✅ Conectividade SQS confirmada');
    } catch (error) {
      console.error('❌ Falha na conectividade SQS:', error.message);
      throw error;
    }
  }

  async createQueues() {
    console.log('📦 Criando filas principais...');
    
    for (const [queueName, config] of Object.entries(QUEUE_DEFINITIONS)) {
      try {
        const fullQueueName = `${this.queuePrefix}-${queueName}`;
        
        // Verificar se a fila já existe
        const existingQueue = await this.getQueueUrl(fullQueueName);
        if (existingQueue) {
          console.log(`⏭️  Fila já existe: ${fullQueueName}`);
          this.createdQueues.push({ name: fullQueueName, url: existingQueue, status: 'exists' });
          continue;
        }
        
        // Criar nova fila
        const params = {
          QueueName: fullQueueName,
          Attributes: config.attributes
        };
        
        const result = await sqs.createQueue(params).promise();
        console.log(`✅ Fila criada: ${fullQueueName}`);
        
        this.createdQueues.push({
          name: fullQueueName,
          url: result.QueueUrl,
          status: 'created',
          description: config.description
        });
        
      } catch (error) {
        console.error(`❌ Erro ao criar fila ${queueName}:`, error.message);
        this.errors.push({ queue: queueName, error: error.message });
      }
    }
  }

  async createDeadLetterQueues() {
    console.log('💀 Criando Dead Letter Queues...');
    
    for (const [queueName, config] of Object.entries(QUEUE_DEFINITIONS)) {
      if (!config.dlq) continue;
      
      try {
        const dlqName = `${this.queuePrefix}-${queueName}-dlq`;
        
        // Verificar se a DLQ já existe
        const existingDLQ = await this.getQueueUrl(dlqName);
        if (existingDLQ) {
          console.log(`⏭️  DLQ já existe: ${dlqName}`);
          continue;
        }
        
        // Criar DLQ
        const dlqParams = {
          QueueName: dlqName,
          Attributes: {
            VisibilityTimeoutSeconds: '30',
            MessageRetentionPeriod: '1209600', // 14 dias
            ReceiveMessageWaitTimeSeconds: '20'
          }
        };
        
        const dlqResult = await sqs.createQueue(dlqParams).promise();
        console.log(`✅ DLQ criada: ${dlqName}`);
        
        this.createdQueues.push({
          name: dlqName,
          url: dlqResult.QueueUrl,
          status: 'created',
          type: 'dlq'
        });
        
      } catch (error) {
        console.error(`❌ Erro ao criar DLQ para ${queueName}:`, error.message);
        this.errors.push({ queue: `${queueName}-dlq`, error: error.message });
      }
    }
  }

  async configureRedrivePolicy() {
    console.log('🔄 Configurando redrive policies...');
    
    for (const [queueName, config] of Object.entries(QUEUE_DEFINITIONS)) {
      if (!config.dlq) continue;
      
      try {
        const mainQueueName = `${this.queuePrefix}-${queueName}`;
        const dlqName = `${this.queuePrefix}-${queueName}-dlq`;
        
        // Obter ARNs das filas
        const mainQueueUrl = await this.getQueueUrl(mainQueueName);
        const dlqUrl = await this.getQueueUrl(dlqName);
        
        if (!mainQueueUrl || !dlqUrl) {
          console.log(`⏭️  Pulando redrive policy para ${queueName} (filas não encontradas)`);
          continue;
        }
        
        // Obter ARN da DLQ
        const dlqAttributes = await sqs.getQueueAttributes({
          QueueUrl: dlqUrl,
          AttributeNames: ['QueueArn']
        }).promise();
        
        const dlqArn = dlqAttributes.Attributes.QueueArn;
        
        // Configurar redrive policy na fila principal
        const redrivePolicy = {
          deadLetterTargetArn: dlqArn,
          maxReceiveCount: parseInt(config.attributes.MaxReceiveCount || '3')
        };
        
        await sqs.setQueueAttributes({
          QueueUrl: mainQueueUrl,
          Attributes: {
            RedrivePolicy: JSON.stringify(redrivePolicy)
          }
        }).promise();
        
        console.log(`✅ Redrive policy configurada: ${mainQueueName} -> ${dlqName}`);
        
      } catch (error) {
        console.error(`❌ Erro ao configurar redrive policy para ${queueName}:`, error.message);
        this.errors.push({ queue: queueName, error: `Redrive policy: ${error.message}` });
      }
    }
  }

  async getQueueUrl(queueName) {
    try {
      const result = await sqs.getQueueUrl({ QueueName: queueName }).promise();
      return result.QueueUrl;
    } catch (error) {
      if (error.code === 'AWS.SimpleQueueService.NonExistentQueue') {
        return null;
      }
      throw error;
    }
  }

  async generateReport() {
    console.log('');
    console.log('📊 RELATÓRIO DE PROVISIONAMENTO');
    console.log('================================');
    console.log(`Ambiente: ${this.environment}`);
    console.log(`Prefixo: ${this.queuePrefix}`);
    console.log(`Total de filas processadas: ${this.createdQueues.length}`);
    console.log(`Erros: ${this.errors.length}`);
    console.log('');
    
    // Filas criadas/existentes
    console.log('📋 FILAS:');
    this.createdQueues.forEach(queue => {
      const status = queue.status === 'created' ? '🆕' : '✅';
      const type = queue.type === 'dlq' ? ' (DLQ)' : '';
      console.log(`${status} ${queue.name}${type}`);
      if (queue.description) {
        console.log(`   ${queue.description}`);
      }
    });
    
    // Erros
    if (this.errors.length > 0) {
      console.log('');
      console.log('❌ ERROS:');
      this.errors.forEach(error => {
        console.log(`   ${error.queue}: ${error.error}`);
      });
    }
    
    // Salvar relatório em arquivo
    const reportData = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      queuePrefix: this.queuePrefix,
      queues: this.createdQueues,
      errors: this.errors,
      summary: {
        totalQueues: this.createdQueues.length,
        newQueues: this.createdQueues.filter(q => q.status === 'created').length,
        existingQueues: this.createdQueues.filter(q => q.status === 'exists').length,
        errors: this.errors.length
      }
    };
    
    const reportPath = path.join(__dirname, '..', 'logs', `sqs-provision-${this.environment}-${Date.now()}.json`);
    
    try {
      // Ensure logs directory exists
      const logsDir = path.dirname(reportPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`📄 Relatório salvo em: ${reportPath}`);
    } catch (error) {
      console.error('❌ Erro ao salvar relatório:', error.message);
    }
  }

  async cleanup() {
    console.log('🧹 Limpando filas (CUIDADO: Operação destrutiva!)...');
    
    const confirm = process.argv.includes('--confirm-cleanup');
    if (!confirm) {
      console.log('❌ Cleanup cancelado. Use --confirm-cleanup para confirmar.');
      return;
    }
    
    for (const queue of this.createdQueues) {
      try {
        await sqs.deleteQueue({ QueueUrl: queue.url }).promise();
        console.log(`🗑️  Fila removida: ${queue.name}`);
      } catch (error) {
        console.error(`❌ Erro ao remover fila ${queue.name}:`, error.message);
      }
    }
  }

  async listExistingQueues() {
    console.log('📋 Listando filas existentes...');
    
    try {
      const result = await sqs.listQueues({
        QueueNamePrefix: this.queuePrefix
      }).promise();
      
      if (!result.QueueUrls || result.QueueUrls.length === 0) {
        console.log('📭 Nenhuma fila encontrada com o prefixo especificado.');
        return;
      }
      
      console.log(`📋 Encontradas ${result.QueueUrls.length} filas:`);
      for (const queueUrl of result.QueueUrls) {
        const queueName = queueUrl.split('/').pop();
        console.log(`   ${queueName}`);
      }
      
    } catch (error) {
      console.error('❌ Erro ao listar filas:', error.message);
    }
  }
}

// Execução do script
async function main() {
  const provisioner = new SQSProvisioner();
  
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'provision':
      case undefined:
        await provisioner.provisionAll();
        break;
        
      case 'list':
        await provisioner.listExistingQueues();
        break;
        
      case 'cleanup':
        await provisioner.cleanup();
        break;
        
      default:
        console.log('Uso: node provision-sqs.js [provision|list|cleanup]');
        console.log('');
        console.log('Comandos:');
        console.log('  provision  - Cria todas as filas SQS (padrão)');
        console.log('  list       - Lista filas existentes');
        console.log('  cleanup    - Remove todas as filas (use --confirm-cleanup)');
        console.log('');
        console.log('Variáveis de ambiente:');
        console.log('  NODE_ENV           - Ambiente (development, staging, production)');
        console.log('  QUEUE_PREFIX       - Prefixo das filas');
        console.log('  AWS_REGION         - Região AWS');
        console.log('  SQS_ENDPOINT       - Endpoint SQS (para LocalStack)');
        console.log('  AWS_ACCESS_KEY_ID  - Chave de acesso AWS');
        console.log('  AWS_SECRET_ACCESS_KEY - Chave secreta AWS');
        break;
    }
  } catch (error) {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = SQSProvisioner;