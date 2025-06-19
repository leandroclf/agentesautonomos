# Message Schema Registry

## 📋 Visão Geral

O **Message Schema Registry** é um sistema robusto e escalável para gerenciamento centralizado de esquemas de mensagens em arquiteturas de microserviços e sistemas de agentes autônomos. Ele fornece versionamento, validação, compatibilidade e migração de esquemas de forma automatizada e confiável.

## 🚀 Características Principais

### 🔧 Gerenciamento de Esquemas
- **Múltiplos Formatos**: Suporte para JSON Schema, Avro e Protocol Buffers
- **Versionamento Semântico**: Controle automático de versões com estratégias configuráveis
- **Validação Robusta**: Validação de dados em tempo real com cache otimizado
- **Armazenamento Flexível**: Suporte para memória, Redis e sistemas de arquivos

### 🔄 Compatibilidade e Migração
- **Políticas de Compatibilidade**: BACKWARD, FORWARD, FULL e NONE
- **Migração Automática**: Transformação de dados entre versões de esquemas
- **Detecção de Breaking Changes**: Análise automática de mudanças incompatíveis
- **Estratégias de Migração**: Auto, manual, mapping e script-based

### 📊 Monitoramento e Observabilidade
- **Métricas Prometheus**: Coleta automática de métricas de performance
- **Health Checks**: Monitoramento contínuo da saúde do sistema
- **Alertas Configuráveis**: Notificações via Email, Slack, PagerDuty e Webhooks
- **Logging Estruturado**: Logs detalhados com Winston

### 🔌 Integração
- **API RESTful**: Interface completa para todas as operações
- **SQS Integration**: Processamento assíncrono via Amazon SQS
- **Cache Distribuído**: Suporte para Redis e cache em memória
- **Documentação OpenAPI**: Swagger UI integrado

## 🏗️ Arquitetura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │    │   Load Balancer │    │   Monitoring    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         │          Message Schema Registry              │
         └─────────────────┬───────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                     │                     │
┌───▼───┐           ┌─────▼─────┐         ┌─────▼─────┐
│ Cache │           │ Services  │         │   SQS     │
│(Redis)│           │ Layer     │         │ Queues    │
└───────┘           └───────────┘         └───────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │  Schema   │ │Version│ │Migration  │
        │ Service   │ │Service│ │ Service   │
        └───────────┘ └───────┘ └───────────┘
```

## 📦 Instalação

### Pré-requisitos
- Node.js >= 16.0.0
- npm >= 8.0.0
- Redis (opcional, para cache distribuído)
- AWS Account (opcional, para SQS)

### Instalação Local

```bash
# Clone o repositório
git clone <repository-url>
cd message-schema-registry

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env conforme necessário

# Execute em modo de desenvolvimento
npm run dev

# Ou execute em produção
npm start
```

### Docker

```bash
# Build da imagem
npm run docker:build

# Execute o container
npm run docker:run
```

### Docker Compose

```yaml
version: '3.8'
services:
  schema-registry:
    build: .
    ports:
      - "3022:3022"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## 🔧 Configuração

### Variáveis de Ambiente Principais

```bash
# Servidor
PORT=3022
NODE_ENV=development

# Cache
CACHE_DISTRIBUTED_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS SQS
SQS_ENABLED=true
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Alertas
ALERTS_ENABLED=true
SLACK_WEBHOOK_URL=your_webhook
```

### Configuração de Esquemas

```javascript
// Exemplo de configuração de compatibilidade
{
  "compatibility": {
    "default": "BACKWARD",
    "enforceOnRegistration": true,
    "allowBreakingChanges": false
  }
}
```

## 📚 Uso da API

### Registrar um Esquema

```bash
curl -X POST http://localhost:3022/api/v1/schemas \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-profile",
    "schema": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "name": {"type": "string"},
        "email": {"type": "string", "format": "email"}
      },
      "required": ["id", "name", "email"]
    },
    "format": "json-schema"
  }'
```

### Validar Dados

```bash
curl -X POST http://localhost:3022/api/v1/validation/validate \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-profile",
    "version": "latest",
    "data": {
      "id": "123",
      "name": "João Silva",
      "email": "joao@example.com"
    }
  }'
```

### Verificar Compatibilidade

```bash
curl -X POST http://localhost:3022/api/v1/compatibility/check \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-profile",
    "targetVersion": "1.0.0",
    "newSchema": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "name": {"type": "string"},
        "email": {"type": "string", "format": "email"},
        "age": {"type": "number"}
      },
      "required": ["id", "name", "email"]
    }
  }'
```

### Migrar Dados

```bash
curl -X POST http://localhost:3022/api/v1/migration/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "user-profile",
    "fromVersion": "1.0.0",
    "toVersion": "1.1.0",
    "data": [
      {"id": "123", "name": "João", "email": "joao@example.com"}
    ],
    "strategy": "auto"
  }'
```

## 🔍 Monitoramento

### Health Check

```bash
curl http://localhost:3022/health
```

### Métricas Prometheus

```bash
curl http://localhost:3022/metrics
```

### Documentação da API

Acesse: `http://localhost:3022/docs`

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Executar testes em modo watch
npm run test:watch

# Executar testes com coverage
npm run test:coverage

# Linting
npm run lint

# Formatação de código
npm run format
```

## 📊 Métricas e Alertas

### Métricas Disponíveis

- `msr_http_requests_total`: Total de requisições HTTP
- `msr_schema_registrations_total`: Total de registros de esquemas
- `msr_validations_total`: Total de validações
- `msr_compatibility_checks_total`: Total de verificações de compatibilidade
- `msr_migrations_total`: Total de migrações
- `msr_cache_hits_total`: Total de cache hits
- `msr_cache_misses_total`: Total de cache misses

### Tipos de Alertas

- **Schema Registration Failed**: Falha no registro de esquema
- **Validation Failed**: Falha na validação
- **Compatibility Violation**: Violação de compatibilidade
- **Migration Failed**: Falha na migração
- **High Error Rate**: Taxa alta de erros
- **Memory Usage**: Uso alto de memória

## 🔧 Scripts Utilitários

```bash
# Backup de esquemas
npm run backup

# Restaurar backup
npm run restore

# Migração de dados
npm run migrate

# Seed de dados de teste
npm run seed

# Gerar documentação
npm run docs:generate
```

## 🏗️ Desenvolvimento

### Estrutura do Projeto

```
message-schema-registry/
├── config/
│   └── schemaConfig.js      # Configurações principais
├── services/
│   ├── schemaService.js     # Gerenciamento de esquemas
│   ├── validationService.js # Validação de dados
│   ├── versionService.js    # Controle de versões
│   ├── compatibilityService.js # Verificação de compatibilidade
│   ├── migrationService.js  # Migração de dados
│   ├── sqsService.js        # Integração SQS
│   ├── cacheService.js      # Gerenciamento de cache
│   ├── healthService.js     # Health checks
│   ├── metricsService.js    # Coleta de métricas
│   └── alertService.js      # Sistema de alertas
├── routes/
│   ├── schemaRoutes.js      # Rotas de esquemas
│   ├── validationRoutes.js  # Rotas de validação
│   ├── versionRoutes.js     # Rotas de versões
│   ├── compatibilityRoutes.js # Rotas de compatibilidade
│   ├── migrationRoutes.js   # Rotas de migração
│   ├── healthRoutes.js      # Rotas de health
│   └── metricsRoutes.js     # Rotas de métricas
├── middleware/
│   ├── auth.js              # Autenticação
│   ├── validation.js        # Validação de entrada
│   └── errorHandler.js      # Tratamento de erros
├── models/
│   ├── schema.js            # Modelo de esquema
│   ├── version.js           # Modelo de versão
│   └── migration.js         # Modelo de migração
├── tests/
│   ├── unit/                # Testes unitários
│   ├── integration/         # Testes de integração
│   └── e2e/                 # Testes end-to-end
├── docs/
│   └── api.md               # Documentação da API
├── scripts/
│   ├── backup.js            # Script de backup
│   ├── restore.js           # Script de restore
│   ├── migrate.js           # Script de migração
│   └── seed.js              # Script de seed
├── logs/                    # Arquivos de log
├── data/                    # Dados persistidos
├── backups/                 # Backups
├── server.js                # Servidor principal
├── package.json             # Dependências
├── .env.example             # Exemplo de variáveis de ambiente
├── Dockerfile               # Configuração Docker
├── docker-compose.yml       # Configuração Docker Compose
└── README.md                # Este arquivo
```

### Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

### Padrões de Código

- Use ESLint para linting
- Use Prettier para formatação
- Escreva testes para novas funcionalidades
- Mantenha cobertura de testes acima de 80%
- Use commits semânticos

## 🚀 Deploy

### Produção

```bash
# Build e validação
npm run build

# Deploy com PM2
pm2 start ecosystem.config.js

# Deploy com Docker
docker-compose up -d

# Deploy no Kubernetes
kubectl apply -f k8s/
```

### Variáveis de Ambiente de Produção

```bash
NODE_ENV=production
CLUSTER_ENABLED=true
CLUSTER_WORKERS=4
CACHE_DISTRIBUTED_ENABLED=true
METRICS_ENABLED=true
ALERTS_ENABLED=true
HEALTH_CHECK_ENABLED=true
```

## 🔒 Segurança

- Helmet.js para headers de segurança
- Rate limiting configurável
- CORS configurável
- Validação de entrada rigorosa
- Logs de auditoria
- Sanitização de dados

## 📈 Performance

- Cache em múltiplas camadas
- Compressão de resposta
- Pool de conexões
- Processamento assíncrono
- Clustering para alta disponibilidade
- Métricas de performance em tempo real

## 🐛 Troubleshooting

### Problemas Comuns

1. **Erro de conexão com Redis**
   ```bash
   # Verificar se Redis está rodando
   redis-cli ping
   ```

2. **Erro de permissão AWS**
   ```bash
   # Verificar credenciais AWS
   aws sts get-caller-identity
   ```

3. **Alto uso de memória**
   ```bash
   # Verificar métricas
   curl http://localhost:3022/metrics | grep memory
   ```

### Logs

```bash
# Logs em tempo real
tail -f logs/combined.log

# Logs de erro
tail -f logs/error.log

# Logs com filtro
grep "ERROR" logs/combined.log
```

## 📞 Suporte

- **Documentação**: `/docs`
- **Health Check**: `/health`
- **Métricas**: `/metrics`
- **Issues**: GitHub Issues
- **Email**: support@example.com

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- Equipe de desenvolvimento
- Comunidade open source
- Contribuidores do projeto

---

**Message Schema Registry** - Gerenciamento centralizado de esquemas para sistemas distribuídos.