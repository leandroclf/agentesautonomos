# Documentação da API

## Visão Geral

A API do sistema de agentes autônomos fornece endpoints para interação com os agentes, monitoramento do sistema e gerenciamento de configurações.

## Base URL

- **Desenvolvimento**: `http://localhost:3000`
- **Produção**: `https://your-domain.com`

## Autenticação

A API utiliza autenticação baseada em JWT tokens.

### Obter Token

```http
POST /auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "password123"
}
```

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": "123",
    "username": "user@example.com",
    "roles": ["user"]
  }
}
```

### Usar Token

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Endpoints

### Interface Agent

#### Enviar Requisição

```http
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
```

**Resposta:**
```json
{
  "requestId": "req-123456789",
  "status": "accepted",
  "message": "Request queued for processing",
  "estimatedTime": 30,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Verificar Status

```http
GET /api/v1/interface/request/{requestId}
Authorization: Bearer {token}
```

**Resposta:**
```json
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
```

#### WebSocket

```javascript
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
```

### Planning Agent

#### Criar Plano

```http
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
```

**Resposta:**
```json
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
```

### Execution Agent

#### Executar Tarefa

```http
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
```

**Resposta:**
```json
{
  "executionId": "exec-456",
  "taskId": "task-123",
  "status": "running",
  "startedAt": "2024-01-15T10:30:00Z",
  "estimatedCompletion": "2024-01-15T10:31:00Z"
}
```

### Monitoring

#### Health Check

```http
GET /health
```

**Resposta:**
```json
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
```

#### Métricas

```http
GET /metrics?format=json
```

**Resposta:**
```json
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
    "http_requests_total{method="GET",status="200"}": {
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
```

#### Métricas Prometheus

```http
GET /metrics?format=prometheus
```

**Resposta:**
```
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1250
http_requests_total{method="POST",status="200"} 850
http_requests_total{method="GET",status="404"} 25

# TYPE message_processing_duration histogram
message_processing_duration_count 500
message_processing_duration_sum 75000
```

#### Alertas Ativos

```http
GET /alerts
```

**Resposta:**
```json
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
```

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
  - `X-RateLimit-Limit`: Limite total
  - `X-RateLimit-Remaining`: Requisições restantes
  - `X-RateLimit-Reset`: Timestamp do reset

## Paginação

Endpoints que retornam listas suportam paginação:

```http
GET /api/v1/requests?page=2&limit=50&sort=createdAt&order=desc
```

**Parâmetros:**
- `page`: Número da página (padrão: 1)
- `limit`: Itens por página (padrão: 20, máximo: 100)
- `sort`: Campo para ordenação
- `order`: Direção da ordenação (asc/desc)

**Resposta:**
```json
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
```

## Filtros

Muitos endpoints suportam filtros:

```http
GET /api/v1/requests?status=completed&agent=execution-agent&from=2024-01-01&to=2024-01-31
```

## Webhooks

O sistema pode enviar notificações via webhooks:

### Configurar Webhook

```http
POST /api/v1/webhooks
Authorization: Bearer {token}
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["request.completed", "request.failed"],
  "secret": "your-webhook-secret"
}
```

### Payload do Webhook

```json
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
```

## SDKs e Bibliotecas

### JavaScript/Node.js

```javascript
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
```

### Python

```python
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
```

## Exemplos de Uso

### Processamento de Dados

```javascript
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
  const response = await fetch(`/api/v1/interface/request/${requestId}`, {
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
```

### Workflow Complexo

```javascript
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
```

---

**Próximos Passos**:
1. [Deployment](../deployment/README.md)
2. [Monitoramento](../monitoring/README.md)
3. [Troubleshooting](../troubleshooting/README.md)
