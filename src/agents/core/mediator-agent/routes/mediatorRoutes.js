/**
 * Mediator Agent Routes - Rotas da API do Agente Mediador
 * 
 * Define endpoints REST para:
 * - Gerenciamento de mediações
 * - Resolução de conflitos
 * - Coordenação de negociações
 * - Processos de consenso
 */

const express = require('express');
const router = express.Router();

/**
 * Configurar rotas do Mediator Agent
 */
function setupMediatorRoutes(services, logger, metrics) {
  const { mediationService, conflictResolutionService, negotiationService, consensusService } = services;
  
  // ==================== MEDIAÇÃO ====================
  
  /**
   * POST /api/v1/mediations
   * Iniciar nova mediação
   */
  router.post('/mediations', async (req, res) => {
    const startTime = Date.now();
    
    try {
      logger.info('Starting new mediation', {
        requestId: req.headers['x-request-id'],
        body: req.body
      });
      
      const mediation = await mediationService.createMediation(req.body);
      
      // Atualizar métricas
      metrics.totalMediations.inc();
      metrics.mediationDuration.observe(Date.now() - startTime);
      
      res.status(201).json({
        success: true,
        mediation,
        message: 'Mediation started successfully'
      });
      
    } catch (error) {
      logger.error('Error starting mediation', {
        error: error.message,
        requestId: req.headers['x-request-id']
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/mediations
   * Listar mediações ativas
   */
  router.get('/mediations', async (req, res) => {
    try {
      const { status, type, limit = 50, offset = 0 } = req.query;
      
      const mediations = await mediationService.listMediations({
        status,
        type,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        mediations,
        total: mediations.length
      });
      
    } catch (error) {
      logger.error('Error listing mediations', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/mediations/:mediationId
   * Obter detalhes de mediação específica
   */
  router.get('/mediations/:mediationId', async (req, res) => {
    try {
      const { mediationId } = req.params;
      
      const mediation = await mediationService.getMediationDetails(mediationId);
      
      if (!mediation) {
        return res.status(404).json({
          success: false,
          error: 'Mediation not found'
        });
      }
      
      res.json({
        success: true,
        mediation
      });
      
    } catch (error) {
      logger.error('Error getting mediation details', {
        error: error.message,
        mediationId: req.params.mediationId
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/mediations/:mediationId/execute
   * Executar próxima fase da mediação
   */
  router.post('/mediations/:mediationId/execute', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mediationId } = req.params;
      const { phaseData } = req.body;
      
      logger.info('Executing mediation phase', {
        mediationId,
        requestId: req.headers['x-request-id']
      });
      
      const result = await mediationService.executePhase(mediationId, phaseData);
      
      // Atualizar métricas
      metrics.mediationDuration.observe(Date.now() - startTime);
      
      if (result.conflictResolved) {
        metrics.conflictsResolved.inc();
      }
      
      res.json({
        success: true,
        result,
        message: 'Mediation phase executed successfully'
      });
      
    } catch (error) {
      logger.error('Error executing mediation phase', {
        error: error.message,
        mediationId: req.params.mediationId
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/mediations/:mediationId/finalize
   * Finalizar mediação
   */
  router.post('/mediations/:mediationId/finalize', async (req, res) => {
    try {
      const { mediationId } = req.params;
      const { resolution } = req.body;
      
      const result = await mediationService.finalizeMediation(mediationId, resolution);
      
      res.json({
        success: true,
        result,
        message: 'Mediation finalized successfully'
      });
      
    } catch (error) {
      logger.error('Error finalizing mediation', {
        error: error.message,
        mediationId: req.params.mediationId
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ==================== RESOLUÇÃO DE CONFLITOS ====================
  
  /**
   * POST /api/v1/conflicts/detect
   * Detectar conflitos
   */
  router.post('/conflicts/detect', async (req, res) => {
    try {
      const { context, agents } = req.body;
      
      logger.info('Detecting conflicts', {
        context: context?.type,
        agentsCount: agents?.length || 0
      });
      
      const conflicts = await conflictResolutionService.detectConflicts(context, agents);
      
      res.json({
        success: true,
        conflicts,
        count: conflicts.length
      });
      
    } catch (error) {
      logger.error('Error detecting conflicts', {
        error: error.message
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/conflicts/:conflictId/resolve
   * Resolver conflito específico
   */
  router.post('/conflicts/:conflictId/resolve', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { conflictId } = req.params;
      const { strategy, parameters } = req.body;
      
      logger.info('Resolving conflict', {
        conflictId,
        strategy
      });
      
      const resolution = await conflictResolutionService.resolveConflict(
        conflictId,
        strategy,
        parameters
      );
      
      // Atualizar métricas
      metrics.conflictsResolved.inc();
      metrics.mediationDuration.observe(Date.now() - startTime);
      
      res.json({
        success: true,
        resolution,
        message: 'Conflict resolved successfully'
      });
      
    } catch (error) {
      logger.error('Error resolving conflict', {
        error: error.message,
        conflictId: req.params.conflictId
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/conflicts
   * Listar conflitos
   */
  router.get('/conflicts', async (req, res) => {
    try {
      const { status, type, severity } = req.query;
      
      const conflicts = await conflictResolutionService.listConflicts({
        status,
        type,
        severity
      });
      
      res.json({
        success: true,
        conflicts,
        total: conflicts.length
      });
      
    } catch (error) {
      logger.error('Error listing conflicts', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ==================== NEGOCIAÇÃO ====================
  
  /**
   * POST /api/v1/negotiations
   * Iniciar nova negociação
   */
  router.post('/negotiations', async (req, res) => {
    try {
      const negotiationConfig = req.body;
      
      logger.info('Starting new negotiation', {
        protocol: negotiationConfig.protocol,
        participants: negotiationConfig.participants?.length || 0
      });
      
      const negotiation = await negotiationService.startNegotiation(negotiationConfig);
      
      // Atualizar métricas
      metrics.negotiationRounds.inc();
      
      res.status(201).json({
        success: true,
        negotiation,
        message: 'Negotiation started successfully'
      });
      
    } catch (error) {
      logger.error('Error starting negotiation', {
        error: error.message
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/negotiations/:negotiationId/round
   * Executar rodada de negociação
   */
  router.post('/negotiations/:negotiationId/round', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { negotiationId } = req.params;
      const { roundData } = req.body;
      
      logger.info('Executing negotiation round', {
        negotiationId
      });
      
      const result = await negotiationService.executeRound(negotiationId, roundData);
      
      // Atualizar métricas
      metrics.negotiationRounds.inc();
      metrics.mediationDuration.observe(Date.now() - startTime);
      
      res.json({
        success: true,
        result,
        message: 'Negotiation round executed successfully'
      });
      
    } catch (error) {
      logger.error('Error executing negotiation round', {
        error: error.message,
        negotiationId: req.params.negotiationId
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/negotiations
   * Listar negociações ativas
   */
  router.get('/negotiations', async (req, res) => {
    try {
      const negotiations = await negotiationService.getActiveNegotiations();
      
      res.json({
        success: true,
        negotiations,
        total: negotiations.length
      });
      
    } catch (error) {
      logger.error('Error listing negotiations', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/negotiations/:negotiationId
   * Obter detalhes de negociação
   */
  router.get('/negotiations/:negotiationId', async (req, res) => {
    try {
      const { negotiationId } = req.params;
      
      const negotiation = await negotiationService.getNegotiationDetails(negotiationId);
      
      if (!negotiation) {
        return res.status(404).json({
          success: false,
          error: 'Negotiation not found'
        });
      }
      
      res.json({
        success: true,
        negotiation
      });
      
    } catch (error) {
      logger.error('Error getting negotiation details', {
        error: error.message,
        negotiationId: req.params.negotiationId
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/negotiations/:negotiationId/terminate
   * Terminar negociação
   */
  router.post('/negotiations/:negotiationId/terminate', async (req, res) => {
    try {
      const { negotiationId } = req.params;
      const { reason } = req.body;
      
      const result = await negotiationService.terminateNegotiation(negotiationId, reason);
      
      res.json({
        success: true,
        result,
        message: 'Negotiation terminated successfully'
      });
      
    } catch (error) {
      logger.error('Error terminating negotiation', {
        error: error.message,
        negotiationId: req.params.negotiationId
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ==================== CONSENSO ====================
  
  /**
   * POST /api/v1/consensus
   * Iniciar processo de consenso
   */
  router.post('/consensus', async (req, res) => {
    try {
      const consensusConfig = req.body;
      
      logger.info('Starting consensus process', {
        algorithm: consensusConfig.algorithm,
        participants: consensusConfig.participants?.length || 0
      });
      
      const consensus = await consensusService.startConsensus(consensusConfig);
      
      // Atualizar métricas
      metrics.consensusAchieved.inc();
      
      res.status(201).json({
        success: true,
        consensus,
        message: 'Consensus process started successfully'
      });
      
    } catch (error) {
      logger.error('Error starting consensus', {
        error: error.message
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/consensus/:consensusId/round
   * Executar rodada de consenso
   */
  router.post('/consensus/:consensusId/round', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { consensusId } = req.params;
      const { roundData } = req.body;
      
      logger.info('Executing consensus round', {
        consensusId
      });
      
      const result = await consensusService.executeRound(consensusId, roundData);
      
      // Atualizar métricas
      metrics.mediationDuration.observe(Date.now() - startTime);
      
      if (result.status === 'completed') {
        metrics.consensusAchieved.inc();
      }
      
      res.json({
        success: true,
        result,
        message: 'Consensus round executed successfully'
      });
      
    } catch (error) {
      logger.error('Error executing consensus round', {
        error: error.message,
        consensusId: req.params.consensusId
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/consensus
   * Listar processos de consenso ativos
   */
  router.get('/consensus', async (req, res) => {
    try {
      const consensusProcesses = await consensusService.getActiveConsensus();
      
      res.json({
        success: true,
        consensus: consensusProcesses,
        total: consensusProcesses.length
      });
      
    } catch (error) {
      logger.error('Error listing consensus processes', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/consensus/:consensusId
   * Obter detalhes de processo de consenso
   */
  router.get('/consensus/:consensusId', async (req, res) => {
    try {
      const { consensusId } = req.params;
      
      const consensus = await consensusService.getConsensus(consensusId);
      
      if (!consensus) {
        return res.status(404).json({
          success: false,
          error: 'Consensus process not found'
        });
      }
      
      res.json({
        success: true,
        consensus
      });
      
    } catch (error) {
      logger.error('Error getting consensus details', {
        error: error.message,
        consensusId: req.params.consensusId
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ==================== ESTATÍSTICAS E MONITORAMENTO ====================
  
  /**
   * GET /api/v1/stats
   * Obter estatísticas gerais do mediador
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = {
        mediation: await mediationService.getStats(),
        conflicts: await conflictResolutionService.getStats(),
        negotiations: await negotiationService.getStats(),
        consensus: await consensusService.getStats()
      };
      
      res.json({
        success: true,
        stats
      });
      
    } catch (error) {
      logger.error('Error getting stats', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/v1/relationships
   * Obter relacionamentos entre agentes
   */
  router.get('/relationships', async (req, res) => {
    try {
      // Implementar lógica para obter relacionamentos
      const relationships = {
        totalAgents: 0,
        activeRelationships: 0,
        conflictHistory: [],
        cooperationScore: 0
      };
      
      res.json({
        success: true,
        relationships
      });
      
    } catch (error) {
      logger.error('Error getting relationships', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/relationships/update
   * Atualizar relacionamento entre agentes
   */
  router.post('/relationships/update', async (req, res) => {
    try {
      const { agentA, agentB, interaction, outcome } = req.body;
      
      // Implementar lógica para atualizar relacionamento
      const updatedRelationship = {
        agentA,
        agentB,
        score: Math.random(), // Placeholder
        lastInteraction: new Date().toISOString(),
        interactionHistory: []
      };
      
      res.json({
        success: true,
        relationship: updatedRelationship,
        message: 'Relationship updated successfully'
      });
      
    } catch (error) {
      logger.error('Error updating relationship', {
        error: error.message
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ==================== CONFIGURAÇÃO E ADMINISTRAÇÃO ====================
  
  /**
   * GET /api/v1/algorithms
   * Listar algoritmos disponíveis
   */
  router.get('/algorithms', async (req, res) => {
    try {
      const algorithms = {
        mediation: mediationService.getAvailableStrategies ? 
          await mediationService.getAvailableStrategies() : [],
        conflict: conflictResolutionService.getAvailableAlgorithms ? 
          await conflictResolutionService.getAvailableAlgorithms() : [],
        negotiation: negotiationService.getAvailableProtocols ? 
          await negotiationService.getAvailableProtocols() : [],
        consensus: consensusService.getStats ? 
          (await consensusService.getStats()).algorithms : []
      };
      
      res.json({
        success: true,
        algorithms
      });
      
    } catch (error) {
      logger.error('Error getting algorithms', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/v1/config/update
   * Atualizar configurações do mediador
   */
  router.post('/config/update', async (req, res) => {
    try {
      const { config } = req.body;
      
      // Implementar lógica para atualizar configurações
      logger.info('Updating mediator configuration', {
        config
      });
      
      res.json({
        success: true,
        message: 'Configuration updated successfully'
      });
      
    } catch (error) {
      logger.error('Error updating configuration', {
        error: error.message
      });
      
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });
  
  return router;
}

module.exports = setupMediatorRoutes;