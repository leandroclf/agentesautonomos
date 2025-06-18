/**
 * Script de Provisionamento AWS SQS
 * Fase 1: Criação de todas as filas SQS e DLQs para os 3 ambientes
 * 
 * Execução: npm run aws:create-queues
 */

const { SQSClient, CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const config = require('../src/config');

// Configuração do cliente SQS
const sqsClient = new SQSClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey
  }
});

// Definição de todos os agentes e suas filas
const AGENT_QUEUES = {
  // Core Agents (Phase 1-2)
  'interface-agent': { priority: 'high', phase: 1 },
  'event-agent': { priority: 'high', phase: 1 },
  'planning-agent': { priority: 'high', phase: 2 },
  'state-agent': { priority: 'high', phase: 2 },
  'observability-agent': { priority: 'high', phase: 2 },
  
  // Auxiliary Agents (Phase 3)
  'mediation-agent': { priority: 'medium', phase: 3 },
  'learning-agent': { priority: 'medium', phase: 3 },
  'recovery-agent': { priority: 'high', phase: 3 },
  'persistence-agent': { priority: 'medium', phase: 3 },
  'monitoring-agent': { priority: 'medium', phase: 3 },
  'enrichment-agent': { priority: 'low', phase: 3 },
  'lifecycle-agent': { priority: 'medium', phase: 3 },
  'external-api-gateway': { priority: 'medium', phase: 3 },
  
  // Security & Policy (Phase 4)
  'security-agent': { priority: 'high', phase: 4 },
  'policy-agent': { priority: 'high', phase: 4 }
};

// Ambientes de deployment
const ENVIRONMENTS = ['dev', 'staging', 'prod'];

/**
 * Cria uma fila SQS com configurações apropriadas
 */
async function createQueue(queueName, isDLQ = false, dlqArn = null) {
  try {
    console.log(`📦 Criando fila: ${queueName}`);
    
    const attributes = {
      'VisibilityTimeoutSeconds': '300', // 5 minutos
      'MessageRetentionPeriod': '1209600', // 14 dias
      'ReceiveMessageWaitTimeSeconds': '20', // Long polling
      'DelaySeconds': '0'
    };
    
    // Configurações específicas para DLQ
    if (isDLQ) {
      attributes['MessageRetentionPeriod'] = '1209600'; // 14 dias para análise
    } else if (dlqArn) {
      // Configurar redrive policy para fila principal
      attributes['RedrivePolicy'] = JSON.stringify({
        deadLetterTargetArn: dlqArn,
        maxReceiveCount: config.aws.sqs.dlqMaxReceiveCount
      });
    }
    
    const command = new CreateQueueCommand({
      QueueName: queueName,
      Attributes: attributes
    });
    
    const response = await sqsClient.send(command);
    console.log(`✅ Fila criada: ${queueName} - URL: ${response.QueueUrl}`);
    
    return response.QueueUrl;
  } catch (error) {
    if (error.name === 'QueueAlreadyExists') {
      console.log(`⚠️  Fila já existe: ${queueName}`);
      return null;
    }
    console.error(`❌ Erro ao criar fila ${queueName}:`, error.message);
    throw error;
  }
}

/**
 * Obtém o ARN de uma fila
 */
async function getQueueArn(queueUrl) {
  try {
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['QueueArn']
    });
    
    const response = await sqsClient.send(command);
    return response.Attributes.QueueArn;
  } catch (error) {
    console.error(`❌ Erro ao obter ARN da fila:`, error.message);
    throw error;
  }
}

/**
 * Configura tags para uma fila
 */
async function tagQueue(queueUrl, tags) {
  try {
    const command = new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: {
        'Tags': JSON.stringify(tags)
      }
    });
    
    await sqsClient.send(command);
    console.log(`🏷️  Tags aplicadas à fila`);
  } catch (error) {
    console.error(`❌ Erro ao aplicar tags:`, error.message);
  }
}

/**
 * Cria todas as filas para um ambiente específico
 */
async function createQueuesForEnvironment(environment) {
  console.log(`\n🚀 Criando filas para ambiente: ${environment.toUpperCase()}`);
  
  const createdQueues = [];
  
  for (const [agentName, config] of Object.entries(AGENT_QUEUES)) {
    const queueName = `${agentName}-queue-${environment}`;
    const dlqName = `${agentName}-queue-${environment}-dlq`;
    
    try {
      // 1. Criar DLQ primeiro
      const dlqUrl = await createQueue(dlqName, true);
      let dlqArn = null;
      
      if (dlqUrl) {
        dlqArn = await getQueueArn(dlqUrl);
        
        // Tags para DLQ
        await tagQueue(dlqUrl, {
          Environment: environment,
          Agent: agentName,
          Type: 'DLQ',
          Phase: config.phase.toString(),
          Priority: config.priority,
          Project: 'agentes-autonomos'
        });
      }
      
      // 2. Criar fila principal com referência à DLQ
      const queueUrl = await createQueue(queueName, false, dlqArn);
      
      if (queueUrl) {
        // Tags para fila principal
        await tagQueue(queueUrl, {
          Environment: environment,
          Agent: agentName,
          Type: 'Main',
          Phase: config.phase.toString(),
          Priority: config.priority,
          Project: 'agentes-autonomos'
        });
        
        createdQueues.push({
          agent: agentName,
          queueName,
          queueUrl,
          dlqName,
          dlqUrl,
          phase: config.phase,
          priority: config.priority
        });
      }
      
    } catch (error) {
      console.error(`❌ Falha ao criar filas para ${agentName} em ${environment}:`, error.message);
    }
  }
  
  return createdQueues;
}

/**
 * Gera relatório de filas criadas
 */
function generateReport(allQueues) {
  console.log('\n📊 RELATÓRIO DE PROVISIONAMENTO SQS');
  console.log('=' .repeat(50));
  
  const byEnvironment = {};
  const byPhase = {};
  
  allQueues.forEach(queue => {
    // Por ambiente
    const env = queue.queueName.split('-').pop();
    if (!byEnvironment[env]) byEnvironment[env] = [];
    byEnvironment[env].push(queue);
    
    // Por fase
    if (!byPhase[queue.phase]) byPhase[queue.phase] = [];
    byPhase[queue.phase].push(queue);
  });
  
  console.log('\n📈 Por Ambiente:');
  Object.entries(byEnvironment).forEach(([env, queues]) => {
    console.log(`  ${env.toUpperCase()}: ${queues.length} agentes`);
  });
  
  console.log('\n🎯 Por Fase de Implementação:');
  Object.entries(byPhase).forEach(([phase, queues]) => {
    console.log(`  Fase ${phase}: ${queues.length} agentes`);
    queues.forEach(queue => {
      console.log(`    - ${queue.agent} (${queue.priority})`);
    });
  });
  
  console.log(`\n✅ Total: ${allQueues.length} agentes x 3 ambientes = ${allQueues.length * 3} filas principais + DLQs`);
}

/**
 * Função principal
 */
async function main() {
  console.log('🎯 PROVISIONAMENTO AWS SQS - AGENTES AUTÔNOMOS');
  console.log('=' .repeat(60));
  
  try {
    // Validar configuração
    config.validateConfig();
    
    const allCreatedQueues = [];
    
    // Criar filas para todos os ambientes
    for (const environment of ENVIRONMENTS) {
      const queues = await createQueuesForEnvironment(environment);
      allCreatedQueues.push(...queues);
    }
    
    // Gerar relatório
    generateReport(allCreatedQueues);
    
    console.log('\n🎉 Provisionamento concluído com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('1. Verificar filas no AWS Console');
    console.log('2. Configurar IAM policies para os agentes');
    console.log('3. Configurar CloudWatch alarms para DLQs');
    console.log('4. Iniciar desenvolvimento dos agentes Core (Fase 1-2)');
    
  } catch (error) {
    console.error('❌ Falha no provisionamento:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = {
  createQueue,
  createQueuesForEnvironment,
  AGENT_QUEUES,
  ENVIRONMENTS
};