const Logger = require('../../../utils/logger');
const config = require('../../../config');
const SQSService = require('../../../services/sqs-service');
const MockSQSService = require('../../../services/mock-sqs-service');

const agentId = 'interface-agent';
const logger = new Logger(agentId);
// Use MockSQSService in development, real SQSService in production
const sqsService = process.env.NODE_ENV === 'development' 
  ? new MockSQSService(logger)
  : new SQSService(logger);

logger.info('Interface Agent starting...');

/**
 * Inicializa o agente, configurando listeners e handlers.
 */
async function initialize() {
  try {
    logger.info('Initializing Interface Agent...');

    // Inicializa o serviço SQS
    await sqsService.initialize();
    
    // Inicia o polling SQS para escutar a fila de respostas
    sqsService.startPolling('interface-agent-responses', require('./handlers/responseHandler'));

    logger.info('Interface Agent initialized successfully.');
  } catch (error) {
    logger.error('Failed to initialize Interface Agent', error);
    process.exit(1);
  }
}

initialize();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received. Shutting down gracefully.');
  // Adicionar lógica de limpeza, se necessário
  process.exit(0);
});