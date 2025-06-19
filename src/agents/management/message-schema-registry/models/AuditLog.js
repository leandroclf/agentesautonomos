/**
 * AuditLog Model - Message Schema Registry
 * Modelo para logs de auditoria e rastreamento de operações
 */

const mongoose = require('mongoose');

/**
 * Schema para detalhes da operação
 */
const operationDetailsSchema = new mongoose.Schema({
  // Dados antes da operação
  before: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Dados depois da operação
  after: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Campos modificados
  changedFields: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  }],
  
  // Parâmetros da operação
  parameters: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Resultado da operação
  result: {
    success: {
      type: Boolean,
      required: true
    },
    message: String,
    errorCode: String,
    errorDetails: mongoose.Schema.Types.Mixed
  }
}, { _id: false });

/**
 * Schema para informações de contexto
 */
const contextSchema = new mongoose.Schema({
  // Informações da requisição HTTP
  request: {
    method: String,
    path: String,
    query: mongoose.Schema.Types.Mixed,
    headers: {
      userAgent: String,
      contentType: String,
      authorization: String, // Será sanitizado
      correlationId: String
    },
    body: mongoose.Schema.Types.Mixed, // Será sanitizado
    ip: String,
    duration: Number // em millisegundos
  },
  
  // Informações do sistema
  system: {
    hostname: String,
    pid: Number,
    nodeVersion: String,
    environment: String,
    serviceVersion: String
  },
  
  // Informações de sessão
  session: {
    sessionId: String,
    correlationId: String,
    traceId: String
  }
}, { _id: false });

/**
 * Schema principal para logs de auditoria
 */
const auditLogSchema = new mongoose.Schema({
  // Identificador único do evento
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Timestamp do evento
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Tipo de evento
  eventType: {
    type: String,
    required: true,
    enum: [
      'schema.register',
      'schema.update',
      'schema.delete',
      'schema.deprecate',
      'schema.restore',
      'schema.validate',
      'schema.get',
      'schema.list',
      'compatibility.test',
      'compatibility.update',
      'compatibility.get',
      'config.update',
      'config.get',
      'user.login',
      'user.logout',
      'user.create',
      'user.update',
      'user.delete',
      'system.startup',
      'system.shutdown',
      'system.error',
      'api.access',
      'security.violation'
    ],
    index: true
  },
  
  // Categoria do evento
  category: {
    type: String,
    required: true,
    enum: ['schema', 'compatibility', 'config', 'user', 'system', 'api', 'security'],
    index: true
  },
  
  // Severidade do evento
  severity: {
    type: String,
    required: true,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
    index: true
  },
  
  // Usuário que executou a operação
  user: {
    id: String,
    username: String,
    email: String,
    roles: [String],
    type: String // admin, user, service, etc.
  },
  
  // Recurso afetado
  resource: {
    type: {
      type: String,
      enum: ['schema', 'subject', 'config', 'user', 'system'],
      required: true
    },
    id: String,
    name: String,
    subject: String, // Para schemas
    version: Number  // Para schemas
  },
  
  // Ação executada
  action: {
    type: String,
    required: true,
    enum: [
      'create', 'read', 'update', 'delete', 'restore',
      'validate', 'test', 'deprecate', 'list',
      'login', 'logout', 'access', 'violation'
    ],
    index: true
  },
  
  // Descrição da operação
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  
  // Detalhes da operação
  details: operationDetailsSchema,
  
  // Contexto da operação
  context: contextSchema,
  
  // Tags para categorização adicional
  tags: [{
    type: String,
    maxlength: 50
  }],
  
  // Metadados adicionais
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Status de retenção
  retention: {
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }
    },
    archived: {
      type: Boolean,
      default: false,
      index: true
    },
    archivedAt: Date
  }
}, {
  timestamps: false, // Usamos timestamp customizado
  collection: 'audit_logs'
});

/**
 * Índices compostos
 */
auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ category: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ 'user.id': 1, timestamp: -1 });
auditLogSchema.index({ 'resource.type': 1, 'resource.id': 1, timestamp: -1 });
auditLogSchema.index({ 'resource.subject': 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ tags: 1, timestamp: -1 });
auditLogSchema.index({ 'context.request.ip': 1, timestamp: -1 });
auditLogSchema.index({ 'context.session.correlationId': 1 });

/**
 * Middleware para sanitização de dados sensíveis
 */
auditLogSchema.pre('save', function(next) {
  // Sanitizar dados sensíveis no contexto
  if (this.context && this.context.request) {
    // Sanitizar headers de autorização
    if (this.context.request.headers && this.context.request.headers.authorization) {
      this.context.request.headers.authorization = '[REDACTED]';
    }
    
    // Sanitizar body se contiver dados sensíveis
    if (this.context.request.body) {
      this.context.request.body = this.sanitizeBody(this.context.request.body);
    }
  }
  
  // Sanitizar detalhes da operação
  if (this.details) {
    if (this.details.before) {
      this.details.before = this.sanitizeData(this.details.before);
    }
    if (this.details.after) {
      this.details.after = this.sanitizeData(this.details.after);
    }
    if (this.details.parameters) {
      this.details.parameters = this.sanitizeData(this.details.parameters);
    }
  }
  
  next();
});

/**
 * Middleware para definir expiração automática
 */
auditLogSchema.pre('save', function(next) {
  if (this.isNew && !this.retention.expiresAt) {
    // Definir expiração baseada na severidade e categoria
    const retentionDays = this.getRetentionPeriod();
    this.retention.expiresAt = new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000));
  }
  next();
});

/**
 * Métodos de instância
 */

/**
 * Sanitizar dados sensíveis
 */
auditLogSchema.methods.sanitizeData = function(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'authorization',
    'apiKey', 'privateKey', 'credential', 'auth'
  ];
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  // Recursivamente sanitizar objetos aninhados
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = this.sanitizeData(value);
    }
  }
  
  return sanitized;
};

/**
 * Sanitizar body da requisição
 */
auditLogSchema.methods.sanitizeBody = function(body) {
  if (!body) return body;
  
  // Limitar tamanho do body para evitar logs muito grandes
  const bodyStr = JSON.stringify(body);
  if (bodyStr.length > 10000) { // 10KB
    return { _truncated: true, _size: bodyStr.length, _preview: bodyStr.substring(0, 1000) };
  }
  
  return this.sanitizeData(body);
};

/**
 * Obter período de retenção baseado na severidade e categoria
 */
auditLogSchema.methods.getRetentionPeriod = function() {
  const retentionMap = {
    critical: {
      security: 2555, // 7 anos
      schema: 1095,   // 3 anos
      default: 730    // 2 anos
    },
    error: {
      security: 1095, // 3 anos
      schema: 730,    // 2 anos
      default: 365    // 1 ano
    },
    warning: {
      security: 730,  // 2 anos
      schema: 365,    // 1 ano
      default: 180    // 6 meses
    },
    info: {
      security: 365,  // 1 ano
      schema: 180,    // 6 meses
      default: 90     // 3 meses
    }
  };
  
  const severityMap = retentionMap[this.severity] || retentionMap.info;
  return severityMap[this.category] || severityMap.default;
};

/**
 * Arquivar log
 */
auditLogSchema.methods.archive = function() {
  this.retention.archived = true;
  this.retention.archivedAt = new Date();
  return this.save();
};

/**
 * Métodos estáticos
 */

/**
 * Criar log de auditoria
 */
auditLogSchema.statics.createLog = function(logData) {
  const { v4: uuidv4 } = require('uuid');
  
  const auditLog = new this({
    eventId: uuidv4(),
    timestamp: new Date(),
    ...logData
  });
  
  return auditLog.save();
};

/**
 * Buscar logs com filtros
 */
auditLogSchema.statics.searchLogs = function(filters = {}, options = {}) {
  const {
    eventType,
    category,
    severity,
    userId,
    resourceType,
    resourceId,
    action,
    startDate,
    endDate,
    ip,
    correlationId,
    tags,
    search
  } = filters;
  
  const {
    page = 1,
    limit = 100,
    sort = 'timestamp',
    order = 'desc',
    includeArchived = false
  } = options;
  
  const query = {};
  
  if (eventType) query.eventType = eventType;
  if (category) query.category = category;
  if (severity) query.severity = severity;
  if (userId) query['user.id'] = userId;
  if (resourceType) query['resource.type'] = resourceType;
  if (resourceId) query['resource.id'] = resourceId;
  if (action) query.action = action;
  if (ip) query['context.request.ip'] = ip;
  if (correlationId) query['context.session.correlationId'] = correlationId;
  if (tags && tags.length > 0) query.tags = { $in: tags };
  
  if (!includeArchived) {
    query['retention.archived'] = { $ne: true };
  }
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  if (search) {
    query.$or = [
      { description: new RegExp(search, 'i') },
      { 'user.username': new RegExp(search, 'i') },
      { 'resource.name': new RegExp(search, 'i') },
      { 'resource.subject': new RegExp(search, 'i') }
    ];
  }
  
  const sortObj = {};
  sortObj[sort] = order === 'desc' ? -1 : 1;
  
  return this.find(query)
    .sort(sortObj)
    .skip((page - 1) * limit)
    .limit(limit);
};

/**
 * Obter estatísticas de auditoria
 */
auditLogSchema.statics.getStats = function(timeRange = '24h') {
  const now = new Date();
  let startDate;
  
  switch (timeRange) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate },
        'retention.archived': { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        eventsByType: {
          $push: {
            type: '$eventType',
            category: '$category',
            severity: '$severity'
          }
        },
        eventsByCategory: { $addToSet: '$category' },
        eventsBySeverity: { $addToSet: '$severity' },
        uniqueUsers: { $addToSet: '$user.id' },
        uniqueIPs: { $addToSet: '$context.request.ip' },
        errorCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'error'] }, 1, 0] }
        },
        criticalCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalEvents: 1,
        errorCount: 1,
        criticalCount: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        uniqueIPs: { $size: '$uniqueIPs' },
        timeRange,
        generatedAt: new Date()
      }
    }
  ]);
};

/**
 * Limpar logs expirados
 */
auditLogSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    'retention.expiresAt': { $lte: new Date() },
    'retention.archived': { $ne: true }
  });
};

/**
 * Arquivar logs antigos
 */
auditLogSchema.statics.archiveOldLogs = function(daysOld = 90) {
  const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
  
  return this.updateMany(
    {
      timestamp: { $lte: cutoffDate },
      'retention.archived': { $ne: true }
    },
    {
      $set: {
        'retention.archived': true,
        'retention.archivedAt': new Date()
      }
    }
  );
};

/**
 * Configurar toJSON
 */
auditLogSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;