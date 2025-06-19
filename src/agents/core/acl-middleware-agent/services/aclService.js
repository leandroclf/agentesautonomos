/**
 * ACL Service - Controle de Acesso
 * Implementa regras de controle de acesso para mensagens entre agentes
 */

class ACLService {
  constructor(logger) {
    this.logger = logger;
    this.rules = new Map();
    this.lastUpdate = new Date().toISOString();
    this.defaultPolicy = 'allow'; // 'allow' or 'deny'
  }

  async initialize() {
    // Load default ACL rules
    this.loadDefaultRules();
    this.logger.info('ACL Service initialized', {
      rulesCount: this.rules.size,
      defaultPolicy: this.defaultPolicy
    });
  }

  loadDefaultRules() {
    // Rule 1: Allow all core agents
    this.addRule({
      id: 'allow-core-agents',
      priority: 100,
      conditions: {
        source: ['interface-agent', 'event-agent', 'planning-agent', 'execution-agent', 'state-management-agent']
      },
      action: 'allow',
      transformations: ['normalize-headers', 'add-timestamp']
    });

    // Rule 2: Rate limit by source
    this.addRule({
      id: 'rate-limit-external',
      priority: 200,
      conditions: {
        source: 'external',
        rateLimit: {
          maxRequests: 100,
          windowMs: 60000 // 1 minute
        }
      },
      action: 'allow',
      transformations: ['add-rate-limit-headers']
    });

    // Rule 3: Block oversized messages
    this.addRule({
      id: 'block-oversized',
      priority: 50,
      conditions: {
        messageSize: { max: 10485760 } // 10MB
      },
      action: 'deny',
      reason: 'Message size exceeds limit'
    });

    // Rule 4: Require authentication for sensitive operations
    this.addRule({
      id: 'require-auth-sensitive',
      priority: 75,
      conditions: {
        type: ['state_update', 'policy_change', 'agent_control'],
        authenticated: false
      },
      action: 'deny',
      reason: 'Authentication required for sensitive operations'
    });

    // Rule 5: Transform user intentions
    this.addRule({
      id: 'transform-user-intentions',
      priority: 150,
      conditions: {
        type: 'user_intention'
      },
      action: 'allow',
      transformations: ['validate-intention-schema', 'enrich-context', 'add-tracking-id']
    });
  }

  addRule(rule) {
    if (!rule.id || !rule.conditions || !rule.action) {
      throw new Error('Invalid rule: missing required fields (id, conditions, action)');
    }

    this.rules.set(rule.id, {
      ...rule,
      createdAt: new Date().toISOString(),
      enabled: true
    });

    this.lastUpdate = new Date().toISOString();
    this.logger.debug('ACL rule added', { ruleId: rule.id, priority: rule.priority });
  }

  removeRule(ruleId) {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.lastUpdate = new Date().toISOString();
      this.logger.debug('ACL rule removed', { ruleId });
    }
    return removed;
  }

  async checkAccess(message) {
    const startTime = Date.now();
    const context = this.buildContext(message);
    
    // Get applicable rules sorted by priority
    const applicableRules = this.getApplicableRules(message, context);
    
    let finalDecision = this.defaultPolicy;
    let appliedRules = [];
    let transformations = [];
    let denyReason = null;

    // Process rules in priority order (lower number = higher priority)
    for (const rule of applicableRules) {
      if (!rule.enabled) continue;

      const matches = await this.evaluateRule(rule, message, context);
      if (matches) {
        appliedRules.push({
          id: rule.id,
          priority: rule.priority,
          action: rule.action
        });

        if (rule.action === 'deny') {
          finalDecision = 'deny';
          denyReason = rule.reason || 'Access denied by ACL rule';
          break; // Deny rules are final
        } else if (rule.action === 'allow') {
          finalDecision = 'allow';
          if (rule.transformations) {
            transformations.push(...rule.transformations);
          }
        }
      }
    }

    const processingTime = Date.now() - startTime;
    
    const result = {
      allowed: finalDecision === 'allow',
      reason: denyReason,
      rulesApplied: appliedRules,
      transformations: [...new Set(transformations)], // Remove duplicates
      processingTime,
      context
    };

    this.logger.debug('ACL check completed', {
      messageId: message.id,
      allowed: result.allowed,
      rulesApplied: appliedRules.length,
      processingTime
    });

    return result;
  }

  buildContext(message) {
    return {
      timestamp: new Date().toISOString(),
      messageSize: JSON.stringify(message).length,
      source: message.source || message.from || 'unknown',
      destination: message.destination || message.to,
      type: message.type || message.eventType,
      authenticated: message.authenticated || false,
      userId: message.userId,
      sessionId: message.sessionId,
      ip: message.ip,
      userAgent: message.userAgent
    };
  }

  getApplicableRules(message, context) {
    const applicable = [];
    
    for (const rule of this.rules.values()) {
      if (this.ruleCouldApply(rule, message, context)) {
        applicable.push(rule);
      }
    }
    
    // Sort by priority (lower number = higher priority)
    return applicable.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  }

  ruleCouldApply(rule, message, context) {
    // Quick check to see if rule could possibly apply
    // This is a performance optimization to avoid expensive evaluations
    
    const conditions = rule.conditions;
    
    // Check source condition
    if (conditions.source) {
      if (Array.isArray(conditions.source)) {
        if (!conditions.source.includes(context.source)) {
          return false;
        }
      } else if (conditions.source !== context.source) {
        return false;
      }
    }
    
    // Check type condition
    if (conditions.type) {
      if (Array.isArray(conditions.type)) {
        if (!conditions.type.includes(context.type)) {
          return false;
        }
      } else if (conditions.type !== context.type) {
        return false;
      }
    }
    
    return true;
  }

  async evaluateRule(rule, message, context) {
    try {
      const conditions = rule.conditions;
      
      // Evaluate each condition
      for (const [key, value] of Object.entries(conditions)) {
        if (!await this.evaluateCondition(key, value, message, context)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error('Error evaluating ACL rule', {
        ruleId: rule.id,
        error: error.message
      });
      return false;
    }
  }

  async evaluateCondition(key, value, message, context) {
    switch (key) {
      case 'source':
        if (Array.isArray(value)) {
          return value.includes(context.source);
        }
        return context.source === value;
        
      case 'type':
        if (Array.isArray(value)) {
          return value.includes(context.type);
        }
        return context.type === value;
        
      case 'authenticated':
        return context.authenticated === value;
        
      case 'messageSize':
        if (value.max && context.messageSize > value.max) {
          return false;
        }
        if (value.min && context.messageSize < value.min) {
          return false;
        }
        return true;
        
      case 'rateLimit':
        return await this.checkRateLimit(context.source, value);
        
      case 'timeWindow':
        return this.checkTimeWindow(value);
        
      case 'customCondition':
        return await this.evaluateCustomCondition(value, message, context);
        
      default:
        // For unknown conditions, check if the value exists in message or context
        return message[key] === value || context[key] === value;
    }
  }

  async checkRateLimit(source, rateLimit) {
    // Simple in-memory rate limiting
    // In production, this should use Redis or similar
    
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }
    
    const key = `rate_limit_${source}`;
    const now = Date.now();
    const window = rateLimit.windowMs || 60000;
    const maxRequests = rateLimit.maxRequests || 100;
    
    if (!this.rateLimitStore.has(key)) {
      this.rateLimitStore.set(key, {
        requests: 1,
        windowStart: now
      });
      return true;
    }
    
    const data = this.rateLimitStore.get(key);
    
    // Reset window if expired
    if (now - data.windowStart > window) {
      data.requests = 1;
      data.windowStart = now;
      return true;
    }
    
    // Check if under limit
    if (data.requests < maxRequests) {
      data.requests++;
      return true;
    }
    
    return false; // Rate limit exceeded
  }

  checkTimeWindow(timeWindow) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    if (timeWindow.hours) {
      const allowedHours = Array.isArray(timeWindow.hours) ? timeWindow.hours : [timeWindow.hours];
      if (!allowedHours.includes(currentHour)) {
        return false;
      }
    }
    
    if (timeWindow.days) {
      const allowedDays = Array.isArray(timeWindow.days) ? timeWindow.days : [timeWindow.days];
      if (!allowedDays.includes(currentDay)) {
        return false;
      }
    }
    
    return true;
  }

  async evaluateCustomCondition(condition, message, context) {
    // Placeholder for custom condition evaluation
    // This could execute safe JavaScript expressions or call external services
    
    if (typeof condition === 'function') {
      return await condition(message, context);
    }
    
    if (typeof condition === 'string') {
      // Simple expression evaluation (be very careful with security here)
      // In production, use a safe expression evaluator
      return true; // Placeholder
    }
    
    return true;
  }

  getRulesCount() {
    return this.rules.size;
  }

  getLastUpdate() {
    return this.lastUpdate;
  }

  getRules() {
    return Array.from(this.rules.values());
  }

  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  updateRule(ruleId, updates) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }
    
    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.rules.set(ruleId, updatedRule);
    this.lastUpdate = new Date().toISOString();
    
    this.logger.info('ACL rule updated', { ruleId, updates });
    return updatedRule;
  }

  enableRule(ruleId) {
    return this.updateRule(ruleId, { enabled: true });
  }

  disableRule(ruleId) {
    return this.updateRule(ruleId, { enabled: false });
  }

  getStats() {
    const rules = Array.from(this.rules.values());
    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      disabledRules: rules.filter(r => !r.enabled).length,
      rulesByAction: {
        allow: rules.filter(r => r.action === 'allow').length,
        deny: rules.filter(r => r.action === 'deny').length
      },
      lastUpdate: this.lastUpdate
    };
  }
}

module.exports = ACLService;