# Fallback Agent

## Visão Geral

O **Fallback Agent** é um componente crítico do sistema de agentes autônomos responsável por implementar estratégias de resiliência e fallback. Este agente garante que o sistema continue operacional mesmo quando componentes individuais falham, implementando padrões como Circuit Breaker, Retry com Backoff, Degradação Graceful e Bulkhead.

## Funcionalidades Principais

### 🔄 Circuit Breaker
- Monitora falhas de serviços e previne cascata de erros
- Estados: Fechado, Aberto, Meio-Aberto
- Configuração dinâmica de thresholds
- Recuperação automática baseada em tempo

### 🔁 Retry com Backoff
- Estratégias de retry: exponencial, linear, fixo, customizado
- Jitter para evitar thundering herd
- Classificação de erros retryáveis vs não-retryáveis
- Timeout configurável por operação

### 📉 Degradação Graceful
- Níveis: Normal, Reduzido, Mínimo
- Monitoramento de saúde do sistema (CPU, memória, taxa de erro)
- Adaptação automática de funcionalidades
- Configuração por feature

### 🚧 Bulkhead Pattern
- Isolamento de recursos por pool
- Prevenção de esgotamento de recursos
- Monitoramento de utilização
- Configuração de limites por serviço

### ⏱️ Timeout Adaptativo
- Ajuste dinâmico baseado no estado do sistema
- Configuração por tipo de operação
- Integração com degradação graceful

## Arquitetura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   SQS Queue     │───▶│  Fallback Agent  │───▶│  Recovery Agent │
│ fallback-events │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │ Circuit Breaker  │
                       │ Retry Service    │
                       │ Degradation Svc  │
                       └──────────────────┘
```

## Instalação

### Pré-requisitos
- Node.js >= 18.0.0
- npm >= 8.0.0
- AWS SQS configurado
- Redis (opcional, para cache)

### Instalação Local

```bash
cd src/agents/auxiliary/fallback
npm install
cp .env.example .env
# Configurar variáveis de ambiente
npm start
```

### Docker

```bash
# Build
docker build -t fallback-agent .

# Run
docker run -p 3020:3020 \
  -e AWS_REGION=us-east-1 \
  -e SQS_FALLBACK_QUEUE_URL=your-queue-url \
  fallback-agent
```

## Configuração

### Variáveis de Ambiente Principais

```env
# Servidor
PORT=3020
NODE_ENV=production

# AWS SQS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
SQS_FALLBACK_QUEUE_URL=https://sqs.region.amazonaws.com/account/fallback-events

# Circuit Breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# Retry
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY=1000
RETRY_MAX_DELAY=30000

# Degradação
DEGRADATION_CPU_THRESHOLD=80
DEGRADATION_MEMORY_THRESHOLD=85
DEGRADATION_ERROR_RATE_THRESHOLD=10
```

### Configuração Avançada

Ver arquivo `fallbackConfig.js` para configurações detalhadas de:
- Thresholds de circuit breaker por serviço
- Estratégias de retry personalizadas
- Níveis de degradação por funcionalidade
- Configuração de pools de recursos (bulkhead)
- Timeouts adaptativos

## API Endpoints

### Health Check
```http
GET /health
```

Resposta:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "dependencies": {
    "sqs": "healthy",
    "redis": "healthy"
  },
  "circuitBreakers": {
    "service1": "closed",
    "service2": "open"
  },
  "degradationLevel": "normal"
}
```

### Métricas
```http
GET /metrics
```

### Status do Sistema
```http
GET /status
```

### Executar Fallback Manual
```http
POST /fallback/execute
Content-Type: application/json

{
  "strategy": "circuit_breaker",
  "service": "external-api",
  "operation": "get_user_data",
  "payload": {...}
}
```

### Gerenciar Circuit Breaker
```http
# Obter estado
GET /circuit-breaker/:service/state

# Resetar circuit breaker
POST /circuit-breaker/:service/reset
```

### Configurar Degradação
```http
# Obter nível atual
GET /degradation/level

# Definir nível manualmente
POST /degradation/level
{
  "level": "reduced",
  "reason": "manual_override"
}
```

## Formato de Mensagens SQS

### Mensagem de Entrada (fallback-events)
```json
{
  "messageId": "uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "source": "health-checker",
  "eventType": "service_failure",
  "strategy": "circuit_breaker",
  "service": "external-api",
  "operation": "get_user_data",
  "error": {
    "type": "timeout",
    "message": "Request timeout after 5000ms",
    "code": "TIMEOUT"
  },
  "context": {
    "userId": "12345",
    "requestId": "req-uuid",
    "retryCount": 2
  },
  "metadata": {
    "priority": "high",
    "tags": ["critical", "user-facing"]
  }
}
```

### Mensagem de Saída (recovery-events)
```json
{
  "messageId": "uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "source": "fallback-agent",
  "eventType": "fallback_executed",
  "originalMessageId": "original-uuid",
  "strategy": "circuit_breaker",
  "action": "opened_circuit",
  "service": "external-api",
  "result": {
    "success": true,
    "fallbackUsed": true,
    "degradationLevel": "reduced"
  },
  "metrics": {
    "executionTime": 150,
    "circuitState": "open",
    "retryAttempts": 0
  }
}
```

## Estratégias de Fallback

### 1. Circuit Breaker
- **Quando usar**: Falhas recorrentes em serviços externos
- **Configuração**: Threshold de falhas, timeout, período de reset
- **Comportamento**: Bloqueia chamadas quando threshold é atingido

### 2. Retry com Backoff
- **Quando usar**: Falhas temporárias ou intermitentes
- **Configuração**: Número máximo de tentativas, delay base, estratégia
- **Comportamento**: Reexecuta operação com delay crescente

### 3. Degradação Graceful
- **Quando usar**: Sobrecarga do sistema ou recursos limitados
- **Configuração**: Thresholds de CPU/memória, níveis de degradação
- **Comportamento**: Reduz funcionalidades não-essenciais

### 4. Bulkhead
- **Quando usar**: Isolamento de recursos entre serviços
- **Configuração**: Pools de recursos por serviço
- **Comportamento**: Limita recursos disponíveis por serviço

### 5. Timeout Adaptativo
- **Quando usar**: Operações com tempo de resposta variável
- **Configuração**: Timeout base, multiplicadores por nível
- **Comportamento**: Ajusta timeout baseado no estado do sistema

## Métricas e Monitoramento

### Métricas Prometheus

```
# Circuit Breaker
fallback_circuit_breaker_state{service="api"} 0  # 0=closed, 1=open, 2=half-open
fallback_circuit_breaker_failures_total{service="api"} 5
fallback_circuit_breaker_successes_total{service="api"} 95

# Retry
fallback_retry_attempts_total{service="api",strategy="exponential"} 10
fallback_retry_successes_total{service="api"} 8
fallback_retry_failures_total{service="api"} 2

# Degradação
fallback_degradation_level{level="normal"} 1
fallback_system_health_score 0.85
fallback_cpu_usage_percent 75
fallback_memory_usage_percent 60

# Bulkhead
fallback_bulkhead_pool_size{service="api"} 10
fallback_bulkhead_pool_used{service="api"} 7
fallback_bulkhead_pool_available{service="api"} 3

# Performance
fallback_operation_duration_seconds{strategy="circuit_breaker"} 0.150
fallback_messages_processed_total 1000
fallback_messages_failed_total 5
```

### Logs Estruturados

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "service": "fallback-agent",
  "component": "circuit-breaker",
  "event": "circuit_opened",
  "service_name": "external-api",
  "failure_count": 5,
  "threshold": 5,
  "duration_ms": 150,
  "correlation_id": "req-uuid"
}
```

## Testes

### Executar Testes
```bash
# Todos os testes
npm test

# Com coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Testes de Integração
```bash
# Testar circuit breaker
curl -X POST http://localhost:3020/test/circuit-breaker

# Testar retry
curl -X POST http://localhost:3020/test/retry

# Testar degradação
curl -X POST http://localhost:3020/test/degradation
```

## Troubleshooting

### Problemas Comuns

#### Circuit Breaker não abre
- Verificar threshold de falhas
- Confirmar que erros estão sendo registrados
- Checar configuração de timeout

#### Retry infinito
- Verificar classificação de erros retryáveis
- Confirmar limite máximo de tentativas
- Checar configuração de backoff

#### Degradação não ativa
- Verificar thresholds de CPU/memória
- Confirmar monitoramento de saúde
- Checar configuração de features

#### Alta latência
- Verificar timeout configurations
- Analisar métricas de bulkhead
- Revisar estratégias de retry

### Logs de Debug

```bash
# Ativar logs detalhados
export LOG_LEVEL=debug
export DEBUG_CIRCUIT_BREAKER=true
export DEBUG_RETRY=true
export DEBUG_DEGRADATION=true
```

## Segurança

### Autenticação
- Tokens JWT para APIs administrativas
- Validação de origem para mensagens SQS
- Rate limiting por IP

### Autorização
- RBAC para operações administrativas
- Validação de permissões por serviço
- Audit log de ações críticas

### Dados Sensíveis
- Não loggar payloads completos
- Mascarar informações pessoais
- Criptografia de dados em cache

## Performance

### Otimizações
- Cache de decisões de fallback
- Pool de conexões para SQS
- Processamento assíncrono
- Compressão de mensagens

### Limites
- Máximo 1000 mensagens/segundo
- Timeout máximo de 30 segundos
- Cache TTL de 5 minutos
- Pool máximo de 100 recursos por serviço

## Contribuição

### Desenvolvimento
1. Fork do repositório
2. Criar branch para feature
3. Implementar mudanças
4. Adicionar testes
5. Executar linting
6. Submeter pull request

### Padrões de Código
- ESLint Standard
- Cobertura mínima de 80%
- Documentação JSDoc
- Commits convencionais

## Licença

MIT License - ver arquivo LICENSE para detalhes.

## Links Relacionados

- [Recovery Agent](./recovery-agent.md)
- [Health Checker Agent](./health-checker-agent.md)
- [Persistence Agent](./persistence-agent.md)
- [Arquitetura do Sistema](./architecture.md)
- [Guia de Deployment](./deployment.md)