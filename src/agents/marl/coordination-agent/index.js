/**
 * Coordination Agent - Coordenação Multi-Agente
 * Fase 4: Aprendizado por Reforço Multi-Agente
 * 
 * Responsabilidades:
 * - Coordenar ações entre múltiplos agentes
 * - Resolver conflitos de recursos
 * - Otimizar colaboração
 * - Gerenciar dependências entre agentes
 * - Implementar estratégias de coordenação
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const config = require('../../config');

class CoordinationAgent {
  constructor() {
    this.agentId = 'coordination-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService();
    this.metrics = this.setupMetrics();
    this.isShuttingDown = false;
    
    // Coordination Configuration
    this.coordinationConfig = {
      maxConcurrentTasks: 10,
      resourceTimeout: 30000, // 30 seconds
      conflictResolutionStrategy: 'priority_based',
      collaborationThreshold: 0.7,
      coordinationWindow: 5000, // 5 seconds
      maxRetries: 3
    };
    
    // Agent Registry and Status
    this.agentRegistry = new Map();
    this.activeCoordinations = new Map();
    this.resourceAllocations = new Map();
    this.conflictHistory = [];
    
    // Coordination Strategies
    this.coordinationStrategies = {
      'sequential': this.sequentialCoordination.bind(this),
      'parallel': this.parallelCoordination.bind(this),
      'hierarchical': this.hierarchicalCoordination.bind(this),
      'consensus': this.consensusCoordination.bind(this)
    };
    
    // Performance Metrics
    this.coordinationStats = {
      totalCoordinations: 0,
      successfulCoordinations: 0,
      failedCoordinations: 0,
      averageCoordinationTime: 0,
      conflictsResolved: 0,
      resourceUtilization: 0,
      lastUpdate: new Date().toISOString()
    };
    
    // Filas SQS
    this.inputQueues = [
      'coordination-requests',
      'agent-status-updates',
      'resource-requests',
      'conflict-notifications'
    ];
    this.outputQueues = [
      'coordination-decisions',
      'resource-allocations',
      'conflict-resolutions',
      'collaboration-recommendations'
    ];
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
    this.initializeAgentRegistry();
    this.startCoordinationMonitoring();
  }

  setupLogger() {
    return winston.createLogger({
      level: config.shared.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        config.shared.logging.format === 'json' 
          ? winston.format.json()
          : winston.format.simple()
      ),
      defaultMeta: { service: this.agentId },
      transports: [
        ...(config.shared.logging.enableConsole ? [
          new winston.transports.Console()
        ] : []),
        ...(config.shared.logging.enableFile ? [
          new winston.transports.File({ 
            filename: `logs/${this.agentId}.log`,
            maxsize: 10485760, // 10MB
            maxFiles: 5
          })
        ] : [])
      ]
    });
  }

  setupMetrics() {
    const register = new promClient.Registry();
    
    const metrics = {
      coordinationRequests: new promClient.Counter({
        name: 'coordination_requests_total',
        help: 'Total number of coordination requests',
        labelNames: ['strategy', 'status'],
        registers: [register]
      }),
      
      coordinationDuration: new promClient.Histogram({
        name: 'coordination_duration_seconds',
        help: 'Duration of coordination processes',
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
        labelNames: ['strategy'],
        registers: [register]
      }),
      
      activeCoordinations: new promClient.Gauge({
        name: 'active_coordinations',
        help: 'Number of active coordinations',
        registers: [register]
      }),
      
      resourceUtilization: new promClient.Gauge({
        name: 'resource_utilization_ratio',
        help: 'Current resource utilization ratio',
        registers: [register]
      }),
      
      conflictsResolved: new promClient.Counter({
        name: 'conflicts_resolved_total',
        help: 'Total number of conflicts resolved',
        labelNames: ['resolution_type'],
        registers: [register]
      }),
      
      agentCollaboration: new promClient.Gauge({
        name: 'agent_collaboration_score',
        help: 'Agent collaboration effectiveness score',
        labelNames: ['agent_pair'],
        registers: [register]
      })
    };
    
    register.setDefaultLabels({
      agent: this.agentId,
      version: process.env.npm_package_version || '1.0.0'
    });
    
    return { register, ...metrics };
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000,
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);
    
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          ip: req.ip
        });
      });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        coordination: {
          activeCoordinations: this.activeCoordinations.size,
          registeredAgents: this.agentRegistry.size,
          resourceAllocations: this.resourceAllocations.size,
          successRate: this.coordinationStats.successfulCoordinations / 
                      Math.max(this.coordinationStats.totalCoordinations, 1)
        }
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', this.metrics.register.contentType);
        const metrics = await this.metrics.register.metrics();
        res.send(metrics);
      } catch (error) {
        this.logger.error('Error generating metrics:', error);
        res.status(500).send('Error generating metrics');
      }
    });

    // Coordination status
    this.app.get('/api/v1/coordination/status', (req, res) => {
      res.json({
        status: 'active',
        statistics: this.coordinationStats,
        configuration: this.coordinationConfig,
        activeCoordinations: Array.from(this.activeCoordinations.keys()),
        registeredAgents: Array.from(this.agentRegistry.keys()),
        timestamp: new Date().toISOString()
      });
    });

    // Agent registry
    this.app.get('/api/v1/agents', (req, res) => {
      const agents = {};
      for (const [agentId, agentInfo] of this.agentRegistry.entries()) {
        agents[agentId] = {
          status: agentInfo.status,
          capabilities: agentInfo.capabilities,
          currentLoad: agentInfo.currentLoad,
          lastSeen: agentInfo.lastSeen,
          collaborationScore: agentInfo.collaborationScore
        };
      }
      
      res.json({
        agents,
        totalAgents: this.agentRegistry.size,
        timestamp: new Date().toISOString()
      });
    });

    // Resource allocations
    this.app.get('/api/v1/resources', (req, res) => {
      const resources = {};
      for (const [resourceId, allocation] of this.resourceAllocations.entries()) {
        resources[resourceId] = {
          allocatedTo: allocation.allocatedTo,
          allocatedAt: allocation.allocatedAt,
          expiresAt: allocation.expiresAt,
          usage: allocation.usage
        };
      }
      
      res.json({
        resources,
        totalAllocations: this.resourceAllocations.size,
        utilizationRate: this.coordinationStats.resourceUtilization,
        timestamp: new Date().toISOString()
      });
    });

    // Manual coordination trigger
    this.app.post('/api/v1/coordination/trigger', async (req, res) => {
      try {
        const { agents, strategy, priority, resources } = req.body;
        
        if (!agents || !Array.isArray(agents) || agents.length < 2) {
          return res.status(400).json({
            error: 'At least 2 agents required for coordination'
          });
        }
        
        const coordinationId = await this.initiateCoordination({
          agents,
          strategy: strategy || 'parallel',
          priority: priority || 'normal',
          resources: resources || [],
          requestedBy: 'manual',
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          coordinationId,
          message: 'Coordination initiated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Manual coordination trigger error:', error);
        res.status(500).json({
          error: 'Failed to initiate coordination',
          message: error.message
        });
      }
    });
  }

  initializeAgentRegistry() {
    const knownAgents = [
      'interface-agent',
      'event-agent', 
      'planning-agent',
      'execution-agent',
      'state-management-agent',
      'acl-middleware-agent',
      'monitoring-agent',
      'policy-agent',
      'security-agent',
      'marl-agent'
    ];
    
    knownAgents.forEach(agentId => {
      this.agentRegistry.set(agentId, {
        status: 'unknown',
        capabilities: this.getDefaultCapabilities(agentId),
        currentLoad: 0,
        maxLoad: 100,
        lastSeen: null,
        collaborationScore: 0.5,
        coordinationHistory: [],
        preferences: {
          preferredPartners: [],
          avoidedPartners: [],
          resourceRequirements: []
        }
      });
    });
    
    this.logger.info('Initialized agent registry', { 
      agentCount: knownAgents.length,
      agents: knownAgents 
    });
  }

  getDefaultCapabilities(agentId) {
    const capabilityMap = {
      'interface-agent': ['user_interaction', 'request_processing'],
      'event-agent': ['event_processing', 'notification_handling'],
      'planning-agent': ['task_planning', 'strategy_development'],
      'execution-agent': ['task_execution', 'action_performance'],
      'state-management-agent': ['state_tracking', 'data_persistence'],
      'acl-middleware-agent': ['access_control', 'security_filtering'],
      'monitoring-agent': ['system_monitoring', 'health_checking'],
      'policy-agent': ['policy_enforcement', 'compliance_checking'],
      'security-agent': ['authentication', 'threat_detection'],
      'marl-agent': ['learning', 'policy_optimization']
    };
    
    return capabilityMap[agentId] || ['general_purpose'];
  }

  startCoordinationMonitoring() {
    // Monitor coordination timeouts
    setInterval(() => {
      this.checkCoordinationTimeouts();
    }, 5000);
    
    // Monitor resource allocations
    setInterval(() => {
      this.checkResourceTimeouts();
    }, 10000);
    
    // Update collaboration scores
    setInterval(() => {
      this.updateCollaborationScores();
    }, 30000);
    
    this.logger.info('Started coordination monitoring');
  }

  async checkCoordinationTimeouts() {
    const now = Date.now();
    const timeoutThreshold = this.coordinationConfig.coordinationWindow;
    
    for (const [coordinationId, coordination] of this.activeCoordinations.entries()) {
      if (now - coordination.startTime > timeoutThreshold) {
        this.logger.warn('Coordination timeout', {
          coordinationId,
          duration: now - coordination.startTime,
          agents: coordination.agents
        });
        
        await this.handleCoordinationTimeout(coordinationId, coordination);
      }
    }
  }

  async checkResourceTimeouts() {
    const now = Date.now();
    
    for (const [resourceId, allocation] of this.resourceAllocations.entries()) {
      if (allocation.expiresAt && now > allocation.expiresAt) {
        this.logger.info('Resource allocation expired', {
          resourceId,
          allocatedTo: allocation.allocatedTo
        });
        
        await this.releaseResource(resourceId);
      }
    }
  }

  updateCollaborationScores() {
    for (const [agentId, agentInfo] of this.agentRegistry.entries()) {
      const recentCoordinations = agentInfo.coordinationHistory
        .filter(coord => Date.now() - coord.timestamp < 300000); // Last 5 minutes
      
      if (recentCoordinations.length > 0) {
        const successRate = recentCoordinations
          .filter(coord => coord.success)
          .length / recentCoordinations.length;
        
        agentInfo.collaborationScore = (agentInfo.collaborationScore * 0.8) + (successRate * 0.2);
        
        this.metrics.agentCollaboration.set(
          { agent_pair: agentId },
          agentInfo.collaborationScore
        );
      }
    }
  }

  async initiateCoordination(request) {
    const coordinationId = `coord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Initiating coordination', {
        coordinationId,
        agents: request.agents,
        strategy: request.strategy
      });
      
      // Validate agents
      const validAgents = request.agents.filter(agentId => 
        this.agentRegistry.has(agentId)
      );
      
      if (validAgents.length < 2) {
        throw new Error('Insufficient valid agents for coordination');
      }
      
      // Check agent availability
      const availableAgents = validAgents.filter(agentId => {
        const agent = this.agentRegistry.get(agentId);
        return agent.status === 'active' && agent.currentLoad < agent.maxLoad;
      });
      
      if (availableAgents.length < 2) {
        throw new Error('Insufficient available agents for coordination');
      }
      
      // Create coordination record
      const coordination = {
        id: coordinationId,
        agents: availableAgents,
        strategy: request.strategy,
        priority: request.priority,
        resources: request.resources || [],
        status: 'active',
        startTime,
        requestedBy: request.requestedBy,
        steps: [],
        conflicts: []
      };
      
      this.activeCoordinations.set(coordinationId, coordination);
      
      // Allocate resources if needed
      if (request.resources && request.resources.length > 0) {
        await this.allocateResources(coordinationId, request.resources, availableAgents);
      }
      
      // Execute coordination strategy
      const strategy = this.coordinationStrategies[request.strategy];
      if (strategy) {
        await strategy(coordination);
      } else {
        throw new Error(`Unknown coordination strategy: ${request.strategy}`);
      }
      
      // Update metrics
      this.metrics.coordinationRequests.inc({
        strategy: request.strategy,
        status: 'initiated'
      });
      this.metrics.activeCoordinations.set(this.activeCoordinations.size);
      
      this.coordinationStats.totalCoordinations++;
      
      return coordinationId;
      
    } catch (error) {
      this.logger.error('Failed to initiate coordination:', error);
      
      this.metrics.coordinationRequests.inc({
        strategy: request.strategy || 'unknown',
        status: 'failed'
      });
      
      throw error;
    }
  }

  async sequentialCoordination(coordination) {
    this.logger.info('Executing sequential coordination', {
      coordinationId: coordination.id,
      agents: coordination.agents
    });
    
    for (let i = 0; i < coordination.agents.length; i++) {
      const agentId = coordination.agents[i];
      const nextAgentId = coordination.agents[i + 1] || null;
      
      const step = {
        stepId: i + 1,
        agentId,
        nextAgentId,
        startTime: Date.now(),
        status: 'executing'
      };
      
      coordination.steps.push(step);
      
      // Send coordination message to agent
      await this.sendCoordinationMessage(agentId, {
        type: 'sequential_coordination',
        coordinationId: coordination.id,
        step: step.stepId,
        totalSteps: coordination.agents.length,
        nextAgent: nextAgentId,
        resources: coordination.resources
      });
    }
  }

  async parallelCoordination(coordination) {
    this.logger.info('Executing parallel coordination', {
      coordinationId: coordination.id,
      agents: coordination.agents
    });
    
    const promises = coordination.agents.map(async (agentId, index) => {
      const step = {
        stepId: index + 1,
        agentId,
        startTime: Date.now(),
        status: 'executing'
      };
      
      coordination.steps.push(step);
      
      return this.sendCoordinationMessage(agentId, {
        type: 'parallel_coordination',
        coordinationId: coordination.id,
        step: step.stepId,
        totalAgents: coordination.agents.length,
        peerAgents: coordination.agents.filter(id => id !== agentId),
        resources: coordination.resources
      });
    });
    
    await Promise.all(promises);
  }

  async hierarchicalCoordination(coordination) {
    this.logger.info('Executing hierarchical coordination', {
      coordinationId: coordination.id,
      agents: coordination.agents
    });
    
    // Select coordinator (first agent or highest collaboration score)
    const coordinator = coordination.agents.reduce((best, agentId) => {
      const agent = this.agentRegistry.get(agentId);
      const bestAgent = this.agentRegistry.get(best);
      return agent.collaborationScore > bestAgent.collaborationScore ? agentId : best;
    });
    
    const subordinates = coordination.agents.filter(id => id !== coordinator);
    
    // Send coordinator message
    await this.sendCoordinationMessage(coordinator, {
      type: 'hierarchical_coordination_leader',
      coordinationId: coordination.id,
      role: 'coordinator',
      subordinates,
      resources: coordination.resources
    });
    
    // Send subordinate messages
    for (const agentId of subordinates) {
      await this.sendCoordinationMessage(agentId, {
        type: 'hierarchical_coordination_follower',
        coordinationId: coordination.id,
        role: 'subordinate',
        coordinator,
        peers: subordinates.filter(id => id !== agentId),
        resources: coordination.resources
      });
    }
  }

  async consensusCoordination(coordination) {
    this.logger.info('Executing consensus coordination', {
      coordinationId: coordination.id,
      agents: coordination.agents
    });
    
    // Send consensus request to all agents
    for (const agentId of coordination.agents) {
      await this.sendCoordinationMessage(agentId, {
        type: 'consensus_coordination',
        coordinationId: coordination.id,
        participants: coordination.agents,
        consensusThreshold: Math.ceil(coordination.agents.length / 2),
        resources: coordination.resources
      });
    }
  }

  async sendCoordinationMessage(agentId, message) {
    try {
      const fullMessage = {
        ...message,
        targetAgent: agentId,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('coordination-decisions', fullMessage);
      
      this.logger.debug('Sent coordination message', {
        targetAgent: agentId,
        type: message.type,
        coordinationId: message.coordinationId
      });
      
    } catch (error) {
      this.logger.error('Error sending coordination message:', error);
      throw error;
    }
  }

  async allocateResources(coordinationId, resources, agents) {
    for (const resourceId of resources) {
      // Check if resource is already allocated
      if (this.resourceAllocations.has(resourceId)) {
        const allocation = this.resourceAllocations.get(resourceId);
        
        if (allocation.expiresAt && Date.now() < allocation.expiresAt) {
          // Resource conflict - need resolution
          await this.handleResourceConflict(coordinationId, resourceId, agents);
          continue;
        }
      }
      
      // Allocate resource
      const allocation = {
        resourceId,
        allocatedTo: agents,
        coordinationId,
        allocatedAt: Date.now(),
        expiresAt: Date.now() + this.coordinationConfig.resourceTimeout,
        usage: 0
      };
      
      this.resourceAllocations.set(resourceId, allocation);
      
      this.logger.info('Resource allocated', {
        resourceId,
        coordinationId,
        agents
      });
    }
    
    this.updateResourceUtilization();
  }

  async handleResourceConflict(coordinationId, resourceId, requestingAgents) {
    const existingAllocation = this.resourceAllocations.get(resourceId);
    
    this.logger.warn('Resource conflict detected', {
      resourceId,
      coordinationId,
      requestingAgents,
      currentAllocation: existingAllocation.allocatedTo
    });
    
    const conflict = {
      id: `conflict_${Date.now()}`,
      resourceId,
      coordinationId,
      requestingAgents,
      currentAllocation: existingAllocation,
      timestamp: Date.now(),
      resolution: null
    };
    
    this.conflictHistory.push(conflict);
    
    // Apply conflict resolution strategy
    switch (this.coordinationConfig.conflictResolutionStrategy) {
      case 'priority_based':
        await this.resolvePriorityBasedConflict(conflict);
        break;
      case 'time_based':
        await this.resolveTimeBasedConflict(conflict);
        break;
      case 'negotiation':
        await this.resolveNegotiationConflict(conflict);
        break;
      default:
        await this.resolveDefaultConflict(conflict);
    }
    
    this.metrics.conflictsResolved.inc({ resolution_type: conflict.resolution });
    this.coordinationStats.conflictsResolved++;
  }

  async resolvePriorityBasedConflict(conflict) {
    // Simple priority resolution - newer coordination gets resource
    const coordination = this.activeCoordinations.get(conflict.coordinationId);
    
    if (coordination && coordination.priority === 'high') {
      await this.releaseResource(conflict.resourceId);
      await this.allocateResources(
        conflict.coordinationId,
        [conflict.resourceId],
        conflict.requestingAgents
      );
      
      conflict.resolution = 'priority_override';
      
      this.logger.info('Resource conflict resolved by priority', {
        resourceId: conflict.resourceId,
        coordinationId: conflict.coordinationId
      });
    } else {
      conflict.resolution = 'request_denied';
      
      this.logger.info('Resource conflict resolved by denying request', {
        resourceId: conflict.resourceId,
        coordinationId: conflict.coordinationId
      });
    }
  }

  async resolveTimeBasedConflict(conflict) {
    // Wait for current allocation to expire
    conflict.resolution = 'wait_for_expiry';
    
    this.logger.info('Resource conflict resolved by waiting', {
      resourceId: conflict.resourceId,
      coordinationId: conflict.coordinationId
    });
  }

  async resolveNegotiationConflict(conflict) {
    // Send negotiation messages to involved agents
    const negotiationMessage = {
      type: 'resource_negotiation',
      resourceId: conflict.resourceId,
      conflictId: conflict.id,
      participants: [...conflict.requestingAgents, ...conflict.currentAllocation.allocatedTo],
      timestamp: new Date().toISOString()
    };
    
    await this.sqsService.sendMessage('conflict-resolutions', negotiationMessage);
    
    conflict.resolution = 'negotiation_initiated';
    
    this.logger.info('Resource conflict resolution via negotiation', {
      resourceId: conflict.resourceId,
      conflictId: conflict.id
    });
  }

  async resolveDefaultConflict(conflict) {
    // Default: deny new request
    conflict.resolution = 'request_denied';
    
    this.logger.info('Resource conflict resolved by default denial', {
      resourceId: conflict.resourceId,
      coordinationId: conflict.coordinationId
    });
  }

  async releaseResource(resourceId) {
    const allocation = this.resourceAllocations.get(resourceId);
    
    if (allocation) {
      this.resourceAllocations.delete(resourceId);
      
      this.logger.info('Resource released', {
        resourceId,
        previousAllocation: allocation.allocatedTo,
        coordinationId: allocation.coordinationId
      });
      
      this.updateResourceUtilization();
    }
  }

  updateResourceUtilization() {
    const totalResources = 100; // Simplified assumption
    const allocatedResources = this.resourceAllocations.size;
    
    this.coordinationStats.resourceUtilization = allocatedResources / totalResources;
    this.metrics.resourceUtilization.set(this.coordinationStats.resourceUtilization);
  }

  async handleCoordinationTimeout(coordinationId, coordination) {
    this.logger.warn('Handling coordination timeout', {
      coordinationId,
      duration: Date.now() - coordination.startTime
    });
    
    coordination.status = 'timeout';
    
    // Release allocated resources
    for (const resourceId of coordination.resources) {
      await this.releaseResource(resourceId);
    }
    
    // Update agent coordination history
    for (const agentId of coordination.agents) {
      const agent = this.agentRegistry.get(agentId);
      if (agent) {
        agent.coordinationHistory.push({
          coordinationId,
          success: false,
          reason: 'timeout',
          timestamp: Date.now()
        });
      }
    }
    
    // Send timeout notification
    const timeoutMessage = {
      type: 'coordination_timeout',
      coordinationId,
      agents: coordination.agents,
      duration: Date.now() - coordination.startTime,
      timestamp: new Date().toISOString()
    };
    
    await this.sqsService.sendMessage('coordination-decisions', timeoutMessage);
    
    this.activeCoordinations.delete(coordinationId);
    this.coordinationStats.failedCoordinations++;
    
    this.metrics.coordinationDuration.observe(
      { strategy: coordination.strategy },
      (Date.now() - coordination.startTime) / 1000
    );
    this.metrics.activeCoordinations.set(this.activeCoordinations.size);
  }

  async startMessageProcessing() {
    try {
      // Start processing messages from input queues
      for (const queueName of this.inputQueues) {
        this.sqsService.startPolling(queueName, async (message) => {
          await this.handleIncomingMessage(queueName, message);
        });
      }
      
      this.logger.info('Started message processing', {
        inputQueues: this.inputQueues
      });
      
    } catch (error) {
      this.logger.error('Error starting message processing:', error);
      throw error;
    }
  }

  async handleIncomingMessage(queueName, message) {
    try {
      this.logger.debug('Processing message', {
        queue: queueName,
        messageType: message.type
      });
      
      switch (message.type) {
        case 'coordination_request':
          await this.handleCoordinationRequest(message);
          break;
          
        case 'agent_status_update':
          await this.handleAgentStatusUpdate(message);
          break;
          
        case 'resource_request':
          await this.handleResourceRequest(message);
          break;
          
        case 'conflict_notification':
          await this.handleConflictNotification(message);
          break;
          
        case 'coordination_completion':
          await this.handleCoordinationCompletion(message);
          break;
          
        default:
          this.logger.warn('Unknown message type', {
            type: message.type,
            queue: queueName
          });
      }
      
    } catch (error) {
      this.logger.error('Error handling message:', error);
      throw error;
    }
  }

  async handleCoordinationRequest(message) {
    try {
      const coordinationId = await this.initiateCoordination({
        agents: message.agents,
        strategy: message.strategy || 'parallel',
        priority: message.priority || 'normal',
        resources: message.resources || [],
        requestedBy: message.source || 'unknown',
        timestamp: message.timestamp
      });
      
      // Send response
      const response = {
        type: 'coordination_response',
        coordinationId,
        status: 'initiated',
        requestId: message.requestId,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('coordination-decisions', response);
      
    } catch (error) {
      this.logger.error('Error handling coordination request:', error);
      
      // Send error response
      const errorResponse = {
        type: 'coordination_error',
        error: error.message,
        requestId: message.requestId,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('coordination-decisions', errorResponse);
    }
  }

  async handleAgentStatusUpdate(message) {
    const { agentId, status, currentLoad, capabilities } = message;
    
    if (this.agentRegistry.has(agentId)) {
      const agent = this.agentRegistry.get(agentId);
      agent.status = status;
      agent.currentLoad = currentLoad || agent.currentLoad;
      agent.lastSeen = Date.now();
      
      if (capabilities) {
        agent.capabilities = capabilities;
      }
      
      this.logger.debug('Updated agent status', {
        agentId,
        status,
        currentLoad: agent.currentLoad
      });
    }
  }

  async handleResourceRequest(message) {
    const { resourceId, requestingAgent, duration } = message;
    
    try {
      await this.allocateResources(
        `single_${Date.now()}`,
        [resourceId],
        [requestingAgent]
      );
      
      // Send allocation confirmation
      const response = {
        type: 'resource_allocation',
        resourceId,
        allocatedTo: requestingAgent,
        duration,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('resource-allocations', response);
      
    } catch (error) {
      this.logger.error('Error handling resource request:', error);
      
      // Send allocation denial
      const denial = {
        type: 'resource_denial',
        resourceId,
        requestingAgent,
        reason: error.message,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('resource-allocations', denial);
    }
  }

  async handleConflictNotification(message) {
    // Handle external conflict notifications
    this.logger.info('Received conflict notification', {
      conflictType: message.conflictType,
      involvedAgents: message.involvedAgents
    });
    
    // Add to conflict history for analysis
    this.conflictHistory.push({
      id: message.conflictId || `external_${Date.now()}`,
      type: message.conflictType,
      involvedAgents: message.involvedAgents,
      timestamp: Date.now(),
      source: 'external',
      resolution: null
    });
  }

  async handleCoordinationCompletion(message) {
    const { coordinationId, success, results } = message;
    
    if (this.activeCoordinations.has(coordinationId)) {
      const coordination = this.activeCoordinations.get(coordinationId);
      coordination.status = success ? 'completed' : 'failed';
      coordination.results = results;
      coordination.endTime = Date.now();
      
      // Update statistics
      if (success) {
        this.coordinationStats.successfulCoordinations++;
      } else {
        this.coordinationStats.failedCoordinations++;
      }
      
      const duration = coordination.endTime - coordination.startTime;
      this.coordinationStats.averageCoordinationTime = 
        (this.coordinationStats.averageCoordinationTime * (this.coordinationStats.totalCoordinations - 1) + duration) / 
        this.coordinationStats.totalCoordinations;
      
      // Update agent coordination history
      for (const agentId of coordination.agents) {
        const agent = this.agentRegistry.get(agentId);
        if (agent) {
          agent.coordinationHistory.push({
            coordinationId,
            success,
            duration,
            timestamp: Date.now()
          });
        }
      }
      
      // Release resources
      for (const resourceId of coordination.resources) {
        await this.releaseResource(resourceId);
      }
      
      this.activeCoordinations.delete(coordinationId);
      
      // Update metrics
      this.metrics.coordinationDuration.observe(
        { strategy: coordination.strategy },
        duration / 1000
      );
      this.metrics.coordinationRequests.inc({
        strategy: coordination.strategy,
        status: success ? 'completed' : 'failed'
      });
      this.metrics.activeCoordinations.set(this.activeCoordinations.size);
      
      this.logger.info('Coordination completed', {
        coordinationId,
        success,
        duration,
        agents: coordination.agents
      });
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Complete active coordinations
        for (const [coordinationId, coordination] of this.activeCoordinations.entries()) {
          await this.handleCoordinationTimeout(coordinationId, coordination);
        }
        
        // Release all resources
        for (const resourceId of this.resourceAllocations.keys()) {
          await this.releaseResource(resourceId);
        }
        
        // Stop SQS polling
        if (this.sqsService) {
          await this.sqsService.stopPolling();
        }
        
        // Close HTTP server
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
        }
        
        this.logger.info('Coordination Agent shutdown completed');
        process.exit(0);
        
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection:', { reason, promise });
      shutdown('unhandledRejection');
    });
  }

  async start() {
    try {
      const port = process.env.PORT || 3011;
      
      this.server = this.app.listen(port, () => {
        this.logger.info(`Coordination Agent started on port ${port}`);
      });
      
      // Initialize SQS service
      await this.sqsService.initialize();
      
      // Start message processing
      await this.startMessageProcessing();
      
      this.logger.info('Coordination Agent fully initialized', {
        port,
        inputQueues: this.inputQueues,
        outputQueues: this.outputQueues,
        registeredAgents: this.agentRegistry.size
      });
      
    } catch (error) {
      this.logger.error('Failed to start Coordination Agent:', error);
      process.exit(1);
    }
  }
}

// Start the agent if this file is run directly
if (require.main === module) {
  const agent = new CoordinationAgent();
  agent.start();
}

module.exports = CoordinationAgent;