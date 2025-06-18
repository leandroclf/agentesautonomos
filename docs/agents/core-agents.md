# Agentes Core - Documentação Técnica

## Visão Geral

Os Agentes Core formam o núcleo do sistema de agentes autônomos, implementando as funcionalidades essenciais de processamento, planejamento e execução. Cada agente é projetado seguindo princípios de Clean Architecture e Domain-Driven Design (DDD).

## Arquitetura dos Agentes

### Estrutura Comum

Todos os agentes core seguem uma estrutura consistente:

```
src/agents/core/[agent-name]/
├── index.js              # Ponto de entrada principal
├── handlers/             # Manipuladores de rotas e eventos
├── services/             # Lógica de negócio
├── config/               # Configurações específicas
└── utils/                # Utilitários específicos
```

### Componentes Compartilhados

- **Express.js**: Framework web para APIs REST
- **Winston**: Sistema de logging estruturado
- **Prometheus**: Métricas e monitoramento
- **AWS SQS**: Comunicação assíncrona entre agentes
- **Helmet**: Segurança HTTP
- **CORS**: Controle de acesso cross-origin
- **Rate Limiting**: Proteção contra abuso

## Interface Agent

### Responsabilidades

- **Gateway de Entrada**: Ponto único de acesso para requisições externas
- **Validação de Entrada**: Validação de dados e autenticação
- **Roteamento**: Direcionamento de requisições para agentes apropriados
- **WebSocket Support**: Comunicação em tempo real (quando habilitado)
- **Rate Limiting**: Proteção contra sobrecarga

### Endpoints Principais

```http
GET  /health              # Health check
GET  /metrics             # Métricas Prometheus
POST /events              # Submissão de eventos
GET  /events/:id/status   # Status de processamento
WS   /ws                  # WebSocket (se habilitado)
```

### Configurações

```javascript
interface: {
  port: 3001,
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // máximo 100 requests por janela
  },
  websocket: {
    enabled: false, // Configurável via env
    pingTimeout: 60000
  }
}
```

### Fluxo de Processamento

1. **Recepção**: Recebe requisição HTTP/WebSocket
2. **Validação**: Valida formato e autenticação
3. **Rate Limiting**: Verifica limites de taxa
4. **Roteamento**: Envia para fila SQS apropriada
5. **Resposta**: Retorna confirmação ou erro

## Event Agent

### Responsabilidades

- **Processamento de Eventos**: Análise e classificação de eventos
- **Coordenação**: Orquestração entre agentes
- **Deduplicação**: Prevenção de processamento duplicado
- **Retry Logic**: Reprocessamento de falhas
- **State Tracking**: Rastreamento de estado de eventos

### Tipos de Eventos Suportados

- `user_request`: Requisições de usuários
- `system_event`: Eventos internos do sistema
- `planning_request`: Solicitações de planejamento
- `execution_request`: Solicitações de execução
- `monitoring_event`: Eventos de monitoramento

### Configurações

```javascript
event: {
  processing: {
    maxConcurrentEvents: 50,
    processingTimeout: 30000,
    retryAttempts: 3,
    exponentialBackoff: true
  },
  validation: {
    requiredFields: ['id', 'type', 'source', 'timestamp'],
    maxEventSize: 1024 * 1024 // 1MB
  }
}
```

### Fluxo de Processamento

1. **Polling**: Monitora filas SQS continuamente
2. **Validação**: Verifica estrutura e campos obrigatórios
3. **Deduplicação**: Verifica se evento já foi processado
4. **Análise**: Determina tipo e complexidade
5. **Roteamento**: Envia para agente apropriado
6. **Tracking**: Atualiza estado e métricas

## Planning Agent

### Responsabilidades

- **Análise de Requisições**: Decomposição de requisições complexas
- **Criação de Planos**: Geração de planos de execução
- **Otimização**: Otimização de sequências e dependências
- **Template Management**: Gerenciamento de templates de planos
- **Dependency Resolution**: Resolução de dependências entre etapas

### Níveis de Complexidade

- **Simple** (1): Operações diretas, sem dependências
- **Moderate** (3): Múltiplas etapas com dependências simples
- **Complex** (5): Dependências complexas, paralelização
- **Critical** (10): Operações críticas com rollback

### Configurações

```javascript
planning: {
  analysis: {
    maxAnalysisTime: 60000, // 1 minuto
    complexityThresholds: {
      simple: 1, moderate: 3, complex: 5, critical: 10
    },
    cacheEnabled: true
  },
  planning: {
    maxStepsPerPlan: 100,
    maxDependencyDepth: 10,
    optimizationEnabled: true
  }
}
```

### Estrutura de Planos

```javascript
{
  id: 'plan-uuid',
  requestId: 'request-uuid',
  complexity: 'moderate',
  steps: [
    {
      id: 'step-1',
      type: 'validation',
      dependencies: [],
      parallel: false,
      timeout: 30000
    }
  ],
  metadata: {
    estimatedDuration: 120000,
    requiredResources: ['sqs', 'api'],
    rollbackSupported: true
  }
}
```

### Fluxo de Planejamento

1. **Recepção**: Recebe requisição de planejamento
2. **Análise**: Avalia complexidade e requisitos
3. **Template Matching**: Busca templates aplicáveis
4. **Decomposição**: Quebra em etapas executáveis
5. **Otimização**: Otimiza sequência e paralelização
6. **Validação**: Verifica dependências circulares
7. **Entrega**: Envia plano para execução

## Execution Agent

### Responsabilidades

- **Execução de Planos**: Execução coordenada de planos
- **Worker Pool**: Gerenciamento de pool de workers
- **Dependency Management**: Controle de dependências entre etapas
- **Parallel Execution**: Execução paralela quando possível
- **Rollback Management**: Reversão em caso de falhas
- **Progress Tracking**: Monitoramento de progresso

### Estados de Execução

- `pending`: Aguardando início
- `running`: Em execução
- `paused`: Pausado temporariamente
- `completed`: Concluído com sucesso
- `failed`: Falhou
- `rolled_back`: Revertido
- `cancelled`: Cancelado

### Configurações

```javascript
execution: {
  execution: {
    maxConcurrentExecutions: 10,
    maxStepsPerExecution: 1000,
    executionTimeout: 3600000, // 1 hora
    stepTimeout: 300000 // 5 minutos
  },
  workers: {
    poolSize: 5,
    workerTimeout: 300000,
    restartOnFailure: true
  },
  rollback: {
    enabled: true,
    autoRollbackOnFailure: false,
    rollbackTimeout: 600000
  }
}
```

### Worker Pool

O Execution Agent mantém um pool de workers para execução paralela:

- **Worker Lifecycle**: Criação, execução, cleanup
- **Load Balancing**: Distribuição equilibrada de carga
- **Health Monitoring**: Monitoramento de saúde dos workers
- **Auto Recovery**: Recuperação automática de falhas

### Fluxo de Execução

1. **Recepção**: Recebe plano de execução
2. **Validação**: Verifica integridade do plano
3. **Scheduling**: Agenda etapas respeitando dependências
4. **Worker Assignment**: Atribui workers disponíveis
5. **Execution**: Executa etapas em paralelo quando possível
6. **Monitoring**: Monitora progresso e saúde
7. **Completion**: Finaliza e reporta resultados
8. **Rollback**: Reverte em caso de falha (se configurado)

## Comunicação Entre Agentes

### Filas SQS

```
Interface → Event:     event-input-queue
Event → Planning:      planning-queue
Planning → Execution:  execution-queue
Execution → Status:    execution-status-queue
DLQ (Dead Letter):     *-dlq
```

### Formato de Mensagens

```javascript
{
  messageId: 'uuid',
  timestamp: '2024-01-01T00:00:00Z',
  source: 'interface-agent',
  target: 'event-agent',
  type: 'event_processing',
  payload: {
    // Dados específicos do tipo
  },
  metadata: {
    correlationId: 'uuid',
    retryCount: 0,
    priority: 'normal'
  }
}
```

## Monitoramento e Observabilidade

### Métricas Coletadas

- **Performance**: Tempo de resposta, throughput
- **Errors**: Taxa de erro, tipos de erro
- **Resources**: CPU, memória, conexões
- **Business**: Eventos processados, planos criados

### Health Checks

Cada agente expõe endpoint `/health` com:

```javascript
{
  status: 'healthy|degraded|unhealthy',
  timestamp: '2024-01-01T00:00:00Z',
  version: '1.0.0',
  dependencies: {
    sqs: 'healthy',
    metrics: 'healthy'
  },
  metrics: {
    uptime: 3600,
    memoryUsage: 0.45,
    activeConnections: 12
  }
}
```

### Logging

Logs estruturados em formato JSON:

```javascript
{
  timestamp: '2024-01-01T00:00:00Z',
  level: 'info',
  service: 'event-agent',
  message: 'Event processed successfully',
  eventId: 'uuid',
  duration: 150,
  metadata: {
    correlationId: 'uuid',
    userId: 'user123'
  }
}
```

## Configuração e Deploy

### Variáveis de Ambiente

Ver arquivo `.env.template` para lista completa de variáveis.

### Scripts de Execução

```bash
# Iniciar agente específico
npm run agent:interface
npm run agent:event
npm run agent:planning
npm run agent:execution

# Iniciar todos os agentes
npm run agents:all

# Executar testes
npm test
npm run test:agents
```

### Docker

```bash
# Build e start com Docker Compose
docker-compose up --build

# Apenas agentes core
docker-compose up interface-agent event-agent planning-agent execution-agent
```

## Troubleshooting

### Problemas Comuns

1. **Agente não inicia**
   - Verificar variáveis de ambiente
   - Verificar disponibilidade de portas
   - Verificar conectividade SQS

2. **Alta latência**
   - Verificar métricas de CPU/memória
   - Verificar profundidade das filas
   - Ajustar configurações de concorrência

3. **Falhas de comunicação**
   - Verificar configurações SQS
   - Verificar conectividade de rede
   - Verificar logs de erro

### Logs de Debug

```bash
# Habilitar logs detalhados
export LOG_LEVEL=debug
export ENABLE_CONSOLE_LOG=true

# Logs específicos por agente
export DEBUG=interface-agent:*
export DEBUG=event-agent:*
```

## Próximos Passos

1. **Implementação de Handlers**: Criar handlers específicos para cada agente
2. **Services Layer**: Implementar lógica de negócio detalhada
3. **Integration Tests**: Testes de integração entre agentes
4. **Performance Tuning**: Otimização de performance
5. **Security Hardening**: Implementação de segurança avançada
6. **Monitoring Dashboard**: Dashboard de monitoramento
7. **Auto-scaling**: Implementação de auto-scaling
8. **Circuit Breakers**: Implementação de circuit breakers