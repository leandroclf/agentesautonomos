/**
 * MARL Agent - Multi-Agent Reinforcement Learning
 * Fase 4: Aprendizado por Reforço Multi-Agente
 * 
 * Responsabilidades:
 * - Coordenar aprendizado entre agentes
 * - Implementar algoritmos MARL
 * - Gerenciar políticas de aprendizado
 * - Otimizar performance do sistema
 * - Adaptar comportamentos baseado em feedback
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

class MARLAgent {
  constructor() {
    this.agentId = 'marl-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService();
    this.metrics = this.setupMetrics();
    this.isShuttingDown = false;
    
    // MARL Configuration
    this.marlConfig = {
      learningRate: 0.001,
      discountFactor: 0.95,
      explorationRate: 0.1,
      explorationDecay: 0.995,
      minExplorationRate: 0.01,
      batchSize: 32,
      memorySize: 10000,
      updateFrequency: 100,
      targetUpdateFrequency: 1000
    };
    
    // Agent States and Policies
    this.agentPolicies = new Map();
    this.agentStates = new Map();
    this.rewardHistory = [];
    this.experienceReplay = [];
    
    // Learning Statistics
    this.learningStats = {
      totalEpisodes: 0,
      totalRewards: 0,
      averageReward: 0,
      bestReward: -Infinity,
      worstReward: Infinity,
      convergenceMetric: 0,
      lastUpdate: new Date().toISOString()
    };
    
    // Filas SQS
    this.inputQueues = [
      'agent-performance-feedback',
      'learning-requests',
      'policy-evaluation-requests'
    ];
    this.outputQueues = [
      'policy-updates',
      'learning-recommendations',
      'performance-insights'
    ];
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
    this.initializeAgentPolicies();
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
      learningEpisodes: new promClient.Counter({
        name: 'marl_learning_episodes_total',
        help: 'Total number of learning episodes',
        registers: [register]
      }),
      
      rewardDistribution: new promClient.Histogram({
        name: 'marl_reward_distribution',
        help: 'Distribution of rewards received',
        buckets: [-100, -10, -1, 0, 1, 10, 100, 1000],
        registers: [register]
      }),
      
      policyUpdates: new promClient.Counter({
        name: 'marl_policy_updates_total',
        help: 'Total number of policy updates',
        labelNames: ['agent_id', 'update_type'],
        registers: [register]
      }),
      
      convergenceMetric: new promClient.Gauge({
        name: 'marl_convergence_metric',
        help: 'Current convergence metric',
        registers: [register]
      }),
      
      explorationRate: new promClient.Gauge({
        name: 'marl_exploration_rate',
        help: 'Current exploration rate',
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
        learning: {
          episodes: this.learningStats.totalEpisodes,
          averageReward: this.learningStats.averageReward,
          convergence: this.learningStats.convergenceMetric,
          explorationRate: this.marlConfig.explorationRate
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

    // Learning status
    this.app.get('/api/v1/learning/status', (req, res) => {
      res.json({
        status: 'active',
        statistics: this.learningStats,
        configuration: this.marlConfig,
        agentPolicies: Array.from(this.agentPolicies.keys()),
        timestamp: new Date().toISOString()
      });
    });

    // Policy information
    this.app.get('/api/v1/policies', (req, res) => {
      const policies = {};
      for (const [agentId, policy] of this.agentPolicies.entries()) {
        policies[agentId] = {
          version: policy.version,
          performance: policy.performance,
          lastUpdate: policy.lastUpdate,
          parameters: Object.keys(policy.parameters).length
        };
      }
      
      res.json({
        policies,
        totalPolicies: this.agentPolicies.size,
        timestamp: new Date().toISOString()
      });
    });

    // Manual learning trigger
    this.app.post('/api/v1/learning/trigger', async (req, res) => {
      try {
        const { agentId, reward, state, action } = req.body;
        
        if (!agentId || reward === undefined) {
          return res.status(400).json({
            error: 'Missing required fields: agentId, reward'
          });
        }
        
        await this.processLearningEvent({
          agentId,
          reward,
          state: state || {},
          action: action || {},
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          message: 'Learning event processed',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Manual learning trigger error:', error);
        res.status(500).json({
          error: 'Failed to process learning event',
          message: error.message
        });
      }
    });
  }

  initializeAgentPolicies() {
    const knownAgents = [
      'interface-agent',
      'event-agent', 
      'planning-agent',
      'execution-agent',
      'monitoring-agent',
      'policy-agent',
      'security-agent'
    ];
    
    knownAgents.forEach(agentId => {
      this.agentPolicies.set(agentId, {
        version: 1,
        parameters: this.initializeRandomPolicy(),
        performance: {
          averageReward: 0,
          totalRewards: 0,
          episodeCount: 0,
          successRate: 0
        },
        lastUpdate: new Date().toISOString(),
        explorationRate: this.marlConfig.explorationRate
      });
    });
    
    this.logger.info('Initialized policies for agents', { 
      agentCount: knownAgents.length,
      agents: knownAgents 
    });
  }

  initializeRandomPolicy() {
    // Initialize random policy parameters
    const policySize = 10; // Simplified policy representation
    const parameters = {};
    
    for (let i = 0; i < policySize; i++) {
      parameters[`param_${i}`] = Math.random() * 2 - 1; // Random values between -1 and 1
    }
    
    return parameters;
  }

  async processLearningEvent(event) {
    const { agentId, reward, state, action, timestamp } = event;
    
    try {
      // Update agent state
      this.agentStates.set(agentId, {
        state,
        action,
        reward,
        timestamp
      });
      
      // Add to experience replay
      this.experienceReplay.push({
        agentId,
        state,
        action,
        reward,
        timestamp
      });
      
      // Limit experience replay size
      if (this.experienceReplay.length > this.marlConfig.memorySize) {
        this.experienceReplay.shift();
      }
      
      // Update agent policy performance
      const policy = this.agentPolicies.get(agentId);
      if (policy) {
        policy.performance.totalRewards += reward;
        policy.performance.episodeCount += 1;
        policy.performance.averageReward = 
          policy.performance.totalRewards / policy.performance.episodeCount;
        
        // Update success rate (reward > 0 considered success)
        const successCount = this.experienceReplay
          .filter(exp => exp.agentId === agentId && exp.reward > 0)
          .length;
        policy.performance.successRate = successCount / policy.performance.episodeCount;
      }
      
      // Update global statistics
      this.learningStats.totalEpisodes += 1;
      this.learningStats.totalRewards += reward;
      this.learningStats.averageReward = 
        this.learningStats.totalRewards / this.learningStats.totalEpisodes;
      
      if (reward > this.learningStats.bestReward) {
        this.learningStats.bestReward = reward;
      }
      if (reward < this.learningStats.worstReward) {
        this.learningStats.worstReward = reward;
      }
      
      this.learningStats.lastUpdate = timestamp;
      
      // Update metrics
      this.metrics.learningEpisodes.inc();
      this.metrics.rewardDistribution.observe(reward);
      this.metrics.explorationRate.set(this.marlConfig.explorationRate);
      
      // Trigger policy update if needed
      if (this.learningStats.totalEpisodes % this.marlConfig.updateFrequency === 0) {
        await this.updatePolicies();
      }
      
      this.logger.info('Processed learning event', {
        agentId,
        reward,
        totalEpisodes: this.learningStats.totalEpisodes,
        averageReward: this.learningStats.averageReward
      });
      
    } catch (error) {
      this.logger.error('Error processing learning event:', error);
      throw error;
    }
  }

  async updatePolicies() {
    try {
      this.logger.info('Starting policy update cycle');
      
      for (const [agentId, policy] of this.agentPolicies.entries()) {
        // Simple policy gradient update
        const agentExperiences = this.experienceReplay
          .filter(exp => exp.agentId === agentId)
          .slice(-this.marlConfig.batchSize);
        
        if (agentExperiences.length > 0) {
          const avgReward = agentExperiences.reduce((sum, exp) => sum + exp.reward, 0) / agentExperiences.length;
          
          // Update policy parameters based on average reward
          for (const [paramName, paramValue] of Object.entries(policy.parameters)) {
            const gradient = avgReward * this.marlConfig.learningRate;
            policy.parameters[paramName] += gradient * (Math.random() * 0.1 - 0.05); // Add some noise
          }
          
          policy.version += 1;
          policy.lastUpdate = new Date().toISOString();
          
          // Send policy update via SQS
          await this.sendPolicyUpdate(agentId, policy);
          
          this.metrics.policyUpdates.inc({ agent_id: agentId, update_type: 'gradient' });
        }
      }
      
      // Update exploration rate (decay)
      this.marlConfig.explorationRate = Math.max(
        this.marlConfig.minExplorationRate,
        this.marlConfig.explorationRate * this.marlConfig.explorationDecay
      );
      
      // Calculate convergence metric
      this.calculateConvergenceMetric();
      
      this.logger.info('Policy update cycle completed', {
        updatedPolicies: this.agentPolicies.size,
        explorationRate: this.marlConfig.explorationRate,
        convergenceMetric: this.learningStats.convergenceMetric
      });
      
    } catch (error) {
      this.logger.error('Error updating policies:', error);
      throw error;
    }
  }

  calculateConvergenceMetric() {
    // Simple convergence metric based on reward variance
    const recentRewards = this.experienceReplay
      .slice(-100)
      .map(exp => exp.reward);
    
    if (recentRewards.length > 10) {
      const mean = recentRewards.reduce((sum, r) => sum + r, 0) / recentRewards.length;
      const variance = recentRewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentRewards.length;
      
      // Lower variance indicates better convergence
      this.learningStats.convergenceMetric = 1 / (1 + variance);
      this.metrics.convergenceMetric.set(this.learningStats.convergenceMetric);
    }
  }

  async sendPolicyUpdate(agentId, policy) {
    try {
      const message = {
        type: 'policy_update',
        targetAgent: agentId,
        policy: {
          version: policy.version,
          parameters: policy.parameters,
          performance: policy.performance,
          explorationRate: policy.explorationRate
        },
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('policy-updates', message);
      
      this.logger.debug('Sent policy update', {
        targetAgent: agentId,
        policyVersion: policy.version
      });
      
    } catch (error) {
      this.logger.error('Error sending policy update:', error);
      throw error;
    }
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
        case 'performance_feedback':
          await this.processLearningEvent({
            agentId: message.agentId,
            reward: message.reward,
            state: message.state || {},
            action: message.action || {},
            timestamp: message.timestamp || new Date().toISOString()
          });
          break;
          
        case 'learning_request':
          await this.handleLearningRequest(message);
          break;
          
        case 'policy_evaluation_request':
          await this.handlePolicyEvaluationRequest(message);
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

  async handleLearningRequest(message) {
    // Handle requests for learning recommendations
    const recommendation = {
      type: 'learning_recommendation',
      targetAgent: message.agentId,
      recommendation: {
        explorationRate: this.marlConfig.explorationRate,
        learningRate: this.marlConfig.learningRate,
        suggestedActions: this.generateActionSuggestions(message.agentId, message.currentState)
      },
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('learning-recommendations', recommendation);
  }

  async handlePolicyEvaluationRequest(message) {
    // Handle requests for policy evaluation
    const policy = this.agentPolicies.get(message.agentId);
    
    if (policy) {
      const evaluation = {
        type: 'policy_evaluation',
        agentId: message.agentId,
        evaluation: {
          version: policy.version,
          performance: policy.performance,
          convergenceMetric: this.learningStats.convergenceMetric,
          recommendation: this.generatePolicyRecommendation(policy)
        },
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('performance-insights', evaluation);
    }
  }

  generateActionSuggestions(agentId, currentState) {
    // Generate action suggestions based on current policy
    const policy = this.agentPolicies.get(agentId);
    
    if (!policy) {
      return ['explore', 'default_action'];
    }
    
    // Simple action suggestion based on policy parameters
    const suggestions = [];
    
    if (policy.performance.successRate > 0.7) {
      suggestions.push('exploit_current_strategy');
    } else {
      suggestions.push('explore_new_actions');
    }
    
    if (policy.performance.averageReward < 0) {
      suggestions.push('conservative_approach');
    } else {
      suggestions.push('aggressive_optimization');
    }
    
    return suggestions;
  }

  generatePolicyRecommendation(policy) {
    const recommendations = [];
    
    if (policy.performance.successRate < 0.5) {
      recommendations.push('increase_exploration');
    }
    
    if (policy.performance.averageReward < 0) {
      recommendations.push('revise_reward_function');
    }
    
    if (policy.performance.episodeCount < 100) {
      recommendations.push('collect_more_data');
    }
    
    return recommendations.length > 0 ? recommendations : ['continue_current_policy'];
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
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
        
        this.logger.info('MARL Agent shutdown completed');
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
      const port = process.env.PORT || 3010;
      
      this.server = this.app.listen(port, () => {
        this.logger.info(`MARL Agent started on port ${port}`);
      });
      
      // Initialize SQS service
      await this.sqsService.initialize();
      
      // Start message processing
      await this.startMessageProcessing();
      
      this.logger.info('MARL Agent fully initialized', {
        port,
        inputQueues: this.inputQueues,
        outputQueues: this.outputQueues,
        agentPolicies: this.agentPolicies.size
      });
      
    } catch (error) {
      this.logger.error('Failed to start MARL Agent:', error);
      process.exit(1);
    }
  }
}

// Start the agent if this file is run directly
if (require.main === module) {
  const agent = new MARLAgent();
  agent.start();
}

module.exports = MARLAgent;