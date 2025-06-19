/**
 * Mediator Agent - Mediação e Facilitação
 * Fase 5: Mediação e Orquestração
 * 
 * Responsabilidades:
 * - Mediar conflitos entre agentes
 * - Facilitar comunicação inter-agentes
 * - Resolver disputas de recursos
 * - Negociar acordos entre agentes
 * - Manter harmonia no sistema
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

class MediatorAgent {
  constructor() {
    this.agentId = 'mediator-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService();
    this.metrics = this.setupMetrics();
    this.isShuttingDown = false;
    
    // Mediation Configuration
    this.mediationConfig = {
      maxMediationTime: 300000, // 5 minutes
      maxRetries: 3,
      consensusThreshold: 0.7,
      negotiationRounds: 5,
      cooldownPeriod: 60000, // 1 minute
      priorityWeights: {
        'critical': 1.0,
        'high': 0.8,
        'medium': 0.6,
        'low': 0.4
      }
    };
    
    // Active Mediations
    this.activeMediations = new Map();
    this.mediationHistory = [];
    this.agentRelationships = new Map();
    this.conflictPatterns = new Map();
    
    // Mediation Strategies
    this.mediationStrategies = {
      'collaborative': this.collaborativeMediation.bind(this),
      'competitive': this.competitiveMediation.bind(this),
      'accommodating': this.accommodatingMediation.bind(this),
      'avoiding': this.avoidingMediation.bind(this),
      'compromising': this.compromisingMediation.bind(this)
    };
    
    // Communication Patterns
    this.communicationPatterns = {
      'direct': this.directCommunication.bind(this),
      'broadcast': this.broadcastCommunication.bind(this),
      'relay': this.relayCommunication.bind(this),
      'multicast': this.multicastCommunication.bind(this)
    };
    
    // Statistics
    this.mediationStats = {
      totalMediations: 0,
      successfulMediations: 0,
      failedMediations: 0,
      averageMediationTime: 0,
      conflictsResolved: 0,
      agreementsReached: 0,
      communicationsFacilitated: 0,
      lastUpdate: new Date().toISOString()
    };
    
    // Filas SQS
    this.inputQueues = [
      'mediation-requests',
      'conflict-reports',
      'communication-requests',
      'negotiation-messages',
      'agreement-proposals'
    ];
    this.outputQueues = [
      'mediation-decisions',
      'conflict-resolutions',
      'facilitated-communications',
      'negotiation-results',
      'agreement-notifications'
    ];
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
    this.initializeAgentRelationships();
    this.startMediationMonitoring();
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
      mediationRequests: new promClient.Counter({
        name: 'mediation_requests_total',
        help: 'Total number of mediation requests',
        labelNames: ['strategy', 'conflict_type', 'status'],
        registers: [register]
      }),
      
      mediationDuration: new promClient.Histogram({
        name: 'mediation_duration_seconds',
        help: 'Duration of mediation processes',
        buckets: [1, 5, 10, 30, 60, 300, 600],
        labelNames: ['strategy', 'outcome'],
        registers: [register]
      }),
      
      activeMediations: new promClient.Gauge({
        name: 'active_mediations',
        help: 'Number of active mediations',
        registers: [register]
      }),
      
      conflictResolutionRate: new promClient.Gauge({
        name: 'conflict_resolution_rate',
        help: 'Rate of successful conflict resolutions',
        registers: [register]
      }),
      
      communicationsFacilitated: new promClient.Counter({
        name: 'communications_facilitated_total',
        help: 'Total number of communications facilitated',
        labelNames: ['pattern', 'agent_count'],
        registers: [register]
      }),
      
      agentRelationshipScore: new promClient.Gauge({
        name: 'agent_relationship_score',
        help: 'Relationship score between agent pairs',
        labelNames: ['agent_a', 'agent_b'],
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
        mediation: {
          activeMediations: this.activeMediations.size,
          totalMediations: this.mediationStats.totalMediations,
          successRate: this.mediationStats.successfulMediations / 
                      Math.max(this.mediationStats.totalMediations, 1),
          averageDuration: this.mediationStats.averageMediationTime
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

    // Mediation status
    this.app.get('/api/v1/mediation/status', (req, res) => {
      res.json({
        status: 'active',
        statistics: this.mediationStats,
        configuration: this.mediationConfig,
        activeMediations: Array.from(this.activeMediations.keys()),
        agentRelationships: this.getRelationshipSummary(),
        timestamp: new Date().toISOString()
      });
    });

    // Agent relationships
    this.app.get('/api/v1/relationships', (req, res) => {
      const relationships = {};
      for (const [key, relationship] of this.agentRelationships.entries()) {
        relationships[key] = {
          score: relationship.score,
          interactions: relationship.interactions,
          conflicts: relationship.conflicts,
          collaborations: relationship.collaborations,
          lastInteraction: relationship.lastInteraction
        };
      }
      
      res.json({
        relationships,
        totalRelationships: this.agentRelationships.size,
        timestamp: new Date().toISOString()
      });
    });

    // Conflict patterns
    this.app.get('/api/v1/conflicts/patterns', (req, res) => {
      const patterns = {};
      for (const [pattern, data] of this.conflictPatterns.entries()) {
        patterns[pattern] = {
          frequency: data.frequency,
          averageResolutionTime: data.averageResolutionTime,
          successRate: data.successRate,
          commonAgents: data.commonAgents
        };
      }
      
      res.json({
        patterns,
        totalPatterns: this.conflictPatterns.size,
        timestamp: new Date().toISOString()
      });
    });

    // Manual mediation trigger
    this.app.post('/api/v1/mediation/trigger', async (req, res) => {
      try {
        const { agents, conflictType, priority, strategy } = req.body;
        
        if (!agents || !Array.isArray(agents) || agents.length < 2) {
          return res.status(400).json({
            error: 'At least 2 agents required for mediation'
          });
        }
        
        const mediationId = await this.initiateMediation({
          agents,
          conflictType: conflictType || 'general',
          priority: priority || 'medium',
          strategy: strategy || 'collaborative',
          requestedBy: 'manual',
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          mediationId,
          message: 'Mediation initiated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Manual mediation trigger error:', error);
        res.status(500).json({
          error: 'Failed to initiate mediation',
          message: error.message
        });
      }
    });

    // Communication facilitation
    this.app.post('/api/v1/communication/facilitate', async (req, res) => {
      try {
        const { sender, recipients, message, pattern } = req.body;
        
        if (!sender || !recipients || !message) {
          return res.status(400).json({
            error: 'Sender, recipients, and message are required'
          });
        }
        
        const communicationId = await this.facilitateCommunication({
          sender,
          recipients: Array.isArray(recipients) ? recipients : [recipients],
          message,
          pattern: pattern || 'direct',
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          communicationId,
          message: 'Communication facilitated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Communication facilitation error:', error);
        res.status(500).json({
          error: 'Failed to facilitate communication',
          message: error.message
        });
      }
    });
  }

  initializeAgentRelationships() {
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
      'marl-agent',
      'coordination-agent'
    ];
    
    // Initialize all possible agent pairs
    for (let i = 0; i < knownAgents.length; i++) {
      for (let j = i + 1; j < knownAgents.length; j++) {
        const agentA = knownAgents[i];
        const agentB = knownAgents[j];
        const relationshipKey = this.getRelationshipKey(agentA, agentB);
        
        this.agentRelationships.set(relationshipKey, {
          agentA,
          agentB,
          score: 0.5, // Neutral starting score
          interactions: 0,
          conflicts: 0,
          collaborations: 0,
          lastInteraction: null,
          history: []
        });
      }
    }
    
    this.logger.info('Initialized agent relationships', { 
      relationshipCount: this.agentRelationships.size,
      agentCount: knownAgents.length 
    });
  }

  getRelationshipKey(agentA, agentB) {
    // Ensure consistent ordering for relationship keys
    return agentA < agentB ? `${agentA}:${agentB}` : `${agentB}:${agentA}`;
  }

  getRelationshipSummary() {
    const summary = {
      excellent: 0, // score > 0.8
      good: 0,      // score > 0.6
      neutral: 0,   // score > 0.4
      poor: 0,      // score > 0.2
      critical: 0   // score <= 0.2
    };
    
    for (const relationship of this.agentRelationships.values()) {
      if (relationship.score > 0.8) summary.excellent++;
      else if (relationship.score > 0.6) summary.good++;
      else if (relationship.score > 0.4) summary.neutral++;
      else if (relationship.score > 0.2) summary.poor++;
      else summary.critical++;
    }
    
    return summary;
  }

  startMediationMonitoring() {
    // Monitor mediation timeouts
    setInterval(() => {
      this.checkMediationTimeouts();
    }, 10000);
    
    // Update relationship scores
    setInterval(() => {
      this.updateRelationshipScores();
    }, 60000);
    
    // Analyze conflict patterns
    setInterval(() => {
      this.analyzeConflictPatterns();
    }, 300000); // Every 5 minutes
    
    this.logger.info('Started mediation monitoring');
  }

  async checkMediationTimeouts() {
    const now = Date.now();
    
    for (const [mediationId, mediation] of this.activeMediations.entries()) {
      if (now - mediation.startTime > this.mediationConfig.maxMediationTime) {
        this.logger.warn('Mediation timeout', {
          mediationId,
          duration: now - mediation.startTime,
          agents: mediation.agents
        });
        
        await this.handleMediationTimeout(mediationId, mediation);
      }
    }
  }

  updateRelationshipScores() {
    for (const [key, relationship] of this.agentRelationships.entries()) {
      // Decay scores over time if no recent interactions
      const timeSinceLastInteraction = relationship.lastInteraction 
        ? Date.now() - relationship.lastInteraction 
        : Infinity;
      
      if (timeSinceLastInteraction > 86400000) { // 24 hours
        relationship.score *= 0.99; // Slight decay
      }
      
      // Update metrics
      this.metrics.agentRelationshipScore.set(
        { agent_a: relationship.agentA, agent_b: relationship.agentB },
        relationship.score
      );
    }
  }

  analyzeConflictPatterns() {
    // Analyze recent conflicts for patterns
    const recentConflicts = this.mediationHistory
      .filter(mediation => Date.now() - mediation.startTime < 86400000) // Last 24 hours
      .filter(mediation => mediation.conflictType);
    
    const patterns = {};
    
    for (const conflict of recentConflicts) {
      const pattern = conflict.conflictType;
      
      if (!patterns[pattern]) {
        patterns[pattern] = {
          frequency: 0,
          totalResolutionTime: 0,
          successfulResolutions: 0,
          agents: new Set()
        };
      }
      
      patterns[pattern].frequency++;
      patterns[pattern].totalResolutionTime += conflict.duration || 0;
      if (conflict.outcome === 'resolved') {
        patterns[pattern].successfulResolutions++;
      }
      
      conflict.agents.forEach(agent => patterns[pattern].agents.add(agent));
    }
    
    // Update conflict patterns
    for (const [pattern, data] of Object.entries(patterns)) {
      this.conflictPatterns.set(pattern, {
        frequency: data.frequency,
        averageResolutionTime: data.totalResolutionTime / data.frequency,
        successRate: data.successfulResolutions / data.frequency,
        commonAgents: Array.from(data.agents)
      });
    }
  }

  async initiateMediation(request) {
    const mediationId = `mediation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Initiating mediation', {
        mediationId,
        agents: request.agents,
        conflictType: request.conflictType,
        strategy: request.strategy
      });
      
      // Create mediation record
      const mediation = {
        id: mediationId,
        agents: request.agents,
        conflictType: request.conflictType,
        priority: request.priority,
        strategy: request.strategy,
        status: 'active',
        startTime,
        requestedBy: request.requestedBy,
        rounds: [],
        proposals: [],
        agreements: [],
        currentRound: 0
      };
      
      this.activeMediations.set(mediationId, mediation);
      
      // Update relationship interactions
      this.updateAgentInteractions(request.agents, 'mediation_started');
      
      // Execute mediation strategy
      const strategy = this.mediationStrategies[request.strategy];
      if (strategy) {
        await strategy(mediation);
      } else {
        throw new Error(`Unknown mediation strategy: ${request.strategy}`);
      }
      
      // Update metrics
      this.metrics.mediationRequests.inc({
        strategy: request.strategy,
        conflict_type: request.conflictType,
        status: 'initiated'
      });
      this.metrics.activeMediations.set(this.activeMediations.size);
      
      this.mediationStats.totalMediations++;
      
      return mediationId;
      
    } catch (error) {
      this.logger.error('Failed to initiate mediation:', error);
      
      this.metrics.mediationRequests.inc({
        strategy: request.strategy || 'unknown',
        conflict_type: request.conflictType || 'unknown',
        status: 'failed'
      });
      
      throw error;
    }
  }

  async collaborativeMediation(mediation) {
    this.logger.info('Executing collaborative mediation', {
      mediationId: mediation.id,
      agents: mediation.agents
    });
    
    // Send collaborative mediation message to all agents
    const mediationMessage = {
      type: 'collaborative_mediation',
      mediationId: mediation.id,
      participants: mediation.agents,
      conflictType: mediation.conflictType,
      instructions: {
        approach: 'collaborative',
        goal: 'find_win_win_solution',
        timeLimit: this.mediationConfig.maxMediationTime,
        rounds: this.mediationConfig.negotiationRounds
      },
      timestamp: new Date().toISOString()
    };
    
    await this.sendMediationMessage(mediation.agents, mediationMessage);
  }

  async competitiveMediation(mediation) {
    this.logger.info('Executing competitive mediation', {
      mediationId: mediation.id,
      agents: mediation.agents
    });
    
    // Send competitive mediation message with structured rounds
    const mediationMessage = {
      type: 'competitive_mediation',
      mediationId: mediation.id,
      participants: mediation.agents,
      conflictType: mediation.conflictType,
      instructions: {
        approach: 'competitive',
        goal: 'maximize_individual_benefit',
        timeLimit: this.mediationConfig.maxMediationTime,
        rounds: this.mediationConfig.negotiationRounds,
        rules: {
          bidding: true,
          counterOffers: true,
          finalOffer: true
        }
      },
      timestamp: new Date().toISOString()
    };
    
    await this.sendMediationMessage(mediation.agents, mediationMessage);
  }

  async accommodatingMediation(mediation) {
    this.logger.info('Executing accommodating mediation', {
      mediationId: mediation.id,
      agents: mediation.agents
    });
    
    // Identify the agent with higher priority or better relationship scores
    const priorityAgent = this.selectPriorityAgent(mediation.agents);
    
    const mediationMessage = {
      type: 'accommodating_mediation',
      mediationId: mediation.id,
      participants: mediation.agents,
      priorityAgent,
      conflictType: mediation.conflictType,
      instructions: {
        approach: 'accommodating',
        goal: 'satisfy_priority_agent',
        timeLimit: this.mediationConfig.maxMediationTime,
        priorityWeights: this.mediationConfig.priorityWeights
      },
      timestamp: new Date().toISOString()
    };
    
    await this.sendMediationMessage(mediation.agents, mediationMessage);
  }

  async avoidingMediation(mediation) {
    this.logger.info('Executing avoiding mediation', {
      mediationId: mediation.id,
      agents: mediation.agents
    });
    
    // Suggest temporary separation or delayed resolution
    const mediationMessage = {
      type: 'avoiding_mediation',
      mediationId: mediation.id,
      participants: mediation.agents,
      conflictType: mediation.conflictType,
      instructions: {
        approach: 'avoiding',
        goal: 'minimize_immediate_conflict',
        timeLimit: this.mediationConfig.maxMediationTime,
        cooldownPeriod: this.mediationConfig.cooldownPeriod,
        suggestions: [
          'temporary_separation',
          'delayed_resolution',
          'alternative_resources'
        ]
      },
      timestamp: new Date().toISOString()
    };
    
    await this.sendMediationMessage(mediation.agents, mediationMessage);
  }

  async compromisingMediation(mediation) {
    this.logger.info('Executing compromising mediation', {
      mediationId: mediation.id,
      agents: mediation.agents
    });
    
    const mediationMessage = {
      type: 'compromising_mediation',
      mediationId: mediation.id,
      participants: mediation.agents,
      conflictType: mediation.conflictType,
      instructions: {
        approach: 'compromising',
        goal: 'find_middle_ground',
        timeLimit: this.mediationConfig.maxMediationTime,
        rounds: this.mediationConfig.negotiationRounds,
        compromiseRatio: 0.5, // 50-50 split as starting point
        adjustmentFactor: 0.1
      },
      timestamp: new Date().toISOString()
    };
    
    await this.sendMediationMessage(mediation.agents, mediationMessage);
  }

  selectPriorityAgent(agents) {
    // Select agent with highest relationship scores or system priority
    let bestAgent = agents[0];
    let bestScore = 0;
    
    for (const agent of agents) {
      let totalScore = 0;
      let relationshipCount = 0;
      
      // Calculate average relationship score with other agents
      for (const otherAgent of agents) {
        if (agent !== otherAgent) {
          const relationshipKey = this.getRelationshipKey(agent, otherAgent);
          const relationship = this.agentRelationships.get(relationshipKey);
          if (relationship) {
            totalScore += relationship.score;
            relationshipCount++;
          }
        }
      }
      
      const averageScore = relationshipCount > 0 ? totalScore / relationshipCount : 0;
      
      if (averageScore > bestScore) {
        bestScore = averageScore;
        bestAgent = agent;
      }
    }
    
    return bestAgent;
  }

  async sendMediationMessage(agents, message) {
    try {
      for (const agentId of agents) {
        const fullMessage = {
          ...message,
          targetAgent: agentId,
          source: this.agentId
        };
        
        await this.sqsService.sendMessage('mediation-decisions', fullMessage);
      }
      
      this.logger.debug('Sent mediation messages', {
        targetAgents: agents,
        type: message.type,
        mediationId: message.mediationId
      });
      
    } catch (error) {
      this.logger.error('Error sending mediation message:', error);
      throw error;
    }
  }

  async facilitateCommunication(request) {
    const communicationId = `comm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.logger.info('Facilitating communication', {
        communicationId,
        sender: request.sender,
        recipients: request.recipients,
        pattern: request.pattern
      });
      
      // Execute communication pattern
      const pattern = this.communicationPatterns[request.pattern];
      if (pattern) {
        await pattern(request, communicationId);
      } else {
        throw new Error(`Unknown communication pattern: ${request.pattern}`);
      }
      
      // Update relationship interactions
      const allAgents = [request.sender, ...request.recipients];
      this.updateAgentInteractions(allAgents, 'communication_facilitated');
      
      // Update metrics
      this.metrics.communicationsFacilitated.inc({
        pattern: request.pattern,
        agent_count: allAgents.length.toString()
      });
      
      this.mediationStats.communicationsFacilitated++;
      
      return communicationId;
      
    } catch (error) {
      this.logger.error('Failed to facilitate communication:', error);
      throw error;
    }
  }

  async directCommunication(request, communicationId) {
    // Direct one-to-one or one-to-many communication
    for (const recipient of request.recipients) {
      const message = {
        type: 'facilitated_direct_communication',
        communicationId,
        sender: request.sender,
        recipient,
        content: request.message,
        timestamp: request.timestamp,
        facilitatedBy: this.agentId
      };
      
      await this.sqsService.sendMessage('facilitated-communications', message);
    }
  }

  async broadcastCommunication(request, communicationId) {
    // Broadcast to all recipients simultaneously
    const message = {
      type: 'facilitated_broadcast_communication',
      communicationId,
      sender: request.sender,
      recipients: request.recipients,
      content: request.message,
      timestamp: request.timestamp,
      facilitatedBy: this.agentId
    };
    
    await this.sqsService.sendMessage('facilitated-communications', message);
  }

  async relayCommunication(request, communicationId) {
    // Relay communication through intermediary agents
    for (let i = 0; i < request.recipients.length; i++) {
      const recipient = request.recipients[i];
      const nextRecipient = request.recipients[i + 1] || null;
      
      const message = {
        type: 'facilitated_relay_communication',
        communicationId,
        sender: i === 0 ? request.sender : request.recipients[i - 1],
        recipient,
        nextRecipient,
        content: request.message,
        relayStep: i + 1,
        totalSteps: request.recipients.length,
        timestamp: request.timestamp,
        facilitatedBy: this.agentId
      };
      
      await this.sqsService.sendMessage('facilitated-communications', message);
    }
  }

  async multicastCommunication(request, communicationId) {
    // Multicast to specific groups of recipients
    const groups = this.groupRecipients(request.recipients);
    
    for (const [groupName, groupMembers] of Object.entries(groups)) {
      const message = {
        type: 'facilitated_multicast_communication',
        communicationId,
        sender: request.sender,
        group: groupName,
        recipients: groupMembers,
        content: request.message,
        timestamp: request.timestamp,
        facilitatedBy: this.agentId
      };
      
      await this.sqsService.sendMessage('facilitated-communications', message);
    }
  }

  groupRecipients(recipients) {
    // Group recipients by agent type or function
    const groups = {
      core: [],
      auxiliary: [],
      marl: [],
      mediation: []
    };
    
    for (const recipient of recipients) {
      if (recipient.includes('interface') || recipient.includes('event') || 
          recipient.includes('planning') || recipient.includes('execution') ||
          recipient.includes('state-management') || recipient.includes('acl')) {
        groups.core.push(recipient);
      } else if (recipient.includes('monitoring') || recipient.includes('policy') ||
                 recipient.includes('security')) {
        groups.auxiliary.push(recipient);
      } else if (recipient.includes('marl') || recipient.includes('coordination')) {
        groups.marl.push(recipient);
      } else {
        groups.mediation.push(recipient);
      }
    }
    
    // Remove empty groups
    return Object.fromEntries(
      Object.entries(groups).filter(([_, members]) => members.length > 0)
    );
  }

  updateAgentInteractions(agents, interactionType) {
    const timestamp = Date.now();
    
    // Update all possible pairs
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agentA = agents[i];
        const agentB = agents[j];
        const relationshipKey = this.getRelationshipKey(agentA, agentB);
        
        const relationship = this.agentRelationships.get(relationshipKey);
        if (relationship) {
          relationship.interactions++;
          relationship.lastInteraction = timestamp;
          
          // Adjust score based on interaction type
          switch (interactionType) {
            case 'mediation_started':
              relationship.conflicts++;
              relationship.score = Math.max(0, relationship.score - 0.1);
              break;
            case 'mediation_resolved':
              relationship.score = Math.min(1, relationship.score + 0.2);
              break;
            case 'communication_facilitated':
              relationship.collaborations++;
              relationship.score = Math.min(1, relationship.score + 0.05);
              break;
            case 'agreement_reached':
              relationship.score = Math.min(1, relationship.score + 0.3);
              break;
          }
          
          relationship.history.push({
            type: interactionType,
            timestamp,
            scoreChange: relationship.score
          });
          
          // Limit history size
          if (relationship.history.length > 100) {
            relationship.history.shift();
          }
        }
      }
    }
  }

  async handleMediationTimeout(mediationId, mediation) {
    this.logger.warn('Handling mediation timeout', {
      mediationId,
      duration: Date.now() - mediation.startTime
    });
    
    mediation.status = 'timeout';
    mediation.outcome = 'unresolved';
    mediation.endTime = Date.now();
    
    // Update agent interactions
    this.updateAgentInteractions(mediation.agents, 'mediation_timeout');
    
    // Send timeout notification
    const timeoutMessage = {
      type: 'mediation_timeout',
      mediationId,
      agents: mediation.agents,
      conflictType: mediation.conflictType,
      duration: mediation.endTime - mediation.startTime,
      timestamp: new Date().toISOString()
    };
    
    await this.sqsService.sendMessage('mediation-decisions', timeoutMessage);
    
    // Move to history
    this.mediationHistory.push(mediation);
    this.activeMediations.delete(mediationId);
    
    this.mediationStats.failedMediations++;
    
    this.metrics.mediationDuration.observe(
      { strategy: mediation.strategy, outcome: 'timeout' },
      (mediation.endTime - mediation.startTime) / 1000
    );
    this.metrics.activeMediations.set(this.activeMediations.size);
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
        case 'mediation_request':
          await this.handleMediationRequest(message);
          break;
          
        case 'conflict_report':
          await this.handleConflictReport(message);
          break;
          
        case 'communication_request':
          await this.handleCommunicationRequest(message);
          break;
          
        case 'negotiation_message':
          await this.handleNegotiationMessage(message);
          break;
          
        case 'agreement_proposal':
          await this.handleAgreementProposal(message);
          break;
          
        case 'mediation_response':
          await this.handleMediationResponse(message);
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

  async handleMediationRequest(message) {
    try {
      const mediationId = await this.initiateMediation({
        agents: message.agents,
        conflictType: message.conflictType || 'general',
        priority: message.priority || 'medium',
        strategy: message.strategy || 'collaborative',
        requestedBy: message.source || 'unknown',
        timestamp: message.timestamp
      });
      
      // Send response
      const response = {
        type: 'mediation_response',
        mediationId,
        status: 'initiated',
        requestId: message.requestId,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('mediation-decisions', response);
      
    } catch (error) {
      this.logger.error('Error handling mediation request:', error);
      
      // Send error response
      const errorResponse = {
        type: 'mediation_error',
        error: error.message,
        requestId: message.requestId,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('mediation-decisions', errorResponse);
    }
  }

  async handleConflictReport(message) {
    const { conflictType, involvedAgents, severity, description } = message;
    
    this.logger.info('Received conflict report', {
      conflictType,
      involvedAgents,
      severity
    });
    
    // Automatically initiate mediation for high-severity conflicts
    if (severity === 'high' || severity === 'critical') {
      await this.initiateMediation({
        agents: involvedAgents,
        conflictType,
        priority: severity === 'critical' ? 'high' : 'medium',
        strategy: 'collaborative',
        requestedBy: 'automatic_conflict_detection',
        timestamp: message.timestamp
      });
    }
    
    // Update conflict patterns
    if (!this.conflictPatterns.has(conflictType)) {
      this.conflictPatterns.set(conflictType, {
        frequency: 0,
        averageResolutionTime: 0,
        successRate: 0,
        commonAgents: []
      });
    }
    
    const pattern = this.conflictPatterns.get(conflictType);
    pattern.frequency++;
    pattern.commonAgents = [...new Set([...pattern.commonAgents, ...involvedAgents])];
  }

  async handleCommunicationRequest(message) {
    try {
      const communicationId = await this.facilitateCommunication({
        sender: message.sender,
        recipients: message.recipients,
        message: message.content,
        pattern: message.pattern || 'direct',
        timestamp: message.timestamp
      });
      
      // Send confirmation
      const confirmation = {
        type: 'communication_facilitated',
        communicationId,
        requestId: message.requestId,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('facilitated-communications', confirmation);
      
    } catch (error) {
      this.logger.error('Error handling communication request:', error);
    }
  }

  async handleNegotiationMessage(message) {
    const { mediationId, sender, proposal, round } = message;
    
    if (this.activeMediations.has(mediationId)) {
      const mediation = this.activeMediations.get(mediationId);
      
      // Add proposal to mediation record
      mediation.proposals.push({
        sender,
        proposal,
        round,
        timestamp: Date.now()
      });
      
      // Check if all agents have submitted proposals for this round
      const roundProposals = mediation.proposals.filter(p => p.round === round);
      
      if (roundProposals.length === mediation.agents.length) {
        await this.processNegotiationRound(mediation, round);
      }
      
      this.logger.debug('Received negotiation message', {
        mediationId,
        sender,
        round,
        totalProposals: mediation.proposals.length
      });
    }
  }

  async handleAgreementProposal(message) {
    const { mediationId, proposer, agreement, requiredConsensus } = message;
    
    if (this.activeMediations.has(mediationId)) {
      const mediation = this.activeMediations.get(mediationId);
      
      mediation.agreements.push({
        proposer,
        agreement,
        requiredConsensus: requiredConsensus || this.mediationConfig.consensusThreshold,
        votes: [],
        timestamp: Date.now()
      });
      
      // Send agreement for voting
      await this.initiateAgreementVoting(mediation, agreement);
      
      this.logger.info('Received agreement proposal', {
        mediationId,
        proposer,
        requiredConsensus
      });
    }
  }

  async handleMediationResponse(message) {
    const { mediationId, response, agentId } = message;
    
    if (this.activeMediations.has(mediationId)) {
      const mediation = this.activeMediations.get(mediationId);
      
      // Process agent response
      if (response.type === 'agreement_vote') {
        await this.processAgreementVote(mediation, agentId, response.vote);
      } else if (response.type === 'mediation_complete') {
        await this.processMediationCompletion(mediation, agentId, response);
      }
      
      this.logger.debug('Processed mediation response', {
        mediationId,
        agentId,
        responseType: response.type
      });
    }
  }

  async processNegotiationRound(mediation, round) {
    const roundProposals = mediation.proposals.filter(p => p.round === round);
    
    // Analyze proposals and determine next steps
    const analysis = this.analyzeProposals(roundProposals);
    
    if (analysis.consensus) {
      // Consensus reached
      await this.finalizeMediationAgreement(mediation, analysis.consensusProposal);
    } else if (round >= this.mediationConfig.negotiationRounds) {
      // Max rounds reached, try compromise
      const compromise = this.generateCompromise(roundProposals);
      await this.proposeCompromise(mediation, compromise);
    } else {
      // Continue to next round
      await this.initiateNextNegotiationRound(mediation, round + 1, analysis.feedback);
    }
  }

  analyzeProposals(proposals) {
    // Simple consensus analysis
    const proposalMap = new Map();
    
    for (const proposal of proposals) {
      const key = JSON.stringify(proposal.proposal);
      if (!proposalMap.has(key)) {
        proposalMap.set(key, { proposal: proposal.proposal, count: 0, supporters: [] });
      }
      proposalMap.get(key).count++;
      proposalMap.get(key).supporters.push(proposal.sender);
    }
    
    // Check for consensus
    for (const [key, data] of proposalMap.entries()) {
      if (data.count / proposals.length >= this.mediationConfig.consensusThreshold) {
        return {
          consensus: true,
          consensusProposal: data.proposal,
          supporters: data.supporters
        };
      }
    }
    
    return {
      consensus: false,
      feedback: this.generateNegotiationFeedback(proposalMap)
    };
  }

  generateNegotiationFeedback(proposalMap) {
    const feedback = [];
    
    for (const [key, data] of proposalMap.entries()) {
      feedback.push({
        proposal: data.proposal,
        support: data.count,
        supporters: data.supporters,
        suggestions: this.generateImprovementSuggestions(data.proposal)
      });
    }
    
    return feedback;
  }

  generateImprovementSuggestions(proposal) {
    // Generate suggestions based on proposal content
    const suggestions = [];
    
    if (proposal.resources) {
      suggestions.push('Consider resource sharing arrangements');
    }
    
    if (proposal.timeline) {
      suggestions.push('Evaluate timeline flexibility');
    }
    
    if (proposal.priority) {
      suggestions.push('Review priority assignments');
    }
    
    return suggestions;
  }

  generateCompromise(proposals) {
    // Generate a compromise proposal based on all submissions
    const compromise = {
      type: 'compromise',
      resources: {},
      timeline: {},
      priority: 'medium',
      conditions: []
    };
    
    // Aggregate and average proposal elements
    for (const proposal of proposals) {
      if (proposal.proposal.resources) {
        Object.assign(compromise.resources, proposal.proposal.resources);
      }
      if (proposal.proposal.timeline) {
        Object.assign(compromise.timeline, proposal.proposal.timeline);
      }
    }
    
    return compromise;
  }

  async proposeCompromise(mediation, compromise) {
    const compromiseMessage = {
      type: 'compromise_proposal',
      mediationId: mediation.id,
      compromise,
      participants: mediation.agents,
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('mediation-decisions', compromiseMessage);
    
    this.logger.info('Proposed compromise', {
      mediationId: mediation.id,
      compromise
    });
  }

  async initiateNextNegotiationRound(mediation, nextRound, feedback) {
    mediation.currentRound = nextRound;
    
    const roundMessage = {
      type: 'negotiation_round',
      mediationId: mediation.id,
      round: nextRound,
      feedback,
      participants: mediation.agents,
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('mediation-decisions', roundMessage);
    
    this.logger.info('Initiated negotiation round', {
      mediationId: mediation.id,
      round: nextRound
    });
  }

  async initiateAgreementVoting(mediation, agreement) {
    const votingMessage = {
      type: 'agreement_voting',
      mediationId: mediation.id,
      agreement,
      participants: mediation.agents,
      votingDeadline: Date.now() + 60000, // 1 minute
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('mediation-decisions', votingMessage);
  }

  async processAgreementVote(mediation, agentId, vote) {
    const latestAgreement = mediation.agreements[mediation.agreements.length - 1];
    
    if (latestAgreement) {
      latestAgreement.votes.push({ agentId, vote, timestamp: Date.now() });
      
      // Check if all votes are in
      if (latestAgreement.votes.length === mediation.agents.length) {
        const positiveVotes = latestAgreement.votes.filter(v => v.vote === 'accept').length;
        const consensusReached = positiveVotes / mediation.agents.length >= latestAgreement.requiredConsensus;
        
        if (consensusReached) {
          await this.finalizeMediationAgreement(mediation, latestAgreement.agreement);
        } else {
          await this.handleRejectedAgreement(mediation, latestAgreement);
        }
      }
    }
  }

  async finalizeMediationAgreement(mediation, agreement) {
    mediation.status = 'resolved';
    mediation.outcome = 'agreement_reached';
    mediation.finalAgreement = agreement;
    mediation.endTime = Date.now();
    
    // Update agent interactions
    this.updateAgentInteractions(mediation.agents, 'agreement_reached');
    
    // Send agreement notification
    const agreementMessage = {
      type: 'mediation_agreement',
      mediationId: mediation.id,
      agreement,
      participants: mediation.agents,
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('agreement-notifications', agreementMessage);
    
    // Move to history
    this.mediationHistory.push(mediation);
    this.activeMediations.delete(mediation.id);
    
    // Update statistics
    this.mediationStats.successfulMediations++;
    this.mediationStats.agreementsReached++;
    
    const duration = mediation.endTime - mediation.startTime;
    this.mediationStats.averageMediationTime = 
      (this.mediationStats.averageMediationTime * (this.mediationStats.totalMediations - 1) + duration) / 
      this.mediationStats.totalMediations;
    
    // Update metrics
    this.metrics.mediationDuration.observe(
      { strategy: mediation.strategy, outcome: 'resolved' },
      duration / 1000
    );
    this.metrics.activeMediations.set(this.activeMediations.size);
    this.metrics.conflictResolutionRate.set(
      this.mediationStats.successfulMediations / this.mediationStats.totalMediations
    );
    
    this.logger.info('Mediation agreement finalized', {
      mediationId: mediation.id,
      duration,
      participants: mediation.agents
    });
  }

  async handleRejectedAgreement(mediation, rejectedAgreement) {
    this.logger.info('Agreement rejected, continuing mediation', {
      mediationId: mediation.id,
      rejectedAgreement: rejectedAgreement.agreement
    });
    
    // Analyze rejection reasons and continue mediation
    const rejectionAnalysis = this.analyzeRejectionReasons(rejectedAgreement.votes);
    
    // Continue with modified strategy or propose new round
    await this.initiateNextNegotiationRound(
      mediation, 
      mediation.currentRound + 1, 
      rejectionAnalysis
    );
  }

  analyzeRejectionReasons(votes) {
    const rejections = votes.filter(v => v.vote === 'reject');
    
    return {
      rejectionCount: rejections.length,
      rejectedBy: rejections.map(v => v.agentId),
      suggestions: [
        'Review proposal terms',
        'Consider alternative approaches',
        'Seek additional compromises'
      ]
    };
  }

  async processMediationCompletion(mediation, agentId, response) {
    // Handle completion signals from agents
    if (!mediation.completionSignals) {
      mediation.completionSignals = [];
    }
    
    mediation.completionSignals.push({
      agentId,
      response,
      timestamp: Date.now()
    });
    
    // Check if all agents have signaled completion
    if (mediation.completionSignals.length === mediation.agents.length) {
      const allSuccess = mediation.completionSignals.every(signal => 
        signal.response.success
      );
      
      if (allSuccess) {
        await this.finalizeMediationAgreement(mediation, response.agreement);
      } else {
        await this.handleMediationFailure(mediation);
      }
    }
  }

  async handleMediationFailure(mediation) {
    mediation.status = 'failed';
    mediation.outcome = 'unresolved';
    mediation.endTime = Date.now();
    
    // Update agent interactions
    this.updateAgentInteractions(mediation.agents, 'mediation_failed');
    
    // Send failure notification
    const failureMessage = {
      type: 'mediation_failure',
      mediationId: mediation.id,
      participants: mediation.agents,
      reason: 'consensus_not_reached',
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('mediation-decisions', failureMessage);
    
    // Move to history
    this.mediationHistory.push(mediation);
    this.activeMediations.delete(mediation.id);
    
    this.mediationStats.failedMediations++;
    
    this.metrics.mediationDuration.observe(
      { strategy: mediation.strategy, outcome: 'failed' },
      (mediation.endTime - mediation.startTime) / 1000
    );
    this.metrics.activeMediations.set(this.activeMediations.size);
    
    this.logger.warn('Mediation failed', {
      mediationId: mediation.id,
      participants: mediation.agents
    });
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Complete active mediations
        for (const [mediationId, mediation] of this.activeMediations.entries()) {
          await this.handleMediationTimeout(mediationId, mediation);
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
        
        this.logger.info('Mediator Agent shutdown completed');
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
      const port = process.env.PORT || 3012;
      
      this.server = this.app.listen(port, () => {
        this.logger.info(`Mediator Agent started on port ${port}`);
      });
      
      // Initialize SQS service
      await this.sqsService.initialize();
      
      // Start message processing
      await this.startMessageProcessing();
      
      this.logger.info('Mediator Agent fully initialized', {
        port,
        inputQueues: this.inputQueues,
        outputQueues: this.outputQueues,
        agentRelationships: this.agentRelationships.size,
        mediationStrategies: Object.keys(this.mediationStrategies),
        communicationPatterns: Object.keys(this.communicationPatterns)
      });
      
    } catch (error) {
      this.logger.error('Failed to start Mediator Agent:', error);
      throw error;
    }
  }
}

module.exports = MediatorAgent;

// Start the agent if this file is run directly
if (require.main === module) {
  const agent = new MediatorAgent();
  agent.start().catch(error => {
    console.error('Failed to start Mediator Agent:', error);
    process.exit(1);
  });
}