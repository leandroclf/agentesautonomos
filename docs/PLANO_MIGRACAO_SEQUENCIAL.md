# Plano de Migração Sequencial - BDI+MARL Integration

## Fase 1: Preparação e Documentação (Concluída)

### ✅ Status: CONCLUÍDO
- [x] Análise da arquitetura atual
- [x] Documentação da integração BDI+MARL
- [x] Especificações técnicas detalhadas
- [x] Plano de implementação prática

## Fase 2: Evolução do Planning Agent para BDI

### 2.1 Objetivos
- Evoluir o Planning Agent atual para incorporar lógica BDI
- Manter compatibilidade com SQS existente
- Implementar sistema de crenças, desejos e intenções
- Adicionar novas filas SQS para mensagens BDI

### 2.2 Pré-requisitos
```bash
# Instalar dependências adicionais
npm install uuid tensorflow @tensorflow/tfjs-node
npm install --save-dev jest supertest
```

### 2.3 Estrutura de Arquivos a Criar
```
src/agents/core/planning-agent/
├── services/
│   ├── bdi-service.js (NOVO)
│   ├── belief-manager.js (NOVO)
│   ├── desire-generator.js (NOVO)
│   ├── intention-planner.js (NOVO)
│   └── plan-executor.js (NOVO)
├── models/
│   ├── belief-model.js (NOVO)
│   ├── desire-model.js (NOVO)
│   └── intention-model.js (NOVO)
├── library/
│   ├── plan-library.json (NOVO)
│   └── strategy-templates.json (NOVO)
└── schemas/
    ├── bdi-schemas.json (NOVO)
    └── message-schemas.json (ATUALIZAR)
```

### 2.4 Scripts de Implementação

#### 2.4.1 Script de Criação da Estrutura
```bash
# criar-estrutura-bdi.ps1

# Criar diretórios
New-Item -ItemType Directory -Force -Path "src\agents\core\planning-agent\models"
New-Item -ItemType Directory -Force -Path "src\agents\core\planning-agent\library"
New-Item -ItemType Directory -Force -Path "src\agents\core\planning-agent\schemas"

# Criar arquivos base
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\services\bdi-service.js"
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\services\belief-manager.js"
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\services\desire-generator.js"
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\services\intention-planner.js"
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\services\plan-executor.js"

New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\models\belief-model.js"
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\models\desire-model.js"
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\models\intention-model.js"

New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\library\plan-library.json"
New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\library\strategy-templates.json"

New-Item -ItemType File -Force -Path "src\agents\core\planning-agent\schemas\bdi-schemas.json"

Write-Host "Estrutura BDI criada com sucesso!"
```

#### 2.4.2 Configuração de Novas Filas SQS
```javascript
// scripts/setup-bdi-queues.js
const AWS = require('aws-sdk');

const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const bdiQueues = [
  {
    name: 'beliefs-queue',
    attributes: {
      'VisibilityTimeoutSeconds': '300',
      'MessageRetentionPeriod': '1209600', // 14 dias
      'DelaySeconds': '0',
      'ReceiveMessageWaitTimeSeconds': '20'
    }
  },
  {
    name: 'desires-queue',
    attributes: {
      'VisibilityTimeoutSeconds': '300',
      'MessageRetentionPeriod': '1209600',
      'DelaySeconds': '0',
      'ReceiveMessageWaitTimeSeconds': '20'
    }
  },
  {
    name: 'intentions-queue',
    attributes: {
      'VisibilityTimeoutSeconds': '600', // Maior timeout para intenções
      'MessageRetentionPeriod': '1209600',
      'DelaySeconds': '0',
      'ReceiveMessageWaitTimeSeconds': '20'
    }
  },
  {
    name: 'bdi-state-queue',
    attributes: {
      'VisibilityTimeoutSeconds': '300',
      'MessageRetentionPeriod': '604800', // 7 dias
      'DelaySeconds': '0',
      'ReceiveMessageWaitTimeSeconds': '20'
    }
  }
];

async function createBDIQueues() {
  console.log('Criando filas SQS para BDI...');
  
  for (const queue of bdiQueues) {
    try {
      const params = {
        QueueName: queue.name,
        Attributes: queue.attributes
      };
      
      const result = await sqs.createQueue(params).promise();
      console.log(`✅ Fila criada: ${queue.name} - ${result.QueueUrl}`);
      
      // Criar DLQ correspondente
      const dlqParams = {
        QueueName: `${queue.name}-dlq`,
        Attributes: {
          'MessageRetentionPeriod': '1209600'
        }
      };
      
      const dlqResult = await sqs.createQueue(dlqParams).promise();
      console.log(`✅ DLQ criada: ${queue.name}-dlq - ${dlqResult.QueueUrl}`);
      
    } catch (error) {
      if (error.code === 'QueueAlreadyExists') {
        console.log(`⚠️  Fila já existe: ${queue.name}`);
      } else {
        console.error(`❌ Erro ao criar fila ${queue.name}:`, error);
      }
    }
  }
}

if (require.main === module) {
  createBDIQueues()
    .then(() => console.log('Configuração de filas BDI concluída!'))
    .catch(error => console.error('Erro na configuração:', error));
}

module.exports = { createBDIQueues };
```

### 2.5 Implementação dos Modelos BDI

#### 2.5.1 Belief Model
```javascript
// src/agents/core/planning-agent/models/belief-model.js
const { v4: uuidv4 } = require('uuid');

class Belief {
  constructor({
    id = uuidv4(),
    type,
    subject,
    predicate,
    object,
    confidence = 1.0,
    source,
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
    expiresAt = null,
    metadata = {}
  }) {
    this.id = id;
    this.type = type;
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.confidence = Math.max(0, Math.min(1, confidence));
    this.source = source;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.expiresAt = expiresAt;
    this.metadata = metadata;
  }
  
  isExpired() {
    if (!this.expiresAt) return false;
    return new Date() > new Date(this.expiresAt);
  }
  
  update(changes) {
    Object.assign(this, changes);
    this.updatedAt = new Date().toISOString();
  }
  
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      subject: this.subject,
      predicate: this.predicate,
      object: this.object,
      confidence: this.confidence,
      source: this.source,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt,
      metadata: this.metadata
    };
  }
  
  static fromJSON(data) {
    return new Belief(data);
  }
  
  static createSystemBelief(subject, predicate, object, confidence = 1.0) {
    return new Belief({
      type: 'system_state',
      subject,
      predicate,
      object,
      confidence,
      source: 'system_observation'
    });
  }
  
  static createPerformanceBelief(agentId, metrics, confidence = 0.9) {
    return new Belief({
      type: 'performance_state',
      subject: agentId,
      predicate: 'has_performance',
      object: metrics,
      confidence,
      source: 'performance_monitoring'
    });
  }
}

module.exports = Belief;
```

#### 2.5.2 Desire Model
```javascript
// src/agents/core/planning-agent/models/desire-model.js
const { v4: uuidv4 } = require('uuid');

class Desire {
  constructor({
    id = uuidv4(),
    type,
    goal,
    priority = 0.5,
    urgency = 0.5,
    conditions = [],
    constraints = [],
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
    expiresAt = null,
    metadata = {}
  }) {
    this.id = id;
    this.type = type;
    this.goal = goal;
    this.priority = Math.max(0, Math.min(1, priority));
    this.urgency = Math.max(0, Math.min(1, urgency));
    this.conditions = conditions;
    this.constraints = constraints;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.expiresAt = expiresAt;
    this.metadata = metadata;
  }
  
  calculateScore() {
    // Combinar prioridade e urgência para score final
    return (this.priority * 0.6) + (this.urgency * 0.4);
  }
  
  isAchievable(beliefs, resources) {
    // Verificar se todas as condições podem ser satisfeitas
    for (const condition of this.conditions) {
      if (!this.checkCondition(condition, beliefs, resources)) {
        return false;
      }
    }
    return true;
  }
  
  checkCondition(condition, beliefs, resources) {
    switch (condition.type) {
      case 'belief_exists':
        return this.beliefExists(condition.belief, beliefs);
      case 'resource_available':
        return this.resourceAvailable(condition.resource, resources);
      case 'constraint_satisfied':
        return this.constraintSatisfied(condition.constraint, beliefs, resources);
      default:
        return true;
    }
  }
  
  beliefExists(beliefPattern, beliefs) {
    return Array.from(beliefs.values()).some(belief => 
      this.matchesPattern(belief, beliefPattern)
    );
  }
  
  resourceAvailable(resourceRequirement, resources) {
    const resource = resources[resourceRequirement.name];
    if (!resource) return false;
    
    return resource.available >= resourceRequirement.amount;
  }
  
  matchesPattern(belief, pattern) {
    return (
      (!pattern.type || belief.type === pattern.type) &&
      (!pattern.subject || belief.subject === pattern.subject) &&
      (!pattern.predicate || belief.predicate === pattern.predicate)
    );
  }
  
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      goal: this.goal,
      priority: this.priority,
      urgency: this.urgency,
      conditions: this.conditions,
      constraints: this.constraints,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt,
      metadata: this.metadata,
      score: this.calculateScore()
    };
  }
  
  static fromJSON(data) {
    return new Desire(data);
  }
  
  static createOptimizationDesire(target, metric, improvement, priority = 0.7) {
    return new Desire({
      type: 'optimization',
      goal: {
        action: 'optimize',
        target: target,
        metric: metric,
        improvement: improvement
      },
      priority: priority,
      urgency: 0.5,
      conditions: [
        {
          type: 'belief_exists',
          belief: {
            type: 'performance_state',
            subject: target
          }
        }
      ]
    });
  }
}

module.exports = Desire;
```

### 2.6 Testes de Integração

#### 2.6.1 Teste do BDI Service
```javascript
// tests/integration/bdi-service.test.js
const BDIService = require('../../src/agents/core/planning-agent/services/bdi-service');
const Belief = require('../../src/agents/core/planning-agent/models/belief-model');
const Desire = require('../../src/agents/core/planning-agent/models/desire-model');

describe('BDI Service Integration Tests', () => {
  let bdiService;
  
  beforeEach(async () => {
    bdiService = new BDIService();
    await bdiService.initialize();
  });
  
  afterEach(async () => {
    // Cleanup
  });
  
  describe('Event Processing', () => {
    test('should update beliefs when processing system event', async () => {
      const event = {
        id: 'test-event-1',
        type: 'agent_metrics_updated',
        data: {
          agentId: 'interface-agent',
          metrics: {
            cpu: 0.75,
            memory: 0.60,
            responseTime: 120
          }
        },
        timestamp: new Date().toISOString()
      };
      
      const result = await bdiService.processEvent(event);
      
      expect(result.success).toBe(true);
      expect(result.beliefs).toBeGreaterThan(0);
      
      // Verificar se crença foi criada/atualizada
      const agentBelief = Array.from(bdiService.currentBeliefs.values())
        .find(b => b.subject === 'interface-agent' && b.type === 'agent_state');
      
      expect(agentBelief).toBeDefined();
      expect(agentBelief.object.cpu).toBe(0.75);
    });
    
    test('should generate desires based on updated beliefs', async () => {
      // Criar crença de sobrecarga
      const overloadBelief = Belief.createSystemBelief(
        'interface-agent',
        'cpu_utilization',
        0.95,
        0.9
      );
      
      bdiService.currentBeliefs.set(overloadBelief.id, overloadBelief);
      
      const event = {
        id: 'test-event-2',
        type: 'system_overload_detected',
        data: {
          agentId: 'interface-agent',
          severity: 'high'
        },
        timestamp: new Date().toISOString()
      };
      
      const result = await bdiService.processEvent(event);
      
      expect(result.success).toBe(true);
      expect(result.desires).toBeGreaterThan(0);
      
      // Verificar se desejo de otimização foi gerado
      const optimizationDesire = Array.from(bdiService.activeDesires.values())
        .find(d => d.type === 'optimization');
      
      expect(optimizationDesire).toBeDefined();
    });
    
    test('should form intentions through deliberation', async () => {
      // Setup: criar crenças e desejos
      const belief = Belief.createPerformanceBelief(
        'interface-agent',
        { cpu: 0.9, memory: 0.8 },
        0.95
      );
      
      const desire = Desire.createOptimizationDesire(
        'interface-agent',
        'cpu_utilization',
        0.2,
        0.8
      );
      
      bdiService.currentBeliefs.set(belief.id, belief);
      bdiService.activeDesires.set(desire.id, desire);
      
      const deliberationResult = await bdiService.deliberate();
      
      expect(deliberationResult.newIntentions).toBeDefined();
      expect(deliberationResult.newIntentions.length).toBeGreaterThan(0);
    });
  });
  
  describe('Plan Execution', () => {
    test('should execute plans for ready intentions', async () => {
      // Mock plan execution
      const mockPlan = {
        id: 'test-plan-1',
        steps: [
          { action: 'scale_up', target: 'interface-agent', parameters: { factor: 1.2 } }
        ],
        progress: 0
      };
      
      const mockIntention = {
        id: 'test-intention-1',
        goal: { action: 'optimize', target: 'interface-agent' },
        priority: 0.8
      };
      
      bdiService.executingPlans.set(mockIntention.id, {
        intention: mockIntention,
        plan: mockPlan,
        status: 'ready',
        createdAt: new Date().toISOString()
      });
      
      await bdiService.executeReadyPlans();
      
      const planExecution = bdiService.executingPlans.get(mockIntention.id);
      expect(planExecution.status).toBe('executing');
    });
  });
});
```

### 2.7 Script de Migração
```bash
# migrate-to-bdi.ps1

Write-Host "Iniciando migração para BDI Planning Agent..." -ForegroundColor Green

# 1. Backup do código atual
Write-Host "1. Criando backup..." -ForegroundColor Yellow
$backupDir = "backup\planning-agent-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force -Path $backupDir
Copy-Item -Path "src\agents\core\planning-agent\*" -Destination $backupDir -Recurse
Write-Host "   Backup criado em: $backupDir" -ForegroundColor Gray

# 2. Instalar dependências
Write-Host "2. Instalando dependências..." -ForegroundColor Yellow
npm install uuid tensorflow @tensorflow/tfjs-node

# 3. Criar estrutura BDI
Write-Host "3. Criando estrutura BDI..." -ForegroundColor Yellow
.\scripts\criar-estrutura-bdi.ps1

# 4. Configurar filas SQS
Write-Host "4. Configurando filas SQS..." -ForegroundColor Yellow
node scripts\setup-bdi-queues.js

# 5. Executar testes
Write-Host "5. Executando testes..." -ForegroundColor Yellow
npm test -- --testPathPattern="bdi-service"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migração para BDI concluída com sucesso!" -ForegroundColor Green
    Write-Host "   - Estrutura BDI criada"
    Write-Host "   - Filas SQS configuradas"
    Write-Host "   - Testes passando"
} else {
    Write-Host "❌ Migração falhou. Verifique os logs." -ForegroundColor Red
    Write-Host "   Backup disponível em: $backupDir"
}
```

## Fase 3: Implementação do MARL Agent

### 3.1 Objetivos
- Implementar agente MARL para aprendizado por reforço
- Integrar com sistema de métricas existente
- Criar sistema de recompensas multi-objetivo
- Implementar algoritmos DQN e PPO

### 3.2 Estrutura de Arquivos
```
src/agents/marl/
├── marl-agent/
│   ├── index.js
│   ├── services/
│   │   ├── marl-service.js
│   │   ├── state-manager.js
│   │   ├── action-manager.js
│   │   └── reward-calculator.js
│   ├── learning/
│   │   ├── dqn-agent.js
│   │   ├── ppo-agent.js
│   │   ├── experience-replay.js
│   │   └── neural-networks.js
│   └── coordination/
│       ├── message-passing.js
│       ├── policy-sharing.js
│       └── consensus-protocol.js
```

### 3.3 Script de Implementação MARL
```bash
# implement-marl.ps1

Write-Host "Implementando MARL Agent..." -ForegroundColor Green

# 1. Criar estrutura
Write-Host "1. Criando estrutura MARL..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "src\agents\marl\marl-agent\services"
New-Item -ItemType Directory -Force -Path "src\agents\marl\marl-agent\learning"
New-Item -ItemType Directory -Force -Path "src\agents\marl\marl-agent\coordination"

# 2. Instalar dependências de ML
Write-Host "2. Instalando dependências de Machine Learning..." -ForegroundColor Yellow
npm install @tensorflow/tfjs-node ml-matrix

# 3. Configurar filas MARL
Write-Host "3. Configurando filas MARL..." -ForegroundColor Yellow
node scripts\setup-marl-queues.js

# 4. Executar testes MARL
Write-Host "4. Executando testes MARL..." -ForegroundColor Yellow
npm test -- --testPathPattern="marl"

Write-Host "✅ MARL Agent implementado!" -ForegroundColor Green
```

## Fase 4: Implementação do Mediator Agent

### 4.1 Objetivos
- Implementar detecção e resolução de conflitos
- Criar sistema de arbitragem
- Implementar coordenação entre agentes
- Integrar com sistema de notificações

### 4.2 Script de Implementação Mediator
```bash
# implement-mediator.ps1

Write-Host "Implementando Mediator Agent..." -ForegroundColor Green

# 1. Criar estrutura
New-Item -ItemType Directory -Force -Path "src\agents\marl\mediator-agent\services"
New-Item -ItemType Directory -Force -Path "src\agents\marl\mediator-agent\resolution"
New-Item -ItemType Directory -Force -Path "src\agents\marl\mediator-agent\rules"

# 2. Configurar filas de mediação
node scripts\setup-mediator-queues.js

# 3. Executar testes
npm test -- --testPathPattern="mediator"

Write-Host "✅ Mediator Agent implementado!" -ForegroundColor Green
```

## Fase 5: Implementação do Monitor & Rewards Engine

### 5.1 Objetivos
- Implementar coleta avançada de métricas
- Criar sistema de recompensas multi-objetivo
- Integrar com Prometheus/Grafana existente
- Implementar analytics em tempo real

### 5.2 Script de Implementação Monitor
```bash
# implement-monitor.ps1

Write-Host "Implementando Monitor & Rewards Engine..." -ForegroundColor Green

# 1. Criar estrutura
New-Item -ItemType Directory -Force -Path "src\agents\monitoring\monitor-rewards-agent\services"
New-Item -ItemType Directory -Force -Path "src\agents\monitoring\monitor-rewards-agent\collectors"
New-Item -ItemType Directory -Force -Path "src\agents\monitoring\monitor-rewards-agent\rewards"
New-Item -ItemType Directory -Force -Path "src\agents\monitoring\monitor-rewards-agent\storage"

# 2. Instalar dependências de monitoramento
npm install prom-client influxdb-client

# 3. Configurar métricas avançadas
node scripts\setup-advanced-metrics.js

# 4. Executar testes
npm test -- --testPathPattern="monitor"

Write-Host "✅ Monitor & Rewards Engine implementado!" -ForegroundColor Green
```

## Fase 6: Integração e Testes End-to-End

### 6.1 Script de Integração Completa
```bash
# integrate-all.ps1

Write-Host "Executando integração completa BDI+MARL..." -ForegroundColor Green

# 1. Verificar todos os componentes
Write-Host "1. Verificando componentes..." -ForegroundColor Yellow
$components = @(
    "src\agents\core\planning-agent\services\bdi-service.js",
    "src\agents\marl\marl-agent\services\marl-service.js",
    "src\agents\marl\mediator-agent\services\mediator-service.js",
    "src\agents\monitoring\monitor-rewards-agent\services\monitor-service.js"
)

foreach ($component in $components) {
    if (Test-Path $component) {
        Write-Host "   ✅ $component" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $component" -ForegroundColor Red
        exit 1
    }
}

# 2. Executar testes de integração
Write-Host "2. Executando testes de integração..." -ForegroundColor Yellow
npm test -- --testPathPattern="integration"

# 3. Executar testes end-to-end
Write-Host "3. Executando testes end-to-end..." -ForegroundColor Yellow
npm run test:e2e

# 4. Verificar métricas
Write-Host "4. Verificando métricas..." -ForegroundColor Yellow
node scripts\verify-metrics.js

# 5. Teste de carga
Write-Host "5. Executando teste de carga..." -ForegroundColor Yellow
node scripts\load-test.js

Write-Host "✅ Integração BDI+MARL concluída com sucesso!" -ForegroundColor Green
```

### 6.2 Verificação de Saúde do Sistema
```javascript
// scripts/health-check.js
const { SQSService } = require('../src/shared/services/sqs-service');
const { MetricsService } = require('../src/shared/services/metrics-service');

async function healthCheck() {
  console.log('🔍 Executando verificação de saúde do sistema...');
  
  const checks = {
    sqs: false,
    bdi: false,
    marl: false,
    mediator: false,
    monitor: false
  };
  
  try {
    // Verificar SQS
    const sqsService = new SQSService();
    await sqsService.listQueues();
    checks.sqs = true;
    console.log('✅ SQS: Conectado');
    
    // Verificar BDI
    const bdiResponse = await fetch('http://localhost:3001/health');
    checks.bdi = bdiResponse.ok;
    console.log(`${checks.bdi ? '✅' : '❌'} BDI Planning Agent: ${checks.bdi ? 'Ativo' : 'Inativo'}`);
    
    // Verificar MARL
    const marlResponse = await fetch('http://localhost:3002/health');
    checks.marl = marlResponse.ok;
    console.log(`${checks.marl ? '✅' : '❌'} MARL Agent: ${checks.marl ? 'Ativo' : 'Inativo'}`);
    
    // Verificar Mediator
    const mediatorResponse = await fetch('http://localhost:3003/health');
    checks.mediator = mediatorResponse.ok;
    console.log(`${checks.mediator ? '✅' : '❌'} Mediator Agent: ${checks.mediator ? 'Ativo' : 'Inativo'}`);
    
    // Verificar Monitor
    const monitorResponse = await fetch('http://localhost:3004/health');
    checks.monitor = monitorResponse.ok;
    console.log(`${checks.monitor ? '✅' : '❌'} Monitor & Rewards: ${checks.monitor ? 'Ativo' : 'Inativo'}`);
    
    const allHealthy = Object.values(checks).every(check => check);
    
    if (allHealthy) {
      console.log('\n🎉 Sistema BDI+MARL totalmente operacional!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Alguns componentes não estão funcionando corretamente.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Erro na verificação de saúde:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  healthCheck();
}

module.exports = { healthCheck };
```

## Cronograma de Execução

### Semana 1: Fase 2 - BDI Planning Agent
- **Dia 1-2**: Criação da estrutura e modelos BDI
- **Dia 3-4**: Implementação dos serviços BDI
- **Dia 5**: Testes e integração com SQS

### Semana 2: Fase 3 - MARL Agent
- **Dia 1-2**: Implementação do MARL Service e State Manager
- **Dia 3-4**: Implementação dos algoritmos de aprendizado
- **Dia 5**: Testes e otimização

### Semana 3: Fase 4 - Mediator Agent
- **Dia 1-2**: Implementação da detecção de conflitos
- **Dia 3-4**: Implementação do sistema de arbitragem
- **Dia 5**: Testes de coordenação

### Semana 4: Fase 5 - Monitor & Rewards
- **Dia 1-2**: Implementação do sistema de métricas avançado
- **Dia 3-4**: Implementação do sistema de recompensas
- **Dia 5**: Integração com Prometheus/Grafana

### Semana 5: Fase 6 - Integração Final
- **Dia 1-3**: Testes de integração end-to-end
- **Dia 4**: Otimização de performance
- **Dia 5**: Documentação final e deploy

## Critérios de Sucesso

### Técnicos
- [ ] Todos os testes unitários passando (>95% cobertura)
- [ ] Testes de integração end-to-end funcionando
- [ ] Latência média < 100ms para operações BDI
- [ ] Throughput MARL > 1000 ações/minuto
- [ ] Zero perda de mensagens SQS

### Funcionais
- [ ] BDI Planning Agent processando eventos corretamente
- [ ] MARL Agent aprendendo e otimizando performance
- [ ] Mediator Agent resolvendo conflitos automaticamente
- [ ] Monitor & Rewards coletando métricas em tempo real
- [ ] Sistema completo operando 24/7 sem intervenção

### Observabilidade
- [ ] Dashboards Grafana atualizados
- [ ] Alertas Prometheus configurados
- [ ] Logs estruturados em todos os componentes
- [ ] Métricas de negócio sendo coletadas

Este plano de migração sequencial garante uma transição suave e controlada para a arquitetura BDI+MARL, mantendo a compatibilidade com o sistema SQS existente e seguindo as melhores práticas de DevOps e observabilidade.