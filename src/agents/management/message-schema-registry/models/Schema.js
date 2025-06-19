/**
 * Schema Model - Message Schema Registry
 * Modelo de dados para schemas com suporte a múltiplos formatos
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Schema para referências de outros schemas
 */
const referenceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    match: /^[a-zA-Z0-9._-]+$/,
    maxlength: 255
  },
  version: {
    type: Number,
    required: true,
    min: 1,
    max: 999999
  }
}, { _id: false });

/**
 * Schema para metadados
 */
const metadataSchema = new mongoose.Schema({
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  owner: {
    type: String,
    trim: true,
    maxlength: 100
  },
  documentation: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Documentation must be a valid URL'
    }
  },
  contact: {
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    team: {
      type: String,
      trim: true,
      maxlength: 100
    }
  },
  lifecycle: {
    type: String,
    enum: ['development', 'testing', 'production', 'deprecated', 'retired'],
    default: 'development'
  },
  criticality: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  }
}, { _id: false });

/**
 * Schema para estatísticas de uso
 */
const usageStatsSchema = new mongoose.Schema({
  validationCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastValidation: {
    type: Date
  },
  errorCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastError: {
    type: Date
  },
  consumers: [{
    service: String,
    lastUsed: Date,
    count: { type: Number, default: 0 }
  }]
}, { _id: false });

/**
 * Schema principal para schemas de mensagem
 */
const schemaSchema = new mongoose.Schema({
  // Identificação única global
  id: {
    type: Number,
    unique: true,
    index: true
  },
  
  // Subject (tópico/entidade)
  subject: {
    type: String,
    required: true,
    trim: true,
    index: true,
    match: /^[a-zA-Z0-9._-]+$/,
    maxlength: 255
  },
  
  // Versão do schema
  version: {
    type: Number,
    required: true,
    min: 1,
    max: 999999,
    index: true
  },
  
  // Conteúdo do schema
  schema: {
    type: String,
    required: true,
    maxlength: 1000000 // 1MB
  },
  
  // Tipo/formato do schema
  schemaType: {
    type: String,
    required: true,
    enum: ['AVRO', 'JSON', 'PROTOBUF'],
    default: 'JSON'
  },
  
  // Hash do conteúdo para detecção de duplicatas
  contentHash: {
    type: String,
    required: true,
    index: true
  },
  
  // Referências para outros schemas
  references: [referenceSchema],
  
  // Metadados
  metadata: {
    type: metadataSchema,
    default: {}
  },
  
  // Configuração de compatibilidade específica
  compatibility: {
    type: String,
    enum: ['BACKWARD', 'BACKWARD_TRANSITIVE', 'FORWARD', 'FORWARD_TRANSITIVE', 'FULL', 'FULL_TRANSITIVE', 'NONE'],
    default: null // null significa usar configuração global
  },
  
  // Status do schema
  status: {
    type: String,
    enum: ['active', 'deprecated', 'deleted'],
    default: 'active',
    index: true
  },
  
  // Informações de versionamento
  previousVersion: {
    type: Number,
    min: 1
  },
  
  nextVersion: {
    type: Number,
    min: 1
  },
  
  // Estatísticas de uso
  usageStats: {
    type: usageStatsSchema,
    default: {}
  },
  
  // Informações de auditoria
  createdBy: {
    type: String,
    required: true,
    trim: true
  },
  
  updatedBy: {
    type: String,
    trim: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  deprecatedAt: {
    type: Date,
    index: true
  },
  
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  collection: 'schemas'
});

/**
 * Índices compostos
 */
schemaSchema.index({ subject: 1, version: 1 }, { unique: true });
schemaSchema.index({ subject: 1, status: 1 });
schemaSchema.index({ schemaType: 1, status: 1 });
schemaSchema.index({ 'metadata.owner': 1 });
schemaSchema.index({ 'metadata.tags': 1 });
schemaSchema.index({ 'metadata.lifecycle': 1 });
schemaSchema.index({ createdAt: -1 });
schemaSchema.index({ updatedAt: -1 });

/**
 * Middleware para auto-incremento do ID
 */
schemaSchema.pre('save', async function(next) {
  if (this.isNew && !this.id) {
    try {
      const Counter = mongoose.model('Counter');
      const counter = await Counter.findOneAndUpdate(
        { name: 'schema_id' },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );
      this.id = counter.value;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

/**
 * Middleware para calcular hash do conteúdo
 */
schemaSchema.pre('save', function(next) {
  if (this.isModified('schema') || this.isNew) {
    this.contentHash = crypto
      .createHash('sha256')
      .update(this.schema)
      .digest('hex');
  }
  next();
});

/**
 * Middleware para atualizar timestamp
 */
schemaSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

/**
 * Métodos de instância
 */

/**
 * Verificar se o schema está ativo
 */
schemaSchema.methods.isActive = function() {
  return this.status === 'active';
};

/**
 * Verificar se o schema está depreciado
 */
schemaSchema.methods.isDeprecated = function() {
  return this.status === 'deprecated';
};

/**
 * Verificar se o schema está deletado
 */
schemaSchema.methods.isDeleted = function() {
  return this.status === 'deleted';
};

/**
 * Depreciar schema
 */
schemaSchema.methods.deprecate = function(userId) {
  this.status = 'deprecated';
  this.deprecatedAt = new Date();
  this.updatedBy = userId;
  return this.save();
};

/**
 * Deletar schema (soft delete)
 */
schemaSchema.methods.softDelete = function(userId) {
  this.status = 'deleted';
  this.deletedAt = new Date();
  this.updatedBy = userId;
  return this.save();
};

/**
 * Restaurar schema
 */
schemaSchema.methods.restore = function(userId) {
  this.status = 'active';
  this.deletedAt = undefined;
  this.deprecatedAt = undefined;
  this.updatedBy = userId;
  return this.save();
};

/**
 * Incrementar contador de validação
 */
schemaSchema.methods.incrementValidationCount = function(service = null) {
  this.usageStats.validationCount += 1;
  this.usageStats.lastValidation = new Date();
  
  if (service) {
    const consumer = this.usageStats.consumers.find(c => c.service === service);
    if (consumer) {
      consumer.count += 1;
      consumer.lastUsed = new Date();
    } else {
      this.usageStats.consumers.push({
        service,
        lastUsed: new Date(),
        count: 1
      });
    }
  }
  
  return this.save();
};

/**
 * Incrementar contador de erro
 */
schemaSchema.methods.incrementErrorCount = function() {
  this.usageStats.errorCount += 1;
  this.usageStats.lastError = new Date();
  return this.save();
};

/**
 * Obter schema parseado
 */
schemaSchema.methods.getParsedSchema = function() {
  try {
    switch (this.schemaType) {
      case 'JSON':
        return JSON.parse(this.schema);
      case 'AVRO':
        return JSON.parse(this.schema);
      case 'PROTOBUF':
        return this.schema; // Proto files são texto
      default:
        throw new Error(`Unsupported schema type: ${this.schemaType}`);
    }
  } catch (error) {
    throw new Error(`Failed to parse schema: ${error.message}`);
  }
};

/**
 * Validar schema
 */
schemaSchema.methods.validateSchema = function() {
  try {
    const parsed = this.getParsedSchema();
    
    switch (this.schemaType) {
      case 'JSON':
        // Validar JSON Schema
        if (!parsed.$schema && !parsed.type) {
          throw new Error('Invalid JSON Schema: missing $schema or type');
        }
        break;
      case 'AVRO':
        // Validar Avro Schema
        if (!parsed.type && !parsed.name) {
          throw new Error('Invalid Avro Schema: missing type or name');
        }
        break;
      case 'PROTOBUF':
        // Validação básica para Protobuf
        if (!this.schema.includes('message') && !this.schema.includes('service')) {
          throw new Error('Invalid Protobuf Schema: missing message or service definition');
        }
        break;
    }
    
    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Métodos estáticos
 */

/**
 * Encontrar por subject e versão
 */
schemaSchema.statics.findBySubjectAndVersion = function(subject, version) {
  return this.findOne({ subject, version, status: { $ne: 'deleted' } });
};

/**
 * Encontrar versão mais recente de um subject
 */
schemaSchema.statics.findLatestBySubject = function(subject) {
  return this.findOne(
    { subject, status: { $ne: 'deleted' } },
    null,
    { sort: { version: -1 } }
  );
};

/**
 * Encontrar todas as versões de um subject
 */
schemaSchema.statics.findAllVersionsBySubject = function(subject, includeDeleted = false) {
  const filter = { subject };
  if (!includeDeleted) {
    filter.status = { $ne: 'deleted' };
  }
  return this.find(filter).sort({ version: 1 });
};

/**
 * Encontrar por hash de conteúdo
 */
schemaSchema.statics.findByContentHash = function(contentHash) {
  return this.findOne({ contentHash, status: { $ne: 'deleted' } });
};

/**
 * Buscar schemas com filtros
 */
schemaSchema.statics.searchSchemas = function(filters = {}, options = {}) {
  const {
    subject,
    schemaType,
    status = 'active',
    owner,
    tags,
    lifecycle,
    criticality,
    createdAfter,
    createdBefore,
    search
  } = filters;
  
  const {
    page = 1,
    limit = 50,
    sort = 'createdAt',
    order = 'desc'
  } = options;
  
  const query = {};
  
  if (subject) {
    if (typeof subject === 'string' && subject.includes('*')) {
      query.subject = new RegExp(subject.replace(/\*/g, '.*'), 'i');
    } else {
      query.subject = subject;
    }
  }
  
  if (schemaType) query.schemaType = schemaType;
  if (status) query.status = status;
  if (owner) query['metadata.owner'] = owner;
  if (tags && tags.length > 0) query['metadata.tags'] = { $in: tags };
  if (lifecycle) query['metadata.lifecycle'] = lifecycle;
  if (criticality) query['metadata.criticality'] = criticality;
  
  if (createdAfter || createdBefore) {
    query.createdAt = {};
    if (createdAfter) query.createdAt.$gte = new Date(createdAfter);
    if (createdBefore) query.createdAt.$lte = new Date(createdBefore);
  }
  
  if (search) {
    query.$or = [
      { subject: new RegExp(search, 'i') },
      { 'metadata.description': new RegExp(search, 'i') },
      { 'metadata.tags': new RegExp(search, 'i') }
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
 * Obter estatísticas gerais
 */
schemaSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalSchemas: { $sum: 1 },
        activeSchemas: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        deprecatedSchemas: {
          $sum: { $cond: [{ $eq: ['$status', 'deprecated'] }, 1, 0] }
        },
        deletedSchemas: {
          $sum: { $cond: [{ $eq: ['$status', 'deleted'] }, 1, 0] }
        },
        totalSubjects: { $addToSet: '$subject' },
        schemaTypes: { $addToSet: '$schemaType' },
        totalValidations: { $sum: '$usageStats.validationCount' },
        totalErrors: { $sum: '$usageStats.errorCount' }
      }
    },
    {
      $project: {
        _id: 0,
        totalSchemas: 1,
        activeSchemas: 1,
        deprecatedSchemas: 1,
        deletedSchemas: 1,
        totalSubjects: { $size: '$totalSubjects' },
        schemaTypes: 1,
        totalValidations: 1,
        totalErrors: 1
      }
    }
  ]);
};

/**
 * Virtual para URL do schema
 */
schemaSchema.virtual('url').get(function() {
  return `/schemas/${this.subject}/versions/${this.version}`;
});

/**
 * Configurar toJSON
 */
schemaSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

/**
 * Modelo Counter para auto-incremento
 */
const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: Number,
    default: 0
  }
});

const Counter = mongoose.model('Counter', counterSchema);
const Schema = mongoose.model('Schema', schemaSchema);

module.exports = { Schema, Counter };