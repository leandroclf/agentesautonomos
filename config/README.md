# Configurações

Esta pasta centraliza todas as configurações do sistema, templates de ambiente e configurações específicas de cada componente.

## 📁 Estrutura

```
config/
├── README.md              # Este arquivo
├── environments/          # Templates de ambiente
│   ├── .env.development
│   ├── .env.staging
│   ├── .env.production
│   └── .env.local
├── app-configs/           # Configurações da aplicação
│   ├── agents/
│   ├── database/
│   └── messaging/
├── monitoring/            # Configurações de monitoramento
│   ├── prometheus.yml
│   ├── grafana/
│   └── alertmanager/
└── templates/             # Templates de configuração
    ├── docker-compose.template.yml
    └── kubernetes.template.yml
```

## 🔧 Configurações por Ambiente

### Desenvolvimento Local
- `.env.development`: Configurações para desenvolvimento
- `.env.local`: Sobrescreve configurações locais específicas
- LocalStack endpoints
- Logs em nível DEBUG

### Staging
- `.env.staging`: Configurações de staging
- Recursos AWS de teste
- Logs em nível INFO
- Métricas habilitadas

### Produção
- `.env.production`: Configurações de produção
- Recursos AWS otimizados
- Logs em nível WARN/ERROR
- Monitoramento completo

## 🏗️ Configurações da Aplicação

### Agentes
```javascript
// config/app-configs/agents/interface-agent.js
module.exports = {
  port: process.env.INTERFACE_AGENT_PORT || 3000,
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // requests per window
  }
};
```

### Messaging (SQS)
```javascript
// config/app-configs/messaging/sqs.js
module.exports = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.SQS_ENDPOINT,
  queues: {
    events: process.env.EVENT_QUEUE_URL,
    planning: process.env.PLANNING_QUEUE_URL,
    execution: process.env.EXECUTION_QUEUE_URL
  },
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2
  }
};
```

## 📊 Monitoramento

### Prometheus
- Configuração de scraping
- Rules de alertas
- Service discovery

### Grafana
- Dashboards pré-configurados
- Data sources
- Alerting rules

## 🚀 Como usar

### Configurar Ambiente
```bash
# Copiar template para ambiente específico
cp config/environments/.env.development .env

# Editar configurações necessárias
nano .env
```

### Validar Configurações
```bash
# Verificar se todas as variáveis estão definidas
node scripts/validate-config.js

# Testar conectividade
node scripts/test-connections.js
```

## 🔒 Segurança

### Secrets
- Nunca commitar secrets reais
- Usar placeholders nos templates
- Secrets em AWS Secrets Manager (produção)
- Variáveis de ambiente para desenvolvimento

### Validação
- Schema validation para configurações
- Verificação de tipos
- Valores obrigatórios

## 📋 Variáveis de Ambiente

### Essenciais
```bash
# Ambiente
NODE_ENV=development|staging|production

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# SQS
SQS_ENDPOINT=http://localhost:4566  # LocalStack
EVENT_QUEUE_URL=event-agent-queue

# Agentes
INTERFACE_AGENT_PORT=3000
EVENT_AGENT_PORT=3001
PLANNING_AGENT_PORT=3002
EXECUTION_AGENT_PORT=3003

# Monitoramento
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
```

## 🔄 Migração de Configurações

Para migrar configurações existentes:
1. Backup das configurações atuais
2. Usar templates como base
3. Migrar valores específicos
4. Validar nova configuração
5. Testar em ambiente de desenvolvimento