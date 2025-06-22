# Guia de Configuração e Instalação

## Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Instalação](#instalação)
3. [Configuração de Ambiente](#configuração-de-ambiente)
4. [Configuração SQS](#configuração-sqs)
5. [Configuração Grafana](#configuração-grafana)
6. [Dependências e Tecnologias](#dependências-e-tecnologias)
7. [External Event API Gateway](#external-event-api-gateway)
8. [Execução Local](#execução-local)
9. [Execução com Docker](#execução-com-docker)
10. [Scripts Disponíveis](#scripts-disponíveis)
11. [Monitoramento e Logs](#monitoramento-e-logs)
12. [Troubleshooting](#troubleshooting)

## Pré-requisitos

### Software Necessário

| Software | Versão Mínima | Instalação | Verificação |
|----------|---------------|------------|-------------|
| **Node.js** | 18.0.0+ | [nodejs.org](https://nodejs.org) | `node --version` |
| **npm** | 8.0.0+ | Incluído com Node.js | `npm --version` |
| **Docker** | 20.0.0+ | [docker.com](https://docker.com) | `docker --version` |
| **Docker Compose** | 2.0.0+ | Incluído com Docker Desktop | `docker-compose --version` |
| **Git** | 2.30.0+ | [git-scm.com](https://git-scm.com) | `git --version` |

### Verificação do Sistema

```bash
# Script de verificação de pré-requisitos
#!/bin/bash

echo "🔍 Verificando pré-requisitos..."

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js não encontrado"
    exit 1
fi

# npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✅ npm: $NPM_VERSION"
else
    echo "❌ npm não encontrado"
    exit 1
fi

# Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "✅ Docker: $DOCKER_VERSION"
else
    echo "❌ Docker não encontrado"
    exit 1
fi

# Docker Compose
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version)
    echo "✅ Docker Compose: $COMPOSE_VERSION"
else
    echo "❌ Docker Compose não encontrado"
    exit 1
fi

echo "✅ Todos os pré-requisitos atendidos!"
```

### Recursos de Sistema Recomendados

| Ambiente | CPU | RAM | Disco | Rede |
|----------|-----|-----|-------|------|
| **Desenvolvimento** | 4 cores | 8 GB | 20 GB | 100 Mbps |
| **Staging** | 8 cores | 16 GB | 50 GB | 1 Gbps |
| **Produção** | 16 cores | 32 GB | 100 GB | 10 Gbps |

## Instalação

### 1. Clone do Repositório

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/agentesautonomos.git
cd agentesautonomos

# Verificar branch
git branch -a
git checkout main
```

### 2. Instalação de Dependências

```bash
# Instalar dependências do projeto principal
npm install

# Instalar dependências de todos os agentes
npm run install:all

# Verificar instalação
npm run health:check
```

### 3. Configuração Inicial

```bash
# Copiar arquivos de configuração
cp config/environments/.env.example config/environments/.env.development
cp config/environments/.env.example config/environments/.env.production

# Configurar permissões (Linux/Mac)
chmod +x scripts/*.sh

# Inicializar configurações
npm run setup:init
```

## Configuração de Ambiente

### Desenvolvimento Local

O arquivo `config/environments/.env.development` deve conter:

```env
# Configurações Gerais
NODE_ENV=development
PORT=3000
HOST=localhost

# AWS LocalStack
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
SQS_ENDPOINT=http://localhost:4566
S3_ENDPOINT=http://localhost:4566

# Banco de Dados
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=agentes_dev
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres123

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis123

# Monitoramento
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin123

# Segurança
JWT_SECRET=seu-jwt-secret-super-seguro
JWT_EXPIRES_IN=24h
API_RATE_LIMIT=1000

# Logs
LOG_LEVEL=debug
LOG_FORMAT=json
```

### Produção

O arquivo `config/environments/.env.production` deve conter:

```env
# Configurações Gerais
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# AWS Real
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}

# Banco de Dados
POSTGRES_HOST=${RDS_ENDPOINT}
POSTGRES_PORT=5432
POSTGRES_DB=${DB_NAME}
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASSWORD}

# Redis
REDIS_HOST=${ELASTICACHE_ENDPOINT}
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# Segurança
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=1h
API_RATE_LIMIT=100

# Logs
LOG_LEVEL=info
LOG_FORMAT=json
```

## Configuração SQS

### Problema Identificado e Solução

**Problema Original:**
As filas SQS não estavam sendo criadas automaticamente no LocalStack, causando falhas na comunicação entre agentes.

**Causa Raiz:**
1. Configuração de endpoint incorreta (porta 9324 vs 4566)
2. Carregamento incorreto do arquivo `.env.development`
3. Ausência de processo automatizado para criar filas

**Solução Implementada:**
1. Correção da configuração para `http://localhost:4566`
2. Script automatizado para criar todas as filas
3. Processo documentado para setup futuro

### Configuração de Filas SQS

```env
# Filas SQS (LocalStack)
EVENT_QUEUE_URL=http://localhost:4566/000000000000/event-agent-queue-dev
PLANNING_QUEUE_URL=http://localhost:4566/000000000000/planning-agent-queue-dev
EXECUTION_QUEUE_URL=http://localhost:4566/000000000000/execution-agent-queue-dev
MONITORING_QUEUE_URL=http://localhost:4566/000000000000/monitoring-agent-queue-dev
STATE_QUEUE_URL=http://localhost:4566/000000000000/state-agent-queue-dev
SECURITY_QUEUE_URL=http://localhost:4566/000000000000/security-agent-queue-dev
ACL_QUEUE_URL=http://localhost:4566/000000000000/acl-agent-queue-dev
POLICY_QUEUE_URL=http://localhost:4566/000000000000/policy-agent-queue-dev
```

### Script de Configuração SQS

```bash
#!/bin/bash
# scripts/setup-sqs.sh

echo "🚀 Configurando filas SQS no LocalStack..."

# Aguardar LocalStack estar pronto
echo "⏳ Aguardando LocalStack..."
until curl -s http://localhost:4566/_localstack/health | grep -q '"sqs": "available"'; do
    sleep 2
done

echo "✅ LocalStack pronto!"

# Criar filas
QUEUES=(
    "event-agent-queue-dev"
    "planning-agent-queue-dev"
    "execution-agent-queue-dev"
    "monitoring-agent-queue-dev"
    "state-agent-queue-dev"
    "security-agent-queue-dev"
    "acl-agent-queue-dev"
    "policy-agent-queue-dev"
)

for queue in "${QUEUES[@]}"; do
    echo "📝 Criando fila: $queue"
    aws --endpoint-url=http://localhost:4566 sqs create-queue \
        --queue-name "$queue" \
        --region us-east-1 \
        --no-cli-pager
done

echo "✅ Todas as filas SQS criadas com sucesso!"
```

### Mudanças Implementadas

**Antes:**
- ElasticMQ (porta 9324) + LocalStack (porta 4566)
- Configuração duplicada e conflitante
- Scripts separados para cada serviço

**Depois:**
- Apenas LocalStack (porta 4566)
- Configuração unificada
- Script único de inicialização

**Benefícios:**
1. **Simplicidade**: Um único serviço AWS simulado
2. **Consistência**: Todas as configurações apontam para LocalStack
3. **Performance**: Menos containers rodando
4. **Manutenção**: Configuração centralizada

## Configuração Grafana

### Informações de Acesso

**Credenciais Padrão:**
- **URL**: http://localhost:3000
- **Usuário**: `admin`
- **Senha**: `admin123`

**Portas Configuradas:**
- **Grafana**: 3000
- **Prometheus**: 9090

### Como Acessar

1. **Certifique-se que o ambiente está rodando**:
   ```bash
   npm run dev
   ```

2. **Acesse o Grafana**:
   - Abra seu navegador
   - Vá para: http://localhost:3000
   - Faça login com `admin` / `admin123`

3. **Primeiro Acesso**:
   - O Grafana pode solicitar para alterar a senha padrão
   - Você pode pular esta etapa clicando em "Skip"

### Dashboards Disponíveis

#### Dashboard Profissional: "🤖 Agentes Autônomos - Dashboard Profissional"

**KPIs Principais:**
- **🟢 Disponibilidade do Sistema**: Gauge com thresholds (95%+ verde, 80-95% amarelo, <80% vermelho)
- **📈 Distribuição de Agentes Ativos**: Gráfico de pizza mostrando tipos de agentes ativos
- **⚡ Taxa de Requisições**: Métrica em tempo real (req/s) com alertas visuais
- **⏱️ Latência P95**: Monitoramento de performance com thresholds de latência

**Performance e Throughput:**
- **📊 Taxa de Requisições por Método/Status**: Análise detalhada por método HTTP e código de status
- **⏱️ Latência por Percentil**: P50, P95 e P99 para análise completa de performance

**Métricas dos Agentes:**
- **✅ Tarefas Completadas por Agente**: Tracking de produtividade por tipo de agente
- **❌ Taxa de Falhas por Agente**: Monitoramento de erros e falhas
- **⏰ Tempo de Execução de Tarefas**: Análise de performance de execução

**Recursos do Sistema:**
- **🖥️ Uso de CPU por Instância**: Monitoramento detalhado de recursos computacionais
- **💾 Uso de Memória**: Tracking de consumo de memória
- **📊 Throughput de Rede**: Monitoramento de tráfego de rede

## Dependências e Tecnologias

### Tecnologias Base

#### Runtime e Framework

| Tecnologia | Versão | Propósito | Documentação |
|------------|--------|-----------|-------------|
| **Node.js** | ≥18.0.0 | Runtime JavaScript | [nodejs.org](https://nodejs.org) |
| **Express.js** | ^4.18.0 | Framework web | [expressjs.com](https://expressjs.com) |
| **TypeScript** | ^5.0.0 | Tipagem estática | [typescriptlang.org](https://www.typescriptlang.org) |

#### Arquitetura e Padrões

| Padrão | Implementação | Benefício |
|--------|---------------|----------|
| **Event-Driven Architecture** | Amazon SQS | Desacoplamento, Escalabilidade |
| **BDI (Belief-Desire-Intention)** | Planning Agent | Inteligência Artificial |
| **MARL (Multi-Agent RL)** | MARL Agents | Aprendizado Colaborativo |
| **Microservices** | Agentes Independentes | Manutenibilidade |
| **CQRS** | Separação Read/Write | Performance |

### Dependências de Produção

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "compression": "^1.7.4",
    "express-rate-limit": "^6.7.0",
    "winston": "^3.8.2",
    "prom-client": "^14.2.0",
    "aws-sdk": "^2.1400.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "joi": "^17.9.0",
    "pg": "^8.11.0",
    "redis": "^4.6.0",
    "dotenv": "^16.0.3",
    "uuid": "^9.0.0",
    "lodash": "^4.17.21",
    "moment": "^2.29.4",
    "axios": "^1.4.0"
  }
}
```

### Dependências de Desenvolvimento

```json
{
  "devDependencies": {
    "jest": "^29.5.0",
    "supertest": "^6.3.0",
    "eslint": "^8.42.0",
    "prettier": "^2.8.8",
    "nodemon": "^2.0.22",
    "concurrently": "^8.2.0",
    "husky": "^8.0.3",
    "lint-staged": "^13.2.2",
    "@types/node": "^20.3.0",
    "typescript": "^5.1.0"
  }
}
```

## External Event API Gateway

### Visão Geral

O **External Event API Gateway** é um componente crítico da arquitetura, responsável por receber, validar, autenticar e distribuir eventos provenientes de sistemas externos.

**Status da Implementação:**
- ✅ **Implementado** (16/21 agentes concluídos)
- 📍 **Localização**: `src/agents/infrastructure/external-gateway/`
- 🚀 **Porta**: 3007
- 📊 **Métricas**: 9090

### Estrutura de Arquivos

```
src/agents/infrastructure/external-gateway/
├── index.js                     # Classe principal do gateway
├── gatewayConfig.js             # Configurações centralizadas
├── services/
│   ├── eventGatewayService.js   # Processamento de eventos
│   └── authService.js           # Autenticação e autorização
├── routes/
│   └── gatewayRoutes.js         # Definição de rotas REST
├── middleware/
│   └── gatewayMiddleware.js     # Middlewares customizados
├── tests/
│   ├── gateway.test.js          # Testes unitários e integração
│   └── setup.js                 # Configuração de testes
├── package.json                 # Dependências e scripts
├── Dockerfile                   # Containerização
├── .env.example                 # Variáveis de ambiente
└── README.md                    # Documentação do usuário
```

### Serviços Principais

#### 1. ExternalEventAPIGateway (index.js)
**Responsabilidades:**
- Inicialização do servidor Express
- Configuração de middlewares de segurança
- Gerenciamento do ciclo de vida da aplicação
- Coordenação entre serviços

**Funcionalidades:**
- Setup de CORS, Helmet, compressão
- Configuração de rate limiting
- Inicialização de métricas Prometheus
- Graceful shutdown

#### 2. EventGatewayService
**Responsabilidades:**
- Processamento e validação de eventos
- Roteamento para agentes apropriados
- Transformação de dados
- Logging e auditoria

#### 3. AuthService
**Responsabilidades:**
- Autenticação de requisições
- Validação de tokens JWT
- Autorização baseada em roles
- Rate limiting por usuário

## Execução Local

### Comando Unificado

```bash
# Novo comando unificado (recomendado)
npm run dev

# Ou diretamente
node scripts/start-unified.js
```

### Execução Passo a Passo

```bash
# 1. Iniciar infraestrutura
npm run infra:start

# 2. Aguardar serviços estarem prontos
npm run health:wait

# 3. Configurar SQS
npm run sqs:setup

# 4. Iniciar agentes
npm run agents:start

# 5. Verificar status
npm run status:check
```

### Verificação de Saúde

```bash
# Verificar todos os serviços
npm run health:check:all

# Verificar agentes específicos
npm run health:check:agents

# Verificar infraestrutura
npm run health:check:infra
```

## Execução com Docker

### Docker Compose

```bash
# Iniciar todos os serviços
docker-compose up -d

# Verificar logs
docker-compose logs -f

# Parar serviços
docker-compose down

# Rebuild e restart
docker-compose down && docker-compose up --build -d
```

### Comandos Docker Úteis

```bash
# Verificar containers rodando
docker ps

# Logs de um serviço específico
docker-compose logs -f [service-name]

# Executar comando em container
docker-compose exec [service-name] bash

# Limpar volumes
docker-compose down -v

# Rebuild imagens
docker-compose build --no-cache
```

## Scripts Disponíveis

### Scripts de Desenvolvimento

```bash
# Desenvolvimento
npm run dev                    # Inicia ambiente completo
npm run dev:watch             # Inicia com hot reload
npm run dev:debug             # Inicia com debug habilitado

# Instalação
npm run install:all           # Instala deps de todos os agentes
npm run install:clean         # Limpa e reinstala dependências

# Build
npm run build                 # Build de produção
npm run build:dev             # Build de desenvolvimento
npm run build:watch           # Build com watch mode
```

### Scripts de Teste

```bash
# Testes
npm test                      # Executa todos os testes
npm run test:unit             # Testes unitários
npm run test:integration      # Testes de integração
npm run test:e2e              # Testes end-to-end
npm run test:coverage         # Testes com cobertura
npm run test:watch            # Testes em modo watch
```

### Scripts de Qualidade

```bash
# Linting
npm run lint                  # Executa ESLint
npm run lint:fix              # Corrige problemas automaticamente
npm run format                # Formata código com Prettier
npm run type:check            # Verificação de tipos TypeScript
```

### Scripts Docker

```bash
# Docker
npm run docker:build          # Build das imagens
npm run docker:up             # Inicia containers
npm run docker:down           # Para containers
npm run docker:logs           # Visualiza logs
npm run docker:clean          # Limpa containers e volumes
```

### Scripts de Monitoramento

```bash
# Monitoramento
npm run metrics:collect       # Coleta métricas
npm run logs:tail             # Acompanha logs em tempo real
npm run health:monitor        # Monitora saúde dos serviços
npm run performance:test      # Teste de performance
```

### Scripts Utilitários

```bash
# Utilitários
npm run setup:init            # Configuração inicial
npm run db:migrate            # Executa migrações
npm run db:seed               # Popula banco com dados de teste
npm run cache:clear           # Limpa cache Redis
npm run queue:purge           # Limpa filas SQS
```

### Scripts AWS/SQS

```bash
# AWS/SQS
npm run sqs:setup             # Configura filas SQS
npm run sqs:list              # Lista filas existentes
npm run sqs:purge             # Limpa todas as filas
npm run aws:localstack        # Inicia LocalStack
```

## Monitoramento e Logs

### Estrutura de Logs

```
logs/
├── application.log           # Logs da aplicação
├── error.log                # Logs de erro
├── access.log               # Logs de acesso
├── performance.log          # Logs de performance
└── agents/
    ├── interface.log        # Logs do Interface Agent
    ├── event.log           # Logs do Event Agent
    ├── planning.log        # Logs do Planning Agent
    └── execution.log       # Logs do Execution Agent
```

### Configuração de Logs

```javascript
// config/logging.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'agentes-autonomos' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/application.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

### Métricas Prometheus

```javascript
// config/metrics.js
const client = require('prom-client');

// Métricas customizadas
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const agentTasksTotal = new client.Counter({
  name: 'agent_tasks_total',
  help: 'Total number of tasks processed by agents',
  labelNames: ['agent_type', 'status']
});

const queueSize = new client.Gauge({
  name: 'sqs_queue_size',
  help: 'Number of messages in SQS queues',
  labelNames: ['queue_name']
});
```

## Troubleshooting

### Problemas Comuns

#### 1. Erro "EADDRINUSE"

**Problema**: Porta já está em uso

**Solução**:
```bash
# Verificar processos usando a porta
lsof -i :3001

# Matar processo específico
kill -9 [PID]

# Ou usar script de limpeza
npm run cleanup:ports
```

#### 2. Falha na Conexão SQS

**Problema**: Agentes não conseguem se conectar ao SQS

**Solução**:
```bash
# Verificar se LocalStack está rodando
curl http://localhost:4566/_localstack/health

# Recriar filas SQS
npm run sqs:setup

# Verificar configuração
echo $SQS_ENDPOINT
```

#### 3. Dependências Desatualizadas

**Problema**: Conflitos de versão

**Solução**:
```bash
# Limpar cache npm
npm cache clean --force

# Remover node_modules
rm -rf node_modules package-lock.json

# Reinstalar dependências
npm install
```

#### 4. Problemas de Memória

**Problema**: Agentes consumindo muita memória

**Solução**:
```bash
# Monitorar uso de memória
npm run memory:monitor

# Ajustar limite de memória Node.js
export NODE_OPTIONS="--max-old-space-size=4096"

# Reiniciar agentes
npm run agents:restart
```

### Scripts de Diagnóstico

```bash
# Verificar saúde geral
npm run diagnostic:full

# Verificar conectividade
npm run diagnostic:connectivity

# Verificar performance
npm run diagnostic:performance

# Gerar relatório de sistema
npm run diagnostic:report
```

### Logs de Debug

```bash
# Habilitar logs de debug
export LOG_LEVEL=debug
export DEBUG=*

# Logs específicos por módulo
export DEBUG=agent:*,sqs:*,auth:*

# Salvar logs em arquivo
npm run dev 2>&1 | tee debug.log
```

### Rollback de Configuração

Se necessário, os backups estão em `temp/backup-configs/`:

```bash
# Restaurar configuração anterior
cp temp/backup-configs/.env.development config/environments/
cp temp/backup-configs/docker-compose.yml .

# Verificar diferenças
diff config/environments/.env.development temp/backup-configs/.env.development
```

## Deploy em Produção

### Preparação

```bash
# Build de produção
npm run build

# Testes finais
npm run test:all

# Verificação de segurança
npm audit

# Otimização de dependências
npm prune --production
```

### Variáveis de Ambiente Críticas

```env
# Produção - Variáveis obrigatórias
NODE_ENV=production
JWT_SECRET=${SECURE_JWT_SECRET}
DB_PASSWORD=${SECURE_DB_PASSWORD}
REDIS_PASSWORD=${SECURE_REDIS_PASSWORD}
AWS_ACCESS_KEY_ID=${AWS_KEY}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET}
```

### Checklist de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados migrado
- [ ] Certificados SSL válidos
- [ ] Monitoramento configurado
- [ ] Backup automatizado ativo
- [ ] Logs centralizados
- [ ] Health checks funcionando
- [ ] Rate limiting configurado
- [ ] Firewall configurado
- [ ] DNS configurado

### Comandos de Deploy

```bash
# Deploy com Docker
docker-compose -f docker-compose.prod.yml up -d

# Deploy com PM2
pm2 start ecosystem.config.js --env production

# Deploy com Kubernetes
kubectl apply -f k8s/

# Verificar deploy
npm run health:check:production
```

Este guia fornece uma base sólida para configuração, instalação e execução do sistema de agentes autônomos em diferentes ambientes, desde desenvolvimento local até produção.