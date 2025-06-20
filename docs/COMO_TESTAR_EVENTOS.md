# Como Testar Eventos no Sistema de Agentes

## 🚀 Configuração Rápida

**Para iniciar o ambiente completo:**
```bash
npm run dev
```

**Para configuração rápida (se Docker já estiver rodando):**
```bash
npm run dev:quick
```

**Para executar apenas testes de eventos:**
```bash
npm run dev:test
```

> 📚 **Documentação Completa**: Consulte o [Guia de Desenvolvimento Completo](./GUIA_DESENVOLVIMENTO_COMPLETO.md) para mais detalhes.

## Status da Aplicação

✅ **Aplicação rodando com sucesso!**

A aplicação foi reiniciada e está funcionando corretamente. Os seguintes componentes estão ativos:

### Agentes em Execução
- **Execution Agent** (PID: 20224) - Status: Healthy
- **Security Agent** - Status: Healthy
- **Event Agent** - Status: Running
- **Planning Agent** - Status: Running
- **Interface Agent** - Status: Running
- **Monitoring Agent** - Status: Running
- **External Gateway** - Status: Running

### Serviços Docker
- **LocalStack** (porta 4566) - AWS services locais
- **PostgreSQL** (porta 5432) - Banco de dados
- **Redis** (porta 6379) - Cache e mensageria
- **Prometheus** (porta 9090) - Métricas
- **Grafana** (porta 3000) - Dashboards
- **PgAdmin** (porta 8080) - Interface do PostgreSQL
- **Redis Commander** (porta 8081) - Interface do Redis

## Como Enviar Eventos para Teste

### 1. Via API REST (Interface Agent)

**Endpoint:** `http://localhost:3001/api/events`

**Exemplo com curl:**
```bash
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "user_action",
    "data": {
      "action": "login",
      "userId": "user123",
      "timestamp": "2025-06-20T01:44:00Z"
    },
    "priority": "normal"
  }'
```

**Exemplo com PowerShell:**
```powershell
$body = @{
    type = "user_action"
    data = @{
        action = "login"
        userId = "user123"
        timestamp = "2025-06-20T01:44:00Z"
    }
    priority = "normal"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/events" -Method POST -Body $body -ContentType "application/json"
```

### 2. Via SQS (LocalStack)

**Endpoint LocalStack:** `http://localhost:4566`

**Filas disponíveis:**
- `events-queue` - Eventos gerais
- `high-priority-events` - Eventos de alta prioridade
- `planning-queue` - Eventos para o Planning Agent
- `execution-queue` - Eventos para o Execution Agent

**Exemplo enviando para SQS:**
```bash
aws --endpoint-url=http://localhost:4566 sqs send-message \
  --queue-url http://localhost:4566/000000000000/events-queue \
  --message-body '{
    "type": "system_alert",
    "data": {
      "severity": "warning",
      "message": "High CPU usage detected",
      "source": "monitoring"
    }
  }'
```

### 3. Tipos de Eventos Suportados

#### Eventos de Sistema
```json
{
  "type": "system_alert",
  "data": {
    "severity": "warning|error|info",
    "message": "Descrição do alerta",
    "source": "monitoring|security|execution"
  }
}
```

#### Eventos de Usuário
```json
{
  "type": "user_action",
  "data": {
    "action": "login|logout|create|update|delete",
    "userId": "identificador_usuario",
    "resource": "recurso_afetado"
  }
}
```

#### Eventos de Planejamento
```json
{
  "type": "planning_request",
  "data": {
    "goal": "objetivo_a_ser_alcancado",
    "constraints": ["restricao1", "restricao2"],
    "priority": "high|normal|low"
  }
}
```

#### Eventos de Execução
```json
{
  "type": "execution_task",
  "data": {
    "taskId": "task_123",
    "action": "start|stop|pause|resume",
    "parameters": {}
  }
}
```

### 4. Monitoramento dos Eventos

#### Via Logs
Os logs da aplicação mostram o processamento dos eventos em tempo real:
```bash
# Verificar logs do Event Agent
docker logs agentes-event-agent

# Verificar logs do Execution Agent
# (já visível no terminal onde a aplicação está rodando)
```

#### Via Grafana
- Acesse: `http://localhost:3000`
- Login: admin/admin
- Dashboards disponíveis para monitorar métricas dos agentes

#### Via Prometheus
- Acesse: `http://localhost:9090`
- Consulte métricas como:
  - `agent_events_processed_total`
  - `agent_health_status`
  - `agent_execution_time_seconds`

### 5. Ferramentas de Administração

#### Redis Commander
- URL: `http://localhost:8081`
- Visualizar filas e cache em tempo real

#### PgAdmin
- URL: `http://localhost:8080`
- Email: admin@admin.com
- Senha: admin
- Visualizar dados persistidos no PostgreSQL

### 6. Scripts de Teste Automatizado

Execute os scripts de teste disponíveis:

```bash
# Teste de conectividade SQS
node scripts/test-sqs-connectivity.js

# Teste de integração do sistema
node scripts/test-system-integration.js

# Teste específico do sistema
node dev/scripts/test-system.js
```

## Exemplos Práticos de Teste

### Teste 1: Evento de Login de Usuário
```bash
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "user_action",
    "data": {
      "action": "login",
      "userId": "teste123",
      "ip": "192.168.1.100",
      "timestamp": "2025-06-20T01:44:00Z"
    },
    "priority": "normal"
  }'
```

### Teste 2: Alerta de Segurança
```bash
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "security_alert",
    "data": {
      "severity": "high",
      "message": "Tentativa de acesso não autorizado detectada",
      "source": "firewall",
      "ip": "192.168.1.200"
    },
    "priority": "high"
  }'
```

### Teste 3: Solicitação de Planejamento
```bash
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "planning_request",
    "data": {
      "goal": "Otimizar performance do sistema",
      "constraints": ["Manter disponibilidade > 99%", "Usar recursos < 80%"],
      "deadline": "2025-06-21T00:00:00Z"
    },
    "priority": "normal"
  }'
```

## Verificação de Resultados

1. **Logs em Tempo Real**: Observe os logs no terminal onde a aplicação está rodando
2. **Métricas**: Verifique as métricas no Grafana (http://localhost:3000)
3. **Banco de Dados**: Consulte os dados no PgAdmin (http://localhost:8080)
4. **Cache/Filas**: Monitore no Redis Commander (http://localhost:8081)

---

**Nota**: A aplicação está configurada para ambiente de desenvolvimento com todos os serviços rodando localmente. Os eventos enviados serão processados pelos agentes correspondentes e você poderá acompanhar o fluxo através dos logs e ferramentas de monitoramento.