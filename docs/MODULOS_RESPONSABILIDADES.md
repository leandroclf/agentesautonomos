# Módulos e Responsabilidades do Sistema

## 📋 Sumário

- [Visão Geral dos Módulos](#visão-geral-dos-módulos)
- [Agentes Core](#agentes-core)
- [Agentes Auxiliares](#agentes-auxiliares)
- [Agentes de Infraestrutura](#agentes-de-infraestrutura)
- [Agentes de Gerenciamento](#agentes-de-gerenciamento)
- [Agentes MARL](#agentes-marl)
- [Agentes de Mediação](#agentes-de-mediação)
- [Serviços Compartilhados](#serviços-compartilhados)
- [Matriz de Responsabilidades](#matriz-de-responsabilidades)

## 🎯 Visão Geral dos Módulos

### Hierarquia de Módulos

```
src/agents/
├── core/                    # Agentes principais do sistema
├── auxiliary/               # Agentes de suporte e monitoramento
├── infrastructure/          # Agentes de infraestrutura
├── management/              # Agentes de gerenciamento
├── marl/                    # Agentes de aprendizado multiagente
├── mediation/               # Agentes de mediação e orquestração
└── shared/                  # Serviços e utilitários compartilhados
```

### Classificação por Criticidade

#### 🔴 Críticos (Core)
- Interface Agent
- Event Agent
- Planning Agent
- Execution Agent
- State Management Agent

#### 🟡 Importantes (Auxiliary)
- Monitoring Agent
- Security Agent
- Recovery Agent
- Health Checker

#### 🟢 Opcionais (Enhancement)
- MARL Agents
- Mediation Agents
- Advanced Analytics

## 🏛️ Agentes Core

### Interface Agent

**Localização**: `src/agents/core/interface-agent/`

**Responsabilidades Principais**:
- 🚪 **Gateway de Entrada**: Ponto único de entrada para todas as requisições externas
- 🔍 **Validação de Entrada**: Validação de schema, formato e integridade dos dados
- 🛡️ **Segurança Inicial**: Rate limiting, autenticação básica e sanitização
- 🔄 **Transformação**: Conversão de requests HTTP em eventos internos
- 📤 **Roteamento**: Direcionamento de eventos para agentes apropriados

**Funcionalidades Técnicas**:
```javascript
// Principais métodos do Interface Agent
class InterfaceAgent {
  async validateRequest(request)     // Validação de entrada
  async authenticateUser(credentials) // Autenticação
  async transformToEvent(request)    // Transformação
  async routeEvent(event)           // Roteamento
  async sendAcknowledgment(response) // Resposta
}
```

**Métricas Monitoradas**:
- Requests por segundo
- Latência de resposta
- Taxa de erro por endpoint
- Throughput de transformação

**Dependências**:
- Amazon SQS (envio de eventos)
- Redis (cache de sessões)
- PostgreSQL (log de auditoria)

---

### Event Agent

**Localização**: `src/agents/core/event-agent/`

**Responsabilidades Principais**:
- 📥 **Processamento de Eventos**: Recepção e processamento de eventos do Interface Agent
- 🔍 **Validação de Schema**: Verificação de conformidade com schemas definidos
- 🎯 **Enriquecimento**: Adição de dados contextuais e metadados
- 🧠 **Análise Inteligente**: Detecção de padrões e anomalias
- 🔄 **Coordenação**: Interface com Planning Agent para análise avançada

**Funcionalidades Técnicas**:
```javascript
// Principais métodos do Event Agent
class EventAgent {
  async receiveEvent(event)         // Recepção de eventos
  async validateSchema(event)       // Validação de schema
  async enrichEvent(event)          // Enriquecimento
  async detectPatterns(event)       // Análise de padrões
  async forwardToPlanning(event)    // Encaminhamento
}
```

**Componentes Internos**:
- **EventProcessor**: Processamento principal de eventos
- **SchemaValidator**: Validação de schemas
- **EventEnricher**: Enriquecimento de dados
- **PatternDetector**: Detecção de padrões
- **RetryManager**: Gerenciamento de retry e DLQ

**Métricas Monitoradas**:
- Eventos processados por segundo
- Taxa de enriquecimento bem-sucedido
- Padrões detectados
- Mensagens em DLQ

---

### Planning Agent

**Localização**: `src/agents/core/planning-agent/`

**Responsabilidades Principais**:
- 🧠 **Arquitetura BDI**: Implementação completa de Beliefs, Desires, Intentions
- 📋 **Criação de Planos**: Geração de planos de execução otimizados
- 🔗 **Gerenciamento de Dependências**: Análise e coordenação de dependências entre tarefas
- ⚡ **Otimização**: Otimização de sequência e paralelização de execução
- 💾 **Cache Inteligente**: Cache de planos para reutilização eficiente

**Arquitetura BDI**:
```javascript
// Componentes BDI do Planning Agent
class PlanningAgent {
  constructor() {
    this.beliefManager = new BeliefManager();     // Estado do mundo
    this.desireManager = new DesireManager();     // Objetivos
    this.intentionManager = new IntentionManager(); // Planos ativos
    this.planLibrary = new PlanLibrary();         // Biblioteca de planos
    this.bdiEngine = new BDIEngine();             // Motor BDI
  }
}
```

**Funcionalidades Avançadas**:
- **Belief Revision**: Atualização dinâmica de crenças
- **Goal Decomposition**: Decomposição de objetivos complexos
- **Plan Selection**: Seleção otimizada de planos
- **Intention Scheduling**: Agendamento inteligente de intenções
- **Conflict Resolution**: Resolução de conflitos entre objetivos

**Métricas Monitoradas**:
- Planos criados por minuto
- Taxa de sucesso de execução
- Tempo médio de planejamento
- Cache hit ratio
- Complexidade média dos planos

---

### Execution Agent

**Localização**: `src/agents/core/execution-agent/`

**Responsabilidades Principais**:
- ⚙️ **Execução de Planos**: Execução coordenada de planos criados pelo Planning Agent
- 🔄 **Gerenciamento Concorrente**: Controle de execuções paralelas e concorrentes
- 📊 **Monitoramento de Progresso**: Acompanhamento em tempo real do status de execução
- 🛠️ **Tratamento de Falhas**: Detecção, tratamento e recuperação de falhas
- 📈 **Relatórios**: Geração de relatórios detalhados de execução

**Funcionalidades Técnicas**:
```javascript
// Principais métodos do Execution Agent
class ExecutionAgent {
  async executePlan(plan)           // Execução de plano
  async manageExecution(execution)  // Gerenciamento
  async monitorProgress(taskId)     // Monitoramento
  async handleFailure(error)        // Tratamento de falhas
  async generateReport(execution)   // Relatórios
}
```

**Componentes Internos**:
- **TaskExecutor**: Executor de tarefas individuais
- **ExecutionCoordinator**: Coordenador de execuções
- **ProgressMonitor**: Monitor de progresso
- **FailureHandler**: Tratador de falhas
- **ReportGenerator**: Gerador de relatórios

**Estratégias de Execução**:
- **Sequential**: Execução sequencial de tarefas
- **Parallel**: Execução paralela quando possível
- **Pipeline**: Execução em pipeline para otimização
- **Conditional**: Execução condicional baseada em resultados

---

### State Management Agent

**Localização**: `src/agents/core/state-management-agent/`

**Responsabilidades Principais**:
- 🗄️ **Gerenciamento de Estado**: Manutenção do estado global do sistema
- 🔄 **Sincronização**: Sincronização de estado entre agentes
- 💾 **Persistência**: Persistência confiável de estado crítico
- 🔍 **Consultas**: Interface para consultas de estado
- 📊 **Versionamento**: Controle de versão de estado

**Funcionalidades Técnicas**:
```javascript
// Principais métodos do State Management Agent
class StateManagementAgent {
  async updateState(key, value)     // Atualização de estado
  async getState(key)              // Consulta de estado
  async syncState(agentId)         // Sincronização
  async persistState()             // Persistência
  async rollbackState(version)     // Rollback
}
```

## 🛠️ Agentes Auxiliares

### Monitoring Agent

**Localização**: `src/agents/auxiliary/monitoring-agent/`

**Responsabilidades**:
- 📊 **Coleta de Métricas**: Coleta de métricas de todos os agentes
- 🏥 **Health Checks**: Verificação de saúde dos componentes
- 🚨 **Alertas**: Geração de alertas baseados em thresholds
- 📈 **Dashboards**: Alimentação de dashboards em tempo real

### Security Agent

**Localização**: `src/agents/auxiliary/security-agent/`

**Responsabilidades**:
- 🔐 **Autenticação**: Verificação de identidade de usuários
- 🛡️ **Autorização**: Controle de acesso baseado em roles
- 🔍 **Auditoria**: Log de todas as operações sensíveis
- 🚨 **Detecção de Ameaças**: Identificação de atividades suspeitas

### Recovery Agent

**Localização**: `src/agents/auxiliary/recovery/`

**Responsabilidades**:
- 🔄 **Recuperação Automática**: Recuperação automática de falhas
- 🏥 **Health Restoration**: Restauração de serviços degradados
- 📋 **Fallback Procedures**: Execução de procedimentos de fallback
- 📊 **Recovery Metrics**: Métricas de recuperação e disponibilidade

### Health Checker

**Localização**: `src/agents/auxiliary/health-checker/`

**Responsabilidades**:
- 🏥 **Health Monitoring**: Monitoramento contínuo de saúde
- 🔍 **Dependency Checks**: Verificação de dependências externas
- 📊 **Health Reports**: Relatórios detalhados de saúde
- 🚨 **Proactive Alerts**: Alertas proativos de degradação

### Event Enricher

**Localização**: `src/agents/auxiliary/event-enricher/`

**Responsabilidades**:
- 🎯 **Data Enrichment**: Enriquecimento de eventos com dados externos
- 🔍 **Context Addition**: Adição de contexto relevante
- 🔗 **Reference Resolution**: Resolução de referências externas
- 📊 **Enrichment Metrics**: Métricas de enriquecimento

### Policy Agent

**Localização**: `src/agents/auxiliary/policy-agent/`

**Responsabilidades**:
- 📋 **Policy Enforcement**: Aplicação de políticas de negócio
- 🔍 **Rule Evaluation**: Avaliação de regras complexas
- 📊 **Compliance Monitoring**: Monitoramento de conformidade
- 🔄 **Policy Updates**: Atualização dinâmica de políticas

### Persistence Agent

**Localização**: `src/agents/auxiliary/persistence/`

**Responsabilidades**:
- 💾 **Data Persistence**: Persistência confiável de dados
- 🔄 **Backup Management**: Gerenciamento de backups
- 📊 **Storage Optimization**: Otimização de armazenamento
- 🔍 **Data Retrieval**: Recuperação eficiente de dados

### Lifecycle Manager

**Localização**: `src/agents/auxiliary/lifecycle-manager/`

**Responsabilidades**:
- 🔄 **Agent Lifecycle**: Gerenciamento do ciclo de vida dos agentes
- 🚀 **Deployment**: Deploy automatizado de agentes
- 📊 **Resource Management**: Gerenciamento de recursos
- 🔍 **Version Control**: Controle de versão de agentes

## 🏗️ Agentes de Infraestrutura

### External Gateway

**Localização**: `src/agents/infrastructure/external-gateway/`

**Responsabilidades**:
- 🌐 **External Integration**: Integração com sistemas externos
- 🔗 **API Management**: Gerenciamento de APIs externas
- 🔄 **Protocol Translation**: Tradução entre protocolos
- 📊 **Integration Metrics**: Métricas de integração

## 🎛️ Agentes de Gerenciamento

### Agent Lifecycle Manager

**Localização**: `src/agents/management/agent-lifecycle-manager/`

**Responsabilidades**:
- 🔄 **Lifecycle Orchestration**: Orquestração do ciclo de vida
- 🚀 **Auto Scaling**: Escalabilidade automática
- 📊 **Resource Allocation**: Alocação de recursos
- 🔍 **Performance Monitoring**: Monitoramento de performance

### Message Schema Registry

**Localização**: `src/agents/management/message-schema-registry/`

**Responsabilidades**:
- 📋 **Schema Management**: Gerenciamento de schemas de mensagens
- 🔄 **Version Control**: Controle de versão de schemas
- 🔍 **Validation**: Validação de conformidade
- 📊 **Schema Evolution**: Evolução de schemas

## 🤖 Agentes MARL

### MARL Agent

**Localização**: `src/agents/marl/marl-agent/`

**Responsabilidades**:
- 🧠 **Reinforcement Learning**: Aprendizado por reforço multiagente
- 🎯 **Policy Optimization**: Otimização de políticas
- 📊 **Learning Metrics**: Métricas de aprendizado
- 🔄 **Model Updates**: Atualização de modelos

### Coordination Agent

**Localização**: `src/agents/marl/coordination-agent/`

**Responsabilidades**:
- 🤝 **Agent Coordination**: Coordenação entre agentes
- 📊 **Coordination Metrics**: Métricas de coordenação
- 🔄 **Protocol Management**: Gerenciamento de protocolos
- 🎯 **Optimization**: Otimização de coordenação

## 🎭 Agentes de Mediação

### Mediator Agent

**Localização**: `src/agents/mediation/mediator-agent/`

**Responsabilidades**:
- 🤝 **Conflict Resolution**: Resolução de conflitos
- 📊 **Mediation Metrics**: Métricas de mediação
- 🔄 **Negotiation**: Negociação entre agentes
- 🎯 **Consensus Building**: Construção de consenso

### Orchestrator Agent

**Localização**: `src/agents/mediation/orchestrator-agent/`

**Responsabilidades**:
- 🎼 **Workflow Orchestration**: Orquestração de workflows
- 📊 **Orchestration Metrics**: Métricas de orquestração
- 🔄 **Process Management**: Gerenciamento de processos
- 🎯 **Optimization**: Otimização de workflows

## 🔧 Serviços Compartilhados

### SQS Service

**Localização**: `src/agents/shared/services/sqsService.js`

**Responsabilidades**:
- 📤 **Message Sending**: Envio de mensagens
- 📥 **Message Receiving**: Recepção de mensagens
- 🔄 **Queue Management**: Gerenciamento de filas
- 📊 **SQS Metrics**: Métricas de SQS

### Utilities

**Localização**: `src/agents/shared/utils/`

**Componentes**:
- **coordination.js**: Utilitários de coordenação
- **formatting.js**: Formatação de dados
- **validation.js**: Validação de dados

## 📊 Matriz de Responsabilidades

| Agente | Entrada | Processamento | Saída | Dependências |
|--------|---------|---------------|-------|-------------|
| Interface | HTTP Requests | Validação, Transformação | SQS Events | SQS, Redis |
| Event | SQS Events | Enriquecimento, Análise | SQS Events | SQS, DB |
| Planning | SQS Requests | BDI, Planejamento | SQS Plans | SQS, Cache |
| Execution | SQS Plans | Execução, Monitoramento | SQS Results | SQS, DB |
| Monitoring | Metrics | Agregação, Alertas | Dashboards | Prometheus |
| Security | Auth Requests | Autenticação, Autorização | Auth Tokens | DB, LDAP |
| Recovery | Health Events | Análise, Recuperação | Recovery Actions | All Agents |

---

## 📚 Próximos Passos

Para implementação e configuração detalhada, consulte:

- [Dependências e Configuração](DEPENDENCIAS_CONFIGURACAO.md)
- [Instalação e Execução](INSTALACAO_EXECUCAO.md)
- [API e Endpoints](API_ENDPOINTS.md)
- [Monitoramento e Observabilidade](MONITORAMENTO.md)

---

*Documentação gerada automaticamente - Última atualização: $(date)*