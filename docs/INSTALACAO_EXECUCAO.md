# Instalação e Execução do Sistema

## 📋 Sumário

- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração Inicial](#configuração-inicial)
- [Execução Local](#execução-local)
- [Execução com Docker](#execução-com-docker)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Ambientes de Desenvolvimento](#ambientes-de-desenvolvimento)
- [Monitoramento e Logs](#monitoramento-e-logs)
- [Troubleshooting](#troubleshooting)
- [Deploy em Produção](#deploy-em-produção)

## 🛠️ Pré-requisitos

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

echo "🎉 Todos os pré-requisitos estão instalados!"
```

## 📦 Instalação

### 1. Clone do Repositório

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/agentes-autonomos.git
cd agentes-autonomos

# Verificar estrutura do projeto
ls -la
```

### 2. Instalação de Dependências

```bash
# Instalar dependências do projeto
npm install

# Verificar instalação
npm list --depth=0

# Auditoria de segurança
npm audit

# Corrigir vulnerabilidades (se necessário)
npm audit fix
```

### 3. Instalação de Ferramentas de Desenvolvimento

```bash
# Instalar ferramentas globais (opcional)
npm install -g nodemon
npm install -g pm2
npm install -g aws-cli

# Verificar instalação
nodemon --version
pm2 --version
aws --version
```

## ⚙️ Configuração Inicial

### 1. Configuração de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar configurações
nano .env  # ou seu editor preferido
```

### 2. Configuração Mínima para Desenvolvimento

```bash
# .env para desenvolvimento local
NODE_ENV=development
LOG_LEVEL=debug

# Portas dos agentes
INTERFACE_AGENT_PORT=3001
EVENT_AGENT_PORT=3002
PLANNING_AGENT_PORT=3003
EXECUTION_AGENT_PORT=3004

# LocalStack (AWS local)
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
SQS_ENDPOINT=http://localhost:4566

# Banco de dados local
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agentes_autonomos
DB_USER=postgres
DB_PASSWORD=postgres123

# Redis local
REDIS_HOST=localhost
REDIS_PORT=6379

# Segurança (ALTERE EM PRODUÇÃO!)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### 3. Inicialização do Banco de Dados

```bash
# Executar migrations
npm run db:migrate

# Executar seeds (dados iniciais)
npm run db:seed

# Verificar conexão
npm run db:test
```

## 🚀 Execução Local

### Opção 1: Execução Completa com Docker

```bash
# Subir todos os serviços (recomendado para desenvolvimento)
docker-compose -f docker-compose.dev.yml up -d

# Verificar status dos containers
docker-compose -f docker-compose.dev.yml ps

# Logs dos serviços
docker-compose -f docker-compose.dev.yml logs -f
```

### Opção 2: Execução Híbrida (Serviços Docker + Aplicação Local)

```bash
# 1. Subir apenas os serviços de infraestrutura
docker-compose -f docker-compose.dev.yml up -d localstack postgres redis

# 2. Aguardar inicialização dos serviços
sleep 10

# 3. Configurar AWS local (LocalStack)
npm run aws:setup

# 4. Executar aplicação localmente
npm run dev
```

### Opção 3: Execução Individual dos Agentes

```bash
# Terminal 1 - Interface Agent
npm run start:interface

# Terminal 2 - Event Agent
npm run start:event

# Terminal 3 - Planning Agent
npm run start:planning

# Terminal 4 - Execution Agent
npm run start:execution

# Terminal 5 - State Management Agent
npm run start:state
```

## 🐳 Execução com Docker

### Desenvolvimento

```bash
# Subir ambiente completo de desenvolvimento
docker-compose -f docker-compose.dev.yml up -d

# Verificar logs
docker-compose -f docker-compose.dev.yml logs -f agentes-app

# Parar ambiente
docker-compose -f docker-compose.dev.yml down

# Parar e remover volumes (reset completo)
docker-compose -f docker-compose.dev.yml down -v
```

### Produção

```bash
# Build da imagem de produção
docker build -t agentes-autonomos:latest .

# Executar em produção
docker-compose -f docker-compose.prod.yml up -d

# Verificar status
docker-compose -f docker-compose.prod.yml ps

# Logs de produção
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

### Comandos Docker Úteis

```bash
# Rebuild completo
docker-compose -f docker-compose.dev.yml build --no-cache

# Executar comando dentro do container
docker-compose -f docker-compose.dev.yml exec agentes-app npm test

# Acessar shell do container
docker-compose -f docker-compose.dev.yml exec agentes-app bash

# Verificar recursos utilizados
docker stats

# Limpar containers e imagens não utilizados
docker system prune -a
```

## 📜 Scripts Disponíveis

### Scripts de Desenvolvimento

```json
{
  "scripts": {
    "dev": "concurrently \"npm run start:interface\" \"npm run start:event\" \"npm run start:planning\" \"npm run start:execution\" \"npm run start:state\"",
    "start": "node src/index.js",
    "start:interface": "nodemon src/agents/core/interface-agent/index.js",
    "start:event": "nodemon src/agents/core/event-agent/index.js",
    "start:planning": "nodemon src/agents/core/planning-agent/index.js",
    "start:execution": "nodemon src/agents/core/execution-agent/index.js",
    "start:state": "nodemon src/agents/core/state-management-agent/index.js"
  }
}
```

### Scripts de Teste

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testPathPattern=integration",
    "test:unit": "jest --testPathPattern=unit",
    "test:e2e": "jest --testPathPattern=e2e"
  }
}
```

### Scripts de Build e Deploy

```json
{
  "scripts": {
    "build": "npm run lint && npm run test",
    "build:docker": "docker build -t agentes-autonomos:latest .",
    "build:prod": "NODE_ENV=production npm run build",
    "deploy:dev": "docker-compose -f docker-compose.dev.yml up -d",
    "deploy:prod": "docker-compose -f docker-compose.prod.yml up -d"
  }
}
```

### Scripts de Infraestrutura

```json
{
  "scripts": {
    "aws:setup": "node scripts/setup-aws.js",
    "aws:create-queues": "node scripts/create-sqs-queues.js",
    "aws:cleanup": "node scripts/cleanup-aws.js",
    "localstack:start": "docker-compose -f docker-compose.dev.yml up -d localstack",
    "localstack:stop": "docker-compose -f docker-compose.dev.yml stop localstack"
  }
}
```

### Scripts de Banco de Dados

```json
{
  "scripts": {
    "db:migrate": "node scripts/migrate.js",
    "db:seed": "node scripts/seed.js",
    "db:reset": "npm run db:drop && npm run db:migrate && npm run db:seed",
    "db:drop": "node scripts/drop-tables.js",
    "db:test": "node scripts/test-db-connection.js"
  }
}
```

### Scripts de Qualidade de Código

```json
{
  "scripts": {
    "lint": "eslint src/ --ext .js",
    "lint:fix": "eslint src/ --ext .js --fix",
    "format": "prettier --write src/**/*.js",
    "format:check": "prettier --check src/**/*.js",
    "clean": "rm -rf node_modules package-lock.json && npm install"
  }
}
```

### Scripts de Monitoramento

```json
{
  "scripts": {
    "monitor": "pm2 monit",
    "logs": "pm2 logs",
    "status": "pm2 status",
    "restart": "pm2 restart all",
    "stop": "pm2 stop all",
    "health": "curl http://localhost:3000/health"
  }
}
```

## 🏗️ Ambientes de Desenvolvimento

### Desenvolvimento Local Completo

```bash
# 1. Preparar ambiente
git clone <repo>
cd agentes-autonomos
npm install
cp .env.example .env

# 2. Subir infraestrutura
docker-compose -f docker-compose.dev.yml up -d

# 3. Configurar AWS local
npm run aws:setup

# 4. Inicializar banco
npm run db:migrate
npm run db:seed

# 5. Executar aplicação
npm run dev

# 6. Verificar saúde
npm run health
```

### Desenvolvimento com Hot Reload

```bash
# Usar nodemon para reload automático
npm install -g nodemon

# Executar com hot reload
nodemon --watch src --ext js,json src/index.js

# Ou usar o script configurado
npm run dev
```

### Desenvolvimento com Debug

```bash
# Executar com debug habilitado
DEBUG=agentes:* npm run dev

# Debug específico por módulo
DEBUG=agentes:interface,agentes:event npm run start:interface

# Debug com Node.js inspector
node --inspect src/index.js

# Debug com breakpoints
node --inspect-brk src/index.js
```

## 📊 Monitoramento e Logs

### Verificação de Status

```bash
# Health check geral
curl http://localhost:3000/health

# Status detalhado
curl http://localhost:3000/status

# Métricas Prometheus
curl http://localhost:3000/metrics

# Status dos agentes individuais
curl http://localhost:3001/health  # Interface Agent
curl http://localhost:3002/health  # Event Agent
curl http://localhost:3003/health  # Planning Agent
curl http://localhost:3004/health  # Execution Agent
```

### Logs em Tempo Real

```bash
# Logs de todos os serviços Docker
docker-compose -f docker-compose.dev.yml logs -f

# Logs de um serviço específico
docker-compose -f docker-compose.dev.yml logs -f agentes-app

# Logs da aplicação local
tail -f logs/combined.log

# Logs de erro
tail -f logs/error.log

# Logs com filtro
grep "ERROR" logs/combined.log
```

### Monitoramento com PM2

```bash
# Iniciar com PM2
pm2 start ecosystem.config.js

# Monitoramento em tempo real
pm2 monit

# Logs
pm2 logs

# Status
pm2 status

# Restart
pm2 restart all

# Stop
pm2 stop all

# Delete
pm2 delete all
```

### Configuração PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'interface-agent',
      script: 'src/agents/core/interface-agent/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'event-agent',
      script: 'src/agents/core/event-agent/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3002
      }
    },
    {
      name: 'planning-agent',
      script: 'src/agents/core/planning-agent/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3003
      }
    },
    {
      name: 'execution-agent',
      script: 'src/agents/core/execution-agent/index.js',
      instances: 3,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3004
      }
    }
  ]
};
```

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Porta já em uso
```bash
# Verificar processos usando a porta
lsof -i :3000

# Matar processo
kill -9 <PID>

# Ou usar script
npm run kill-port 3000
```

#### 2. Problemas com Docker
```bash
# Verificar status do Docker
docker info

# Restart do Docker
sudo systemctl restart docker

# Limpar cache do Docker
docker system prune -a

# Rebuild sem cache
docker-compose build --no-cache
```

#### 3. Problemas de Dependências
```bash
# Limpar cache do npm
npm cache clean --force

# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install

# Verificar vulnerabilidades
npm audit
npm audit fix
```

#### 4. Problemas de Conectividade
```bash
# Testar conectividade com serviços

# PostgreSQL
psql -h localhost -U postgres -d agentes_autonomos -c "SELECT version();"

# Redis
redis-cli -h localhost -p 6379 ping

# LocalStack
aws --endpoint-url=http://localhost:4566 sqs list-queues

# Verificar portas abertas
netstat -tulpn | grep LISTEN
```

### Scripts de Diagnóstico

```bash
#!/bin/bash
# scripts/diagnose.sh

echo "🔍 Diagnóstico do Sistema"
echo "========================"

# Verificar Node.js
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"

# Verificar Docker
echo "Docker: $(docker --version)"
echo "Docker Compose: $(docker-compose --version)"

# Verificar processos
echo "\n📊 Processos ativos:"
ps aux | grep node | grep -v grep

# Verificar portas
echo "\n🔌 Portas em uso:"
netstat -tulpn | grep :300

# Verificar Docker containers
echo "\n🐳 Containers Docker:"
docker ps

# Verificar logs recentes
echo "\n📝 Logs recentes (últimas 10 linhas):"
tail -n 10 logs/combined.log 2>/dev/null || echo "Arquivo de log não encontrado"

# Verificar conectividade
echo "\n🌐 Teste de conectividade:"
curl -s http://localhost:3000/health || echo "Serviço principal não responde"
curl -s http://localhost:4566 || echo "LocalStack não responde"

echo "\n✅ Diagnóstico concluído"
```

## 🚀 Deploy em Produção

### Preparação para Produção

```bash
# 1. Build de produção
NODE_ENV=production npm run build

# 2. Testes completos
npm run test:coverage

# 3. Auditoria de segurança
npm audit --audit-level moderate

# 4. Build da imagem Docker
docker build -t agentes-autonomos:$(git rev-parse --short HEAD) .
docker tag agentes-autonomos:$(git rev-parse --short HEAD) agentes-autonomos:latest
```

### Deploy com Docker

```bash
# 1. Configurar variáveis de produção
cp .env.production .env

# 2. Deploy
docker-compose -f docker-compose.prod.yml up -d

# 3. Verificar deploy
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f

# 4. Health check
curl https://seu-dominio.com/health
```

### Deploy com PM2

```bash
# 1. Deploy com PM2
pm2 start ecosystem.config.js --env production

# 2. Salvar configuração
pm2 save

# 3. Configurar startup automático
pm2 startup

# 4. Monitorar
pm2 monit
```

### Rollback

```bash
# Rollback Docker
docker-compose -f docker-compose.prod.yml down
docker run -d agentes-autonomos:previous-version

# Rollback PM2
pm2 stop all
git checkout previous-commit
npm install
pm2 start ecosystem.config.js --env production
```

---

## 📚 Próximos Passos

Após a instalação e execução:

1. [API e Endpoints](API_ENDPOINTS.md) - Documentação das APIs
2. [Monitoramento](MONITORAMENTO.md) - Configuração de monitoramento
3. [Troubleshooting Avançado](TROUBLESHOOTING.md) - Resolução de problemas

---

*Documentação gerada automaticamente - Última atualização: $(date)*