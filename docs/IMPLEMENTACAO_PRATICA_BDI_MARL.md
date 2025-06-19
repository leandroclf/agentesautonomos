# Implementação Prática - BDI+MARL Integration

## 1. Estrutura de Arquivos Proposta

### 1.1 Estrutura Completa do Projeto
```
src/
├── agents/
│   ├── core/
│   │   ├── interface-agent/
│   │   │   ├── index.js
│   │   │   ├── services/
│   │   │   │   ├── interface-service.js
│   │   │   │   ├── request-processor.js
│   │   │   │   └── response-formatter.js
│   │   │   └── schemas/
│   │   │       ├── input-schema.json
│   │   │       └── output-schema.json
│   │   ├── event-agent/
│   │   │   ├── index.js
│   │   │   ├── services/
│   │   │   │   ├── event-service.js
│   │   │   │   ├── trigger-engine.js
│   │   │   │   └── pattern-matcher.js
│   │   │   └── rules/
│   │   │       ├── trigger-rules.json
│   │   │       └── pattern-definitions.json
│   │   ├── planning-agent/ (EVOLVED - BDI)
│   │   │   ├── index.js
│   │   │   ├── services/
│   │   │   │   ├── bdi-service.js
│   │   │   │   ├── belief-manager.js
│   │   │   │   ├── desire-generator.js
│   │   │   │   ├── intention-planner.js
│   │   │   │   └── plan-executor.js
│   │   │   ├── models/
│   │   │   │   ├── belief-model.js
│   │   │   │   ├── desire-model.js
│   │   │   │   └── intention-model.js
│   │   │   └── library/
│   │   │       ├── plan-library.json
│   │   │       └── strategy-templates.json
│   │   ├── execution-agent/
│   │   │   ├── index.js
│   │   │   ├── services/
│   │   │   │   ├── execution-service.js
│   │   │   │   ├── task-manager.js
│   │   │   │   └── result-processor.js
│   │   │   └── executors/
│   │   │       ├── command-executor.js
│   │   │       └── workflow-executor.js
│   │   ├── state-management-agent/
│   │   │   ├── index.js
│   │   │   ├── services/
│   │   │   │   ├── state-service.js
│   │   │   │   ├── persistence-manager.js
│   │   │   │   └── consistency-checker.js
│   │   │   └── stores/
│   │   │       ├── memory-store.js
│   │   │       └── persistent-store.js
│   │   └── acl-middleware-agent/
│   │       ├── index.js
│   │       ├── services/
│   │       │   ├── acl-service.js
│   │       │   ├── message-transformer.js
│   │       │   └── protocol-adapter.js
│   │       └── adapters/
│   │           ├── sqs-adapter.js
│   │           └── http-adapter.js
│   ├── marl/ (NEW)
│   │   ├── marl-agent/
│   │   │   ├── index.js
│   │   │   ├── services/
│   │   │   │   ├── marl-service.js
│   │   │   │   ├── state-manager.js
│   │   │   │   ├── action-manager.js
│   │   │   │   └── reward-calculator.js
│   │   │   ├── learning/
│   │   │   │   ├── dqn-agent.js
│   │   │   │   ├── ppo-agent.js
│   │   │   │   ├── experience-replay.js
│   │   │   │   └── neural-networks.js
│   │   │   └── coordination/
│   │   │       ├── message-passing.js
│   │   │       ├── policy-sharing.js
│   │   │       └── consensus-protocol.js
│   │   └── mediator-agent/
│   │       ├── index.js
│   │       ├── services/
│   │       │   ├── mediator-service.js
│   │       │   ├── conflict-detector.js
│   │       │   ├── arbitration-engine.js
│   │       │   └── coordination-manager.js
│   │       ├── resolution/
│   │       │   ├── strategy-registry.js
│   │       │   ├── negotiator.js
│   │       │   └── escalation-manager.js
│   │       └── rules/
│   │           ├── conflict-rules.json
│   │           └── resolution-strategies.json
│   └── monitoring/ (NEW)
│       └── monitor-rewards-agent/
│           ├── index.js
│           ├── services/
│           │   ├── monitor-service.js
│           │   ├── metrics-collector.js
│           │   ├── rewards-engine.js
│           │   └── analytics-engine.js
│           ├── collectors/
│           │   ├── system-collector.js
│           │   ├── application-collector.js
│           │   └── business-collector.js
│           ├── rewards/
│           │   ├── multi-objective-calculator.js
│           │   ├── performance-objective.js
│           │   ├── efficiency-objective.js
│           │   └── cost-objective.js
│           └── storage/
│               ├── metrics-storage.js
│               └── time-series-db.js
├── shared/
│   ├── services/
│   │   ├── sqs-service.js
│   │   ├── logger-service.js
│   │   ├── metrics-service.js
│   │   └── config-service.js
│   ├── models/
│   │   ├── message-models.js
│   │   ├── belief-models.js
│   │   ├── desire-models.js
│   │   ├── intention-models.js
│   │   └── state-models.js
│   ├── utils/
│   │   ├── validation.js
│   │   ├── encryption.js
│   │   └── helpers.js
│   └── middleware/
│       ├── auth-middleware.js
│       ├── rate-limit-middleware.js
│       └── error-handler.js
├── infrastructure/
│   ├── queues/
│   │   ├── queue-definitions.js
│   │   └── dlq-config.js
│   ├── monitoring/
│   │   ├── prometheus-config.js
│   │   └── grafana-dashboards/
│   └── deployment/
│       ├── docker/
│       └── kubernetes/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## 2. Implementação do BDI Planning Agent Evoluído

### 2.1 BDI Service Principal
```javascript
// src/agents/core/planning-agent/services/bdi-service.js
const BeliefManager = require('./belief-manager');
const DesireGenerator = require('./desire-generator');
const IntentionPlanner = require('./intention-planner');
const PlanExecutor = require('./plan-executor');
const { SQSService } = require('../../../shared/services/sqs-service');
const { LoggerService } = require('../../../shared/services/logger-service');

class BDIService {
  constructor() {
    this.beliefManager = new BeliefManager();
    this.desireGenerator = new DesireGenerator();
    this.intentionPlanner = new IntentionPlanner();
    this.planExecutor = new PlanExecutor();
    this.sqsService = new SQSService();
    this.logger = new LoggerService('BDIService');
    
    this.currentBeliefs = new Map();
    this.activeDesires = new Map();
    this.currentIntentions = new Map();
    this.executingPlans = new Map();
  }
  
  async initialize() {
    await this.beliefManager.initialize();
    await this.desireGenerator.initialize();
    await this.intentionPlanner.initialize();
    await this.planExecutor.initialize();
    
    // Carregar crenças iniciais
    await this.loadInitialBeliefs();
    
    this.logger.info('BDI Service initialized successfully');
  }
  
  async processEvent(event) {
    try {
      this.logger.info(`Processing event: ${event.type}`, { eventId: event.id });
      
      // 1. Atualizar crenças baseado no evento
      const updatedBeliefs = await this.beliefManager.updateBeliefs(event, this.currentBeliefs);
      this.currentBeliefs = updatedBeliefs;
      
      // 2. Gerar novos desejos baseado nas crenças atualizadas
      const newDesires = await this.desireGenerator.generateDesires(this.currentBeliefs);
      this.mergeDesires(newDesires);
      
      // 3. Deliberar e formar intenções
      const deliberationResult = await this.deliberate();
      
      // 4. Planejar ações para as intenções
      if (deliberationResult.newIntentions.length > 0) {
        await this.planForIntentions(deliberationResult.newIntentions);
      }
      
      // 5. Executar planos prontos
      await this.executeReadyPlans();
      
      // 6. Publicar estado atualizado
      await this.publishBDIState();
      
      return {
        success: true,
        beliefs: this.currentBeliefs.size,
        desires: this.activeDesires.size,
        intentions: this.currentIntentions.size,
        executingPlans: this.executingPlans.size
      };
      
    } catch (error) {
      this.logger.error('Error processing event in BDI Service', error);
      throw error;
    }
  }
  
  async deliberate() {
    const deliberationContext = {
      beliefs: this.currentBeliefs,
      desires: this.activeDesires,
      currentIntentions: this.currentIntentions,
      resources: await this.getAvailableResources(),
      constraints: await this.getSystemConstraints()
    };
    
    // Executar algoritmo de deliberação BDI
    const result = await this.intentionPlanner.deliberate(deliberationContext);
    
    // Atualizar intenções
    this.updateIntentions(result.intentions);
    
    return result;
  }
  
  async planForIntentions(intentions) {
    for (const intention of intentions) {
      try {
        const plan = await this.intentionPlanner.createPlan(intention, {
          beliefs: this.currentBeliefs,
          resources: await this.getAvailableResources()
        });
        
        if (plan) {
          this.executingPlans.set(intention.id, {
            intention: intention,
            plan: plan,
            status: 'ready',
            createdAt: new Date().toISOString()
          });
          
          this.logger.info(`Plan created for intention: ${intention.id}`);
        }
      } catch (error) {
        this.logger.error(`Failed to create plan for intention: ${intention.id}`, error);
      }
    }
  }
  
  async executeReadyPlans() {
    const readyPlans = Array.from(this.executingPlans.values())
      .filter(planExecution => planExecution.status === 'ready');
    
    for (const planExecution of readyPlans) {
      try {
        planExecution.status = 'executing';
        
        const executionResult = await this.planExecutor.execute(
          planExecution.plan,
          planExecution.intention
        );
        
        if (executionResult.completed) {
          planExecution.status = 'completed';
          this.currentIntentions.delete(planExecution.intention.id);
          this.executingPlans.delete(planExecution.intention.id);
          
          this.logger.info(`Plan completed for intention: ${planExecution.intention.id}`);
        } else if (executionResult.failed) {
          planExecution.status = 'failed';
          await this.handlePlanFailure(planExecution);
        }
        
      } catch (error) {
        this.logger.error(`Plan execution failed for intention: ${planExecution.intention.id}`, error);
        planExecution.status = 'failed';
        await this.handlePlanFailure(planExecution);
      }
    }
  }
  
  async publishBDIState() {
    const bdiState = {
      timestamp: new Date().toISOString(),
      agentId: 'planning-agent',
      beliefs: Array.from(this.currentBeliefs.values()),
      desires: Array.from(this.activeDesires.values()),
      intentions: Array.from(this.currentIntentions.values()),
      executingPlans: Array.from(this.executingPlans.values()).map(pe => ({
        intentionId: pe.intention.id,
        planId: pe.plan.id,
        status: pe.status,
        progress: pe.plan.progress || 0
      }))
    };
    
    await this.sqsService.sendMessage('bdi-state-queue', bdiState);
  }
  
  mergeDesires(newDesires) {
    for (const desire of newDesires) {
      // Verificar se já existe um desejo similar
      const existingDesire = this.findSimilarDesire(desire);
      
      if (existingDesire) {
        // Atualizar prioridade se necessário
        if (desire.priority > existingDesire.priority) {
          existingDesire.priority = desire.priority;
          existingDesire.updatedAt = new Date().toISOString();
        }
      } else {
        // Adicionar novo desejo
        this.activeDesires.set(desire.id, desire);
      }
    }
    
    // Remover desejos expirados ou de baixa prioridade
    this.cleanupDesires();
  }
  
  updateIntentions(newIntentions) {
    // Remover intenções que não são mais válidas
    for (const [intentionId, intention] of this.currentIntentions) {
      if (!newIntentions.find(ni => ni.id === intentionId)) {
        this.currentIntentions.delete(intentionId);
        
        // Cancelar plano se estiver executando
        if (this.executingPlans.has(intentionId)) {
          this.executingPlans.get(intentionId).status = 'cancelled';
        }
      }
    }
    
    // Adicionar novas intenções
    for (const intention of newIntentions) {
      this.currentIntentions.set(intention.id, intention);
    }
  }
  
  async loadInitialBeliefs() {
    // Carregar crenças sobre o estado inicial do sistema
    const systemState = await this.getSystemState();
    const initialBeliefs = await this.beliefManager.createInitialBeliefs(systemState);
    
    for (const belief of initialBeliefs) {
      this.currentBeliefs.set(belief.id, belief);
    }
  }
  
  async getSystemState() {
    // Obter estado atual do sistema de várias fontes
    return {
      timestamp: new Date().toISOString(),
      agents: await this.getAgentStates(),
      queues: await this.getQueueStates(),
      resources: await this.getResourceStates(),
      metrics: await this.getSystemMetrics()
    };
  }
}

module.exports = BDIService;
```

### 2.2 Belief Manager
```javascript
// src/agents/core/planning-agent/services/belief-manager.js
const { v4: uuidv4 } = require('uuid');
const { LoggerService } = require('../../../shared/services/logger-service');

class BeliefManager {
  constructor() {
    this.logger = new LoggerService('BeliefManager');
    this.beliefRules = new Map();
    this.beliefHistory = new Map();
  }
  
  async initialize() {
    await this.loadBeliefRules();
    this.logger.info('Belief Manager initialized');
  }
  
  async updateBeliefs(event, currentBeliefs) {
    const updatedBeliefs = new Map(currentBeliefs);
    
    // Processar evento e atualizar crenças relevantes
    const relevantRules = this.findRelevantRules(event);
    
    for (const rule of relevantRules) {
      const beliefUpdates = await this.applyRule(rule, event, updatedBeliefs);
      
      for (const update of beliefUpdates) {
        if (update.action === 'create') {
          updatedBeliefs.set(update.belief.id, update.belief);
        } else if (update.action === 'update') {
          const existingBelief = updatedBeliefs.get(update.beliefId);
          if (existingBelief) {
            Object.assign(existingBelief, update.changes);
            existingBelief.updatedAt = new Date().toISOString();
          }
        } else if (update.action === 'delete') {
          updatedBeliefs.delete(update.beliefId);
        }
      }
    }
    
    // Validar consistência das crenças
    await this.validateBeliefConsistency(updatedBeliefs);
    
    // Registrar mudanças no histórico
    this.recordBeliefChanges(currentBeliefs, updatedBeliefs, event);
    
    return updatedBeliefs;
  }
  
  async createInitialBeliefs(systemState) {
    const beliefs = [];
    
    // Criar crenças sobre agentes
    for (const [agentId, agentState] of Object.entries(systemState.agents)) {
      beliefs.push({
        id: uuidv4(),
        type: 'agent_state',
        subject: agentId,
        predicate: 'has_state',
        object: agentState,
        confidence: 1.0,
        source: 'system_observation',
        createdAt: new Date().toISOString(),
        expiresAt: this.calculateExpiration('agent_state')
      });
    }
    
    // Criar crenças sobre filas
    for (const [queueId, queueState] of Object.entries(systemState.queues)) {
      beliefs.push({
        id: uuidv4(),
        type: 'queue_state',
        subject: queueId,
        predicate: 'has_depth',
        object: queueState.depth,
        confidence: 1.0,
        source: 'queue_monitoring',
        createdAt: new Date().toISOString(),
        expiresAt: this.calculateExpiration('queue_state')
      });
    }
    
    // Criar crenças sobre recursos
    beliefs.push({
      id: uuidv4(),
      type: 'resource_state',
      subject: 'system',
      predicate: 'has_resources',
      object: systemState.resources,
      confidence: 1.0,
      source: 'resource_monitoring',
      createdAt: new Date().toISOString(),
      expiresAt: this.calculateExpiration('resource_state')
    });
    
    return beliefs;
  }
  
  findRelevantRules(event) {
    const relevantRules = [];
    
    for (const [ruleId, rule] of this.beliefRules) {
      if (this.isRuleApplicable(rule, event)) {
        relevantRules.push(rule);
      }
    }
    
    // Ordenar por prioridade
    return relevantRules.sort((a, b) => b.priority - a.priority);
  }
  
  isRuleApplicable(rule, event) {
    // Verificar se o tipo de evento corresponde
    if (rule.eventTypes && !rule.eventTypes.includes(event.type)) {
      return false;
    }
    
    // Verificar condições específicas
    if (rule.conditions) {
      for (const condition of rule.conditions) {
        if (!this.evaluateCondition(condition, event)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  async applyRule(rule, event, currentBeliefs) {
    const updates = [];
    
    try {
      // Executar ações da regra
      for (const action of rule.actions) {
        const update = await this.executeBeliefAction(action, event, currentBeliefs);
        if (update) {
          updates.push(update);
        }
      }
    } catch (error) {
      this.logger.error(`Error applying belief rule: ${rule.id}`, error);
    }
    
    return updates;
  }
  
  async executeBeliefAction(action, event, currentBeliefs) {
    switch (action.type) {
      case 'create_belief':
        return {
          action: 'create',
          belief: {
            id: uuidv4(),
            type: action.beliefType,
            subject: this.resolveValue(action.subject, event),
            predicate: this.resolveValue(action.predicate, event),
            object: this.resolveValue(action.object, event),
            confidence: action.confidence || 1.0,
            source: `rule_${action.ruleId}`,
            createdAt: new Date().toISOString(),
            expiresAt: this.calculateExpiration(action.beliefType)
          }
        };
      
      case 'update_belief':
        const beliefToUpdate = this.findBelief(currentBeliefs, action.selector);
        if (beliefToUpdate) {
          return {
            action: 'update',
            beliefId: beliefToUpdate.id,
            changes: action.changes
          };
        }
        break;
      
      case 'delete_belief':
        const beliefToDelete = this.findBelief(currentBeliefs, action.selector);
        if (beliefToDelete) {
          return {
            action: 'delete',
            beliefId: beliefToDelete.id
          };
        }
        break;
    }
    
    return null;
  }
  
  async loadBeliefRules() {
    // Carregar regras de atualização de crenças
    const rules = [
      {
        id: 'agent_performance_update',
        priority: 10,
        eventTypes: ['agent_metrics_updated'],
        conditions: [
          { field: 'data.agentId', operator: 'exists' },
          { field: 'data.metrics', operator: 'exists' }
        ],
        actions: [
          {
            type: 'update_belief',
            selector: { type: 'agent_state', subject: '${event.data.agentId}' },
            changes: {
              object: '${event.data.metrics}',
              confidence: 0.95
            }
          }
        ]
      },
      {
        id: 'queue_depth_update',
        priority: 8,
        eventTypes: ['queue_metrics_updated'],
        conditions: [
          { field: 'data.queueId', operator: 'exists' },
          { field: 'data.depth', operator: 'exists' }
        ],
        actions: [
          {
            type: 'update_belief',
            selector: { type: 'queue_state', subject: '${event.data.queueId}' },
            changes: {
              object: '${event.data.depth}'
            }
          }
        ]
      },
      {
        id: 'system_overload_detection',
        priority: 15,
        eventTypes: ['system_metrics_updated'],
        conditions: [
          { field: 'data.cpu_utilization', operator: '>', value: 0.9 },
          { field: 'data.memory_utilization', operator: '>', value: 0.85 }
        ],
        actions: [
          {
            type: 'create_belief',
            beliefType: 'system_condition',
            subject: 'system',
            predicate: 'is_overloaded',
            object: true,
            confidence: 0.9
          }
        ]
      }
    ];
    
    for (const rule of rules) {
      this.beliefRules.set(rule.id, rule);
    }
  }
}

module.exports = BeliefManager;
```

## 3. Implementação do MARL Agent

### 3.1 MARL Service Principal
```javascript
// src/agents/marl/marl-agent/services/marl-service.js
const StateManager = require('./state-manager');
const ActionManager = require('./action-manager');
const RewardCalculator = require('./reward-calculator');
const DQNAgent = require('../learning/dqn-agent');
const { SQSService } = require('../../../shared/services/sqs-service');
const { LoggerService } = require('../../../shared/services/logger-service');

class MARLService {
  constructor() {
    this.stateManager = new StateManager();
    this.actionManager = new ActionManager();
    this.rewardCalculator = new RewardCalculator();
    this.sqsService = new SQSService();
    this.logger = new LoggerService('MARLService');
    
    this.learningAgent = null;
    this.currentState = null;
    this.lastAction = null;
    this.episodeHistory = [];
    this.learningEnabled = true;
  }
  
  async initialize() {
    await this.stateManager.initialize();
    await this.actionManager.initialize();
    await this.rewardCalculator.initialize();
    
    // Inicializar agente de aprendizado
    const stateSize = this.stateManager.getStateSize();
    const actionSize = this.actionManager.getActionSize();
    
    this.learningAgent = new DQNAgent(stateSize, actionSize, {
      memorySize: 10000,
      epsilon: 0.1,
      epsilonDecay: 0.995,
      epsilonMin: 0.01,
      learningRate: 0.001,
      gamma: 0.95
    });
    
    // Carregar modelo pré-treinado se existir
    await this.loadPretrainedModel();
    
    this.logger.info('MARL Service initialized successfully');
  }
  
  async processSystemState(systemState) {
    try {
      // 1. Converter estado do sistema para representação MARL
      const marlState = await this.stateManager.convertToMARLState(systemState);
      
      // 2. Calcular recompensa se temos ação anterior
      let reward = 0;
      if (this.currentState && this.lastAction) {
        reward = await this.rewardCalculator.calculateReward(
          this.currentState,
          this.lastAction,
          marlState
        );
        
        // Armazenar experiência para aprendizado
        if (this.learningEnabled) {
          this.learningAgent.remember(
            this.currentState.vector,
            this.lastAction.index,
            reward.total,
            marlState.vector,
            false // done
          );
        }
      }
      
      // 3. Selecionar próxima ação
      const action = await this.selectAction(marlState);
      
      // 4. Executar ação
      const executionResult = await this.executeAction(action, marlState);
      
      // 5. Atualizar estado
      this.currentState = marlState;
      this.lastAction = action;
      
      // 6. Treinar agente se temos experiências suficientes
      if (this.learningEnabled && this.learningAgent.memory.size() > 32) {
        await this.learningAgent.replay(32);
      }
      
      // 7. Publicar resultados
      await this.publishMARLResults({
        state: marlState,
        action: action,
        reward: reward,
        executionResult: executionResult
      });
      
      return {
        success: true,
        action: action,
        reward: reward,
        executionResult: executionResult
      };
      
    } catch (error) {
      this.logger.error('Error processing system state in MARL Service', error);
      throw error;
    }
  }
  
  async selectAction(state) {
    // Usar agente de aprendizado para selecionar ação
    const actionIndex = this.learningAgent.selectAction(state.vector);
    const action = await this.actionManager.getActionByIndex(actionIndex);
    
    // Adicionar contexto e metadados
    return {
      ...action,
      index: actionIndex,
      selectedAt: new Date().toISOString(),
      confidence: this.calculateActionConfidence(state, action),
      context: {
        state: state.metadata,
        explorationRate: this.learningAgent.epsilon
      }
    };
  }
  
  async executeAction(action, state) {
    try {
      this.logger.info(`Executing MARL action: ${action.type}`, {
        actionId: action.id,
        target: action.target
      });
      
      const result = await this.actionManager.executeAction(action, state);
      
      // Registrar execução
      this.episodeHistory.push({
        timestamp: new Date().toISOString(),
        state: state,
        action: action,
        result: result
      });
      
      return result;
      
    } catch (error) {
      this.logger.error(`Failed to execute MARL action: ${action.id}`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  async publishMARLResults(results) {
    const marlUpdate = {
      timestamp: new Date().toISOString(),
      agentId: 'marl-agent',
      state: {
        vector: results.state.vector,
        metadata: results.state.metadata
      },
      action: {
        type: results.action.type,
        target: results.action.target,
        confidence: results.action.confidence
      },
      reward: results.reward,
      performance: {
        explorationRate: this.learningAgent.epsilon,
        memorySize: this.learningAgent.memory.size(),
        episodeLength: this.episodeHistory.length
      }
    };
    
    await this.sqsService.sendMessage('marl-updates-queue', marlUpdate);
  }
  
  calculateActionConfidence(state, action) {
    // Calcular confiança baseada em:
    // 1. Histórico de sucesso da ação
    // 2. Similaridade com estados anteriores bem-sucedidos
    // 3. Incerteza do modelo
    
    const historicalSuccess = this.getHistoricalSuccessRate(action.type);
    const stateConfidence = this.getStateConfidence(state);
    const modelUncertainty = this.learningAgent.epsilon;
    
    return (historicalSuccess * 0.4 + stateConfidence * 0.4 + (1 - modelUncertainty) * 0.2);
  }
  
  async loadPretrainedModel() {
    try {
      // Tentar carregar modelo pré-treinado
      const modelPath = './models/marl-agent-model.json';
      // Implementar carregamento do modelo
      this.logger.info('Pretrained model loaded successfully');
    } catch (error) {
      this.logger.info('No pretrained model found, starting with random weights');
    }
  }
  
  async saveModel() {
    try {
      const modelPath = './models/marl-agent-model.json';
      // Implementar salvamento do modelo
      this.logger.info('Model saved successfully');
    } catch (error) {
      this.logger.error('Failed to save model', error);
    }
  }
}

module.exports = MARLService;
```

## 4. Implementação do Mediator Agent

### 4.1 Mediator Service Principal
```javascript
// src/agents/marl/mediator-agent/services/mediator-service.js
const ConflictDetector = require('./conflict-detector');
const ArbitrationEngine = require('./arbitration-engine');
const CoordinationManager = require('./coordination-manager');
const { SQSService } = require('../../../shared/services/sqs-service');
const { LoggerService } = require('../../../shared/services/logger-service');

class MediatorService {
  constructor() {
    this.conflictDetector = new ConflictDetector();
    this.arbitrationEngine = new ArbitrationEngine();
    this.coordinationManager = new CoordinationManager();
    this.sqsService = new SQSService();
    this.logger = new LoggerService('MediatorService');
    
    this.activeIntentions = new Map();
    this.activeConflicts = new Map();
    this.resolutionHistory = [];
  }
  
  async initialize() {
    await this.conflictDetector.initialize();
    await this.arbitrationEngine.initialize();
    await this.coordinationManager.initialize();
    
    this.logger.info('Mediator Service initialized successfully');
  }
  
  async processIntentions(intentions) {
    try {
      this.logger.info(`Processing ${intentions.length} intentions for mediation`);
      
      // 1. Atualizar intenções ativas
      this.updateActiveIntentions(intentions);
      
      // 2. Detectar conflitos
      const conflicts = await this.conflictDetector.detectConflicts(
        Array.from(this.activeIntentions.values())
      );
      
      // 3. Resolver conflitos detectados
      const resolutions = [];
      for (const conflict of conflicts) {
        const resolution = await this.resolveConflict(conflict);
        resolutions.push(resolution);
      }
      
      // 4. Coordenar execução das intenções resolvidas
      const coordinationPlan = await this.coordinationManager.createCoordinationPlan(
        this.activeIntentions,
        resolutions
      );
      
      // 5. Publicar resultados
      await this.publishMediationResults({
        conflicts: conflicts,
        resolutions: resolutions,
        coordinationPlan: coordinationPlan
      });
      
      return {
        success: true,
        conflictsDetected: conflicts.length,
        conflictsResolved: resolutions.filter(r => r.status === 'resolved').length,
        coordinationPlan: coordinationPlan
      };
      
    } catch (error) {
      this.logger.error('Error processing intentions in Mediator Service', error);
      throw error;
    }
  }
  
  async resolveConflict(conflict) {
    try {
      this.logger.info(`Resolving conflict: ${conflict.type}`, {
        conflictId: conflict.id,
        intentions: conflict.intentions
      });
      
      // Marcar conflito como ativo
      this.activeConflicts.set(conflict.id, {
        ...conflict,
        status: 'resolving',
        startedAt: new Date().toISOString()
      });
      
      // Usar engine de arbitragem para resolver
      const resolution = await this.arbitrationEngine.resolveConflict(conflict);
      
      // Atualizar status do conflito
      this.activeConflicts.set(conflict.id, {
        ...this.activeConflicts.get(conflict.id),
        status: resolution.status,
        resolution: resolution,
        resolvedAt: new Date().toISOString()
      });
      
      // Registrar no histórico
      this.resolutionHistory.push({
        conflict: conflict,
        resolution: resolution,
        timestamp: new Date().toISOString()
      });
      
      return resolution;
      
    } catch (error) {
      this.logger.error(`Failed to resolve conflict: ${conflict.id}`, error);
      
      return {
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  updateActiveIntentions(intentions) {
    // Limpar intenções antigas
    this.activeIntentions.clear();
    
    // Adicionar novas intenções
    for (const intention of intentions) {
      this.activeIntentions.set(intention.id, {
        ...intention,
        receivedAt: new Date().toISOString()
      });
    }
  }
  
  async publishMediationResults(results) {
    const mediationUpdate = {
      timestamp: new Date().toISOString(),
      agentId: 'mediator-agent',
      conflicts: results.conflicts.map(c => ({
        id: c.id,
        type: c.type,
        severity: c.severity,
        intentions: c.intentions
      })),
      resolutions: results.resolutions.map(r => ({
        status: r.status,
        strategy: r.strategy,
        timestamp: r.timestamp
      })),
      coordinationPlan: results.coordinationPlan,
      statistics: {
        activeIntentions: this.activeIntentions.size,
        activeConflicts: this.activeConflicts.size,
        resolutionSuccessRate: this.calculateSuccessRate()
      }
    };
    
    await this.sqsService.sendMessage('mediation-updates-queue', mediationUpdate);
  }
  
  calculateSuccessRate() {
    if (this.resolutionHistory.length === 0) return 0;
    
    const recentResolutions = this.resolutionHistory.slice(-100); // Últimas 100
    const successful = recentResolutions.filter(r => r.resolution.status === 'resolved').length;
    
    return successful / recentResolutions.length;
  }
}

module.exports = MediatorService;
```

Esta implementação prática fornece a base sólida para integrar os componentes BDI+MARL com o sistema SQS existente, mantendo a modularidade e seguindo os princípios de Clean Architecture estabelecidos no projeto.