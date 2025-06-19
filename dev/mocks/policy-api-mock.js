/**
 * Mock da Policy API
 * Estratégia Anti-Deadlock - Fase 1
 * 
 * Simula a API de Políticas para permitir desenvolvimento independente
 * dos agentes sem dependências externas.
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Dados mock em memória
let policies = [
  {
    id: 'policy-001',
    name: 'Default Agent Policy',
    version: '1.0.0',
    rules: [
      {
        id: 'rule-001',
        condition: 'agent.type === "core"',
        action: 'allow',
        priority: 100
      },
      {
        id: 'rule-002',
        condition: 'message.size > 1MB',
        action: 'reject',
        priority: 200
      }
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    active: true
  },
  {
    id: 'policy-002',
    name: 'Security Policy',
    version: '1.0.0',
    rules: [
      {
        id: 'rule-003',
        condition: 'agent.authenticated === true',
        action: 'allow',
        priority: 50
      }
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    active: true
  }
];

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'policy-api-mock',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Listar todas as políticas
app.get('/api/v1/policies', (req, res) => {
  const { active, type } = req.query;
  
  let filteredPolicies = policies;
  
  if (active !== undefined) {
    filteredPolicies = filteredPolicies.filter(p => p.active === (active === 'true'));
  }
  
  res.json({
    data: filteredPolicies,
    total: filteredPolicies.length,
    page: 1,
    limit: 100
  });
});

// Obter política específica
app.get('/api/v1/policies/:id', (req, res) => {
  const policy = policies.find(p => p.id === req.params.id);
  
  if (!policy) {
    return res.status(404).json({
      error: 'Policy not found',
      code: 'POLICY_NOT_FOUND'
    });
  }
  
  res.json({ data: policy });
});

// Criar nova política
app.post('/api/v1/policies', (req, res) => {
  const { name, rules, active = true } = req.body;
  
  if (!name || !rules || !Array.isArray(rules)) {
    return res.status(400).json({
      error: 'Invalid policy data',
      code: 'INVALID_POLICY_DATA'
    });
  }
  
  const newPolicy = {
    id: `policy-${uuidv4().slice(0, 8)}`,
    name,
    version: '1.0.0',
    rules: rules.map(rule => ({
      id: `rule-${uuidv4().slice(0, 8)}`,
      ...rule
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active
  };
  
  policies.push(newPolicy);
  
  res.status(201).json({ data: newPolicy });
});

// Atualizar política
app.put('/api/v1/policies/:id', (req, res) => {
  const policyIndex = policies.findIndex(p => p.id === req.params.id);
  
  if (policyIndex === -1) {
    return res.status(404).json({
      error: 'Policy not found',
      code: 'POLICY_NOT_FOUND'
    });
  }
  
  const { name, rules, active } = req.body;
  
  policies[policyIndex] = {
    ...policies[policyIndex],
    ...(name && { name }),
    ...(rules && { rules }),
    ...(active !== undefined && { active }),
    updatedAt: new Date().toISOString()
  };
  
  res.json({ data: policies[policyIndex] });
});

// Deletar política
app.delete('/api/v1/policies/:id', (req, res) => {
  const policyIndex = policies.findIndex(p => p.id === req.params.id);
  
  if (policyIndex === -1) {
    return res.status(404).json({
      error: 'Policy not found',
      code: 'POLICY_NOT_FOUND'
    });
  }
  
  policies.splice(policyIndex, 1);
  
  res.status(204).send();
});

// Validar política contra contexto
app.post('/api/v1/policies/validate', (req, res) => {
  const { policyId, context } = req.body;
  
  if (!policyId || !context) {
    return res.status(400).json({
      error: 'Policy ID and context are required',
      code: 'MISSING_VALIDATION_DATA'
    });
  }
  
  const policy = policies.find(p => p.id === policyId && p.active);
  
  if (!policy) {
    return res.status(404).json({
      error: 'Active policy not found',
      code: 'POLICY_NOT_FOUND'
    });
  }
  
  // Simulação simples de validação
  const validationResults = policy.rules.map(rule => {
    // Mock de avaliação de regra
    const allowed = Math.random() > 0.1; // 90% de chance de sucesso
    
    return {
      ruleId: rule.id,
      condition: rule.condition,
      action: rule.action,
      priority: rule.priority,
      result: allowed ? 'allow' : 'deny',
      reason: allowed ? 'Rule passed' : 'Rule failed'
    };
  });
  
  const overallResult = validationResults.every(r => r.result === 'allow') ? 'allow' : 'deny';
  
  res.json({
    data: {
      policyId,
      result: overallResult,
      rules: validationResults,
      timestamp: new Date().toISOString()
    }
  });
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('Policy API Mock Error:', err);
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

const PORT = process.env.MOCK_POLICY_API_PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎭 Policy API Mock running on port ${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   GET  /health`);
    console.log(`   GET  /api/v1/policies`);
    console.log(`   GET  /api/v1/policies/:id`);
    console.log(`   POST /api/v1/policies`);
    console.log(`   PUT  /api/v1/policies/:id`);
    console.log(`   DELETE /api/v1/policies/:id`);
    console.log(`   POST /api/v1/policies/validate`);
  });
}

module.exports = app;