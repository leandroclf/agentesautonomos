/**
 * Consensus Service - Serviço de Consenso
 * 
 * Responsabilidades:
 * - Implementar algoritmos de consenso distribuído
 * - Coordenar decisões entre múltiplos agentes
 * - Gerenciar votações e acordos
 * - Monitorar convergência de consenso
 */

class ConsensusService {
  constructor(logger) {
    this.logger = logger;
    this.activeConsensus = new Map();
    this.consensusAlgorithms = new Map();
    this.votingMechanisms = new Map();
    this.consensusHistory = new Map();
    this.consensusMetrics = {
      totalConsensus: 0,
      successfulConsensus: 0,
      averageRounds: 0,
      averageParticipants: 0,
      averageConvergenceTime: 0,
      algorithmUsage: new Map(),
      mechanismEffectiveness: new Map()
    };
    
    this.initializeAlgorithms();
    this.initializeVotingMechanisms();
  }
  
  /**
   * Inicializar algoritmos de consenso
   */
  initializeAlgorithms() {
    // Algoritmo PBFT (Practical Byzantine Fault Tolerance)
    this.consensusAlgorithms.set('pbft', {
      name: 'Practical Byzantine Fault Tolerance',
      description: 'Byzantine fault tolerant consensus algorithm',
      type: 'byzantine_fault_tolerant',
      phases: ['pre_prepare', 'prepare', 'commit', 'reply'],
      faultTolerance: {
        maxFaultyNodes: 'f < n/3',
        safetyGuarantee: 'strong',
        livenessGuarantee: 'eventual'
      },
      requirements: {
        minNodes: 4,
        networkReliability: 'partial',
        messageComplexity: 'O(n²)',
        timeComplexity: 'O(1)'
      },
      parameters: {
        viewChangeTimeout: 30000,
        messageTimeout: 5000,
        maxRetries: 3
      }
    });
    
    // Algoritmo Raft
    this.consensusAlgorithms.set('raft', {
      name: 'Raft Consensus Algorithm',
      description: 'Leader-based consensus algorithm',
      type: 'leader_based',
      phases: ['leader_election', 'log_replication', 'safety'],
      faultTolerance: {
        maxFaultyNodes: 'f < n/2',
        safetyGuarantee: 'strong',
        livenessGuarantee: 'eventual'
      },
      requirements: {
        minNodes: 3,
        networkReliability: 'majority',
        messageComplexity: 'O(n)',
        timeComplexity: 'O(1)'
      },
      parameters: {
        electionTimeout: 15000,
        heartbeatInterval: 5000,
        logReplicationTimeout: 10000
      }
    });
    
    // Algoritmo PAXOS
    this.consensusAlgorithms.set('paxos', {
      name: 'Paxos Consensus Algorithm',
      description: 'Classic consensus algorithm for distributed systems',
      type: 'proposal_based',
      phases: ['prepare', 'promise', 'accept', 'accepted'],
      faultTolerance: {
        maxFaultyNodes: 'f < n/2',
        safetyGuarantee: 'strong',
        livenessGuarantee: 'conditional'
      },
      requirements: {
        minNodes: 3,
        networkReliability: 'majority',
        messageComplexity: 'O(n²)',
        timeComplexity: 'O(log n)'
      },
      parameters: {
        proposalTimeout: 20000,
        promiseTimeout: 10000,
        acceptTimeout: 15000
      }
    });
    
    // Algoritmo de Consenso por Votação Simples
    this.consensusAlgorithms.set('simple_voting', {
      name: 'Simple Voting Consensus',
      description: 'Basic majority voting consensus',
      type: 'voting_based',
      phases: ['proposal', 'voting', 'counting', 'decision'],
      faultTolerance: {
        maxFaultyNodes: 'f < n/2',
        safetyGuarantee: 'moderate',
        livenessGuarantee: 'strong'
      },
      requirements: {
        minNodes: 2,
        networkReliability: 'basic',
        messageComplexity: 'O(n)',
        timeComplexity: 'O(1)'
      },
      parameters: {
        votingTimeout: 30000,
        quorumThreshold: 0.5,
        revotingAllowed: true
      }
    });
    
    // Algoritmo de Consenso Baseado em Peso
    this.consensusAlgorithms.set('weighted_consensus', {
      name: 'Weighted Consensus Algorithm',
      description: 'Consensus based on participant weights',
      type: 'weighted_voting',
      phases: ['weight_calculation', 'weighted_voting', 'threshold_check', 'decision'],
      faultTolerance: {
        maxFaultyNodes: 'depends on weights',
        safetyGuarantee: 'configurable',
        livenessGuarantee: 'strong'
      },
      requirements: {
        minNodes: 2,
        networkReliability: 'basic',
        messageComplexity: 'O(n)',
        timeComplexity: 'O(1)'
      },
      parameters: {
        weightThreshold: 0.67,
        weightCalculationMethod: 'reputation_based',
        dynamicWeights: true
      }
    });
    
    // Algoritmo de Consenso Gradual
    this.consensusAlgorithms.set('gradual_consensus', {
      name: 'Gradual Consensus Algorithm',
      description: 'Iterative consensus with gradual convergence',
      type: 'iterative',
      phases: ['initialization', 'iteration', 'convergence_check', 'finalization'],
      faultTolerance: {
        maxFaultyNodes: 'f < n/3',
        safetyGuarantee: 'eventual',
        livenessGuarantee: 'strong'
      },
      requirements: {
        minNodes: 3,
        networkReliability: 'partial',
        messageComplexity: 'O(n * rounds)',
        timeComplexity: 'O(rounds)'
      },
      parameters: {
        maxIterations: 10,
        convergenceThreshold: 0.9,
        dampingFactor: 0.8
      }
    });
    
    this.logger.info('Consensus algorithms initialized', {
      algorithmsCount: this.consensusAlgorithms.size
    });
  }
  
  /**
   * Inicializar mecanismos de votação
   */
  initializeVotingMechanisms() {
    // Votação por Maioria Simples
    this.votingMechanisms.set('simple_majority', {
      name: 'Simple Majority Voting',
      description: 'Decision based on simple majority (>50%)',
      type: 'majority_based',
      threshold: 0.5,
      quorumRequired: true,
      anonymousVoting: false,
      revotingAllowed: true,
      tieBreaking: 'random'
    });
    
    // Votação por Maioria Qualificada
    this.votingMechanisms.set('qualified_majority', {
      name: 'Qualified Majority Voting',
      description: 'Decision based on qualified majority (≥2/3)',
      type: 'supermajority_based',
      threshold: 0.67,
      quorumRequired: true,
      anonymousVoting: false,
      revotingAllowed: true,
      tieBreaking: 'status_quo'
    });
    
    // Votação Unânime
    this.votingMechanisms.set('unanimous', {
      name: 'Unanimous Voting',
      description: 'Decision requires unanimous agreement',
      type: 'unanimous',
      threshold: 1.0,
      quorumRequired: true,
      anonymousVoting: false,
      revotingAllowed: true,
      tieBreaking: 'rejection'
    });
    
    // Votação Ponderada
    this.votingMechanisms.set('weighted_voting', {
      name: 'Weighted Voting',
      description: 'Votes weighted by participant importance',
      type: 'weighted',
      threshold: 0.6,
      quorumRequired: true,
      anonymousVoting: false,
      revotingAllowed: true,
      tieBreaking: 'weighted_random',
      weightingFactors: ['reputation', 'expertise', 'stake']
    });
    
    // Votação por Ranking
    this.votingMechanisms.set('ranked_choice', {
      name: 'Ranked Choice Voting',
      description: 'Participants rank options in order of preference',
      type: 'preferential',
      threshold: 0.5,
      quorumRequired: true,
      anonymousVoting: true,
      revotingAllowed: false,
      tieBreaking: 'instant_runoff',
      eliminationRounds: true
    });
    
    // Votação por Aprovação
    this.votingMechanisms.set('approval_voting', {
      name: 'Approval Voting',
      description: 'Participants can approve multiple options',
      type: 'approval_based',
      threshold: 'highest_approval',
      quorumRequired: true,
      anonymousVoting: true,
      revotingAllowed: true,
      tieBreaking: 'random',
      multipleApprovals: true
    });
    
    this.logger.info('Voting mechanisms initialized', {
      mechanismsCount: this.votingMechanisms.size
    });
  }
  
  /**
   * Iniciar processo de consenso
   */
  async startConsensus(config) {
    const consensusId = this.generateConsensusId();
    
    try {
      this.logger.info('Starting consensus process', {
        consensusId,
        algorithm: config.algorithm,
        participants: config.participants?.length || 0
      });
      
      // Validar configuração
      const validation = this.validateConsensusConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid consensus config: ${validation.errors.join(', ')}`);
      }
      
      const algorithm = this.consensusAlgorithms.get(config.algorithm);
      if (!algorithm) {
        throw new Error(`Unknown consensus algorithm: ${config.algorithm}`);
      }
      
      const votingMechanism = this.votingMechanisms.get(config.votingMechanism || 'simple_majority');
      if (!votingMechanism) {
        throw new Error(`Unknown voting mechanism: ${config.votingMechanism}`);
      }
      
      // Criar processo de consenso
      const consensus = {
        id: consensusId,
        algorithm: config.algorithm,
        algorithmConfig: algorithm,
        votingMechanism: config.votingMechanism || 'simple_majority',
        votingConfig: votingMechanism,
        participants: config.participants || [],
        subject: config.subject,
        options: config.options || [],
        status: 'initialized',
        currentPhase: algorithm.phases[0],
        phaseIndex: 0,
        currentRound: 1,
        maxRounds: config.maxRounds || 5,
        startTime: Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        votes: [],
        proposals: [],
        decisions: [],
        messages: [],
        convergenceHistory: [],
        metrics: {
          phaseTimings: [],
          participantActivity: new Map(),
          convergenceScores: [],
          messageCount: 0
        }
      };
      
      // Calcular pesos dos participantes se necessário
      if (config.votingMechanism === 'weighted_voting' || config.algorithm === 'weighted_consensus') {
        this.calculateParticipantWeights(consensus);
      }
      
      // Registrar consenso ativo
      this.activeConsensus.set(consensusId, consensus);
      
      // Atualizar métricas
      this.consensusMetrics.totalConsensus++;
      this.updateAlgorithmUsage(config.algorithm);
      
      this.logger.info('Consensus process started', {
        consensusId,
        algorithm: config.algorithm,
        participants: consensus.participants.length,
        options: consensus.options.length
      });
      
      return consensus;
      
    } catch (error) {
      this.logger.error('Error starting consensus process', {
        error: error.message,
        consensusId,
        config
      });
      throw error;
    }
  }
  
  /**
   * Executar rodada de consenso
   */
  async executeRound(consensusId, roundData) {
    const consensus = this.activeConsensus.get(consensusId);
    if (!consensus) {
      throw new Error(`Consensus ${consensusId} not found`);
    }
    
    const phaseStartTime = Date.now();
    
    try {
      this.logger.info('Executing consensus round', {
        consensusId,
        round: consensus.currentRound,
        phase: consensus.currentPhase,
        algorithm: consensus.algorithm
      });
      
      // Executar fase atual do algoritmo
      const phaseResult = await this.executeAlgorithmPhase(consensus, roundData);
      
      // Registrar timing da fase
      const phaseDuration = Date.now() - phaseStartTime;
      consensus.metrics.phaseTimings.push({
        round: consensus.currentRound,
        phase: consensus.currentPhase,
        duration: phaseDuration,
        timestamp: new Date().toISOString()
      });
      
      // Calcular convergência
      const convergence = this.calculateConvergence(consensus, phaseResult);
      consensus.convergenceHistory.push({
        round: consensus.currentRound,
        phase: consensus.currentPhase,
        score: convergence,
        timestamp: new Date().toISOString()
      });
      
      // Atualizar consenso
      consensus.updatedAt = new Date().toISOString();
      this.activeConsensus.set(consensusId, consensus);
      
      // Verificar se deve avançar fase ou rodada
      const advancement = this.determineAdvancement(consensus, phaseResult, convergence);
      
      if (advancement.shouldAdvancePhase) {
        this.advancePhase(consensusId);
      } else if (advancement.shouldAdvanceRound) {
        this.advanceRound(consensusId);
      }
      
      // Verificar condições de término
      const terminationCheck = this.checkTerminationConditions(consensus, phaseResult, convergence);
      if (terminationCheck.shouldTerminate) {
        return await this.terminateConsensus(consensusId, terminationCheck.reason, terminationCheck.result);
      }
      
      return {
        success: true,
        consensusId,
        round: consensus.currentRound,
        phase: consensus.currentPhase,
        convergence,
        result: phaseResult,
        status: consensus.status,
        nextAction: advancement.nextAction
      };
      
    } catch (error) {
      this.logger.error('Error executing consensus round', {
        error: error.message,
        consensusId,
        round: consensus.currentRound
      });
      throw error;
    }
  }
  
  /**
   * Executar fase do algoritmo de consenso
   */
  async executeAlgorithmPhase(consensus, roundData) {
    const algorithm = consensus.algorithm;
    const phase = consensus.currentPhase;
    
    switch (algorithm) {
      case 'pbft':
        return await this.executePBFTPhase(consensus, roundData);
      case 'raft':
        return await this.executeRaftPhase(consensus, roundData);
      case 'paxos':
        return await this.executePaxosPhase(consensus, roundData);
      case 'simple_voting':
        return await this.executeSimpleVotingPhase(consensus, roundData);
      case 'weighted_consensus':
        return await this.executeWeightedConsensusPhase(consensus, roundData);
      case 'gradual_consensus':
        return await this.executeGradualConsensusPhase(consensus, roundData);
      default:
        return await this.executeGenericPhase(consensus, roundData);
    }
  }
  
  /**
   * Executar fase PBFT
   */
  async executePBFTPhase(consensus, roundData) {
    const phase = consensus.currentPhase;
    
    switch (phase) {
      case 'pre_prepare':
        return await this.executePBFTPrePrepare(consensus, roundData);
      case 'prepare':
        return await this.executePBFTPrepare(consensus, roundData);
      case 'commit':
        return await this.executePBFTCommit(consensus, roundData);
      case 'reply':
        return await this.executePBFTReply(consensus, roundData);
      default:
        return { success: false, error: `Unknown PBFT phase: ${phase}` };
    }
  }
  
  /**
   * Executar fase Raft
   */
  async executeRaftPhase(consensus, roundData) {
    const phase = consensus.currentPhase;
    
    switch (phase) {
      case 'leader_election':
        return await this.executeRaftLeaderElection(consensus, roundData);
      case 'log_replication':
        return await this.executeRaftLogReplication(consensus, roundData);
      case 'safety':
        return await this.executeRaftSafety(consensus, roundData);
      default:
        return { success: false, error: `Unknown Raft phase: ${phase}` };
    }
  }
  
  /**
   * Executar fase de votação simples
   */
  async executeSimpleVotingPhase(consensus, roundData) {
    const phase = consensus.currentPhase;
    
    switch (phase) {
      case 'proposal':
        return await this.executeVotingProposal(consensus, roundData);
      case 'voting':
        return await this.executeVoting(consensus, roundData);
      case 'counting':
        return await this.executeVoteCounting(consensus, roundData);
      case 'decision':
        return await this.executeDecision(consensus, roundData);
      default:
        return { success: false, error: `Unknown voting phase: ${phase}` };
    }
  }
  
  /**
   * Executar proposta de votação
   */
  async executeVotingProposal(consensus, roundData) {
    this.logger.info('Executing voting proposal phase', {
      consensusId: consensus.id
    });
    
    // Coletar propostas dos participantes
    const proposals = await this.collectProposals(consensus, roundData);
    
    // Validar propostas
    const validProposals = this.validateProposals(proposals, consensus);
    
    // Registrar propostas
    consensus.proposals.push({
      round: consensus.currentRound,
      phase: consensus.currentPhase,
      proposals: validProposals,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      proposals: validProposals.length,
      validProposals,
      shouldAdvance: validProposals.length > 0
    };
  }
  
  /**
   * Executar votação
   */
  async executeVoting(consensus, roundData) {
    this.logger.info('Executing voting phase', {
      consensusId: consensus.id,
      mechanism: consensus.votingMechanism
    });
    
    // Coletar votos dos participantes
    const votes = await this.collectVotes(consensus, roundData);
    
    // Validar votos
    const validVotes = this.validateVotes(votes, consensus);
    
    // Registrar votos
    consensus.votes.push({
      round: consensus.currentRound,
      phase: consensus.currentPhase,
      votes: validVotes,
      timestamp: new Date().toISOString()
    });
    
    // Atualizar atividade dos participantes
    this.updateParticipantActivity(consensus, validVotes);
    
    return {
      success: true,
      votesReceived: validVotes.length,
      participationRate: validVotes.length / consensus.participants.length,
      validVotes,
      shouldAdvance: this.checkQuorum(consensus, validVotes)
    };
  }
  
  /**
   * Executar contagem de votos
   */
  async executeVoteCounting(consensus, roundData) {
    this.logger.info('Executing vote counting phase', {
      consensusId: consensus.id
    });
    
    // Obter votos da rodada atual
    const currentRoundVotes = this.getCurrentRoundVotes(consensus);
    
    // Contar votos baseado no mecanismo
    const countingResult = await this.countVotes(consensus, currentRoundVotes);
    
    // Verificar se threshold foi atingido
    const thresholdMet = this.checkThreshold(consensus, countingResult);
    
    return {
      success: true,
      countingResult,
      thresholdMet,
      winner: countingResult.winner,
      shouldAdvance: thresholdMet
    };
  }
  
  /**
   * Executar decisão
   */
  async executeDecision(consensus, roundData) {
    this.logger.info('Executing decision phase', {
      consensusId: consensus.id
    });
    
    // Obter resultado da contagem
    const lastCounting = consensus.votes[consensus.votes.length - 1];
    if (!lastCounting) {
      throw new Error('No voting results available for decision');
    }
    
    // Tomar decisão baseada nos resultados
    const decision = await this.makeDecision(consensus, lastCounting);
    
    // Registrar decisão
    consensus.decisions.push({
      round: consensus.currentRound,
      decision,
      rationale: decision.rationale,
      confidence: decision.confidence,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      decision,
      finalDecision: decision.final,
      shouldAdvance: decision.final
    };
  }
  
  /**
   * Coletar propostas
   */
  async collectProposals(consensus, roundData) {
    const proposals = [];
    
    for (const participant of consensus.participants) {
      // Simular coleta de proposta
      const proposal = {
        participantId: participant.id,
        content: {
          option: consensus.options[Math.floor(Math.random() * consensus.options.length)],
          reasoning: `Reasoning from ${participant.id}`,
          priority: Math.random(),
          confidence: Math.random()
        },
        timestamp: new Date().toISOString()
      };
      
      proposals.push(proposal);
    }
    
    return proposals;
  }
  
  /**
   * Coletar votos
   */
  async collectVotes(consensus, roundData) {
    const votes = [];
    
    for (const participant of consensus.participants) {
      const vote = {
        participantId: participant.id,
        choice: this.simulateVoteChoice(consensus, participant),
        weight: participant.weight || 1,
        confidence: Math.random(),
        timestamp: new Date().toISOString()
      };
      
      votes.push(vote);
    }
    
    return votes;
  }
  
  /**
   * Simular escolha de voto
   */
  simulateVoteChoice(consensus, participant) {
    const mechanism = consensus.votingConfig;
    
    switch (mechanism.type) {
      case 'preferential':
        // Ranking de opções
        return consensus.options.sort(() => Math.random() - 0.5);
      case 'approval_based':
        // Múltiplas aprovações
        return consensus.options.filter(() => Math.random() > 0.5);
      default:
        // Escolha única
        return consensus.options[Math.floor(Math.random() * consensus.options.length)];
    }
  }
  
  /**
   * Contar votos
   */
  async countVotes(consensus, votes) {
    const mechanism = consensus.votingConfig;
    
    switch (mechanism.type) {
      case 'majority_based':
      case 'supermajority_based':
      case 'unanimous':
        return this.countMajorityVotes(votes, mechanism);
      case 'weighted':
        return this.countWeightedVotes(votes, mechanism);
      case 'preferential':
        return this.countRankedChoiceVotes(votes, mechanism);
      case 'approval_based':
        return this.countApprovalVotes(votes, mechanism);
      default:
        return this.countSimpleVotes(votes);
    }
  }
  
  /**
   * Contar votos por maioria
   */
  countMajorityVotes(votes, mechanism) {
    const counts = new Map();
    
    for (const vote of votes) {
      const choice = vote.choice;
      counts.set(choice, (counts.get(choice) || 0) + 1);
    }
    
    const totalVotes = votes.length;
    const results = Array.from(counts.entries()).map(([choice, count]) => ({
      choice,
      count,
      percentage: count / totalVotes
    }));
    
    results.sort((a, b) => b.count - a.count);
    
    const winner = results[0];
    const thresholdMet = winner && winner.percentage >= mechanism.threshold;
    
    return {
      results,
      winner: thresholdMet ? winner.choice : null,
      thresholdMet,
      totalVotes,
      requiredThreshold: mechanism.threshold
    };
  }
  
  /**
   * Contar votos ponderados
   */
  countWeightedVotes(votes, mechanism) {
    const weightedCounts = new Map();
    let totalWeight = 0;
    
    for (const vote of votes) {
      const choice = vote.choice;
      const weight = vote.weight || 1;
      weightedCounts.set(choice, (weightedCounts.get(choice) || 0) + weight);
      totalWeight += weight;
    }
    
    const results = Array.from(weightedCounts.entries()).map(([choice, weight]) => ({
      choice,
      weight,
      percentage: weight / totalWeight
    }));
    
    results.sort((a, b) => b.weight - a.weight);
    
    const winner = results[0];
    const thresholdMet = winner && winner.percentage >= mechanism.threshold;
    
    return {
      results,
      winner: thresholdMet ? winner.choice : null,
      thresholdMet,
      totalWeight,
      requiredThreshold: mechanism.threshold
    };
  }
  
  /**
   * Calcular convergência
   */
  calculateConvergence(consensus, phaseResult) {
    // Calcular baseado na distribuição de votos
    if (consensus.votes.length === 0) return 0;
    
    const lastVoting = consensus.votes[consensus.votes.length - 1];
    if (!lastVoting || lastVoting.votes.length === 0) return 0;
    
    // Calcular entropia da distribuição de votos
    const choiceCounts = new Map();
    for (const vote of lastVoting.votes) {
      const choice = Array.isArray(vote.choice) ? vote.choice[0] : vote.choice;
      choiceCounts.set(choice, (choiceCounts.get(choice) || 0) + 1);
    }
    
    const totalVotes = lastVoting.votes.length;
    let entropy = 0;
    
    for (const count of choiceCounts.values()) {
      const probability = count / totalVotes;
      if (probability > 0) {
        entropy -= probability * Math.log2(probability);
      }
    }
    
    // Normalizar entropia (0 = consenso total, 1 = máxima dispersão)
    const maxEntropy = Math.log2(consensus.options.length);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
    
    // Convergência é o inverso da entropia normalizada
    return 1 - normalizedEntropy;
  }
  
  /**
   * Determinar avanço
   */
  determineAdvancement(consensus, phaseResult, convergence) {
    const algorithm = consensus.algorithmConfig;
    const currentPhaseIndex = consensus.phaseIndex;
    const isLastPhase = currentPhaseIndex >= algorithm.phases.length - 1;
    
    // Verificar se deve avançar fase
    if (phaseResult.shouldAdvance && !isLastPhase) {
      return {
        shouldAdvancePhase: true,
        shouldAdvanceRound: false,
        nextAction: 'advance_phase'
      };
    }
    
    // Verificar se deve avançar rodada
    if (convergence < 0.8 && consensus.currentRound < consensus.maxRounds) {
      return {
        shouldAdvancePhase: false,
        shouldAdvanceRound: true,
        nextAction: 'advance_round'
      };
    }
    
    // Continuar na fase atual
    return {
      shouldAdvancePhase: false,
      shouldAdvanceRound: false,
      nextAction: 'continue_phase'
    };
  }
  
  /**
   * Verificar condições de término
   */
  checkTerminationConditions(consensus, phaseResult, convergence) {
    // Verificar se decisão foi tomada
    if (consensus.decisions.length > 0 && consensus.decisions[consensus.decisions.length - 1].final) {
      return {
        shouldTerminate: true,
        reason: 'decision_reached',
        result: 'success'
      };
    }
    
    // Verificar convergência alta
    if (convergence >= 0.95) {
      return {
        shouldTerminate: true,
        reason: 'high_convergence',
        result: 'success'
      };
    }
    
    // Verificar máximo de rodadas
    if (consensus.currentRound >= consensus.maxRounds) {
      return {
        shouldTerminate: true,
        reason: 'max_rounds_reached',
        result: convergence >= 0.6 ? 'partial_success' : 'failure'
      };
    }
    
    // Verificar se chegou à última fase
    const algorithm = consensus.algorithmConfig;
    if (consensus.phaseIndex >= algorithm.phases.length - 1 && phaseResult.shouldAdvance) {
      return {
        shouldTerminate: true,
        reason: 'algorithm_completed',
        result: consensus.decisions.length > 0 ? 'success' : 'no_decision'
      };
    }
    
    return {
      shouldTerminate: false
    };
  }
  
  /**
   * Terminar consenso
   */
  async terminateConsensus(consensusId, reason, result) {
    const consensus = this.activeConsensus.get(consensusId);
    if (!consensus) {
      throw new Error(`Consensus ${consensusId} not found`);
    }
    
    const totalDuration = Date.now() - consensus.startTime;
    
    // Atualizar status
    consensus.status = 'completed';
    consensus.terminationReason = reason;
    consensus.result = result;
    consensus.completedAt = new Date().toISOString();
    consensus.totalDuration = totalDuration;
    
    // Atualizar métricas
    if (result === 'success' || result === 'partial_success') {
      this.consensusMetrics.successfulConsensus++;
    }
    
    this.updateConsensusMetrics(consensus);
    
    // Mover para histórico
    this.moveToHistory(consensus);
    
    // Remover da lista ativa
    this.activeConsensus.delete(consensusId);
    
    this.logger.info('Consensus terminated', {
      consensusId,
      reason,
      result,
      duration: totalDuration,
      rounds: consensus.currentRound
    });
    
    return {
      consensusId,
      status: 'completed',
      reason,
      result,
      duration: totalDuration,
      rounds: consensus.currentRound,
      decisions: consensus.decisions.length,
      finalConvergence: consensus.convergenceHistory.length > 0 ? 
        consensus.convergenceHistory[consensus.convergenceHistory.length - 1].score : 0
    };
  }
  
  /**
   * Calcular pesos dos participantes
   */
  calculateParticipantWeights(consensus) {
    for (const participant of consensus.participants) {
      // Simular cálculo de peso baseado em reputação, expertise, etc.
      participant.weight = 0.5 + Math.random() * 0.5; // Peso entre 0.5 e 1.0
    }
  }
  
  /**
   * Validar configuração de consenso
   */
  validateConsensusConfig(config) {
    const errors = [];
    
    if (!config.algorithm) {
      errors.push('Algorithm is required');
    } else if (!this.consensusAlgorithms.has(config.algorithm)) {
      errors.push(`Unknown algorithm: ${config.algorithm}`);
    }
    
    if (!config.participants || config.participants.length < 2) {
      errors.push('At least 2 participants are required');
    }
    
    if (!config.options || config.options.length < 2) {
      errors.push('At least 2 options are required');
    }
    
    if (config.algorithm && this.consensusAlgorithms.has(config.algorithm)) {
      const algorithm = this.consensusAlgorithms.get(config.algorithm);
      const participantCount = config.participants?.length || 0;
      
      if (participantCount < algorithm.requirements.minNodes) {
        errors.push(`Algorithm ${config.algorithm} requires at least ${algorithm.requirements.minNodes} participants`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Atualizar métricas de consenso
   */
  updateConsensusMetrics(consensus) {
    // Atualizar média de rodadas
    const totalRounds = this.consensusMetrics.averageRounds * 
                       (this.consensusMetrics.totalConsensus - 1) + consensus.currentRound;
    this.consensusMetrics.averageRounds = totalRounds / this.consensusMetrics.totalConsensus;
    
    // Atualizar média de participantes
    const totalParticipants = this.consensusMetrics.averageParticipants * 
                             (this.consensusMetrics.totalConsensus - 1) + consensus.participants.length;
    this.consensusMetrics.averageParticipants = totalParticipants / this.consensusMetrics.totalConsensus;
    
    // Atualizar tempo médio de convergência
    const totalTime = this.consensusMetrics.averageConvergenceTime * 
                     (this.consensusMetrics.totalConsensus - 1) + consensus.totalDuration;
    this.consensusMetrics.averageConvergenceTime = totalTime / this.consensusMetrics.totalConsensus;
  }
  
  /**
   * Atualizar uso de algoritmo
   */
  updateAlgorithmUsage(algorithm) {
    if (!this.consensusMetrics.algorithmUsage.has(algorithm)) {
      this.consensusMetrics.algorithmUsage.set(algorithm, 0);
    }
    
    this.consensusMetrics.algorithmUsage.set(
      algorithm,
      this.consensusMetrics.algorithmUsage.get(algorithm) + 1
    );
  }
  
  /**
   * Mover consenso para histórico
   */
  moveToHistory(consensus) {
    const algorithm = consensus.algorithm;
    
    if (!this.consensusHistory.has(algorithm)) {
      this.consensusHistory.set(algorithm, []);
    }
    
    const algorithmHistory = this.consensusHistory.get(algorithm);
    algorithmHistory.push({
      id: consensus.id,
      algorithm: consensus.algorithm,
      participants: consensus.participants.length,
      result: consensus.result,
      duration: consensus.totalDuration,
      rounds: consensus.currentRound,
      decisions: consensus.decisions.length,
      finalConvergence: consensus.convergenceHistory.length > 0 ? 
        consensus.convergenceHistory[consensus.convergenceHistory.length - 1].score : 0,
      completedAt: consensus.completedAt
    });
    
    // Manter apenas os últimos 50 registros por algoritmo
    if (algorithmHistory.length > 50) {
      algorithmHistory.shift();
    }
  }
  
  /**
   * Avançar para próxima fase
   */
  advancePhase(consensusId) {
    const consensus = this.activeConsensus.get(consensusId);
    if (!consensus) return false;
    
    const phases = consensus.algorithmConfig.phases;
    if (consensus.phaseIndex < phases.length - 1) {
      consensus.phaseIndex++;
      consensus.currentPhase = phases[consensus.phaseIndex];
      consensus.updatedAt = new Date().toISOString();
      
      this.activeConsensus.set(consensusId, consensus);
      
      this.logger.info('Advanced to next phase', {
        consensusId,
        newPhase: consensus.currentPhase,
        phaseIndex: consensus.phaseIndex
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Avançar para próxima rodada
   */
  advanceRound(consensusId) {
    const consensus = this.activeConsensus.get(consensusId);
    if (!consensus) return false;
    
    if (consensus.currentRound < consensus.maxRounds) {
      consensus.currentRound++;
      consensus.phaseIndex = 0; // Reiniciar fases
      consensus.currentPhase = consensus.algorithmConfig.phases[0];
      consensus.updatedAt = new Date().toISOString();
      
      this.activeConsensus.set(consensusId, consensus);
      
      this.logger.info('Advanced to next round', {
        consensusId,
        newRound: consensus.currentRound,
        maxRounds: consensus.maxRounds
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Gerar ID único para consenso
   */
  generateConsensusId() {
    return `consensus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Obter consenso por ID
   */
  getConsensus(consensusId) {
    return this.activeConsensus.get(consensusId);
  }
  
  /**
   * Listar consensos ativos
   */
  getActiveConsensus() {
    return Array.from(this.activeConsensus.values());
  }
  
  /**
   * Obter estatísticas do serviço
   */
  getStats() {
    return {
      metrics: this.consensusMetrics,
      activeConsensus: this.activeConsensus.size,
      availableAlgorithms: this.consensusAlgorithms.size,
      availableVotingMechanisms: this.votingMechanisms.size,
      algorithms: Array.from(this.consensusAlgorithms.keys()),
      votingMechanisms: Array.from(this.votingMechanisms.keys()),
      historySize: Array.from(this.consensusHistory.values())
        .reduce((total, history) => total + history.length, 0)
    };
  }
  
  // Métodos auxiliares simplificados
  
  validateProposals(proposals, consensus) {
    return proposals.filter(p => p.content && p.content.option);
  }
  
  validateVotes(votes, consensus) {
    return votes.filter(v => v.choice !== undefined && v.choice !== null);
  }
  
  updateParticipantActivity(consensus, votes) {
    for (const vote of votes) {
      if (!consensus.metrics.participantActivity.has(vote.participantId)) {
        consensus.metrics.participantActivity.set(vote.participantId, {
          votes: 0,
          lastActivity: new Date().toISOString()
        });
      }
      
      const activity = consensus.metrics.participantActivity.get(vote.participantId);
      activity.votes++;
      activity.lastActivity = new Date().toISOString();
    }
  }
  
  checkQuorum(consensus, votes) {
    const mechanism = consensus.votingConfig;
    if (!mechanism.quorumRequired) return true;
    
    const participationRate = votes.length / consensus.participants.length;
    return participationRate >= 0.5; // 50% de quorum mínimo
  }
  
  getCurrentRoundVotes(consensus) {
    const currentRoundVoting = consensus.votes.find(v => v.round === consensus.currentRound);
    return currentRoundVoting ? currentRoundVoting.votes : [];
  }
  
  checkThreshold(consensus, countingResult) {
    return countingResult.thresholdMet;
  }
  
  async makeDecision(consensus, votingResult) {
    const countingResult = await this.countVotes(consensus, votingResult.votes);
    
    return {
      option: countingResult.winner,
      confidence: countingResult.thresholdMet ? 0.9 : 0.6,
      rationale: `Decision based on ${consensus.votingMechanism} with ${countingResult.totalVotes || countingResult.totalWeight} total votes/weight`,
      final: countingResult.thresholdMet,
      votingResults: countingResult
    };
  }
  
  countSimpleVotes(votes) {
    return this.countMajorityVotes(votes, { threshold: 0.5 });
  }
  
  countRankedChoiceVotes(votes, mechanism) {
    // Implementação simplificada do ranked choice
    const firstChoices = votes.map(v => Array.isArray(v.choice) ? v.choice[0] : v.choice);
    return this.countMajorityVotes(
      firstChoices.map(choice => ({ choice })), 
      mechanism
    );
  }
  
  countApprovalVotes(votes, mechanism) {
    const approvalCounts = new Map();
    
    for (const vote of votes) {
      const approvals = Array.isArray(vote.choice) ? vote.choice : [vote.choice];
      for (const approval of approvals) {
        approvalCounts.set(approval, (approvalCounts.get(approval) || 0) + 1);
      }
    }
    
    const results = Array.from(approvalCounts.entries()).map(([choice, count]) => ({
      choice,
      count,
      percentage: count / votes.length
    }));
    
    results.sort((a, b) => b.count - a.count);
    
    return {
      results,
      winner: results[0]?.choice || null,
      thresholdMet: results.length > 0,
      totalVotes: votes.length
    };
  }
  
  // Implementações simplificadas das fases específicas dos algoritmos
  
  async executePBFTPrePrepare(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'PBFT Pre-prepare completed' };
  }
  
  async executePBFTPrepare(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'PBFT Prepare completed' };
  }
  
  async executePBFTCommit(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'PBFT Commit completed' };
  }
  
  async executePBFTReply(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'PBFT Reply completed' };
  }
  
  async executeRaftLeaderElection(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'Raft Leader Election completed' };
  }
  
  async executeRaftLogReplication(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'Raft Log Replication completed' };
  }
  
  async executeRaftSafety(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'Raft Safety check completed' };
  }
  
  async executePaxosPhase(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'Paxos phase completed' };
  }
  
  async executeWeightedConsensusPhase(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'Weighted consensus phase completed' };
  }
  
  async executeGradualConsensusPhase(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'Gradual consensus phase completed' };
  }
  
  async executeGenericPhase(consensus, roundData) {
    return { success: true, shouldAdvance: true, message: 'Generic phase completed' };
  }
}

module.exports = ConsensusService;