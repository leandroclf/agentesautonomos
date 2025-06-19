# API Reference - Message Schema Registry

Este documento fornece uma referência completa da API REST do Message Schema Registry, incluindo endpoints, parâmetros, exemplos de requisições e respostas.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Autenticação](#autenticação)
- [Códigos de Status](#códigos-de-status)
- [Schemas](#schemas)
- [Validação](#validação)
- [Versões](#versões)
- [Compatibilidade](#compatibilidade)
- [Migração](#migração)
- [Sistema](#sistema)
- [Exemplos de Uso](#exemplos-de-uso)
- [SDKs e Clientes](#sdks-e-clientes)

## 🌐 Visão Geral

### Base URL
```
http://localhost:3000/api/v1
```

### Content-Type
Todas as requisições devem usar:
```
Content-Type: application/json
```

### Rate Limiting
- **Limite**: 100 requisições por IP a cada 15 minutos
- **Headers de resposta**:
  - `X-RateLimit-Limit`: Limite total
  - `X-RateLimit-Remaining`: Requisições restantes
  - `X-RateLimit-Reset`: Timestamp do reset

## 🔐 Autenticação

### JWT Token
```http
Authorization: Bearer <jwt_token>
```

### Exemplo de Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "password"
  }'
```

**Resposta**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

## 📊 Códigos de Status

| Código | Descrição | Uso |
|--------|-----------|-----|
| 200 | OK | Operação bem-sucedida |
| 201 | Created | Recurso criado com sucesso |
| 202 | Accepted | Operação aceita (assíncrona) |
| 400 | Bad Request | Dados inválidos |
| 401 | Unauthorized | Autenticação necessária |
| 403 | Forbidden | Acesso negado |
| 404 | Not Found | Recurso não encontrado |
| 409 | Conflict | Conflito de estado |
| 422 | Unprocessable Entity | Dados válidos mas não processáveis |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Internal Server Error | Erro interno do servidor |

## 📝 Schemas

### Registrar Schema

**Endpoint**: `POST /schemas`

**Descrição**: Registra um novo schema no registry.

**Parâmetros**:
```json
{
  "subject": "user-profile",
  "format": "json-schema",
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    },
    "required": ["id", "name", "email"]
  },
  "description": "Schema para perfil de usuário",
  "tags": ["user", "profile"]
}
```

**Resposta** (201):
```json
{
  "id": "schema-123",
  "subject": "user-profile",
  "version": "1.0.0",
  "format": "json-schema",
  "schema": { /* schema object */ },
  "description": "Schema para perfil de usuário",
  "tags": ["user", "profile"],
  "createdAt": "2024-01-15T10:30:00Z",
  "createdBy": "admin"
}
```

### Listar Schemas

**Endpoint**: `GET /schemas`

**Parâmetros de Query**:
- `subject` (string): Filtrar por subject
- `format` (string): Filtrar por formato
- `tags` (string): Filtrar por tags (separadas por vírgula)
- `page` (number): Página (padrão: 1)
- `limit` (number): Itens por página (padrão: 20)
- `sort` (string): Campo para ordenação
- `order` (string): Direção da ordenação (asc/desc)

**Exemplo**:
```bash
curl "http://localhost:3000/api/v1/schemas?subject=user&page=1&limit=10"
```

**Resposta** (200):
```json
{
  "schemas": [
    {
      "id": "schema-123",
      "subject": "user-profile",
      "version": "1.0.0",
      "format": "json-schema",
      "description": "Schema para perfil de usuário",
      "tags": ["user", "profile"],
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  }
}
```

### Obter Schema

**Endpoint**: `GET /schemas/{subject}/{version}`

**Parâmetros**:
- `subject` (path): Nome do subject
- `version` (path): Versão do schema ou 'latest'

**Exemplo**:
```bash
curl "http://localhost:3000/api/v1/schemas/user-profile/1.0.0"
```

**Resposta** (200):
```json
{
  "id": "schema-123",
  "subject": "user-profile",
  "version": "1.0.0",
  "format": "json-schema",
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    },
    "required": ["id", "name", "email"]
  },
  "description": "Schema para perfil de usuário",
  "tags": ["user", "profile"],
  "createdAt": "2024-01-15T10:30:00Z",
  "createdBy": "admin"
}
```

### Atualizar Schema

**Endpoint**: `PUT /schemas/{subject}/{version}`

**Parâmetros**:
```json
{
  "schema": { /* novo schema */ },
  "description": "Descrição atualizada",
  "tags": ["user", "profile", "updated"]
}
```

### Deletar Schema

**Endpoint**: `DELETE /schemas/{subject}/{version}`

**Resposta** (200):
```json
{
  "message": "Schema deletado com sucesso",
  "subject": "user-profile",
  "version": "1.0.0"
}
```

## ✅ Validação

### Validar Mensagem

**Endpoint**: `POST /validation/validate`

**Descrição**: Valida uma mensagem contra um schema específico.

**Parâmetros**:
```json
{
  "subject": "user-profile",
  "version": "1.0.0",
  "message": {
    "id": "user-123",
    "name": "João Silva",
    "email": "joao@example.com"
  }
}
```

**Resposta** (200) - Válida:
```json
{
  "valid": true,
  "subject": "user-profile",
  "version": "1.0.0",
  "validatedAt": "2024-01-15T10:35:00Z"
}
```

**Resposta** (200) - Inválida:
```json
{
  "valid": false,
  "subject": "user-profile",
  "version": "1.0.0",
  "errors": [
    {
      "path": "/email",
      "message": "deve ser um email válido",
      "value": "email-inválido"
    }
  ],
  "validatedAt": "2024-01-15T10:35:00Z"
}
```

### Validação em Lote

**Endpoint**: `POST /validation/batch`

**Parâmetros**:
```json
{
  "validations": [
    {
      "id": "val-1",
      "subject": "user-profile",
      "version": "1.0.0",
      "message": { /* mensagem 1 */ }
    },
    {
      "id": "val-2",
      "subject": "user-profile",
      "version": "1.0.0",
      "message": { /* mensagem 2 */ }
    }
  ]
}
```

**Resposta** (200):
```json
{
  "results": [
    {
      "id": "val-1",
      "valid": true,
      "subject": "user-profile",
      "version": "1.0.0"
    },
    {
      "id": "val-2",
      "valid": false,
      "subject": "user-profile",
      "version": "1.0.0",
      "errors": [ /* erros */ ]
    }
  ],
  "summary": {
    "total": 2,
    "valid": 1,
    "invalid": 1
  }
}
```

### Estatísticas de Validação

**Endpoint**: `GET /validation/stats`

**Parâmetros de Query**:
- `subject` (string): Filtrar por subject
- `period` (string): Período (hour, day, week, month)
- `from` (string): Data inicial (ISO 8601)
- `to` (string): Data final (ISO 8601)

**Resposta** (200):
```json
{
  "period": "day",
  "from": "2024-01-15T00:00:00Z",
  "to": "2024-01-15T23:59:59Z",
  "stats": {
    "totalValidations": 1500,
    "validMessages": 1350,
    "invalidMessages": 150,
    "successRate": 0.9,
    "avgResponseTime": 25.5,
    "bySubject": {
      "user-profile": {
        "total": 800,
        "valid": 750,
        "invalid": 50
      },
      "order-event": {
        "total": 700,
        "valid": 600,
        "invalid": 100
      }
    }
  }
}
```

## 🔄 Versões

### Listar Versões

**Endpoint**: `GET /versions/{subject}`

**Parâmetros de Query**:
- `includeDeprecated` (boolean): Incluir versões depreciadas
- `sort` (string): Ordenação (version, createdAt)
- `order` (string): Direção (asc, desc)

**Resposta** (200):
```json
{
  "subject": "user-profile",
  "versions": [
    {
      "version": "1.0.0",
      "createdAt": "2024-01-15T10:30:00Z",
      "deprecated": false,
      "tags": ["stable"]
    },
    {
      "version": "1.1.0",
      "createdAt": "2024-01-16T14:20:00Z",
      "deprecated": false,
      "tags": ["latest"]
    }
  ]
}
```

### Obter Versão Específica

**Endpoint**: `GET /versions/{subject}/{version}`

**Resposta** (200):
```json
{
  "subject": "user-profile",
  "version": "1.1.0",
  "schema": { /* schema object */ },
  "createdAt": "2024-01-16T14:20:00Z",
  "createdBy": "admin",
  "deprecated": false,
  "tags": ["latest"],
  "changelog": {
    "changes": [
      {
        "type": "added",
        "path": "/properties/phone",
        "description": "Adicionado campo telefone"
      }
    ]
  }
}
```

### Comparar Versões

**Endpoint**: `POST /versions/{subject}/compare`

**Parâmetros**:
```json
{
  "fromVersion": "1.0.0",
  "toVersion": "1.1.0"
}
```

**Resposta** (200):
```json
{
  "subject": "user-profile",
  "fromVersion": "1.0.0",
  "toVersion": "1.1.0",
  "compatibility": "backward",
  "changes": [
    {
      "type": "added",
      "path": "/properties/phone",
      "description": "Adicionado campo telefone opcional",
      "breaking": false
    }
  ],
  "summary": {
    "totalChanges": 1,
    "breakingChanges": 0,
    "addedFields": 1,
    "removedFields": 0,
    "modifiedFields": 0
  }
}
```

### Depreciar Versão

**Endpoint**: `POST /versions/{subject}/{version}/deprecate`

**Parâmetros**:
```json
{
  "reason": "Versão substituída por 2.0.0",
  "replacedBy": "2.0.0"
}
```

**Resposta** (200):
```json
{
  "message": "Versão depreciada com sucesso",
  "subject": "user-profile",
  "version": "1.0.0",
  "deprecatedAt": "2024-01-17T09:15:00Z",
  "reason": "Versão substituída por 2.0.0"
}
```

## 🔗 Compatibilidade

### Verificar Compatibilidade

**Endpoint**: `POST /compatibility/check`

**Parâmetros**:
```json
{
  "subject": "user-profile",
  "schema": { /* novo schema */ },
  "version": "1.0.0"
}
```

**Resposta** (200):
```json
{
  "compatible": true,
  "compatibility": "backward",
  "subject": "user-profile",
  "baseVersion": "1.0.0",
  "checkedAt": "2024-01-17T10:00:00Z",
  "issues": []
}
```

**Resposta** (200) - Incompatível:
```json
{
  "compatible": false,
  "compatibility": "none",
  "subject": "user-profile",
  "baseVersion": "1.0.0",
  "checkedAt": "2024-01-17T10:00:00Z",
  "issues": [
    {
      "type": "breaking_change",
      "severity": "error",
      "path": "/properties/email",
      "message": "Campo obrigatório removido",
      "suggestion": "Manter campo como opcional para compatibilidade"
    }
  ]
}
```

### Configurar Política de Compatibilidade

**Endpoint**: `PUT /compatibility/policy/{subject}`

**Parâmetros**:
```json
{
  "policy": "backward",
  "enforced": true
}
```

**Políticas Disponíveis**:
- `none`: Sem verificação de compatibilidade
- `backward`: Compatibilidade com versões anteriores
- `forward`: Compatibilidade com versões futuras
- `full`: Compatibilidade total (backward + forward)

## 🚀 Migração

### Criar Plano de Migração

**Endpoint**: `POST /migration/plan`

**Parâmetros**:
```json
{
  "subject": "user-profile",
  "fromVersion": "1.0.0",
  "toVersion": "2.0.0",
  "options": {
    "batchSize": 1000,
    "parallel": true,
    "dryRun": false
  }
}
```

**Resposta** (200):
```json
{
  "planId": "plan-456",
  "subject": "user-profile",
  "fromVersion": "1.0.0",
  "toVersion": "2.0.0",
  "estimatedDuration": "2h 30m",
  "estimatedMessages": 50000,
  "steps": [
    {
      "step": 1,
      "description": "Validar compatibilidade",
      "estimatedDuration": "5m"
    },
    {
      "step": 2,
      "description": "Migrar mensagens em lote",
      "estimatedDuration": "2h 20m"
    },
    {
      "step": 3,
      "description": "Validar migração",
      "estimatedDuration": "5m"
    }
  ],
  "createdAt": "2024-01-17T11:00:00Z"
}
```

### Executar Migração

**Endpoint**: `POST /migration/execute`

**Parâmetros**:
```json
{
  "planId": "plan-456"
}
```

**Resposta** (202):
```json
{
  "executionId": "exec-789",
  "planId": "plan-456",
  "status": "started",
  "startedAt": "2024-01-17T11:30:00Z",
  "estimatedCompletion": "2024-01-17T14:00:00Z"
}
```

### Status da Migração

**Endpoint**: `GET /migration/status/{executionId}`

**Resposta** (200):
```json
{
  "executionId": "exec-789",
  "planId": "plan-456",
  "status": "running",
  "progress": {
    "currentStep": 2,
    "totalSteps": 3,
    "percentage": 65,
    "processedMessages": 32500,
    "totalMessages": 50000
  },
  "startedAt": "2024-01-17T11:30:00Z",
  "estimatedCompletion": "2024-01-17T13:45:00Z",
  "logs": [
    {
      "timestamp": "2024-01-17T11:30:00Z",
      "level": "info",
      "message": "Migração iniciada"
    },
    {
      "timestamp": "2024-01-17T12:15:00Z",
      "level": "info",
      "message": "Processados 25000 mensagens"
    }
  ]
}
```

### Cancelar Migração

**Endpoint**: `POST /migration/cancel/{executionId}`

**Resposta** (200):
```json
{
  "message": "Migração cancelada com sucesso",
  "executionId": "exec-789",
  "cancelledAt": "2024-01-17T12:30:00Z",
  "progress": {
    "processedMessages": 25000,
    "totalMessages": 50000
  }
}
```

## 🏥 Sistema

### Health Check

**Endpoint**: `GET /health`

**Resposta** (200):
```json
{
  "status": "healthy",
  "timestamp": "2024-01-17T15:00:00Z",
  "uptime": "2d 5h 30m",
  "version": "1.0.0",
  "checks": {
    "database": "healthy",
    "cache": "healthy",
    "queue": "healthy",
    "memory": {
      "status": "healthy",
      "usage": "45%",
      "total": "2GB",
      "used": "900MB"
    },
    "disk": {
      "status": "healthy",
      "usage": "30%",
      "total": "100GB",
      "used": "30GB"
    }
  }
}
```

### Métricas

**Endpoint**: `GET /metrics`

**Resposta** (200) - Formato Prometheus:
```
# HELP schemas_registered_total Total number of schemas registered
# TYPE schemas_registered_total counter
schemas_registered_total{subject="user-profile",format="json-schema"} 5
schemas_registered_total{subject="order-event",format="avro"} 3

# HELP validation_duration_seconds Duration of message validation
# TYPE validation_duration_seconds histogram
validation_duration_seconds_bucket{subject="user-profile",le="0.01"} 1200
validation_duration_seconds_bucket{subject="user-profile",le="0.05"} 1450
validation_duration_seconds_bucket{subject="user-profile",le="0.1"} 1500
validation_duration_seconds_bucket{subject="user-profile",le="+Inf"} 1500
validation_duration_seconds_sum{subject="user-profile"} 15.5
validation_duration_seconds_count{subject="user-profile"} 1500
```

## 💡 Exemplos de Uso

### Fluxo Completo: Registro e Validação

```bash
# 1. Registrar schema
curl -X POST http://localhost:3000/api/v1/schemas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "subject": "user-created",
    "format": "json-schema",
    "schema": {
      "type": "object",
      "properties": {
        "userId": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "createdAt": { "type": "string", "format": "date-time" }
      },
      "required": ["userId", "email", "createdAt"]
    }
  }'

# 2. Validar mensagem
curl -X POST http://localhost:3000/api/v1/validation/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "subject": "user-created",
    "version": "latest",
    "message": {
      "userId": "user-123",
      "email": "user@example.com",
      "createdAt": "2024-01-17T15:30:00Z"
    }
  }'
```

### Evolução de Schema

```bash
# 1. Verificar compatibilidade
curl -X POST http://localhost:3000/api/v1/compatibility/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "subject": "user-created",
    "schema": {
      "type": "object",
      "properties": {
        "userId": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "name": { "type": "string" },
        "createdAt": { "type": "string", "format": "date-time" }
      },
      "required": ["userId", "email", "createdAt"]
    },
    "version": "1.0.0"
  }'

# 2. Registrar nova versão (se compatível)
curl -X POST http://localhost:3000/api/v1/schemas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "subject": "user-created",
    "format": "json-schema",
    "schema": {
      "type": "object",
      "properties": {
        "userId": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "name": { "type": "string" },
        "createdAt": { "type": "string", "format": "date-time" }
      },
      "required": ["userId", "email", "createdAt"]
    }
  }'
```

### Migração de Dados

```bash
# 1. Criar plano de migração
curl -X POST http://localhost:3000/api/v1/migration/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "subject": "user-created",
    "fromVersion": "1.0.0",
    "toVersion": "2.0.0",
    "options": {
      "batchSize": 1000,
      "dryRun": true
    }
  }'

# 2. Executar migração
curl -X POST http://localhost:3000/api/v1/migration/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "planId": "plan-456"
  }'

# 3. Monitorar progresso
curl http://localhost:3000/api/v1/migration/status/exec-789 \
  -H "Authorization: Bearer $TOKEN"
```

## 📚 SDKs e Clientes

### JavaScript/Node.js

```javascript
const { SchemaRegistryClient } = require('@company/schema-registry-client')

const client = new SchemaRegistryClient({
  baseUrl: 'http://localhost:3000/api/v1',
  token: 'your-jwt-token'
})

// Registrar schema
const schema = await client.schemas.register({
  subject: 'user-profile',
  format: 'json-schema',
  schema: userProfileSchema
})

// Validar mensagem
const result = await client.validation.validate({
  subject: 'user-profile',
  version: 'latest',
  message: userData
})

if (!result.valid) {
  console.error('Validation errors:', result.errors)
}
```

### Python

```python
from schema_registry_client import SchemaRegistryClient

client = SchemaRegistryClient(
    base_url='http://localhost:3000/api/v1',
    token='your-jwt-token'
)

# Registrar schema
schema = client.schemas.register(
    subject='user-profile',
    format='json-schema',
    schema=user_profile_schema
)

# Validar mensagem
result = client.validation.validate(
    subject='user-profile',
    version='latest',
    message=user_data
)

if not result['valid']:
    print(f"Validation errors: {result['errors']}")
```

### Java

```java
import com.company.schemaregistry.SchemaRegistryClient;
import com.company.schemaregistry.model.*;

SchemaRegistryClient client = new SchemaRegistryClient(
    "http://localhost:3000/api/v1",
    "your-jwt-token"
);

// Registrar schema
SchemaRegistrationRequest request = SchemaRegistrationRequest.builder()
    .subject("user-profile")
    .format("json-schema")
    .schema(userProfileSchema)
    .build();

Schema schema = client.schemas().register(request);

// Validar mensagem
ValidationRequest validationRequest = ValidationRequest.builder()
    .subject("user-profile")
    .version("latest")
    .message(userData)
    .build();

ValidationResult result = client.validation().validate(validationRequest);

if (!result.isValid()) {
    System.err.println("Validation errors: " + result.getErrors());
}
```

---

**Última atualização**: 2024
**Versão da API**: v1
**Documentação Interativa**: http://localhost:3000/docs