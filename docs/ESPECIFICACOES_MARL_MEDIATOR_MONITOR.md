# Especificações Técnicas - MARL, Mediator e Monitor & Rewards

## 4. MARL Agent - Especificação Técnica Detalhada

### 4.1 Visão Geral
O MARL (Multi-Agent Reinforcement Learning) Agent implementa aprendizado por reforço para otimização contínua do sistema multi-agente.

### 4.2 Requisitos Funcionais
- **RF001**: Coletar estados do sistema em tempo real
- **RF002**: Executar ações de otimização baseadas em políticas aprendidas
- **RF003**: Calcular recompensas baseadas em métricas de performance
- **RF004**: Atualizar políticas usando algoritmos de aprendizado por reforço
- **RF005**: Manter histórico de experiências para replay
- **RF006**: Coordenar com outros agentes MARL

### 4.3 Arquitetura Interna

```
┌─────────────────────────────────────────────────────────────┐
│                      MARL Agent                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    State    │  │   Action    │  │       Reward        │  │
│  │   Manager   │  │   Manager   │  │      Calculator     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                 │                    │            │
│         └─────────────────┼────────────────────┘            │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Learning Engine                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │    DQN      │  │    PPO      │  │     Experience  │  │  │
│  │  │   Network   │  │   Network   │  │      Replay     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Coordination Layer                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   Message   │  │   Policy    │  │     Consensus   │  │  │
│  │  │   Passing   │  │   Sharing   │  │    Protocol     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Modelo de Estado (State)

#### 4.4.1 Esquema de Estado
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "timestamp": {"type": "string", "format": "date-time"},
    "systemMetrics": {
      "type": "object",
      "properties": {
        "cpu": {
          "type": "object",
          "properties": {
            "utilization": {"type": "number", "minimum": 0, "maximum": 1},
            "load_average": {"type": "array", "items": {"type": "number"}},
            "cores_active": {"type": "integer"}
          }
        },
        "memory": {
          "type": "object",
          "properties": {
            "utilization": {"type": "number", "minimum": 0, "maximum": 1},
            "available_gb": {"type": "number"},
            "swap_usage": {"type": "number"}
          }
        },
        "network": {
          "type": "object",
          "properties": {
            "throughput_mbps": {"type": "number"},
            "latency_ms": {"type": "number"},
            "packet_loss": {"type": "number"}
          }
        }
      }
    },
    "queueMetrics": {
      "type": "object",
      "properties": {
        "depths": {
          "type": "object",
          "patternProperties": {
            ".*": {"type": "integer", "minimum": 0}
          }
        },
        "throughput": {
          "type": "object",
          "patternProperties": {
            ".*": {"type": "number", "minimum": 0}
          }
        },
        "latencies": {
          "type": "object",
          "patternProperties": {
            ".*": {
              "type": "object",
              "properties": {
                "p50": {"type": "number"},
                "p95": {"type": "number"},
                "p99": {"type": "number"}
              }
            }
          }
        }
      }
    },
    "agentMetrics": {
      "type": "object",
      "patternProperties": {
        ".*": {
          "type": "object",
          "properties": {
            "utilization": {"type": "number", "minimum": 0, "maximum": 1},
            "response_time": {"type": "number"},
            "error_rate": {"type": "number", "minimum": 0, "maximum": 1},
            "active_tasks": {"type": "integer", "minimum": 0}
          }
        }
      }
    },
    "businessMetrics": {
      "type": "object",
      "properties": {
        "sla_compliance": {"type": "number", "minimum": 0, "maximum": 1},
        "customer_satisfaction": {"type": "number", "minimum": 0, "maximum": 1},
        "cost_efficiency": {"type": "number", "minimum": 0, "maximum": 1},
        "revenue_impact": {"type": "number"}
      }
    }
  },
  "required": ["timestamp", "systemMetrics", "queueMetrics", "agentMetrics"]
}
```

#### 4.4.2 Exemplo de Estado
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "systemMetrics": {
    "cpu": {
      "utilization": 0.75,
      "load_average": [2.1, 1.8, 1.5],
      "cores_active": 6
    },
    "memory": {
      "utilization": 0.68,
      "available_gb": 12.5,
      "swap_usage": 0.02
    },
    "network": {
      "throughput_mbps": 850.3,
      "latency_ms": 15.2,
      "packet_loss": 0.001
    }
  },
  "queueMetrics": {
    "depths": {
      "beliefs-queue": 45,
      "desires-queue": 23,
      "intentions-queue": 12,
      "execution-queue": 8
    },
    "throughput": {
      "beliefs-queue": 150.5,
      "desires-queue": 89.2,
      "intentions-queue": 67.8,
      "execution-queue": 45.3
    },
    "latencies": {
      "beliefs-queue": {"p50": 50, "p95": 120, "p99": 200},
      "desires-queue": {"p50": 75, "p95": 180, "p99": 300}
    }
  },
  "agentMetrics": {
    "interface-agent": {
      "utilization": 0.82,
      "response_time": 45.3,
      "error_rate": 0.015,
      "active_tasks": 12
    },
    "event-agent": {
      "utilization": 0.67,
      "response_time": 89.7,
      "error_rate": 0.008,
      "active_tasks": 8
    },
    "planning-agent": {
      "utilization": 0.91,
      "response_time": 234.5,
      "error_rate": 0.022,
      "active_tasks": 15
    }
  },
  "businessMetrics": {
    "sla_compliance": 0.987,
    "customer_satisfaction": 0.923,
    "cost_efficiency": 0.856,
    "revenue_impact": 15420.50
  }
}
```

### 4.5 Modelo de Ações (Actions)

#### 4.5.1 Esquema de Ações
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "actionType": {
      "type": "string",
      "enum": ["scale", "prioritize", "redistribute", "optimize", "alert"]
    },
    "target": {
      "type": "object",
      "properties": {
        "component": {"type": "string"},
        "instance": {"type": "string"},
        "scope": {"type": "string", "enum": ["local", "global", "cluster"]}
      }
    },
    "parameters": {
      "type": "object",
      "properties": {
        "intensity": {"type": "number", "minimum": 0, "maximum": 1},
        "duration": {"type": "string"},
        "conditions": {"type": "object"},
        "rollback_threshold": {"type": "number"}
      }
    },
    "constraints": {
      "type": "object",
      "properties": {
        "max_cost": {"type": "number"},
        "max_disruption": {"type": "number"},
        "required_approval": {"type": "boolean"}
      }
    }
  },
  "required": ["actionType", "target", "parameters"]
}
```

#### 4.5.2 Catálogo de Ações
```json
{
  "actions": {
    "scale_up_agent": {
      "actionType": "scale",
      "description": "Increase agent capacity",
      "target": {"component": "agent", "scope": "local"},
      "parameters": {
        "scale_factor": {"type": "number", "min": 1.1, "max": 3.0},
        "duration": {"type": "string", "default": "10m"}
      },
      "cost": {"computational": "medium", "financial": "low"}
    },
    "prioritize_queue": {
      "actionType": "prioritize",
      "description": "Adjust queue processing priority",
      "target": {"component": "queue", "scope": "local"},
      "parameters": {
        "priority_boost": {"type": "number", "min": 1.1, "max": 2.0},
        "affected_messages": {"type": "string", "enum": ["new", "existing", "all"]}
      },
      "cost": {"computational": "low", "financial": "none"}
    },
    "redistribute_load": {
      "actionType": "redistribute",
      "description": "Redistribute workload between agents",
      "target": {"component": "system", "scope": "global"},
      "parameters": {
        "source_agents": {"type": "array"},
        "target_agents": {"type": "array"},
        "percentage": {"type": "number", "min": 0.1, "max": 0.5}
      },
      "cost": {"computational": "high", "financial": "medium"}
    },
    "optimize_resources": {
      "actionType": "optimize",
      "description": "Optimize resource allocation",
      "target": {"component": "resources", "scope": "cluster"},
      "parameters": {
        "optimization_target": {"type": "string", "enum": ["performance", "cost", "balanced"]},
        "aggressiveness": {"type": "number", "min": 0.1, "max": 1.0}
      },
      "cost": {"computational": "high", "financial": "variable"}
    }
  }
}
```

### 4.6 Sistema de Recompensas

#### 4.6.1 Função de Recompensa
```javascript
class RewardCalculator {
  constructor() {
    this.weights = {
      performance: 0.4,
      efficiency: 0.3,
      cost: 0.2,
      stability: 0.1
    };
  }
  
  calculateReward(previousState, action, currentState) {
    const performanceReward = this.calculatePerformanceReward(previousState, currentState);
    const efficiencyReward = this.calculateEfficiencyReward(previousState, currentState);
    const costReward = this.calculateCostReward(action, currentState);
    const stabilityReward = this.calculateStabilityReward(previousState, currentState);
    
    const totalReward = 
      performanceReward * this.weights.performance +
      efficiencyReward * this.weights.efficiency +
      costReward * this.weights.cost +
      stabilityReward * this.weights.stability;
    
    return {
      total: totalReward,
      components: {
        performance: performanceReward,
        efficiency: efficiencyReward,
        cost: costReward,
        stability: stabilityReward
      },
      metadata: {
        action: action,
        timestamp: new Date().toISOString()
      }
    };
  }
  
  calculatePerformanceReward(prevState, currState) {
    // Melhoria na latência média
    const latencyImprovement = this.calculateLatencyImprovement(prevState, currState);
    
    // Melhoria no throughput
    const throughputImprovement = this.calculateThroughputImprovement(prevState, currState);
    
    // Redução na taxa de erro
    const errorReduction = this.calculateErrorReduction(prevState, currState);
    
    return (latencyImprovement + throughputImprovement + errorReduction) / 3;
  }
  
  calculateEfficiencyReward(prevState, currState) {
    // Utilização de recursos
    const resourceUtilization = this.calculateResourceUtilization(currState);
    
    // Balanceamento de carga
    const loadBalance = this.calculateLoadBalance(currState);
    
    // Eficiência de filas
    const queueEfficiency = this.calculateQueueEfficiency(currState);
    
    return (resourceUtilization + loadBalance + queueEfficiency) / 3;
  }
}
```

### 4.7 Algoritmos de Aprendizado

#### 4.7.1 Deep Q-Network (DQN)
```javascript
class DQNAgent {
  constructor(stateSize, actionSize, config) {
    this.stateSize = stateSize;
    this.actionSize = actionSize;
    this.memory = new ExperienceReplay(config.memorySize);
    this.epsilon = config.epsilon;
    this.epsilonDecay = config.epsilonDecay;
    this.epsilonMin = config.epsilonMin;
    this.learningRate = config.learningRate;
    this.gamma = config.gamma;
    
    this.qNetwork = this.buildNetwork();
    this.targetNetwork = this.buildNetwork();
    this.updateTargetNetwork();
  }
  
  buildNetwork() {
    const model = tf.sequential();
    
    model.add(tf.layers.dense({
      units: 128,
      activation: 'relu',
      inputShape: [this.stateSize]
    }));
    
    model.add(tf.layers.dropout({rate: 0.2}));
    
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu'
    }));
    
    model.add(tf.layers.dropout({rate: 0.2}));
    
    model.add(tf.layers.dense({
      units: this.actionSize,
      activation: 'linear'
    }));
    
    model.compile({
      optimizer: tf.train.adam(this.learningRate),
      loss: 'meanSquaredError'
    });
    
    return model;
  }
  
  selectAction(state) {
    if (Math.random() <= this.epsilon) {
      return Math.floor(Math.random() * this.actionSize);
    }
    
    const qValues = this.qNetwork.predict(tf.tensor2d([state]));
    return qValues.argMax(1).dataSync()[0];
  }
  
  remember(state, action, reward, nextState, done) {
    this.memory.add({
      state: state,
      action: action,
      reward: reward,
      nextState: nextState,
      done: done
    });
  }
  
  async replay(batchSize) {
    if (this.memory.size() < batchSize) return;
    
    const batch = this.memory.sample(batchSize);
    const states = batch.map(e => e.state);
    const nextStates = batch.map(e => e.nextState);
    
    const qValues = await this.qNetwork.predict(tf.tensor2d(states));
    const nextQValues = await this.targetNetwork.predict(tf.tensor2d(nextStates));
    
    const targets = qValues.arraySync();
    
    for (let i = 0; i < batch.length; i++) {
      const experience = batch[i];
      let target = experience.reward;
      
      if (!experience.done) {
        target += this.gamma * Math.max(...nextQValues.arraySync()[i]);
      }
      
      targets[i][experience.action] = target;
    }
    
    await this.qNetwork.fit(
      tf.tensor2d(states),
      tf.tensor2d(targets),
      {epochs: 1, verbose: 0}
    );
    
    if (this.epsilon > this.epsilonMin) {
      this.epsilon *= this.epsilonDecay;
    }
  }
}
```

## 5. Mediator Agent - Especificação Técnica Detalhada

### 5.1 Visão Geral
O Mediator Agent resolve conflitos entre agentes e coordena ações concorrentes no sistema.

### 5.2 Arquitetura Interna

```
┌─────────────────────────────────────────────────────────────┐
│                    Mediator Agent                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Conflict  │  │ Arbitration │  │     Coordination    │  │
│  │  Detector   │  │   Engine    │  │      Manager        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                 │                    │            │
│         └─────────────────┼────────────────────┘            │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Resolution Engine                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │    Rule     │  │  Strategy   │  │    Consensus    │  │  │
│  │  │   Engine    │  │  Selector   │  │    Builder      │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Detecção de Conflitos

#### 5.3.1 Tipos de Conflito
```javascript
class ConflictDetector {
  constructor() {
    this.conflictTypes = {
      RESOURCE_CONTENTION: 'resource_contention',
      ACTION_CONTRADICTION: 'action_contradiction',
      TEMPORAL_OVERLAP: 'temporal_overlap',
      PRIORITY_INVERSION: 'priority_inversion',
      DEADLOCK_POTENTIAL: 'deadlock_potential'
    };
  }
  
  detectConflicts(intentions) {
    const conflicts = [];
    
    for (let i = 0; i < intentions.length; i++) {
      for (let j = i + 1; j < intentions.length; j++) {
        const conflict = this.analyzeIntentionPair(intentions[i], intentions[j]);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }
    
    return conflicts;
  }
  
  analyzeIntentionPair(intention1, intention2) {
    // Verificar conflito de recursos
    const resourceConflict = this.checkResourceConflict(intention1, intention2);
    if (resourceConflict) {
      return {
        type: this.conflictTypes.RESOURCE_CONTENTION,
        intentions: [intention1.id, intention2.id],
        details: resourceConflict,
        severity: this.calculateSeverity(resourceConflict)
      };
    }
    
    // Verificar contradição de ações
    const actionConflict = this.checkActionContradiction(intention1, intention2);
    if (actionConflict) {
      return {
        type: this.conflictTypes.ACTION_CONTRADICTION,
        intentions: [intention1.id, intention2.id],
        details: actionConflict,
        severity: this.calculateSeverity(actionConflict)
      };
    }
    
    // Verificar sobreposição temporal
    const temporalConflict = this.checkTemporalOverlap(intention1, intention2);
    if (temporalConflict) {
      return {
        type: this.conflictTypes.TEMPORAL_OVERLAP,
        intentions: [intention1.id, intention2.id],
        details: temporalConflict,
        severity: this.calculateSeverity(temporalConflict)
      };
    }
    
    return null;
  }
}
```

### 5.4 Estratégias de Resolução

#### 5.4.1 Catálogo de Estratégias
```json
{
  "resolutionStrategies": {
    "priority_based": {
      "name": "Priority-Based Resolution",
      "description": "Resolve conflicts based on intention priority",
      "applicableConflicts": ["resource_contention", "action_contradiction"],
      "algorithm": "highest_priority_wins",
      "parameters": {
        "tie_breaker": "timestamp",
        "priority_boost": 0.1
      }
    },
    "temporal_separation": {
      "name": "Temporal Separation",
      "description": "Separate conflicting actions in time",
      "applicableConflicts": ["temporal_overlap", "resource_contention"],
      "algorithm": "schedule_sequentially",
      "parameters": {
        "min_separation": "30s",
        "max_delay": "5m"
      }
    },
    "resource_sharing": {
      "name": "Resource Sharing",
      "description": "Share resources between conflicting intentions",
      "applicableConflicts": ["resource_contention"],
      "algorithm": "proportional_allocation",
      "parameters": {
        "allocation_method": "weighted_fair_queuing",
        "min_allocation": 0.1
      }
    },
    "negotiation": {
      "name": "Agent Negotiation",
      "description": "Let agents negotiate resolution",
      "applicableConflicts": ["action_contradiction", "priority_inversion"],
      "algorithm": "auction_based",
      "parameters": {
        "max_rounds": 3,
        "timeout": "60s"
      }
    },
    "escalation": {
      "name": "Human Escalation",
      "description": "Escalate to human operator",
      "applicableConflicts": ["deadlock_potential"],
      "algorithm": "human_intervention",
      "parameters": {
        "escalation_level": "supervisor",
        "timeout": "300s"
      }
    }
  }
}
```

#### 5.4.2 Engine de Arbitragem
```javascript
class ArbitrationEngine {
  constructor() {
    this.strategies = new StrategyRegistry();
    this.negotiator = new AgentNegotiator();
    this.escalationManager = new EscalationManager();
  }
  
  async resolveConflict(conflict) {
    const strategy = this.selectStrategy(conflict);
    
    try {
      const resolution = await this.applyStrategy(strategy, conflict);
      
      if (resolution.success) {
        return {
          status: 'resolved',
          strategy: strategy.name,
          resolution: resolution,
          timestamp: new Date().toISOString()
        };
      } else {
        return await this.escalateConflict(conflict, resolution);
      }
    } catch (error) {
      return await this.handleResolutionError(conflict, error);
    }
  }
  
  selectStrategy(conflict) {
    const applicableStrategies = this.strategies.getApplicableStrategies(conflict.type);
    
    // Ordenar por eficácia histórica
    const rankedStrategies = applicableStrategies.sort((a, b) => 
      b.successRate - a.successRate
    );
    
    return rankedStrategies[0];
  }
  
  async applyStrategy(strategy, conflict) {
    switch (strategy.algorithm) {
      case 'highest_priority_wins':
        return this.applyPriorityResolution(conflict, strategy.parameters);
      
      case 'schedule_sequentially':
        return this.applyTemporalSeparation(conflict, strategy.parameters);
      
      case 'proportional_allocation':
        return this.applyResourceSharing(conflict, strategy.parameters);
      
      case 'auction_based':
        return this.negotiator.conductAuction(conflict, strategy.parameters);
      
      case 'human_intervention':
        return this.escalationManager.escalate(conflict, strategy.parameters);
      
      default:
        throw new Error(`Unknown strategy algorithm: ${strategy.algorithm}`);
    }
  }
}
```

## 6. Monitor & Rewards Engine - Especificação Técnica Detalhada

### 6.1 Visão Geral
O Monitor & Rewards Engine coleta métricas do sistema e calcula recompensas para o aprendizado MARL.

### 6.2 Arquitetura de Monitoramento

```
┌─────────────────────────────────────────────────────────────┐
│                Monitor & Rewards Engine                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Metrics   │  │   Event     │  │      Anomaly        │  │
│  │ Collector   │  │  Processor  │  │     Detector        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                 │                    │            │
│         └─────────────────┼────────────────────┘            │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Rewards Engine                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   Reward    │  │  Business   │  │     Learning    │  │  │
│  │  │ Calculator  │  │   Rules     │  │    Feedback     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Analytics Engine                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   Trend     │  │ Prediction  │  │   Optimization  │  │  │
│  │  │  Analysis   │  │   Models    │  │   Suggestions   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Sistema de Métricas

#### 6.3.1 Configuração de Métricas
```json
{
  "metricsConfiguration": {
    "collection": {
      "interval": "10s",
      "retention": "7d",
      "aggregation_windows": ["1m", "5m", "15m", "1h", "1d"]
    },
    "categories": {
      "system": {
        "metrics": [
          {
            "name": "cpu_utilization",
            "type": "gauge",
            "unit": "percentage",
            "source": "system_monitor",
            "thresholds": {"warning": 0.8, "critical": 0.95}
          },
          {
            "name": "memory_utilization",
            "type": "gauge",
            "unit": "percentage",
            "source": "system_monitor",
            "thresholds": {"warning": 0.85, "critical": 0.95}
          },
          {
            "name": "disk_io_rate",
            "type": "counter",
            "unit": "operations_per_second",
            "source": "system_monitor"
          }
        ]
      },
      "application": {
        "metrics": [
          {
            "name": "request_latency",
            "type": "histogram",
            "unit": "milliseconds",
            "source": "application_monitor",
            "buckets": [10, 50, 100, 250, 500, 1000, 2500, 5000]
          },
          {
            "name": "error_rate",
            "type": "gauge",
            "unit": "percentage",
            "source": "application_monitor",
            "thresholds": {"warning": 0.05, "critical": 0.1}
          },
          {
            "name": "throughput",
            "type": "counter",
            "unit": "requests_per_second",
            "source": "application_monitor"
          }
        ]
      },
      "business": {
        "metrics": [
          {
            "name": "sla_compliance",
            "type": "gauge",
            "unit": "percentage",
            "source": "business_monitor",
            "thresholds": {"warning": 0.95, "critical": 0.9}
          },
          {
            "name": "customer_satisfaction",
            "type": "gauge",
            "unit": "score",
            "source": "feedback_system",
            "range": [0, 1]
          }
        ]
      }
    }
  }
}
```

#### 6.3.2 Coletor de Métricas
```javascript
class MetricsCollector {
  constructor(config) {
    this.config = config;
    this.collectors = new Map();
    this.storage = new MetricsStorage();
    this.aggregator = new MetricsAggregator();
  }
  
  async initialize() {
    // Inicializar coletores para cada categoria
    for (const [category, categoryConfig] of Object.entries(this.config.categories)) {
      const collector = this.createCollector(category, categoryConfig);
      this.collectors.set(category, collector);
    }
    
    // Iniciar coleta periódica
    this.startPeriodicCollection();
  }
  
  createCollector(category, config) {
    switch (category) {
      case 'system':
        return new SystemMetricsCollector(config);
      case 'application':
        return new ApplicationMetricsCollector(config);
      case 'business':
        return new BusinessMetricsCollector(config);
      default:
        throw new Error(`Unknown metrics category: ${category}`);
    }
  }
  
  async collectMetrics() {
    const timestamp = new Date();
    const allMetrics = {};
    
    for (const [category, collector] of this.collectors) {
      try {
        const metrics = await collector.collect();
        allMetrics[category] = {
          timestamp: timestamp,
          metrics: metrics
        };
      } catch (error) {
        console.error(`Error collecting ${category} metrics:`, error);
      }
    }
    
    // Armazenar métricas
    await this.storage.store(allMetrics);
    
    // Agregar métricas
    await this.aggregator.aggregate(allMetrics);
    
    return allMetrics;
  }
}
```

### 6.4 Engine de Recompensas Avançado

#### 6.4.1 Calculadora de Recompensas Multi-Objetivo
```javascript
class MultiObjectiveRewardCalculator {
  constructor() {
    this.objectives = {
      performance: new PerformanceObjective(),
      efficiency: new EfficiencyObjective(),
      cost: new CostObjective(),
      reliability: new ReliabilityObjective(),
      scalability: new ScalabilityObjective()
    };
    
    this.weights = {
      performance: 0.3,
      efficiency: 0.25,
      cost: 0.2,
      reliability: 0.15,
      scalability: 0.1
    };
  }
  
  calculateReward(context) {
    const objectiveScores = {};
    let totalReward = 0;
    
    for (const [name, objective] of Object.entries(this.objectives)) {
      const score = objective.evaluate(context);
      objectiveScores[name] = score;
      totalReward += score * this.weights[name];
    }
    
    // Aplicar bônus/penalidades especiais
    const bonuses = this.calculateBonuses(context, objectiveScores);
    const penalties = this.calculatePenalties(context, objectiveScores);
    
    totalReward += bonuses - penalties;
    
    return {
      total: Math.max(-1, Math.min(1, totalReward)), // Normalizar entre -1 e 1
      objectives: objectiveScores,
      bonuses: bonuses,
      penalties: penalties,
      metadata: {
        timestamp: new Date().toISOString(),
        context: context.id
      }
    };
  }
  
  calculateBonuses(context, scores) {
    let bonuses = 0;
    
    // Bônus por melhoria consistente
    if (this.isConsistentImprovement(context)) {
      bonuses += 0.1;
    }
    
    // Bônus por atingir múltiplos objetivos
    const highScores = Object.values(scores).filter(score => score > 0.8).length;
    if (highScores >= 3) {
      bonuses += 0.15;
    }
    
    // Bônus por inovação (ações não usuais que deram certo)
    if (context.action.novelty > 0.7 && scores.performance > 0.6) {
      bonuses += 0.05;
    }
    
    return bonuses;
  }
  
  calculatePenalties(context, scores) {
    let penalties = 0;
    
    // Penalidade por degradação severa
    const lowScores = Object.values(scores).filter(score => score < -0.5).length;
    if (lowScores > 0) {
      penalties += 0.2 * lowScores;
    }
    
    // Penalidade por violação de SLA
    if (context.slaViolation) {
      penalties += 0.3;
    }
    
    // Penalidade por instabilidade
    if (context.systemInstability > 0.5) {
      penalties += 0.15;
    }
    
    return penalties;
  }
}
```

Esta especificação técnica detalhada fornece a base completa para implementação dos componentes MARL, Mediator e Monitor & Rewards Engine, integrando-se perfeitamente com a arquitetura BDI existente e mantendo compatibilidade com o sistema SQS atual.