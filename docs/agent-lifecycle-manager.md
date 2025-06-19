# Agent Lifecycle Manager

## Visão Geral

O **Agent Lifecycle Manager** é um componente crítico do sistema de agentes autônomos responsável por gerenciar o ciclo de vida completo de todos os agentes. Ele atua como o orquestrador central que controla a inicialização, parada, reinicialização e monitoramento contínuo de todos os agentes do sistema.

## Funcionalidades Principais

### 🔄 Gerenciamento de Ciclo de Vida
- **Inicialização de Agentes**: Start individual ou em lote com verificação de dependências
- **Parada Controlada**: Stop gracioso ou forçado com timeout configurável
- **Reinicialização Inteligente**: Restart com políticas automáticas e controle de falhas
- **Coordenação de Dependências**: Gerenciamento da ordem de inicialização baseada em dependências

### 📊 Monitoramento e Observabilidade
- **Health Checks**: Verificação contínua da saúde dos agentes
- **Métricas Prometheus**: Coleta e exposição de métricas detalhadas
- **Event Sourcing**: Registro completo de eventos do ciclo de vida
- **Dashboard em Tempo Real**: Status visual de todos os agentes

### 🔧 Automação e Recuperação
- **Auto-restart**: Políticas configuráveis de reinicialização automática
- **Detecção de Falhas**: Identificação proativa de agentes com problemas
- **Integração com Recovery Agent**: Coordenação para ações de recuperação
- **Fallback Actions**: Execução de ações alternativas em caso de falha

### 🗂️ Registro e Configuração
- **Agent Registry**: Catálogo centralizado de todos os agentes
- **Configuração Dinâmica**: Atualização de configurações sem restart
- **Validação de Configuração**: Verificação de integridade das configurações
- **Backup e Restore**: Exportação/importação do estado do registry

## Arquitetura

### Componentes Principais

```
├── services/
│   ├── lifecycleService.js      # Orquestração do ciclo de vida
│   ├── agentRegistryService.js  # Gerenciamento do registro de agentes
│   ├── processManagerService.js # Controle de processos do sistema
│   └── eventService.js          # Gerenciamento de eventos e SQS
├── routes/
│   ├── api.js                   # Endpoints da API REST
│   ├── health.js                # Health checks
│   └── metrics.js               # Métricas Prometheus
├── middleware/
│   └── index.js                 # Middlewares de segurança e validação
├── config/
│   └── lifecycleConfig.js       # Configurações do agente
└── tests/
    └── lifecycle.test.js        # Testes automatizados
```

### Integração SQS

**Filas Consumidas:**
- `recovery-actions`: Ações de recuperação do Recovery Agent
- `fallback-actions`: Ações de fallback em caso de falha

**Filas Produzidas:**
- `lifecycle-events`: Eventos do ciclo de vida dos agentes
- `agent-failure-events`: Notificações de falhas de agentes

### Fluxo de Operação

1. **Inicialização**
   - Carrega configurações e dependências
   - Inicializa serviços internos
   - Constrói mapa de dependências
   - Inicia monitoramento

2. **Monitoramento Contínuo**
   - Executa health checks periódicos
   - Coleta métricas de performance
   - Detecta falhas e anomalias
   - Atualiza cache de estados

3. **Gerenciamento de Falhas**
   - Detecta agentes com problemas
   - Executa estratégias de recuperação
   - Coordena com Recovery Agent
   - Implementa fallbacks quando necessário

4. **Deployments**
   - Valida pré-condições
   - Executa estratégia escolhida
   - Monitora progresso
   - Executa rollback se necessário

## Configuração

### Variáveis de Ambiente Principais

```bash
# Servidor
PORT=3021
NODE_ENV=production

# AWS SQS
AWS_REGION=us-east-1
SQS_QUEUE_LIFECYCLE_EVENTS=agent-lifecycle-events

# Monitoramento
MONITORING_INTERVAL=30000
HEALTH_CHECK_INTERVAL=60000

# Deployment
DEPLOYMENT_STRATEGY=rolling
ROLLBACK_ON_FAILURE=true
```

### Configuração de Agentes

O sistema mantém um registro completo de todos os agentes:

```javascript
const agentRegistry = {
  'data-ingestion': {
    name: 'Data Ingestion Agent',
    port: 3001,
    healthEndpoint: '/health',
    dependencies: [],
    group: 'core'
  },
  'nlp-processor': {
    name: 'NLP Processor Agent',
    port: 3002,
    healthEndpoint: '/health',
    dependencies: ['data-ingestion'],
    group: 'processing'
  }
  // ... outros agentes
}
```

## API Endpoints

### Informações do Sistema

```http
GET /health
GET /metrics
GET /system/info
```

### Gerenciamento de Agentes

```http
GET /agents                    # Lista todos os agentes
GET /agents/:id               # Informações de um agente específico
POST /agents/:id/start        # Inicia um agente
POST /agents/:id/stop         # Para um agente
POST /agents/:id/restart      # Reinicia um agente
GET /agents/:id/health        # Health check de um agente
```

### Dependências

```http
GET /dependencies             # Mapa completo de dependências
GET /dependencies/:id         # Dependências de um agente específico
```

### Deployments

```http
POST /deployments            # Inicia um novo deployment
GET /deployments/:id         # Status de um deployment
POST /deployments/:id/cancel # Cancela um deployment
GET /deployments/active      # Deployments ativos
GET /deployments/history     # Histórico de deployments
```

## Estratégias de Deployment

### 1. Rolling Deployment

**Características:**
- Atualização gradual em batches
- Sem downtime do sistema
- Rollback rápido se necessário

**Configuração:**
```javascript
rolling: {
  batchSize: 2,           // Agentes por batch
  delay: 5000,           // Delay entre batches
  healthCheckTimeout: 60000
}
```

**Processo:**
1. Divide agentes em batches
2. Para agentes do primeiro batch
3. Atualiza e reinicia
4. Verifica health checks
5. Continua para próximo batch

### 2. Blue-Green Deployment

**Características:**
- Dois ambientes idênticos
- Troca instantânea
- Rollback imediato

**Configuração:**
```javascript
blueGreen: {
  testDuration: 30000,    // Tempo de teste do ambiente green
  switchTimeout: 10000    // Timeout para troca
}
```

**Processo:**
1. Prepara ambiente "green"
2. Testa novo ambiente
3. Troca tráfego para green
4. Mantém blue como backup

### 3. Canary Deployment

**Características:**
- Teste com subconjunto
- Validação gradual
- Rollback baseado em métricas

**Configuração:**
```javascript
canary: {
  percentage: 20,         // % de agentes para canary
  duration: 60000,        // Duração do teste
  successThreshold: 0.95  // Taxa de sucesso mínima
}
```

**Processo:**
1. Seleciona agentes para canary
2. Atualiza subset canary
3. Monitora métricas
4. Rollout completo se bem-sucedido

## Monitoramento e Métricas

### Métricas Principais

```prometheus
# Estados dos agentes
agent_status{agent_id, status}

# Operações de lifecycle
lifecycle_operations_total{operation, status}

# Health checks
health_check_duration_seconds{agent_id}
health_check_success_rate{agent_id}

# Deployments
deployments_total{strategy, status}
deployment_duration_seconds{strategy}

# Dependências
dependency_violations_total{agent_id}
dependency_resolution_time_seconds
```

### Alertas Configurados

- **Agent Down**: Agente parou de responder
- **Health Check Failed**: Falha em health check
- **Deployment Failed**: Falha em deployment
- **Dependency Violation**: Violação de dependência
- **High Restart Rate**: Taxa alta de reinicializações

## Integração com Outros Agentes

### Health Checker Agent
- Recebe resultados de health checks
- Coordena verificações de saúde
- Compartilha métricas de saúde

### Recovery Agent
- Notifica sobre necessidade de recuperação
- Coordena estratégias de recovery
- Recebe feedback de recuperação

### Fallback Agent
- Ativa fallbacks quando necessário
- Coordena degradação graceful
- Monitora circuit breakers

### Persistence Agent
- Persiste estados dos agentes
- Recupera estados após reinicializações
- Mantém histórico de operações

## Casos de Uso

### 1. Inicialização do Sistema

```javascript
// Inicialização ordenada por dependências
const initializationOrder = [
  ['data-ingestion', 'message-queue'],           // Grupo 1: Infraestrutura
  ['nlp-processor', 'ml-inference'],             // Grupo 2: Processamento
  ['api-gateway', 'user-interaction'],           // Grupo 3: Interface
  ['health-checker', 'monitoring']               // Grupo 4: Monitoramento
]

for (const group of initializationOrder) {
  await Promise.all(group.map(agentId => 
    lifecycleManager.startAgent(agentId)
  ))
  await waitForHealthChecks(group)
}
```

### 2. Deployment de Atualização

```javascript
// Rolling deployment de agentes de processamento
const deploymentResult = await lifecycleManager.deploy({
  strategy: 'rolling',
  agents: ['nlp-processor', 'ml-inference', 'data-processor'],
  options: {
    batchSize: 1,
    healthCheckTimeout: 30000
  }
})

if (!deploymentResult.success) {
  // Rollback automático já executado
  console.log('Deployment falhou:', deploymentResult.error)
}
```

### 3. Recuperação de Falha

```javascript
// Detecção e recuperação automática
lifecycleManager.on('agentFailed', async (agentId, error) => {
  console.log(`Agente ${agentId} falhou:`, error)
  
  // Tentar reinicialização
  const restartResult = await lifecycleManager.restartAgent(agentId)
  
  if (!restartResult.success) {
    // Escalar para Recovery Agent
    await recoveryAgent.initiateRecovery(agentId, error)
  }
})
```

## Segurança

### Controle de Acesso
- Autenticação via JWT para APIs administrativas
- Rate limiting para prevenir abuso
- Validação de entrada em todos os endpoints
- Logs de auditoria para operações críticas

### Comunicação Segura
- TLS para comunicação entre agentes
- Criptografia de mensagens SQS
- Validação de integridade de comandos
- Timeout para operações críticas

## Troubleshooting

### Problemas Comuns

**1. Agente não inicia**
```bash
# Verificar dependências
curl http://localhost:3021/dependencies/agent-id

# Verificar logs
docker logs agent-lifecycle-manager

# Tentar inicialização manual
curl -X POST http://localhost:3021/agents/agent-id/start
```

**2. Deployment falha**
```bash
# Verificar status do deployment
curl http://localhost:3021/deployments/deployment-id

# Verificar agentes ativos
curl http://localhost:3021/agents

# Executar rollback manual se necessário
curl -X POST http://localhost:3021/deployments/deployment-id/cancel
```

**3. Health checks falhando**
```bash
# Verificar conectividade
curl http://localhost:3021/agents/agent-id/health

# Verificar métricas
curl http://localhost:3021/metrics

# Reiniciar agente específico
curl -X POST http://localhost:3021/agents/agent-id/restart
```

### Logs Importantes

```bash
# Logs de lifecycle
tail -f logs/lifecycle-service.log

# Logs de deployment
tail -f logs/deployment-service.log

# Logs de dependências
tail -f logs/dependency-service.log
```

## Performance e Otimização

### Configurações de Performance

```javascript
// Otimizações para alta carga
const performanceConfig = {
  maxConcurrentOperations: 10,
  operationTimeout: 60000,
  batchProcessingSize: 5,
  cacheEnabled: true,
  cacheTTL: 300000
}
```

### Métricas de Performance

- **Tempo de Inicialização**: < 30 segundos
- **Tempo de Health Check**: < 5 segundos
- **Tempo de Deployment**: < 5 minutos
- **Disponibilidade**: > 99.9%
- **Tempo de Recuperação**: < 2 minutos

## Desenvolvimento e Testes

### Executar Localmente

```bash
# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env

# Executar em modo desenvolvimento
npm run dev

# Executar testes
npm test

# Executar com coverage
npm run test:coverage
```

### Docker

```bash
# Build da imagem
docker build -t agent-lifecycle-manager .

# Executar container
docker run -p 3021:3021 \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  agent-lifecycle-manager
```

### Testes de Integração

```bash
# Testar health endpoint
curl http://localhost:3021/health

# Testar listagem de agentes
curl http://localhost:3021/agents

# Testar deployment
curl -X POST http://localhost:3021/deployments \
  -H "Content-Type: application/json" \
  -d '{"strategy":"rolling","agents":["test-agent"]}'
```

## Roadmap

### Versão 1.1
- [ ] Interface web para gerenciamento
- [ ] Suporte a Kubernetes
- [ ] Métricas avançadas de ML
- [ ] Integração com Grafana

### Versão 1.2
- [ ] Auto-scaling baseado em carga
- [ ] Deployment multi-região
- [ ] Backup automático de configurações
- [ ] API GraphQL

### Versão 2.0
- [ ] Machine Learning para predição de falhas
- [ ] Otimização automática de recursos
- [ ] Integração com service mesh
- [ ] Suporte a serverless

---

**Localização**: `src/agents/management/agent-lifecycle-manager/`  
**Porta**: 3021  
**Fila SQS**: `agent-lifecycle-events`  
**Dependências**: Health Checker, Recovery Agent, Fallback Agent, Persistence Agent  
**Status**: ✅ Implementado (Agente 19/21)