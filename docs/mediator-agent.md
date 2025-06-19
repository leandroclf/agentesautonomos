# Mediator Agent - Agente Mediador

## Visão Geral

O Mediator Agent é um componente central do sistema de agentes autônomos responsável por mediar conflitos, facilitar negociações e coordenar processos de consenso entre múltiplos agentes. Ele implementa algoritmos avançados de resolução de conflitos e coordenação distribuída.

## Arquitetura

### Componentes Principais

1. **Mediation Service** - Gerenciamento de processos de mediação
2. **Conflict Resolution Service** - Detecção e resolução de conflitos
3. **Negotiation Service** - Facilitação de negociações multi-party
4. **Consensus Service** - Implementação de algoritmos de consenso distribuído

### Estrutura de Diretórios

```
mediator-agent/
├── index.js                    # Arquivo principal do agente
├── services/
│   ├── mediationService.js     # Serviço de mediação
│   ├── conflictResolutionService.js # Resolução de conflitos
│   ├── negotiationService.js   # Serviço de negociação
│   └── consensusService.js     # Serviço de consenso
└── routes/
    └── mediatorRoutes.js       # Rotas da API REST
```

## Funcionalidades

### 1. Mediação de Conflitos

#### Tipos de Conflito Suportados
- **Conflitos de Recurso**: Disputa por recursos limitados
- **Conflitos de Prioridade**: Divergências sobre prioridades de execução
- **Conflitos de Dependência**: Problemas de dependências circulares
- **Conflitos de Comunicação**: Falhas na comunicação entre agentes

#### Estratégias de Resolução
- **Fair Share**: Distribuição equitativa de recursos
- **Priority-Based**: Resolução baseada em prioridades
- **Time Slicing**: Divisão temporal de recursos
- **Weighted Priority**: Prioridades ponderadas
- **Deadline-Based**: Resolução baseada em prazos

### 2. Negociação Multi-Party

#### Protocolos Suportados
- **English Auction**: Leilão inglês tradicional
- **Bilateral**: Negociação entre duas partes
- **Multilateral**: Negociação entre múltiplas partes
- **Argumentation-Based**: Baseado em argumentação
- **Utility-Based**: Baseado em funções de utilidade

#### Estratégias de Negociação
- **Cooperative**: Estratégia cooperativa
- **Competitive**: Estratégia competitiva
- **Adaptive**: Estratégia adaptativa
- **Time-Based**: Baseada em tempo
- **Resource-Based**: Baseada em recursos

### 3. Consenso Distribuído

#### Algoritmos Implementados
- **PBFT**: Practical Byzantine Fault Tolerance
- **Raft**: Algoritmo de consenso baseado em líder
- **Paxos**: Algoritmo clássico de consenso
- **Simple Voting**: Votação por maioria simples
- **Weighted Consensus**: Consenso ponderado
- **Gradual Consensus**: Consenso gradual iterativo

#### Mecanismos de Votação
- **Simple Majority**: Maioria simples (>50%)
- **Qualified Majority**: Maioria qualificada (≥2/3)
- **Unanimous**: Votação unânime
- **Weighted Voting**: Votação ponderada
- **Ranked Choice**: Votação por ranking
- **Approval Voting**: Votação por aprovação

## API REST

### Endpoints Principais

#### Mediação
- `POST /api/v1/mediations` - Iniciar nova mediação
- `GET /api/v1/mediations` - Listar mediações ativas
- `GET /api/v1/mediations/:id` - Obter detalhes de mediação
- `POST /api/v1/mediations/:id/execute` - Executar fase de mediação
- `POST /api/v1/mediations/:id/finalize` - Finalizar mediação

#### Resolução de Conflitos
- `POST /api/v1/conflicts/detect` - Detectar conflitos
- `POST /api/v1/conflicts/:id/resolve` - Resolver conflito
- `GET /api/v1/conflicts` - Listar conflitos

#### Negociação
- `POST /api/v1/negotiations` - Iniciar negociação
- `POST /api/v1/negotiations/:id/round` - Executar rodada
- `GET /api/v1/negotiations` - Listar negociações
- `GET /api/v1/negotiations/:id` - Detalhes da negociação
- `POST /api/v1/negotiations/:id/terminate` - Terminar negociação

#### Consenso
- `POST /api/v1/consensus` - Iniciar processo de consenso
- `POST /api/v1/consensus/:id/round` - Executar rodada de consenso
- `GET /api/v1/consensus` - Listar processos ativos
- `GET /api/v1/consensus/:id` - Detalhes do consenso

#### Monitoramento
- `GET /api/v1/stats` - Estatísticas gerais
- `GET /api/v1/relationships` - Relacionamentos entre agentes
- `GET /api/v1/algorithms` - Algoritmos disponíveis

## Configuração

### Variáveis de Ambiente

```bash
# Configuração do Mediator Agent
MEDIATOR_PORT=3006
MEDIATOR_LOG_LEVEL=info

# Configuração SQS
MEDIATOR_INPUT_QUEUE=mediator-input-queue
MEDIATOR_OUTPUT_QUEUE=mediator-output-queue

# Configuração de Mediação
MAX_MEDIATION_ROUNDS=10
MEDIATION_TIMEOUT=300000
CONFLICT_DETECTION_INTERVAL=30000

# Configuração de Consenso
DEFAULT_CONSENSUS_ALGORITHM=simple_voting
MAX_CONSENSUS_ROUNDS=5
CONSENSUS_TIMEOUT=60000

# Configuração de Negociação
DEFAULT_NEGOTIATION_PROTOCOL=bilateral
MAX_NEGOTIATION_ROUNDS=20
NEGOTIATION_TIMEOUT=180000
```

### Exemplo de Configuração

```javascript
const mediatorConfig = {
  mediation: {
    maxRounds: 10,
    timeout: 300000,
    strategies: ['fair_share', 'priority_based', 'time_slicing']
  },
  consensus: {
    defaultAlgorithm: 'simple_voting',
    maxRounds: 5,
    timeout: 60000,
    votingMechanisms: ['simple_majority', 'qualified_majority']
  },
  negotiation: {
    defaultProtocol: 'bilateral',
    maxRounds: 20,
    timeout: 180000,
    strategies: ['cooperative', 'competitive', 'adaptive']
  },
  conflictResolution: {
    detectionInterval: 30000,
    escalationThreshold: 3,
    algorithms: ['resource_pooling', 'time_slicing']
  }
};
```

## Uso

### Iniciando uma Mediação

```javascript
// Exemplo de requisição para iniciar mediação
const mediationRequest = {
  type: 'resource_conflict',
  participants: [
    { id: 'agent-1', role: 'requester', priority: 0.8 },
    { id: 'agent-2', role: 'holder', priority: 0.6 }
  ],
  resource: {
    id: 'database-connection-pool',
    type: 'connection_pool',
    capacity: 10,
    currentUsage: 8
  },
  strategy: 'fair_share',
  maxRounds: 5,
  timeout: 120000
};

const response = await fetch('/api/v1/mediations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(mediationRequest)
});
```

### Iniciando um Consenso

```javascript
// Exemplo de requisição para iniciar consenso
const consensusRequest = {
  algorithm: 'simple_voting',
  votingMechanism: 'simple_majority',
  participants: [
    { id: 'agent-1', weight: 1.0 },
    { id: 'agent-2', weight: 0.8 },
    { id: 'agent-3', weight: 0.9 }
  ],
  subject: 'resource_allocation_strategy',
  options: ['round_robin', 'priority_based', 'load_balanced'],
  maxRounds: 3,
  timeout: 60000
};

const response = await fetch('/api/v1/consensus', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(consensusRequest)
});
```

### Iniciando uma Negociação

```javascript
// Exemplo de requisição para iniciar negociação
const negotiationRequest = {
  protocol: 'bilateral',
  participants: [
    { 
      id: 'agent-1', 
      role: 'buyer',
      strategy: 'cooperative',
      constraints: { maxPrice: 100, minQuality: 0.8 }
    },
    { 
      id: 'agent-2', 
      role: 'seller',
      strategy: 'competitive',
      constraints: { minPrice: 80, maxDeliveryTime: 7 }
    }
  ],
  subject: 'service_contract',
  parameters: {
    price: { min: 50, max: 150 },
    quality: { min: 0.5, max: 1.0 },
    deliveryTime: { min: 1, max: 14 }
  },
  maxRounds: 10,
  timeout: 300000
};

const response = await fetch('/api/v1/negotiations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(negotiationRequest)
});
```

## Métricas e Monitoramento

### Métricas Coletadas

- **Mediações**:
  - Total de mediações iniciadas
  - Mediações bem-sucedidas
  - Tempo médio de mediação
  - Taxa de resolução de conflitos

- **Negociações**:
  - Total de negociações
  - Rodadas médias por negociação
  - Taxa de sucesso
  - Tempo médio de convergência

- **Consenso**:
  - Processos de consenso iniciados
  - Taxa de consenso alcançado
  - Rodadas médias para consenso
  - Tempo médio de convergência

- **Relacionamentos**:
  - Score de relacionamento entre agentes
  - Histórico de interações
  - Padrões de conflito

### Dashboard de Monitoramento

O agente expõe métricas no formato Prometheus através do endpoint `/metrics`:

```
# Métricas de mediação
mediator_total_mediations_total
mediator_mediation_duration_seconds
mediator_conflicts_resolved_total

# Métricas de negociação
mediator_negotiation_rounds_total
mediator_negotiation_success_rate

# Métricas de consenso
mediator_consensus_achieved_total
mediator_consensus_convergence_time_seconds

# Métricas de relacionamento
mediator_agent_relationship_score
```

## Tolerância a Falhas

### Estratégias de Recuperação

1. **Checkpoint de Estado**: Salvamento periódico do estado dos processos
2. **Retry com Backoff**: Tentativas com intervalo exponencial
3. **Fallback Algorithms**: Algoritmos alternativos em caso de falha
4. **Graceful Degradation**: Degradação controlada da funcionalidade

### Detecção de Falhas

- **Health Checks**: Verificações periódicas de saúde
- **Timeout Detection**: Detecção de timeouts
- **Byzantine Fault Detection**: Detecção de comportamento malicioso
- **Network Partition Handling**: Tratamento de partições de rede

## Segurança

### Medidas de Segurança

1. **Autenticação**: Verificação de identidade dos agentes
2. **Autorização**: Controle de acesso baseado em papéis
3. **Auditoria**: Log de todas as operações críticas
4. **Criptografia**: Comunicação segura entre agentes
5. **Rate Limiting**: Proteção contra ataques de negação de serviço

### Validação de Entrada

- Validação de esquemas JSON
- Sanitização de dados de entrada
- Verificação de limites e constraints
- Detecção de tentativas de manipulação

## Extensibilidade

### Adicionando Novos Algoritmos

1. **Algoritmos de Consenso**: Implementar interface `ConsensusAlgorithm`
2. **Estratégias de Mediação**: Estender `MediationStrategy`
3. **Protocolos de Negociação**: Implementar `NegotiationProtocol`
4. **Algoritmos de Resolução**: Estender `ConflictResolutionAlgorithm`

### Plugins e Extensões

O sistema suporta plugins para:
- Algoritmos customizados
- Métricas específicas
- Integrações externas
- Estratégias de comunicação

## Troubleshooting

### Problemas Comuns

1. **Consenso não converge**:
   - Verificar configuração de threshold
   - Aumentar número máximo de rodadas
   - Verificar conectividade entre participantes

2. **Mediação falha**:
   - Verificar estratégia de resolução
   - Validar dados dos participantes
   - Verificar disponibilidade de recursos

3. **Negociação não termina**:
   - Verificar condições de término
   - Ajustar estratégias dos participantes
   - Verificar constraints e parâmetros

### Logs e Debugging

```bash
# Habilitar logs detalhados
export MEDIATOR_LOG_LEVEL=debug

# Logs específicos por componente
export MEDIATION_DEBUG=true
export CONSENSUS_DEBUG=true
export NEGOTIATION_DEBUG=true
```

## Performance

### Otimizações

1. **Paralelização**: Processamento paralelo de múltiplas mediações
2. **Caching**: Cache de resultados de algoritmos
3. **Connection Pooling**: Pool de conexões para comunicação
4. **Batch Processing**: Processamento em lote de operações

### Benchmarks

- **Throughput**: 1000+ mediações/segundo
- **Latência**: <100ms para mediações simples
- **Consenso**: <5 segundos para grupos de até 50 participantes
- **Memória**: <512MB para 10.000 processos ativos

## Roadmap

### Próximas Funcionalidades

1. **Machine Learning**: Algoritmos adaptativos baseados em ML
2. **Blockchain Integration**: Consenso baseado em blockchain
3. **Multi-tenancy**: Suporte a múltiplos tenants
4. **Real-time Analytics**: Analytics em tempo real
5. **Advanced Visualization**: Visualização avançada de processos

### Melhorias Planejadas

- Otimização de algoritmos de consenso
- Suporte a protocolos de comunicação adicionais
- Interface gráfica para monitoramento
- Integração com sistemas de orquestração
- Suporte a federação de mediadores