/**
 * Audit Logger Service
 * Registra eventos de auditoria para controle de acesso e transformações
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AuditLogger {
  constructor(logger) {
    this.logger = logger;
    this.auditLogs = [];
    this.maxLogsInMemory = 1000;
    this.auditFilePath = path.join(process.cwd(), 'logs', 'audit.log');
    this.flushInterval = 30000; // 30 seconds
    this.flushTimer = null;
  }

  async initialize() {
    // Ensure logs directory exists
    const logsDir = path.dirname(this.auditFilePath);
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create logs directory:', error);
    }

    // Start periodic flush
    this.startPeriodicFlush();
    
    this.logger.info('Audit Logger initialized', {
      auditFilePath: this.auditFilePath,
      maxLogsInMemory: this.maxLogsInMemory,
      flushInterval: this.flushInterval
    });
  }

  startPeriodicFlush() {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flushToDisk();
      } catch (error) {
        this.logger.error('Failed to flush audit logs:', error);
      }
    }, this.flushInterval);
  }

  stopPeriodicFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async logIncoming(message) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'incoming_message',
      messageId: message.id,
      source: message.source || message.from || 'unknown',
      messageType: message.type || message.eventType,
      size: JSON.stringify(message).length,
      headers: message.headers || {},
      metadata: {
        ip: message.ip,
        userAgent: message.userAgent,
        userId: message.userId,
        sessionId: message.sessionId
      }
    };

    await this.addAuditEntry(auditEntry);
    
    this.logger.debug('Incoming message audited', {
      messageId: message.id,
      source: auditEntry.source,
      size: auditEntry.size
    });
  }

  async logOutgoing(message, destination) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'outgoing_message',
      messageId: message.id,
      destination,
      messageType: message.type || message.eventType,
      size: JSON.stringify(message).length,
      transformationsApplied: message._transformations?.applied || [],
      processingTime: message.processingTime,
      routing: message.routing || {}
    };

    await this.addAuditEntry(auditEntry);
    
    this.logger.debug('Outgoing message audited', {
      messageId: message.id,
      destination,
      transformationsCount: auditEntry.transformationsApplied.length
    });
  }

  async logAccessDenied(message, reason) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'access_denied',
      messageId: message.id,
      source: message.source || message.from || 'unknown',
      messageType: message.type || message.eventType,
      reason,
      severity: 'warning',
      metadata: {
        ip: message.ip,
        userAgent: message.userAgent,
        userId: message.userId,
        sessionId: message.sessionId,
        size: JSON.stringify(message).length
      }
    };

    await this.addAuditEntry(auditEntry);
    
    this.logger.warn('Access denied audited', {
      messageId: message.id,
      source: auditEntry.source,
      reason
    });
  }

  async logTransformationError(message, transformationName, error) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'transformation_error',
      messageId: message.id,
      transformationName,
      error: {
        message: error.message,
        stack: error.stack
      },
      severity: 'error',
      metadata: {
        messageType: message.type || message.eventType,
        source: message.source || message.from || 'unknown'
      }
    };

    await this.addAuditEntry(auditEntry);
    
    this.logger.error('Transformation error audited', {
      messageId: message.id,
      transformationName,
      error: error.message
    });
  }

  async logRuleViolation(message, rule, violation) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'rule_violation',
      messageId: message.id,
      ruleId: rule.id,
      rulePriority: rule.priority,
      violation,
      severity: 'warning',
      metadata: {
        messageType: message.type || message.eventType,
        source: message.source || message.from || 'unknown',
        ruleAction: rule.action
      }
    };

    await this.addAuditEntry(auditEntry);
    
    this.logger.warn('Rule violation audited', {
      messageId: message.id,
      ruleId: rule.id,
      violation
    });
  }

  async logSecurityEvent(eventType, details) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'security_event',
      eventType,
      severity: details.severity || 'medium',
      details,
      metadata: {
        agent: 'acl-middleware-agent',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    await this.addAuditEntry(auditEntry);
    
    this.logger.warn('Security event audited', {
      eventType,
      severity: auditEntry.severity
    });
  }

  async logPerformanceMetric(metric) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'performance_metric',
      metric: {
        name: metric.name,
        value: metric.value,
        unit: metric.unit || 'ms',
        tags: metric.tags || {}
      },
      metadata: {
        agent: 'acl-middleware-agent',
        processId: process.pid,
        memoryUsage: process.memoryUsage()
      }
    };

    await this.addAuditEntry(auditEntry);
  }

  async addAuditEntry(entry) {
    // Add to in-memory buffer
    this.auditLogs.push(entry);
    
    // Trim buffer if too large
    if (this.auditLogs.length > this.maxLogsInMemory) {
      const excess = this.auditLogs.length - this.maxLogsInMemory;
      this.auditLogs.splice(0, excess);
    }
    
    // Immediate flush for critical events
    if (this.isCriticalEvent(entry)) {
      await this.flushToDisk();
    }
  }

  isCriticalEvent(entry) {
    const criticalTypes = ['access_denied', 'security_event', 'rule_violation'];
    const criticalSeverities = ['error', 'critical'];
    
    return criticalTypes.includes(entry.type) || 
           criticalSeverities.includes(entry.severity);
  }

  async flushToDisk() {
    if (this.auditLogs.length === 0) {
      return;
    }
    
    const logsToFlush = [...this.auditLogs];
    this.auditLogs = [];
    
    try {
      const logLines = logsToFlush.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await fs.appendFile(this.auditFilePath, logLines, 'utf8');
      
      this.logger.debug('Audit logs flushed to disk', {
        count: logsToFlush.length,
        filePath: this.auditFilePath
      });
    } catch (error) {
      // Put logs back in buffer if flush failed
      this.auditLogs.unshift(...logsToFlush);
      throw error;
    }
  }

  async getAuditLogs(filters = {}) {
    // Return in-memory logs (for recent activity)
    let logs = [...this.auditLogs];
    
    // Apply filters
    if (filters.type) {
      logs = logs.filter(log => log.type === filters.type);
    }
    
    if (filters.messageId) {
      logs = logs.filter(log => log.messageId === filters.messageId);
    }
    
    if (filters.source) {
      logs = logs.filter(log => log.source === filters.source);
    }
    
    if (filters.severity) {
      logs = logs.filter(log => log.severity === filters.severity);
    }
    
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
    }
    
    if (filters.until) {
      const untilDate = new Date(filters.until);
      logs = logs.filter(log => new Date(log.timestamp) <= untilDate);
    }
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    if (filters.limit) {
      logs = logs.slice(0, filters.limit);
    }
    
    return logs;
  }

  async getAuditStats() {
    const logs = this.auditLogs;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentLogs = logs.filter(log => new Date(log.timestamp) >= oneHourAgo);
    const dailyLogs = logs.filter(log => new Date(log.timestamp) >= oneDayAgo);
    
    const stats = {
      total: logs.length,
      lastHour: recentLogs.length,
      lastDay: dailyLogs.length,
      byType: {},
      bySeverity: {},
      bySource: {},
      errorRate: 0,
      accessDeniedRate: 0
    };
    
    // Count by type
    logs.forEach(log => {
      stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
      
      if (log.severity) {
        stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
      }
      
      if (log.source) {
        stats.bySource[log.source] = (stats.bySource[log.source] || 0) + 1;
      }
    });
    
    // Calculate rates
    const totalMessages = (stats.byType.incoming_message || 0) + (stats.byType.outgoing_message || 0);
    if (totalMessages > 0) {
      stats.errorRate = ((stats.byType.transformation_error || 0) / totalMessages * 100).toFixed(2);
      stats.accessDeniedRate = ((stats.byType.access_denied || 0) / totalMessages * 100).toFixed(2);
    }
    
    return stats;
  }

  async searchAuditLogs(query) {
    const logs = this.auditLogs;
    const searchTerm = query.toLowerCase();
    
    return logs.filter(log => {
      const logString = JSON.stringify(log).toLowerCase();
      return logString.includes(searchTerm);
    });
  }

  async cleanup() {
    try {
      // Flush remaining logs
      await this.flushToDisk();
      
      // Stop periodic flush
      this.stopPeriodicFlush();
      
      this.logger.info('Audit Logger cleanup completed');
    } catch (error) {
      this.logger.error('Error during audit logger cleanup:', error);
    }
  }

  getMemoryUsage() {
    return {
      logsInMemory: this.auditLogs.length,
      maxLogsInMemory: this.maxLogsInMemory,
      memoryUsageBytes: JSON.stringify(this.auditLogs).length,
      flushInterval: this.flushInterval
    };
  }
}

module.exports = AuditLogger;