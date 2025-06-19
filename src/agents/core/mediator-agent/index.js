/**
 * Mediator Agent - Agente de Mediação e Resolução de Conflitos
 * Fase 2: Coordenação e mediação entre agentes
 * 
 * Responsabilidades:
 * - Mediar conflitos entre agentes
 * - Coordenar negociações
 * - Implementar estratégias de consenso
 * - Gerenciar prioridades e recursos
 * - Monitorar relacionamentos entre agentes
 * - Implementar padrões de comunicação
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const MediationService = require('./services/mediationService');
const ConflictResolver = require('./services/conflictResolver');
const NegotiationEngine = require('./services/negotiationEngine');
const ConsensusManager = require('./services/consensusManager');
const config = require('../config');

class MediatorAgent {
  constructor() {
    this.agentId = 'mediator-agent';
    this.logger = this.setupLogger();
    this.app = express();
    this.server = null;
    this.sqsService = new SQSService();
    this.metrics = this.setupMetrics();
    this.isShuttingDown = false;
    
    // Serviços de mediação
    this.mediationService = new MediationService(this.logger);
    this.conflictResolver = new ConflictResolver(this.logger);
    this.negotiationEngine = new NegotiationEngine(this.logger);
    this.consensusManager = new ConsensusManager(this.logger);
    
    // Configurações de mediação
    this.mediationConfig = {
      maxMediationTime: 30000, // 30 segundos
      maxRetries: 3,
      consensusThreshold: 0.7,
      maxNegotiationRounds: 5,
      cooldownPeriod: 5000, // 5 segundos
      priorityWeights: {
        urgency: 0.4,
        importance: 0.3,
        resources: 0.2,
        dependencies: 0.1
      }
    };
    
    // Estado de mediações ativas
    this.activeMediations = new Map();
    this.mediationHistory = [];
    this.agentRelationships = new Map();
    this.conflictPatterns = new Map();
    
    // Estratégias de mediação
    this.mediationStrategies = {
      collaborative: 'maximize_joint_benefit',
      competitive: 'maximize_own_benefit',
      accommodating: 'minimize_conflict',
      avoiding: 'delay_decision',
      compromising: 'split_difference'
    };
    
    // Padrões de comunicação
    this.communicationPatterns = {
      direct: 'agent_to_agent',
      broadcast: 'one_to_many',
      relay: 'through_mediator',
      multicast: 'selective_broadcast'
    };
    
    // Estatísticas de mediação
    this.mediationStats = {
      totalMediations: 0,
      successfulMediations: 0,
      failedMediations: 0,
      averageMediationTime: 0,
      conflictTypes: new Map(),
      resolutionStrategies: new Map()
    };
    
    // Filas SQS
    this.inputQueue = 'mediator-input';
    this.outputQueue = 'mediator-output';
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
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
      mediationsTotal: new promClient.Counter({
        name: 'mediator_mediations_total',
        help: 'Total number of mediations handled',
        labelNames: ['type', 'status', 'strategy'],
        registers: [register]
      }),
      
      mediationDuration: new promClient.Histogram({
        name: 'mediator_mediation_duration_seconds',
        help: 'Time spent on mediations',
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
        registers: [register]
      }),
      
      conflictsResolved: new promClient.Counter({
        name: 'mediator_conflicts_resolved_total',
        help: 'Total number of conflicts resolved',
        labelNames: ['conflict_type', 'resolution_strategy'],
        registers: [register]
      }),
      
      negotiationRounds: new promClient.Histogram({
        name: 'mediator_negotiation_rounds',
        help: 'Number of negotiation rounds per mediation',
        buckets: [1, 2, 3, 4, 5, 10, 15, 20],
        registers: [register]
      }),
      
      consensusAchieved: new promClient.Counter({
        name: 'mediator_consensus_achieved_total',
        help: 'Total number of consensus achievements',
        labelNames: ['consensus_type'],
        registers: [register]
      }),
      
      agentRelationshipScore: new promClient.Gauge({
        name: 'mediator_agent_relationship_score',
        help: 'Relationship score between agents',
        labelNames: ['agent_a', 'agent_b'],
        registers: [register]
      })
    };
    
    return { register, ...metrics };
  }
  
  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: config.security?.corsOrigins || ['http://localhost:3000'],
      credentials: true
    }));
    
    // Rate limiting
    this.app.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 1000, // máximo 1000 requests por janela
      message: 'Too many requests from this IP'
    }));
    
    // Compressão
    this.app.use(compression());
    
    // Parse JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Logging de requests
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });
      next();
    });
  }
  
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ status: 'shutting_down' });
      }
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        agent: this.agentId,
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeMediations: this.activeMediations.size,
        sqsConnected: this.sqsService?.isConnected() || false
      };
      
      res.json(health);
    });
    
    // Métricas Prometheus
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', promClient.register.contentType);
        res.end(await this.metrics.register.metrics());
      } catch (error) {
        this.logger.error('Error generating metrics', { error: error.message });
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });
    
    // Endpoint para iniciar mediação
    this.app.post('/mediate', async (req, res) => {
      try {
        const { conflict, agents, priority, strategy } = req.body;
        
        if (!conflict || !agents || agents.length < 2) {
          return res.status(400).json({
            error: 'Conflict and at least 2 agents are required'
          });
        }
        
        const mediationId = await this.startMediation({
          conflict,
          agents,
          priority: priority || 'normal',
          strategy: strategy || 'collaborative'
        });
        
        res.json({
          success: true,
          mediationId,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Error starting mediation', {
          error: error.message,
          request: req.body
        });
        
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Status de mediação específica
    this.app.get('/mediations/:mediationId', (req, res) => {
      const { mediationId } = req.params;
      const mediation = this.activeMediations.get(mediationId);
      
      if (!mediation) {
        return res.status(404).json({
          error: 'Mediation not found',
          mediationId
        });
      }
      
      res.json({
        mediationId,
        status: mediation.status,
        progress: mediation.progress,
        strategy: mediation.strategy,
        participants: mediation.agents,
        currentRound: mediation.currentRound,
        createdAt: mediation.createdAt,
        updatedAt: mediation.updatedAt
      });
    });
    
    // Listar mediações ativas
    this.app.get('/mediations', (req, res) => {
      const mediations = Array.from(this.activeMediations.entries()).map(([id, mediation]) => ({
        mediationId: id,
        status: mediation.status,
        strategy: mediation.strategy,
        participants: mediation.agents.length,
        createdAt: mediation.createdAt
      }));
      
      res.json({
        mediations,
        total: mediations.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Estatísticas de mediação
    this.app.get('/stats', (req, res) => {
      res.json({
        agent: this.agentId,
        stats: this.mediationStats,
        activeMediations: this.activeMediations.size,
        agentRelationships: this.agentRelationships.size,
        conflictPatterns: this.conflictPatterns.size,
        timestamp: new Date().toISOString()
      });
    });
    
    // Relacionamentos entre agentes
    this.app.get('/relationships', (req, res) => {
      const relationships = Array.from(this.agentRelationships.entries()).map(([key, relationship]) => ({
        agents: key.split('-'),
        score: relationship.score,
        interactions: relationship.interactions,
        lastInteraction: relationship.lastInteraction,
        conflictHistory: relationship.conflictHistory.length
      }));
      
      res.json({
        relationships,
        total: relationships.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Padrões de conflito
    this.app.get('/conflict-patterns', (req, res) => {
      const patterns = Array.from(this.conflictPatterns.entries()).map(([type, pattern]) => ({
        type,
        frequency: pattern.frequency,
        averageResolutionTime: pattern.averageResolutionTime,
        successRate: pattern.successRate,
        commonStrategies: pattern.commonStrategies
      }));
      
      res.json({
        patterns,
        total: patterns.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Importar e configurar rotas da API
    const setupMediatorRoutes = require('./routes/mediatorRoutes');
    const mediatorRoutes = setupMediatorRoutes({
      mediationService: this.mediationService,
      conflictResolutionService: this.conflictResolutionService,
      negotiationService: this.negotiationService,
      consensusService: this.consensusService
    }, this.logger, this.metrics);
    
    this.app.use('/api/v1', mediatorRoutes);
    
    // Rota de informações da API
    this.app.get('/api/v1/info', (req, res) => {
      res.json({
        message: 'Mediator Agent API',
        version: '1.0.0',
        status: 'active',
        capabilities: {
          mediation: 'Conflict mediation and resolution coordination',
          negotiation: 'Multi-party negotiation facilitation',
          consensus: 'Distributed consensus algorithms',
          conflict_resolution: 'Automated conflict detection and resolution'
        },
        endpoints: {
          mediations: '/api/v1/mediations',
          conflicts: '/api/v1/conflicts',
          negotiations: '/api/v1/negotiations',
          consensus: '/api/v1/consensus',
          stats: '/api/v1/stats',
          relationships: '/api/v1/relationships',
          algorithms: '/api/v1/algorithms'
        },
        algorithms: {
          mediation: ['resource_conflict', 'priority_conflict', 'dependency_conflict', 'communication_conflict'],
          consensus: ['pbft', 'raft', 'paxos', 'simple_voting', 'weighted_consensus', 'gradual_consensus'],
          negotiation: ['english_auction', 'bilateral', 'multilateral', 'argumentation_based', 'utility_based'],
          conflict_resolution: ['resource_pooling', 'time_slicing', 'priority_inheritance', 'dependency_breaking']
        }
      });
    });
  }
  
  /**
   * Iniciar uma nova mediação
   */
  async startMediation(request) {
    const mediationId = this.generateMediationId();
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting mediation', {
        mediationId,
        conflict: request.conflict,
        agents: request.agents,
        strategy: request.strategy
      });
      
      const mediation = {
        id: mediationId,
        conflict: request.conflict,
        agents: request.agents,
        strategy: request.strategy,
        priority: request.priority,
        status: 'active',
        progress: 0,
        currentRound: 1,
        maxRounds: this.mediationConfig.maxNegotiationRounds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startTime,
        proposals: [],
        decisions: [],
        consensusLevel: 0
      };
      
      this.activeMediations.set(mediationId, mediation);
      
      // Iniciar processo de mediação
      this.processMediation(mediationId);
      
      // Atualizar métricas
      this.metrics.mediationsTotal
        .labels(request.conflict.type || 'unknown', 'started', request.strategy)
        .inc();
      
      return mediationId;
      
    } catch (error) {
      this.logger.error('Error starting mediation', {
        error: error.message,
        mediationId,
        request
      });
      throw error;
    }
  }
  
  /**
   * Processar mediação
   */
  async processMediation(mediationId) {
    const mediation = this.activeMediations.get(mediationId);
    if (!mediation) {
      this.logger.error('Mediation not found', { mediationId });
      return;
    }
    
    try {
      this.logger.info('Processing mediation', {
        mediationId,
        round: mediation.currentRound,
        strategy: mediation.strategy
      });
      
      // Executar estratégia de mediação
      const result = await this.executeMediation(mediation);
      
      if (result.resolved) {
        await this.completeMediation(mediationId, result);
      } else if (mediation.currentRound >= mediation.maxRounds) {
        await this.failMediation(mediationId, 'Max rounds reached');
      } else {
        // Continuar para próxima rodada
        mediation.currentRound++;
        mediation.updatedAt = new Date().toISOString();
        this.activeMediations.set(mediationId, mediation);
        
        // Aguardar cooldown antes da próxima rodada
        setTimeout(() => {
          this.processMediation(mediationId);
        }, this.mediationConfig.cooldownPeriod);
      }
      
    } catch (error) {
      this.logger.error('Error processing mediation', {
        error: error.message,
        mediationId
      });
      
      await this.failMediation(mediationId, error.message);
    }
  }
  
  /**
   * Executar mediação baseada na estratégia
   */
  async executeMediation(mediation) {
    const { strategy, conflict, agents } = mediation;
    
    switch (strategy) {
      case 'collaborative':
        return await this.collaborativeMediation(mediation);
      case 'competitive':
        return await this.competitiveMediation(mediation);
      case 'accommodating':
        return await this.accommodatingMediation(mediation);
      case 'avoiding':
        return await this.avoidingMediation(mediation);
      case 'compromising':
        return await this.compromisingMediation(mediation);
      default:
        return await this.collaborativeMediation(mediation);
    }
  }
  
  /**
   * Mediação colaborativa
   */
  async collaborativeMediation(mediation) {
    this.logger.info('Executing collaborative mediation', {
      mediationId: mediation.id
    });
    
    // Coletar propostas de todos os agentes
    const proposals = await this.collectProposals(mediation);
    
    // Encontrar solução que maximize benefício conjunto
    const solution = await this.findOptimalSolution(proposals, 'maximize_joint');
    
    // Verificar consenso
    const consensus = await this.checkConsensus(mediation, solution);
    
    return {
      resolved: consensus.achieved,
      solution,
      consensusLevel: consensus.level,
      strategy: 'collaborative'
    };
  }
  
  /**
   * Mediação competitiva
   */
  async competitiveMediation(mediation) {
    this.logger.info('Executing competitive mediation', {
      mediationId: mediation.id
    });
    
    // Implementar lógica de mediação competitiva
    // Por agora, retorna resultado básico
    return {
      resolved: false,
      solution: null,
      consensusLevel: 0,
      strategy: 'competitive'
    };
  }
  
  /**
   * Mediação acomodativa
   */
  async accommodatingMediation(mediation) {
    this.logger.info('Executing accommodating mediation', {
      mediationId: mediation.id
    });
    
    // Implementar lógica de mediação acomodativa
    return {
      resolved: true,
      solution: { type: 'accommodation' },
      consensusLevel: 0.6,
      strategy: 'accommodating'
    };
  }
  
  /**
   * Mediação evitativa
   */
  async avoidingMediation(mediation) {
    this.logger.info('Executing avoiding mediation', {
      mediationId: mediation.id
    });
    
    // Implementar lógica de mediação evitativa
    return {
      resolved: false,
      solution: { type: 'delay' },
      consensusLevel: 0,
      strategy: 'avoiding'
    };
  }
  
  /**
   * Mediação de compromisso
   */
  async compromisingMediation(mediation) {
    this.logger.info('Executing compromising mediation', {
      mediationId: mediation.id
    });
    
    // Implementar lógica de mediação de compromisso
    return {
      resolved: true,
      solution: { type: 'compromise' },
      consensusLevel: 0.7,
      strategy: 'compromising'
    };
  }
  
  /**
   * Coletar propostas dos agentes
   */
  async collectProposals(mediation) {
    const proposals = [];
    
    for (const agent of mediation.agents) {
      try {
        // Simular coleta de proposta do agente
        const proposal = {
          agent,
          proposal: `Proposal from ${agent}`,
          priority: Math.random(),
          timestamp: new Date().toISOString()
        };
        
        proposals.push(proposal);
        
      } catch (error) {
        this.logger.error('Error collecting proposal', {
          error: error.message,
          agent,
          mediationId: mediation.id
        });
      }
    }
    
    return proposals;
  }
  
  /**
   * Encontrar solução ótima
   */
  async findOptimalSolution(proposals, strategy) {
    // Implementar algoritmo de otimização baseado na estratégia
    return {
      type: 'optimal',
      proposals: proposals.length,
      strategy,
      score: Math.random()
    };
  }
  
  /**
   * Verificar consenso
   */
  async checkConsensus(mediation, solution) {
    const consensusLevel = Math.random();
    const achieved = consensusLevel >= this.mediationConfig.consensusThreshold;
    
    return {
      achieved,
      level: consensusLevel,
      threshold: this.mediationConfig.consensusThreshold
    };
  }
  
  /**
   * Completar mediação com sucesso
   */
  async completeMediation(mediationId, result) {
    const mediation = this.activeMediations.get(mediationId);
    if (!mediation) return;
    
    const duration = (Date.now() - mediation.startTime) / 1000;
    
    mediation.status = 'completed';
    mediation.result = result;
    mediation.completedAt = new Date().toISOString();
    mediation.duration = duration;
    
    // Mover para histórico
    this.mediationHistory.push(mediation);
    this.activeMediations.delete(mediationId);
    
    // Atualizar estatísticas
    this.mediationStats.totalMediations++;
    this.mediationStats.successfulMediations++;
    this.updateAverageTime(duration);
    
    // Atualizar métricas
    this.metrics.mediationsTotal
      .labels(mediation.conflict.type || 'unknown', 'completed', mediation.strategy)
      .inc();
    
    this.metrics.mediationDuration
      .observe(duration);
    
    this.metrics.conflictsResolved
      .labels(mediation.conflict.type || 'unknown', result.strategy)
      .inc();
    
    this.logger.info('Mediation completed successfully', {
      mediationId,
      duration,
      strategy: mediation.strategy,
      consensusLevel: result.consensusLevel
    });
  }
  
  /**
   * Falhar mediação
   */
  async failMediation(mediationId, reason) {
    const mediation = this.activeMediations.get(mediationId);
    if (!mediation) return;
    
    const duration = (Date.now() - mediation.startTime) / 1000;
    
    mediation.status = 'failed';
    mediation.failureReason = reason;
    mediation.failedAt = new Date().toISOString();
    mediation.duration = duration;
    
    // Mover para histórico
    this.mediationHistory.push(mediation);
    this.activeMediations.delete(mediationId);
    
    // Atualizar estatísticas
    this.mediationStats.totalMediations++;
    this.mediationStats.failedMediations++;
    this.updateAverageTime(duration);
    
    // Atualizar métricas
    this.metrics.mediationsTotal
      .labels(mediation.conflict.type || 'unknown', 'failed', mediation.strategy)
      .inc();
    
    this.logger.warn('Mediation failed', {
      mediationId,
      reason,
      duration,
      strategy: mediation.strategy
    });
  }
  
  /**
   * Atualizar tempo médio de mediação
   */
  updateAverageTime(duration) {
    const total = this.mediationStats.totalMediations;
    const current = this.mediationStats.averageMediationTime;
    
    this.mediationStats.averageMediationTime = 
      ((current * (total - 1)) + duration) / total;
  }
  
  /**
   * Gerar ID único para mediação
   */
  generateMediationId() {
    return `mediation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Configurar graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      this.isShuttingDown = true;
      
      // Parar de aceitar novas conexões
      if (this.server) {
        this.server.close(() => {
          this.logger.info('HTTP server closed');
        });
      }
      
      // Finalizar mediações ativas
      for (const [mediationId, mediation] of this.activeMediations) {
        await this.failMediation(mediationId, 'System shutdown');
      }
      
      // Fechar conexões SQS
      if (this.sqsService) {
        await this.sqsService.disconnect();
      }
      
      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      // Conectar ao SQS
      await this.sqsService.connect();
      
      // Iniciar servidor HTTP
      const port = process.env.PORT || 3006;
      this.server = this.app.listen(port, () => {
        this.logger.info(`Mediator Agent started on port ${port}`);
      });
      
      this.logger.info('Mediator Agent initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Mediator Agent', {
        error: error.message
      });
      process.exit(1);
    }
  }
}

module.exports = MediatorAgent;

// Iniciar agente se executado diretamente
if (require.main === module) {
  const agent = new MediatorAgent();
  agent.start();
}