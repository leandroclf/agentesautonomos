/**
 * Script de Configuração AWS para Produção
 * Fase 1: Configuração para Produção - Semana 1
 * 
 * Este script configura o ambiente AWS SQS para substituir o MockSQSService
 * conforme definido no Plano de Desenvolvimento Unificado.
 */

const { SQSClient, CreateQueueCommand, GetQueueUrlCommand, SetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { IAMClient, CreateRoleCommand, AttachRolePolicyCommand } = require('@aws-sdk/client-iam');
const Logger = require('../src/utils/logger');
const config = require('../src/config');

class AWSProductionSetup {
  constructor() {
    this.logger = new Logger('aws-production-setup');
    this.sqsClient = null;
    this.iamClient = null;
    this.createdQueues = [];
  }

  /**
   * Inicializar clientes AWS
   */
  async initializeClients() {
    try {
      this.logger.info('Initializing AWS clients...');
      
      // Verificar se as credenciais AWS estão configuradas
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
      }

      this.sqsClient = new SQSClient({
        region: config.aws.region,
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey
        }
      });

      this.iamClient = new IAMClient({
        region: config.aws.region,
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey
        }
      });

      this.logger.info('AWS clients initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AWS clients:', error);
      throw error;
    }
  }

  /**
   * Criar fila SQS com DLQ
   */
  async createQueue(queueName, isDLQ = false) {
    try {
      this.logger.info(`Creating queue: ${queueName}`);

      const createQueueParams = {
        QueueName: queueName,
        Attributes: {
          'VisibilityTimeoutSeconds': '300',
          'MessageRetentionPeriod': '1209600', // 14 dias
          'ReceiveMessageWaitTimeSeconds': '20' // Long polling
        }
      };

      // Se não for DLQ, configurar redrive policy
      if (!isDLQ) {
        const dlqName = `${queueName}-dlq`;
        
        // Criar DLQ primeiro
        await this.createQueue(dlqName, true);
        
        // Obter URL da DLQ
        const dlqUrlResponse = await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: dlqName }));
        const dlqArn = dlqUrlResponse.QueueUrl.replace('https://sqs.', 'arn:aws:sqs:').replace('.amazonaws.com/', ':').replace('/', ':');
        
        createQueueParams.Attributes.RedrivePolicy = JSON.stringify({
          deadLetterTargetArn: dlqArn,
          maxReceiveCount: config.aws.sqs.dlqMaxReceiveCount
        });
      }

      const command = new CreateQueueCommand(createQueueParams);
      const response = await this.sqsClient.send(command);
      
      this.createdQueues.push({
        name: queueName,
        url: response.QueueUrl,
        isDLQ
      });

      this.logger.info(`Queue created successfully: ${queueName} -> ${response.QueueUrl}`);
      return response.QueueUrl;
    } catch (error) {
      if (error.name === 'QueueAlreadyExists') {
        this.logger.warn(`Queue already exists: ${queueName}`);
        const urlResponse = await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
        return urlResponse.QueueUrl;
      }
      this.logger.error(`Failed to create queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Criar todas as filas necessárias
   */
  async createAllQueues() {
    try {
      this.logger.info('Creating all required SQS queues...');

      const queues = [
        // Core Agents
        config.aws.sqs.queues.core.event,
        config.aws.sqs.queues.core.planning,
        config.aws.sqs.queues.core.execution,
        
        // Auxiliary Agents
        config.aws.sqs.queues.auxiliary.monitoring,
        config.aws.sqs.queues.auxiliary.security,
        config.aws.sqs.queues.auxiliary.policy,
        
        // Future Agents
        config.aws.sqs.queues.future.mediation,
        config.aws.sqs.queues.future.learning,
        config.aws.sqs.queues.future.recovery,
        config.aws.sqs.queues.future.persistence,
        config.aws.sqs.queues.future.enrichment,
        config.aws.sqs.queues.future.lifecycle,
        config.aws.sqs.queues.future.externalApiGateway
      ];

      for (const queueName of queues) {
        await this.createQueue(queueName);
      }

      this.logger.info(`Successfully created ${this.createdQueues.length} queues`);
    } catch (error) {
      this.logger.error('Failed to create queues:', error);
      throw error;
    }
  }

  /**
   * Verificar conectividade das filas
   */
  async verifyQueues() {
    try {
      this.logger.info('Verifying queue connectivity...');

      for (const queue of this.createdQueues) {
        try {
          await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: queue.name }));
          this.logger.info(`✅ Queue verified: ${queue.name}`);
        } catch (error) {
          this.logger.error(`❌ Queue verification failed: ${queue.name}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Queue verification failed:', error);
      throw error;
    }
  }

  /**
   * Gerar arquivo de configuração de produção
   */
  generateProductionConfig() {
    try {
      this.logger.info('Generating production configuration...');

      const envConfig = [
        '# AWS SQS Production Configuration',
        '# Generated by setup-aws-production.js',
        '',
        'NODE_ENV=production',
        `AWS_REGION=${config.aws.region}`,
        '# AWS_ACCESS_KEY_ID=<configure via IAM Role>',
        '# AWS_SECRET_ACCESS_KEY=<configure via IAM Role>',
        '',
        '# SQS Queue URLs (Production)'
      ];

      this.createdQueues.forEach(queue => {
        if (!queue.isDLQ) {
          const envVarName = queue.name.toUpperCase().replace(/-/g, '_') + '_QUEUE_URL';
          envConfig.push(`${envVarName}=${queue.url}`);
        }
      });

      envConfig.push('');
      envConfig.push('# Dead Letter Queue URLs');
      
      this.createdQueues.forEach(queue => {
        if (queue.isDLQ) {
          const envVarName = queue.name.toUpperCase().replace(/-/g, '_').replace('_DLQ', '') + '_DLQ_URL';
          envConfig.push(`${envVarName}=${queue.url}`);
        }
      });

      const configContent = envConfig.join('\n');
      
      require('fs').writeFileSync(
        require('path').join(__dirname, '..', 'config', 'environments', '.env.production.generated'),
        configContent
      );

      this.logger.info('Production configuration generated: config/environments/.env.production.generated');
    } catch (error) {
      this.logger.error('Failed to generate production config:', error);
      throw error;
    }
  }

  /**
   * Executar setup completo
   */
  async run() {
    try {
      this.logger.info('🚀 Starting AWS Production Setup...');
      
      await this.initializeClients();
      await this.createAllQueues();
      await this.verifyQueues();
      this.generateProductionConfig();
      
      this.logger.info('✅ AWS Production Setup completed successfully!');
      this.logger.info(`📊 Summary: ${this.createdQueues.length} queues configured`);
      
      console.log('\n📋 Next Steps:');
      console.log('1. Review generated config: config/environments/.env.production.generated');
      console.log('2. Update your production environment variables');
      console.log('3. Test SQS connectivity with: npm run test:sqs');
      console.log('4. Deploy agents with real SQS configuration');
      
    } catch (error) {
      this.logger.error('❌ AWS Production Setup failed:', error);
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const setup = new AWSProductionSetup();
  setup.run();
}

module.exports = AWSProductionSetup;