/**
 * User Model - Message Schema Registry
 * Modelo para gerenciamento de usuários, autenticação e autorização
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Schema para preferências do usuário
 */
const preferencesSchema = new mongoose.Schema({
  // Preferências de notificação
  notifications: {
    email: {
      type: Boolean,
      default: true
    },
    schemaChanges: {
      type: Boolean,
      default: true
    },
    systemAlerts: {
      type: Boolean,
      default: true
    },
    weeklyReports: {
      type: Boolean,
      default: false
    }
  },
  
  // Preferências de interface
  ui: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    language: {
      type: String,
      enum: ['en', 'pt', 'es', 'fr'],
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    itemsPerPage: {
      type: Number,
      min: 10,
      max: 100,
      default: 25
    }
  },
  
  // Preferências de API
  api: {
    defaultFormat: {
      type: String,
      enum: ['json', 'avro', 'protobuf'],
      default: 'json'
    },
    includeMetadata: {
      type: Boolean,
      default: true
    },
    rateLimitNotifications: {
      type: Boolean,
      default: true
    }
  }
}, { _id: false });

/**
 * Schema para informações de segurança
 */
const securitySchema = new mongoose.Schema({
  // Tentativas de login
  loginAttempts: {
    count: {
      type: Number,
      default: 0
    },
    lastAttempt: Date,
    lockedUntil: Date
  },
  
  // Histórico de senhas
  passwordHistory: [{
    hash: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Tokens de recuperação
  resetToken: {
    token: String,
    expiresAt: Date,
    usedAt: Date
  },
  
  // Verificação de email
  emailVerification: {
    token: String,
    expiresAt: Date,
    verifiedAt: Date,
    isVerified: {
      type: Boolean,
      default: false
    }
  },
  
  // Autenticação de dois fatores
  twoFactor: {
    enabled: {
      type: Boolean,
      default: false
    },
    secret: String,
    backupCodes: [String],
    lastUsed: Date
  },
  
  // Sessões ativas
  activeSessions: [{
    sessionId: String,
    ip: String,
    userAgent: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }]
}, { _id: false });

/**
 * Schema para permissões específicas
 */
const permissionsSchema = new mongoose.Schema({
  // Permissões de schema
  schemas: {
    subjects: [String], // Subjects específicos que o usuário pode acessar
    actions: [{
      type: String,
      enum: ['read', 'write', 'delete', 'validate', 'evolve']
    }],
    restrictions: {
      maxSchemasPerSubject: Number,
      allowedSchemaTypes: [{
        type: String,
        enum: ['AVRO', 'JSON', 'PROTOBUF']
      }]
    }
  },
  
  // Permissões de compatibilidade
  compatibility: {
    canModifyGlobal: {
      type: Boolean,
      default: false
    },
    canModifySubject: {
      type: Boolean,
      default: false
    },
    subjects: [String] // Subjects específicos para configuração de compatibilidade
  },
  
  // Permissões de sistema
  system: {
    canViewMetrics: {
      type: Boolean,
      default: false
    },
    canViewAuditLogs: {
      type: Boolean,
      default: false
    },
    canManageUsers: {
      type: Boolean,
      default: false
    },
    canManageConfig: {
      type: Boolean,
      default: false
    }
  },
  
  // Permissões de API
  api: {
    rateLimit: {
      requestsPerMinute: {
        type: Number,
        default: 100
      },
      requestsPerHour: {
        type: Number,
        default: 1000
      },
      requestsPerDay: {
        type: Number,
        default: 10000
      }
    },
    allowedEndpoints: [String],
    restrictedEndpoints: [String]
  }
}, { _id: false });

/**
 * Schema principal do usuário
 */
const userSchema = new mongoose.Schema({
  // Identificação básica
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[a-zA-Z0-9_-]+$/,
    index: true
  },
  
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    index: true
  },
  
  // Informações pessoais
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    avatar: {
      type: String,
      match: /^https?:\/\/.+/
    },
    bio: {
      type: String,
      maxlength: 500
    },
    organization: {
      type: String,
      trim: true,
      maxlength: 100
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100
    }
  },
  
  // Autenticação
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Não incluir por padrão nas consultas
  },
  
  // Autorização
  roles: [{
    type: String,
    enum: ['admin', 'developer', 'viewer', 'service', 'guest'],
    default: ['viewer']
  }],
  
  // Tipo de usuário
  userType: {
    type: String,
    enum: ['human', 'service', 'system'],
    default: 'human',
    index: true
  },
  
  // Status da conta
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'pending',
    index: true
  },
  
  // Permissões específicas
  permissions: permissionsSchema,
  
  // Preferências
  preferences: {
    type: preferencesSchema,
    default: () => ({})
  },
  
  // Informações de segurança
  security: {
    type: securitySchema,
    default: () => ({})
  },
  
  // API Keys
  apiKeys: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    hashedKey: {
      type: String,
      required: true
    },
    permissions: permissionsSchema,
    lastUsed: Date,
    expiresAt: Date,
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadados
  metadata: {
    source: {
      type: String,
      enum: ['registration', 'import', 'sso', 'api'],
      default: 'registration'
    },
    tags: [String],
    notes: String,
    externalId: String, // ID em sistema externo
    syncedAt: Date
  },
  
  // Estatísticas de uso
  usage: {
    lastLogin: Date,
    lastActivity: Date,
    loginCount: {
      type: Number,
      default: 0
    },
    apiCallCount: {
      type: Number,
      default: 0
    },
    schemasCreated: {
      type: Number,
      default: 0
    },
    schemasValidated: {
      type: Number,
      default: 0
    }
  },
  
  // Auditoria
  createdBy: {
    type: String,
    default: 'system'
  },
  
  updatedBy: String,
  
  deletedAt: Date,
  
  deletedBy: String
}, {
  timestamps: true,
  collection: 'users'
});

/**
 * Índices
 */
userSchema.index({ email: 1, status: 1 });
userSchema.index({ username: 1, status: 1 });
userSchema.index({ roles: 1, status: 1 });
userSchema.index({ userType: 1, status: 1 });
userSchema.index({ 'usage.lastActivity': -1 });
userSchema.index({ 'apiKeys.key': 1 });
userSchema.index({ 'apiKeys.hashedKey': 1 });
userSchema.index({ 'metadata.externalId': 1 });
userSchema.index({ createdAt: -1 });

/**
 * Middleware para hash da senha
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    // Hash da senha
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    // Adicionar ao histórico de senhas
    if (!this.security.passwordHistory) {
      this.security.passwordHistory = [];
    }
    
    this.security.passwordHistory.push({
      hash: this.password,
      createdAt: new Date()
    });
    
    // Manter apenas as últimas 5 senhas
    if (this.security.passwordHistory.length > 5) {
      this.security.passwordHistory = this.security.passwordHistory.slice(-5);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Middleware para definir displayName
 */
userSchema.pre('save', function(next) {
  if (!this.profile.displayName) {
    if (this.profile.firstName && this.profile.lastName) {
      this.profile.displayName = `${this.profile.firstName} ${this.profile.lastName}`;
    } else {
      this.profile.displayName = this.username;
    }
  }
  next();
});

/**
 * Métodos de instância
 */

/**
 * Verificar senha
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Verificar se a senha já foi usada
 */
userSchema.methods.isPasswordReused = async function(newPassword) {
  if (!this.security.passwordHistory || this.security.passwordHistory.length === 0) {
    return false;
  }
  
  for (const passwordEntry of this.security.passwordHistory) {
    const isMatch = await bcrypt.compare(newPassword, passwordEntry.hash);
    if (isMatch) {
      return true;
    }
  }
  
  return false;
};

/**
 * Verificar se a conta está bloqueada
 */
userSchema.methods.isLocked = function() {
  return !!(this.security.loginAttempts.lockedUntil && this.security.loginAttempts.lockedUntil > Date.now());
};

/**
 * Incrementar tentativas de login
 */
userSchema.methods.incrementLoginAttempts = function() {
  // Se já passou do tempo de bloqueio, resetar
  if (this.security.loginAttempts.lockedUntil && this.security.loginAttempts.lockedUntil < Date.now()) {
    return this.updateOne({
      $unset: {
        'security.loginAttempts.lockedUntil': 1
      },
      $set: {
        'security.loginAttempts.count': 1,
        'security.loginAttempts.lastAttempt': Date.now()
      }
    });
  }
  
  const updates = {
    $inc: { 'security.loginAttempts.count': 1 },
    $set: { 'security.loginAttempts.lastAttempt': Date.now() }
  };
  
  // Bloquear após 5 tentativas por 30 minutos
  if (this.security.loginAttempts.count + 1 >= 5 && !this.isLocked()) {
    updates.$set['security.loginAttempts.lockedUntil'] = Date.now() + 30 * 60 * 1000;
  }
  
  return this.updateOne(updates);
};

/**
 * Resetar tentativas de login
 */
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: {
      'security.loginAttempts.count': 1,
      'security.loginAttempts.lockedUntil': 1
    }
  });
};

/**
 * Gerar token de reset de senha
 */
userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  
  this.security.resetToken = {
    token: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hora
  };
  
  return token;
};

/**
 * Gerar token de verificação de email
 */
userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  
  this.security.emailVerification = {
    token: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
  };
  
  return token;
};

/**
 * Gerar API Key
 */
userSchema.methods.generateApiKey = function(name, permissions = {}, expiresAt = null) {
  const key = `msr_${crypto.randomBytes(32).toString('hex')}`;
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  
  this.apiKeys.push({
    name,
    key: key.substring(0, 16) + '...', // Armazenar apenas parte da chave
    hashedKey,
    permissions,
    expiresAt,
    createdAt: new Date()
  });
  
  return key;
};

/**
 * Verificar API Key
 */
userSchema.methods.verifyApiKey = function(key) {
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  
  const apiKey = this.apiKeys.find(ak => 
    ak.hashedKey === hashedKey && 
    ak.isActive && 
    (!ak.expiresAt || ak.expiresAt > new Date())
  );
  
  if (apiKey) {
    apiKey.lastUsed = new Date();
    this.save();
    return apiKey;
  }
  
  return null;
};

/**
 * Verificar permissão
 */
userSchema.methods.hasPermission = function(resource, action, subject = null) {
  // Admin tem todas as permissões
  if (this.roles.includes('admin')) {
    return true;
  }
  
  // Verificar permissões específicas
  switch (resource) {
    case 'schema':
      if (!this.permissions.schemas.actions.includes(action)) {
        return false;
      }
      if (subject && this.permissions.schemas.subjects.length > 0) {
        return this.permissions.schemas.subjects.includes(subject);
      }
      return true;
      
    case 'compatibility':
      if (action === 'modify_global') {
        return this.permissions.compatibility.canModifyGlobal;
      }
      if (action === 'modify_subject') {
        if (!this.permissions.compatibility.canModifySubject) {
          return false;
        }
        if (subject && this.permissions.compatibility.subjects.length > 0) {
          return this.permissions.compatibility.subjects.includes(subject);
        }
        return true;
      }
      return false;
      
    case 'system':
      return this.permissions.system[`can${action.charAt(0).toUpperCase() + action.slice(1)}`] || false;
      
    default:
      return false;
  }
};

/**
 * Atualizar última atividade
 */
userSchema.methods.updateLastActivity = function() {
  this.usage.lastActivity = new Date();
  return this.save();
};

/**
 * Métodos estáticos
 */

/**
 * Encontrar por email ou username
 */
userSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ],
    status: { $ne: 'deleted' }
  });
};

/**
 * Encontrar por API Key
 */
userSchema.statics.findByApiKey = function(key) {
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  
  return this.findOne({
    'apiKeys.hashedKey': hashedKey,
    'apiKeys.isActive': true,
    'apiKeys.expiresAt': { $gt: new Date() },
    status: 'active'
  });
};

/**
 * Encontrar por token de reset
 */
userSchema.statics.findByPasswordResetToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.findOne({
    'security.resetToken.token': hashedToken,
    'security.resetToken.expiresAt': { $gt: Date.now() },
    'security.resetToken.usedAt': { $exists: false }
  });
};

/**
 * Encontrar por token de verificação de email
 */
userSchema.statics.findByEmailVerificationToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.findOne({
    'security.emailVerification.token': hashedToken,
    'security.emailVerification.expiresAt': { $gt: Date.now() },
    'security.emailVerification.verifiedAt': { $exists: false }
  });
};

/**
 * Buscar usuários com filtros
 */
userSchema.statics.searchUsers = function(filters = {}, options = {}) {
  const {
    search,
    roles,
    status,
    userType,
    organization,
    lastActivityBefore,
    lastActivityAfter
  } = filters;
  
  const {
    page = 1,
    limit = 50,
    sort = 'createdAt',
    order = 'desc'
  } = options;
  
  const query = { deletedAt: { $exists: false } };
  
  if (search) {
    query.$or = [
      { username: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { 'profile.displayName': new RegExp(search, 'i') },
      { 'profile.organization': new RegExp(search, 'i') }
    ];
  }
  
  if (roles && roles.length > 0) {
    query.roles = { $in: roles };
  }
  
  if (status) query.status = status;
  if (userType) query.userType = userType;
  if (organization) query['profile.organization'] = new RegExp(organization, 'i');
  
  if (lastActivityBefore || lastActivityAfter) {
    query['usage.lastActivity'] = {};
    if (lastActivityBefore) query['usage.lastActivity'].$lte = new Date(lastActivityBefore);
    if (lastActivityAfter) query['usage.lastActivity'].$gte = new Date(lastActivityAfter);
  }
  
  const sortObj = {};
  sortObj[sort] = order === 'desc' ? -1 : 1;
  
  return this.find(query)
    .select('-password -security.passwordHistory -security.resetToken -security.emailVerification')
    .sort(sortObj)
    .skip((page - 1) * limit)
    .limit(limit);
};

/**
 * Obter estatísticas de usuários
 */
userSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $match: {
        deletedAt: { $exists: false }
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        inactiveUsers: {
          $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
        },
        suspendedUsers: {
          $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
        },
        pendingUsers: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        humanUsers: {
          $sum: { $cond: [{ $eq: ['$userType', 'human'] }, 1, 0] }
        },
        serviceUsers: {
          $sum: { $cond: [{ $eq: ['$userType', 'service'] }, 1, 0] }
        },
        systemUsers: {
          $sum: { $cond: [{ $eq: ['$userType', 'system'] }, 1, 0] }
        },
        verifiedEmails: {
          $sum: { $cond: ['$security.emailVerification.isVerified', 1, 0] }
        },
        twoFactorEnabled: {
          $sum: { $cond: ['$security.twoFactor.enabled', 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalUsers: 1,
        activeUsers: 1,
        inactiveUsers: 1,
        suspendedUsers: 1,
        pendingUsers: 1,
        humanUsers: 1,
        serviceUsers: 1,
        systemUsers: 1,
        verifiedEmails: 1,
        twoFactorEnabled: 1,
        generatedAt: new Date()
      }
    }
  ]);
};

/**
 * Configurar toJSON
 */
userSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    delete ret.security.passwordHistory;
    delete ret.security.resetToken;
    delete ret.security.emailVerification;
    delete ret.security.twoFactor.secret;
    delete ret.security.twoFactor.backupCodes;
    
    // Sanitizar API keys
    if (ret.apiKeys) {
      ret.apiKeys = ret.apiKeys.map(key => ({
        name: key.name,
        key: key.key, // Já está truncada
        lastUsed: key.lastUsed,
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        createdAt: key.createdAt
      }));
    }
    
    return ret;
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;