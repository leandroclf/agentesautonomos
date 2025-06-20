# 🤝 Guia de Contribuição

Bem-vindo ao projeto Sistema de Agentes Autônomos! Este guia fornece todas as informações necessárias para contribuir efetivamente com o projeto.

## 📋 Índice

- [Código de Conduta](#código-de-conduta)
- [Como Contribuir](#como-contribuir)
- [Padrões de Desenvolvimento](#padrões-de-desenvolvimento)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Processo de Pull Request](#processo-de-pull-request)
- [Padrões de Commit](#padrões-de-commit)
- [Testes](#testes)
- [Documentação](#documentação)
- [Troubleshooting](#troubleshooting)

## 📜 Código de Conduta

Este projeto segue o [Contributor Covenant](https://www.contributor-covenant.org/). Ao participar, você concorda em manter um ambiente respeitoso e inclusivo.

### Comportamentos Esperados

- ✅ Usar linguagem acolhedora e inclusiva
- ✅ Respeitar diferentes pontos de vista e experiências
- ✅ Aceitar críticas construtivas graciosamente
- ✅ Focar no que é melhor para a comunidade
- ✅ Mostrar empatia com outros membros da comunidade

### Comportamentos Inaceitáveis

- ❌ Linguagem ou imagens sexualizadas
- ❌ Trolling, comentários insultuosos/depreciativos
- ❌ Assédio público ou privado
- ❌ Publicar informações privadas de terceiros
- ❌ Outras condutas consideradas inadequadas

## 🚀 Como Contribuir

### Tipos de Contribuição

1. **🐛 Reportar Bugs**
   - Use o template de issue para bugs
   - Inclua passos para reproduzir
   - Forneça informações do ambiente

2. **💡 Sugerir Melhorias**
   - Use o template de feature request
   - Explique o problema que resolve
   - Descreva a solução proposta

3. **📝 Melhorar Documentação**
   - Corrigir erros de digitação
   - Adicionar exemplos
   - Melhorar clareza

4. **💻 Contribuir com Código**
   - Implementar novas funcionalidades
   - Corrigir bugs
   - Melhorar performance
   - Adicionar testes

### Processo de Contribuição

1. **Fork** o repositório
2. **Clone** seu fork localmente
3. **Crie** uma branch para sua contribuição
4. **Implemente** suas mudanças
5. **Teste** suas mudanças
6. **Documente** suas mudanças
7. **Commit** seguindo os padrões
8. **Push** para seu fork
9. **Abra** um Pull Request

## 🛠️ Padrões de Desenvolvimento

### Tecnologias Utilizadas

- **Runtime**: Node.js >= 16.0.0
- **Package Manager**: npm >= 8.0.0
- **Arquitetura**: BDI (Belief-Desire-Intention) + MARL
- **Comunicação**: Amazon SQS
- **Cache**: Redis
- **Monitoramento**: Prometheus + Grafana
- **Logs**: Winston
- **Testes**: Jest
- **Linting**: ESLint + Prettier

### Convenções de Código

#### JavaScript/Node.js

```javascript
// ✅ Bom
const agentService = require('./services/agentService');

class PlanningAgent {
  constructor(config) {
    this.config = config;
    this.logger = require('./utils/logger');
  }

  async processMessage(message) {
    try {
      this.logger.info('Processing message', { messageId: message.id });
      const result = await this.planningService.process(message);
      return result;
    } catch (error) {
      this.logger.error('Error processing message', { error: error.message });
      throw error;
    }
  }
}

module.exports = PlanningAgent;
```

#### Nomenclatura

- **Arquivos**: kebab-case (`planning-agent.js`)
- **Classes**: PascalCase (`PlanningAgent`)
- **Funções/Variáveis**: camelCase (`processMessage`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Diretórios**: kebab-case (`src/agents/core`)

#### Estrutura de Arquivos

```
agent-name/
├── index.js                 # Ponto de entrada
├── config/
│   └── agentConfig.js       # Configurações
├── services/
│   ├── mainService.js       # Serviço principal
│   └── helperService.js     # Serviços auxiliares
├── routes/
│   └── agentRoutes.js       # Rotas da API
├── middleware/
│   └── validation.js        # Middlewares
├── tests/
│   ├── unit/                # Testes unitários
│   └── integration/         # Testes de integração
├── .env.example             # Exemplo de variáveis
├── Dockerfile               # Container Docker
├── package.json             # Dependências
└── README.md               # Documentação
```

### Padrões de Arquitetura

#### Clean Architecture

```
src/
├── entities/                # Entidades de negócio
├── use-cases/              # Casos de uso
├── interfaces/             # Interfaces/Adapters
├── frameworks/             # Frameworks e drivers
└── shared/                 # Código compartilhado
```

#### Dependency Injection

```javascript
// ✅ Bom - Injeção de dependência
class AgentService {
  constructor(logger, sqsService, cacheService) {
    this.logger = logger;
    this.sqsService = sqsService;
    this.cacheService = cacheService;
  }
}

// ❌ Ruim - Dependências hard-coded
class AgentService {
  constructor() {
    this.logger = require('./logger');
    this.sqsService = require('./sqsService');
  }
}
```

#### Error Handling

```javascript
// ✅ Bom - Error handling estruturado
class CustomError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Uso
try {
  await someOperation();
} catch (error) {
  if (error instanceof ValidationError) {
    throw new CustomError('Invalid input', 'VALIDATION_ERROR', 400);
  }
  throw error;
}
```

## 📁 Estrutura do Projeto

### Organização de Agentes

```
src/agents/
├── core/                   # Agentes fundamentais
│   ├── interface-agent/    # Interface com usuário
│   ├── event-agent/        # Processamento de eventos
│   ├── planning-agent/     # Planejamento de ações
│   └── execution-agent/    # Execução de ações
├── auxiliary/              # Agentes auxiliares
│   ├── event-enricher/     # Enriquecimento de eventos
│   ├── health-checker/     # Monitoramento de saúde
│   └── recovery/           # Recuperação de falhas
├── infrastructure/         # Agentes de infraestrutura
│   └── external-gateway/   # Gateway externo
├── management/             # Agentes de gerenciamento
│   ├── agent-lifecycle-manager/
│   └── message-schema-registry/
├── marl/                   # Multi-Agent Reinforcement Learning
│   ├── coordination-agent/
│   └── marl-agent/
└── mediation/              # Mediação e orquestração
    ├── mediator-agent/
    └── orchestrator-agent/
```

### Documentação

```
docs/
├── README.md               # Visão geral do projeto
├── INDEX.md                # Índice da documentação
├── TODO.md                 # Lista de tarefas
├── ARCHITECTURE.md         # Arquitetura do sistema
├── DEVELOPMENT.md          # Guia de desenvolvimento
├── CONTRIBUTING.md         # Este arquivo
├── AGENT_DOCUMENTATION_TEMPLATE.md
└── agents/                 # Documentação específica
```

## 🔄 Processo de Pull Request

### Antes de Abrir um PR

1. **Sincronize** com a branch main
2. **Execute** todos os testes
3. **Verifique** o linting
4. **Atualize** a documentação
5. **Teste** manualmente

### Template de Pull Request

```markdown
## 📝 Descrição

Descreva brevemente as mudanças implementadas.

## 🔗 Issue Relacionada

Fixes #(número da issue)

## 🧪 Tipo de Mudança

- [ ] Bug fix (mudança que corrige um problema)
- [ ] Nova funcionalidade (mudança que adiciona funcionalidade)
- [ ] Breaking change (mudança que quebra compatibilidade)
- [ ] Documentação (mudança apenas na documentação)

## ✅ Checklist

- [ ] Meu código segue os padrões do projeto
- [ ] Realizei self-review do código
- [ ] Comentei código complexo
- [ ] Atualizei a documentação
- [ ] Adicionei testes que provam que a correção/funcionalidade funciona
- [ ] Testes novos e existentes passam
- [ ] Mudanças não quebram funcionalidades existentes

## 🧪 Como Testar

1. Passo 1
2. Passo 2
3. Passo 3

## 📸 Screenshots (se aplicável)

## 📝 Notas Adicionais

Qualquer informação adicional relevante.
```

### Processo de Review

1. **Automated Checks**: CI/CD executa testes e linting
2. **Code Review**: Pelo menos 1 aprovação necessária
3. **Manual Testing**: Testes manuais se necessário
4. **Merge**: Squash and merge para manter histórico limpo

## 📝 Padrões de Commit

### Conventional Commits

Usamos o padrão [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Tipos de Commit

- **feat**: Nova funcionalidade
- **fix**: Correção de bug
- **docs**: Mudanças na documentação
- **style**: Mudanças de formatação (não afetam código)
- **refactor**: Refatoração de código
- **test**: Adição ou correção de testes
- **chore**: Mudanças em ferramentas, configurações
- **perf**: Melhorias de performance
- **ci**: Mudanças em CI/CD

### Exemplos

```bash
# ✅ Bons commits
feat(planning-agent): add retry mechanism for failed plans
fix(event-agent): resolve memory leak in event processing
docs(api): update endpoint documentation
test(core): add integration tests for agent communication
refactor(utils): simplify logging utility functions

# ❌ Commits ruins
fixed bug
update
changes
wip
```

### Escopo (Scope)

- **core**: Agentes principais
- **auxiliary**: Agentes auxiliares
- **infrastructure**: Infraestrutura
- **management**: Gerenciamento
- **marl**: MARL agents
- **mediation**: Mediação
- **docs**: Documentação
- **tests**: Testes
- **config**: Configuração
- **deploy**: Deploy

## 🧪 Testes

### Estrutura de Testes

```
tests/
├── unit/                   # Testes unitários
│   ├── agents/
│   ├── services/
│   └── utils/
├── integration/            # Testes de integração
│   ├── api/
│   ├── workflows/
│   └── agents/
├── e2e/                    # Testes end-to-end
├── fixtures/               # Dados de teste
└── helpers/                # Utilitários de teste
```

### Comandos de Teste

```bash
# Todos os testes
npm test

# Testes unitários
npm run test:unit

# Testes de integração
npm run test:integration

# Testes e2e
npm run test:e2e

# Cobertura
npm run test:coverage

# Watch mode
npm run test:watch

# Testes específicos
npm test -- --grep "planning agent"
```

### Padrões de Teste

#### Testes Unitários

```javascript
const PlanningAgent = require('../../../src/agents/core/planning-agent');
const mockLogger = require('../../helpers/mockLogger');

describe('PlanningAgent', () => {
  let planningAgent;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      maxRetries: 3,
      timeout: 5000
    };
    planningAgent = new PlanningAgent(mockConfig, mockLogger);
  });

  describe('processMessage', () => {
    it('should process valid message successfully', async () => {
      // Arrange
      const message = { id: '123', type: 'plan', data: {} };
      
      // Act
      const result = await planningAgent.processMessage(message);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
    });

    it('should handle invalid message gracefully', async () => {
      // Arrange
      const invalidMessage = null;
      
      // Act & Assert
      await expect(planningAgent.processMessage(invalidMessage))
        .rejects.toThrow('Invalid message');
    });
  });
});
```

#### Testes de Integração

```javascript
const request = require('supertest');
const app = require('../../../src/app');

describe('Planning Agent API', () => {
  describe('POST /api/planning/process', () => {
    it('should process planning request', async () => {
      const response = await request(app)
        .post('/api/planning/process')
        .send({
          goal: 'complete task',
          context: { user: 'test' }
        })
        .expect(200);

      expect(response.body).toHaveProperty('planId');
      expect(response.body.status).toBe('created');
    });
  });
});
```

### Cobertura de Testes

- **Mínimo**: 80% de cobertura
- **Objetivo**: 90% de cobertura
- **Crítico**: 100% para funções críticas

## 📚 Documentação

### Tipos de Documentação

1. **README.md**: Visão geral e quick start
2. **API Documentation**: Endpoints e schemas
3. **Architecture Documentation**: Diagramas e fluxos
4. **Agent Documentation**: Documentação específica
5. **Troubleshooting**: Guias de solução de problemas

### Padrões de Documentação

#### Markdown

- Use headers hierárquicos (H1, H2, H3)
- Inclua índice para documentos longos
- Use code blocks com syntax highlighting
- Adicione diagramas quando necessário
- Mantenha linguagem clara e concisa

#### Diagramas

```mermaid
# Use Mermaid para diagramas
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```

#### Comentários no Código

```javascript
/**
 * Processes a planning request and generates execution plan
 * @param {Object} request - The planning request
 * @param {string} request.goal - The goal to achieve
 * @param {Object} request.context - Execution context
 * @returns {Promise<Object>} The generated plan
 * @throws {ValidationError} When request is invalid
 */
async function processPlanning(request) {
  // Validate input parameters
  if (!request || !request.goal) {
    throw new ValidationError('Goal is required');
  }

  // Generate plan based on goal and context
  const plan = await this.planGenerator.generate(request);
  
  return plan;
}
```

## 🔧 Troubleshooting

### Problemas Comuns

#### Erro de Instalação

```bash
# Limpar cache e reinstalar
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### Testes Falhando

```bash
# Verificar ambiente
npm run test:env

# Executar testes específicos
npm test -- --grep "failing test"

# Debug mode
npm run test:debug
```

#### Problemas de Linting

```bash
# Auto-fix
npm run lint:fix

# Verificar configuração
npm run lint:check
```

### Obtendo Ajuda

1. **Documentação**: Consulte a documentação completa
2. **Issues**: Procure issues similares no GitHub
3. **Discussions**: Use GitHub Discussions para perguntas
4. **Slack**: Canal #desenvolvimento (se aplicável)
5. **Email**: contato@projeto.com (se aplicável)

## 📞 Contato

- **Maintainers**: [Lista de maintainers]
- **Issues**: [Link para issues]
- **Discussions**: [Link para discussions]
- **Documentation**: [Link para documentação completa]

---

**Obrigado por contribuir! 🎉**

Sua contribuição ajuda a tornar este projeto melhor para toda a comunidade.