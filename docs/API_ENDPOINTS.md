# API e Endpoints do Sistema

## 📋 Sumário

- [Visão Geral da API](#visão-geral-da-api)
- [Autenticação e Autorização](#autenticação-e-autorização)
- [Interface Agent API](#interface-agent-api)
- [Event Agent API](#event-agent-api)
- [Planning Agent API](#planning-agent-api)
- [Execution Agent API](#execution-agent-api)
- [State Management API](#state-management-api)
- [Monitoring API](#monitoring-api)
- [Health Check API](#health-check-api)
- [Códigos de Status](#códigos-de-status)
- [Exemplos de Uso](#exemplos-de-uso)
- [SDKs e Clientes](#sdks-e-clientes)

## 🌐 Visão Geral da API

### Arquitetura da API

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │───▶│ Interface Agent │───▶│   Event Agent   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Planning Agent  │◄───│ Execution Agent │
                       └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────────────────────────────┐
                       │        State Management Agent          │
                       └─────────────────────────────────────────┘
```

### Características Gerais

| Característica | Valor |
|----------------|-------|
| **Protocolo** | HTTP/HTTPS |
| **Formato** | JSON |
| **Autenticação** | JWT Bearer Token |
| **Rate Limiting** | 100 req/min por IP |
| **Versionamento** | Header `API-Version` |
| **CORS** | Configurável |
| **Compressão** | gzip |

### Headers Padrão

```http
Content-Type: application/json
Authorization: Bearer <jwt-token>
API-Version: v1
X-Request-ID: <uuid>
User-Agent: <client-info>
```

### Estrutura de Resposta Padrão

```json
{
  "success": true,
  "data": {},
  "message": "Operação realizada com sucesso",
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "version": "v1"
}
```

### Estrutura de Erro Padrão

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
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## 🔐 Autenticação e Autorização

### Obtenção de Token

**POST** `/auth/login`

```json
// Request
{
  "username": "admin",
  "password": "senha123"
}

// Response
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "24h",
    "user": {
      "id": "123",
      "username": "admin",
      "roles": ["admin", "operator"]
    }
  }
}
```

### Renovação de Token

**POST** `/auth/refresh`

```json
// Request
{
  "refreshToken": "refresh-token-here"
}

// Response
{
  "success": true,
  "data": {
    "token": "new-jwt-token",
    "expiresIn": "24h"
  }
}
```

### Logout

**POST** `/auth/logout`

```json
// Request
{
  "token": "jwt-token-to-invalidate"
}

// Response
{
  "success": true,
  "message": "Logout realizado com sucesso"
}
```

## 🚪 Interface Agent API

**Base URL**: `http://localhost:3001`

### Submissão de Eventos

**POST** `/events`

Submete um novo evento para processamento pelo sistema.

```json
// Request
{
  "type": "user_action",
  "payload": {
    "action": "create_order",
    "userId": "user123",
    "productId": "prod456",
    "quantity": 2
  },
  "metadata": {
    "source": "web_app",
    "userAgent": "Mozilla/5.0...",
    "ip": "192.168.1.100"
  },
  "priority": "normal",
  "correlationId": "order-123-456"
}

// Response
{
  "success": true,
  "data": {
    "eventId": "evt_550e8400-e29b-41d4-a716-446655440000",
    "status": "accepted",
    "estimatedProcessingTime": "2-5 seconds"
  },
  "message": "Evento aceito para processamento"
}
```

### Consulta de Status de Evento

**GET** `/events/{eventId}/status`

```json
// Response
{
  "success": true,
  "data": {
    "eventId": "evt_550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "currentStage": "planning",
    "progress": 45,
    "estimatedCompletion": "2024-01-15T10:32:00Z",
    "stages": [
      {
        "name": "validation",
        "status": "completed",
        "completedAt": "2024-01-15T10:30:15Z"
      },
      {
        "name": "enrichment",
        "status": "completed",
        "completedAt": "2024-01-15T10:30:30Z"
      },
      {
        "name": "planning",
        "status": "in_progress",
        "startedAt": "2024-01-15T10:30:45Z"
      },
      {
        "name": "execution",
        "status": "pending"
      }
    ]
  }
}
```

### Submissão em Lote

**POST** `/events/batch`

```json
// Request
{
  "events": [
    {
      "type": "user_action",
      "payload": { /* evento 1 */ }
    },
    {
      "type": "system_event",
      "payload": { /* evento 2 */ }
    }
  ],
  "batchId": "batch_123",
  "processingMode": "parallel"
}

// Response
{
  "success": true,
  "data": {
    "batchId": "batch_123",
    "acceptedEvents": 2,
    "rejectedEvents": 0,
    "events": [
      {
        "eventId": "evt_1",
        "status": "accepted"
      },
      {
        "eventId": "evt_2",
        "status": "accepted"
      }
    ]
  }
}
```

## 📥 Event Agent API

**Base URL**: `http://localhost:3002`

### Consulta de Eventos Processados

**GET** `/events`

```json
// Query Parameters
// ?type=user_action&status=completed&limit=10&offset=0&startDate=2024-01-01&endDate=2024-01-31

// Response
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "evt_123",
        "type": "user_action",
        "status": "completed",
        "createdAt": "2024-01-15T10:30:00Z",
        "completedAt": "2024-01-15T10:32:15Z",
        "processingTime": 135000,
        "payload": { /* dados do evento */ }
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 10,
      "offset": 0,
      "hasNext": true
    }
  }
}
```

### Estatísticas de Processamento

**GET** `/events/stats`

```json
// Response
{
  "success": true,
  "data": {
    "totalEvents": 1250,
    "eventsToday": 45,
    "averageProcessingTime": 2.3,
    "successRate": 98.5,
    "byType": {
      "user_action": 800,
      "system_event": 350,
      "external_webhook": 100
    },
    "byStatus": {
      "completed": 1200,
      "failed": 25,
      "processing": 15,
      "pending": 10
    },
    "hourlyDistribution": [
      { "hour": 0, "count": 5 },
      { "hour": 1, "count": 3 },
      /* ... */
    ]
  }
}
```

### Reprocessamento de Eventos

**POST** `/events/{eventId}/reprocess`

```json
// Request
{
  "reason": "Manual reprocessing due to temporary failure",
  "resetState": true
}

// Response
{
  "success": true,
  "data": {
    "eventId": "evt_123",
    "newProcessingId": "proc_456",
    "status": "queued_for_reprocessing"
  }
}
```

## 🧠 Planning Agent API

**Base URL**: `http://localhost:3003`

### Criação de Plano

**POST** `/plans`

```json
// Request
{
  "eventId": "evt_123",
  "objectives": [
    {
      "type": "create_order",
      "priority": "high",
      "constraints": {
        "maxExecutionTime": 300,
        "requiredResources": ["database", "payment_service"]
      }
    }
  ],
  "context": {
    "userId": "user123",
    "sessionId": "sess456"
  }
}

// Response
{
  "success": true,
  "data": {
    "planId": "plan_789",
    "status": "created",
    "estimatedExecutionTime": 45,
    "complexity": "medium",
    "tasks": [
      {
        "id": "task_1",
        "type": "validate_user",
        "order": 1,
        "estimatedDuration": 5,
        "dependencies": []
      },
      {
        "id": "task_2",
        "type": "check_inventory",
        "order": 2,
        "estimatedDuration": 10,
        "dependencies": ["task_1"]
      },
      {
        "id": "task_3",
        "type": "process_payment",
        "order": 3,
        "estimatedDuration": 15,
        "dependencies": ["task_2"]
      },
      {
        "id": "task_4",
        "type": "create_order_record",
        "order": 4,
        "estimatedDuration": 10,
        "dependencies": ["task_3"]
      },
      {
        "id": "task_5",
        "type": "send_confirmation",
        "order": 5,
        "estimatedDuration": 5,
        "dependencies": ["task_4"]
      }
    ],
    "executionStrategy": "sequential_with_parallel_opportunities"
  }
}
```

### Consulta de Plano

**GET** `/plans/{planId}`

```json
// Response
{
  "success": true,
  "data": {
    "planId": "plan_789",
    "status": "executing",
    "createdAt": "2024-01-15T10:30:00Z",
    "startedAt": "2024-01-15T10:30:30Z",
    "progress": {
      "completedTasks": 3,
      "totalTasks": 5,
      "percentage": 60
    },
    "currentTask": {
      "id": "task_4",
      "type": "create_order_record",
      "status": "executing",
      "startedAt": "2024-01-15T10:31:15Z"
    },
    "beliefs": {
      "user_validated": true,
      "inventory_available": true,
      "payment_processed": true
    },
    "desires": [
      "complete_order_creation",
      "notify_user"
    ],
    "intentions": [
      "execute_remaining_tasks",
      "monitor_execution"
    ]
  }
}
```

### Otimização de Plano

**POST** `/plans/{planId}/optimize`

```json
// Request
{
  "criteria": ["execution_time", "resource_usage"],
  "constraints": {
    "maxExecutionTime": 60,
    "availableResources": ["database", "payment_service", "notification_service"]
  }
}

// Response
{
  "success": true,
  "data": {
    "originalPlan": {
      "estimatedTime": 45,
      "resourceUsage": "medium"
    },
    "optimizedPlan": {
      "estimatedTime": 35,
      "resourceUsage": "medium",
      "optimizations": [
        "parallel_execution_of_task_2_and_task_3",
        "cached_user_validation"
      ]
    },
    "improvementPercentage": 22.2
  }
}
```

## ⚙️ Execution Agent API

**Base URL**: `http://localhost:3004`

### Execução de Plano

**POST** `/executions`

```json
// Request
{
  "planId": "plan_789",
  "executionMode": "normal",
  "options": {
    "dryRun": false,
    "continueOnError": false,
    "timeout": 300
  }
}

// Response
{
  "success": true,
  "data": {
    "executionId": "exec_456",
    "planId": "plan_789",
    "status": "started",
    "startedAt": "2024-01-15T10:30:00Z",
    "estimatedCompletion": "2024-01-15T10:30:45Z"
  }
}
```

### Status de Execução

**GET** `/executions/{executionId}`

```json
// Response
{
  "success": true,
  "data": {
    "executionId": "exec_456",
    "planId": "plan_789",
    "status": "executing",
    "startedAt": "2024-01-15T10:30:00Z",
    "progress": {
      "completedTasks": 3,
      "totalTasks": 5,
      "percentage": 60,
      "currentTask": {
        "id": "task_4",
        "name": "create_order_record",
        "status": "executing",
        "startedAt": "2024-01-15T10:30:35Z",
        "progress": 75
      }
    },
    "completedTasks": [
      {
        "id": "task_1",
        "name": "validate_user",
        "status": "completed",
        "result": { "valid": true, "userId": "user123" },
        "executionTime": 3.2
      },
      {
        "id": "task_2",
        "name": "check_inventory",
        "status": "completed",
        "result": { "available": true, "quantity": 10 },
        "executionTime": 8.7
      },
      {
        "id": "task_3",
        "name": "process_payment",
        "status": "completed",
        "result": { "transactionId": "txn_789", "amount": 99.99 },
        "executionTime": 12.1
      }
    ],
    "metrics": {
      "totalExecutionTime": 24.0,
      "averageTaskTime": 8.0,
      "resourceUsage": {
        "cpu": 45,
        "memory": 128,
        "network": 15
      }
    }
  }
}
```

### Pausar/Retomar Execução

**POST** `/executions/{executionId}/pause`

```json
// Response
{
  "success": true,
  "data": {
    "executionId": "exec_456",
    "status": "paused",
    "pausedAt": "2024-01-15T10:30:45Z",
    "currentTask": "task_4",
    "canResume": true
  }
}
```

**POST** `/executions/{executionId}/resume`

```json
// Response
{
  "success": true,
  "data": {
    "executionId": "exec_456",
    "status": "executing",
    "resumedAt": "2024-01-15T10:31:00Z"
  }
}
```

### Cancelar Execução

**POST** `/executions/{executionId}/cancel`

```json
// Request
{
  "reason": "User requested cancellation",
  "rollback": true
}

// Response
{
  "success": true,
  "data": {
    "executionId": "exec_456",
    "status": "cancelled",
    "cancelledAt": "2024-01-15T10:31:00Z",
    "rollbackStatus": "in_progress"
  }
}
```

## 🗄️ State Management API

**Base URL**: `http://localhost:3005`

### Consultar Estado

**GET** `/state/{agentId}/{key}`

```json
// Response
{
  "success": true,
  "data": {
    "agentId": "planning-agent",
    "key": "user_preferences",
    "value": {
      "userId": "user123",
      "preferences": {
        "language": "pt-BR",
        "notifications": true,
        "theme": "dark"
      }
    },
    "version": 3,
    "lastUpdated": "2024-01-15T10:30:00Z",
    "ttl": 3600
  }
}
```

### Atualizar Estado

**PUT** `/state/{agentId}/{key}`

```json
// Request
{
  "value": {
    "userId": "user123",
    "preferences": {
      "language": "en-US",
      "notifications": false,
      "theme": "light"
    }
  },
  "ttl": 7200,
  "version": 3
}

// Response
{
  "success": true,
  "data": {
    "agentId": "planning-agent",
    "key": "user_preferences",
    "version": 4,
    "updatedAt": "2024-01-15T10:35:00Z"
  }
}
```

### Histórico de Estado

**GET** `/state/{agentId}/{key}/history`

```json
// Response
{
  "success": true,
  "data": {
    "agentId": "planning-agent",
    "key": "user_preferences",
    "history": [
      {
        "version": 4,
        "value": { /* estado atual */ },
        "updatedAt": "2024-01-15T10:35:00Z",
        "updatedBy": "system"
      },
      {
        "version": 3,
        "value": { /* estado anterior */ },
        "updatedAt": "2024-01-15T10:30:00Z",
        "updatedBy": "user123"
      }
    ],
    "totalVersions": 4
  }
}
```

## 📊 Monitoring API

**Base URL**: `http://localhost:3000`

### Métricas do Sistema

**GET** `/metrics`

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health",status_code="200"} 1250
http_requests_total{method="POST",route="/events",status_code="200"} 890

# HELP event_processing_duration_seconds Event processing duration
# TYPE event_processing_duration_seconds histogram
event_processing_duration_seconds_bucket{agent="event-agent",event_type="user_action",le="0.1"} 45
event_processing_duration_seconds_bucket{agent="event-agent",event_type="user_action",le="0.5"} 120

# HELP active_connections_total Number of active connections
# TYPE active_connections_total gauge
active_connections_total{type="database"} 15
active_connections_total{type="redis"} 8
active_connections_total{type="sqs"} 12
```

### Status do Sistema

**GET** `/status`

```json
{
  "success": true,
  "data": {
    "system": {
      "status": "healthy",
      "uptime": 86400,
      "version": "1.0.0",
      "environment": "production"
    },
    "agents": {
      "interface-agent": {
        "status": "healthy",
        "uptime": 86400,
        "requestsPerMinute": 45,
        "averageResponseTime": 120
      },
      "event-agent": {
        "status": "healthy",
        "uptime": 86400,
        "eventsProcessed": 1250,
        "averageProcessingTime": 2300
      },
      "planning-agent": {
        "status": "healthy",
        "uptime": 86400,
        "plansCreated": 450,
        "averagePlanningTime": 1800
      },
      "execution-agent": {
        "status": "healthy",
        "uptime": 86400,
        "executionsCompleted": 420,
        "averageExecutionTime": 15000
      }
    },
    "infrastructure": {
      "database": {
        "status": "healthy",
        "connections": 15,
        "responseTime": 5
      },
      "redis": {
        "status": "healthy",
        "connections": 8,
        "memoryUsage": "45%"
      },
      "sqs": {
        "status": "healthy",
        "queues": {
          "interface-agent-requests": {
            "messagesVisible": 0,
            "messagesInFlight": 2
          },
          "event-agent-processing": {
            "messagesVisible": 1,
            "messagesInFlight": 5
          }
        }
      }
    }
  }
}
```

## 🏥 Health Check API

### Health Check Geral

**GET** `/health`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "checks": {
      "database": {
        "status": "healthy",
        "responseTime": 5,
        "lastCheck": "2024-01-15T10:29:55Z"
      },
      "redis": {
        "status": "healthy",
        "responseTime": 2,
        "lastCheck": "2024-01-15T10:29:55Z"
      },
      "sqs": {
        "status": "healthy",
        "responseTime": 8,
        "lastCheck": "2024-01-15T10:29:55Z"
      }
    }
  }
}
```

### Health Check Detalhado

**GET** `/health/detailed`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "system": {
      "uptime": 86400,
      "memory": {
        "used": "512MB",
        "total": "2GB",
        "percentage": 25
      },
      "cpu": {
        "usage": 45,
        "loadAverage": [0.5, 0.7, 0.8]
      },
      "disk": {
        "used": "10GB",
        "total": "100GB",
        "percentage": 10
      }
    },
    "dependencies": {
      "database": {
        "status": "healthy",
        "responseTime": 5,
        "connections": {
          "active": 15,
          "idle": 5,
          "total": 20
        },
        "lastQuery": "2024-01-15T10:29:58Z"
      },
      "redis": {
        "status": "healthy",
        "responseTime": 2,
        "memory": {
          "used": "128MB",
          "max": "512MB"
        },
        "connections": 8
      },
      "sqs": {
        "status": "healthy",
        "responseTime": 8,
        "queues": {
          "total": 6,
          "healthy": 6,
          "unhealthy": 0
        }
      }
    }
  }
}
```

## 📋 Códigos de Status

### Códigos HTTP

| Código | Significado | Uso |
|--------|-------------|-----|
| **200** | OK | Operação bem-sucedida |
| **201** | Created | Recurso criado com sucesso |
| **202** | Accepted | Requisição aceita para processamento |
| **400** | Bad Request | Dados de entrada inválidos |
| **401** | Unauthorized | Token de autenticação inválido |
| **403** | Forbidden | Acesso negado |
| **404** | Not Found | Recurso não encontrado |
| **409** | Conflict | Conflito de estado |
| **422** | Unprocessable Entity | Dados válidos mas não processáveis |
| **429** | Too Many Requests | Rate limit excedido |
| **500** | Internal Server Error | Erro interno do servidor |
| **502** | Bad Gateway | Erro de gateway |
| **503** | Service Unavailable | Serviço temporariamente indisponível |

### Códigos de Erro Customizados

| Código | Descrição |
|--------|----------|
| **VALIDATION_ERROR** | Erro de validação de dados |
| **AUTHENTICATION_FAILED** | Falha na autenticação |
| **AUTHORIZATION_DENIED** | Acesso negado |
| **RESOURCE_NOT_FOUND** | Recurso não encontrado |
| **DUPLICATE_RESOURCE** | Recurso duplicado |
| **PROCESSING_ERROR** | Erro durante processamento |
| **TIMEOUT_ERROR** | Timeout na operação |
| **DEPENDENCY_ERROR** | Erro em dependência externa |
| **RATE_LIMIT_EXCEEDED** | Rate limit excedido |
| **MAINTENANCE_MODE** | Sistema em manutenção |

## 💡 Exemplos de Uso

### Fluxo Completo: Criação de Pedido

```bash
# 1. Autenticação
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "senha123"
  }'

# Response: { "data": { "token": "jwt-token-here" } }

# 2. Submissão do evento
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jwt-token-here" \
  -d '{
    "type": "user_action",
    "payload": {
      "action": "create_order",
      "userId": "user123",
      "productId": "prod456",
      "quantity": 2
    },
    "correlationId": "order-123-456"
  }'

# Response: { "data": { "eventId": "evt_123" } }

# 3. Acompanhar status
curl -X GET http://localhost:3001/events/evt_123/status \
  -H "Authorization: Bearer jwt-token-here"

# 4. Verificar plano criado
curl -X GET http://localhost:3003/plans?eventId=evt_123 \
  -H "Authorization: Bearer jwt-token-here"

# 5. Monitorar execução
curl -X GET http://localhost:3004/executions?planId=plan_789 \
  -H "Authorization: Bearer jwt-token-here"
```

### Monitoramento em Tempo Real

```bash
# Health check contínuo
watch -n 5 'curl -s http://localhost:3000/health | jq .'

# Métricas em tempo real
curl -s http://localhost:3000/metrics | grep http_requests_total

# Status detalhado
curl -s http://localhost:3000/status | jq '.data.agents'
```

### Debugging e Troubleshooting

```bash
# Verificar eventos com erro
curl -X GET "http://localhost:3002/events?status=failed&limit=10" \
  -H "Authorization: Bearer jwt-token-here"

# Reprocessar evento
curl -X POST http://localhost:3002/events/evt_123/reprocess \
  -H "Authorization: Bearer jwt-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Manual reprocessing" }'

# Verificar logs de execução
curl -X GET http://localhost:3004/executions/exec_456/logs \
  -H "Authorization: Bearer jwt-token-here"
```

## 🛠️ SDKs e Clientes

### JavaScript/Node.js SDK

```javascript
// npm install agentes-autonomos-sdk
const { AgentesAutonomosClient } = require('agentes-autonomos-sdk');

const client = new AgentesAutonomosClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'your-api-key'
});

// Submeter evento
const event = await client.events.submit({
  type: 'user_action',
  payload: {
    action: 'create_order',
    userId: 'user123'
  }
});

// Acompanhar status
const status = await client.events.getStatus(event.eventId);

// Aguardar conclusão
const result = await client.events.waitForCompletion(event.eventId, {
  timeout: 30000,
  pollInterval: 1000
});
```

### Python SDK

```python
# pip install agentes-autonomos-python
from agentes_autonomos import AgentesAutonomosClient

client = AgentesAutonomosClient(
    base_url='http://localhost:3001',
    api_key='your-api-key'
)

# Submeter evento
event = client.events.submit({
    'type': 'user_action',
    'payload': {
        'action': 'create_order',
        'userId': 'user123'
    }
})

# Acompanhar status
status = client.events.get_status(event['eventId'])

# Aguardar conclusão
result = client.events.wait_for_completion(
    event['eventId'],
    timeout=30,
    poll_interval=1
)
```

### cURL Scripts

```bash
#!/bin/bash
# scripts/submit-event.sh

API_BASE="http://localhost:3001"
TOKEN="your-jwt-token"

# Submeter evento
EVENT_RESPONSE=$(curl -s -X POST "$API_BASE/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$1")

EVENT_ID=$(echo $EVENT_RESPONSE | jq -r '.data.eventId')
echo "Event submitted: $EVENT_ID"

# Aguardar conclusão
while true; do
  STATUS=$(curl -s -X GET "$API_BASE/events/$EVENT_ID/status" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.data.status')
  
  echo "Status: $STATUS"
  
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    break
  fi
  
  sleep 2
done

echo "Final status: $STATUS"
```

---

## 📚 Próximos Passos

Para continuar explorando a API:

1. [Monitoramento e Observabilidade](MONITORAMENTO.md)
2. [Exemplos Avançados](EXEMPLOS_AVANCADOS.md)
3. [Integração com Sistemas Externos](INTEGRACOES.md)

---

*Documentação gerada automaticamente - Última atualização: $(date)*