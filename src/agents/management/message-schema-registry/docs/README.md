# Message Schema Registry

Um serviço completo para gerenciamento de esquemas de mensagens com suporte a versionamento, validação, compatibilidade e migração.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Características](#características)
- [Arquitetura](#arquitetura)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso](#uso)
- [API Reference](#api-reference)
- [Monitoramento](#monitoramento)
- [Desenvolvimento](#desenvolvimento)
- [Contribuição](#contribuição)

## 🎯 Visão Geral

O Message Schema Registry é um serviço centralizado para gerenciar esquemas de mensagens em arquiteturas distribuídas. Ele fornece:

- **Registro e versionamento** de esquemas
- **Validação** de mensagens contra esquemas
- **Verificação de compatibilidade** entre versões
- **Migração automática** de dados
- **Monitoramento** e métricas em tempo real
- **Cache distribuído** para alta performance
- **Integração com AWS SQS** para processamento de mensagens

## ✨ Características

### Core Features
- 🔄 **Versionamento Semântico**: Suporte completo ao SemVer
- 🛡️ **Validação Robusta**: Validação de esquemas JSON Schema e Avro
- 🔗 **Verificação de Compatibilidade**: Backward, forward e full compatibility
- 🚀 **Migração Automática**: Migração de dados entre versões
- 📊 **Métricas e Monitoramento**: Prometheus, health checks e alertas
- 💾 **Cache Distribuído**: Redis para alta performance
- 🔐 **Segurança**: Rate limiting, CORS, Helmet

### Integrações
- ☁️ **AWS SQS**: Processamento de mensagens em fila
- 📈 **Prometheus**: Métricas e monitoramento
- 🗄️ **Redis**: Cache distribuído
- 📝 **Swagger**: Documentação automática da API
- 🐳 **Docker**: Containerização completa

## 🏗️ Arquitetura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Load Balancer │    │   API Gateway   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Schema Registry │    │ Schema Registry │    │ Schema Registry │
│   Instance 1    │    │   Instance 2    │    │   Instance 3    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
    ┌─────────────┬──────────────┼──────────────┬─────────────┐
    │             │              │              │             │
┌───────┐   ┌─────────┐   ┌─────────────┐   ┌─────────┐   ┌─────────┐
│ Redis │   │ AWS SQS │   │ Prometheus  │   │ Grafana │   │ AlertMgr│
│ Cache │   │ Queues  │   │  Metrics    │   │Dashboard│   │ Alerts  │
└───────┘   └─────────┘   └─────────────┘   └─────────┘   └─────────┘
```

### Componentes Principais

#### Services
- **SchemaService**: Gerenciamento de esquemas
- **ValidationService**: Validação de mensagens
- **VersionService**: Controle de versões
- **CompatibilityService**: Verificação de compatibilidade
- **MigrationService**: Migração de dados
- **CacheService**: Cache distribuído
- **MetricsService**: Coleta de métricas
- **HealthService**: Health checks
- **AlertService**: Sistema de alertas
- **SQSService**: Integração com AWS SQS

#### Routes
- **Schema Routes**: CRUD de esquemas
- **Validation Routes**: Validação de mensagens
- **Version Routes**: Gerenciamento de versões
- **Compatibility Routes**: Verificação de compatibilidade
- **Migration Routes**: Operações de migração
- **Health Routes**: Health checks e status

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+
- Redis 6+
- AWS Account (para SQS)
- Docker (opcional)

### Instalação Local

```bash
# Clone o repositório
git clone <repository-url>
cd message-schema-registry

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env com suas configurações

# Inicie o Redis (se não estiver rodando)
redis-server

# Inicie o serviço
npm start
```

### Docker

```bash
# Build da imagem
docker build -t message-schema-registry .

# Execute com docker-compose
docker-compose up -d
```

## ⚙️ Configuração

### Variáveis de Ambiente

```bash
# Servidor
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# SQS
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/schema-queue

# Monitoramento
METRICS_ENABLED=true
METRICS_PORT=9090
PROMETHEUS_ENABLED=true

# Alertas
ALERT_WEBHOOK_URL=https://hooks.slack.com/your-webhook
ALERT_EMAIL_ENABLED=false
```

### Configuração Avançada

O arquivo `config/schemaConfig.js` contém configurações detalhadas:

```javascript
module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    clustering: process.env.CLUSTERING === 'true'
  },
  
  schema: {
    maxSize: 1024 * 1024, // 1MB
    supportedFormats: ['json-schema', 'avro'],
    validation: {
      strict: true,
      allowUnknownFormats: false
    }
  },
  
  versioning: {
    strategy: 'semantic', // 'semantic' ou 'incremental'
    autoTag: true
  },
  
  compatibility: {
    defaultPolicy: 'backward',
    policies: ['backward', 'forward', 'full', 'none']
  }
  
  // ... mais configurações
}
```

## 📖 Uso

### Registro de Esquema

```bash
# Registrar um novo esquema
curl -X POST http://localhost:3000/api/v1/schemas \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-created",
    "format": "json-schema",
    "schema": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "email": { "type": "string", "format": "email" }
      },
      "required": ["id", "name", "email"]
    }
  }'
```

### Validação de Mensagem

```bash
# Validar uma mensagem
curl -X POST http://localhost:3000/api/v1/validation/validate \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-created",
    "version": "latest",
    "message": {
      "id": "123",
      "name": "João Silva",
      "email": "joao@example.com"
    }
  }'
```

### Verificação de Compatibilidade

```bash
# Verificar compatibilidade
curl -X POST http://localhost:3000/api/v1/compatibility/check \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-created",
    "version": "1.0.0",
    "schema": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "age": { "type": "integer" }
      },
      "required": ["id", "name", "email"]
    }
  }'
```

### Migração de Dados

```bash
# Criar plano de migração
curl -X POST http://localhost:3000/api/v1/migration/plan \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-created",
    "fromVersion": "1.0.0",
    "toVersion": "2.0.0"
  }'

# Executar migração
curl -X POST http://localhost:3000/api/v1/migration/execute \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "migration-plan-123"
  }'
```

## 📚 API Reference

### Schemas

| Método | Endpoint | Descrição |
|--------|----------|----------|
| GET | `/api/v1/schemas` | Listar esquemas |
| POST | `/api/v1/schemas` | Registrar esquema |
| GET | `/api/v1/schemas/{subject}` | Obter esquema |
| PUT | `/api/v1/schemas/{subject}` | Atualizar esquema |
| DELETE | `/api/v1/schemas/{subject}` | Deletar esquema |

### Validation

| Método | Endpoint | Descrição |
|--------|----------|----------|
| POST | `/api/v1/validation/validate` | Validar mensagem |
| POST | `/api/v1/validation/batch` | Validação em lote |
| GET | `/api/v1/validation/stats` | Estatísticas |

### Versions

| Método | Endpoint | Descrição |
|--------|----------|----------|
| GET | `/api/v1/versions/{subject}` | Listar versões |
| GET | `/api/v1/versions/{subject}/{version}` | Obter versão |
| DELETE | `/api/v1/versions/{subject}/{version}` | Deletar versão |
| POST | `/api/v1/versions/{subject}/compare` | Comparar versões |

### Compatibility

| Método | Endpoint | Descrição |
|--------|----------|----------|
| POST | `/api/v1/compatibility/check` | Verificar compatibilidade |
| GET | `/api/v1/compatibility/policy/{subject}` | Obter política |
| PUT | `/api/v1/compatibility/policy/{subject}` | Definir política |

### Migration

| Método | Endpoint | Descrição |
|--------|----------|----------|
| POST | `/api/v1/migration/plan` | Criar plano |
| POST | `/api/v1/migration/execute` | Executar migração |
| GET | `/api/v1/migration/status/{id}` | Status da migração |
| POST | `/api/v1/migration/cancel/{id}` | Cancelar migração |

### Health & Metrics

| Método | Endpoint | Descrição |
|--------|----------|----------|
| GET | `/health` | Health check |
| GET | `/health/detailed` | Health detalhado |
| GET | `/metrics` | Métricas Prometheus |

## 📊 Monitoramento

### Métricas Disponíveis

- **schemas_registered_total**: Total de esquemas registrados
- **validations_total**: Total de validações realizadas
- **validation_errors_total**: Total de erros de validação
- **compatibility_checks_total**: Total de verificações de compatibilidade
- **migrations_total**: Total de migrações executadas
- **cache_hits_total**: Total de cache hits
- **cache_misses_total**: Total de cache misses
- **request_duration_seconds**: Duração das requisições
- **active_connections**: Conexões ativas

### Health Checks

O serviço expõe endpoints de health check:

```bash
# Health check básico
curl http://localhost:3000/health

# Health check detalhado
curl http://localhost:3000/health/detailed
```

### Alertas

O sistema pode enviar alertas via:
- Webhook (Slack, Discord, etc.)
- Email
- Integração com sistemas de monitoramento

## 🛠️ Desenvolvimento

### Estrutura do Projeto

```
message-schema-registry/
├── config/                 # Configurações
│   └── schemaConfig.js
├── docs/                   # Documentação
│   └── README.md
├── middleware/             # Middlewares Express
├── models/                 # Modelos de dados
├── monitoring/             # Configurações de monitoramento
├── routes/                 # Rotas da API
│   ├── schemaRoutes.js
│   ├── validationRoutes.js
│   ├── versionRoutes.js
│   ├── compatibilityRoutes.js
│   ├── migrationRoutes.js
│   └── healthRoutes.js
├── scripts/                # Scripts utilitários
├── services/               # Serviços de negócio
│   ├── schemaService.js
│   ├── validationService.js
│   ├── versionService.js
│   ├── compatibilityService.js
│   ├── migrationService.js
│   ├── cacheService.js
│   ├── metricsService.js
│   ├── healthService.js
│   ├── alertService.js
│   └── sqsService.js
├── tests/                  # Testes
├── index.js               # Classe principal
├── server.js              # Servidor HTTP
└── package.json
```

### Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Inicia em modo desenvolvimento
npm run start        # Inicia em modo produção
npm run test         # Executa testes
npm run test:watch   # Executa testes em modo watch
npm run lint         # Executa linting
npm run lint:fix     # Corrige problemas de linting

# Build e Deploy
npm run build        # Build para produção
npm run docker:build # Build da imagem Docker
npm run docker:run   # Executa container Docker
```

### Testes

```bash
# Executar todos os testes
npm test

# Executar testes específicos
npm test -- --grep "SchemaService"

# Executar com coverage
npm run test:coverage
```

### Debugging

```bash
# Debug mode
DEBUG=schema-registry:* npm run dev

# Verbose logging
LOG_LEVEL=debug npm start
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

### Guidelines

- Siga os padrões de código estabelecidos
- Adicione testes para novas funcionalidades
- Atualize a documentação quando necessário
- Use commits semânticos

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

- 📧 Email: support@example.com
- 💬 Slack: #schema-registry
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/message-schema-registry/issues)
- 📖 Wiki: [GitHub Wiki](https://github.com/your-org/message-schema-registry/wiki)

---

**Message Schema Registry** - Gerenciamento centralizado de esquemas para arquiteturas distribuídas.