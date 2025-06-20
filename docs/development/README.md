# Guia de Desenvolvimento

## Configuração do Ambiente de Desenvolvimento

### Pré-requisitos

- **Node.js** 18.x ou superior
- **npm** 8.x ou superior
- **Git** para controle de versão
- **Docker** (opcional, para LocalStack)
- **AWS CLI** (para produção)

### Configuração Inicial

1. **Clonar o repositório**
   ```bash
   git clone <repository-url>
   cd agentesautonomos
   ```

2. **Instalar dependências**
   ```bash
   npm install
   ```

3. **Configurar ambiente**
   ```bash
   cp .env.example .env.development
   ```

4. **Iniciar LocalStack (opcional)**
   ```bash
   npm run localstack:start
   ```

5. **Configurar SQS local**
   ```bash
   npm run setup:aws
   ```

## Estrutura do Projeto

```
agentesautonomos/
├── src/
│   ├── agents/
│   │   ├── core/
│   │   │   ├── interface-agent/
│   │   │   ├── planning-agent/
│   │   │   ├── execution-agent/
│   │   │   └── monitoring-agent/
│   │   ├── auxiliary/
│   │   │   ├── security-agent/
│   │   │   ├── event-agent/
│   │   │   └── policy-agent/
│   │   └── shared/
│   ├── services/
│   │   ├── sqs-service.js
│   │   └── mock-sqs-service.js
│   ├── utils/
│   │   ├── logger.js
│   │   ├── advancedLogger.js
│   │   └── loggingUtils.js
│   ├── config/
│   │   └── index.js
│   └── monitoring/
│       ├── metrics.js
│       ├── health.js
│       └── alerts.js
├── scripts/
│   ├── setup-aws-production.js
│   ├── test-sqs-connectivity.js
│   ├── switch-to-real-sqs.js
│   └── setup-logging-monitoring.js
├── tests/
├── docs/
├── logs/
└── temp/
```

## Convenções de Código

### Nomenclatura

- **Arquivos**: kebab-case (`my-file.js`)
- **Diretórios**: kebab-case (`my-directory/`)
- **Classes**: PascalCase (`MyClass`)
- **Funções/Variáveis**: camelCase (`myFunction`)
- **Constantes**: UPPER_SNAKE_CASE (`MY_CONSTANT`)

### Estrutura de Arquivos

#### Agentes
```javascript
// src/agents/core/my-agent/index.js
class MyAgent {
  constructor() {
    this.logger = new Logger('my-agent');
    this.sqsService = new SQSService();
  }

  async initialize() {
    // Inicialização do agente
  }

  async start() {
    // Iniciar processamento
  }

  async stop() {
    // Parar processamento
  }
}

module.exports = MyAgent;
```

#### Handlers
```javascript
// src/agents/core/my-agent/handlers/myHandler.js
const Logger = require('../../../utils/logger');

class MyHandler {
  constructor() {
    this.logger = new Logger('my-handler');
  }

  async handle(message) {
    try {
      // Processar mensagem
      this.logger.info('Message processed', { messageId: message.MessageId });
    } catch (error) {
      this.logger.error('Failed to process message', error);
      throw error;
    }
  }
}

module.exports = MyHandler;
```

### Logging

#### Uso Básico
```javascript
const Logger = require('../utils/logger');
const logger = new Logger('component-name');

// Diferentes níveis de log
logger.debug('Debug information', { data: someData });
logger.info('Information message', { userId: 123 });
logger.warn('Warning message', { warning: 'Something unusual' });
logger.error('Error message', { error: error.message, stack: error.stack });
```

#### Logging Avançado
```javascript
const AdvancedLogger = require('../utils/advancedLogger');
const logger = new AdvancedLogger('component-name');

// Performance logging
logger.performance('database_query', 150, { query: 'SELECT * FROM users' });

// Audit logging
logger.audit('user_login', 'user123', 'system', { ip: '192.168.1.1' });

// Métricas
const metrics = logger.getMetrics();
logger.resetMetrics();
```

### Tratamento de Erros

```javascript
// Sempre usar try-catch em operações assíncronas
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  this.logger.error('Operation failed', {
    operation: 'someAsyncOperation',
    error: error.message,
    stack: error.stack
  });
  throw error; // Re-throw se necessário
}

// Usar Error customizados quando apropriado
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
```

## Desenvolvimento de Agentes

### Criando um Novo Agente

1. **Criar estrutura de diretórios**
   ```bash
   mkdir -p src/agents/core/my-agent/handlers
   ```

2. **Implementar classe principal**
   ```javascript
   // src/agents/core/my-agent/index.js
   const BaseAgent = require('../shared/baseAgent');
   
   class MyAgent extends BaseAgent {
     constructor() {
       super('my-agent');
     }
   
     async processMessage(message) {
       // Implementar lógica específica
     }
   }
   ```

3. **Implementar handlers**
   ```javascript
   // src/agents/core/my-agent/handlers/requestHandler.js
   async function handleRequest(message) {
     // Processar requisição
   }
   
   module.exports = { handleRequest };
   ```

4. **Configurar filas SQS**
   ```javascript
   // Adicionar em src/config/index.js
   sqs: {
     queues: {
       myAgentRequests: 'my-agent-requests',
       myAgentResponses: 'my-agent-responses'
     }
   }
   ```

### Comunicação entre Agentes

```javascript
// Enviar mensagem para outro agente
const message = {
  type: 'request',
  action: 'process_data',
  data: { /* dados */ },
  requestId: generateRequestId(),
  timestamp: new Date().toISOString()
};

await this.sqsService.sendMessage('target-agent-requests', message);

// Processar resposta
const response = await this.sqsService.receiveMessage('my-agent-responses');
if (response) {
  await this.handleResponse(response);
}
```

## Testes

### Estrutura de Testes

```
tests/
├── unit/
│   ├── agents/
│   ├── services/
│   └── utils/
├── integration/
│   ├── agents/
│   └── sqs/
└── e2e/
    └── workflows/
```

### Testes Unitários

```javascript
// tests/unit/agents/my-agent.test.js
const MyAgent = require('../../../src/agents/core/my-agent');
const MockSQSService = require('../../../src/services/mock-sqs-service');

describe('MyAgent', () => {
  let agent;
  let mockSQS;

  beforeEach(() => {
    mockSQS = new MockSQSService();
    agent = new MyAgent();
    agent.sqsService = mockSQS;
  });

  test('should process message correctly', async () => {
    const message = { type: 'test', data: {} };
    const result = await agent.processMessage(message);
    expect(result).toBeDefined();
  });
});
```

### Testes de Integração

```javascript
// tests/integration/sqs/communication.test.js
const SQSService = require('../../../src/services/sqs-service');

describe('SQS Communication', () => {
  let sqsService;

  beforeAll(async () => {
    sqsService = new SQSService();
    await sqsService.initialize();
  });

  test('should send and receive messages', async () => {
    const message = { test: 'data' };
    await sqsService.sendMessage('test-queue', message);
    
    const received = await sqsService.receiveMessage('test-queue');
    expect(received).toMatchObject(message);
  });
});
```

### Executar Testes

```bash
# Todos os testes
npm test

# Testes específicos
npm test -- --grep "MyAgent"

# Testes com coverage
npm run test:coverage

# Testes em modo watch
npm run test:watch
```

## Debugging

### Logs de Debug

```bash
# Habilitar logs de debug
DEBUG=* npm run dev

# Debug específico
DEBUG=my-agent:* npm run dev
```

### VS Code Debug

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Agent",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/agents/core/my-agent/index.js",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

## Performance

### Profiling

```bash
# Profiling de CPU
node --prof src/agents/core/my-agent/index.js

# Análise do profile
node --prof-process isolate-*.log > profile.txt
```

### Monitoramento

```javascript
// Usar métricas para monitorar performance
const { metrics } = require('../monitoring/metrics');

const start = Date.now();
// ... operação ...
const duration = Date.now() - start;

metrics.histogram('operation_duration', duration, {
  operation: 'my_operation',
  agent: 'my-agent'
});
```

## Deployment

### Build

```bash
# Verificar código
npm run lint
npm run format

# Executar testes
npm test

# Build para produção
npm run build
```

### Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 3000

CMD ["npm", "start"]
```

## Troubleshooting

### Problemas Comuns

1. **SQS Connection Issues**
   - Verificar credenciais AWS
   - Confirmar região configurada
   - Testar conectividade: `npm run test:sqs`

2. **Memory Leaks**
   - Usar `--inspect` para debugging
   - Monitorar métricas de memória
   - Verificar event listeners não removidos

3. **Performance Issues**
   - Analisar logs de performance
   - Verificar métricas de throughput
   - Profiling de CPU e memória

### Logs Úteis

```bash
# Logs do sistema
npm run logs:view

# Logs de erro
npm run logs:errors

# Logs específicos
tail -f logs/agents/my-agent.log
```

---

**Próximos Passos**:
1. [Documentação da API](../api/README.md)
2. [Deployment](../deployment/README.md)
3. [Troubleshooting](../troubleshooting/README.md)
