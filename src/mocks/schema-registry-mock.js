/**
 * Mock do Schema Registry
 * Estratégia Anti-Deadlock - Fase 1
 * 
 * Simula o registro de schemas para permitir desenvolvimento independente
 * dos agentes sem dependências externas.
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Schemas registrados em memória
let schemas = {
  'agent-message': {
    id: 'agent-message',
    version: '1.0.0',
    type: 'object',
    title: 'Agent Message Schema',
    description: 'Schema padrão para mensagens entre agentes',
    properties: {
      id: {
        type: 'string',
        description: 'Identificador único da mensagem'
      },
      type: {
        type: 'string',
        enum: ['command', 'event', 'query', 'response'],
        description: 'Tipo da mensagem'
      },
      source: {
        type: 'string',
        description: 'Agente de origem'
      },
      target: {
        type: 'string',
        description: 'Agente de destino'
      },
      payload: {
        type: 'object',
        description: 'Dados da mensagem'
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
        description: 'Timestamp da mensagem'
      },
      correlationId: {
        type: 'string',
        description: 'ID de correlação para rastreamento'
      }
    },
    required: ['id', 'type', 'source', 'payload', 'timestamp'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  'agent-heartbeat': {
    id: 'agent-heartbeat',
    version: '1.0.0',
    type: 'object',
    title: 'Agent Heartbeat Schema',
    description: 'Schema para heartbeats dos agentes',
    properties: {
      agentId: {
        type: 'string',
        description: 'Identificador do agente'
      },
      status: {
        type: 'string',
        enum: ['active', 'idle', 'busy', 'error'],
        description: 'Status atual do agente'
      },
      metrics: {
        type: 'object',
        properties: {
          messagesProcessed: {
            type: 'integer',
            minimum: 0
          },
          averageResponseTime: {
            type: 'number',
            minimum: 0
          },
          errorRate: {
            type: 'number',
            minimum: 0,
            maximum: 1
          }
        }
      },
      timestamp: {
        type: 'string',
        format: 'date-time'
      }
    },
    required: ['agentId', 'status', 'timestamp'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  'planning-request': {
    id: 'planning-request',
    version: '1.0.0',
    type: 'object',
    title: 'Planning Request Schema',
    description: 'Schema para requisições de planejamento',
    properties: {
      requestId: {
        type: 'string',
        description: 'ID da requisição'
      },
      goal: {
        type: 'string',
        description: 'Objetivo a ser alcançado'
      },
      constraints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            value: { type: 'string' }
          }
        },
        description: 'Restrições do planejamento'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      context: {
        type: 'object',
        description: 'Contexto adicional'
      }
    },
    required: ['requestId', 'goal'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  'state-update': {
    id: 'state-update',
    version: '1.0.0',
    type: 'object',
    title: 'State Update Schema',
    description: 'Schema para atualizações de estado',
    properties: {
      entityId: {
        type: 'string',
        description: 'ID da entidade sendo atualizada'
      },
      entityType: {
        type: 'string',
        enum: ['agent', 'queue', 'system'],
        description: 'Tipo da entidade'
      },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'Tipo de operação'
      },
      data: {
        type: 'object',
        description: 'Dados da atualização'
      },
      version: {
        type: 'integer',
        minimum: 1,
        description: 'Versão do estado'
      }
    },
    required: ['entityId', 'entityType', 'operation', 'data'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }
};

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'schema-registry-mock',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Listar todos os schemas
app.get('/api/v1/schemas', (req, res) => {
  const { type, version } = req.query;
  
  let filteredSchemas = Object.values(schemas);
  
  if (type) {
    filteredSchemas = filteredSchemas.filter(s => s.title.toLowerCase().includes(type.toLowerCase()));
  }
  
  if (version) {
    filteredSchemas = filteredSchemas.filter(s => s.version === version);
  }
  
  res.json({
    data: filteredSchemas,
    total: filteredSchemas.length
  });
});

// Obter schema específico
app.get('/api/v1/schemas/:schemaId', (req, res) => {
  const { schemaId } = req.params;
  const { version } = req.query;
  
  const schema = schemas[schemaId];
  
  if (!schema) {
    return res.status(404).json({
      error: 'Schema not found',
      code: 'SCHEMA_NOT_FOUND'
    });
  }
  
  if (version && schema.version !== version) {
    return res.status(404).json({
      error: 'Schema version not found',
      code: 'SCHEMA_VERSION_NOT_FOUND'
    });
  }
  
  res.json({ data: schema });
});

// Registrar novo schema
app.post('/api/v1/schemas', (req, res) => {
  const { id, title, description, type, properties, required } = req.body;
  
  if (!id || !title || !type || !properties) {
    return res.status(400).json({
      error: 'Missing required schema fields',
      code: 'INVALID_SCHEMA_DATA'
    });
  }
  
  if (schemas[id]) {
    return res.status(409).json({
      error: 'Schema already exists',
      code: 'SCHEMA_EXISTS'
    });
  }
  
  const newSchema = {
    id,
    version: '1.0.0',
    type,
    title,
    description: description || '',
    properties,
    required: required || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  schemas[id] = newSchema;
  
  res.status(201).json({ data: newSchema });
});

// Atualizar schema existente
app.put('/api/v1/schemas/:schemaId', (req, res) => {
  const { schemaId } = req.params;
  const updateData = req.body;
  
  if (!schemas[schemaId]) {
    return res.status(404).json({
      error: 'Schema not found',
      code: 'SCHEMA_NOT_FOUND'
    });
  }
  
  // Incrementar versão
  const currentVersion = schemas[schemaId].version;
  const versionParts = currentVersion.split('.');
  versionParts[1] = (parseInt(versionParts[1]) + 1).toString();
  const newVersion = versionParts.join('.');
  
  schemas[schemaId] = {
    ...schemas[schemaId],
    ...updateData,
    version: newVersion,
    updatedAt: new Date().toISOString()
  };
  
  res.json({ data: schemas[schemaId] });
});

// Deletar schema
app.delete('/api/v1/schemas/:schemaId', (req, res) => {
  const { schemaId } = req.params;
  
  if (!schemas[schemaId]) {
    return res.status(404).json({
      error: 'Schema not found',
      code: 'SCHEMA_NOT_FOUND'
    });
  }
  
  delete schemas[schemaId];
  
  res.status(204).send();
});

// Validar dados contra schema
app.post('/api/v1/schemas/:schemaId/validate', (req, res) => {
  const { schemaId } = req.params;
  const { data } = req.body;
  
  const schema = schemas[schemaId];
  
  if (!schema) {
    return res.status(404).json({
      error: 'Schema not found',
      code: 'SCHEMA_NOT_FOUND'
    });
  }
  
  if (!data) {
    return res.status(400).json({
      error: 'Data to validate is required',
      code: 'MISSING_VALIDATION_DATA'
    });
  }
  
  // Validação simples mock
  const errors = [];
  
  // Verificar campos obrigatórios
  if (schema.required) {
    schema.required.forEach(field => {
      if (!(field in data)) {
        errors.push({
          field,
          message: `Required field '${field}' is missing`,
          code: 'MISSING_REQUIRED_FIELD'
        });
      }
    });
  }
  
  // Verificar tipos básicos
  Object.entries(schema.properties).forEach(([field, fieldSchema]) => {
    if (field in data) {
      const value = data[field];
      const expectedType = fieldSchema.type;
      
      if (expectedType === 'string' && typeof value !== 'string') {
        errors.push({
          field,
          message: `Field '${field}' must be a string`,
          code: 'INVALID_TYPE'
        });
      } else if (expectedType === 'integer' && !Number.isInteger(value)) {
        errors.push({
          field,
          message: `Field '${field}' must be an integer`,
          code: 'INVALID_TYPE'
        });
      } else if (expectedType === 'number' && typeof value !== 'number') {
        errors.push({
          field,
          message: `Field '${field}' must be a number`,
          code: 'INVALID_TYPE'
        });
      }
    }
  });
  
  const isValid = errors.length === 0;
  
  res.json({
    data: {
      valid: isValid,
      schemaId,
      schemaVersion: schema.version,
      errors,
      timestamp: new Date().toISOString()
    }
  });
});

// Obter compatibilidade entre schemas
app.post('/api/v1/schemas/compatibility', (req, res) => {
  const { sourceSchemaId, targetSchemaId } = req.body;
  
  if (!sourceSchemaId || !targetSchemaId) {
    return res.status(400).json({
      error: 'Source and target schema IDs are required',
      code: 'MISSING_SCHEMA_IDS'
    });
  }
  
  const sourceSchema = schemas[sourceSchemaId];
  const targetSchema = schemas[targetSchemaId];
  
  if (!sourceSchema || !targetSchema) {
    return res.status(404).json({
      error: 'One or both schemas not found',
      code: 'SCHEMA_NOT_FOUND'
    });
  }
  
  // Mock de análise de compatibilidade
  const compatibility = {
    compatible: Math.random() > 0.2, // 80% de chance de compatibilidade
    level: 'backward', // backward, forward, full, none
    issues: [],
    recommendations: [
      'Consider using optional fields for new properties',
      'Maintain backward compatibility for required fields'
    ]
  };
  
  res.json({
    data: {
      sourceSchema: sourceSchemaId,
      targetSchema: targetSchemaId,
      compatibility,
      timestamp: new Date().toISOString()
    }
  });
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('Schema Registry Mock Error:', err);
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

const PORT = process.env.MOCK_SCHEMA_REGISTRY_PORT || 3003;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎭 Schema Registry Mock running on port ${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   GET  /health`);
    console.log(`   GET  /api/v1/schemas`);
    console.log(`   GET  /api/v1/schemas/:schemaId`);
    console.log(`   POST /api/v1/schemas`);
    console.log(`   PUT  /api/v1/schemas/:schemaId`);
    console.log(`   DELETE /api/v1/schemas/:schemaId`);
    console.log(`   POST /api/v1/schemas/:schemaId/validate`);
    console.log(`   POST /api/v1/schemas/compatibility`);
  });
}

module.exports = app;