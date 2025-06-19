# Persistence Agent

Agente responsável pelo gerenciamento avançado de persistência de dados e estado no sistema de agentes autônomos.

## 📋 Visão Geral

O Persistence Agent é um componente crítico que gerencia:

- **Armazenamento de Dados**: Suporte para MongoDB, PostgreSQL e MySQL
- **Cache Distribuído**: Redis e cache em memória
- **Backup Automático**: Local e AWS S3 com compressão
- **Replicação**: Sincronização entre múltiplas instâncias
- **Validação**: Esquemas e transformação de dados
- **Observabilidade**: Métricas e health checks

## 🚀 Funcionalidades

### Armazenamento Multi-Database
- MongoDB para documentos
- PostgreSQL para dados relacionais
- MySQL para compatibilidade legacy
- Conexões com retry automático
- Pool de conexões otimizado

### Sistema de Cache
- Redis para cache distribuído
- Cache em memória para alta performance
- TTL configurável
- Compressão automática
- Estatísticas detalhadas

### Backup Inteligente
- Backup automático agendado
- Compressão gzip
- Upload para AWS S3
- Retenção configurável
- Restauração por ID

### Validação e Transformação
- Validação de esquemas com Joi
- Transformação automática de dados
- Normalização de timestamps
- Criptografia de dados sensíveis
- Geração automática de IDs

## 📦 Instalação

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env

# Iniciar em desenvolvimento
npm run dev

# Iniciar em produção
npm start
```

## 🔧 Configuração

### Variáveis de Ambiente

```env
# Servidor
PORT=3016
NODE_ENV=development

# AWS SQS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/persistence-events
SQS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/123456789/persistence-events-dlq

# Database
DB_TYPE=mongodb
DB_HOST=localhost
DB_PORT=27017
DB_NAME=persistence_db
DB_USER=persistence_user
DB_PASSWORD=persistence_pass

# Cache Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_pass
REDIS_DB=0

# Backup S3
S3_BUCKET=persistence-backups
S3_REGION=us-east-1
S3_ACCESS_KEY=your_s3_key
S3_SECRET_KEY=your_s3_secret
```

### Configuração Avançada

Veja `persistenceConfig.js` para configurações detalhadas:

- Pool de conexões
- Timeouts e retries
- Configurações de cache
- Políticas de backup
- Validação de esquemas

## 🏗️ Arquitetura

```
persistence/
├── index.js                 # Ponto de entrada
├── persistenceConfig.js     # Configurações
├── services/
│   ├── persistenceService.js # Coordenação principal
│   ├── databaseService.js   # Gerenciamento de DB
│   ├── cacheService.js      # Gerenciamento de cache
│   └── backupService.js     # Sistema de backup
├── package.json
├── Dockerfile
└── README.md
```

## 📊 Métricas

O agente expõe métricas Prometheus em `/metrics`:

- `persistence_operations_total`: Total de operações
- `persistence_operation_duration_seconds`: Duração das operações
- `persistence_cache_hits_total`: Cache hits
- `persistence_cache_misses_total`: Cache misses
- `persistence_backup_operations_total`: Operações de backup
- `persistence_database_connections`: Conexões ativas
- `persistence_queue_size`: Tamanho da fila

## 🔍 Health Checks

Endpoint: `GET /health`

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "database": "connected",
    "cache": "connected",
    "sqs": "connected",
    "backup": "enabled"
  },
  "metrics": {
    "totalOperations": 1500,
    "cacheHitRate": 0.85,
    "queueSize": 5,
    "lastBackup": "2024-01-15T09:00:00.000Z"
  }
}
```

## 🔄 Fluxo de Dados

1. **Recebimento**: Mensagens do SQS `persistence-events`
2. **Validação**: Esquemas e transformação
3. **Armazenamento**: Database principal + cache
4. **Backup**: Agendamento automático
5. **Replicação**: Sincronização (se habilitada)
6. **Resposta**: Confirmação ou erro para DLQ

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Testes com watch
npm run test:watch

# Coverage
npm run test:coverage

# Lint
npm run lint
```

## 🐳 Docker

```bash
# Build
npm run docker:build

# Run
npm run docker:run

# Com docker-compose
docker-compose up persistence-agent
```

## 📝 API

### Endpoints Principais

- `GET /health` - Health check
- `GET /metrics` - Métricas Prometheus
- `GET /status` - Status detalhado
- `POST /backup` - Forçar backup
- `GET /backups` - Listar backups
- `POST /restore/:id` - Restaurar backup

### Formato de Mensagens SQS

```json
{
  "operation": "store|retrieve|update|delete",
  "collection": "events|states|configs",
  "data": {
    "id": "unique-id",
    "content": {},
    "metadata": {}
  },
  "options": {
    "cache": true,
    "backup": true,
    "validate": true
  }
}
```

## 🔒 Segurança

- Criptografia de dados sensíveis
- Conexões SSL/TLS
- Validação rigorosa de entrada
- Rate limiting
- Logs de auditoria
- Backup criptografado

## 📈 Performance

- Pool de conexões otimizado
- Cache multi-layer
- Compressão automática
- Índices de database
- Particionamento (configurável)
- Métricas em tempo real

## 🚨 Troubleshooting

### Problemas Comuns

1. **Conexão com Database**
   ```bash
   # Verificar logs
   docker logs persistence-agent
   
   # Testar conectividade
   curl http://localhost:3016/health
   ```

2. **Cache Redis**
   ```bash
   # Verificar Redis
   redis-cli ping
   
   # Estatísticas
   curl http://localhost:3016/status
   ```

3. **Backup S3**
   ```bash
   # Verificar credenciais AWS
   aws s3 ls s3://persistence-backups
   
   # Forçar backup
   curl -X POST http://localhost:3016/backup
   ```

### Logs

Logs estruturados em JSON:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Operação concluída",
  "operation": "store",
  "collection": "events",
  "duration": 150,
  "cached": true
}
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

## 🔗 Links Relacionados

- [Documentação do Sistema](../../docs/)
- [Plano de Implementação](../../docs/PLANO_SEQUENCIAL_IMPLEMENTACAO.md)
- [Status da Implementação](../../docs/IMPLEMENTACAO_STATUS.md)
- [Configuração AWS](../../infrastructure/aws/)