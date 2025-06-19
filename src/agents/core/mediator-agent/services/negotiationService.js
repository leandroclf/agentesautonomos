/**
 * Negotiation Service - Serviço de Negociação
 * 
 * Responsabilidades:
 * - Facilitar negociações entre agentes
 * - Implementar protocolos de negociação
 * - Gerenciar ofertas e contra-ofertas
 * - Monitorar progresso de negociações
 */

class NegotiationService {
  constructor(logger) {
    this.logger = logger;
    this.activeNegotiations = new Map();
    this.negotiationProtocols = new Map();
    this.negotiationStrategies = new Map();
    this.negotiationHistory = new Map();
    this.negotiationMetrics = {
      totalNegotiations: 0,
      successfulNegotiations: 0,
      averageRounds: 0,
      averageDuration: 0,
      protocolUsage: new Map(),
      strategyEffectiveness: new Map()
    };
    
    this.initializeProtocols();
    this.initializeStrategies();
  }
  
  /**
   * Inicializar protocolos de negociação
   */
  initializeProtocols() {
    // Protocolo de leilão inglês
    this.negotiationProtocols.set('english_auction', {
      name: 'English Auction',
      description: 'Ascending price auction protocol',
      type: 'auction',
      phases: ['initialization', 'bidding', 'closing', 'award'],
      rules: {
        bidIncrement: 'minimum',
        timeLimit: 30000, // 30 segundos
        maxRounds: 10,
        reservePrice: true
      },
      participants: {
        min: 2,
        max: 10,
        roles: ['bidder', 'auctioneer']
      }
    });
    
    // Protocolo de negociação bilateral
    this.negotiationProtocols.set('bilateral_negotiation', {
      name: 'Bilateral Negotiation',
      description: 'Two-party negotiation protocol',
      type: 'bilateral',
      phases: ['proposal', 'counter_proposal', 'agreement', 'finalization'],
      rules: {
        maxRounds: 5,
        timeLimit: 60000, // 1 minuto
        concessionRequired: true,
        deadlineEffect: true
      },
      participants: {
        min: 2,
        max: 2,
        roles: ['proposer', 'responder']
      }
    });
    
    // Protocolo de negociação multilateral
    this.negotiationProtocols.set('multilateral_negotiation', {
      name: 'Multilateral Negotiation',
      description: 'Multi-party negotiation protocol',
      type: 'multilateral',
      phases: ['initialization', 'proposal_collection', 'evaluation', 'consensus', 'agreement'],
      rules: {
        maxRounds: 7,
        timeLimit: 120000, // 2 minutos
        consensusThreshold: 0.7,
        votingMechanism: 'majority'
      },
      participants: {
        min: 3,
        max: 8,
        roles: ['participant', 'mediator']
      }
    });
    
    // Protocolo de negociação baseada em argumentação
    this.negotiationProtocols.set('argumentation_based', {
      name: 'Argumentation Based Negotiation',
      description: 'Negotiation using arguments and reasoning',
      type: 'argumentation',
      phases: ['argument_exchange', 'evaluation', 'rebuttal', 'synthesis', 'agreement'],
      rules: {
        maxRounds: 6,
        timeLimit: 90000, // 1.5 minutos
        argumentStrength: true,
        evidenceRequired: true
      },
      participants: {
        min: 2,
        max: 5,
        roles: ['arguer', 'evaluator']
      }
    });
    
    // Protocolo de negociação baseada em utilidade
    this.negotiationProtocols.set('utility_based', {
      name: 'Utility Based Negotiation',
      description: 'Negotiation based on utility functions',
      type: 'utility',
      phases: ['utility_revelation', 'optimization', 'pareto_analysis', 'agreement'],
      rules: {
        maxRounds: 4,
        timeLimit: 45000, // 45 segundos
        paretoOptimal: true,
        utilityTransparency: 'partial'
      },
      participants: {
        min: 2,
        max: 6,
        roles: ['utility_provider', 'optimizer']
      }
    });
    
    this.logger.info('Negotiation protocols initialized', {
      protocolsCount: this.negotiationProtocols.size
    });
  }
  
  /**
   * Inicializar estratégias de negociação
   */
  initializeStrategies() {
    // Estratégia cooperativa
    this.negotiationStrategies.set('cooperative', {
      name: 'Cooperative Strategy',
      description: 'Focus on mutual benefit and win-win outcomes',
      approach: 'collaborative',
      characteristics: {
        concessionRate: 0.3,
        trustLevel: 0.8,
        informationSharing: 'high',
        competitiveness: 'low'
      },
      tactics: ['information_sharing', 'joint_problem_solving', 'mutual_concessions']
    });
    
    // Estratégia competitiva
    this.negotiationStrategies.set('competitive', {
      name: 'Competitive Strategy',
      description: 'Focus on maximizing own benefit',
      approach: 'adversarial',
      characteristics: {
        concessionRate: 0.1,
        trustLevel: 0.3,
        informationSharing: 'low',
        competitiveness: 'high'
      },
      tactics: ['anchoring', 'deadline_pressure', 'limited_concessions']
    });
    
    // Estratégia adaptativa
    this.negotiationStrategies.set('adaptive', {
      name: 'Adaptive Strategy',
      description: 'Adapt strategy based on opponent behavior',
      approach: 'responsive',
      characteristics: {
        concessionRate: 'variable',
        trustLevel: 'adaptive',
        informationSharing: 'conditional',
        competitiveness: 'moderate'
      },
      tactics: ['tit_for_tat', 'behavior_mirroring', 'strategy_switching']
    });
    
    // Estratégia baseada em tempo
    this.negotiationStrategies.set('time_based', {
      name: 'Time Based Strategy',
      description: 'Adjust behavior based on time pressure',
      approach: 'temporal',
      characteristics: {
        concessionRate: 'time_dependent',
        trustLevel: 0.5,
        informationSharing: 'moderate',
        competitiveness: 'time_dependent'
      },
      tactics: ['deadline_awareness', 'time_pressure', 'last_minute_concessions']
    });
    
    // Estratégia baseada em recursos
    this.negotiationStrategies.set('resource_based', {
      name: 'Resource Based Strategy',
      description: 'Focus on resource optimization and allocation',
      approach: 'resource_centric',
      characteristics: {
        concessionRate: 0.2,
        trustLevel: 0.6,
        informationSharing: 'selective',
        competitiveness: 'moderate'
      },
      tactics: ['resource_bundling', 'trade_offs', 'value_creation']
    });
    
    this.logger.info('Negotiation strategies initialized', {
      strategiesCount: this.negotiationStrategies.size
    });
  }
  
  /**
   * Iniciar negociação
   */
  async startNegotiation(config) {
    const negotiationId = this.generateNegotiationId();
    
    try {
      this.logger.info('Starting negotiation', {
        negotiationId,
        protocol: config.protocol,
        participants: config.participants?.length || 0
      });
      
      // Validar configuração
      const validation = this.validateNegotiationConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid negotiation config: ${validation.errors.join(', ')}`);
      }
      
      const protocol = this.negotiationProtocols.get(config.protocol);
      if (!protocol) {
        throw new Error(`Unknown negotiation protocol: ${config.protocol}`);
      }
      
      // Criar negociação
      const negotiation = {
        id: negotiationId,
        protocol: config.protocol,
        protocolConfig: protocol,
        participants: config.participants || [],
        subject: config.subject,
        initialProposal: config.initialProposal,
        status: 'initialized',
        currentPhase: protocol.phases[0],
        phaseIndex: 0,
        currentRound: 1,
        maxRounds: config.maxRounds || protocol.rules.maxRounds,
        timeLimit: config.timeLimit || protocol.rules.timeLimit,
        startTime: Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        proposals: [],
        agreements: [],
        messages: [],
        metrics: {
          roundDurations: [],
          participantActivity: new Map(),
          concessionHistory: [],
          utilityScores: new Map()
        }
      };
      
      // Atribuir estratégias aos participantes
      this.assignStrategies(negotiation, config.strategies);
      
      // Registrar negociação ativa
      this.activeNegotiations.set(negotiationId, negotiation);
      
      // Atualizar métricas
      this.negotiationMetrics.totalNegotiations++;
      this.updateProtocolUsage(config.protocol);
      
      this.logger.info('Negotiation started', {
        negotiationId,
        protocol: config.protocol,
        participants: negotiation.participants.length,
        timeLimit: negotiation.timeLimit
      });
      
      return negotiation;
      
    } catch (error) {
      this.logger.error('Error starting negotiation', {
        error: error.message,
        negotiationId,
        config
      });
      throw error;
    }
  }
  
  /**
   * Executar rodada de negociação
   */
  async executeRound(negotiationId, roundData) {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (!negotiation) {
      throw new Error(`Negotiation ${negotiationId} not found`);
    }
    
    const roundStartTime = Date.now();
    
    try {
      this.logger.info('Executing negotiation round', {
        negotiationId,
        round: negotiation.currentRound,
        phase: negotiation.currentPhase
      });
      
      // Verificar timeout
      if (Date.now() - negotiation.startTime > negotiation.timeLimit) {
        return await this.handleTimeout(negotiation);
      }
      
      // Executar fase atual
      const phaseResult = await this.executePhase(negotiation, roundData);
      
      // Registrar duração da rodada
      const roundDuration = Date.now() - roundStartTime;
      negotiation.metrics.roundDurations.push({
        round: negotiation.currentRound,
        phase: negotiation.currentPhase,
        duration: roundDuration,
        timestamp: new Date().toISOString()
      });
      
      // Atualizar negociação
      negotiation.updatedAt = new Date().toISOString();
      this.activeNegotiations.set(negotiationId, negotiation);
      
      // Verificar se deve avançar fase ou rodada
      if (phaseResult.shouldAdvancePhase) {
        this.advancePhase(negotiationId);
      } else if (phaseResult.shouldAdvanceRound) {
        this.advanceRound(negotiationId);
      }
      
      // Verificar condições de término
      const terminationCheck = this.checkTerminationConditions(negotiation, phaseResult);
      if (terminationCheck.shouldTerminate) {
        return await this.terminateNegotiation(negotiationId, terminationCheck.reason, terminationCheck.result);
      }
      
      return {
        success: true,
        negotiationId,
        round: negotiation.currentRound,
        phase: negotiation.currentPhase,
        result: phaseResult,
        status: negotiation.status,
        nextAction: this.determineNextAction(negotiation, phaseResult)
      };
      
    } catch (error) {
      this.logger.error('Error executing negotiation round', {
        error: error.message,
        negotiationId,
        round: negotiation.currentRound
      });
      throw error;
    }
  }
  
  /**
   * Executar fase da negociação
   */
  async executePhase(negotiation, roundData) {
    const phase = negotiation.currentPhase;
    
    switch (phase) {
      case 'initialization':
        return await this.executeInitializationPhase(negotiation, roundData);
      case 'proposal':
        return await this.executeProposalPhase(negotiation, roundData);
      case 'bidding':
        return await this.executeBiddingPhase(negotiation, roundData);
      case 'counter_proposal':
        return await this.executeCounterProposalPhase(negotiation, roundData);
      case 'proposal_collection':
        return await this.executeProposalCollectionPhase(negotiation, roundData);
      case 'evaluation':
        return await this.executeEvaluationPhase(negotiation, roundData);
      case 'consensus':
        return await this.executeConsensusPhase(negotiation, roundData);
      case 'agreement':
        return await this.executeAgreementPhase(negotiation, roundData);
      case 'argument_exchange':
        return await this.executeArgumentExchangePhase(negotiation, roundData);
      case 'utility_revelation':
        return await this.executeUtilityRevelationPhase(negotiation, roundData);
      case 'optimization':
        return await this.executeOptimizationPhase(negotiation, roundData);
      case 'pareto_analysis':
        return await this.executeParetoAnalysisPhase(negotiation, roundData);
      case 'closing':
        return await this.executeClosingPhase(negotiation, roundData);
      case 'award':
        return await this.executeAwardPhase(negotiation, roundData);
      case 'finalization':
        return await this.executeFinalizationPhase(negotiation, roundData);
      default:
        return await this.executeGenericPhase(negotiation, roundData);
    }
  }
  
  /**
   * Executar fase de inicialização
   */
  async executeInitializationPhase(negotiation, roundData) {
    this.logger.info('Executing initialization phase', {
      negotiationId: negotiation.id
    });
    
    // Configurar participantes e suas estratégias
    for (const participant of negotiation.participants) {
      if (!negotiation.metrics.participantActivity.has(participant.id)) {
        negotiation.metrics.participantActivity.set(participant.id, {
          proposals: 0,
          concessions: 0,
          lastActivity: new Date().toISOString()
        });
      }
      
      if (!negotiation.metrics.utilityScores.has(participant.id)) {
        negotiation.metrics.utilityScores.set(participant.id, {
          initial: Math.random(),
          current: Math.random(),
          target: Math.random()
        });
      }
    }
    
    // Estabelecer regras e parâmetros
    const initializationResult = {
      participantsReady: negotiation.participants.length,
      rulesEstablished: true,
      strategiesAssigned: true,
      initialUtilities: Array.from(negotiation.metrics.utilityScores.entries())
    };
    
    return {
      success: true,
      results: initializationResult,
      shouldAdvancePhase: true,
      shouldAdvanceRound: false,
      message: 'Initialization completed successfully'
    };
  }
  
  /**
   * Executar fase de proposta
   */
  async executeProposalPhase(negotiation, roundData) {
    this.logger.info('Executing proposal phase', {
      negotiationId: negotiation.id,
      round: negotiation.currentRound
    });
    
    // Coletar propostas dos participantes
    const proposals = await this.collectProposals(negotiation, roundData);
    
    // Avaliar propostas
    const evaluation = this.evaluateProposals(proposals, negotiation);
    
    // Registrar propostas
    negotiation.proposals.push({
      round: negotiation.currentRound,
      phase: negotiation.currentPhase,
      proposals,
      evaluation,
      timestamp: new Date().toISOString()
    });
    
    // Atualizar atividade dos participantes
    for (const proposal of proposals) {
      const activity = negotiation.metrics.participantActivity.get(proposal.participantId);
      if (activity) {
        activity.proposals++;
        activity.lastActivity = new Date().toISOString();
      }
    }
    
    return {
      success: true,
      results: {
        proposalsReceived: proposals.length,
        evaluation,
        bestProposal: evaluation.bestProposal,
        convergence: evaluation.convergence
      },
      shouldAdvancePhase: evaluation.convergence > 0.7,
      shouldAdvanceRound: evaluation.convergence <= 0.7,
      message: `Received ${proposals.length} proposals`
    };
  }
  
  /**
   * Executar fase de licitação
   */
  async executeBiddingPhase(negotiation, roundData) {
    this.logger.info('Executing bidding phase', {
      negotiationId: negotiation.id,
      round: negotiation.currentRound
    });
    
    // Coletar lances
    const bids = await this.collectBids(negotiation, roundData);
    
    // Determinar lance vencedor atual
    const highestBid = this.findHighestBid(bids);
    
    // Verificar se há atividade suficiente
    const activityLevel = this.calculateBiddingActivity(bids, negotiation);
    
    return {
      success: true,
      results: {
        bidsReceived: bids.length,
        highestBid,
        activityLevel,
        reserveMet: highestBid ? highestBid.amount >= (roundData.reservePrice || 0) : false
      },
      shouldAdvancePhase: activityLevel < 0.3, // Baixa atividade indica fim
      shouldAdvanceRound: activityLevel >= 0.3,
      message: `Received ${bids.length} bids, highest: ${highestBid?.amount || 'none'}`
    };
  }
  
  /**
   * Executar fase de contra-proposta
   */
  async executeCounterProposalPhase(negotiation, roundData) {
    this.logger.info('Executing counter-proposal phase', {
      negotiationId: negotiation.id,
      round: negotiation.currentRound
    });
    
    // Gerar contra-propostas baseadas nas propostas anteriores
    const counterProposals = await this.generateCounterProposals(negotiation, roundData);
    
    // Avaliar convergência
    const convergence = this.calculateConvergence(negotiation, counterProposals);
    
    // Registrar concessões
    this.recordConcessions(negotiation, counterProposals);
    
    return {
      success: true,
      results: {
        counterProposals: counterProposals.length,
        convergence,
        concessionsDetected: counterProposals.filter(cp => cp.concession).length
      },
      shouldAdvancePhase: convergence > 0.8,
      shouldAdvanceRound: convergence <= 0.8 && negotiation.currentRound < negotiation.maxRounds,
      message: `Generated ${counterProposals.length} counter-proposals`
    };
  }
  
  /**
   * Executar fase de coleta de propostas
   */
  async executeProposalCollectionPhase(negotiation, roundData) {
    this.logger.info('Executing proposal collection phase', {
      negotiationId: negotiation.id
    });
    
    // Coletar propostas de todos os participantes
    const allProposals = await this.collectAllProposals(negotiation, roundData);
    
    // Organizar propostas por categoria
    const categorizedProposals = this.categorizeProposals(allProposals);
    
    return {
      success: true,
      results: {
        totalProposals: allProposals.length,
        categories: Object.keys(categorizedProposals),
        participationRate: allProposals.length / negotiation.participants.length
      },
      shouldAdvancePhase: true,
      shouldAdvanceRound: false,
      message: `Collected ${allProposals.length} proposals from participants`
    };
  }
  
  /**
   * Executar fase de avaliação
   */
  async executeEvaluationPhase(negotiation, roundData) {
    this.logger.info('Executing evaluation phase', {
      negotiationId: negotiation.id
    });
    
    // Avaliar todas as propostas coletadas
    const evaluation = await this.performComprehensiveEvaluation(negotiation, roundData);
    
    // Ranquear propostas
    const ranking = this.rankProposals(evaluation.proposals);
    
    return {
      success: true,
      results: {
        evaluation,
        ranking,
        topProposals: ranking.slice(0, 3),
        evaluationCriteria: evaluation.criteria
      },
      shouldAdvancePhase: true,
      shouldAdvanceRound: false,
      message: `Evaluated ${evaluation.proposals.length} proposals`
    };
  }
  
  /**
   * Executar fase de consenso
   */
  async executeConsensusPhase(negotiation, roundData) {
    this.logger.info('Executing consensus phase', {
      negotiationId: negotiation.id
    });
    
    // Buscar consenso entre participantes
    const consensusResult = await this.seekConsensus(negotiation, roundData);
    
    // Verificar se consenso foi alcançado
    const consensusThreshold = negotiation.protocolConfig.rules.consensusThreshold || 0.7;
    const consensusAchieved = consensusResult.agreement >= consensusThreshold;
    
    return {
      success: true,
      results: {
        consensusLevel: consensusResult.agreement,
        threshold: consensusThreshold,
        achieved: consensusAchieved,
        supportingParticipants: consensusResult.supporters,
        opposingParticipants: consensusResult.opponents
      },
      shouldAdvancePhase: consensusAchieved,
      shouldAdvanceRound: !consensusAchieved && negotiation.currentRound < negotiation.maxRounds,
      message: consensusAchieved ? 'Consensus achieved' : 'Consensus not reached, continuing negotiation'
    };
  }
  
  /**
   * Executar fase de acordo
   */
  async executeAgreementPhase(negotiation, roundData) {
    this.logger.info('Executing agreement phase', {
      negotiationId: negotiation.id
    });
    
    // Formalizar acordo
    const agreement = await this.formalizeAgreement(negotiation, roundData);
    
    // Registrar acordo
    negotiation.agreements.push(agreement);
    
    return {
      success: true,
      results: {
        agreement,
        participants: agreement.signatories.length,
        terms: agreement.terms.length,
        validUntil: agreement.validUntil
      },
      shouldAdvancePhase: true,
      shouldAdvanceRound: false,
      message: 'Agreement formalized successfully'
    };
  }
  
  /**
   * Executar fase genérica
   */
  async executeGenericPhase(negotiation, roundData) {
    this.logger.info('Executing generic phase', {
      negotiationId: negotiation.id,
      phase: negotiation.currentPhase
    });
    
    // Implementação genérica
    return {
      success: true,
      results: {
        phase: negotiation.currentPhase,
        processed: true
      },
      shouldAdvancePhase: true,
      shouldAdvanceRound: false,
      message: `Generic phase ${negotiation.currentPhase} completed`
    };
  }
  
  /**
   * Coletar propostas
   */
  async collectProposals(negotiation, roundData) {
    const proposals = [];
    
    for (const participant of negotiation.participants) {
      // Simular coleta de proposta
      const proposal = {
        participantId: participant.id,
        round: negotiation.currentRound,
        content: {
          offer: Math.random() * 100,
          conditions: [`Condition ${Math.floor(Math.random() * 5) + 1}`],
          priority: Math.random(),
          flexibility: Math.random()
        },
        strategy: participant.strategy,
        timestamp: new Date().toISOString(),
        utility: this.calculateProposalUtility(participant, negotiation)
      };
      
      proposals.push(proposal);
    }
    
    return proposals;
  }
  
  /**
   * Avaliar propostas
   */
  evaluateProposals(proposals, negotiation) {
    const scores = proposals.map(proposal => ({
      proposal,
      score: this.calculateProposalScore(proposal, negotiation),
      feasibility: Math.random(),
      acceptability: Math.random()
    }));
    
    // Ordenar por pontuação
    scores.sort((a, b) => b.score - a.score);
    
    const bestProposal = scores[0];
    const convergence = this.calculateProposalConvergence(proposals);
    
    return {
      scores,
      bestProposal,
      convergence,
      averageScore: scores.reduce((sum, s) => sum + s.score, 0) / scores.length,
      feasibleProposals: scores.filter(s => s.feasibility > 0.6).length
    };
  }
  
  /**
   * Calcular utilidade da proposta
   */
  calculateProposalUtility(participant, negotiation) {
    const utilityScores = negotiation.metrics.utilityScores.get(participant.id);
    if (!utilityScores) return Math.random();
    
    // Simular cálculo de utilidade baseado na estratégia
    const strategy = this.negotiationStrategies.get(participant.strategy);
    if (!strategy) return Math.random();
    
    let utility = utilityScores.current;
    
    // Ajustar baseado na estratégia
    switch (participant.strategy) {
      case 'cooperative':
        utility *= 0.8 + Math.random() * 0.4; // Mais conservador
        break;
      case 'competitive':
        utility *= 1.1 + Math.random() * 0.3; // Mais agressivo
        break;
      case 'adaptive':
        utility *= 0.9 + Math.random() * 0.2; // Moderado
        break;
      default:
        utility *= 0.8 + Math.random() * 0.4;
    }
    
    return Math.min(Math.max(utility, 0), 1);
  }
  
  /**
   * Calcular pontuação da proposta
   */
  calculateProposalScore(proposal, negotiation) {
    let score = 0;
    
    // Componentes da pontuação
    score += proposal.content.offer * 0.4; // 40% baseado na oferta
    score += proposal.content.priority * 0.3; // 30% baseado na prioridade
    score += proposal.content.flexibility * 0.2; // 20% baseado na flexibilidade
    score += proposal.utility * 0.1; // 10% baseado na utilidade
    
    return Math.min(Math.max(score, 0), 100);
  }
  
  /**
   * Calcular convergência das propostas
   */
  calculateProposalConvergence(proposals) {
    if (proposals.length < 2) return 1;
    
    const offers = proposals.map(p => p.content.offer);
    const mean = offers.reduce((sum, offer) => sum + offer, 0) / offers.length;
    const variance = offers.reduce((sum, offer) => sum + Math.pow(offer - mean, 2), 0) / offers.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Convergência inversamente proporcional ao desvio padrão
    const convergence = 1 / (1 + standardDeviation / mean);
    
    return Math.min(Math.max(convergence, 0), 1);
  }
  
  /**
   * Avançar para próxima fase
   */
  advancePhase(negotiationId) {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (!negotiation) return false;
    
    const phases = negotiation.protocolConfig.phases;
    if (negotiation.phaseIndex < phases.length - 1) {
      negotiation.phaseIndex++;
      negotiation.currentPhase = phases[negotiation.phaseIndex];
      negotiation.updatedAt = new Date().toISOString();
      
      this.activeNegotiations.set(negotiationId, negotiation);
      
      this.logger.info('Advanced to next phase', {
        negotiationId,
        newPhase: negotiation.currentPhase,
        phaseIndex: negotiation.phaseIndex
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Avançar para próxima rodada
   */
  advanceRound(negotiationId) {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (!negotiation) return false;
    
    if (negotiation.currentRound < negotiation.maxRounds) {
      negotiation.currentRound++;
      negotiation.updatedAt = new Date().toISOString();
      
      this.activeNegotiations.set(negotiationId, negotiation);
      
      this.logger.info('Advanced to next round', {
        negotiationId,
        newRound: negotiation.currentRound,
        maxRounds: negotiation.maxRounds
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Verificar condições de término
   */
  checkTerminationConditions(negotiation, phaseResult) {
    // Verificar se acordo foi alcançado
    if (negotiation.agreements.length > 0) {
      return {
        shouldTerminate: true,
        reason: 'agreement_reached',
        result: 'success'
      };
    }
    
    // Verificar timeout
    if (Date.now() - negotiation.startTime > negotiation.timeLimit) {
      return {
        shouldTerminate: true,
        reason: 'timeout',
        result: 'timeout'
      };
    }
    
    // Verificar máximo de rodadas
    if (negotiation.currentRound >= negotiation.maxRounds) {
      return {
        shouldTerminate: true,
        reason: 'max_rounds_reached',
        result: 'failure'
      };
    }
    
    // Verificar se chegou à última fase
    const phases = negotiation.protocolConfig.phases;
    if (negotiation.phaseIndex >= phases.length - 1 && phaseResult.shouldAdvancePhase) {
      return {
        shouldTerminate: true,
        reason: 'protocol_completed',
        result: negotiation.agreements.length > 0 ? 'success' : 'no_agreement'
      };
    }
    
    return {
      shouldTerminate: false
    };
  }
  
  /**
   * Terminar negociação
   */
  async terminateNegotiation(negotiationId, reason, result) {
    const negotiation = this.activeNegotiations.get(negotiationId);
    if (!negotiation) {
      throw new Error(`Negotiation ${negotiationId} not found`);
    }
    
    const totalDuration = Date.now() - negotiation.startTime;
    
    // Atualizar status
    negotiation.status = 'completed';
    negotiation.terminationReason = reason;
    negotiation.result = result;
    negotiation.completedAt = new Date().toISOString();
    negotiation.totalDuration = totalDuration;
    
    // Atualizar métricas
    if (result === 'success') {
      this.negotiationMetrics.successfulNegotiations++;
    }
    
    this.updateNegotiationMetrics(negotiation);
    
    // Mover para histórico
    this.moveToHistory(negotiation);
    
    // Remover da lista ativa
    this.activeNegotiations.delete(negotiationId);
    
    this.logger.info('Negotiation terminated', {
      negotiationId,
      reason,
      result,
      duration: totalDuration,
      rounds: negotiation.currentRound
    });
    
    return {
      negotiationId,
      status: 'completed',
      reason,
      result,
      duration: totalDuration,
      rounds: negotiation.currentRound,
      agreements: negotiation.agreements.length,
      finalPhase: negotiation.currentPhase
    };
  }
  
  /**
   * Atribuir estratégias aos participantes
   */
  assignStrategies(negotiation, strategiesConfig) {
    for (let i = 0; i < negotiation.participants.length; i++) {
      const participant = negotiation.participants[i];
      
      if (strategiesConfig && strategiesConfig[participant.id]) {
        participant.strategy = strategiesConfig[participant.id];
      } else {
        // Atribuir estratégia aleatória
        const strategies = Array.from(this.negotiationStrategies.keys());
        participant.strategy = strategies[Math.floor(Math.random() * strategies.length)];
      }
    }
  }
  
  /**
   * Validar configuração de negociação
   */
  validateNegotiationConfig(config) {
    const errors = [];
    
    if (!config.protocol) {
      errors.push('Protocol is required');
    } else if (!this.negotiationProtocols.has(config.protocol)) {
      errors.push(`Unknown protocol: ${config.protocol}`);
    }
    
    if (!config.participants || config.participants.length < 2) {
      errors.push('At least 2 participants are required');
    }
    
    if (config.protocol && this.negotiationProtocols.has(config.protocol)) {
      const protocol = this.negotiationProtocols.get(config.protocol);
      const participantCount = config.participants?.length || 0;
      
      if (participantCount < protocol.participants.min) {
        errors.push(`Protocol ${config.protocol} requires at least ${protocol.participants.min} participants`);
      }
      
      if (participantCount > protocol.participants.max) {
        errors.push(`Protocol ${config.protocol} allows at most ${protocol.participants.max} participants`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Atualizar métricas de negociação
   */
  updateNegotiationMetrics(negotiation) {
    // Atualizar média de rodadas
    const totalRounds = this.negotiationMetrics.averageRounds * 
                       (this.negotiationMetrics.totalNegotiations - 1) + negotiation.currentRound;
    this.negotiationMetrics.averageRounds = totalRounds / this.negotiationMetrics.totalNegotiations;
    
    // Atualizar média de duração
    const totalDuration = this.negotiationMetrics.averageDuration * 
                         (this.negotiationMetrics.totalNegotiations - 1) + negotiation.totalDuration;
    this.negotiationMetrics.averageDuration = totalDuration / this.negotiationMetrics.totalNegotiations;
    
    // Atualizar efetividade da estratégia
    for (const participant of negotiation.participants) {
      const strategy = participant.strategy;
      if (!this.negotiationMetrics.strategyEffectiveness.has(strategy)) {
        this.negotiationMetrics.strategyEffectiveness.set(strategy, {
          total: 0,
          successes: 0,
          averageRounds: 0
        });
      }
      
      const stats = this.negotiationMetrics.strategyEffectiveness.get(strategy);
      stats.total++;
      if (negotiation.result === 'success') {
        stats.successes++;
      }
      
      const strategyTotalRounds = stats.averageRounds * (stats.total - 1) + negotiation.currentRound;
      stats.averageRounds = strategyTotalRounds / stats.total;
    }
  }
  
  /**
   * Atualizar uso de protocolo
   */
  updateProtocolUsage(protocol) {
    if (!this.negotiationMetrics.protocolUsage.has(protocol)) {
      this.negotiationMetrics.protocolUsage.set(protocol, 0);
    }
    
    this.negotiationMetrics.protocolUsage.set(
      protocol,
      this.negotiationMetrics.protocolUsage.get(protocol) + 1
    );
  }
  
  /**
   * Mover negociação para histórico
   */
  moveToHistory(negotiation) {
    const protocol = negotiation.protocol;
    
    if (!this.negotiationHistory.has(protocol)) {
      this.negotiationHistory.set(protocol, []);
    }
    
    const protocolHistory = this.negotiationHistory.get(protocol);
    protocolHistory.push({
      id: negotiation.id,
      protocol: negotiation.protocol,
      participants: negotiation.participants.length,
      result: negotiation.result,
      duration: negotiation.totalDuration,
      rounds: negotiation.currentRound,
      agreements: negotiation.agreements.length,
      completedAt: negotiation.completedAt
    });
    
    // Manter apenas os últimos 50 registros por protocolo
    if (protocolHistory.length > 50) {
      protocolHistory.shift();
    }
  }
  
  /**
   * Gerar ID único para negociação
   */
  generateNegotiationId() {
    return `neg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Obter negociação por ID
   */
  getNegotiation(negotiationId) {
    return this.activeNegotiations.get(negotiationId);
  }
  
  /**
   * Listar negociações ativas
   */
  getActiveNegotiations() {
    return Array.from(this.activeNegotiations.values());
  }
  
  /**
   * Obter estatísticas do serviço
   */
  getStats() {
    return {
      metrics: this.negotiationMetrics,
      activeNegotiations: this.activeNegotiations.size,
      availableProtocols: this.negotiationProtocols.size,
      availableStrategies: this.negotiationStrategies.size,
      protocols: Array.from(this.negotiationProtocols.keys()),
      strategies: Array.from(this.negotiationStrategies.keys()),
      historySize: Array.from(this.negotiationHistory.values())
        .reduce((total, history) => total + history.length, 0)
    };
  }
  
  // Métodos auxiliares para fases específicas (implementações simplificadas)
  
  async collectBids(negotiation, roundData) {
    return negotiation.participants.map(p => ({
      participantId: p.id,
      amount: Math.random() * 100,
      timestamp: new Date().toISOString()
    }));
  }
  
  findHighestBid(bids) {
    return bids.reduce((highest, bid) => 
      !highest || bid.amount > highest.amount ? bid : highest, null);
  }
  
  calculateBiddingActivity(bids, negotiation) {
    return bids.length / negotiation.participants.length;
  }
  
  async generateCounterProposals(negotiation, roundData) {
    return negotiation.participants.map(p => ({
      participantId: p.id,
      counterOffer: Math.random() * 100,
      concession: Math.random() > 0.5,
      timestamp: new Date().toISOString()
    }));
  }
  
  calculateConvergence(negotiation, counterProposals) {
    return Math.random(); // Simplificado
  }
  
  recordConcessions(negotiation, counterProposals) {
    const concessions = counterProposals.filter(cp => cp.concession);
    negotiation.metrics.concessionHistory.push({
      round: negotiation.currentRound,
      concessions: concessions.length,
      timestamp: new Date().toISOString()
    });
  }
  
  async collectAllProposals(negotiation, roundData) {
    return await this.collectProposals(negotiation, roundData);
  }
  
  categorizeProposals(proposals) {
    return {
      high_value: proposals.filter(p => p.content.offer > 70),
      medium_value: proposals.filter(p => p.content.offer >= 30 && p.content.offer <= 70),
      low_value: proposals.filter(p => p.content.offer < 30)
    };
  }
  
  async performComprehensiveEvaluation(negotiation, roundData) {
    const proposals = negotiation.proposals.flatMap(p => p.proposals);
    return {
      proposals,
      criteria: ['feasibility', 'value', 'risk', 'timeline'],
      scores: proposals.map(p => Math.random())
    };
  }
  
  rankProposals(proposals) {
    return proposals.sort(() => Math.random() - 0.5); // Simplificado
  }
  
  async seekConsensus(negotiation, roundData) {
    const agreement = Math.random();
    const supporters = negotiation.participants.filter(() => Math.random() > 0.3);
    const opponents = negotiation.participants.filter(p => !supporters.includes(p));
    
    return {
      agreement,
      supporters: supporters.map(p => p.id),
      opponents: opponents.map(p => p.id)
    };
  }
  
  async formalizeAgreement(negotiation, roundData) {
    return {
      id: `agreement_${Date.now()}`,
      negotiationId: negotiation.id,
      signatories: negotiation.participants.map(p => p.id),
      terms: ['Term 1', 'Term 2', 'Term 3'],
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias
      createdAt: new Date().toISOString()
    };
  }
  
  async handleTimeout(negotiation) {
    return await this.terminateNegotiation(negotiation.id, 'timeout', 'timeout');
  }
  
  determineNextAction(negotiation, phaseResult) {
    if (phaseResult.shouldAdvancePhase) {
      return 'advance_phase';
    } else if (phaseResult.shouldAdvanceRound) {
      return 'advance_round';
    } else {
      return 'continue_phase';
    }
  }
}

module.exports = NegotiationService;