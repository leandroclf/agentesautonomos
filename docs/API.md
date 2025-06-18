# Documentação da API

Este documento fornece a especificação completa da API do sistema de agentes autônomos.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Autenticação](#autenticação)
- [Códigos de Status](#códigos-de-status)
- [Formato de Resposta](#formato-de-resposta)
- [Rate Limiting](#rate-limiting)
- [Interface Agent](#interface-agent)
- [Event Agent](#event-agent)
- [Planning Agent](#planning-agent)
- [Execution Agent](#execution-agent)
- [Webhooks](#webhooks)
- [Exemplos de Uso](#exemplos-de-uso)
- [SDKs e Bibliotecas](#sdks-e-bibliotecas)

## 🌐 Visão Geral

A API do sistema de agentes autônomos é baseada em REST e utiliza JSON para comunicação. Cada agente expõe endpoints específicos para suas funcionalidades.

### Base URLs

| Ambiente | URL Base |
|----------|----------|
| Desenvolvimento | `http://localhost:3000` |
| Staging | `https://staging-api.example.com` |
| Produção | `https://api.example.com` |

### Versioning

A API utiliza versionamento via header:
```
API-Version: v1
```

### Content-Type

Todos os endpoints esperam e retornam:
```
Content-Type: application/json
```

## 🔐 Autenticação

### JWT Bearer Token

```http
Authorization: Bearer <jwt-token>
```

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
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600,
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "role": "admin"
    }
  }
}
```

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh-token-here"
}
```

## 📊 Códigos de Status

| Código | Significado | Descrição |
|--------|-------------|----------|
| 200 | OK | Requisição bem-sucedida |
| 201 | Created | Recurso criado com sucesso |
| 202 | Accepted | Requisição aceita para processamento |
| 400 | Bad Request | Dados inválidos na requisição |
| 401 | Unauthorized | Token de autenticação inválido |
| 403 | Forbidden | Acesso negado |
| 404 | Not Found | Recurso não encontrado |
| 409 | Conflict | Conflito com estado atual |
| 422 | Unprocessable Entity | Dados válidos mas não processáveis |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Internal Server Error | Erro interno do servidor |
| 502 | Bad Gateway | Erro de comunicação entre serviços |
| 503 | Service Unavailable | Serviço temporariamente indisponível |

## 📝 Formato de Resposta

### Resposta de Sucesso

```json
{
  "success": true,
  "data": {
    // dados da resposta
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-123456",
    "version": "v1"
  }
}
```

### Resposta de Erro

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados de entrada inválidos",
    "details": [
      {
        "field": "email",
        "message": "Email é obrigatório"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-123456",
    "version": "v1"
  }
}
```

### Resposta Paginada

```json
{
  "success": true,
  "data": [
    // itens da página
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-123456",
    "version": "v1"
  }
}
```

## 🚦 Rate Limiting

### Limites por Endpoint

| Endpoint | Limite | Janela |
|----------|--------|--------|
| `/auth/*` | 5 req/min | Por IP |
| `/api/v1/*` | 1000 req/hour | Por usuário |
| `/webhooks/*` | 100 req/min | Por IP |

### Headers de Rate Limit

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
X-RateLimit-Window: 3600
```

## 🎯 Interface Agent

**Base URL**: `http://localhost:3000` (desenvolvimento)

### Health Check

```http
GET /health
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "uptime": 3600,
    "version": "1.0.0",
    "dependencies": {
      "sqs": "healthy",
      "event-agent": "healthy",
      "planning-agent": "healthy",
      "execution-agent": "healthy"
    }
  }
}
```

### Readiness Check

```http
GET /ready
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "ready": true,
    "checks": {
      "database": true,
      "sqs": true,
      "dependencies": true
    }
  }
}
```

### Métricas

```http
GET /metrics
```

**Resposta:** Formato Prometheus
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1234

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 100
```

### Processar Evento

```http
POST /api/v1/events
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "user_action",
  "source": "web_app",
  "data": {
    "userId": "user-123",
    "action": "button_click",
    "metadata": {
      "buttonId": "submit-form",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  },
  "priority": "normal",
  "correlationId": "corr-123456"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "eventId": "evt-789012",
    "status": "accepted",
    "estimatedProcessingTime": 5000,
    "queuePosition": 3
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-123456",
    "version": "v1"
  }
}
```

### Consultar Status do Evento

```http
GET /api/v1/events/{eventId}
Authorization: Bearer <token>
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "eventId": "evt-789012",
    "status": "processing",
    "progress": 65,
    "stages": [
      {
        "name": "validation",
        "status": "completed",
        "duration": 100
      },
      {
        "name": "planning",
        "status": "completed",
        "duration": 1500
      },
      {
        "name": "execution",
        "status": "in_progress",
        "progress": 65
      }
    ],
    "result": null,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:32:30Z"
  }
}
```

### Listar Eventos

```http
GET /api/v1/events?page=1&limit=20&status=completed&type=user_action
Authorization: Bearer <token>
```

**Parâmetros de Query:**
- `page` (int): Número da página (padrão: 1)
- `limit` (int): Itens por página (padrão: 20, máx: 100)
- `status` (string): Filtrar por status (`pending`, `processing`, `completed`, `failed`)
- `type` (string): Filtrar por tipo de evento
- `source` (string): Filtrar por fonte
- `startDate` (ISO 8601): Data inicial
- `endDate` (ISO 8601): Data final

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "eventId": "evt-789012",
      "type": "user_action",
      "status": "completed",
      "createdAt": "2024-01-15T10:30:00Z",
      "completedAt": "2024-01-15T10:33:00Z",
      "duration": 180000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Cancelar Evento

```http
DELETE /api/v1/events/{eventId}
Authorization: Bearer <token>
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "eventId": "evt-789012",
    "status": "cancelled",
    "cancelledAt": "2024-01-15T10:35:00Z"
  }
}
```

## 📡 Event Agent

**Base URL**: `http://localhost:3001` (desenvolvimento)

### Health Check

```http
GET /health
```

### Processar Evento Interno

```http
POST /api/v1/process
Content-Type: application/json

{
  "eventId": "evt-789012",
  "type": "user_action",
  "data": {
    "userId": "user-123",
    "action": "button_click"
  },
  "metadata": {
    "source": "interface-agent",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "processId": "proc-456789",
    "status": "processing",
    "analysis": {
      "complexity": "medium",
      "estimatedDuration": 120000,
      "requiredAgents": ["planning", "execution"]
    }
  }
}
```

### Consultar Análise de Evento

```http
GET /api/v1/analysis/{eventId}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "eventId": "evt-789012",
    "analysis": {
      "type": "user_action",
      "complexity": "medium",
      "patterns": [
        {
          "name": "frequent_user",
          "confidence": 0.85
        },
        {
          "name": "form_submission",
          "confidence": 0.92
        }
      ],
      "recommendations": [
        {
          "action": "prioritize_processing",
          "reason": "High-value user action"
        }
      ],
      "metadata": {
        "processingTime": 250,
        "rulesApplied": 12
      }
    }
  }
}
```

### Estatísticas de Processamento

```http
GET /api/v1/stats?period=24h
```

**Parâmetros:**
- `period`: `1h`, `24h`, `7d`, `30d`

**Resposta:**
```json
{
  "success": true,
  "data": {
    "period": "24h",
    "totalEvents": 1250,
    "processedEvents": 1200,
    "failedEvents": 50,
    "averageProcessingTime": 1500,
    "eventTypes": {
      "user_action": 800,
      "system_event": 300,
      "external_webhook": 150
    },
    "complexityDistribution": {
      "low": 600,
      "medium": 500,
      "high": 150
    }
  }
}
```

## 🧠 Planning Agent

**Base URL**: `http://localhost:3002` (desenvolvimento)

### Health Check

```http
GET /health
```

### Criar Plano

```http
POST /api/v1/plans
Content-Type: application/json

{
  "eventId": "evt-789012",
  "context": {
    "userId": "user-123",
    "action": "button_click",
    "metadata": {
      "buttonId": "submit-form",
      "formData": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  },
  "constraints": {
    "maxDuration": 300000,
    "priority": "normal",
    "resources": ["database", "email_service"]
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "planId": "plan-345678",
    "status": "created",
    "steps": [
      {
        "id": "step-1",
        "name": "validate_form_data",
        "type": "validation",
        "order": 1,
        "estimatedDuration": 500,
        "dependencies": [],
        "parameters": {
          "schema": "user_registration",
          "data": {
            "name": "John Doe",
            "email": "john@example.com"
          }
        }
      },
      {
        "id": "step-2",
        "name": "save_user_data",
        "type": "database_operation",
        "order": 2,
        "estimatedDuration": 1000,
        "dependencies": ["step-1"],
        "parameters": {
          "table": "users",
          "operation": "insert"
        }
      },
      {
        "id": "step-3",
        "name": "send_welcome_email",
        "type": "notification",
        "order": 3,
        "estimatedDuration": 2000,
        "dependencies": ["step-2"],
        "parameters": {
          "template": "welcome_email",
          "recipient": "john@example.com"
        }
      }
    ],
    "totalEstimatedDuration": 3500,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Consultar Plano

```http
GET /api/v1/plans/{planId}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "planId": "plan-345678",
    "eventId": "evt-789012",
    "status": "approved",
    "steps": [
      // array de steps como acima
    ],
    "execution": {
      "startedAt": "2024-01-15T10:31:00Z",
      "currentStep": "step-2",
      "progress": 66,
      "completedSteps": ["step-1"],
      "failedSteps": []
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:31:30Z"
  }
}
```

### Atualizar Plano

```http
PUT /api/v1/plans/{planId}
Content-Type: application/json

{
  "steps": [
    {
      "id": "step-1",
      "name": "validate_form_data",
      "parameters": {
        "schema": "user_registration_v2"
      }
    }
  ]
}
```

### Aprovar Plano

```http
POST /api/v1/plans/{planId}/approve
Content-Type: application/json

{
  "approvedBy": "system",
  "notes": "Plan approved automatically"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "planId": "plan-345678",
    "status": "approved",
    "approvedAt": "2024-01-15T10:31:00Z",
    "approvedBy": "system"
  }
}
```

### Listar Planos

```http
GET /api/v1/plans?status=approved&page=1&limit=20
```

**Parâmetros:**
- `status`: `draft`, `pending`, `approved`, `rejected`, `executing`, `completed`
- `eventId`: Filtrar por evento
- `page`, `limit`: Paginação

## ⚡ Execution Agent

**Base URL**: `http://localhost:3003` (desenvolvimento)

### Health Check

```http
GET /health
```

### Executar Plano

```http
POST /api/v1/executions
Content-Type: application/json

{
  "planId": "plan-345678",
  "priority": "normal",
  "options": {
    "dryRun": false,
    "timeout": 300000,
    "retryPolicy": {
      "maxRetries": 3,
      "backoffMultiplier": 2
    }
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "executionId": "exec-567890",
    "planId": "plan-345678",
    "status": "running",
    "startedAt": "2024-01-15T10:32:00Z",
    "progress": {
      "currentStep": "step-1",
      "completedSteps": 0,
      "totalSteps": 3,
      "percentage": 0
    }
  }
}
```

### Consultar Execução

```http
GET /api/v1/executions/{executionId}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "executionId": "exec-567890",
    "planId": "plan-345678",
    "status": "running",
    "startedAt": "2024-01-15T10:32:00Z",
    "progress": {
      "currentStep": "step-2",
      "completedSteps": 1,
      "totalSteps": 3,
      "percentage": 33
    },
    "steps": [
      {
        "id": "step-1",
        "status": "completed",
        "startedAt": "2024-01-15T10:32:00Z",
        "completedAt": "2024-01-15T10:32:05Z",
        "duration": 5000,
        "result": {
          "success": true,
          "data": {
            "validationPassed": true
          }
        }
      },
      {
        "id": "step-2",
        "status": "running",
        "startedAt": "2024-01-15T10:32:05Z",
        "progress": 50
      },
      {
        "id": "step-3",
        "status": "pending"
      }
    ]
  }
}
```

### Pausar Execução

```http
POST /api/v1/executions/{executionId}/pause
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "executionId": "exec-567890",
    "status": "paused",
    "pausedAt": "2024-01-15T10:33:00Z"
  }
}
```

### Retomar Execução

```http
POST /api/v1/executions/{executionId}/resume
```

### Cancelar Execução

```http
POST /api/v1/executions/{executionId}/cancel
Content-Type: application/json

{
  "reason": "User requested cancellation"
}
```

### Listar Execuções

```http
GET /api/v1/executions?status=running&page=1&limit=20
```

### Logs de Execução

```http
GET /api/v1/executions/{executionId}/logs?level=info&limit=100
```

**Parâmetros:**
- `level`: `debug`, `info`, `warn`, `error`
- `limit`: Número máximo de logs (padrão: 100)
- `offset`: Offset para paginação

**Resposta:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": "2024-01-15T10:32:00Z",
        "level": "info",
        "message": "Starting execution of plan plan-345678",
        "stepId": null,
        "metadata": {
          "executionId": "exec-567890"
        }
      },
      {
        "timestamp": "2024-01-15T10:32:01Z",
        "level": "info",
        "message": "Starting step step-1: validate_form_data",
        "stepId": "step-1",
        "metadata": {
          "stepType": "validation"
        }
      }
    ],
    "pagination": {
      "limit": 100,
      "offset": 0,
      "total": 25
    }
  }
}
```

## 🔗 Webhooks

### Configurar Webhook

```http
POST /api/v1/webhooks
Content-Type: application/json
Authorization: Bearer <token>

{
  "url": "https://your-app.com/webhooks/agents",
  "events": ["event.completed", "execution.failed"],
  "secret": "webhook-secret-key",
  "active": true,
  "retryPolicy": {
    "maxRetries": 3,
    "backoffMultiplier": 2
  }
}
```

### Eventos Disponíveis

- `event.created`
- `event.processing`
- `event.completed`
- `event.failed`
- `plan.created`
- `plan.approved`
- `plan.rejected`
- `execution.started`
- `execution.completed`
- `execution.failed`
- `execution.paused`
- `execution.resumed`
- `execution.cancelled`

### Formato do Webhook

```json
{
  "id": "webhook-123456",
  "event": "execution.completed",
  "timestamp": "2024-01-15T10:35:00Z",
  "data": {
    "executionId": "exec-567890",
    "planId": "plan-345678",
    "eventId": "evt-789012",
    "status": "completed",
    "duration": 180000,
    "result": {
      "success": true,
      "completedSteps": 3,
      "failedSteps": 0
    }
  },
  "signature": "sha256=abc123..."
}
```

### Verificação de Assinatura

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = 'sha256=' + 
    crypto.createHmac('sha256', secret)
          .update(payload)
          .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

## 💡 Exemplos de Uso

### Fluxo Completo: Processamento de Formulário

```javascript
// 1. Enviar evento para Interface Agent
const eventResponse = await fetch('http://localhost:3000/api/v1/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    type: 'form_submission',
    source: 'web_app',
    data: {
      formId: 'user-registration',
      fields: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890'
      }
    },
    priority: 'normal'
  })
});

const { data: { eventId } } = await eventResponse.json();

// 2. Monitorar progresso
const checkProgress = async () => {
  const response = await fetch(`http://localhost:3000/api/v1/events/${eventId}`, {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });
  
  const { data } = await response.json();
  console.log(`Status: ${data.status}, Progress: ${data.progress}%`);
  
  if (data.status === 'completed') {
    console.log('Processamento concluído:', data.result);
  } else if (data.status === 'failed') {
    console.error('Processamento falhou:', data.error);
  } else {
    setTimeout(checkProgress, 2000); // Verificar novamente em 2s
  }
};

checkProgress();
```

### Processamento em Lote

```javascript
// Processar múltiplos eventos
const events = [
  { type: 'user_action', data: { userId: 'user-1', action: 'login' } },
  { type: 'user_action', data: { userId: 'user-2', action: 'purchase' } },
  { type: 'system_event', data: { type: 'backup_completed' } }
];

const processEvents = async (events) => {
  const promises = events.map(event => 
    fetch('http://localhost:3000/api/v1/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(event)
    })
  );
  
  const responses = await Promise.all(promises);
  const results = await Promise.all(
    responses.map(r => r.json())
  );
  
  return results.map(r => r.data.eventId);
};

const eventIds = await processEvents(events);
console.log('Eventos criados:', eventIds);
```

### Monitoramento em Tempo Real

```javascript
// WebSocket para atualizações em tempo real (se disponível)
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // Subscrever a eventos específicos
  ws.send(JSON.stringify({
    type: 'subscribe',
    events: ['execution.completed', 'execution.failed']
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Atualização em tempo real:', data);
};

// Alternativa: Polling
const pollEvents = async () => {
  const response = await fetch('http://localhost:3000/api/v1/events?status=processing', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  const { data } = await response.json();
  console.log(`${data.length} eventos em processamento`);
};

setInterval(pollEvents, 5000); // Poll a cada 5 segundos
```

## 📚 SDKs e Bibliotecas

### JavaScript/Node.js SDK

```bash
npm install @agents/sdk
```

```javascript
const { AgentsClient } = require('@agents/sdk');

const client = new AgentsClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// Processar evento
const event = await client.events.create({
  type: 'user_action',
  data: { userId: 'user-123' }
});

// Monitorar progresso
const status = await client.events.get(event.eventId);
console.log(status);
```

### Python SDK

```bash
pip install agents-sdk
```

```python
from agents_sdk import AgentsClient

client = AgentsClient(
    base_url='http://localhost:3000',
    api_key='your-api-key'
)

# Processar evento
event = client.events.create({
    'type': 'user_action',
    'data': {'userId': 'user-123'}
})

# Monitorar progresso
status = client.events.get(event['eventId'])
print(status)
```

### cURL Examples

```bash
# Criar evento
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "user_action",
    "data": {
      "userId": "user-123",
      "action": "button_click"
    }
  }'

# Consultar status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/events/evt-789012

# Listar eventos
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/events?page=1&limit=10&status=completed"
```

## 🔍 Debugging e Logs

### Headers de Debug

```http
X-Debug-Mode: true
X-Trace-Id: trace-123456
```

### Logs Estruturados

Todos os endpoints retornam logs estruturados nos headers de resposta:

```http
X-Request-Id: req-123456
X-Processing-Time: 1500
X-Agent-Version: 1.0.0
X-Trace-Id: trace-123456
```

### Endpoint de Debug

```http
GET /debug/info
Authorization: Bearer <admin-token>
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "environment": "development",
    "uptime": 3600,
    "memory": {
      "used": "150MB",
      "total": "512MB"
    },
    "connections": {
      "sqs": "connected",
      "database": "connected"
    },
    "queues": {
      "interface-events": {
        "messages": 5,
        "inFlight": 2
      }
    }
  }
}
```

---

**Última atualização**: $(date)
**Versão da API**: v1
**Documentação**: [Swagger/OpenAPI](./openapi.yaml)

Para mais informações:
- [Guia de Desenvolvimento](./DEVELOPMENT.md)
- [Arquitetura](./ARCHITECTURE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)