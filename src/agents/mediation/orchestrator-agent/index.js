/**
 * Orchestrator Agent - Orquestração Global
 * Fase 5: Mediação e Orquestração
 * 
 * Responsabilidades:
 * - Orquestrar operações globais do sistema
 * - Coordenar fluxos de trabalho complexos
 * - Gerenciar dependências entre agentes
 * - Otimizar performance do sistema
 * - Supervisionar execução de tarefas
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

class OrchestratorAgent {
  constructor() {
    this.agentId = 'orchestrator-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService();
    this.metrics = this.setupMetrics();
    this.isShuttingDown = false;
    
    // Orchestration Configuration
    this.orchestrationConfig = {
      maxWorkflowTime: 1800000, // 30 minutes
      maxConcurrentWorkflows: 50,
      retryAttempts: 3,
      retryDelay: 5000,
      healthCheckInterval: 30000,
      performanceThreshold: 0.8,
      loadBalancingStrategy: 'round_robin',
      failoverEnabled: true,
      circuitBreakerThreshold: 5
    };
    
    // System State
    this.systemState = {
      status: 'initializing',
      totalAgents: 0,
      activeAgents: 0,
      healthyAgents: 0,
      systemLoad: 0,
      lastHealthCheck: null,
      uptime: Date.now()
    };
    
    // Active Workflows
    this.activeWorkflows = new Map();
    this.workflowTemplates = new Map();
    this.workflowHistory = [];
    
    // Agent Registry
    this.agentRegistry = new Map();
    this.agentCapabilities = new Map();
    this.agentLoadBalancer = new Map();
    
    // Performance Monitoring
    this.performanceMetrics = {
      systemThroughput: 0,
      averageResponseTime: 0,
      errorRate: 0,
      resourceUtilization: 0,
      workflowSuccessRate: 0,
      lastUpdate: new Date().toISOString()
    };
    
    // Circuit Breakers
    this.circuitBreakers = new Map();
    
    // Workflow Execution Strategies
    this.executionStrategies = {
      'sequential': this.executeSequential.bind(this),
      'parallel': this.executeParallel.bind(this),
      'pipeline': this.executePipeline.bind(this),
      'conditional': this.executeConditional.bind(this),
      'loop': this.executeLoop.bind(this),
      'scatter_gather': this.executeScatterGather.bind(this)
    };
    
    // Statistics
    this.orchestrationStats = {
      totalWorkflows: 0,
      successfulWorkflows: 0,
      failedWorkflows: 0,
      averageWorkflowTime: 0,
      systemOptimizations: 0,
      loadBalancingDecisions: 0,
      failoverEvents: 0,
      lastUpdate: new Date().toISOString()
    };
    
    // Filas SQS
    this.inputQueues = [
      'orchestration-requests',
      'workflow-definitions',
      'agent-registrations',
      'system-events',
      'performance-reports'
    ];
    this.outputQueues = [
      'orchestration-commands',
      'workflow-instructions',
      'system-optimizations',
      'load-balancing-decisions',
      'orchestration-status'
    ];
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
    this.initializeWorkflowTemplates();
    this.initializeAgentRegistry();
    this.startSystemMonitoring();
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
      orchestrationRequests: new promClient.Counter({
        name: 'orchestration_requests_total',
        help: 'Total number of orchestration requests',
        labelNames: ['workflow_type', 'strategy', 'status'],
        registers: [register]
      }),
      
      workflowDuration: new promClient.Histogram({
        name: 'workflow_duration_seconds',
        help: 'Duration of workflow executions',
        buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
        labelNames: ['workflow_type', 'strategy', 'outcome'],
        registers: [register]
      }),
      
      activeWorkflows: new promClient.Gauge({
        name: 'active_workflows',
        help: 'Number of active workflows',
        registers: [register]
      }),
      
      systemLoad: new promClient.Gauge({
        name: 'system_load',
        help: 'Current system load',
        registers: [register]
      }),
      
      agentHealth: new promClient.Gauge({
        name: 'agent_health_score',
        help: 'Health score of registered agents',
        labelNames: ['agent_id', 'agent_type'],
        registers: [register]
      }),
      
      workflowSuccessRate: new promClient.Gauge({
        name: 'workflow_success_rate',
        help: 'Rate of successful workflow executions',
        registers: [register]
      }),
      
      systemThroughput: new promClient.Gauge({
        name: 'system_throughput',
        help: 'System throughput (operations per second)',
        registers: [register]
      }),
      
      loadBalancingDecisions: new promClient.Counter({
        name: 'load_balancing_decisions_total',
        help: 'Total number of load balancing decisions',
        labelNames: ['strategy', 'agent_type'],
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
        system: {
          status: this.systemState.status,
          totalAgents: this.systemState.totalAgents,
          activeAgents: this.systemState.activeAgents,
          healthyAgents: this.systemState.healthyAgents,
          systemLoad: this.systemState.systemLoad,
          activeWorkflows: this.activeWorkflows.size
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

    // System status
    this.app.get('/api/v1/system/status', (req, res) => {
      res.json({
        system: this.systemState,
        performance: this.performanceMetrics,
        statistics: this.orchestrationStats,
        activeWorkflows: Array.from(this.activeWorkflows.keys()),
        agentRegistry: this.getAgentRegistrySummary(),
        timestamp: new Date().toISOString()
      });
    });

    // Agent registry
    this.app.get('/api/v1/agents', (req, res) => {
      const agents = {};
      for (const [agentId, agent] of this.agentRegistry.entries()) {
        agents[agentId] = {
          type: agent.type,
          status: agent.status,
          health: agent.health,
          load: agent.load,
          capabilities: agent.capabilities,
          lastSeen: agent.lastSeen,
          performance: agent.performance
        };
      }
      
      res.json({
        agents,
        totalAgents: this.agentRegistry.size,
        timestamp: new Date().toISOString()
      });
    });

    // Workflow templates
    this.app.get('/api/v1/workflows/templates', (req, res) => {
      const templates = {};
      for (const [templateId, template] of this.workflowTemplates.entries()) {
        templates[templateId] = {
          name: template.name,
          description: template.description,
          strategy: template.strategy,
          steps: template.steps.length,
          estimatedDuration: template.estimatedDuration,
          requiredCapabilities: template.requiredCapabilities
        };
      }
      
      res.json({
        templates,
        totalTemplates: this.workflowTemplates.size,
        timestamp: new Date().toISOString()
      });
    });

    // Active workflows
    this.app.get('/api/v1/workflows/active', (req, res) => {
      const workflows = {};
      for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
        workflows[workflowId] = {
          type: workflow.type,
          strategy: workflow.strategy,
          status: workflow.status,
          progress: workflow.progress,
          startTime: workflow.startTime,
          estimatedCompletion: workflow.estimatedCompletion,
          assignedAgents: workflow.assignedAgents,
          currentStep: workflow.currentStep
        };
      }
      
      res.json({
        workflows,
        totalActive: this.activeWorkflows.size,
        timestamp: new Date().toISOString()
      });
    });

    // Performance metrics
    this.app.get('/api/v1/performance', (req, res) => {
      res.json({
        metrics: this.performanceMetrics,
        systemLoad: this.systemState.systemLoad,
        circuitBreakers: this.getCircuitBreakerStatus(),
        loadBalancing: this.getLoadBalancingStatus(),
        timestamp: new Date().toISOString()
      });
    });

    // Manual workflow execution
    this.app.post('/api/v1/workflows/execute', async (req, res) => {
      try {
        const { templateId, parameters, priority, strategy } = req.body;
        
        if (!templateId) {
          return res.status(400).json({
            error: 'Template ID is required'
          });
        }
        
        const workflowId = await this.executeWorkflow({
          templateId,
          parameters: parameters || {},
          priority: priority || 'medium',
          strategy: strategy || 'sequential',
          requestedBy: 'manual',
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          workflowId,
          message: 'Workflow execution initiated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Manual workflow execution error:', error);
        res.status(500).json({
          error: 'Failed to execute workflow',
          message: error.message
        });
      }
    });

    // System optimization
    this.app.post('/api/v1/system/optimize', async (req, res) => {
      try {
        const { target, parameters } = req.body;
        
        const optimizationId = await this.optimizeSystem({
          target: target || 'performance',
          parameters: parameters || {},
          requestedBy: 'manual',
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          optimizationId,
          message: 'System optimization initiated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('System optimization error:', error);
        res.status(500).json({
          error: 'Failed to optimize system',
          message: error.message
        });
      }
    });

    // Agent registration
    this.app.post('/api/v1/agents/register', async (req, res) => {
      try {
        const { agentId, type, capabilities, endpoint } = req.body;
        
        if (!agentId || !type) {
          return res.status(400).json({
            error: 'Agent ID and type are required'
          });
        }
        
        await this.registerAgent({
          agentId,
          type,
          capabilities: capabilities || [],
          endpoint,
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          message: 'Agent registered successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Agent registration error:', error);
        res.status(500).json({
          error: 'Failed to register agent',
          message: error.message
        });
      }
    });
  }

  initializeWorkflowTemplates() {
    // Define common workflow templates
    const templates = [
      {
        id: 'user_request_processing',
        name: 'User Request Processing',
        description: 'Standard user request processing workflow',
        strategy: 'sequential',
        estimatedDuration: 30000,
        requiredCapabilities: ['interface', 'planning', 'execution'],
        steps: [
          { agent: 'interface-agent', action: 'receive_request', timeout: 5000 },
          { agent: 'planning-agent', action: 'create_plan', timeout: 10000 },
          { agent: 'execution-agent', action: 'execute_plan', timeout: 15000 }
        ]
      },
      {
        id: 'system_health_check',
        name: 'System Health Check',
        description: 'Comprehensive system health monitoring',
        strategy: 'parallel',
        estimatedDuration: 15000,
        requiredCapabilities: ['monitoring', 'security', 'policy'],
        steps: [
          { agent: 'monitoring-agent', action: 'collect_metrics', timeout: 10000 },
          { agent: 'security-agent', action: 'security_scan', timeout: 10000 },
          { agent: 'policy-agent', action: 'compliance_check', timeout: 10000 }
        ]
      },
      {
        id: 'learning_optimization',
        name: 'Learning and Optimization',
        description: 'MARL-based system optimization',
        strategy: 'pipeline',
        estimatedDuration: 60000,
        requiredCapabilities: ['marl', 'coordination', 'monitoring'],
        steps: [
          { agent: 'monitoring-agent', action: 'collect_performance_data', timeout: 15000 },
          { agent: 'marl-agent', action: 'analyze_performance', timeout: 20000 },
          { agent: 'coordination-agent', action: 'optimize_coordination', timeout: 25000 }
        ]
      },
      {
        id: 'conflict_resolution',
        name: 'Conflict Resolution',
        description: 'Automated conflict detection and resolution',
        strategy: 'conditional',
        estimatedDuration: 45000,
        requiredCapabilities: ['mediation', 'coordination', 'policy'],
        steps: [
          { agent: 'coordination-agent', action: 'detect_conflicts', timeout: 10000 },
          { agent: 'mediator-agent', action: 'mediate_conflict', timeout: 30000, condition: 'conflict_detected' },
          { agent: 'policy-agent', action: 'update_policies', timeout: 5000 }
        ]
      },
      {
        id: 'emergency_response',
        name: 'Emergency Response',
        description: 'Emergency situation handling workflow',
        strategy: 'scatter_gather',
        estimatedDuration: 20000,
        requiredCapabilities: ['security', 'monitoring', 'coordination', 'mediation'],
        steps: [
          { agent: 'security-agent', action: 'assess_threat', timeout: 5000 },
          { agent: 'monitoring-agent', action: 'emergency_monitoring', timeout: 15000 },
          { agent: 'coordination-agent', action: 'coordinate_response', timeout: 15000 },
          { agent: 'mediator-agent', action: 'facilitate_communication', timeout: 10000 }
        ]
      }
    ];
    
    for (const template of templates) {
      this.workflowTemplates.set(template.id, template);
    }
    
    this.logger.info('Initialized workflow templates', { 
      templateCount: this.workflowTemplates.size 
    });
  }

  initializeAgentRegistry() {
    const knownAgents = [
      { id: 'interface-agent', type: 'core', capabilities: ['interface', 'user_interaction'] },
      { id: 'event-agent', type: 'core', capabilities: ['event_processing', 'messaging'] },
      { id: 'planning-agent', type: 'core', capabilities: ['planning', 'strategy'] },
      { id: 'execution-agent', type: 'core', capabilities: ['execution', 'task_management'] },
      { id: 'state-management-agent', type: 'core', capabilities: ['state_management', 'persistence'] },
      { id: 'acl-middleware-agent', type: 'core', capabilities: ['communication', 'message_routing'] },
      { id: 'monitoring-agent', type: 'auxiliary', capabilities: ['monitoring', 'metrics', 'health_check'] },
      { id: 'policy-agent', type: 'auxiliary', capabilities: ['policy', 'compliance', 'governance'] },
      { id: 'security-agent', type: 'auxiliary', capabilities: ['security', 'authentication', 'threat_detection'] },
      { id: 'marl-agent', type: 'marl', capabilities: ['learning', 'optimization', 'adaptation'] },
      { id: 'coordination-agent', type: 'marl', capabilities: ['coordination', 'resource_management', 'conflict_detection'] },
      { id: 'mediator-agent', type: 'mediation', capabilities: ['mediation', 'conflict_resolution', 'communication_facilitation'] }
    ];
    
    for (const agent of knownAgents) {
      this.agentRegistry.set(agent.id, {
        id: agent.id,
        type: agent.type,
        capabilities: agent.capabilities,
        status: 'unknown',
        health: 0.5,
        load: 0,
        performance: {
          responseTime: 0,
          successRate: 1.0,
          throughput: 0
        },
        lastSeen: null,
        endpoint: null,
        registrationTime: Date.now()
      });
      
      // Initialize load balancer
      this.agentLoadBalancer.set(agent.type, {
        agents: [agent.id],
        currentIndex: 0,
        strategy: this.orchestrationConfig.loadBalancingStrategy
      });
      
      // Initialize circuit breaker
      this.circuitBreakers.set(agent.id, {
        state: 'closed', // closed, open, half-open
        failureCount: 0,
        lastFailureTime: null,
        nextAttemptTime: null
      });
    }
    
    this.systemState.totalAgents = this.agentRegistry.size;
    
    this.logger.info('Initialized agent registry', { 
      agentCount: this.agentRegistry.size,
      agentTypes: [...new Set(knownAgents.map(a => a.type))]
    });
  }

  getAgentRegistrySummary() {
    const summary = {
      byType: {},
      byStatus: {},
      byHealth: { healthy: 0, degraded: 0, unhealthy: 0 },
      totalCapabilities: new Set()
    };
    
    for (const agent of this.agentRegistry.values()) {
      // By type
      if (!summary.byType[agent.type]) {
        summary.byType[agent.type] = 0;
      }
      summary.byType[agent.type]++;
      
      // By status
      if (!summary.byStatus[agent.status]) {
        summary.byStatus[agent.status] = 0;
      }
      summary.byStatus[agent.status]++;
      
      // By health
      if (agent.health > 0.7) summary.byHealth.healthy++;
      else if (agent.health > 0.3) summary.byHealth.degraded++;
      else summary.byHealth.unhealthy++;
      
      // Capabilities
      agent.capabilities.forEach(cap => summary.totalCapabilities.add(cap));
    }
    
    summary.totalCapabilities = Array.from(summary.totalCapabilities);
    
    return summary;
  }

  getCircuitBreakerStatus() {
    const status = {};
    for (const [agentId, breaker] of this.circuitBreakers.entries()) {
      status[agentId] = {
        state: breaker.state,
        failureCount: breaker.failureCount,
        isAvailable: breaker.state !== 'open'
      };
    }
    return status;
  }

  getLoadBalancingStatus() {
    const status = {};
    for (const [agentType, balancer] of this.agentLoadBalancer.entries()) {
      status[agentType] = {
        strategy: balancer.strategy,
        agentCount: balancer.agents.length,
        currentAgent: balancer.agents[balancer.currentIndex],
        distribution: this.calculateLoadDistribution(agentType)
      };
    }
    return status;
  }

  calculateLoadDistribution(agentType) {
    const balancer = this.agentLoadBalancer.get(agentType);
    if (!balancer) return {};
    
    const distribution = {};
    for (const agentId of balancer.agents) {
      const agent = this.agentRegistry.get(agentId);
      distribution[agentId] = agent ? agent.load : 0;
    }
    
    return distribution;
  }

  startSystemMonitoring() {
    // System health monitoring
    setInterval(() => {
      this.performSystemHealthCheck();
    }, this.orchestrationConfig.healthCheckInterval);
    
    // Performance monitoring
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 60000); // Every minute
    
    // Workflow timeout monitoring
    setInterval(() => {
      this.checkWorkflowTimeouts();
    }, 10000); // Every 10 seconds
    
    // Circuit breaker monitoring
    setInterval(() => {
      this.updateCircuitBreakers();
    }, 30000); // Every 30 seconds
    
    // System optimization
    setInterval(() => {
      this.performSystemOptimization();
    }, 300000); // Every 5 minutes
    
    this.logger.info('Started system monitoring');
  }

  async performSystemHealthCheck() {
    let activeAgents = 0;
    let healthyAgents = 0;
    let totalLoad = 0;
    
    for (const [agentId, agent] of this.agentRegistry.entries()) {
      try {
        // Simulate health check (in real implementation, would ping agent endpoints)
        const isActive = this.isAgentActive(agent);
        const health = await this.checkAgentHealth(agentId);
        
        agent.health = health;
        agent.lastSeen = isActive ? Date.now() : agent.lastSeen;
        agent.status = isActive ? (health > 0.5 ? 'healthy' : 'degraded') : 'inactive';
        
        if (isActive) {
          activeAgents++;
          totalLoad += agent.load;
          
          if (health > 0.7) {
            healthyAgents++;
          }
        }
        
        // Update metrics
        this.metrics.agentHealth.set(
          { agent_id: agentId, agent_type: agent.type },
          health
        );
        
      } catch (error) {
        this.logger.error(`Health check failed for agent ${agentId}:`, error);
        agent.status = 'error';
        agent.health = 0;
      }
    }
    
    // Update system state
    this.systemState.activeAgents = activeAgents;
    this.systemState.healthyAgents = healthyAgents;
    this.systemState.systemLoad = totalLoad / Math.max(activeAgents, 1);
    this.systemState.lastHealthCheck = new Date().toISOString();
    
    // Determine overall system status
    const healthRatio = healthyAgents / Math.max(activeAgents, 1);
    if (healthRatio > 0.8) {
      this.systemState.status = 'healthy';
    } else if (healthRatio > 0.5) {
      this.systemState.status = 'degraded';
    } else {
      this.systemState.status = 'critical';
    }
    
    // Update metrics
    this.metrics.systemLoad.set(this.systemState.systemLoad);
    
    this.logger.debug('System health check completed', {
      activeAgents,
      healthyAgents,
      systemLoad: this.systemState.systemLoad,
      status: this.systemState.status
    });
  }

  isAgentActive(agent) {
    // Simple activity check based on last seen time
    if (!agent.lastSeen) return false;
    
    const timeSinceLastSeen = Date.now() - agent.lastSeen;
    return timeSinceLastSeen < 120000; // 2 minutes
  }

  async checkAgentHealth(agentId) {
    // Simulate health check (in real implementation, would make HTTP request)
    const agent = this.agentRegistry.get(agentId);
    if (!agent) return 0;
    
    // Calculate health based on various factors
    let health = 0.5; // Base health
    
    // Factor in response time
    if (agent.performance.responseTime < 1000) health += 0.2;
    else if (agent.performance.responseTime < 5000) health += 0.1;
    
    // Factor in success rate
    health += agent.performance.successRate * 0.3;
    
    // Factor in load
    if (agent.load < 0.7) health += 0.1;
    else if (agent.load > 0.9) health -= 0.2;
    
    // Factor in circuit breaker state
    const circuitBreaker = this.circuitBreakers.get(agentId);
    if (circuitBreaker && circuitBreaker.state === 'open') {
      health -= 0.3;
    }
    
    return Math.max(0, Math.min(1, health));
  }

  updatePerformanceMetrics() {
    // Calculate system-wide performance metrics
    let totalResponseTime = 0;
    let totalThroughput = 0;
    let totalSuccessRate = 0;
    let activeAgentCount = 0;
    
    for (const agent of this.agentRegistry.values()) {
      if (agent.status === 'healthy' || agent.status === 'degraded') {
        totalResponseTime += agent.performance.responseTime;
        totalThroughput += agent.performance.throughput;
        totalSuccessRate += agent.performance.successRate;
        activeAgentCount++;
      }
    }
    
    if (activeAgentCount > 0) {
      this.performanceMetrics.averageResponseTime = totalResponseTime / activeAgentCount;
      this.performanceMetrics.systemThroughput = totalThroughput;
      this.performanceMetrics.errorRate = 1 - (totalSuccessRate / activeAgentCount);
    }
    
    // Calculate workflow success rate
    const recentWorkflows = this.workflowHistory
      .filter(w => Date.now() - w.endTime < 3600000) // Last hour
      .length;
    
    const successfulWorkflows = this.workflowHistory
      .filter(w => Date.now() - w.endTime < 3600000 && w.status === 'completed')
      .length;
    
    this.performanceMetrics.workflowSuccessRate = recentWorkflows > 0 
      ? successfulWorkflows / recentWorkflows 
      : 1.0;
    
    // Calculate resource utilization
    this.performanceMetrics.resourceUtilization = this.systemState.systemLoad;
    
    this.performanceMetrics.lastUpdate = new Date().toISOString();
    
    // Update metrics
    this.metrics.systemThroughput.set(this.performanceMetrics.systemThroughput);
    this.metrics.workflowSuccessRate.set(this.performanceMetrics.workflowSuccessRate);
  }

  checkWorkflowTimeouts() {
    const now = Date.now();
    
    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      const elapsed = now - workflow.startTime;
      
      if (elapsed > this.orchestrationConfig.maxWorkflowTime) {
        this.logger.warn('Workflow timeout detected', {
          workflowId,
          elapsed,
          maxTime: this.orchestrationConfig.maxWorkflowTime
        });
        
        this.handleWorkflowTimeout(workflowId, workflow);
      }
    }
  }

  updateCircuitBreakers() {
    const now = Date.now();
    
    for (const [agentId, breaker] of this.circuitBreakers.entries()) {
      if (breaker.state === 'open' && breaker.nextAttemptTime && now >= breaker.nextAttemptTime) {
        // Transition to half-open
        breaker.state = 'half-open';
        breaker.nextAttemptTime = null;
        
        this.logger.info('Circuit breaker transitioning to half-open', { agentId });
      }
    }
  }

  async performSystemOptimization() {
    try {
      // Analyze system performance
      const optimizationNeeded = this.analyzeOptimizationNeeds();
      
      if (optimizationNeeded.length > 0) {
        this.logger.info('Performing system optimization', {
          optimizations: optimizationNeeded
        });
        
        for (const optimization of optimizationNeeded) {
          await this.applyOptimization(optimization);
        }
        
        this.orchestrationStats.systemOptimizations++;
      }
      
    } catch (error) {
      this.logger.error('System optimization error:', error);
    }
  }

  analyzeOptimizationNeeds() {
    const optimizations = [];
    
    // Check system load
    if (this.systemState.systemLoad > this.orchestrationConfig.performanceThreshold) {
      optimizations.push({
        type: 'load_balancing',
        priority: 'high',
        reason: 'High system load detected'
      });
    }
    
    // Check workflow success rate
    if (this.performanceMetrics.workflowSuccessRate < 0.8) {
      optimizations.push({
        type: 'workflow_optimization',
        priority: 'medium',
        reason: 'Low workflow success rate'
      });
    }
    
    // Check agent health
    const unhealthyAgents = Array.from(this.agentRegistry.values())
      .filter(agent => agent.health < 0.5).length;
    
    if (unhealthyAgents > this.systemState.totalAgents * 0.2) {
      optimizations.push({
        type: 'agent_recovery',
        priority: 'high',
        reason: 'Multiple unhealthy agents detected'
      });
    }
    
    // Check response times
    if (this.performanceMetrics.averageResponseTime > 5000) {
      optimizations.push({
        type: 'performance_tuning',
        priority: 'medium',
        reason: 'High average response time'
      });
    }
    
    return optimizations;
  }

  async applyOptimization(optimization) {
    switch (optimization.type) {
      case 'load_balancing':
        await this.optimizeLoadBalancing();
        break;
        
      case 'workflow_optimization':
        await this.optimizeWorkflows();
        break;
        
      case 'agent_recovery':
        await this.recoverUnhealthyAgents();
        break;
        
      case 'performance_tuning':
        await this.tunePerformance();
        break;
        
      default:
        this.logger.warn('Unknown optimization type', { type: optimization.type });
    }
  }

  async optimizeLoadBalancing() {
    // Redistribute load across agents
    for (const [agentType, balancer] of this.agentLoadBalancer.entries()) {
      const agents = balancer.agents.map(id => this.agentRegistry.get(id)).filter(Boolean);
      
      // Sort agents by load (ascending)
      agents.sort((a, b) => a.load - b.load);
      
      // Update load balancer order
      balancer.agents = agents.map(agent => agent.id);
      balancer.currentIndex = 0;
      
      this.metrics.loadBalancingDecisions.inc({
        strategy: balancer.strategy,
        agent_type: agentType
      });
    }
    
    this.orchestrationStats.loadBalancingDecisions++;
    
    this.logger.info('Load balancing optimization completed');
  }

  async optimizeWorkflows() {
    // Analyze failed workflows and adjust templates
    const failedWorkflows = this.workflowHistory
      .filter(w => w.status === 'failed' && Date.now() - w.endTime < 3600000);
    
    const failurePatterns = new Map();
    
    for (const workflow of failedWorkflows) {
      const pattern = `${workflow.type}_${workflow.strategy}`;
      if (!failurePatterns.has(pattern)) {
        failurePatterns.set(pattern, { count: 0, workflows: [] });
      }
      failurePatterns.get(pattern).count++;
      failurePatterns.get(pattern).workflows.push(workflow);
    }
    
    // Adjust templates for high-failure patterns
    for (const [pattern, data] of failurePatterns.entries()) {
      if (data.count > 3) { // More than 3 failures
        const [templateId, strategy] = pattern.split('_');
        const template = this.workflowTemplates.get(templateId);
        
        if (template) {
          // Increase timeouts
          template.steps.forEach(step => {
            step.timeout = Math.min(step.timeout * 1.5, 60000);
          });
          
          template.estimatedDuration *= 1.3;
          
          this.logger.info('Adjusted workflow template', {
            templateId,
            adjustments: 'increased_timeouts'
          });
        }
      }
    }
  }

  async recoverUnhealthyAgents() {
    const unhealthyAgents = Array.from(this.agentRegistry.values())
      .filter(agent => agent.health < 0.5);
    
    for (const agent of unhealthyAgents) {
      try {
        // Attempt to recover agent
        await this.attemptAgentRecovery(agent.id);
        
        this.logger.info('Attempted agent recovery', { agentId: agent.id });
        
      } catch (error) {
        this.logger.error('Agent recovery failed', {
          agentId: agent.id,
          error: error.message
        });
      }
    }
  }

  async attemptAgentRecovery(agentId) {
    const agent = this.agentRegistry.get(agentId);
    if (!agent) return;
    
    // Reset circuit breaker
    const circuitBreaker = this.circuitBreakers.get(agentId);
    if (circuitBreaker) {
      circuitBreaker.state = 'closed';
      circuitBreaker.failureCount = 0;
      circuitBreaker.lastFailureTime = null;
      circuitBreaker.nextAttemptTime = null;
    }
    
    // Reset agent metrics
    agent.load = 0;
    agent.performance.responseTime = 0;
    agent.performance.successRate = 1.0;
    
    // Send recovery command
    const recoveryMessage = {
      type: 'agent_recovery',
      agentId,
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('orchestration-commands', recoveryMessage);
  }

  async tunePerformance() {
    // Adjust system parameters for better performance
    const currentLoad = this.systemState.systemLoad;
    
    if (currentLoad > 0.8) {
      // Reduce concurrent workflows
      this.orchestrationConfig.maxConcurrentWorkflows = Math.max(
        this.orchestrationConfig.maxConcurrentWorkflows * 0.8,
        10
      );
      
      this.logger.info('Reduced max concurrent workflows', {
        newLimit: this.orchestrationConfig.maxConcurrentWorkflows
      });
    } else if (currentLoad < 0.3) {
      // Increase concurrent workflows
      this.orchestrationConfig.maxConcurrentWorkflows = Math.min(
        this.orchestrationConfig.maxConcurrentWorkflows * 1.2,
        100
      );
      
      this.logger.info('Increased max concurrent workflows', {
        newLimit: this.orchestrationConfig.maxConcurrentWorkflows
      });
    }
  }

  async executeWorkflow(request) {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Check if we can accept new workflows
      if (this.activeWorkflows.size >= this.orchestrationConfig.maxConcurrentWorkflows) {
        throw new Error('Maximum concurrent workflows reached');
      }
      
      const template = this.workflowTemplates.get(request.templateId);
      if (!template) {
        throw new Error(`Unknown workflow template: ${request.templateId}`);
      }
      
      this.logger.info('Executing workflow', {
        workflowId,
        templateId: request.templateId,
        strategy: request.strategy,
        priority: request.priority
      });
      
      // Create workflow instance
      const workflow = {
        id: workflowId,
        templateId: request.templateId,
        type: template.name,
        strategy: request.strategy,
        priority: request.priority,
        parameters: request.parameters,
        status: 'running',
        progress: 0,
        startTime: Date.now(),
        estimatedCompletion: Date.now() + template.estimatedDuration,
        assignedAgents: [],
        currentStep: 0,
        steps: [...template.steps],
        results: [],
        requestedBy: request.requestedBy
      };
      
      this.activeWorkflows.set(workflowId, workflow);
      
      // Execute workflow based on strategy
      const strategy = this.executionStrategies[request.strategy];
      if (strategy) {
        await strategy(workflow);
      } else {
        throw new Error(`Unknown execution strategy: ${request.strategy}`);
      }
      
      // Update metrics
      this.metrics.orchestrationRequests.inc({
        workflow_type: template.name,
        strategy: request.strategy,
        status: 'initiated'
      });
      this.metrics.activeWorkflows.set(this.activeWorkflows.size);
      
      this.orchestrationStats.totalWorkflows++;
      
      return workflowId;
      
    } catch (error) {
      this.logger.error('Failed to execute workflow:', error);
      
      this.metrics.orchestrationRequests.inc({
        workflow_type: request.templateId || 'unknown',
        strategy: request.strategy || 'unknown',
        status: 'failed'
      });
      
      throw error;
    }
  }

  async executeSequential(workflow) {
    this.logger.info('Executing sequential workflow', {
      workflowId: workflow.id,
      steps: workflow.steps.length
    });
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      workflow.currentStep = i;
      
      try {
        const agent = await this.selectAgent(step.agent, workflow);
        if (!agent) {
          throw new Error(`No available agent for: ${step.agent}`);
        }
        
        workflow.assignedAgents.push(agent.id);
        
        const result = await this.executeWorkflowStep(workflow, step, agent);
        workflow.results.push(result);
        
        workflow.progress = ((i + 1) / workflow.steps.length) * 100;
        
        this.logger.debug('Workflow step completed', {
          workflowId: workflow.id,
          step: i,
          agent: agent.id,
          progress: workflow.progress
        });
        
      } catch (error) {
        this.logger.error('Workflow step failed', {
          workflowId: workflow.id,
          step: i,
          error: error.message
        });
        
        await this.handleWorkflowFailure(workflow, error);
        return;
      }
    }
    
    await this.completeWorkflow(workflow);
  }

  async executeParallel(workflow) {
    this.logger.info('Executing parallel workflow', {
      workflowId: workflow.id,
      steps: workflow.steps.length
    });
    
    const stepPromises = [];
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      
      const stepPromise = (async () => {
        try {
          const agent = await this.selectAgent(step.agent, workflow);
          if (!agent) {
            throw new Error(`No available agent for: ${step.agent}`);
          }
          
          workflow.assignedAgents.push(agent.id);
          
          const result = await this.executeWorkflowStep(workflow, step, agent);
          return { stepIndex: i, result, success: true };
          
        } catch (error) {
          return { stepIndex: i, error, success: false };
        }
      })();
      
      stepPromises.push(stepPromise);
    }
    
    try {
      const results = await Promise.all(stepPromises);
      
      // Check if all steps succeeded
      const failures = results.filter(r => !r.success);
      
      if (failures.length > 0) {
        const error = new Error(`${failures.length} parallel steps failed`);
        error.failures = failures;
        throw error;
      }
      
      // Sort results by step index
      results.sort((a, b) => a.stepIndex - b.stepIndex);
      workflow.results = results.map(r => r.result);
      workflow.progress = 100;
      
      await this.completeWorkflow(workflow);
      
    } catch (error) {
      await this.handleWorkflowFailure(workflow, error);
    }
  }

  async executePipeline(workflow) {
    this.logger.info('Executing pipeline workflow', {
      workflowId: workflow.id,
      steps: workflow.steps.length
    });
    
    let pipelineData = workflow.parameters;
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      workflow.currentStep = i;
      
      try {
        const agent = await this.selectAgent(step.agent, workflow);
        if (!agent) {
          throw new Error(`No available agent for: ${step.agent}`);
        }
        
        workflow.assignedAgents.push(agent.id);
        
        // Pass previous step's output as input to current step
        const stepParameters = {
          ...step.parameters,
          pipelineData
        };
        
        const result = await this.executeWorkflowStep(workflow, {
          ...step,
          parameters: stepParameters
        }, agent);
        
        workflow.results.push(result);
        pipelineData = result.output || result; // Use result as input for next step
        
        workflow.progress = ((i + 1) / workflow.steps.length) * 100;
        
        this.logger.debug('Pipeline step completed', {
          workflowId: workflow.id,
          step: i,
          agent: agent.id,
          progress: workflow.progress
        });
        
      } catch (error) {
        this.logger.error('Pipeline step failed', {
          workflowId: workflow.id,
          step: i,
          error: error.message
        });
        
        await this.handleWorkflowFailure(workflow, error);
        return;
      }
    }
    
    await this.completeWorkflow(workflow);
  }

  async executeConditional(workflow) {
    this.logger.info('Executing conditional workflow', {
      workflowId: workflow.id,
      steps: workflow.steps.length
    });
    
    let workflowContext = { ...workflow.parameters };
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      workflow.currentStep = i;
      
      // Check if step should be executed based on condition
      if (step.condition && !this.evaluateCondition(step.condition, workflowContext)) {
        this.logger.debug('Skipping conditional step', {
          workflowId: workflow.id,
          step: i,
          condition: step.condition
        });
        
        workflow.results.push({ skipped: true, reason: 'condition_not_met' });
        workflow.progress = ((i + 1) / workflow.steps.length) * 100;
        continue;
      }
      
      try {
        const agent = await this.selectAgent(step.agent, workflow);
        if (!agent) {
          throw new Error(`No available agent for: ${step.agent}`);
        }
        
        workflow.assignedAgents.push(agent.id);
        
        const result = await this.executeWorkflowStep(workflow, step, agent);
        workflow.results.push(result);
        
        // Update workflow context with result
        workflowContext = { ...workflowContext, ...result };
        
        workflow.progress = ((i + 1) / workflow.steps.length) * 100;
        
        this.logger.debug('Conditional step completed', {
          workflowId: workflow.id,
          step: i,
          agent: agent.id,
          progress: workflow.progress
        });
        
      } catch (error) {
        this.logger.error('Conditional step failed', {
          workflowId: workflow.id,
          step: i,
          error: error.message
        });
        
        await this.handleWorkflowFailure(workflow, error);
        return;
      }
    }
    
    await this.completeWorkflow(workflow);
  }

  evaluateCondition(condition, context) {
    // Simple condition evaluation
    switch (condition) {
      case 'conflict_detected':
        return context.conflictDetected === true;
      case 'high_load':
        return context.systemLoad > 0.8;
      case 'security_threat':
        return context.threatLevel === 'high';
      case 'performance_degraded':
        return context.performanceScore < 0.5;
      default:
        return true; // Default to execute if condition is unknown
    }
  }

  async executeLoop(workflow) {
    this.logger.info('Executing loop workflow', {
      workflowId: workflow.id,
      steps: workflow.steps.length
    });
    
    const maxIterations = workflow.parameters.maxIterations || 10;
    let iteration = 0;
    let continueLoop = true;
    
    while (continueLoop && iteration < maxIterations) {
      this.logger.debug('Starting loop iteration', {
        workflowId: workflow.id,
        iteration
      });
      
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        workflow.currentStep = i;
        
        try {
          const agent = await this.selectAgent(step.agent, workflow);
          if (!agent) {
            throw new Error(`No available agent for: ${step.agent}`);
          }
          
          if (!workflow.assignedAgents.includes(agent.id)) {
            workflow.assignedAgents.push(agent.id);
          }
          
          const result = await this.executeWorkflowStep(workflow, step, agent);
          workflow.results.push({
            iteration,
            step: i,
            result
          });
          
          // Check loop continuation condition
          if (result.continueLoop === false) {
            continueLoop = false;
            break;
          }
          
        } catch (error) {
          this.logger.error('Loop step failed', {
            workflowId: workflow.id,
            iteration,
            step: i,
            error: error.message
          });
          
          await this.handleWorkflowFailure(workflow, error);
          return;
        }
      }
      
      iteration++;
      workflow.progress = Math.min((iteration / maxIterations) * 100, 100);
    }
    
    await this.completeWorkflow(workflow);
  }

  async executeScatterGather(workflow) {
    this.logger.info('Executing scatter-gather workflow', {
      workflowId: workflow.id,
      steps: workflow.steps.length
    });
    
    // Scatter phase - distribute work to multiple agents
    const scatterPromises = [];
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      
      // Create multiple instances of the same step for different agents
      const agentType = step.agent.replace('-agent', '');
      const availableAgents = this.getAgentsByCapability(agentType);
      
      for (const agent of availableAgents.slice(0, 3)) { // Limit to 3 agents per step
        const scatterPromise = (async () => {
          try {
            workflow.assignedAgents.push(agent.id);
            
            const result = await this.executeWorkflowStep(workflow, step, agent);
            return { stepIndex: i, agentId: agent.id, result, success: true };
            
          } catch (error) {
            return { stepIndex: i, agentId: agent.id, error, success: false };
          }
        })();
        
        scatterPromises.push(scatterPromise);
      }
    }
    
    try {
      const scatterResults = await Promise.all(scatterPromises);
      
      // Gather phase - collect and aggregate results
      const gatheredResults = this.gatherResults(scatterResults);
      
      workflow.results = gatheredResults;
      workflow.progress = 100;
      
      await this.completeWorkflow(workflow);
      
    } catch (error) {
      await this.handleWorkflowFailure(workflow, error);
    }
  }

  gatherResults(scatterResults) {
    // Group results by step index
    const resultsByStep = new Map();
    
    for (const result of scatterResults) {
      if (!resultsByStep.has(result.stepIndex)) {
        resultsByStep.set(result.stepIndex, []);
      }
      resultsByStep.get(result.stepIndex).push(result);
    }
    
    // Aggregate results for each step
    const gatheredResults = [];
    
    for (const [stepIndex, stepResults] of resultsByStep.entries()) {
      const successfulResults = stepResults.filter(r => r.success);
      const failedResults = stepResults.filter(r => !r.success);
      
      gatheredResults[stepIndex] = {
        stepIndex,
        totalAttempts: stepResults.length,
        successfulAttempts: successfulResults.length,
        failedAttempts: failedResults.length,
        results: successfulResults.map(r => r.result),
        errors: failedResults.map(r => r.error),
        aggregatedResult: this.aggregateStepResults(successfulResults.map(r => r.result))
      };
    }
    
    return gatheredResults;
  }

  aggregateStepResults(results) {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];
    
    // Simple aggregation - could be more sophisticated based on result type
    const aggregated = {
      count: results.length,
      values: results,
      summary: {
        success: results.every(r => r.success !== false),
        averageScore: results
          .filter(r => typeof r.score === 'number')
          .reduce((sum, r, _, arr) => sum + r.score / arr.length, 0)
      }
    };
    
    return aggregated;
  }

  async selectAgent(agentType, workflow) {
    // Remove '-agent' suffix if present
    const cleanAgentType = agentType.replace('-agent', '');
    
    // Get agents by capability
    const candidates = this.getAgentsByCapability(cleanAgentType);
    
    if (candidates.length === 0) {
      this.logger.warn('No agents found for capability', { capability: cleanAgentType });
      return null;
    }
    
    // Apply load balancing strategy
    const balancer = this.agentLoadBalancer.get(cleanAgentType);
    if (!balancer) {
      // Return first available agent if no load balancer configured
      return candidates[0];
    }
    
    let selectedAgent;
    
    switch (balancer.strategy) {
      case 'round_robin':
        selectedAgent = candidates[balancer.currentIndex % candidates.length];
        balancer.currentIndex = (balancer.currentIndex + 1) % candidates.length;
        break;
        
      case 'least_loaded':
        selectedAgent = candidates.reduce((min, agent) => 
          agent.load < min.load ? agent : min
        );
        break;
        
      case 'best_performance':
        selectedAgent = candidates.reduce((best, agent) => 
          agent.performance.successRate > best.performance.successRate ? agent : best
        );
        break;
        
      case 'random':
        selectedAgent = candidates[Math.floor(Math.random() * candidates.length)];
        break;
        
      default:
        selectedAgent = candidates[0];
    }
    
    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(selectedAgent.id);
    if (circuitBreaker && circuitBreaker.state === 'open') {
      // Try to find alternative agent
      const alternatives = candidates.filter(agent => {
        const cb = this.circuitBreakers.get(agent.id);
        return !cb || cb.state !== 'open';
      });
      
      if (alternatives.length > 0) {
        selectedAgent = alternatives[0];
      } else {
        this.logger.warn('All agents have open circuit breakers', { capability: cleanAgentType });
        return null;
      }
    }
    
    this.metrics.loadBalancingDecisions.inc({
      strategy: balancer.strategy,
      agent_type: cleanAgentType
    });
    
    return selectedAgent;
  }

  getAgentsByCapability(capability) {
    const agents = [];
    
    for (const agent of this.agentRegistry.values()) {
      if (agent.capabilities.includes(capability) && 
          (agent.status === 'healthy' || agent.status === 'degraded')) {
        agents.push(agent);
      }
    }
    
    // Sort by health and performance
    agents.sort((a, b) => {
      const scoreA = a.health * 0.6 + a.performance.successRate * 0.4;
      const scoreB = b.health * 0.6 + b.performance.successRate * 0.4;
      return scoreB - scoreA;
    });
    
    return agents;
  }

  async executeWorkflowStep(workflow, step, agent) {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Executing workflow step', {
        workflowId: workflow.id,
        step: step.action,
        agent: agent.id
      });
      
      // Update agent load
      agent.load = Math.min(agent.load + 0.1, 1.0);
      
      // Create step execution message
      const stepMessage = {
        type: 'workflow_step',
        workflowId: workflow.id,
        stepId: `${workflow.id}_${workflow.currentStep}`,
        action: step.action,
        parameters: {
          ...step.parameters,
          ...workflow.parameters
        },
        timeout: step.timeout || 30000,
        agent: agent.id,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      // Send step execution request
      await this.sqsService.sendMessage('orchestration-commands', stepMessage);
      
      // Wait for step completion (simplified - in real implementation would use callbacks)
      const result = await this.waitForStepCompletion(workflow.id, workflow.currentStep, step.timeout);
      
      const duration = Date.now() - startTime;
      
      // Update agent performance
      agent.performance.responseTime = (agent.performance.responseTime + duration) / 2;
      agent.performance.successRate = (agent.performance.successRate * 0.9) + (0.1);
      agent.load = Math.max(agent.load - 0.1, 0);
      
      // Reset circuit breaker on success
      const circuitBreaker = this.circuitBreakers.get(agent.id);
      if (circuitBreaker) {
        if (circuitBreaker.state === 'half-open') {
          circuitBreaker.state = 'closed';
          circuitBreaker.failureCount = 0;
        }
      }
      
      this.logger.debug('Workflow step completed successfully', {
        workflowId: workflow.id,
        step: step.action,
        agent: agent.id,
        duration
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update agent performance on failure
      agent.performance.responseTime = (agent.performance.responseTime + duration) / 2;
      agent.performance.successRate = (agent.performance.successRate * 0.9);
      agent.load = Math.max(agent.load - 0.1, 0);
      
      // Update circuit breaker
      const circuitBreaker = this.circuitBreakers.get(agent.id);
      if (circuitBreaker) {
        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = Date.now();
        
        if (circuitBreaker.failureCount >= this.orchestrationConfig.circuitBreakerThreshold) {
          circuitBreaker.state = 'open';
          circuitBreaker.nextAttemptTime = Date.now() + 60000; // 1 minute
          
          this.logger.warn('Circuit breaker opened', {
            agentId: agent.id,
            failureCount: circuitBreaker.failureCount
          });
        }
      }
      
      this.logger.error('Workflow step failed', {
        workflowId: workflow.id,
        step: step.action,
        agent: agent.id,
        duration,
        error: error.message
      });
      
      throw error;
    }
  }

  async waitForStepCompletion(workflowId, stepIndex, timeout) {
    // Simplified implementation - in real system would use proper event handling
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Step timeout after ${timeout}ms`));
      }, timeout);
      
      // Simulate step completion
      setTimeout(() => {
        clearTimeout(timeoutId);
        resolve({
          success: true,
          workflowId,
          stepIndex,
          result: 'Step completed successfully',
          timestamp: new Date().toISOString()
        });
      }, Math.random() * 2000 + 1000); // 1-3 seconds
    });
  }

  async completeWorkflow(workflow) {
    const endTime = Date.now();
    const duration = endTime - workflow.startTime;
    
    workflow.status = 'completed';
    workflow.endTime = endTime;
    workflow.duration = duration;
    workflow.progress = 100;
    
    // Move to history
    this.workflowHistory.push({ ...workflow });
    this.activeWorkflows.delete(workflow.id);
    
    // Update statistics
    this.orchestrationStats.successfulWorkflows++;
    this.orchestrationStats.averageWorkflowTime = 
      (this.orchestrationStats.averageWorkflowTime + duration) / 2;
    this.orchestrationStats.lastUpdate = new Date().toISOString();
    
    // Update metrics
    this.metrics.workflowDuration.observe(
      {
        workflow_type: workflow.type,
        strategy: workflow.strategy,
        outcome: 'success'
      },
      duration / 1000
    );
    this.metrics.activeWorkflows.set(this.activeWorkflows.size);
    
    // Send completion notification
    const completionMessage = {
      type: 'workflow_completed',
      workflowId: workflow.id,
      status: 'completed',
      duration,
      results: workflow.results,
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('orchestration-status', completionMessage);
    
    this.logger.info('Workflow completed successfully', {
      workflowId: workflow.id,
      duration,
      steps: workflow.steps.length,
      assignedAgents: workflow.assignedAgents.length
    });
  }

  async handleWorkflowFailure(workflow, error) {
    const endTime = Date.now();
    const duration = endTime - workflow.startTime;
    
    workflow.status = 'failed';
    workflow.endTime = endTime;
    workflow.duration = duration;
    workflow.error = error.message;
    
    // Move to history
    this.workflowHistory.push({ ...workflow });
    this.activeWorkflows.delete(workflow.id);
    
    // Update statistics
    this.orchestrationStats.failedWorkflows++;
    this.orchestrationStats.lastUpdate = new Date().toISOString();
    
    // Update metrics
    this.metrics.workflowDuration.observe(
      {
        workflow_type: workflow.type,
        strategy: workflow.strategy,
        outcome: 'failure'
      },
      duration / 1000
    );
    this.metrics.activeWorkflows.set(this.activeWorkflows.size);
    
    // Check if retry is possible
    if (workflow.retryCount < this.orchestrationConfig.retryAttempts) {
      workflow.retryCount = (workflow.retryCount || 0) + 1;
      
      this.logger.info('Retrying failed workflow', {
        workflowId: workflow.id,
        retryCount: workflow.retryCount,
        error: error.message
      });
      
      // Schedule retry
      setTimeout(async () => {
        try {
          await this.retryWorkflow(workflow);
        } catch (retryError) {
          this.logger.error('Workflow retry failed', {
            workflowId: workflow.id,
            error: retryError.message
          });
        }
      }, this.orchestrationConfig.retryDelay);
      
    } else {
      // Send failure notification
      const failureMessage = {
        type: 'workflow_failed',
        workflowId: workflow.id,
        status: 'failed',
        error: error.message,
        duration,
        retryCount: workflow.retryCount || 0,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('orchestration-status', failureMessage);
      
      this.logger.error('Workflow failed permanently', {
        workflowId: workflow.id,
        error: error.message,
        duration,
        retryCount: workflow.retryCount || 0
      });
    }
  }

  async retryWorkflow(workflow) {
    // Reset workflow state for retry
    workflow.status = 'running';
    workflow.progress = 0;
    workflow.currentStep = 0;
    workflow.startTime = Date.now();
    workflow.results = [];
    workflow.assignedAgents = [];
    delete workflow.endTime;
    delete workflow.error;
    
    // Add back to active workflows
    this.activeWorkflows.set(workflow.id, workflow);
    
    // Execute with same strategy
    const strategy = this.executionStrategies[workflow.strategy];
    if (strategy) {
      await strategy(workflow);
    } else {
      throw new Error(`Unknown execution strategy: ${workflow.strategy}`);
    }
  }

  async handleWorkflowTimeout(workflowId, workflow) {
    const error = new Error('Workflow execution timeout');
    await this.handleWorkflowFailure(workflow, error);
  }

  async optimizeSystem(request) {
    const optimizationId = `optimization_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.logger.info('Starting system optimization', {
        optimizationId,
        target: request.target,
        parameters: request.parameters
      });
      
      switch (request.target) {
        case 'performance':
          await this.optimizePerformance(request.parameters);
          break;
          
        case 'load_balancing':
          await this.optimizeLoadBalancing();
          break;
          
        case 'resource_utilization':
          await this.optimizeResourceUtilization(request.parameters);
          break;
          
        case 'workflow_efficiency':
          await this.optimizeWorkflowEfficiency(request.parameters);
          break;
          
        default:
          throw new Error(`Unknown optimization target: ${request.target}`);
      }
      
      // Send optimization result
      const optimizationMessage = {
        type: 'system_optimization_completed',
        optimizationId,
        target: request.target,
        status: 'completed',
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      await this.sqsService.sendMessage('system-optimizations', optimizationMessage);
      
      this.orchestrationStats.systemOptimizations++;
      
      return optimizationId;
      
    } catch (error) {
      this.logger.error('System optimization failed:', error);
      throw error;
    }
  }

  async optimizePerformance(parameters) {
    // Analyze current performance
    const currentMetrics = this.performanceMetrics;
    
    // Identify bottlenecks
    const bottlenecks = [];
    
    if (currentMetrics.averageResponseTime > 5000) {
      bottlenecks.push('high_response_time');
    }
    
    if (currentMetrics.errorRate > 0.1) {
      bottlenecks.push('high_error_rate');
    }
    
    if (currentMetrics.systemThroughput < 10) {
      bottlenecks.push('low_throughput');
    }
    
    // Apply optimizations
    for (const bottleneck of bottlenecks) {
      await this.applyPerformanceOptimization(bottleneck, parameters);
    }
    
    this.logger.info('Performance optimization completed', {
      bottlenecks,
      optimizations: bottlenecks.length
    });
  }

  async applyPerformanceOptimization(bottleneck, parameters) {
    switch (bottleneck) {
      case 'high_response_time':
        // Increase timeout thresholds
        this.orchestrationConfig.maxWorkflowTime *= 1.2;
        break;
        
      case 'high_error_rate':
        // Increase retry attempts
        this.orchestrationConfig.retryAttempts = Math.min(
          this.orchestrationConfig.retryAttempts + 1,
          5
        );
        break;
        
      case 'low_throughput':
        // Increase concurrent workflows
        this.orchestrationConfig.maxConcurrentWorkflows = Math.min(
          this.orchestrationConfig.maxConcurrentWorkflows * 1.2,
          100
        );
        break;
    }
  }

  async optimizeResourceUtilization(parameters) {
    // Analyze resource usage across agents
    const resourceUsage = new Map();
    
    for (const [agentId, agent] of this.agentRegistry.entries()) {
      resourceUsage.set(agentId, {
        load: agent.load,
        health: agent.health,
        utilization: agent.load * agent.health
      });
    }
    
    // Redistribute load if needed
    const overloadedAgents = Array.from(resourceUsage.entries())
      .filter(([_, usage]) => usage.load > 0.8)
      .map(([agentId]) => agentId);
    
    const underutilizedAgents = Array.from(resourceUsage.entries())
      .filter(([_, usage]) => usage.load < 0.3 && usage.health > 0.7)
      .map(([agentId]) => agentId);
    
    if (overloadedAgents.length > 0 && underutilizedAgents.length > 0) {
      await this.redistributeLoad(overloadedAgents, underutilizedAgents);
    }
    
    this.logger.info('Resource utilization optimization completed', {
      overloadedAgents: overloadedAgents.length,
      underutilizedAgents: underutilizedAgents.length
    });
  }

  async redistributeLoad(overloadedAgents, underutilizedAgents) {
    // Send load redistribution commands
    const redistributionMessage = {
      type: 'load_redistribution',
      overloadedAgents,
      underutilizedAgents,
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('load-balancing-decisions', redistributionMessage);
    
    this.logger.info('Load redistribution initiated', {
      overloadedCount: overloadedAgents.length,
      underutilizedCount: underutilizedAgents.length
    });
  }

  async optimizeWorkflowEfficiency(parameters) {
    // Analyze workflow performance patterns
    const recentWorkflows = this.workflowHistory
      .filter(w => Date.now() - w.endTime < 3600000); // Last hour
    
    const efficiencyMetrics = new Map();
    
    for (const workflow of recentWorkflows) {
      const key = `${workflow.templateId}_${workflow.strategy}`;
      
      if (!efficiencyMetrics.has(key)) {
        efficiencyMetrics.set(key, {
          count: 0,
          totalDuration: 0,
          successCount: 0,
          averageDuration: 0,
          successRate: 0
        });
      }
      
      const metrics = efficiencyMetrics.get(key);
      metrics.count++;
      metrics.totalDuration += workflow.duration;
      
      if (workflow.status === 'completed') {
        metrics.successCount++;
      }
      
      metrics.averageDuration = metrics.totalDuration / metrics.count;
      metrics.successRate = metrics.successCount / metrics.count;
    }
    
    // Identify inefficient workflows
    const inefficientWorkflows = Array.from(efficiencyMetrics.entries())
      .filter(([_, metrics]) => metrics.successRate < 0.8 || metrics.averageDuration > 60000)
      .map(([key]) => key);
    
    // Optimize inefficient workflows
    for (const workflowKey of inefficientWorkflows) {
      await this.optimizeWorkflowTemplate(workflowKey, efficiencyMetrics.get(workflowKey));
    }
    
    this.logger.info('Workflow efficiency optimization completed', {
      analyzedWorkflows: recentWorkflows.length,
      inefficientWorkflows: inefficientWorkflows.length
    });
  }

  async optimizeWorkflowTemplate(workflowKey, metrics) {
    const [templateId] = workflowKey.split('_');
    const template = this.workflowTemplates.get(templateId);
    
    if (!template) return;
    
    // Adjust template based on metrics
    if (metrics.successRate < 0.8) {
      // Increase timeouts and retry attempts
      template.steps.forEach(step => {
        step.timeout = Math.min(step.timeout * 1.3, 60000);
      });
      
      template.estimatedDuration *= 1.2;
    }
    
    if (metrics.averageDuration > 60000) {
      // Try to parallelize some steps
      if (template.strategy === 'sequential' && template.steps.length > 2) {
        template.strategy = 'pipeline';
      }
    }
    
    this.logger.info('Optimized workflow template', {
      templateId,
      adjustments: 'timeout_and_strategy_optimization'
    });
  }

  async registerAgent(request) {
    const { agentId, type, capabilities, endpoint } = request;
    
    this.logger.info('Registering agent', {
      agentId,
      type,
      capabilities,
      endpoint
    });
    
    // Update or create agent registry entry
    const existingAgent = this.agentRegistry.get(agentId);
    
    const agent = {
      id: agentId,
      type,
      capabilities: capabilities || [],
      endpoint,
      status: 'healthy',
      health: 1.0,
      load: 0,
      performance: {
        responseTime: 0,
        successRate: 1.0,
        throughput: 0
      },
      lastSeen: Date.now(),
      registrationTime: existingAgent ? existingAgent.registrationTime : Date.now()
    };
    
    this.agentRegistry.set(agentId, agent);
    
    // Update load balancer
    if (!this.agentLoadBalancer.has(type)) {
      this.agentLoadBalancer.set(type, {
        agents: [],
        currentIndex: 0,
        strategy: this.orchestrationConfig.loadBalancingStrategy
      });
    }
    
    const balancer = this.agentLoadBalancer.get(type);
    if (!balancer.agents.includes(agentId)) {
      balancer.agents.push(agentId);
    }
    
    // Initialize circuit breaker if not exists
    if (!this.circuitBreakers.has(agentId)) {
      this.circuitBreakers.set(agentId, {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: null,
        nextAttemptTime: null
      });
    }
    
    // Update system state
    this.systemState.totalAgents = this.agentRegistry.size;
    
    // Send registration confirmation
    const confirmationMessage = {
      type: 'agent_registration_confirmed',
      agentId,
      status: 'registered',
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('orchestration-status', confirmationMessage);
    
    this.logger.info('Agent registered successfully', {
      agentId,
      totalAgents: this.systemState.totalAgents
    });
  }

  async startMessageProcessing() {
    this.logger.info('Starting message processing', {
      inputQueues: this.inputQueues.length,
      outputQueues: this.outputQueues.length
    });
    
    // Start processing each input queue
    for (const queueName of this.inputQueues) {
      this.sqsService.startMessageProcessing(
        queueName,
        (message) => this.handleIncomingMessage(queueName, message),
        {
          maxMessages: 10,
          waitTimeSeconds: 20,
          visibilityTimeoutSeconds: 300
        }
      );
    }
  }

  async handleIncomingMessage(queueName, message) {
    try {
      this.logger.debug('Processing message', {
        queue: queueName,
        messageType: message.type,
        source: message.source
      });
      
      switch (queueName) {
        case 'orchestration-requests':
          await this.handleOrchestrationRequest(message);
          break;
          
        case 'workflow-definitions':
          await this.handleWorkflowDefinition(message);
          break;
          
        case 'agent-registrations':
          await this.handleAgentRegistration(message);
          break;
          
        case 'system-events':
          await this.handleSystemEvent(message);
          break;
          
        case 'performance-reports':
          await this.handlePerformanceReport(message);
          break;
          
        default:
          this.logger.warn('Unknown queue', { queueName });
      }
      
    } catch (error) {
      this.logger.error('Message processing error:', {
        queue: queueName,
        error: error.message,
        message
      });
    }
  }

  async handleOrchestrationRequest(message) {
    switch (message.type) {
      case 'execute_workflow':
        await this.executeWorkflow({
          templateId: message.templateId,
          parameters: message.parameters || {},
          priority: message.priority || 'medium',
          strategy: message.strategy || 'sequential',
          requestedBy: message.source,
          timestamp: message.timestamp
        });
        break;
        
      case 'optimize_system':
        await this.optimizeSystem({
          target: message.target || 'performance',
          parameters: message.parameters || {},
          requestedBy: message.source,
          timestamp: message.timestamp
        });
        break;
        
      case 'get_system_status':
        await this.sendSystemStatus(message.source);
        break;
        
      default:
        this.logger.warn('Unknown orchestration request', { type: message.type });
    }
  }

  async handleWorkflowDefinition(message) {
    if (message.type === 'register_workflow_template') {
      const template = {
        id: message.templateId,
        name: message.name,
        description: message.description,
        strategy: message.strategy || 'sequential',
        estimatedDuration: message.estimatedDuration || 30000,
        requiredCapabilities: message.requiredCapabilities || [],
        steps: message.steps || []
      };
      
      this.workflowTemplates.set(template.id, template);
      
      this.logger.info('Workflow template registered', {
        templateId: template.id,
        name: template.name,
        steps: template.steps.length
      });
    }
  }

  async handleAgentRegistration(message) {
    if (message.type === 'register_agent') {
      await this.registerAgent({
        agentId: message.agentId,
        type: message.agentType,
        capabilities: message.capabilities,
        endpoint: message.endpoint,
        timestamp: message.timestamp
      });
    }
  }

  async handleSystemEvent(message) {
    switch (message.type) {
      case 'agent_health_update':
        await this.updateAgentHealth(message.agentId, message.health);
        break;
        
      case 'system_alert':
        await this.handleSystemAlert(message);
        break;
        
      case 'emergency_shutdown':
        await this.handleEmergencyShutdown(message);
        break;
        
      default:
        this.logger.debug('System event received', { type: message.type });
    }
  }

  async handlePerformanceReport(message) {
    if (message.type === 'agent_performance_report') {
      const agent = this.agentRegistry.get(message.agentId);
      if (agent) {
        agent.performance = {
          responseTime: message.responseTime || agent.performance.responseTime,
          successRate: message.successRate || agent.performance.successRate,
          throughput: message.throughput || agent.performance.throughput
        };
        
        agent.load = message.load || agent.load;
        agent.lastSeen = Date.now();
        
        this.logger.debug('Updated agent performance', {
          agentId: message.agentId,
          performance: agent.performance
        });
      }
    }
  }

  async updateAgentHealth(agentId, health) {
    const agent = this.agentRegistry.get(agentId);
    if (agent) {
      agent.health = health;
      agent.lastSeen = Date.now();
      
      // Update status based on health
      if (health > 0.7) {
        agent.status = 'healthy';
      } else if (health > 0.3) {
        agent.status = 'degraded';
      } else {
        agent.status = 'unhealthy';
      }
      
      this.logger.debug('Updated agent health', {
        agentId,
        health,
        status: agent.status
      });
    }
  }

  async handleSystemAlert(message) {
    this.logger.warn('System alert received', {
      alertType: message.alertType,
      severity: message.severity,
      description: message.description,
      source: message.source
    });
    
    // Handle different alert types
    switch (message.alertType) {
      case 'high_load':
        await this.handleHighLoadAlert(message);
        break;
        
      case 'agent_failure':
        await this.handleAgentFailureAlert(message);
        break;
        
      case 'security_threat':
        await this.handleSecurityThreatAlert(message);
        break;
        
      default:
        this.logger.info('Generic alert handled', { alertType: message.alertType });
    }
  }

  async handleHighLoadAlert(message) {
    // Trigger load balancing optimization
    await this.optimizeSystem({
      target: 'load_balancing',
      parameters: { urgency: 'high' },
      requestedBy: 'system_alert',
      timestamp: new Date().toISOString()
    });
  }

  async handleAgentFailureAlert(message) {
    const agentId = message.agentId;
    
    // Mark agent as failed
    const agent = this.agentRegistry.get(agentId);
    if (agent) {
      agent.status = 'failed';
      agent.health = 0;
      
      // Open circuit breaker
      const circuitBreaker = this.circuitBreakers.get(agentId);
      if (circuitBreaker) {
        circuitBreaker.state = 'open';
        circuitBreaker.failureCount = this.orchestrationConfig.circuitBreakerThreshold;
        circuitBreaker.lastFailureTime = Date.now();
        circuitBreaker.nextAttemptTime = Date.now() + 300000; // 5 minutes
      }
      
      this.logger.error('Agent failure handled', {
        agentId,
        circuitBreakerState: 'open'
      });
    }
  }

  async handleSecurityThreatAlert(message) {
    // Execute emergency response workflow
    await this.executeWorkflow({
      templateId: 'emergency_response',
      parameters: {
        threatLevel: message.threatLevel,
        threatType: message.threatType,
        affectedSystems: message.affectedSystems
      },
      priority: 'critical',
      strategy: 'scatter_gather',
      requestedBy: 'security_alert',
      timestamp: new Date().toISOString()
    });
  }

  async handleEmergencyShutdown(message) {
    this.logger.error('Emergency shutdown initiated', {
      reason: message.reason,
      source: message.source
    });
    
    // Stop accepting new workflows
    this.orchestrationConfig.maxConcurrentWorkflows = 0;
    
    // Cancel active workflows
    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      await this.handleWorkflowFailure(workflow, new Error('Emergency shutdown'));
    }
    
    // Initiate graceful shutdown
    setTimeout(() => {
      process.exit(1);
    }, 30000); // 30 seconds to complete shutdown
  }

  async sendSystemStatus(requestSource) {
    const statusMessage = {
      type: 'system_status_response',
      requestSource,
      system: this.systemState,
      performance: this.performanceMetrics,
      statistics: this.orchestrationStats,
      activeWorkflows: this.activeWorkflows.size,
      agentRegistry: this.getAgentRegistrySummary(),
      timestamp: new Date().toISOString(),
      source: this.agentId
    };
    
    await this.sqsService.sendMessage('orchestration-status', statusMessage);
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) {
        this.logger.warn('Shutdown already in progress');
        return;
      }
      
      this.isShuttingDown = true;
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        // Stop accepting new workflows
        this.orchestrationConfig.maxConcurrentWorkflows = 0;
        
        // Wait for active workflows to complete (with timeout)
        const shutdownTimeout = 60000; // 1 minute
        const startTime = Date.now();
        
        while (this.activeWorkflows.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
          this.logger.info(`Waiting for ${this.activeWorkflows.size} workflows to complete`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        // Force stop remaining workflows
        if (this.activeWorkflows.size > 0) {
          this.logger.warn(`Force stopping ${this.activeWorkflows.size} remaining workflows`);
          for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
            await this.handleWorkflowFailure(workflow, new Error('System shutdown'));
          }
        }
        
        // Stop SQS message processing
        await this.sqsService.stopMessageProcessing();
        
        // Close HTTP server
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
        }
        
        this.logger.info('Graceful shutdown completed');
        process.exit(0);
        
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection:', { reason, promise });
      gracefulShutdown('unhandledRejection');
    });
  }

  async start() {
    try {
      const port = process.env.PORT || 3010;
      
      this.server = this.app.listen(port, () => {
        this.logger.info(`Orchestrator Agent started on port ${port}`, {
          agentId: this.agentId,
          environment: process.env.NODE_ENV || 'development',
          pid: process.pid,
          systemState: this.systemState
        });
      });
      
      // Start SQS message processing
      await this.startMessageProcessing();
      
      // Update system status
      this.systemState.status = 'running';
      
      this.logger.info('Orchestrator Agent fully initialized', {
        totalAgents: this.systemState.totalAgents,
        workflowTemplates: this.workflowTemplates.size,
        inputQueues: this.inputQueues.length,
        outputQueues: this.outputQueues.length
      });
      
    } catch (error) {
      this.logger.error('Failed to start Orchestrator Agent:', error);
      process.exit(1);
    }
  }
}

// Create and start the agent
const orchestratorAgent = new OrchestratorAgent();
orchestratorAgent.start();

module.exports = OrchestratorAgent;