/**
 * Configuração global para testes Jest
 * Configurações de ambiente, mocks e utilitários compartilhados
 */

const path = require('path');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente de teste
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Configurações globais de teste
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduzir logs durante testes
process.env.AWS_REGION = 'us-east-1';
process.env.SQS_ENDPOINT = 'http://localhost:4566'; // LocalStack

// Mock global do AWS SDK para testes
jest.mock('aws-sdk', () => ({
  SQS: jest.fn(() => ({
    sendMessage: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        MessageId: 'test-message-id',
        MD5OfBody: 'test-md5'
      })
    }),
    receiveMessage: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Messages: []
      })
    }),
    deleteMessage: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    getQueueUrl: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue'
      })
    })
  }))
}));

// Mock do @aws-sdk/client-sqs
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({
      MessageId: 'test-message-id',
      MD5OfBody: 'test-md5'
    })
  })),
  SendMessageCommand: jest.fn(),
  ReceiveMessageCommand: jest.fn(),
  DeleteMessageCommand: jest.fn(),
  GetQueueUrlCommand: jest.fn()
}));

// Utilitários de teste globais
global.testUtils = {
  // Criar mock de request para agentes
  createMockRequest: (body = {}, headers = {}) => ({
    body,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    ip: '127.0.0.1',
    method: 'POST',
    url: '/test'
  }),

  // Criar mock de response
  createMockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };
    return res;
  },

  // Aguardar por condição assíncrona
  waitFor: async (condition, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  },

  // Gerar dados de teste
  generateTestEvent: (type = 'test', data = {}) => ({
    id: `test-${Date.now()}`,
    type,
    source: 'test-source',
    timestamp: new Date().toISOString(),
    data
  }),

  generateTestPlan: (steps = []) => ({
    id: `plan-${Date.now()}`,
    name: 'Test Plan',
    description: 'Plan for testing',
    steps: steps.length > 0 ? steps : [
      {
        id: 'step-1',
        name: 'Test Step',
        type: 'action',
        config: {}
      }
    ],
    createdAt: new Date().toISOString(),
    status: 'pending'
  })
};

// Configuração de timeout para testes assíncronos
jest.setTimeout(10000);

// Limpeza após cada teste
afterEach(() => {
  jest.clearAllMocks();
});

console.log('🧪 Test environment configured');