#!/usr/bin/env node

/**
 * AWS Verification Script
 * 
 * Verifica a conectividade e configuração das filas SQS
 * necessárias para o sistema de agentes autônomos
 */

const { SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const winston = require('winston');

// Configurar logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Lista de filas esperadas (baseada no aws-setup.js)
const EXPECTED_QUEUES = [
  // Core Agents
  'state-management-queue',
  'interface-incoming-queue',
  'interface-outgoing-queue', 
  'event-processing-queue',
  'planning-queue',
  'execution-queue',
  'mediator-queue',
  'marl-coordination-queue',
  
  // Auxiliary Agents
  'monitoring-queue',
  'policy-queue',
  'security-queue',
  'resource-queue',
  'communication-queue',
  'learning-queue',
  'adaptation-queue',
  
  // System Queues
  'state-changes-queue',
  'agent-events-queue',
  'system-events-queue'
];

// DLQs correspondentes
const EXPECTED_DLQS = EXPECTED_QUEUES.map(queue => `${queue}-dlq`);

class AWSVerifier {
  constructor() {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.results = {
      queues: {
        found: [],
        missing: [],
        errors: []
      },
      dlqs: {
        found: [],
        missing: [],
        errors: []
      },
      summary: {
        totalQueues: EXPECTED_QUEUES.length,
        totalDLQs: EXPECTED_DLQS.length,
        foundQueues: 0,
        foundDLQs: 0,
        errors: 0
      }
    };
  }

  async verifyQueue(queueName) {
    try {
      logger.info(`🔍 Checking queue: ${queueName}`);
      
      // Tentar obter URL da fila
      const getUrlCommand = new GetQueueUrlCommand({ QueueName: queueName });
      const urlResponse = await this.sqsClient.send(getUrlCommand);
      
      if (!urlResponse.QueueUrl) {
        throw new Error('Queue URL not found');
      }
      
      // Obter atributos da fila
      const getAttributesCommand = new GetQueueAttributesCommand({
        QueueUrl: urlResponse.QueueUrl,
        AttributeNames: ['All']
      });
      
      const attributesResponse = await this.sqsClient.send(getAttributesCommand);
      
      const queueInfo = {
        name: queueName,
        url: urlResponse.QueueUrl,
        attributes: {
          messagesAvailable: attributesResponse.Attributes?.ApproximateNumberOfMessages || '0',
          messagesInFlight: attributesResponse.Attributes?.ApproximateNumberOfMessagesNotVisible || '0',
          createdTimestamp: attributesResponse.Attributes?.CreatedTimestamp,
          visibilityTimeout: attributesResponse.Attributes?.VisibilityTimeout,
          messageRetentionPeriod: attributesResponse.Attributes?.MessageRetentionPeriod,
          dlqTarget: attributesResponse.Attributes?.RedrivePolicy ? 
            JSON.parse(attributesResponse.Attributes.RedrivePolicy).deadLetterTargetArn : null
        }
      };
      
      logger.info(`✅ Queue found: ${queueName}`);
      return queueInfo;
      
    } catch (error) {
      logger.error(`❌ Queue error: ${queueName} - ${error.message}`);
      throw error;
    }
  }

  async verifyAllQueues() {
    logger.info('🚀 Starting AWS SQS verification...');
    logger.info(`📊 Expected queues: ${EXPECTED_QUEUES.length}`);
    logger.info(`📊 Expected DLQs: ${EXPECTED_DLQS.length}`);
    logger.info('=' * 50);
    
    // Verificar filas principais
    logger.info('\n📋 Verifying main queues...');
    for (const queueName of EXPECTED_QUEUES) {
      try {
        const queueInfo = await this.verifyQueue(queueName);
        this.results.queues.found.push(queueInfo);
        this.results.summary.foundQueues++;
      } catch (error) {
        this.results.queues.missing.push(queueName);
        this.results.queues.errors.push({
          queue: queueName,
          error: error.message
        });
        this.results.summary.errors++;
      }
    }
    
    // Verificar DLQs
    logger.info('\n💀 Verifying Dead Letter Queues...');
    for (const dlqName of EXPECTED_DLQS) {
      try {
        const dlqInfo = await this.verifyQueue(dlqName);
        this.results.dlqs.found.push(dlqInfo);
        this.results.summary.foundDLQs++;
      } catch (error) {
        this.results.dlqs.missing.push(dlqName);
        this.results.dlqs.errors.push({
          queue: dlqName,
          error: error.message
        });
        this.results.summary.errors++;
      }
    }
  }

  generateReport() {
    logger.info('\n' + '=' * 60);
    logger.info('📊 AWS SQS VERIFICATION REPORT');
    logger.info('=' * 60);
    
    // Resumo geral
    logger.info('\n📈 SUMMARY:');
    logger.info(`   Total Expected Queues: ${this.results.summary.totalQueues}`);
    logger.info(`   Found Queues: ${this.results.summary.foundQueues}`);
    logger.info(`   Missing Queues: ${this.results.summary.totalQueues - this.results.summary.foundQueues}`);
    logger.info(`   Total Expected DLQs: ${this.results.summary.totalDLQs}`);
    logger.info(`   Found DLQs: ${this.results.summary.foundDLQs}`);
    logger.info(`   Missing DLQs: ${this.results.summary.totalDLQs - this.results.summary.foundDLQs}`);
    logger.info(`   Total Errors: ${this.results.summary.errors}`);
    
    // Status geral
    const allQueuesFound = this.results.summary.foundQueues === this.results.summary.totalQueues;
    const allDLQsFound = this.results.summary.foundDLQs === this.results.summary.totalDLQs;
    const overallStatus = allQueuesFound && allDLQsFound ? '✅ PASS' : '❌ FAIL';
    
    logger.info(`\n🎯 OVERALL STATUS: ${overallStatus}`);
    
    // Filas encontradas
    if (this.results.queues.found.length > 0) {
      logger.info('\n✅ FOUND QUEUES:');
      this.results.queues.found.forEach(queue => {
        logger.info(`   • ${queue.name}`);
        logger.info(`     URL: ${queue.url}`);
        logger.info(`     Messages: ${queue.attributes.messagesAvailable} available, ${queue.attributes.messagesInFlight} in-flight`);
      });
    }
    
    // Filas perdidas
    if (this.results.queues.missing.length > 0) {
      logger.error('\n❌ MISSING QUEUES:');
      this.results.queues.missing.forEach(queueName => {
        logger.error(`   • ${queueName}`);
      });
    }
    
    // DLQs encontradas
    if (this.results.dlqs.found.length > 0) {
      logger.info('\n✅ FOUND DLQs:');
      this.results.dlqs.found.forEach(dlq => {
        logger.info(`   • ${dlq.name}`);
      });
    }
    
    // DLQs perdidas
    if (this.results.dlqs.missing.length > 0) {
      logger.error('\n❌ MISSING DLQs:');
      this.results.dlqs.missing.forEach(dlqName => {
        logger.error(`   • ${dlqName}`);
      });
    }
    
    // Erros detalhados
    if (this.results.queues.errors.length > 0 || this.results.dlqs.errors.length > 0) {
      logger.error('\n🚨 DETAILED ERRORS:');
      [...this.results.queues.errors, ...this.results.dlqs.errors].forEach(error => {
        logger.error(`   • ${error.queue}: ${error.error}`);
      });
    }
    
    // Recomendações
    logger.info('\n💡 RECOMMENDATIONS:');
    if (!allQueuesFound || !allDLQsFound) {
      logger.info('   • Run: npm run aws:setup');
      logger.info('   • Check AWS credentials and region configuration');
      logger.info('   • Verify IAM permissions for SQS operations');
    } else {
      logger.info('   • All queues are properly configured!');
      logger.info('   • System is ready for deployment');
    }
    
    logger.info('\n' + '=' * 60);
    
    return overallStatus === '✅ PASS';
  }

  async run() {
    try {
      await this.verifyAllQueues();
      const success = this.generateReport();
      
      process.exit(success ? 0 : 1);
      
    } catch (error) {
      logger.error('❌ Verification failed:', error.message);
      logger.error(error.stack);
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const verifier = new AWSVerifier();
  verifier.run();
}

module.exports = AWSVerifier;