/**
 * API Routes for Agent Lifecycle Manager
 * Rotas da API para gerenciamento do ciclo de vida dos agentes
 */

const express = require('express')
const router = express.Router()
const config = require('../config/lifecycleConfig')

module.exports = (services) => {
  const { lifecycleService, agentRegistry, processManager, eventService, logger } = services

  // Middleware para validação de API key
  const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey
    
    if (!apiKey || apiKey !== config.security.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key inválida ou ausente'
      })
    }
    
    next()
  }

  // Middleware para logging de requests
  const logRequest = (req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      params: req.params,
      query: req.query
    })
    next()
  }

  // Aplicar middlewares
  router.use(logRequest)
  router.use(validateApiKey)

  // ===== ROTAS DE AGENTES =====

  // Listar todos os agentes
  router.get('/agents', async (req, res) => {
    try {
      const { state, category, pattern } = req.query
      let agents

      if (state) {
        agents = await agentRegistry.getAgentsByState(state)
      } else if (category) {
        agents = await agentRegistry.getAgentsByCategory(category)
      } else if (pattern) {
        agents = await agentRegistry.findAgentsByPattern(pattern)
      } else {
        agents = await agentRegistry.getAllAgents()
      }

      res.json({
        success: true,
        data: {
          agents,
          count: agents.length
        }
      })
    } catch (error) {
      logger.error('Erro ao listar agentes:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Obter informações de um agente específico
  router.get('/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params
      const agent = await agentRegistry.getAgent(agentId)
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado'
        })
      }

      // Obter informações do processo se disponível
      const processInfo = await processManager.getProcessInfo(agentId)
      
      // Obter dependências
      const dependencies = await agentRegistry.getAgentDependencies(agentId)
      const dependents = await agentRegistry.getAgentDependents(agentId)

      res.json({
        success: true,
        data: {
          agent,
          process: processInfo,
          dependencies,
          dependents
        }
      })
    } catch (error) {
      logger.error(`Erro ao obter agente ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Registrar um novo agente
  router.post('/agents', async (req, res) => {
    try {
      const agentConfig = req.body
      
      if (!agentConfig.id) {
        return res.status(400).json({
          success: false,
          error: 'ID do agente é obrigatório'
        })
      }

      // Validar configuração
      const validation = await agentRegistry.validateAgentConfig(agentConfig)
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Configuração inválida',
          details: validation.errors
        })
      }

      const agent = await agentRegistry.registerAgent(agentConfig.id, agentConfig)
      
      res.status(201).json({
        success: true,
        data: { agent },
        message: 'Agente registrado com sucesso'
      })
    } catch (error) {
      logger.error('Erro ao registrar agente:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Atualizar configuração de um agente
  router.put('/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params
      const updates = req.body
      
      const agent = await agentRegistry.updateAgent(agentId, updates)
      
      res.json({
        success: true,
        data: { agent },
        message: 'Agente atualizado com sucesso'
      })
    } catch (error) {
      logger.error(`Erro ao atualizar agente ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Remover agente do registro
  router.delete('/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params
      
      // Parar agente se estiver rodando
      try {
        await lifecycleService.stopAgent(agentId, { force: true })
      } catch (error) {
        logger.warn(`Erro ao parar agente ${agentId} antes de remover:`, error)
      }
      
      await agentRegistry.unregisterAgent(agentId)
      
      res.json({
        success: true,
        message: 'Agente removido com sucesso'
      })
    } catch (error) {
      logger.error(`Erro ao remover agente ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // ===== ROTAS DE CONTROLE DE CICLO DE VIDA =====

  // Iniciar um agente
  router.post('/agents/:agentId/start', async (req, res) => {
    try {
      const { agentId } = req.params
      const options = req.body || {}
      
      const result = await lifecycleService.startAgent(agentId, options)
      
      res.json({
        success: true,
        data: result,
        message: `Agente ${agentId} iniciado com sucesso`
      })
    } catch (error) {
      logger.error(`Erro ao iniciar agente ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Parar um agente
  router.post('/agents/:agentId/stop', async (req, res) => {
    try {
      const { agentId } = req.params
      const { force = false } = req.body || {}
      
      const result = await lifecycleService.stopAgent(agentId, { force })
      
      res.json({
        success: true,
        data: result,
        message: `Agente ${agentId} parado com sucesso`
      })
    } catch (error) {
      logger.error(`Erro ao parar agente ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Reiniciar um agente
  router.post('/agents/:agentId/restart', async (req, res) => {
    try {
      const { agentId } = req.params
      const options = req.body || {}
      
      const result = await lifecycleService.restartAgent(agentId, options)
      
      res.json({
        success: true,
        data: result,
        message: `Agente ${agentId} reiniciado com sucesso`
      })
    } catch (error) {
      logger.error(`Erro ao reiniciar agente ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Iniciar todos os agentes
  router.post('/agents/start-all', async (req, res) => {
    try {
      const options = req.body || {}
      
      const results = await lifecycleService.startAllAgents(options)
      
      const successful = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      
      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            successful,
            failed
          }
        },
        message: `${successful} agentes iniciados, ${failed} falharam`
      })
    } catch (error) {
      logger.error('Erro ao iniciar todos os agentes:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Parar todos os agentes
  router.post('/agents/stop-all', async (req, res) => {
    try {
      const options = req.body || {}
      
      const results = await lifecycleService.stopAllAgents(options)
      
      const successful = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      
      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            successful,
            failed
          }
        },
        message: `${successful} agentes parados, ${failed} falharam`
      })
    } catch (error) {
      logger.error('Erro ao parar todos os agentes:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // ===== ROTAS DE PROCESSOS =====

  // Listar todos os processos
  router.get('/processes', async (req, res) => {
    try {
      const processes = await processManager.getAllProcesses()
      
      res.json({
        success: true,
        data: {
          processes,
          count: processes.length
        }
      })
    } catch (error) {
      logger.error('Erro ao listar processos:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Obter informações de um processo específico
  router.get('/processes/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params
      const processInfo = await processManager.getProcessInfo(agentId)
      
      if (!processInfo) {
        return res.status(404).json({
          success: false,
          error: 'Processo não encontrado'
        })
      }
      
      res.json({
        success: true,
        data: { process: processInfo }
      })
    } catch (error) {
      logger.error(`Erro ao obter processo ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Enviar sinal para um processo
  router.post('/processes/:agentId/signal', async (req, res) => {
    try {
      const { agentId } = req.params
      const { signal = 'SIGTERM' } = req.body
      
      const result = await processManager.killProcess(agentId, signal)
      
      res.json({
        success: true,
        data: result,
        message: `Sinal ${signal} enviado para processo do agente ${agentId}`
      })
    } catch (error) {
      logger.error(`Erro ao enviar sinal para processo ${req.params.agentId}:`, error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // ===== ROTAS DE EVENTOS =====

  // Obter histórico de eventos
  router.get('/events', async (req, res) => {
    try {
      const {
        eventType,
        startTime,
        endTime,
        limit = 50,
        offset = 0
      } = req.query
      
      const options = {
        eventType,
        startTime,
        endTime,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
      
      const result = await eventService.getEventHistory(options)
      
      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      logger.error('Erro ao obter histórico de eventos:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Publicar evento customizado
  router.post('/events', async (req, res) => {
    try {
      const event = req.body
      
      if (!event.type || !event.timestamp) {
        return res.status(400).json({
          success: false,
          error: 'Tipo e timestamp do evento são obrigatórios'
        })
      }
      
      await eventService.publishEvent(event)
      
      res.status(201).json({
        success: true,
        message: 'Evento publicado com sucesso'
      })
    } catch (error) {
      logger.error('Erro ao publicar evento:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // ===== ROTAS DE STATUS E ESTATÍSTICAS =====

  // Status geral do sistema
  router.get('/status', async (req, res) => {
    try {
      const systemStatus = await lifecycleService.getSystemStatus()
      const processStats = await processManager.getProcessStatistics()
      const agentStats = await agentRegistry.getAgentStatistics()
      const eventStats = await eventService.getEventStatistics()
      const consumerStats = await eventService.getConsumerStatistics()
      
      res.json({
        success: true,
        data: {
          system: systemStatus,
          processes: processStats,
          agents: agentStats,
          events: eventStats,
          consumers: consumerStats,
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      logger.error('Erro ao obter status do sistema:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Estatísticas detalhadas
  router.get('/statistics', async (req, res) => {
    try {
      const agentStats = await agentRegistry.getAgentStatistics()
      const processStats = await processManager.getProcessStatistics()
      const eventStats = await eventService.getEventStatistics()
      
      res.json({
        success: true,
        data: {
          agents: agentStats,
          processes: processStats,
          events: eventStats,
          generatedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // ===== ROTAS DE ADMINISTRAÇÃO =====

  // Exportar configuração do registry
  router.get('/admin/export', async (req, res) => {
    try {
      const registryData = await agentRegistry.exportRegistry()
      
      res.json({
        success: true,
        data: registryData
      })
    } catch (error) {
      logger.error('Erro ao exportar registry:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Importar configuração do registry
  router.post('/admin/import', async (req, res) => {
    try {
      const registryData = req.body
      
      const result = await agentRegistry.importRegistry(registryData)
      
      res.json({
        success: true,
        data: result,
        message: `${result.imported} agentes importados, ${result.errors} erros`
      })
    } catch (error) {
      logger.error('Erro ao importar registry:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Limpar registry
  router.delete('/admin/registry', async (req, res) => {
    try {
      const count = await agentRegistry.clearRegistry()
      
      res.json({
        success: true,
        data: { removedCount: count },
        message: `${count} agentes removidos do registry`
      })
    } catch (error) {
      logger.error('Erro ao limpar registry:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Limpar processos órfãos
  router.post('/admin/cleanup-processes', async (req, res) => {
    try {
      const cleaned = await processManager.cleanupProcesses()
      
      res.json({
        success: true,
        data: { cleanedProcesses: cleaned },
        message: `${cleaned.length} processos órfãos removidos`
      })
    } catch (error) {
      logger.error('Erro ao limpar processos órfãos:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Limpar buffer de eventos
  router.delete('/admin/events/buffer', async (req, res) => {
    try {
      const count = eventService.clearEventBuffer()
      
      res.json({
        success: true,
        data: { clearedEvents: count },
        message: `${count} eventos removidos do buffer`
      })
    } catch (error) {
      logger.error('Erro ao limpar buffer de eventos:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // Testar conexão SQS
  router.get('/admin/test-sqs', async (req, res) => {
    try {
      const result = await eventService.testConnection()
      
      res.json({
        success: true,
        data: { connectionOk: result },
        message: result ? 'Conexão SQS OK' : 'Falha na conexão SQS'
      })
    } catch (error) {
      logger.error('Erro ao testar conexão SQS:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  // ===== TRATAMENTO DE ERROS =====

  // Handler para rotas não encontradas
  router.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint não encontrado',
      path: req.originalUrl,
      method: req.method
    })
  })

  // Handler de erros
  router.use((error, req, res, next) => {
    logger.error('Erro na API:', error)
    
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    })
  })

  return router
}