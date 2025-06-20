# Diagramas de Arquitetura - Sistema de Agentes Autônomos

Este documento contém os diagramas de arquitetura do sistema de agentes autônomos baseado em BDI (Belief-Desire-Intention) com Multi-Agent Reinforcement Learning (MARL).

## Índice

1. [Arquitetura Geral do Sistema](#arquitetura-geral-do-sistema)
2. [Arquitetura BDI dos Agentes](#arquitetura-bdi-dos-agentes)
3. [Comunicação entre Agentes](#comunicação-entre-agentes)
4. [Fluxo de Dados](#fluxo-de-dados)
5. [Arquitetura MARL](#arquitetura-marl)
6. [Infraestrutura e Deployment](#infraestrutura-e-deployment)
7. [Monitoramento e Observabilidade](#monitoramento-e-observabilidade)

---

## Arquitetura Geral do Sistema

```mermaid
graph TB
    subgraph "Interface Layer"
        UI[Interface do Usuário]
        API[API Gateway]
        WS[WebSocket Server]
    end

    subgraph "Agent Layer"
        IA[Interface Agent]
        EA[Event Agent]
        PA[Planning Agent]
        EXA[Execution Agent]
        MA[Mediator Agent]
        OA[Orchestrator Agent]
    end

    subgraph "Core Services"
        SR[Schema Registry]
        EE[Event Enricher]
        HC[Health Checker]
        PM[Policy Manager]
    end

    subgraph "MARL Layer"
        ENV[Environment]
        RL[Reinforcement Learning]
        REW[Reward System]
        POL[Policy Network]
    end

    subgraph "Infrastructure"
        SQS[Amazon SQS]
        REDIS[Redis Cache]
        DB[(Database)]
        PROM[Prometheus]
        GRAF[Grafana]
    end

    UI --> API
    API --> IA
    WS --> IA
    
    IA <--> EA
    EA <--> PA
    PA <--> EXA
    MA <--> IA
    MA <--> EA
    MA <--> PA
    MA <--> EXA
    OA <--> PA
    OA <--> EXA
    
    IA --> SR
    EA --> SR
    PA --> SR
    EXA --> SR
    
    EA --> EE
    IA --> HC
    PA --> PM
    
    EA --> ENV
    PA --> RL
    EXA --> REW
    RL --> POL
    
    IA --> SQS
    EA --> SQS
    PA --> SQS
    EXA --> SQS
    MA --> SQS
    OA --> SQS
    
    IA --> REDIS
    EA --> REDIS
    PA --> REDIS
    EXA --> REDIS
    
    IA --> DB
    EA --> DB
    PA --> DB
    EXA --> DB
    
    HC --> PROM
    PROM --> GRAF

    style IA fill:#e1f5fe
    style EA fill:#f3e5f5
    style PA fill:#e8f5e8
    style EXA fill:#fff3e0
    style MA fill:#fce4ec
    style OA fill:#f1f8e9
```

## Arquitetura BDI dos Agentes

```mermaid
graph TB
    subgraph "Agent BDI Architecture"
        subgraph "Beliefs"
            KB[Knowledge Base]
            WM[World Model]
            SM[State Monitor]
        end
        
        subgraph "Desires"
            GS[Goal Set]
            OB[Objectives]
            PR[Preferences]
        end
        
        subgraph "Intentions"
            IP[Intention Pool]
            AP[Action Plans]
            EQ[Execution Queue]
        end
        
        subgraph "Reasoning Engine"
            BR[Belief Revision]
            GG[Goal Generation]
            PF[Plan Formation]
            IS[Intention Selection]
        end
        
        subgraph "Action Layer"
            AE[Action Executor]
            EM[Effect Monitor]
            FB[Feedback Loop]
        end
    end
    
    subgraph "External Environment"
        ENV[Environment]
        OA[Other Agents]
        EV[Events]
    end
    
    ENV --> SM
    OA --> SM
    EV --> SM
    
    SM --> KB
    KB --> WM
    WM --> BR
    
    BR --> GG
    GS --> GG
    OB --> GG
    PR --> GG
    
    GG --> PF
    KB --> PF
    WM --> PF
    
    PF --> AP
    AP --> IS
    GS --> IS
    
    IS --> IP
    IP --> EQ
    EQ --> AE
    
    AE --> ENV
    AE --> OA
    
    AE --> EM
    EM --> FB
    FB --> SM
    FB --> BR
    
    style KB fill:#bbdefb
    style GS fill:#c8e6c9
    style IP fill:#ffcdd2
    style BR fill:#f8bbd9
    style AE fill:#fff9c4
```

## Comunicação entre Agentes

```mermaid
sequenceDiagram
    participant U as User
    participant IA as Interface Agent
    participant EA as Event Agent
    participant PA as Planning Agent
    participant EXA as Execution Agent
    participant MA as Mediator Agent
    participant SQS as Amazon SQS
    
    U->>IA: User Request
    IA->>SQS: Publish Event
    SQS->>EA: Deliver Event
    
    EA->>EA: Process & Enrich Event
    EA->>SQS: Publish Processed Event
    SQS->>PA: Deliver to Planning
    
    PA->>PA: Generate Plan
    PA->>SQS: Publish Plan
    SQS->>EXA: Deliver Plan
    
    EXA->>EXA: Execute Actions
    EXA->>SQS: Publish Results
    
    Note over MA: Monitors all communications
    MA->>MA: Detect Conflicts
    
    alt Conflict Detected
        MA->>SQS: Publish Mediation
        SQS->>PA: Adjust Plan
        SQS->>EXA: Update Execution
    end
    
    SQS->>IA: Deliver Results
    IA->>U: Response
```

## Fluxo de Dados

```mermaid
flowchart TD
    subgraph "Data Sources"
        UI[User Input]
        EXT[External APIs]
        SENS[Sensors]
        LOG[System Logs]
    end
    
    subgraph "Data Ingestion"
        IG[Input Gateway]
        VAL[Validation]
        NORM[Normalization]
    end
    
    subgraph "Event Processing"
        EP[Event Processor]
        ENR[Event Enricher]
        FIL[Event Filter]
        ROT[Event Router]
    end
    
    subgraph "Agent Processing"
        BEL[Belief Update]
        GOAL[Goal Processing]
        PLAN[Plan Generation]
        EXEC[Action Execution]
    end
    
    subgraph "Data Storage"
        CACHE[(Redis Cache)]
        DB[(Primary Database)]
        TS[(Time Series DB)]
        BLOB[(Blob Storage)]
    end
    
    subgraph "Data Output"
        API[API Responses]
        WS[WebSocket Events]
        NOTIF[Notifications]
        METRICS[Metrics]
    end
    
    UI --> IG
    EXT --> IG
    SENS --> IG
    LOG --> IG
    
    IG --> VAL
    VAL --> NORM
    NORM --> EP
    
    EP --> ENR
    ENR --> FIL
    FIL --> ROT
    
    ROT --> BEL
    BEL --> GOAL
    GOAL --> PLAN
    PLAN --> EXEC
    
    BEL --> CACHE
    GOAL --> DB
    PLAN --> DB
    EXEC --> TS
    
    EXEC --> API
    BEL --> WS
    GOAL --> NOTIF
    EXEC --> METRICS
    
    CACHE --> BEL
    DB --> GOAL
    DB --> PLAN
    TS --> METRICS
    
    style EP fill:#e3f2fd
    style BEL fill:#f1f8e9
    style GOAL fill:#fff3e0
    style PLAN fill:#fce4ec
    style EXEC fill:#e8f5e8
```

## Arquitetura MARL

```mermaid
graph TB
    subgraph "Multi-Agent Environment"
        subgraph "Agent 1"
            A1P[Policy π₁]
            A1V[Value Function V₁]
            A1Q[Q-Function Q₁]
        end
        
        subgraph "Agent 2"
            A2P[Policy π₂]
            A2V[Value Function V₂]
            A2Q[Q-Function Q₂]
        end
        
        subgraph "Agent N"
            ANP[Policy πₙ]
            ANV[Value Function Vₙ]
            ANQ[Q-Function Qₙ]
        end
    end
    
    subgraph "Shared Environment"
        STATE[Global State S]
        REWARD[Reward Function R]
        TRANS[Transition Function T]
    end
    
    subgraph "Learning Components"
        EXP[Experience Replay]
        TARGET[Target Networks]
        COORD[Coordination Mechanism]
        COMM[Communication Protocol]
    end
    
    subgraph "Training Infrastructure"
        TRAINER[Distributed Trainer]
        EVAL[Evaluator]
        CHECKPOINT[Model Checkpoints]
        METRICS[Training Metrics]
    end
    
    A1P --> STATE
    A2P --> STATE
    ANP --> STATE
    
    STATE --> REWARD
    REWARD --> A1Q
    REWARD --> A2Q
    REWARD --> ANQ
    
    A1Q --> A1V
    A2Q --> A2V
    ANQ --> ANV
    
    A1V --> A1P
    A2V --> A2P
    ANV --> ANP
    
    A1P --> EXP
    A2P --> EXP
    ANP --> EXP
    
    EXP --> TRAINER
    TARGET --> TRAINER
    COORD --> TRAINER
    COMM --> TRAINER
    
    TRAINER --> A1P
    TRAINER --> A2P
    TRAINER --> ANP
    
    TRAINER --> EVAL
    EVAL --> CHECKPOINT
    EVAL --> METRICS
    
    style A1P fill:#e1f5fe
    style A2P fill:#f3e5f5
    style ANP fill:#e8f5e8
    style STATE fill:#fff3e0
    style REWARD fill:#fce4ec
    style TRAINER fill:#f1f8e9
```

## Infraestrutura e Deployment

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[Application Load Balancer]
    end
    
    subgraph "Application Tier"
        subgraph "Container Cluster"
            POD1[Agent Pod 1]
            POD2[Agent Pod 2]
            POD3[Agent Pod N]
        end
        
        subgraph "API Gateway"
            APIGW[API Gateway]
            AUTH[Auth Service]
            RATE[Rate Limiter]
        end
    end
    
    subgraph "Message Queue"
        SQS[Amazon SQS]
        DLQ[Dead Letter Queue]
    end
    
    subgraph "Cache Layer"
        REDIS[Redis Cluster]
        REDIS_MASTER[Redis Master]
        REDIS_SLAVE[Redis Slaves]
    end
    
    subgraph "Database Layer"
        RDS[Amazon RDS]
        READ_REPLICA[Read Replicas]
        BACKUP[Automated Backups]
    end
    
    subgraph "Storage"
        S3[Amazon S3]
        LOGS[Log Storage]
        MODELS[Model Storage]
    end
    
    subgraph "Monitoring"
        CW[CloudWatch]
        PROM[Prometheus]
        GRAF[Grafana]
        ALERT[AlertManager]
    end
    
    LB --> APIGW
    APIGW --> AUTH
    APIGW --> RATE
    APIGW --> POD1
    APIGW --> POD2
    APIGW --> POD3
    
    POD1 --> SQS
    POD2 --> SQS
    POD3 --> SQS
    SQS --> DLQ
    
    POD1 --> REDIS_MASTER
    POD2 --> REDIS_MASTER
    POD3 --> REDIS_MASTER
    REDIS_MASTER --> REDIS_SLAVE
    
    POD1 --> RDS
    POD2 --> READ_REPLICA
    POD3 --> READ_REPLICA
    RDS --> BACKUP
    
    POD1 --> S3
    POD2 --> LOGS
    POD3 --> MODELS
    
    POD1 --> CW
    POD2 --> PROM
    POD3 --> GRAF
    PROM --> ALERT
    
    style LB fill:#e3f2fd
    style APIGW fill:#f1f8e9
    style SQS fill:#fff3e0
    style REDIS fill:#fce4ec
    style RDS fill:#e8f5e8
```

## Monitoramento e Observabilidade

```mermaid
graph TB
    subgraph "Application Layer"
        APP[Applications]
        AGENTS[Agents]
        SERVICES[Services]
    end
    
    subgraph "Instrumentation"
        METRICS[Metrics Collection]
        LOGS[Log Aggregation]
        TRACES[Distributed Tracing]
        EVENTS[Event Tracking]
    end
    
    subgraph "Collection & Storage"
        PROM[Prometheus]
        ELK[ELK Stack]
        JAEGER[Jaeger]
        INFLUX[InfluxDB]
    end
    
    subgraph "Analysis & Alerting"
        GRAF[Grafana]
        KIBANA[Kibana]
        ALERT[AlertManager]
        ML[ML Anomaly Detection]
    end
    
    subgraph "Dashboards"
        OPS[Operations Dashboard]
        BIZ[Business Dashboard]
        DEV[Development Dashboard]
        SLA[SLA Dashboard]
    end
    
    APP --> METRICS
    AGENTS --> LOGS
    SERVICES --> TRACES
    APP --> EVENTS
    
    METRICS --> PROM
    LOGS --> ELK
    TRACES --> JAEGER
    EVENTS --> INFLUX
    
    PROM --> GRAF
    ELK --> KIBANA
    PROM --> ALERT
    INFLUX --> ML
    
    GRAF --> OPS
    KIBANA --> BIZ
    JAEGER --> DEV
    ML --> SLA
    
    ALERT --> OPS
    ML --> ALERT
    
    style METRICS fill:#e1f5fe
    style LOGS fill:#f3e5f5
    style TRACES fill:#e8f5e8
    style EVENTS fill:#fff3e0
    style GRAF fill:#fce4ec
    style ALERT fill:#f1f8e9
```

---

## Convenções dos Diagramas

### Cores
- **Azul claro**: Componentes de interface e entrada
- **Rosa claro**: Componentes de processamento de eventos
- **Verde claro**: Componentes de planejamento e execução
- **Laranja claro**: Componentes de dados e armazenamento
- **Roxo claro**: Componentes de mediação e coordenação
- **Amarelo claro**: Componentes de monitoramento e observabilidade

### Símbolos
- **Retângulos**: Serviços e componentes
- **Cilindros**: Bancos de dados e armazenamento
- **Losangos**: Pontos de decisão
- **Círculos**: Pontos de entrada/saída
- **Setas**: Fluxo de dados/controle

### Agrupamentos
- **Subgrafos**: Camadas lógicas da arquitetura
- **Clusters**: Componentes relacionados
- **Namespaces**: Separação de responsabilidades

---

*Última atualização: 2024-12-19*
*Versão: 1.0.0*