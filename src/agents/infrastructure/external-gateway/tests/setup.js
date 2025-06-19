/**
 * Configuração de setup para testes Jest
 * External Event API Gateway
 */

const { TextEncoder, TextDecoder } = require('util');

// Polyfills para Node.js
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock do console para testes mais limpos
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Configuração de timeout para testes
jest.setTimeout(30000);

// Mock das variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Porta aleatória
process.env.LOG_LEVEL = 'error'; // Reduz logs durante testes
process.env.REDIS_ENABLED = 'false';
process.env.METRICS_ENABLED = 'true';
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.SQS_ENDPOINT = 'http://localhost:9324'; // LocalStack

// Mock do AWS SDK
jest.mock('aws-sdk', () => {
  const mockSQS = {
    sendMessage: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        MessageId: 'mock-message-id',
        MD5OfBody: 'mock-md5'
      })
    }),
    getQueueUrl: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        QueueUrl: 'http://localhost:9324/queue/test-queue'
      })
    }),
    getQueueAttributes: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Attributes: {
          ApproximateNumberOfMessages: '0',
          ApproximateNumberOfMessagesNotVisible: '0'
        }
      })
    })
  };

  return {
    SQS: jest.fn(() => mockSQS),
    config: {
      update: jest.fn()
    }
  };
});

// Mock do Redis
jest.mock('redis', () => {
  const mockRedisClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
    keys: jest.fn().mockResolvedValue([]),
    flushdb: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
    off: jest.fn(),
    isOpen: true,
    isReady: true
  };

  return {
    createClient: jest.fn(() => mockRedisClient)
  };
});

// Mock do Winston
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn()
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      errors: jest.fn(),
      json: jest.fn(),
      colorize: jest.fn(),
      simple: jest.fn(),
      printf: jest.fn()
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn()
    }
  };
});

// Mock do prom-client
jest.mock('prom-client', () => {
  const mockMetric = {
    inc: jest.fn(),
    dec: jest.fn(),
    observe: jest.fn(),
    set: jest.fn(),
    reset: jest.fn()
  };

  return {
    Counter: jest.fn(() => mockMetric),
    Histogram: jest.fn(() => mockMetric),
    Gauge: jest.fn(() => mockMetric),
    Summary: jest.fn(() => mockMetric),
    register: {
      metrics: jest.fn().mockResolvedValue('# Mock metrics'),
      clear: jest.fn(),
      collectDefaultMetrics: jest.fn()
    },
    collectDefaultMetrics: jest.fn()
  };
});

// Utilitários para testes
global.testUtils = {
  // Cria um evento de teste válido
  createValidEvent: (overrides = {}) => ({
    eventType: 'test.event',
    eventId: `test_${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: 'test-service',
    data: {
      testData: 'test value'
    },
    metadata: {
      version: '1.0',
      correlationId: `corr_${Date.now()}`
    },
    ...overrides
  }),

  // Cria um lote de eventos de teste
  createEventBatch: (count = 3) => ({
    events: Array.from({ length: count }, (_, i) => 
      global.testUtils.createValidEvent({
        eventId: `batch_test_${i}`,
        data: { index: i }
      })
    )
  }),

  // Cria dados de API key de teste
  createApiKeyData: (overrides = {}) => ({
    keyId: `key_${Date.now()}`,
    name: 'Test API Key',
    permissions: ['events:write'],
    rateLimit: {
      requests: 100,
      window: 3600
    },
    active: true,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    ...overrides
  }),

  // Aguarda um tempo específico
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Gera um ID único para testes
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

  // Limpa todos os mocks
  clearAllMocks: () => {
    jest.clearAllMocks();
  },

  // Restaura o console original
  restoreConsole: () => {
    global.console = originalConsole;
  }
};

// Configuração de beforeEach global
beforeEach(() => {
  // Limpa todos os mocks antes de cada teste
  jest.clearAllMocks();
  
  // Reset de variáveis de ambiente específicas
  delete process.env.MOCK_MODE;
  delete process.env.DEBUG_LOGS;
});

// Configuração de afterEach global
afterEach(() => {
  // Limpa timers pendentes
  jest.clearAllTimers();
});

// Configuração de afterAll global
afterAll(() => {
  // Restaura o console original
  global.testUtils.restoreConsole();
});

// Configuração de tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Configuração de matchers customizados do Jest
expect.extend({
  // Matcher para verificar se um evento é válido
  toBeValidEvent(received) {
    const requiredFields = ['eventType', 'timestamp', 'source'];
    const missingFields = requiredFields.filter(field => !received[field]);
    
    if (missingFields.length > 0) {
      return {
        message: () => `Expected event to have required fields: ${missingFields.join(', ')}`,
        pass: false
      };
    }
    
    // Verifica formato do timestamp
    const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    if (!timestampRegex.test(received.timestamp)) {
      return {
        message: () => `Expected timestamp to be in ISO format, received: ${received.timestamp}`,
        pass: false
      };
    }
    
    return {
      message: () => 'Event is valid',
      pass: true
    };
  },

  // Matcher para verificar se uma resposta de API é válida
  toBeValidApiResponse(received) {
    if (!received || typeof received !== 'object') {
      return {
        message: () => 'Expected response to be an object',
        pass: false
      };
    }
    
    if (!received.hasOwnProperty('success') && !received.hasOwnProperty('error')) {
      return {
        message: () => 'Expected response to have either success or error field',
        pass: false
      };
    }
    
    if (!received.timestamp) {
      return {
        message: () => 'Expected response to have timestamp field',
        pass: false
      };
    }
    
    return {
      message: () => 'API response is valid',
      pass: true
    };
  }
});

// Exporta configurações para uso em testes específicos
module.exports = {
  testUtils: global.testUtils,
  mockConsole: global.console
};