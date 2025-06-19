# External Event API Gateway

Gateway de API para recebimento e processamento de eventos externos no sistema de Agentes Autônomos.

## 📋 Visão Geral

O External Event API Gateway é responsável por:

- **Recebimento de Eventos**: API REST para receber eventos de sistemas externos
- **Autenticação**: Validação de API keys com controle de permissões
- **Validação**: Validação rigorosa de payloads de eventos
- **Rate Limiting**: Controle de taxa de requisições por cliente
- **Transformação**: Normalização e enriquecimento de eventos
- **Distribuição**: Envio de eventos para filas SQS apropriadas
- **Monitoramento**: Métricas Prometheus e logs estruturados

## 🚀 Início Rápido

### Pré-requisitos

- Node.js >= 16.0.0
- Redis (opcional, para cache)
- AWS SQS (ou LocalStack para desenvolvimento)

### Instalação

```bash
# Clone o repositório
git clone <repository-url>
cd external-gateway

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env

# Inicie o serviço
npm start
```

### Docker

```bash
# Build da imagem
docker build -t external-event-gateway .

# Execute o container
docker run -p 3007:3007 -p 9090:9090 external-event-gateway
```

## 📡 API Endpoints

### Health & Status

```http
GET /health
GET /status
GET /metrics
```

### Event Processing

```http
# Processar evento único
POST /events
Content-Type: application/json
X-API-Key: your-api-key

{
  "eventType": "user.created",
  "eventId": "evt_123",
  "timestamp": "2023-12-07T10:00:00Z",
  "source": "user-service",
  "data": {
    "userId": "12345",
    "email": "user@example.com"
  },
  "metadata": {
    "version": "1.0",
    "correlationId": "corr_123"
  }
}

# Processar lote de eventos
POST /events/batch
Content-Type: application/json
X-API-Key: your-api-key

{
  "events": [
    { /* evento 1 */ },
    { /* evento 2 */ }
  ]
}

# Validar evento
POST /events/validate
Content-Type: application/json
X-API-Key: your-api-key

{ /* evento para validar */ }
```

### API Key Management

```http
# Listar chaves
GET /api-keys
X-API-Key: admin-key

# Criar nova chave
POST /api-keys
X-API-Key: admin-key

{
  "name": "Client App",
  "permissions": ["events:write"],
  "rateLimit": {
    "requests": 1000,
    "window": 3600
  }
}

# Revogar chave
DELETE /api-keys/:keyId
X-API-Key: admin-key
```

## ⚙️ Configuração

### Variáveis de Ambiente

```bash
# Servidor
PORT=3007
HOST=0.0.0.0
NODE_ENV=production

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Redis (opcional)
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AWS SQS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
SQS_ENDPOINT=https://sqs.us-east-1.amazonaws.com

# Filas SQS
SQS_RAW_EVENTS_QUEUE=raw-events-queue
SQS_INCOMING_EVENTS_QUEUE=incoming-events-queue
SQS_VALIDATION_ERRORS_QUEUE=validation-errors-queue

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Métricas
METRICS_ENABLED=true
METRICS_PORT=9090
```

### Configuração Avançada

Edite `gatewayConfig.js` para configurações mais específicas:

```javascript
module.exports = {
  server: {
    port: process.env.PORT || 3007,
    timeout: 30000,
    maxPayloadSize: '10mb'
  },
  eventValidation: {
    strictValidation: true,
    maxEventSize: 1024 * 1024, // 1MB
    requiredFields: ['eventType', 'timestamp', 'source'],
    allowedEventTypes: /^[a-z]+\.[a-z]+$/
  },
  // ... mais configurações
};
```

## 🔒 Autenticação

### API Keys

O gateway usa API keys para autenticação:

```http
# Header preferido
X-API-Key: your-api-key

# Alternativa Bearer token
Authorization: Bearer your-api-key
```

### Permissões

- `events:write` - Enviar eventos
- `events:read` - Consultar eventos
- `keys:manage` - Gerenciar API keys
- `admin` - Acesso administrativo completo

### Rate Limiting

Cada API key tem limites configuráveis:

- **Requests por janela**: Número máximo de requisições
- **Janela de tempo**: Período em segundos
- **Burst limit**: Pico permitido de requisições

## 📊 Monitoramento

### Métricas Prometheus

Disponível em `/metrics`:

```
# Requisições HTTP
http_requests_total{method="POST",route="/events",status_code="200"} 1234
http_request_duration_seconds{method="POST",route="/events"} 0.045

# Eventos processados
events_processed_total{type="user.created",status="success"} 567
events_validation_errors_total{type="user.created"} 12

# Conexões ativas
active_connections 45

# Rate limiting
rate_limit_hits_total{key="client-123"} 89
```

### Logs Estruturados

```json
{
  "timestamp": "2023-12-07T10:00:00.000Z",
  "level": "info",
  "message": "Event processed successfully",
  "requestId": "req_123",
  "eventId": "evt_456",
  "eventType": "user.created",
  "processingTime": 45,
  "queueName": "incoming-events"
}
```

### Health Checks

```http
GET /health

{
  "status": "healthy",
  "timestamp": "2023-12-07T10:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "dependencies": {
    "sqs": "healthy",
    "redis": "healthy"
  }
}
```

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Testes com coverage
npm run test:coverage

# Testes de integração
npm run test:integration

# Testes em modo watch
npm run test:watch
```

### Estrutura de Testes

```
tests/
├── unit/
│   ├── services/
│   ├── routes/
│   └── middleware/
├── integration/
│   ├── api.test.js
│   └── sqs.test.js
└── performance/
    └── load.test.js
```

## 🐳 Docker

### Multi-stage Build

```bash
# Produção
docker build --target runtime -t gateway:prod .

# Desenvolvimento
docker build --target development -t gateway:dev .

# Testes
docker build --target testing -t gateway:test .
```

### Docker Compose

```yaml
version: '3.8'
services:
  gateway:
    build: .
    ports:
      - "3007:3007"
      - "9090:9090"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    depends_on:
      - redis
      - localstack
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  localstack:
    image: localstack/localstack
    ports:
      - "4566:4566"
    environment:
      - SERVICES=sqs
```

## 🔧 Desenvolvimento

### Setup Local

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento
npm run dev

# Linting
npm run lint
npm run lint:fix

# Formatação
npm run format
```

### Estrutura do Projeto

```
external-gateway/
├── index.js                 # Ponto de entrada
├── gatewayConfig.js         # Configurações
├── services/
│   ├── eventGatewayService.js
│   └── authService.js
├── routes/
│   └── gatewayRoutes.js
├── middleware/
│   └── gatewayMiddleware.js
├── tests/
│   └── gateway.test.js
├── package.json
├── Dockerfile
└── README.md
```

### Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📈 Performance

### Benchmarks

- **Throughput**: ~1000 eventos/segundo
- **Latência**: <50ms (P95)
- **Memória**: ~100MB (base)
- **CPU**: <10% (carga normal)

### Otimizações

- Connection pooling para Redis e SQS
- Batch processing para múltiplos eventos
- Compressão de resposta
- Cache de validação de API keys
- Rate limiting distribuído

## 🚨 Troubleshooting

### Problemas Comuns

**Gateway não inicia**
```bash
# Verificar logs
docker logs gateway-container

# Verificar configuração
node -e "console.log(require('./gatewayConfig.js'))"
```

**Eventos não são processados**
```bash
# Verificar conectividade SQS
aws sqs list-queues --endpoint-url http://localhost:4566

# Verificar logs de erro
curl http://localhost:3007/status
```

**Rate limiting muito restritivo**
```bash
# Ajustar configuração
export RATE_LIMIT_MAX_REQUESTS=1000
export RATE_LIMIT_WINDOW_MS=3600000
```

### Logs de Debug

```bash
# Habilitar logs detalhados
export LOG_LEVEL=debug
export DEBUG_REQUESTS=true

# Verificar métricas
curl http://localhost:9090/metrics | grep events
```

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🤝 Suporte

- **Issues**: [GitHub Issues](https://github.com/agentesautonomos/external-event-gateway/issues)
- **Documentação**: [Wiki](https://github.com/agentesautonomos/external-event-gateway/wiki)
- **Email**: suporte@agentesautonomos.com

---

**Versão**: 1.0.0  
**Última atualização**: Dezembro 2023