/**
 * Mock da State API
 * Estratégia Anti-Deadlock - Fase 1
 * 
 * Simula a API de Estado para permitir desenvolvimento independente
 * dos agentes sem dependências externas.
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Estado global do sistema em memória
let systemState = {
  agents: {
    'interface-agent': {
      id: 'interface-agent',
      status: 'active',
      lastHeartbeat: new Date().toISOString(),
      metrics: {
        messagesProcessed: 150,
        averageResponseTime: 45,
        errorRate: 0.02
      },
      version: '1.0.0'
    },
    'event-agent': {
      id: 'event-agent',
      status: 'active',
      lastHeartbeat: new Date().toISOString(),
      metrics: {
        messagesProcessed: 200,
        averageResponseTime: 30,
        errorRate: 0.01
      },
      version: '1.0.0'
    }
  },
  queues: {
    'interface-agent-queue-dev': {
      name: 'interface-agent-queue-dev',
      messagesVisible: 5,
      messagesInFlight: 2,
      dlqMessages: 0,
      lastUpdated: new Date().toISOString()
    },
    'event-agent-queue-dev': {
      name: 'event-agent-queue-dev',
      messagesVisible: 3,
      messagesInFlight: 1,
      dlqMessages: 0,
      lastUpdated: new Date().toISOString()
    }
  },
  system: {
    totalAgents: 2,
    activeAgents: 2,
    totalMessages: 350,
    systemLoad: 0.65,
    lastUpdated: new Date().toISOString()
  }
};

// Histórico de estados (últimas 100 entradas)
let stateHistory = [];

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'state-api-mock',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Obter estado completo do sistema
app.get('/api/v1/state', (req, res) => {
  res.json({
    data: systemState,
    timestamp: new Date().toISOString()
  });
});

// Obter estado de um agente específico
app.get('/api/v1/state/agents/:agentId', (req, res) => {
  const { agentId } = req.params;
  const agent = systemState.agents[agentId];
  
  if (!agent) {
    return res.status(404).json({
      error: 'Agent not found',
      code: 'AGENT_NOT_FOUND'
    });
  }
  
  res.json({ data: agent });
});

// Atualizar estado de um agente
app.put('/api/v1/state/agents/:agentId', (req, res) => {
  const { agentId } = req.params;
  const updateData = req.body;
  
  if (!systemState.agents[agentId]) {
    // Criar novo agente se não existir
    systemState.agents[agentId] = {
      id: agentId,
      status: 'unknown',
      lastHeartbeat: new Date().toISOString(),
      metrics: {
        messagesProcessed: 0,
        averageResponseTime: 0,
        errorRate: 0
      },
      version: '1.0.0'
    };
  }
  
  // Atualizar dados do agente
  systemState.agents[agentId] = {
    ...systemState.agents[agentId],
    ...updateData,
    lastHeartbeat: new Date().toISOString()
  };
  
  // Atualizar contadores do sistema
  updateSystemMetrics();
  
  res.json({ data: systemState.agents[agentId] });
});

// Obter estado das filas
app.get('/api/v1/state/queues', (req, res) => {
  res.json({
    data: systemState.queues,
    timestamp: new Date().toISOString()
  });
});

// Obter estado de uma fila específica
app.get('/api/v1/state/queues/:queueName', (req, res) => {
  const { queueName } = req.params;
  const queue = systemState.queues[queueName];
  
  if (!queue) {
    return res.status(404).json({
      error: 'Queue not found',
      code: 'QUEUE_NOT_FOUND'
    });
  }
  
  res.json({ data: queue });
});

// Atualizar estado de uma fila
app.put('/api/v1/state/queues/:queueName', (req, res) => {
  const { queueName } = req.params;
  const updateData = req.body;
  
  if (!systemState.queues[queueName]) {
    // Criar nova fila se não existir
    systemState.queues[queueName] = {
      name: queueName,
      messagesVisible: 0,
      messagesInFlight: 0,
      dlqMessages: 0,
      lastUpdated: new Date().toISOString()
    };
  }
  
  systemState.queues[queueName] = {
    ...systemState.queues[queueName],
    ...updateData,
    lastUpdated: new Date().toISOString()
  };
  
  res.json({ data: systemState.queues[queueName] });
});

// Obter métricas do sistema
app.get('/api/v1/state/system', (req, res) => {
  res.json({
    data: systemState.system,
    timestamp: new Date().toISOString()
  });
});

// Obter histórico de estados
app.get('/api/v1/state/history', (req, res) => {
  const { limit = 50, agentId, from, to } = req.query;
  
  let filteredHistory = stateHistory;
  
  if (agentId) {
    filteredHistory = filteredHistory.filter(entry => entry.agentId === agentId);
  }
  
  if (from) {
    filteredHistory = filteredHistory.filter(entry => new Date(entry.timestamp) >= new Date(from));
  }
  
  if (to) {
    filteredHistory = filteredHistory.filter(entry => new Date(entry.timestamp) <= new Date(to));
  }
  
  const limitedHistory = filteredHistory.slice(-parseInt(limit));
  
  res.json({
    data: limitedHistory,
    total: filteredHistory.length,
    limit: parseInt(limit)
  });
});

// Registrar evento de mudança de estado
app.post('/api/v1/state/events', (req, res) => {
  const { agentId, eventType, data, timestamp } = req.body;
  
  if (!agentId || !eventType) {
    return res.status(400).json({
      error: 'Agent ID and event type are required',
      code: 'MISSING_EVENT_DATA'
    });
  }
  
  const stateEvent = {
    id: uuidv4(),
    agentId,
    eventType,
    data: data || {},
    timestamp: timestamp || new Date().toISOString()
  };
  
  // Adicionar ao histórico
  stateHistory.push(stateEvent);
  
  // Manter apenas os últimos 100 eventos
  if (stateHistory.length > 100) {
    stateHistory = stateHistory.slice(-100);
  }
  
  res.status(201).json({ data: stateEvent });
});

// Snapshot do estado atual
app.post('/api/v1/state/snapshot', (req, res) => {
  const snapshot = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(systemState)) // Deep copy
  };
  
  res.status(201).json({ data: snapshot });
});

// Função auxiliar para atualizar métricas do sistema
function updateSystemMetrics() {
  const agents = Object.values(systemState.agents);
  const activeAgents = agents.filter(agent => agent.status === 'active');
  
  systemState.system = {
    totalAgents: agents.length,
    activeAgents: activeAgents.length,
    totalMessages: agents.reduce((sum, agent) => sum + (agent.metrics?.messagesProcessed || 0), 0),
    systemLoad: Math.random() * 0.8 + 0.1, // Simular carga entre 10% e 90%
    lastUpdated: new Date().toISOString()
  };
}

// Simular atualizações periódicas de métricas
setInterval(() => {
  // Simular heartbeats e métricas dos agentes
  Object.keys(systemState.agents).forEach(agentId => {
    const agent = systemState.agents[agentId];
    if (agent.status === 'active') {
      agent.lastHeartbeat = new Date().toISOString();
      agent.metrics.messagesProcessed += Math.floor(Math.random() * 5);
      agent.metrics.averageResponseTime = Math.floor(Math.random() * 100) + 20;
      agent.metrics.errorRate = Math.random() * 0.05;
    }
  });
  
  // Simular mudanças nas filas
  Object.keys(systemState.queues).forEach(queueName => {
    const queue = systemState.queues[queueName];
    queue.messagesVisible = Math.max(0, queue.messagesVisible + Math.floor(Math.random() * 3) - 1);
    queue.messagesInFlight = Math.max(0, Math.floor(Math.random() * 3));
    queue.lastUpdated = new Date().toISOString();
  });
  
  updateSystemMetrics();
}, 10000); // A cada 10 segundos

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('State API Mock Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

const PORT = process.env.MOCK_STATE_API_PORT || 3002;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎭 State API Mock running on port ${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   GET  /health`);
    console.log(`   GET  /api/v1/state`);
    console.log(`   GET  /api/v1/state/agents/:agentId`);
    console.log(`   PUT  /api/v1/state/agents/:agentId`);
    console.log(`   GET  /api/v1/state/queues`);
    console.log(`   GET  /api/v1/state/queues/:queueName`);
    console.log(`   PUT  /api/v1/state/queues/:queueName`);
    console.log(`   GET  /api/v1/state/system`);
    console.log(`   GET  /api/v1/state/history`);
    console.log(`   POST /api/v1/state/events`);
    console.log(`   POST /api/v1/state/snapshot`);
  });
}

module.exports = app;