/**
 * Config Model - Message Schema Registry
 * Modelo para configurações do sistema e compatibilidade
 */

const mongoose = require('mongoose');

/**
 * Schema para configurações de compatibilidade
 */
const compatibilityConfigSchema = new mongoose.Schema({
  // Tipo de configuração (global ou por subject)
  type: {
    type: String,
    enum: ['global', 'subject'],
    required: true,
    index: true
  },
  
  // Subject (apenas para configurações específicas)
  subject: {
    type: String,
    trim: true,
    match: /^[a-zA-Z0-9._-]+$/,
    maxlength: 255,
    index: true,
    validate: {
      validator: function(v) {
        // Subject é obrigatório apenas para type 'subject'
        return this.type !== 'subject' || (v && v.length > 0);
      },
      message: 'Subject is required for subject-specific configurations'
    }
  },
  
  // Nível de compatibilidade
  compatibility: {
    type: String,
    enum: [
      'BACKWARD',           // Nova versão pode ler dados da versão anterior
      'BACKWARD_TRANSITIVE', // Nova versão pode ler dados de todas as versões anteriores
      'FORWARD',            // Versão anterior pode ler dados da nova versão
      'FORWARD_TRANSITIVE', // Todas as versões anteriores podem ler dados da nova versão
      'FULL',               // Compatibilidade bidirecional com versão anterior
      'FULL_TRANSITIVE',    // Compatibilidade bidirecional com todas as versões
      'NONE'                // Sem verificação de compatibilidade
    ],
    required: true,
    default: 'BACKWARD'
  },
  
  // Configurações específicas por tipo de schema
  schemaTypeSettings: {
    AVRO: {
      allowMissingFields: {
        type: Boolean,
        default: true
      },
      allowExtraFields: {
        type: Boolean,
        default: false
      },
      strictTypeChecking: {
        type: Boolean,
        default: true
      }
    },
    JSON: {
      allowAdditionalProperties: {
        type: Boolean,
        default: false
      },
      strictValidation: {
        type: Boolean,
        default: true
      },
      coerceTypes: {
        type: Boolean,
        default: false
      }
    },
    PROTOBUF: {
      allowUnknownFields: {
        type: Boolean,
        default: false
      },
      strictSyntax: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // Metadados da configuração
  description: {
    type: String,
    trim: true,
    maxlength: 500
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
  }
}, {
  timestamps: true,
  collection: 'compatibility_configs'
});

/**
 * Schema para configurações gerais do sistema
 */
const systemConfigSchema = new mongoose.Schema({
  // Chave única da configuração
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
    index: true
  },
  
  // Valor da configuração
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Tipo do valor para validação
  valueType: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array'],
    required: true
  },
  
  // Categoria da configuração
  category: {
    type: String,
    enum: [
      'validation',
      'compatibility',
      'performance',
      'security',
      'monitoring',
      'storage',
      'api',
      'general'
    ],
    required: true,
    index: true
  },
  
  // Descrição da configuração
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Valor padrão
  defaultValue: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Se a configuração é sensível (não deve ser exposta em logs)
  sensitive: {
    type: Boolean,
    default: false
  },
  
  // Se a configuração requer reinicialização do serviço
  requiresRestart: {
    type: Boolean,
    default: false
  },
  
  // Validação customizada
  validation: {
    min: Number,
    max: Number,
    pattern: String,
    allowedValues: [mongoose.Schema.Types.Mixed]
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
  }
}, {
  timestamps: true,
  collection: 'system_configs'
});

/**
 * Índices para configurações de compatibilidade
 */
compatibilityConfigSchema.index({ type: 1, subject: 1 }, { unique: true });
compatibilityConfigSchema.index({ compatibility: 1 });
compatibilityConfigSchema.index({ createdAt: -1 });

/**
 * Índices para configurações do sistema
 */
systemConfigSchema.index({ category: 1 });
systemConfigSchema.index({ sensitive: 1 });
systemConfigSchema.index({ requiresRestart: 1 });

/**
 * Middleware para validação de configurações de compatibilidade
 */
compatibilityConfigSchema.pre('save', function(next) {
  // Validar que configurações globais não tenham subject
  if (this.type === 'global' && this.subject) {
    return next(new Error('Global configurations cannot have a subject'));
  }
  
  // Validar que configurações de subject tenham subject
  if (this.type === 'subject' && !this.subject) {
    return next(new Error('Subject configurations must have a subject'));
  }
  
  next();
});

/**
 * Middleware para validação de configurações do sistema
 */
systemConfigSchema.pre('save', function(next) {
  // Validar tipo do valor
  const actualType = Array.isArray(this.value) ? 'array' : typeof this.value;
  if (actualType !== this.valueType) {
    return next(new Error(`Value type mismatch. Expected ${this.valueType}, got ${actualType}`));
  }
  
  // Validar contra regras de validação
  if (this.validation) {
    const { min, max, pattern, allowedValues } = this.validation;
    
    if (typeof this.value === 'number') {
      if (min !== undefined && this.value < min) {
        return next(new Error(`Value ${this.value} is below minimum ${min}`));
      }
      if (max !== undefined && this.value > max) {
        return next(new Error(`Value ${this.value} is above maximum ${max}`));
      }
    }
    
    if (typeof this.value === 'string' && pattern) {
      const regex = new RegExp(pattern);
      if (!regex.test(this.value)) {
        return next(new Error(`Value does not match pattern ${pattern}`));
      }
    }
    
    if (allowedValues && allowedValues.length > 0) {
      if (!allowedValues.includes(this.value)) {
        return next(new Error(`Value must be one of: ${allowedValues.join(', ')}`));
      }
    }
  }
  
  next();
});

/**
 * Middleware para atualizar timestamp
 */
compatibilityConfigSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

systemConfigSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

/**
 * Métodos estáticos para configurações de compatibilidade
 */

/**
 * Obter configuração de compatibilidade para um subject
 */
compatibilityConfigSchema.statics.getCompatibilityForSubject = async function(subject) {
  // Primeiro, tentar encontrar configuração específica do subject
  let config = await this.findOne({ type: 'subject', subject });
  
  // Se não encontrar, usar configuração global
  if (!config) {
    config = await this.findOne({ type: 'global' });
  }
  
  // Se ainda não encontrar, retornar configuração padrão
  if (!config) {
    return {
      compatibility: 'BACKWARD',
      type: 'default'
    };
  }
  
  return config;
};

/**
 * Definir configuração global de compatibilidade
 */
compatibilityConfigSchema.statics.setGlobalCompatibility = function(compatibility, userId) {
  return this.findOneAndUpdate(
    { type: 'global' },
    {
      compatibility,
      updatedBy: userId,
      updatedAt: new Date()
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

/**
 * Definir configuração de compatibilidade para subject
 */
compatibilityConfigSchema.statics.setSubjectCompatibility = function(subject, compatibility, userId) {
  return this.findOneAndUpdate(
    { type: 'subject', subject },
    {
      compatibility,
      updatedBy: userId,
      updatedAt: new Date()
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

/**
 * Remover configuração de compatibilidade de subject
 */
compatibilityConfigSchema.statics.removeSubjectCompatibility = function(subject) {
  return this.deleteOne({ type: 'subject', subject });
};

/**
 * Métodos estáticos para configurações do sistema
 */

/**
 * Obter configuração por chave
 */
systemConfigSchema.statics.getConfig = async function(key, defaultValue = null) {
  const config = await this.findOne({ key });
  return config ? config.value : defaultValue;
};

/**
 * Definir configuração
 */
systemConfigSchema.statics.setConfig = function(key, value, options = {}) {
  const {
    valueType = typeof value,
    category = 'general',
    description = '',
    sensitive = false,
    requiresRestart = false,
    userId = 'system'
  } = options;
  
  return this.findOneAndUpdate(
    { key },
    {
      value,
      valueType: Array.isArray(value) ? 'array' : valueType,
      category,
      description,
      sensitive,
      requiresRestart,
      updatedBy: userId,
      updatedAt: new Date()
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

/**
 * Obter configurações por categoria
 */
systemConfigSchema.statics.getConfigsByCategory = function(category) {
  return this.find({ category }).sort({ key: 1 });
};

/**
 * Obter todas as configurações (excluindo sensíveis)
 */
systemConfigSchema.statics.getAllConfigs = function(includeSensitive = false) {
  const filter = includeSensitive ? {} : { sensitive: { $ne: true } };
  return this.find(filter).sort({ category: 1, key: 1 });
};

/**
 * Inicializar configurações padrão
 */
systemConfigSchema.statics.initializeDefaults = async function() {
  const defaults = [
    {
      key: 'max_schema_size',
      value: 1048576, // 1MB
      valueType: 'number',
      category: 'validation',
      description: 'Maximum size of a schema in bytes'
    },
    {
      key: 'max_batch_size',
      value: 1000,
      valueType: 'number',
      category: 'validation',
      description: 'Maximum number of messages in a batch validation'
    },
    {
      key: 'cache_ttl_seconds',
      value: 3600,
      valueType: 'number',
      category: 'performance',
      description: 'Cache TTL in seconds'
    },
    {
      key: 'enable_metrics',
      value: true,
      valueType: 'boolean',
      category: 'monitoring',
      description: 'Enable metrics collection'
    },
    {
      key: 'enable_audit_log',
      value: true,
      valueType: 'boolean',
      category: 'security',
      description: 'Enable audit logging'
    },
    {
      key: 'api_rate_limit',
      value: 1000,
      valueType: 'number',
      category: 'api',
      description: 'API rate limit per IP per 15 minutes'
    },
    {
      key: 'supported_schema_types',
      value: ['AVRO', 'JSON', 'PROTOBUF'],
      valueType: 'array',
      category: 'validation',
      description: 'Supported schema types'
    }
  ];
  
  for (const config of defaults) {
    await this.setConfig(config.key, config.value, {
      valueType: config.valueType,
      category: config.category,
      description: config.description,
      userId: 'system'
    });
  }
};

/**
 * Métodos de instância
 */

/**
 * Verificar se configuração é global
 */
compatibilityConfigSchema.methods.isGlobal = function() {
  return this.type === 'global';
};

/**
 * Verificar se configuração é específica de subject
 */
compatibilityConfigSchema.methods.isSubjectSpecific = function() {
  return this.type === 'subject';
};

/**
 * Obter configurações por tipo de schema
 */
compatibilityConfigSchema.methods.getSchemaTypeSettings = function(schemaType) {
  return this.schemaTypeSettings[schemaType] || {};
};

/**
 * Configurar toJSON para remover campos sensíveis
 */
systemConfigSchema.set('toJSON', {
  transform: function(doc, ret) {
    if (doc.sensitive) {
      ret.value = '[REDACTED]';
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

compatibilityConfigSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const CompatibilityConfig = mongoose.model('CompatibilityConfig', compatibilityConfigSchema);
const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

module.exports = {
  CompatibilityConfig,
  SystemConfig
};