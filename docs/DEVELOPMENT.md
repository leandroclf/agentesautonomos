# 🚀 Guia de Desenvolvimento - Sistema de Agentes Autônomos

Este documento fornece instruções completas para desenvolvedores sobre configuração do ambiente, estrutura do projeto, desenvolvimento local, testes, monitoramento e contribuição.

## 📋 Índice

- [Pré-requisitos](#pré-requisitos)
- [Configuração Inicial](#configuração-inicial)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Ambiente de Desenvolvimento](#ambiente-de-desenvolvimento)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Desenvolvimento Local](#desenvolvimento-local)
- [Testes](#testes)
- [Monitoramento e Debug](#monitoramento-e-debug)
- [Contribuição](#contribuição)
- [Troubleshooting](#troubleshooting)

## 🔧 Pré-requisitos

### Software Necessário

- **Node.js**: versão 18.x ou superior
- **npm**: versão 8.x ou superior
- **Docker**: versão 20.x ou superior
- **Docker Compose**: versão 2.x ou superior
- **Git**: versão 2.x ou superior

### Verificação dos Pré-requisitos

```bash
# Verificar versões instaladas
node --version    # v18.x.x ou superior
npm --version     # 8.x.x ou superior
docker --version  # 20.x.x ou superior
docker-compose --version  # 2.x.x ou superior
git --version     # 2.x.x ou superior
```

### Ferramentas Recomendadas

- **IDE**: Visual Studio Code com extensões:
  - ES6 String HTML
  - Prettier
  - ESLint
  - Docker
  - REST Client
- **Cliente HTTP**: Postman ou Insomnia
- **Cliente Git**: GitHub Desktop (opcional)

## ⚙️ Configuração Inicial

### 1. Clone do Repositório

```bash
git clone <repository-url>
cd agentesautonomos
```

### 2. Instalação de Dependências

```bash
# Instalar dependências do projeto principal
npm install

# Instalar dependências de cada agente
npm run install:all
```

### 3. Configuração de Ambiente

```bash
# Copiar arquivo de configuração
cp .env.example .env

# Editar variáveis de ambiente
nano .env  # ou seu editor preferido
```

### 4. Configuração do Docker

```bash
# Construir imagens Docker
docker-compose build

# Verificar se as imagens foram criadas
docker images | grep agentes
```

## 📁 Estrutura do Projeto

```
agentesautonomos/
├── agents/                     # Código dos agentes
│   ├── interface-agent/        # Agent de interface (porta 3000)
│   ├── event-agent/           # Agent de eventos (porta 3001)
│   ├── planning-agent/        # Agent de planejamento (porta 3002)
│   ├── execution-agent/       # Agent de execução (porta 3003)
│   └── mediator-agent/        # Agent mediador (porta 3012)
├── shared/                    # Código compartilhado
│   ├── utils/                 # Utilitários comuns
│   ├── middleware/            # Middlewares compartilhados
│   ├── config/               # Configurações
│   └── types/                # Definições de tipos
├── infrastructure/           # Configuração de infraestrutura
│   ├── docker/              # Dockerfiles e configurações
│   ├── monitoring/          # Configurações de monitoramento
│   └── scripts/             # Scripts de automação
├── tests/                   # Testes automatizados
│   ├── unit/               # Testes unitários
│   ├── integration/        # Testes de integração
│   └── e2e/               # Testes end-to-end
├── docs/                   # Documentação
├── .env.example           # Exemplo de variáveis de ambiente
├── docker-compose.yml     # Configuração Docker Compose
├── package.json          # Dependências e scripts
└── README.md            # Documentação principal
```

## 🏗️ Ambiente de Desenvolvimento

### Componentes Principais

O ambiente de desenvolvimento inclui os seguintes componentes:

#### Infraestrutura Local
- **PostgreSQL** (porta 5432): Banco de dados principal
- **Redis** (porta 6379): Cache e sessões
- **LocalStack** (porta 4566): Simulação de serviços AWS (SQS, S3)
- **Prometheus** (porta 9090): Coleta de métricas
- **Grafana** (porta 3100): Visualização de métricas

#### Agentes do Sistema
- **Interface Agent** (porta 3000): API REST principal
- **Event Agent** (porta 3001): Processamento de eventos
- **Planning Agent** (porta 3002): Criação de planos
- **Execution Agent** (porta 3003): Execução de tarefas
- **Mediator Agent** (porta 3012): Mediação entre agentes

### Configuração de Portas

```yaml
# Infraestrutura
PostgreSQL: 5432
Redis: 6379
LocalStack: 4566
Prometheus: 9090
Grafana: 3100

# Agentes
Interface Agent: 3000
Event Agent: 3001
Planning Agent: 3002
Execution Agent: 3003
Mediator Agent: 3012
```

### Variáveis de Ambiente

```bash
# Configurações da API
API_BASE_URL=http://localhost:3000
INTERFACE_AGENT_URL=http://localhost:3000
EVENT_AGENT_URL=http://localhost:3001
PLANNING_AGENT_URL=http://localhost:3002
EXECUTION_AGENT_URL=http://localhost:3003
MEDIATOR_AGENT_URL=http://localhost:3012

# Banco de Dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agentes_db
DB_USER=postgres
DB_PASSWORD=postgres123

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis123

# LocalStack (AWS Local)
AWS_ENDPOINT_URL=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Monitoramento
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3100

# Configurações de Desenvolvimento
NODE_ENV=development
LOG_LEVEL=debug
DEBUG=agents:*
```

## 📜 Scripts Disponíveis

### Scripts Principais

```bash
# Desenvolvimento
npm run dev              # Inicia ambiente completo de desenvolvimento
npm run dev:agents       # Inicia apenas os agentes
npm run dev:infra        # Inicia apenas a infraestrutura

# Instalação
npm run install:all      # Instala dependências de todos os agentes
npm run clean:install    # Limpa e reinstala todas as dependências

# Build
npm run build           # Build de todos os agentes
npm run build:agents    # Build apenas dos agentes
npm run build:docker    # Build das imagens Docker

# Testes
npm test               # Executa todos os testes
npm run test:unit      # Testes unitários
npm run test:integration # Testes de integração
npm run test:e2e       # Testes end-to-end
npm run test:coverage  # Testes com cobertura

# Qualidade de Código
npm run lint           # Executa ESLint
npm run lint:fix       # Corrige problemas do ESLint
npm run format         # Formata código com Prettier
npm run type-check     # Verificação de tipos TypeScript

# Docker
npm run docker:up      # Sobe containers Docker
npm run docker:down    # Para containers Docker
npm run docker:logs    # Visualiza logs dos containers
npm run docker:clean   # Limpa containers e volumes

# Monitoramento
npm run monitor        # Inicia monitoramento completo
npm run logs           # Visualiza logs agregados
npm run health         # Verifica saúde dos serviços

# Utilitários
npm run setup          # Configuração inicial completa
npm run reset          # Reset completo do ambiente
npm run seed           # Popula banco com dados de teste
```

### Scripts Específicos AWS/SQS

```bash
# LocalStack
npm run localstack:start    # Inicia LocalStack
npm run localstack:stop     # Para LocalStack
npm run localstack:reset    # Reset do LocalStack

# SQS
npm run sqs:create-queues   # Cria filas SQS
npm run sqs:list-queues     # Lista filas existentes
npm run sqs:purge-queues    # Limpa todas as filas
npm run sqs:send-test       # Envia mensagem de teste

# S3
npm run s3:create-buckets   # Cria buckets S3
npm run s3:list-buckets     # Lista buckets existentes
```

## 💻 Desenvolvimento Local

### Início Rápido

```bash
# 1. Configuração inicial (apenas primeira vez)
npm run setup

# 2. Iniciar ambiente completo
npm run dev

# 3. Verificar se tudo está funcionando
npm run health
```

### Desenvolvimento Incremental

```bash
# Iniciar apenas infraestrutura
npm run dev:infra

# Em outro terminal, iniciar agentes específicos
cd agents/interface-agent && npm run dev
cd agents/event-agent && npm run dev
# ... outros agentes conforme necessário
```

### Configuração Simplificada

#### Ambiente Local
```yaml
services:
  - PostgreSQL (dados)
  - Redis (cache)
  - LocalStack (AWS local)
  - Prometheus (métricas)
  - Grafana (dashboards)
```

#### Ambiente AWS
```yaml
services:
  - RDS PostgreSQL
  - ElastiCache Redis
  - SQS (filas)
  - S3 (storage)
  - CloudWatch (monitoramento)
```

### Comandos de Configuração Rápida

```bash
# Configuração completa em um comando
npm run dev

# Verificação de saúde
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health

# Acesso aos dashboards
# Grafana: http://localhost:3100 (admin/admin)
# Prometheus: http://localhost:9090
```

## 🧪 Testes

### Estrutura de Testes

```
tests/
├── unit/                    # Testes unitários
│   ├── agents/             # Testes por agente
│   ├── shared/             # Testes de código compartilhado
│   └── utils/              # Testes de utilitários
├── integration/            # Testes de integração
│   ├── api/               # Testes de API
│   ├── database/          # Testes de banco de dados
│   └── messaging/         # Testes de mensageria
├── e2e/                   # Testes end-to-end
│   ├── scenarios/         # Cenários de teste
│   └── fixtures/          # Dados de teste
├── performance/           # Testes de performance
└── security/             # Testes de segurança
```

### Executando Testes

```bash
# Todos os testes
npm test

# Testes específicos
npm run test:unit
npm run test:integration
npm run test:e2e

# Testes com cobertura
npm run test:coverage

# Testes em modo watch
npm run test:watch

# Testes de um agente específico
npm run test:agent interface
npm run test:agent event
```

### Configuração de Testes

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'agents/**/*.js',
    'shared/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/agents/**/*.test.js'
  ]
};
```

## 🔍 Monitoramento e Debug

### Logs

```bash
# Visualizar logs em tempo real
npm run logs

# Logs de um agente específico
docker-compose logs -f interface-agent
docker-compose logs -f event-agent

# Logs com filtro
docker-compose logs | grep ERROR
docker-compose logs | grep WARNING
```

### Métricas

```bash
# Acessar Prometheus
open http://localhost:9090

# Acessar Grafana
open http://localhost:3100
# Usuário: admin
# Senha: admin
```

### Health Checks

```bash
# Verificar saúde de todos os serviços
npm run health

# Verificar serviços individuais
curl http://localhost:3000/health  # Interface Agent
curl http://localhost:3001/health  # Event Agent
curl http://localhost:3002/health  # Planning Agent
curl http://localhost:3003/health  # Execution Agent
curl http://localhost:9090/-/healthy  # Prometheus
```

### Debug

```bash
# Ativar debug detalhado
DEBUG=agents:* npm run dev

# Debug de um agente específico
DEBUG=agents:interface npm run dev

# Debug de comunicação entre agentes
DEBUG=agents:communication npm run dev
```

### Ferramentas de Debug

```javascript
// Usar debugger no código
const debug = require('debug')('agents:interface');

function processRequest(req) {
  debug('Processing request:', req.method, req.url);
  // ... lógica do processamento
}
```

## 🤝 Contribuição

### Fluxo de Desenvolvimento

1. **Fork** do repositório
2. **Clone** do seu fork
3. **Branch** para nova feature: `git checkout -b feature/nova-funcionalidade`
4. **Desenvolvimento** com testes
5. **Commit** com mensagens descritivas
6. **Push** para seu fork
7. **Pull Request** para o repositório principal

### Padrões de Código

```bash
# Verificar padrões antes do commit
npm run lint
npm run format
npm run type-check
npm test
```

### Convenções de Commit

```bash
# Formato: tipo(escopo): descrição

# Tipos válidos:
feat: nova funcionalidade
fix: correção de bug
docs: documentação
style: formatação
refactor: refatoração
test: testes
chore: manutenção

# Exemplos:
git commit -m "feat(interface): adicionar endpoint de status"
git commit -m "fix(event): corrigir processamento de eventos duplicados"
git commit -m "docs(api): atualizar documentação de endpoints"
```

### Code Review

#### Checklist para Pull Requests

- [ ] Código segue padrões estabelecidos
- [ ] Testes unitários adicionados/atualizados
- [ ] Testes de integração passando
- [ ] Documentação atualizada
- [ ] Performance não degradada
- [ ] Segurança verificada
- [ ] Logs apropriados adicionados

### Estrutura de Branches

```
main                    # Branch principal (produção)
├── develop            # Branch de desenvolvimento
├── feature/*          # Novas funcionalidades
├── bugfix/*          # Correções de bugs
├── hotfix/*          # Correções urgentes
└── release/*         # Preparação de releases
```

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Porta já em uso
```bash
# Verificar processos usando a porta
lsof -i :3000

# Matar processo específico
kill -9 <PID>

# Ou usar script de limpeza
npm run clean:ports
```

#### 2. Containers Docker não iniciam
```bash
# Verificar logs
docker-compose logs

# Reconstruir containers
docker-compose down
docker-compose build --no-cache
docker-compose up
```

#### 3. Dependências desatualizadas
```bash
# Limpar cache npm
npm cache clean --force

# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install
```

#### 4. Problemas de conectividade
```bash
# Verificar rede Docker
docker network ls
docker network inspect agentesautonomos_default

# Testar conectividade
docker-compose exec interface-agent ping event-agent
```

#### 5. Banco de dados não conecta
```bash
# Verificar se PostgreSQL está rodando
docker-compose ps postgres

# Conectar diretamente ao banco
docker-compose exec postgres psql -U postgres -d agentes_db

# Verificar logs do banco
docker-compose logs postgres
```

### Scripts de Diagnóstico

```bash
# Diagnóstico completo
npm run diagnose

# Verificar configuração
npm run config:check

# Testar conectividade
npm run connectivity:test

# Verificar recursos do sistema
npm run system:check
```

### Logs de Debug

```bash
# Ativar logs detalhados
export DEBUG=agents:*
export LOG_LEVEL=debug

# Salvar logs em arquivo
npm run dev 2>&1 | tee development.log

# Analisar logs
grep ERROR development.log
grep WARNING development.log
```

### Reset Completo

```bash
# Reset completo do ambiente
npm run reset

# Ou manualmente:
docker-compose down -v
docker system prune -f
rm -rf node_modules
npm install
npm run setup
```

---

**Última atualização**: Janeiro 2024  
**Versão do Guia**: v2.0  
**Próxima revisão**: Abril 2024

**Suporte**: Para dúvidas ou problemas, abra uma issue no repositório ou consulte a documentação adicional em `/docs`.