/**
 * Normalization Service
 * Serviço responsável por normalizar eventos para formato padrão
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/enricherConfig');

class NormalizationService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.isRunning = false;
    
    // Mapeamentos de normalização
    this.fieldMappings = new Map();
    this.typeMappings = new Map();
    this.formatters = new Map();
    
    // Estatísticas
    this.stats = {
      totalNormalizations: 0,
      successfulNormalizations: 0,
      failedNormalizations: 0,
      fieldMappings: 0,
      typeConversions: 0,
      averageNormalizationTime: 0
    };
    
    // Configurações
    this.normalization = config.enrichment.normalization;
    
    // Inicializar mapeamentos padrão
    this.initializeMappings();
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Normalization Service already running');
      return;
    }

    this.logger.info('Starting Normalization Service');
    
    try {
      this.isRunning = true;
      this.logger.info('Normalization Service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Normalization Service', {
        error: error.message
      });
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Normalization Service not running');
      return;
    }

    this.logger.info('Stopping Normalization Service');
    this.isRunning = false;
    
    try {
      this.fieldMappings.clear();
      this.typeMappings.clear();
      this.formatters.clear();
      this.logger.info('Normalization Service stopped');
      
    } catch (error) {
      this.logger.error('Error stopping Normalization Service', {
        error: error.message
      });
    }
  }

  initializeMappings() {
    // Mapeamentos de campos comuns
    this.fieldMappings.set('user_id', 'userId');
    this.fieldMappings.set('user-id', 'userId');
    this.fieldMappings.set('uid', 'userId');
    this.fieldMappings.set('session_id', 'sessionId');
    this.fieldMappings.set('session-id', 'sessionId');
    this.fieldMappings.set('sid', 'sessionId');
    this.fieldMappings.set('org_id', 'organizationId');
    this.fieldMappings.set('organization_id', 'organizationId');
    this.fieldMappings.set('org-id', 'organizationId');
    this.fieldMappings.set('app_id', 'applicationId');
    this.fieldMappings.set('application_id', 'applicationId');
    this.fieldMappings.set('app-id', 'applicationId');
    this.fieldMappings.set('event_type', 'type');
    this.fieldMappings.set('event-type', 'type');
    this.fieldMappings.set('eventType', 'type');
    this.fieldMappings.set('created_at', 'timestamp');
    this.fieldMappings.set('created-at', 'timestamp');
    this.fieldMappings.set('createdAt', 'timestamp');
    this.fieldMappings.set('time', 'timestamp');
    this.fieldMappings.set('datetime', 'timestamp');
    
    // Mapeamentos de tipos de evento
    this.typeMappings.set('login', 'user.login');
    this.typeMappings.set('logout', 'user.logout');
    this.typeMappings.set('signup', 'user.register');
    this.typeMappings.set('register', 'user.register');
    this.typeMappings.set('page_view', 'app.pageview');
    this.typeMappings.set('pageview', 'app.pageview');
    this.typeMappings.set('click', 'app.click');
    this.typeMappings.set('form_submit', 'app.form.submit');
    this.typeMappings.set('api_call', 'app.api.call');
    this.typeMappings.set('error', 'system.error');
    this.typeMappings.set('warning', 'system.warning');
    this.typeMappings.set('info', 'system.info');
    
    // Formatadores de dados
    this.formatters.set('timestamp', this.formatTimestamp.bind(this));
    this.formatters.set('email', this.formatEmail.bind(this));
    this.formatters.set('url', this.formatUrl.bind(this));
    this.formatters.set('phone', this.formatPhone.bind(this));
    this.formatters.set('boolean', this.formatBoolean.bind(this));
    this.formatters.set('number', this.formatNumber.bind(this));
    
    this.logger.info('Normalization mappings initialized', {
      fieldMappings: this.fieldMappings.size,
      typeMappings: this.typeMappings.size,
      formatters: this.formatters.size
    });
  }

  async normalizeEvent(event) {
    const startTime = Date.now();
    
    try {
      this.emit('normalizationStarted', {
        eventId: event.id,
        originalType: event.type,
        timestamp: new Date().toISOString()
      });
      
      // Criar cópia do evento para normalização
      let normalizedEvent = JSON.parse(JSON.stringify(event));
      
      // Garantir campos obrigatórios
      normalizedEvent = this.ensureRequiredFields(normalizedEvent);
      
      // Normalizar campos
      normalizedEvent = this.normalizeFields(normalizedEvent);
      
      // Normalizar tipos
      normalizedEvent = this.normalizeTypes(normalizedEvent);
      
      // Formatar dados
      normalizedEvent = this.formatData(normalizedEvent);
      
      // Estruturar dados
      normalizedEvent = this.structureData(normalizedEvent);
      
      // Adicionar metadados de normalização
      normalizedEvent = this.addNormalizationMetadata(normalizedEvent, event);
      
      // Atualizar estatísticas
      this.stats.totalNormalizations++;
      this.stats.successfulNormalizations++;
      this.updateAverageNormalizationTime(Date.now() - startTime);
      
      this.emit('normalizationCompleted', {
        eventId: normalizedEvent.id,
        originalType: event.type,
        normalizedType: normalizedEvent.type,
        normalizationTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      this.logger.debug('Event normalized', {
        eventId: normalizedEvent.id,
        originalType: event.type,
        normalizedType: normalizedEvent.type
      });
      
      return normalizedEvent;
      
    } catch (error) {
      this.stats.failedNormalizations++;
      
      this.logger.error('Normalization failed', {
        eventId: event.id,
        error: error.message
      });
      
      // Retornar evento original em caso de erro
      return event;
    }
  }

  ensureRequiredFields(event) {
    // Garantir ID único
    if (!event.id) {
      event.id = uuidv4();
    }
    
    // Garantir timestamp
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }
    
    // Garantir source
    if (!event.source) {
      event.source = 'unknown';
    }
    
    // Garantir type
    if (!event.type) {
      event.type = 'unknown';
    }
    
    // Garantir data object
    if (!event.data) {
      event.data = {};
    }
    
    // Garantir metadata object
    if (!event.metadata) {
      event.metadata = {};
    }
    
    return event;
  }

  normalizeFields(event) {
    const normalizedEvent = {};
    
    // Processar cada campo do evento
    for (const [key, value] of Object.entries(event)) {
      // Verificar se existe mapeamento para o campo
      const normalizedKey = this.fieldMappings.get(key) || key;
      
      if (normalizedKey !== key) {
        this.stats.fieldMappings++;
      }
      
      // Processar valor recursivamente se for objeto
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        normalizedEvent[normalizedKey] = this.normalizeFields(value);
      } else {
        normalizedEvent[normalizedKey] = value;
      }
    }
    
    return normalizedEvent;
  }

  normalizeTypes(event) {
    if (event.type && this.typeMappings.has(event.type)) {
      const originalType = event.type;
      event.type = this.typeMappings.get(event.type);
      
      if (originalType !== event.type) {
        this.stats.typeConversions++;
        
        // Preservar tipo original nos metadados
        if (!event.metadata.original) {
          event.metadata.original = {};
        }
        event.metadata.original.type = originalType;
      }
    }
    
    return event;
  }

  formatData(event) {
    // Formatar timestamp
    if (event.timestamp) {
      event.timestamp = this.formatters.get('timestamp')(event.timestamp);
    }
    
    // Formatar campos de usuário
    if (event.user) {
      if (event.user.email) {
        event.user.email = this.formatters.get('email')(event.user.email);
      }
    }
    
    // Formatar dados específicos por tipo
    if (event.data) {
      event.data = this.formatDataByType(event.data, event.type);
    }
    
    return event;
  }

  formatDataByType(data, eventType) {
    const formattedData = { ...data };
    
    switch (eventType) {
      case 'app.pageview':
        if (formattedData.url) {
          formattedData.url = this.formatters.get('url')(formattedData.url);
        }
        break;
        
      case 'user.register':
      case 'user.login':
        if (formattedData.email) {
          formattedData.email = this.formatters.get('email')(formattedData.email);
        }
        if (formattedData.phone) {
          formattedData.phone = this.formatters.get('phone')(formattedData.phone);
        }
        break;
        
      case 'system.error':
      case 'system.warning':
        if (typeof formattedData.critical !== 'undefined') {
          formattedData.critical = this.formatters.get('boolean')(formattedData.critical);
        }
        break;
    }
    
    return formattedData;
  }

  structureData(event) {
    // Mover campos para estrutura padrão
    const structuredEvent = { ...event };
    
    // Estruturar informações de usuário
    if (event.userId && !event.user) {
      structuredEvent.user = {
        id: event.userId
      };
    }
    
    // Estruturar informações de sessão
    if (event.sessionId && !event.session) {
      structuredEvent.session = {
        id: event.sessionId
      };
    }
    
    // Estruturar informações de organização
    if (event.organizationId && !event.org) {
      structuredEvent.org = {
        id: event.organizationId
      };
    }
    
    // Estruturar informações de aplicação
    if (event.applicationId && !event.app) {
      structuredEvent.app = {
        id: event.applicationId
      };
    }
    
    return structuredEvent;
  }

  addNormalizationMetadata(normalizedEvent, originalEvent) {
    if (!normalizedEvent.metadata) {
      normalizedEvent.metadata = {};
    }
    
    normalizedEvent.metadata.normalization = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      changes: this.detectChanges(originalEvent, normalizedEvent)
    };
    
    return normalizedEvent;
  }

  detectChanges(original, normalized) {
    const changes = [];
    
    // Detectar mudanças de campos
    const originalKeys = Object.keys(original);
    const normalizedKeys = Object.keys(normalized);
    
    for (const key of originalKeys) {
      if (!normalizedKeys.includes(key)) {
        changes.push({
          type: 'field_renamed',
          from: key,
          to: this.fieldMappings.get(key) || 'unknown'
        });
      }
    }
    
    // Detectar mudanças de tipo
    if (original.type !== normalized.type) {
      changes.push({
        type: 'type_normalized',
        from: original.type,
        to: normalized.type
      });
    }
    
    // Detectar campos adicionados
    for (const key of normalizedKeys) {
      if (!originalKeys.includes(key) && !['metadata', 'context'].includes(key)) {
        changes.push({
          type: 'field_added',
          field: key
        });
      }
    }
    
    return changes;
  }

  // Formatadores específicos
  formatTimestamp(value) {
    try {
      // Aceitar vários formatos de timestamp
      let date;
      
      if (typeof value === 'number') {
        // Unix timestamp (segundos ou milissegundos)
        date = new Date(value < 10000000000 ? value * 1000 : value);
      } else if (typeof value === 'string') {
        date = new Date(value);
      } else {
        date = new Date();
      }
      
      // Validar data
      if (isNaN(date.getTime())) {
        date = new Date();
      }
      
      return date.toISOString();
      
    } catch (error) {
      this.logger.warn('Invalid timestamp format', { value });
      return new Date().toISOString();
    }
  }

  formatEmail(value) {
    if (typeof value !== 'string') {
      return value;
    }
    
    return value.toLowerCase().trim();
  }

  formatUrl(value) {
    if (typeof value !== 'string') {
      return value;
    }
    
    try {
      const url = new URL(value);
      return url.toString();
    } catch (error) {
      // Se não for URL válida, retornar como está
      return value;
    }
  }

  formatPhone(value) {
    if (typeof value !== 'string') {
      return value;
    }
    
    // Remover caracteres não numéricos exceto +
    return value.replace(/[^+\d]/g, '');
  }

  formatBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      return ['true', '1', 'yes', 'on'].includes(lowerValue);
    }
    
    if (typeof value === 'number') {
      return value !== 0;
    }
    
    return Boolean(value);
  }

  formatNumber(value) {
    if (typeof value === 'number') {
      return value;
    }
    
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    
    return 0;
  }

  addFieldMapping(from, to) {
    this.fieldMappings.set(from, to);
    this.logger.info('Field mapping added', { from, to });
  }

  addTypeMapping(from, to) {
    this.typeMappings.set(from, to);
    this.logger.info('Type mapping added', { from, to });
  }

  addFormatter(name, formatter) {
    if (typeof formatter === 'function') {
      this.formatters.set(name, formatter);
      this.logger.info('Formatter added', { name });
    }
  }

  updateAverageNormalizationTime(duration) {
    const total = this.stats.averageNormalizationTime * (this.stats.totalNormalizations - 1);
    this.stats.averageNormalizationTime = (total + duration) / this.stats.totalNormalizations;
  }

  getStats() {
    return {
      ...this.stats,
      mappingsCount: {
        fields: this.fieldMappings.size,
        types: this.typeMappings.size,
        formatters: this.formatters.size
      },
      isRunning: this.isRunning,
      successRate: this.stats.totalNormalizations > 0 
        ? (this.stats.successfulNormalizations / this.stats.totalNormalizations * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  getMappings() {
    return {
      fields: Object.fromEntries(this.fieldMappings),
      types: Object.fromEntries(this.typeMappings),
      formatters: Array.from(this.formatters.keys())
    };
  }
}

module.exports = NormalizationService;