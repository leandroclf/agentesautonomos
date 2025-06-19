/**
 * Message Transformer Service
 * Aplica transformações nas mensagens conforme regras ACL
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class MessageTransformer {
  constructor(logger) {
    this.logger = logger;
    this.transformers = new Map();
  }

  async initialize() {
    this.registerDefaultTransformers();
    this.logger.info('Message Transformer initialized', {
      transformersCount: this.transformers.size
    });
  }

  registerDefaultTransformers() {
    // Normalize headers
    this.registerTransformer('normalize-headers', (message) => {
      if (!message.headers) {
        message.headers = {};
      }
      
      // Ensure standard headers exist
      message.headers = {
        'content-type': 'application/json',
        'x-agent-version': '1.0.0',
        ...message.headers
      };
      
      return message;
    });

    // Add timestamp
    this.registerTransformer('add-timestamp', (message) => {
      message.timestamp = new Date().toISOString();
      message.processedAt = Date.now();
      return message;
    });

    // Add tracking ID
    this.registerTransformer('add-tracking-id', (message) => {
      if (!message.trackingId) {
        message.trackingId = uuidv4();
      }
      return message;
    });

    // Add rate limit headers
    this.registerTransformer('add-rate-limit-headers', (message) => {
      if (!message.headers) {
        message.headers = {};
      }
      
      message.headers['x-rate-limit-applied'] = 'true';
      message.headers['x-rate-limit-timestamp'] = new Date().toISOString();
      
      return message;
    });

    // Validate intention schema
    this.registerTransformer('validate-intention-schema', (message) => {
      if (message.type === 'user_intention') {
        // Ensure required fields for user intentions
        if (!message.intention) {
          throw new Error('Missing required field: intention');
        }
        
        if (!message.userId && !message.sessionId) {
          throw new Error('Missing user identification (userId or sessionId)');
        }
        
        // Normalize intention structure
        if (typeof message.intention === 'string') {
          message.intention = {
            description: message.intention,
            type: 'general',
            priority: 'normal'
          };
        }
        
        // Ensure intention has required fields
        message.intention = {
          type: 'general',
          priority: 'normal',
          ...message.intention
        };
      }
      
      return message;
    });

    // Enrich context
    this.registerTransformer('enrich-context', (message) => {
      if (!message.context) {
        message.context = {};
      }
      
      // Add system context
      message.context.system = {
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        hostname: require('os').hostname(),
        processId: process.pid
      };
      
      // Add processing context
      message.context.processing = {
        receivedAt: new Date().toISOString(),
        processedBy: 'acl-middleware-agent',
        stage: 'acl-processing'
      };
      
      return message;
    });

    // Sanitize content
    this.registerTransformer('sanitize-content', (message) => {
      if (message.content && typeof message.content === 'string') {
        // Remove potentially dangerous content
        message.content = message.content
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }
      
      return message;
    });

    // Add security headers
    this.registerTransformer('add-security-headers', (message) => {
      if (!message.headers) {
        message.headers = {};
      }
      
      message.headers['x-content-type-options'] = 'nosniff';
      message.headers['x-frame-options'] = 'DENY';
      message.headers['x-xss-protection'] = '1; mode=block';
      
      return message;
    });

    // Compress large payloads
    this.registerTransformer('compress-payload', (message) => {
      const messageSize = JSON.stringify(message).length;
      
      if (messageSize > 1024 * 1024) { // 1MB
        // Mark for compression (actual compression would be done by transport layer)
        if (!message.headers) {
          message.headers = {};
        }
        message.headers['content-encoding'] = 'gzip';
        message.compressed = true;
      }
      
      return message;
    });

    // Add message hash for integrity
    this.registerTransformer('add-integrity-hash', (message) => {
      // Create a hash of the message content for integrity verification
      const contentToHash = JSON.stringify({
        id: message.id,
        type: message.type,
        content: message.content || message.data,
        timestamp: message.timestamp
      });
      
      message.integrity = {
        hash: crypto.createHash('sha256').update(contentToHash).digest('hex'),
        algorithm: 'sha256'
      };
      
      return message;
    });

    // Anonymize sensitive data
    this.registerTransformer('anonymize-sensitive', (message) => {
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];
      
      const anonymize = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
          return obj;
        }
        
        const result = Array.isArray(obj) ? [] : {};
        
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          if (sensitiveFields.some(field => lowerKey.includes(field))) {
            result[key] = '[REDACTED]';
          } else if (typeof value === 'object') {
            result[key] = anonymize(value);
          } else {
            result[key] = value;
          }
        }
        
        return result;
      };
      
      return anonymize(message);
    });

    // Add routing information
    this.registerTransformer('add-routing-info', (message) => {
      if (!message.routing) {
        message.routing = {};
      }
      
      message.routing.processedBy = 'acl-middleware-agent';
      message.routing.hops = (message.routing.hops || 0) + 1;
      message.routing.path = message.routing.path || [];
      message.routing.path.push({
        agent: 'acl-middleware-agent',
        timestamp: new Date().toISOString()
      });
      
      return message;
    });
  }

  registerTransformer(name, transformerFunction) {
    if (typeof transformerFunction !== 'function') {
      throw new Error('Transformer must be a function');
    }
    
    this.transformers.set(name, transformerFunction);
    this.logger.debug('Transformer registered', { name });
  }

  unregisterTransformer(name) {
    const removed = this.transformers.delete(name);
    if (removed) {
      this.logger.debug('Transformer unregistered', { name });
    }
    return removed;
  }

  async transform(message, transformationNames) {
    if (!transformationNames || transformationNames.length === 0) {
      return message;
    }
    
    let transformedMessage = { ...message };
    const appliedTransformations = [];
    
    for (const transformationName of transformationNames) {
      try {
        const transformer = this.transformers.get(transformationName);
        
        if (!transformer) {
          this.logger.warn('Unknown transformation', { transformationName });
          continue;
        }
        
        const startTime = Date.now();
        transformedMessage = await this.applyTransformation(transformer, transformedMessage);
        const duration = Date.now() - startTime;
        
        appliedTransformations.push({
          name: transformationName,
          duration,
          success: true
        });
        
        this.logger.debug('Transformation applied', {
          transformationName,
          duration,
          messageId: message.id
        });
        
      } catch (error) {
        this.logger.error('Transformation failed', {
          transformationName,
          error: error.message,
          messageId: message.id
        });
        
        appliedTransformations.push({
          name: transformationName,
          success: false,
          error: error.message
        });
        
        // Decide whether to continue or fail
        if (this.isTransformationCritical(transformationName)) {
          throw new Error(`Critical transformation failed: ${transformationName} - ${error.message}`);
        }
      }
    }
    
    // Add transformation metadata
    transformedMessage._transformations = {
      applied: appliedTransformations,
      totalCount: transformationNames.length,
      successCount: appliedTransformations.filter(t => t.success).length,
      timestamp: new Date().toISOString()
    };
    
    return transformedMessage;
  }

  async applyTransformation(transformer, message) {
    // Clone message to avoid mutations
    const messageClone = JSON.parse(JSON.stringify(message));
    
    // Apply transformation
    const result = await transformer(messageClone);
    
    // Validate result
    if (!result || typeof result !== 'object') {
      throw new Error('Transformer must return an object');
    }
    
    return result;
  }

  isTransformationCritical(transformationName) {
    const criticalTransformations = [
      'validate-intention-schema',
      'sanitize-content',
      'add-security-headers'
    ];
    
    return criticalTransformations.includes(transformationName);
  }

  getAvailableTransformations() {
    return Array.from(this.transformers.keys());
  }

  getTransformationInfo(name) {
    const transformer = this.transformers.get(name);
    if (!transformer) {
      return null;
    }
    
    return {
      name,
      exists: true,
      critical: this.isTransformationCritical(name)
    };
  }

  validateMessage(message) {
    if (!message || typeof message !== 'object') {
      throw new Error('Message must be an object');
    }
    
    if (!message.id) {
      message.id = uuidv4();
    }
    
    if (!message.type) {
      throw new Error('Message must have a type');
    }
    
    return message;
  }

  getStats() {
    return {
      totalTransformers: this.transformers.size,
      availableTransformations: this.getAvailableTransformations(),
      criticalTransformations: this.getAvailableTransformations().filter(name => 
        this.isTransformationCritical(name)
      )
    };
  }
}

module.exports = MessageTransformer;