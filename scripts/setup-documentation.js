/**
 * Script para Configurar Documentação Técnica
 * Fase 1: Configuração para Produção - Semana 1
 * 
 * Este script cria a estrutura completa de documentação na pasta /docs
 */

const fs = require('fs');
const path = require('path');
const Logger = require('../src/utils/logger');

class DocumentationSetup {
  constructor() {
    this.logger = new Logger('documentation-setup');
    this.projectRoot = path.join(__dirname, '..');
    this.docsRoot = path.join(this.projectRoot, 'docs');
    this.results = [];
  }

  /**
   * Criar estrutura de diretórios da documentação
   */
  async createDocumentationStructure() {
    try {
      this.logger.info('Creating documentation structure...');
      
      const docDirs = [
        'docs',
        'docs/architecture',
        'docs/agents',
        'docs/agents/core',
        'docs/agents/auxiliary',
        'docs/agents/infrastructure',
        'docs/api',
        'docs/deployment',
        'docs/development',
        'docs/monitoring',
        'docs/security',
        'docs/troubleshooting',
        'docs/assets',
        'docs/assets/diagrams',
        'docs/assets/images'
      ];
      
      docDirs.forEach(dir => {
        const fullPath = path.join(this.projectRoot, dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
          this.logger.info(`Created directory: ${dir}`);
        }
      });
      
      this.results.push({
        component: 'documentation-structure',
        status: 'completed',
        details: 'Documentation directories created'
      });
      
    } catch (error) {
      this.logger.error('Failed to create documentation structure:', error);
      throw error;
    }
  }

  /**
   * Criar documentação principal (README)
   */
  async createMainDocumentation() {
    const mainReadme = `# Sistema de Agentes Autônomos

## Visão Geral

Sistema multi-agente autônomo para automação de processos empresariais, utilizando arquitetura baseada em SQS para comunicação assíncrona entre agentes especializados.

## 🏗️ Arquitetura

### Agentes Core
- **Interface Agent**: Gerencia interações com usuários e sistemas externos
- **Planning Agent**: Responsável pelo planejamento e coordenação de tarefas
- **Execution Agent**: Executa tarefas e operações específicas
- **Monitoring Agent**: Monitora performance e saúde do sistema

### Agentes Auxiliares
- **Security Agent**: Gerencia autenticação, autorização e auditoria
- **Event Agent**: Processa eventos e notificações do sistema
- **Policy Agent**: Aplica políticas e regras de negócio

### Infraestrutura
- **SQS Service**: Comunicação assíncrona entre agentes
- **Logging System**: Sistema de logs estruturado
- **Monitoring System**: Métricas, health checks e alertas
- **Configuration Management**: Gerenciamento centralizado de configurações

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- AWS CLI configurado (para produção)
- Docker (opcional, para LocalStack)

### Instalação

\`\`\`bash
# Clonar repositório
git clone <repository-url>
cd agentesautonomos

# Instalar dependências
npm install

# Configurar ambiente de desenvolvimento
cp .env.example .env.development

# Iniciar LocalStack (desenvolvimento)
npm run localstack:start

# Configurar SQS local
npm run setup:aws
\`\`\`

### Desenvolvimento

\`\`\`bash
# Iniciar todos os agentes
npm run start:agents

# Iniciar monitoramento
npm run monitor:start

# Executar testes
npm test
\`\`\`

### Produção

\`\`\`bash
# Configurar AWS SQS para produção
npm run setup:aws-production

# Migrar para SQS real
npm run switch-to-real-sqs

# Testar conectividade
npm run test:sqs

# Iniciar sistema
npm start
\`\`\`

## 📚 Documentação

- [Arquitetura do Sistema](./docs/architecture/README.md)
- [Guia de Desenvolvimento](./docs/development/README.md)
- [Documentação da API](./docs/api/README.md)
- [Deployment](./docs/deployment/README.md)
- [Monitoramento](./docs/monitoring/README.md)
- [Segurança](./docs/security/README.md)
- [Troubleshooting](./docs/troubleshooting/README.md)

## 🔧 Scripts Disponíveis

### Desenvolvimento
- \`npm run dev\`: Iniciar em modo desenvolvimento
- \`npm run test\`: Executar testes
- \`npm run test:watch\`: Executar testes em modo watch
- \`npm run lint\`: Verificar código com ESLint
- \`npm run format\`: Formatar código com Prettier

### Agentes
- \`npm run start:agents\`: Iniciar todos os agentes
- \`npm run start:interface\`: Iniciar apenas interface agent
- \`npm run start:planning\`: Iniciar apenas planning agent
- \`npm run start:execution\`: Iniciar apenas execution agent

### AWS/SQS
- \`npm run setup:aws\`: Configurar AWS local (LocalStack)
- \`npm run setup:aws-production\`: Configurar AWS produção
- \`npm run test:sqs\`: Testar conectividade SQS
- \`npm run switch-to-real-sqs\`: Migrar para SQS real

### Monitoramento
- \`npm run monitor:start\`: Iniciar sistema de monitoramento
- \`npm run logs:view\`: Visualizar logs do sistema
- \`npm run logs:errors\`: Visualizar logs de erro
- \`npm run test:system\`: Testar integração do sistema

### Utilitários
- \`npm run clean\`: Limpar arquivos temporários
- \`npm run setup:logging-monitoring\`: Configurar logging e monitoramento
- \`npm run implement:handlers\`: Implementar handlers faltantes

## 🌍 Ambientes

### Desenvolvimento
- LocalStack para AWS services
- Mock APIs para serviços externos
- Logs detalhados habilitados
- Hot reload ativado

### Produção
- AWS SQS real
- APIs externas reais
- Logs otimizados
- Monitoramento completo
- Alertas configurados

## 📊 Monitoramento

### Endpoints de Monitoramento
- \`GET /health\`: Status geral do sistema
- \`GET /metrics\`: Métricas do sistema (JSON/Prometheus)
- \`GET /alerts\`: Alertas ativos
- \`GET /status\`: Status detalhado dos componentes

### Métricas Coletadas
- Performance dos agentes
- Uso de memória e CPU
- Latência de comunicação SQS
- Taxa de erro por componente
- Throughput de mensagens

## 🔒 Segurança

- Autenticação baseada em tokens JWT
- Autorização por roles e permissões
- Auditoria completa de ações
- Criptografia de dados sensíveis
- Rate limiting em APIs

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (\`git checkout -b feature/AmazingFeature\`)
3. Commit suas mudanças (\`git commit -m 'Add some AmazingFeature'\`)
4. Push para a branch (\`git push origin feature/AmazingFeature\`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 📞 Suporte

- Documentação: [docs/](./docs/)
- Issues: [GitHub Issues](https://github.com/your-org/agentesautonomos/issues)
- Wiki: [GitHub Wiki](https://github.com/your-org/agentesautonomos/wiki)

## 🗺️ Roadmap

### Fase 1: Configuração para Produção (Semana 1)
- ✅ Configuração de logging e monitoramento
- ✅ Migração para SQS real
- ✅ Implementação de handlers faltantes
- ✅ Documentação técnica
- 🔄 Testes de integração
- 🔄 Configuração de CI/CD

### Fase 2: Otimização e Escalabilidade (Semana 2)
- 🔄 Otimização de performance
- 🔄 Implementação de cache
- 🔄 Balanceamento de carga
- 🔄 Auto-scaling

### Fase 3: Recursos Avançados (Semana 3-4)
- 🔄 Machine Learning integrado
- 🔄 Analytics avançado
- 🔄 Dashboard web
- 🔄 Mobile app

---

**Última atualização**: ${new Date().toISOString().split('T')[0]}
**Versão**: 1.0.0
**Status**: Em desenvolvimento ativo
`;
    
    const readmePath = path.join(this.docsRoot, 'README.md');
    fs.writeFileSync(readmePath, mainReadme);
    this.logger.info(`Created main documentation: ${readmePath}`);
  }

  /**
   * Criar documentação de arquitetura
   */
  async createArchitectureDocumentation() {
    const archReadme = `# Arquitetura do Sistema

## Visão Geral da Arquitetura

O sistema utiliza uma arquitetura baseada em microserviços com agentes autônomos que se comunicam através de filas SQS (Amazon Simple Queue Service).

## Princípios Arquiteturais

### 1. Separação de Responsabilidades
- Cada agente tem uma responsabilidade específica e bem definida
- Baixo acoplamento entre componentes
- Alta coesão dentro de cada agente

### 2. Comunicação Assíncrona
- Uso de SQS para comunicação entre agentes
- Processamento não-bloqueante
- Tolerância a falhas e retry automático

### 3. Escalabilidade Horizontal
- Agentes podem ser escalados independentemente
- Balanceamento de carga automático
- Processamento distribuído

### 4. Observabilidade
- Logging estruturado em todos os componentes
- Métricas detalhadas de performance
- Health checks e alertas automáticos

## Componentes Principais

### Agentes Core

#### Interface Agent
- **Responsabilidade**: Ponto de entrada para interações externas
- **Filas SQS**:
  - \`interface-agent-requests\` (entrada)
  - \`interface-agent-responses\` (saída)
- **Funcionalidades**:
  - API REST para clientes externos
  - WebSocket para comunicação em tempo real
  - Validação de entrada
  - Roteamento de requisições

#### Planning Agent
- **Responsabilidade**: Planejamento e coordenação de tarefas
- **Filas SQS**:
  - \`planning-agent-requests\` (entrada)
  - \`planning-agent-responses\` (saída)
- **Funcionalidades**:
  - Decomposição de tarefas complexas
  - Otimização de recursos
  - Scheduling inteligente
  - Coordenação entre agentes

#### Execution Agent
- **Responsabilidade**: Execução de tarefas específicas
- **Filas SQS**:
  - \`execution-agent-requests\` (entrada)
  - \`execution-agent-responses\` (saída)
- **Funcionalidades**:
  - Execução de workflows
  - Integração com sistemas externos
  - Processamento de dados
  - Relatórios de execução

#### Monitoring Agent
- **Responsabilidade**: Monitoramento e observabilidade
- **Filas SQS**:
  - \`monitoring-agent-requests\` (entrada)
  - \`monitoring-agent-responses\` (saída)
- **Funcionalidades**:
  - Coleta de métricas
  - Health checks
  - Alertas automáticos
  - Dashboards de monitoramento

### Agentes Auxiliares

#### Security Agent
- **Responsabilidade**: Segurança e auditoria
- **Funcionalidades**:
  - Autenticação e autorização
  - Auditoria de ações
  - Detecção de anomalias
  - Compliance e políticas

#### Event Agent
- **Responsabilidade**: Processamento de eventos
- **Funcionalidades**:
  - Event sourcing
  - Notificações
  - Triggers automáticos
  - Histórico de eventos

#### Policy Agent
- **Responsabilidade**: Aplicação de políticas
- **Funcionalidades**:
  - Regras de negócio
  - Validações complexas
  - Workflows condicionais
  - Compliance automático

## Fluxo de Comunicação

### 1. Requisição Externa
\`\`\`
Cliente → Interface Agent → Planning Agent → Execution Agent → Resposta
\`\`\`

### 2. Processamento Assíncrono
\`\`\`
Interface Agent → SQS Queue → Planning Agent → SQS Queue → Execution Agent
\`\`\`

### 3. Monitoramento Contínuo
\`\`\`
Todos os Agentes → Monitoring Agent → Métricas/Alertas
\`\`\`

## Padrões de Design

### 1. Command Query Responsibility Segregation (CQRS)
- Separação entre comandos (write) e consultas (read)
- Otimização independente de cada operação

### 2. Event Sourcing
- Armazenamento de eventos ao invés de estado
- Auditoria completa e replay de eventos

### 3. Saga Pattern
- Coordenação de transações distribuídas
- Compensação automática em caso de falha

### 4. Circuit Breaker
- Proteção contra falhas em cascata
- Recuperação automática de serviços

## Tecnologias Utilizadas

### Backend
- **Node.js**: Runtime JavaScript
- **Express.js**: Framework web
- **AWS SDK**: Integração com serviços AWS
- **Winston**: Logging estruturado

### Infraestrutura
- **Amazon SQS**: Filas de mensagens
- **Amazon CloudWatch**: Monitoramento
- **Docker**: Containerização
- **LocalStack**: Desenvolvimento local

### Desenvolvimento
- **ESLint**: Linting de código
- **Prettier**: Formatação de código
- **Jest**: Testes unitários
- **Supertest**: Testes de API

## Configuração de Ambiente

### Desenvolvimento
- LocalStack para simular serviços AWS
- Mock services para APIs externas
- Hot reload para desenvolvimento rápido

### Produção
- AWS SQS real
- CloudWatch para monitoramento
- Auto-scaling configurado
- Load balancers

## Segurança

### Autenticação
- JWT tokens para APIs
- IAM roles para serviços AWS
- Rate limiting

### Autorização
- RBAC (Role-Based Access Control)
- Políticas granulares
- Auditoria de acesso

### Dados
- Criptografia em trânsito (TLS)
- Criptografia em repouso
- Sanitização de dados

## Performance

### Otimizações
- Connection pooling
- Caching estratégico
- Batch processing
- Lazy loading

### Métricas
- Latência de resposta
- Throughput de mensagens
- Uso de recursos
- Taxa de erro

## Escalabilidade

### Horizontal
- Múltiplas instâncias de agentes
- Load balancing automático
- Auto-scaling baseado em métricas

### Vertical
- Otimização de recursos por instância
- Tuning de performance
- Monitoramento de gargalos

## Disaster Recovery

### Backup
- Backup automático de configurações
- Versionamento de código
- Snapshots de dados

### Recuperação
- Procedimentos automatizados
- Rollback rápido
- Failover automático

---

**Próximos Passos**:
1. [Guia de Desenvolvimento](../development/README.md)
2. [Documentação da API](../api/README.md)
3. [Deployment](../deployment/README.md)
`;
    
    const archPath = path.join(this.docsRoot, 'architecture', 'README.md');
    fs.writeFileSync(archPath, archReadme);
    this.logger.info(`Created architecture documentation: ${archPath}`);
  }

  /**
   * Criar documentação de desenvolvimento
   */
  async createDevelopmentDocumentation() {
    const devReadme = `# Guia de Desenvolvimento

## Configuração do Ambiente de Desenvolvimento

### Pré-requisitos

- **Node.js** 18.x ou superior
- **npm** 8.x ou superior
- **Git** para controle de versão
- **Docker** (opcional, para LocalStack)
- **AWS CLI** (para produção)

### Configuração Inicial

1. **Clonar o repositório**
   \`\`\`bash
   git clone <repository-url>
   cd agentesautonomos
   \`\`\`

2. **Instalar dependências**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configurar ambiente**
   \`\`\`bash
   cp .env.example .env.development
   \`\`\`

4. **Iniciar LocalStack (opcional)**
   \`\`\`bash
   npm run localstack:start
   \`\`\`

5. **Configurar SQS local**
   \`\`\`bash
   npm run setup:aws
   \`\`\`

## Estrutura do Projeto

\`\`\`
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
\`\`\`

## Convenções de Código

### Nomenclatura

- **Arquivos**: kebab-case (\`my-file.js\`)
- **Diretórios**: kebab-case (\`my-directory/\`)
- **Classes**: PascalCase (\`MyClass\`)
- **Funções/Variáveis**: camelCase (\`myFunction\`)
- **Constantes**: UPPER_SNAKE_CASE (\`MY_CONSTANT\`)

### Estrutura de Arquivos

#### Agentes
\`\`\`javascript
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
\`\`\`

#### Handlers
\`\`\`javascript
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
\`\`\`

### Logging

#### Uso Básico
\`\`\`javascript
const Logger = require('../utils/logger');
const logger = new Logger('component-name');

// Diferentes níveis de log
logger.debug('Debug information', { data: someData });
logger.info('Information message', { userId: 123 });
logger.warn('Warning message', { warning: 'Something unusual' });
logger.error('Error message', { error: error.message, stack: error.stack });
\`\`\`

#### Logging Avançado
\`\`\`javascript
const AdvancedLogger = require('../utils/advancedLogger');
const logger = new AdvancedLogger('component-name');

// Performance logging
logger.performance('database_query', 150, { query: 'SELECT * FROM users' });

// Audit logging
logger.audit('user_login', 'user123', 'system', { ip: '192.168.1.1' });

// Métricas
const metrics = logger.getMetrics();
logger.resetMetrics();
\`\`\`

### Tratamento de Erros

\`\`\`javascript
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
\`\`\`

## Desenvolvimento de Agentes

### Criando um Novo Agente

1. **Criar estrutura de diretórios**
   \`\`\`bash
   mkdir -p src/agents/core/my-agent/handlers
   \`\`\`

2. **Implementar classe principal**
   \`\`\`javascript
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
   \`\`\`

3. **Implementar handlers**
   \`\`\`javascript
   // src/agents/core/my-agent/handlers/requestHandler.js
   async function handleRequest(message) {
     // Processar requisição
   }
   
   module.exports = { handleRequest };
   \`\`\`

4. **Configurar filas SQS**
   \`\`\`javascript
   // Adicionar em src/config/index.js
   sqs: {
     queues: {
       myAgentRequests: 'my-agent-requests',
       myAgentResponses: 'my-agent-responses'
     }
   }
   \`\`\`

### Comunicação entre Agentes

\`\`\`javascript
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
\`\`\`

## Testes

### Estrutura de Testes

\`\`\`
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
\`\`\`

### Testes Unitários

\`\`\`javascript
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
\`\`\`

### Testes de Integração

\`\`\`javascript
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
\`\`\`

### Executar Testes

\`\`\`bash
# Todos os testes
npm test

# Testes específicos
npm test -- --grep "MyAgent"

# Testes com coverage
npm run test:coverage

# Testes em modo watch
npm run test:watch
\`\`\`

## Debugging

### Logs de Debug

\`\`\`bash
# Habilitar logs de debug
DEBUG=* npm run dev

# Debug específico
DEBUG=my-agent:* npm run dev
\`\`\`

### VS Code Debug

\`\`\`json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Agent",
      "type": "node",
      "request": "launch",
      "program": "\${workspaceFolder}/src/agents/core/my-agent/index.js",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
\`\`\`

## Performance

### Profiling

\`\`\`bash
# Profiling de CPU
node --prof src/agents/core/my-agent/index.js

# Análise do profile
node --prof-process isolate-*.log > profile.txt
\`\`\`

### Monitoramento

\`\`\`javascript
// Usar métricas para monitorar performance
const { metrics } = require('../monitoring/metrics');

const start = Date.now();
// ... operação ...
const duration = Date.now() - start;

metrics.histogram('operation_duration', duration, {
  operation: 'my_operation',
  agent: 'my-agent'
});
\`\`\`

## Deployment

### Build

\`\`\`bash
# Verificar código
npm run lint
npm run format

# Executar testes
npm test

# Build para produção
npm run build
\`\`\`

### Docker

\`\`\`dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 3000

CMD ["npm", "start"]
\`\`\`

## Troubleshooting

### Problemas Comuns

1. **SQS Connection Issues**
   - Verificar credenciais AWS
   - Confirmar região configurada
   - Testar conectividade: \`npm run test:sqs\`

2. **Memory Leaks**
   - Usar \`--inspect\` para debugging
   - Monitorar métricas de memória
   - Verificar event listeners não removidos

3. **Performance Issues**
   - Analisar logs de performance
   - Verificar métricas de throughput
   - Profiling de CPU e memória

### Logs Úteis

\`\`\`bash
# Logs do sistema
npm run logs:view

# Logs de erro
npm run logs:errors

# Logs específicos
tail -f logs/agents/my-agent.log
\`\`\`

---

**Próximos Passos**:
1. [Documentação da API](../api/README.md)
2. [Deployment](../deployment/README.md)
3. [Troubleshooting](../troubleshooting/README.md)
`;
    
    const devPath = path.join(this.docsRoot, 'development', 'README.md');
    fs.writeFileSync(devPath, devReadme);
    this.logger.info(`Created development documentation: ${devPath}`);
  }

  /**
   * Criar documentação da API
   */
  async createAPIDocumentation() {
    const apiReadme = `# Documentação da API

## Visão Geral

A API do sistema de agentes autônomos fornece endpoints para interação com os agentes, monitoramento do sistema e gerenciamento de configurações.

## Base URL

- **Desenvolvimento**: \`http://localhost:3000\`
- **Produção**: \`https://your-domain.com\`

## Autenticação

A API utiliza autenticação baseada em JWT tokens.

### Obter Token

\`\`\`http
POST /auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "password123"
}
\`\`\`

**Resposta:**
\`\`\`json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": "123",
    "username": "user@example.com",
    "roles": ["user"]
  }
}
\`\`\`

### Usar Token

\`\`\`http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

## Endpoints

### Interface Agent

#### Enviar Requisição

\`\`\`http
POST /api/v1/interface/request
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "task",
  "action": "process_data",
  "data": {
    "input": "sample data",
    "options": {
      "priority": "high"
    }
  },
  "metadata": {
    "source": "web_app",
    "userId": "user123"
  }
}
\`\`\`

**Resposta:**
\`\`\`json
{
  "requestId": "req-123456789",
  "status": "accepted",
  "message": "Request queued for processing",
  "estimatedTime": 30,
  "timestamp": "2024-01-15T10:30:00Z"
}
\`\`\`

#### Verificar Status

\`\`\`http
GET /api/v1/interface/request/{requestId}
Authorization: Bearer {token}
\`\`\`

**Resposta:**
\`\`\`json
{
  "requestId": "req-123456789",
  "status": "completed",
  "progress": 100,
  "result": {
    "output": "processed data",
    "metadata": {
      "processingTime": 25,
      "agent": "execution-agent"
    }
  },
  "timeline": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "status": "received",
      "agent": "interface-agent"
    },
    {
      "timestamp": "2024-01-15T10:30:05Z",
      "status": "planning",
      "agent": "planning-agent"
    },
    {
      "timestamp": "2024-01-15T10:30:10Z",
      "status": "executing",
      "agent": "execution-agent"
    },
    {
      "timestamp": "2024-01-15T10:30:35Z",
      "status": "completed",
      "agent": "execution-agent"
    }
  ]
}
\`\`\`

#### WebSocket

\`\`\`javascript
// Conectar ao WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');

// Autenticar
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}));

// Receber atualizações
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};
\`\`\`

### Planning Agent

#### Criar Plano

\`\`\`http
POST /api/v1/planning/plan
Authorization: Bearer {token}
Content-Type: application/json

{
  "goal": "Process customer order",
  "constraints": {
    "maxTime": 300,
    "resources": ["database", "payment_api"]
  },
  "context": {
    "orderId": "order-123",
    "customerId": "customer-456"
  }
}
\`\`\`

**Resposta:**
\`\`\`json
{
  "planId": "plan-789",
  "status": "created",
  "steps": [
    {
      "id": "step-1",
      "action": "validate_order",
      "agent": "validation-agent",
      "estimatedTime": 10,
      "dependencies": []
    },
    {
      "id": "step-2",
      "action": "process_payment",
      "agent": "payment-agent",
      "estimatedTime": 30,
      "dependencies": ["step-1"]
    },
    {
      "id": "step-3",
      "action": "update_inventory",
      "agent": "inventory-agent",
      "estimatedTime": 15,
      "dependencies": ["step-2"]
    }
  ],
  "totalEstimatedTime": 55,
  "createdAt": "2024-01-15T10:30:00Z"
}
\`\`\`

### Execution Agent

#### Executar Tarefa

\`\`\`http
POST /api/v1/execution/execute
Authorization: Bearer {token}
Content-Type: application/json

{
  "taskId": "task-123",
  "action": "process_data",
  "parameters": {
    "input": "data to process",
    "format": "json"
  },
  "options": {
    "timeout": 60,
    "retries": 3
  }
}
\`\`\`

**Resposta:**
\`\`\`json
{
  "executionId": "exec-456",
  "taskId": "task-123",
  "status": "running",
  "startedAt": "2024-01-15T10:30:00Z",
  "estimatedCompletion": "2024-01-15T10:31:00Z"
}
\`\`\`

### Monitoring

#### Health Check

\`\`\`http
GET /health
\`\`\`

**Resposta:**
\`\`\`json
{
  "status": "healthy",
  "message": "All health checks passing",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": [
    {
      "name": "memory",
      "status": "healthy",
      "duration": 5,
      "details": {
        "heapUsedPercent": 45.2,
        "heapUsed": 123456789,
        "heapTotal": 273456789
      }
    },
    {
      "name": "sqs_connectivity",
      "status": "healthy",
      "duration": 150,
      "details": {
        "region": "us-east-1",
        "queuesAccessible": 8
      }
    }
  ]
}
\`\`\`

#### Métricas

\`\`\`http
GET /metrics?format=json
\`\`\`

**Resposta:**
\`\`\`json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "system": {
    "uptime": 3600,
    "memory": {
      "rss": 123456789,
      "heapTotal": 273456789,
      "heapUsed": 123456789,
      "external": 12345678
    },
    "cpu": {
      "user": 1000000,
      "system": 500000
    }
  },
  "application": {
    "http_requests_total{method=\"GET\",status=\"200\"}": {
      "type": "counter",
      "value": 1250,
      "lastUpdated": "2024-01-15T10:29:55Z"
    },
    "message_processing_duration": {
      "type": "histogram",
      "count": 500,
      "sum": 75000,
      "avg": 150,
      "p50": 120,
      "p95": 300,
      "p99": 500
    }
  }
}
\`\`\`

#### Métricas Prometheus

\`\`\`http
GET /metrics?format=prometheus
\`\`\`

**Resposta:**
\`\`\`
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1250
http_requests_total{method="POST",status="200"} 850
http_requests_total{method="GET",status="404"} 25

# TYPE message_processing_duration histogram
message_processing_duration_count 500
message_processing_duration_sum 75000
\`\`\`

#### Alertas Ativos

\`\`\`http
GET /alerts
\`\`\`

**Resposta:**
\`\`\`json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "count": 1,
  "alerts": [
    {
      "name": "high_memory_usage",
      "severity": "warning",
      "description": "Memory usage above 85%",
      "firstTriggered": "2024-01-15T10:25:00Z",
      "lastTriggered": "2024-01-15T10:29:00Z",
      "count": 5,
      "status": "active"
    }
  ]
}
\`\`\`

## Códigos de Status

### HTTP Status Codes

- **200 OK**: Requisição bem-sucedida
- **201 Created**: Recurso criado com sucesso
- **400 Bad Request**: Dados de entrada inválidos
- **401 Unauthorized**: Token de autenticação inválido ou ausente
- **403 Forbidden**: Permissões insuficientes
- **404 Not Found**: Recurso não encontrado
- **429 Too Many Requests**: Rate limit excedido
- **500 Internal Server Error**: Erro interno do servidor
- **503 Service Unavailable**: Serviço temporariamente indisponível

### Status de Requisições

- **received**: Requisição recebida pelo sistema
- **queued**: Requisição na fila para processamento
- **planning**: Sendo planejada pelo planning agent
- **executing**: Sendo executada pelo execution agent
- **completed**: Processamento concluído com sucesso
- **failed**: Processamento falhou
- **cancelled**: Requisição cancelada
- **timeout**: Processamento excedeu tempo limite

## Rate Limiting

A API implementa rate limiting para prevenir abuso:

- **Limite padrão**: 100 requisições por minuto por IP
- **Limite autenticado**: 1000 requisições por minuto por usuário
- **Headers de resposta**:
  - \`X-RateLimit-Limit\`: Limite total
  - \`X-RateLimit-Remaining\`: Requisições restantes
  - \`X-RateLimit-Reset\`: Timestamp do reset

## Paginação

Endpoints que retornam listas suportam paginação:

\`\`\`http
GET /api/v1/requests?page=2&limit=50&sort=createdAt&order=desc
\`\`\`

**Parâmetros:**
- \`page\`: Número da página (padrão: 1)
- \`limit\`: Itens por página (padrão: 20, máximo: 100)
- \`sort\`: Campo para ordenação
- \`order\`: Direção da ordenação (asc/desc)

**Resposta:**
\`\`\`json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 1250,
    "pages": 25,
    "hasNext": true,
    "hasPrev": true
  }
}
\`\`\`

## Filtros

Muitos endpoints suportam filtros:

\`\`\`http
GET /api/v1/requests?status=completed&agent=execution-agent&from=2024-01-01&to=2024-01-31
\`\`\`

## Webhooks

O sistema pode enviar notificações via webhooks:

### Configurar Webhook

\`\`\`http
POST /api/v1/webhooks
Authorization: Bearer {token}
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["request.completed", "request.failed"],
  "secret": "your-webhook-secret"
}
\`\`\`

### Payload do Webhook

\`\`\`json
{
  "event": "request.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "requestId": "req-123456789",
    "status": "completed",
    "result": {...}
  },
  "signature": "sha256=..."
}
\`\`\`

## SDKs e Bibliotecas

### JavaScript/Node.js

\`\`\`javascript
const AgentsAPI = require('@your-org/agents-api');

const client = new AgentsAPI({
  baseURL: 'https://your-domain.com',
  token: 'your-jwt-token'
});

// Enviar requisição
const response = await client.interface.request({
  type: 'task',
  action: 'process_data',
  data: { input: 'sample data' }
});

// Verificar status
const status = await client.interface.getStatus(response.requestId);
\`\`\`

### Python

\`\`\`python
from agents_api import AgentsClient

client = AgentsClient(
    base_url='https://your-domain.com',
    token='your-jwt-token'
)

# Enviar requisição
response = client.interface.request({
    'type': 'task',
    'action': 'process_data',
    'data': {'input': 'sample data'}
})

# Verificar status
status = client.interface.get_status(response['requestId'])
\`\`\`

## Exemplos de Uso

### Processamento de Dados

\`\`\`javascript
// 1. Enviar dados para processamento
const request = await fetch('/api/v1/interface/request', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'data_processing',
    action: 'analyze',
    data: {
      dataset: 'customer_data.csv',
      analysis_type: 'sentiment'
    }
  })
});

const { requestId } = await request.json();

// 2. Monitorar progresso
const checkStatus = async () => {
  const response = await fetch(\`/api/v1/interface/request/\${requestId}\`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  const status = await response.json();
  
  if (status.status === 'completed') {
    console.log('Resultado:', status.result);
  } else if (status.status === 'failed') {
    console.error('Erro:', status.error);
  } else {
    setTimeout(checkStatus, 5000); // Verificar novamente em 5s
  }
};

checkStatus();
\`\`\`

### Workflow Complexo

\`\`\`javascript
// 1. Criar plano
const planResponse = await fetch('/api/v1/planning/plan', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    goal: 'Process customer order',
    constraints: {
      maxTime: 300,
      resources: ['database', 'payment_api', 'inventory_api']
    },
    context: {
      orderId: 'order-123',
      customerId: 'customer-456'
    }
  })
});

const plan = await planResponse.json();

// 2. Executar plano
const executionResponse = await fetch('/api/v1/execution/execute', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    planId: plan.planId,
    options: {
      timeout: 300,
      retries: 2
    }
  })
});

const execution = await executionResponse.json();
console.log('Execução iniciada:', execution.executionId);
\`\`\`

---

**Próximos Passos**:
1. [Deployment](../deployment/README.md)
2. [Monitoramento](../monitoring/README.md)
3. [Troubleshooting](../troubleshooting/README.md)
`;
    
    const apiPath = path.join(this.docsRoot, 'api', 'README.md');
    fs.writeFileSync(apiPath, apiReadme);
    this.logger.info(`Created API documentation: ${apiPath}`);
  }

  /**
   * Criar documentação de deployment
   */
  async createDeploymentDocumentation() {
    const deploymentReadme = `# Guia de Deployment

## Visão Geral

Este guia cobre o processo completo de deployment do sistema de agentes autônomos, desde o ambiente de desenvolvimento até a produção.

## Ambientes

### Desenvolvimento
- LocalStack para serviços AWS
- Mock services para APIs externas
- Hot reload habilitado
- Logs detalhados

### Staging
- Serviços AWS reais (ambiente de teste)
- APIs externas de teste
- Configuração similar à produção
- Testes automatizados

### Produção
- Serviços AWS completos
- APIs externas de produção
- Monitoramento completo
- Alta disponibilidade

## Pré-requisitos

### Infraestrutura
- **AWS Account** com permissões adequadas
- **Docker** para containerização
- **Node.js** 18+ para desenvolvimento
- **Git** para controle de versão

### Ferramentas
- **AWS CLI** configurado
- **Docker Compose** para orquestração local
- **Terraform** (opcional) para IaC
- **kubectl** (se usando Kubernetes)

## Configuração AWS

### 1. Configurar Credenciais

\`\`\`bash
# Configurar AWS CLI
aws configure

# Ou usar variáveis de ambiente
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
\`\`\`

### 2. Criar Recursos SQS

\`\`\`bash
# Executar script de configuração
npm run setup:aws-production
\`\`\`

Ou manualmente:

\`\`\`bash
# Criar filas SQS
aws sqs create-queue --queue-name interface-agent-requests
aws sqs create-queue --queue-name interface-agent-responses
aws sqs create-queue --queue-name planning-agent-requests
aws sqs create-queue --queue-name planning-agent-responses
aws sqs create-queue --queue-name execution-agent-requests
aws sqs create-queue --queue-name execution-agent-responses

# Criar Dead Letter Queues
aws sqs create-queue --queue-name interface-agent-dlq
aws sqs create-queue --queue-name planning-agent-dlq
aws sqs create-queue --queue-name execution-agent-dlq
\`\`\`

### 3. Configurar IAM

\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl"
      ],
      "Resource": "arn:aws:sqs:*:*:*-agent-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
\`\`\`

## Docker

### Dockerfile

\`\`\`dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production image
FROM node:18-alpine AS production

WORKDIR /app

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copiar dependências
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Criar diretórios necessários
RUN mkdir -p logs temp && chown -R nodejs:nodejs logs temp

USER nodejs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

CMD ["npm", "start"]
\`\`\`

### Docker Compose

\`\`\`yaml
# docker-compose.yml
version: '3.8'

services:
  interface-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=interface
    ports:
      - "3000:3000"
    depends_on:
      - redis
    restart: unless-stopped

  planning-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=planning
    depends_on:
      - redis
    restart: unless-stopped

  execution-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=execution
    depends_on:
      - redis
    restart: unless-stopped

  monitoring-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=monitoring
    ports:
      - "3001:3001"
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
\`\`\`

## Deployment Local

### 1. Preparar Ambiente

\`\`\`bash
# Clonar repositório
git clone <repository-url>
cd agentesautonomos

# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env.development
\`\`\`

### 2. Iniciar LocalStack

\`\`\`bash
# Iniciar LocalStack
npm run localstack:start

# Configurar SQS local
npm run setup:aws
\`\`\`

### 3. Executar Sistema

\`\`\`bash
# Iniciar todos os agentes
npm run start:agents

# Ou iniciar individualmente
npm run start:interface
npm run start:planning
npm run start:execution
\`\`\`

## Deployment Staging

### 1. Configurar Ambiente

\`\`\`bash
# Criar arquivo de ambiente
cp .env.example .env.staging

# Editar configurações
vim .env.staging
\`\`\`

### 2. Build e Deploy

\`\`\`bash
# Build da aplicação
npm run build

# Executar testes
npm test

# Deploy com Docker
docker-compose -f docker-compose.staging.yml up -d
\`\`\`

## Deployment Produção

### 1. Preparar Produção

\`\`\`bash
# Configurar AWS para produção
npm run setup:aws-production

# Migrar para SQS real
npm run switch-to-real-sqs

# Testar conectividade
npm run test:sqs
\`\`\`

### 2. Deploy com Docker

\`\`\`bash
# Build da imagem
docker build -t agents-system:latest .

# Tag para registry
docker tag agents-system:latest your-registry/agents-system:latest

# Push para registry
docker push your-registry/agents-system:latest

# Deploy
docker-compose -f docker-compose.prod.yml up -d
\`\`\`

### 3. Deploy com Kubernetes

\`\`\`yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: interface-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: interface-agent
  template:
    metadata:
      labels:
        app: interface-agent
    spec:
      containers:
      - name: interface-agent
        image: your-registry/agents-system:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: AGENT_TYPE
          value: "interface"
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
\`\`\`

\`\`\`bash
# Aplicar configurações
kubectl apply -f k8s/

# Verificar status
kubectl get pods
kubectl get services
\`\`\`

## CI/CD

### GitHub Actions

\`\`\`yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm test
    - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v3
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Build and push Docker image
      run: |
        docker build -t agents-system:latest .
        docker tag agents-system:latest \${{ secrets.ECR_REGISTRY }}/agents-system:latest
        docker push \${{ secrets.ECR_REGISTRY }}/agents-system:latest
    
    - name: Deploy to ECS
      run: |
        aws ecs update-service --cluster production --service agents-system --force-new-deployment
\`\`\`

## Monitoramento

### Health Checks

\`\`\`bash
# Verificar saúde do sistema
curl http://localhost:3000/health

# Verificar métricas
curl http://localhost:3000/metrics

# Verificar alertas
curl http://localhost:3000/alerts
\`\`\`

### Logs

\`\`\`bash
# Visualizar logs
docker-compose logs -f

# Logs específicos
docker-compose logs -f interface-agent

# Logs com Kubernetes
kubectl logs -f deployment/interface-agent
\`\`\`

### Métricas

\`\`\`bash
# Prometheus metrics
curl http://localhost:3000/metrics?format=prometheus

# JSON metrics
curl http://localhost:3000/metrics?format=json
\`\`\`

## Backup e Recuperação

### Backup de Configurações

\`\`\`bash
# Backup de configurações
aws s3 cp .env.production s3://your-backup-bucket/configs/
aws s3 cp docker-compose.prod.yml s3://your-backup-bucket/configs/
\`\`\`

### Backup de Logs

\`\`\`bash
# Backup automático de logs
aws s3 sync logs/ s3://your-backup-bucket/logs/\$(date +%Y-%m-%d)/
\`\`\`

### Recuperação

\`\`\`bash
# Restaurar configurações
aws s3 cp s3://your-backup-bucket/configs/.env.production .
aws s3 cp s3://your-backup-bucket/configs/docker-compose.prod.yml .

# Reiniciar sistema
docker-compose -f docker-compose.prod.yml up -d
\`\`\`

## Troubleshooting

### Problemas Comuns

1. **SQS Connection Failed**
   \`\`\`bash
   # Verificar credenciais
   aws sts get-caller-identity
   
   # Testar conectividade
   npm run test:sqs
   \`\`\`

2. **High Memory Usage**
   \`\`\`bash
   # Verificar uso de memória
   docker stats
   
   # Reiniciar serviços
   docker-compose restart
   \`\`\`

3. **Agent Not Responding**
   \`\`\`bash
   # Verificar logs
   docker-compose logs agent-name
   
   # Verificar health
   curl http://localhost:3000/health
   \`\`\`

### Rollback

\`\`\`bash
# Rollback com Docker
docker-compose down
docker-compose -f docker-compose.prod.yml up -d

# Rollback com Kubernetes
kubectl rollout undo deployment/interface-agent
\`\`\`

## Segurança

### SSL/TLS

\`\`\`nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
\`\`\`

### Firewall

\`\`\`bash
# Configurar firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
\`\`\`

---

**Próximos Passos**:
1. [Monitoramento](../monitoring/README.md)
2. [Segurança](../security/README.md)
3. [Troubleshooting](../troubleshooting/README.md)
`;
    
    const deploymentPath = path.join(this.docsRoot, 'deployment', 'README.md');
    fs.writeFileSync(deploymentPath, deploymentReadme);
    this.logger.info(`Created deployment documentation: ${deploymentPath}`);
  }

  /**
   * Executar configuração completa
   */
  async run() {
    try {
      this.logger.info('Starting documentation setup...');
      
      await this.createDocumentationStructure();
      await this.createMainDocumentation();
      await this.createArchitectureDocumentation();
      await this.createDevelopmentDocumentation();
      await this.createAPIDocumentation();
      await this.createDeploymentDocumentation();
      
      this.results.push({
        component: 'documentation-setup',
        status: 'completed',
        details: 'All documentation created successfully'
      });
      
      this.displaySummary();
      
    } catch (error) {
      this.logger.error('Documentation setup failed:', error);
      throw error;
    }
  }

  /**
   * Exibir resumo da configuração
   */
  displaySummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📚 DOCUMENTAÇÃO TÉCNICA CONFIGURADA');
    console.log('='.repeat(60));
    
    console.log('\n📁 Estrutura criada:');
    console.log('  ├── docs/');
    console.log('  │   ├── README.md (Documentação principal)');
    console.log('  │   ├── architecture/ (Arquitetura do sistema)');
    console.log('  │   ├── development/ (Guia de desenvolvimento)');
    console.log('  │   ├── api/ (Documentação da API)');
    console.log('  │   ├── deployment/ (Guia de deployment)');
    console.log('  │   ├── monitoring/ (Monitoramento)');
    console.log('  │   ├── security/ (Segurança)');
    console.log('  │   └── troubleshooting/ (Solução de problemas)');
    
    console.log('\n✅ Componentes configurados:');
    this.results.forEach(result => {
      const status = result.status === 'completed' ? '✅' : '❌';
      console.log(`  ${status} ${result.component}: ${result.details}`);
    });
    
    console.log('\n🚀 Próximos passos:');
    console.log('  1. Revisar documentação criada');
    console.log('  2. Personalizar conforme necessário');
    console.log('  3. Configurar CI/CD para atualização automática');
    console.log('  4. Treinar equipe na nova documentação');
    
    console.log('\n📖 Para acessar a documentação:');
    console.log('  - Documentação principal: docs/README.md');
    console.log('  - Arquitetura: docs/architecture/README.md');
    console.log('  - Desenvolvimento: docs/development/README.md');
    console.log('  - API: docs/api/README.md');
    console.log('  - Deployment: docs/deployment/README.md');
    
    console.log('\n' + '='.repeat(60));
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const setup = new DocumentationSetup();
  setup.run().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = DocumentationSetup;