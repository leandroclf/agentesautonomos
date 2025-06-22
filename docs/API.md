# 🔌 API - Sistema de Agentes Autônomos

Este documento fornece a especificação completa da API REST do sistema de agentes autônomos, incluindo endpoints, autenticação, formatos de dados e exemplos de uso.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Autenticação](#autenticação)
- [Endpoints por Categoria](#endpoints-por-categoria)
- [Códigos de Status](#códigos-de-status)
- [Formatos de Resposta](#formatos-de-resposta)
- [Modelos de Dados](#modelos-de-dados)
- [Exemplos de Uso](#exemplos-de-uso)
- [Rate Limiting](#rate-limiting)
- [Versionamento](#versionamento)

## 🌐 Visão Geral

### Características Gerais
- **Protocolo**: REST sobre HTTP/HTTPS
- **Formato**: JSON
- **Autenticação**: JWT Bearer Token
- **Rate Limiting**: 1000 requisições/minuto por usuário
- **Versionamento**: Via header `API-Version`
- **CORS**: Configurado para desenvolvimento
- **Compressão**: Gzip habilitado

### URLs Base
- **Desenvolvimento**: `http://localhost:3000`
- **Produção**: `https://api.agentesautonomos.com`

### Headers Padrão
```http
Content-Type: application/json
Authorization: Bearer <jwt-token>
API-Version: v1
X-Request-ID: <uuid>
User-Agent: <client-info>
```

## 🔐 Autenticação

### Obter Token

**POST** `/auth/login`

```json
// Request
{
  "username": "user@example.com",
  "password": "password123"
}

// Response
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600,
    "refreshToken": "refresh-token-here",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "role": "admin",
      "permissions": ["read", "write", "admin"]
    }
  }
}
```

### Renovar Token

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
    "expiresIn": 3600
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

## 📡 Endpoints por Categoria

### Interface Agent
- `GET /health` - Verificar saúde do sistema
- `GET /metrics` - Obter métricas do sistema
- `POST /sessions` - Criar nova sessão
- `GET /sessions` - Listar sessões
- `GET /sessions/{sessionId}` - Obter sessão específica
- `PUT /sessions/{sessionId}` - Atualizar sessão
- `DELETE /sessions/{sessionId}` - Deletar sessão

### Event Agent
- `POST /agents/event/events` - Criar evento
- `GET /agents/event/events` - Listar eventos
- `GET /agents/event/events/{eventId}` - Obter evento específico
- `PUT /agents/event/events/{eventId}` - Atualizar evento
- `DELETE /agents/event/events/{eventId}` - Deletar evento
- `POST /agents/event/events/{eventId}/process` - Processar evento
- `GET /agents/event/events/{eventId}/status` - Status do processamento

### Planning Agent
- `POST /agents/planning/plans` - Criar plano
- `GET /agents/planning/plans` - Listar planos
- `GET /agents/planning/plans/{planId}` - Obter plano específico
- `PUT /agents/planning/plans/{planId}` - Atualizar plano
- `DELETE /agents/planning/plans/{planId}` - Deletar plano
- `POST /agents/planning/plans/{planId}/execute` - Executar plano
- `GET /agents/planning/plans/{planId}/status` - Status da execução

### Execution Agent
- `POST /agents/execution/tasks` - Criar tarefa
- `GET /agents/execution/tasks` - Listar tarefas
- `GET /agents/execution/tasks/{taskId}` - Obter tarefa específica
- `PUT /agents/execution/tasks/{taskId}` - Atualizar tarefa
- `DELETE /agents/execution/tasks/{taskId}` - Cancelar tarefa
- `POST /agents/execution/tasks/{taskId}/start` - Iniciar execução
- `POST /agents/execution/tasks/{taskId}/pause` - Pausar execução
- `POST /agents/execution/tasks/{taskId}/resume` - Retomar execução
- `POST /agents/execution/tasks/{taskId}/stop` - Parar execução

### Mediator Agent
- `POST /agents/mediator/mediate` - Mediar comunicação
- `GET /agents/mediator/sessions` - Listar sessões de mediação
- `GET /agents/mediator/sessions/{sessionId}` - Obter sessão de mediação
- `POST /agents/mediator/sessions/{sessionId}/resolve` - Resolver conflito

### Orchestrator Agent
- `POST /agents/orchestrator/workflows` - Criar workflow
- `GET /agents/orchestrator/workflows` - Listar workflows
- `GET /agents/orchestrator/workflows/{workflowId}` - Obter workflow específico
- `PUT /agents/orchestrator/workflows/{workflowId}` - Atualizar workflow
- `DELETE /agents/orchestrator/workflows/{workflowId}` - Deletar workflow
- `POST /agents/orchestrator/workflows/{workflowId}/execute` - Executar workflow

### Monitoramento
- `GET /monitoring/health` - Verificar saúde do sistema
- `GET /monitoring/metrics` - Obter métricas
- `GET /monitoring/agents/{agentId}/status` - Status de agente específico
- `GET /monitoring/agents/{agentId}/metrics` - Métricas de agente específico
- `GET /monitoring/system/performance` - Performance do sistema

### Schema Registry
- `POST /schema-registry/schemas` - Registrar schema
- `GET /schema-registry/schemas` - Listar schemas
- `GET /schema-registry/schemas/{schemaId}` - Obter schema específico
- `PUT /schema-registry/schemas/{schemaId}` - Atualizar schema
- `DELETE /schema-registry/schemas/{schemaId}` - Deletar schema
- `POST /schema-registry/schemas/{schemaId}/validate` - Validar dados contra schema

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

## 📝 Formatos de Resposta

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
    "version": "v1",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
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
        "message": "Email é obrigatório",
        "code": "REQUIRED_FIELD"
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

## 🗂️ Modelos de Dados

### Session
```json
{
  "id": "session-123",
  "userId": "user-456",
  "status": "active",
  "metadata": {
    "userAgent": "Mozilla/5.0...",
    "ipAddress": "192.168.1.1"
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:35:00Z",
  "expiresAt": "2024-01-15T22:30:00Z"
}
```

### Event
```json
{
  "id": "event-789",
  "type": "user.action",
  "source": "web-interface",
  "data": {
    "action": "login",
    "userId": "user-456"
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "metadata": {
    "correlationId": "corr-123",
    "priority": "high"
  },
  "status": "processed"
}
```

### Plan
```json
{
  "id": "plan-101",
  "name": "Processamento de Pedido",
  "description": "Plano para processar pedidos de e-commerce",
  "status": "active",
  "goals": [
    "Validar dados do pedido",
    "Verificar estoque",
    "Processar pagamento"
  ],
  "constraints": {
    "maxExecutionTime": 300,
    "requiredResources": ["payment-service", "inventory-service"]
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:35:00Z",
  "createdBy": "user-456"
}
```

### Task
```json
{
  "id": "task-202",
  "planId": "plan-101",
  "name": "Validar Pagamento",
  "description": "Validar dados de pagamento do pedido",
  "status": "running",
  "priority": "high",
  "parameters": {
    "orderId": "order-123",
    "amount": 99.99,
    "currency": "BRL"
  },
  "result": null,
  "createdAt": "2024-01-15T10:30:00Z",
  "startedAt": "2024-01-15T10:31:00Z",
  "completedAt": null,
  "estimatedDuration": 30
}
```

## 💡 Exemplos de Uso

### Criar e Executar um Plano

```bash
# 1. Criar plano
curl -X POST http://localhost:3000/agents/planning/plans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Processar Pedido",
    "description": "Plano para processar pedido de e-commerce",
    "goals": ["validar", "processar", "confirmar"]
  }'

# 2. Executar plano
curl -X POST http://localhost:3000/agents/planning/plans/plan-123/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "orderId": "order-456",
      "priority": "high"
    }
  }'
```

### Monitorar Execução

```bash
# Verificar status do plano
curl -X GET http://localhost:3000/agents/planning/plans/plan-123/status \
  -H "Authorization: Bearer $TOKEN"

# Obter métricas do sistema
curl -X GET http://localhost:3000/monitoring/metrics \
  -H "Authorization: Bearer $TOKEN"
```

## ⚡ Rate Limiting

- **Limite padrão**: 1000 requisições/minuto por usuário
- **Headers de resposta**:
  - `X-RateLimit-Limit`: Limite total
  - `X-RateLimit-Remaining`: Requisições restantes
  - `X-RateLimit-Reset`: Timestamp do reset

### Exemplo de Resposta com Rate Limit

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1642248000

{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Limite de requisições excedido",
    "retryAfter": 60
  }
}
```

## 🔄 Versionamento

- **Versão atual**: v1
- **Header**: `API-Version: v1`
- **Compatibilidade**: Mantida por pelo menos 12 meses
- **Deprecação**: Notificada com 6 meses de antecedência

### Exemplo de Uso com Versionamento

```bash
curl -X GET http://localhost:3000/health \
  -H "API-Version: v1" \
  -H "Authorization: Bearer $TOKEN"
```

---

**Última atualização**: Janeiro 2024  
**Versão da API**: v1  
**Contato**: dev@agentesautonomos.com