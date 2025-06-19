/**
 * Tests for Agent Lifecycle Manager
 * Testes para o gerenciador de ciclo de vida dos agentes
 */

const request = require('supertest')
const { expect } = require('chai')
const sinon = require('sinon')
const express = require('express')
const config = require('../config/lifecycleConfig')

// Mock dos serviços
const mockServices = {
  lifecycleService: {
    startAgent: sinon.stub(),
    stopAgent: sinon.stub(),
    restartAgent: sinon.stub(),
    startAllAgents: sinon.stub(),
    stopAllAgents: sinon.stub(),
    getSystemStatus: sinon.stub()
  },
  agentRegistry: {
    registerAgent: sinon.stub(),
    unregisterAgent: sinon.stub(),
    getAgent: sinon.stub(),
    getAllAgents: sinon.stub(),
    getAgentsByState: sinon.stub(),
    getAgentsByCategory: sinon.stub(),
    updateAgent: sinon.stub(),
    getAgentStatistics: sinon.stub(),
    validateAgentConfig: sinon.stub(),
    getAgentDependencies: sinon.stub(),
    getAgentDependents: sinon.stub()
  },
  processManager: {
    getProcessInfo: sinon.stub(),
    getAllProcesses: sinon.stub(),
    getProcessStatistics: sinon.stub(),
    killProcess: sinon.stub()
  },
  eventService: {
    publishEvent: sinon.stub(),
    getEventHistory: sinon.stub(),
    getEventStatistics: sinon.stub(),
    getConsumerStatistics: sinon.stub(),
    testConnection: sinon.stub()
  },
  logger: {
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    debug: sinon.stub()
  }
}

// Configurar app de teste
const app = express()
app.use(express.json())

// Importar rotas
const apiRoutes = require('../routes/api')(mockServices)
const healthRoutes = require('../routes/health')(mockServices)
const metricsRoutes = require('../routes/metrics')(mockServices)

app.use('/api', apiRoutes)
app.use('/health', healthRoutes)
app.use('/metrics', metricsRoutes)

describe('Agent Lifecycle Manager', () => {
  beforeEach(() => {
    // Reset todos os stubs antes de cada teste
    Object.values(mockServices).forEach(service => {
      if (typeof service === 'object') {
        Object.values(service).forEach(method => {
          if (typeof method.reset === 'function') {
            method.reset()
          }
        })
      }
    })
  })

  describe('Health Checks', () => {
    it('deve retornar status de saúde básico', async () => {
      mockServices.agentRegistry.getAgentStatistics.resolves({ total: 5, byState: { running: 3, stopped: 2 } })
      mockServices.processManager.getProcessStatistics.resolves({ active: 3, total: 5 })
      mockServices.eventService.getEventStatistics.resolves({ totalEvents: 100 })
      mockServices.eventService.testConnection.resolves(true)

      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).to.have.property('status')
      expect(response.body).to.have.property('timestamp')
      expect(response.body).to.have.property('uptime')
      expect(response.body).to.have.property('services')
    })

    it('deve retornar status degradado quando serviços falham', async () => {
      mockServices.agentRegistry.getAgentStatistics.rejects(new Error('Registry error'))
      mockServices.processManager.getProcessStatistics.resolves({ active: 0, total: 0 })
      mockServices.eventService.testConnection.resolves(false)

      const response = await request(app)
        .get('/health')
        .expect(503)

      expect(response.body.status).to.equal('degraded')
    })

    it('deve retornar readiness check', async () => {
      mockServices.agentRegistry.getAgentStatistics.resolves({ total: 5 })
      mockServices.processManager.getProcessStatistics.resolves({ active: 3 })
      mockServices.eventService.getEventStatistics.resolves({ totalEvents: 100 })
      mockServices.eventService.testConnection.resolves(true)

      const response = await request(app)
        .get('/health/ready')
        .expect(200)

      expect(response.body).to.have.property('ready', true)
      expect(response.body).to.have.property('checks')
    })

    it('deve retornar liveness check', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200)

      expect(response.body).to.have.property('alive', true)
      expect(response.body).to.have.property('pid')
      expect(response.body).to.have.property('uptime')
    })
  })

  describe('API - Gerenciamento de Agentes', () => {
    const validApiKey = config.security.apiKey

    it('deve listar todos os agentes', async () => {
      const mockAgents = [
        { id: 'agent1', name: 'Agent 1', state: 'running' },
        { id: 'agent2', name: 'Agent 2', state: 'stopped' }
      ]
      
      mockServices.agentRegistry.getAllAgents.resolves(mockAgents)

      const response = await request(app)
        .get('/api/agents')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.agents).to.deep.equal(mockAgents)
      expect(response.body.data.count).to.equal(2)
    })

    it('deve rejeitar requisições sem API key', async () => {
      const response = await request(app)
        .get('/api/agents')
        .expect(401)

      expect(response.body.success).to.be.false
      expect(response.body.error).to.contain('API key')
    })

    it('deve obter informações de um agente específico', async () => {
      const mockAgent = { id: 'agent1', name: 'Agent 1', state: 'running' }
      const mockProcess = { pid: 1234, uptime: 3600 }
      const mockDependencies = ['agent2']
      const mockDependents = ['agent3']
      
      mockServices.agentRegistry.getAgent.resolves(mockAgent)
      mockServices.processManager.getProcessInfo.resolves(mockProcess)
      mockServices.agentRegistry.getAgentDependencies.resolves(mockDependencies)
      mockServices.agentRegistry.getAgentDependents.resolves(mockDependents)

      const response = await request(app)
        .get('/api/agents/agent1')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.agent).to.deep.equal(mockAgent)
      expect(response.body.data.process).to.deep.equal(mockProcess)
      expect(response.body.data.dependencies).to.deep.equal(mockDependencies)
      expect(response.body.data.dependents).to.deep.equal(mockDependents)
    })

    it('deve retornar 404 para agente não encontrado', async () => {
      mockServices.agentRegistry.getAgent.resolves(null)

      const response = await request(app)
        .get('/api/agents/nonexistent')
        .set('X-API-Key', validApiKey)
        .expect(404)

      expect(response.body.success).to.be.false
      expect(response.body.error).to.contain('não encontrado')
    })

    it('deve registrar um novo agente', async () => {
      const newAgent = {
        id: 'new-agent',
        name: 'New Agent',
        category: 'auxiliary',
        port: 3000,
        healthEndpoint: '/health'
      }
      
      const registeredAgent = { ...newAgent, state: 'stopped', createdAt: new Date() }
      
      mockServices.agentRegistry.validateAgentConfig.resolves({ valid: true, errors: [] })
      mockServices.agentRegistry.registerAgent.resolves(registeredAgent)

      const response = await request(app)
        .post('/api/agents')
        .set('X-API-Key', validApiKey)
        .send(newAgent)
        .expect(201)

      expect(response.body.success).to.be.true
      expect(response.body.data.agent).to.deep.equal(registeredAgent)
      expect(mockServices.agentRegistry.registerAgent.calledWith('new-agent', newAgent)).to.be.true
    })

    it('deve rejeitar registro de agente com configuração inválida', async () => {
      const invalidAgent = { name: 'Invalid Agent' } // sem ID
      
      const response = await request(app)
        .post('/api/agents')
        .set('X-API-Key', validApiKey)
        .send(invalidAgent)
        .expect(400)

      expect(response.body.success).to.be.false
      expect(response.body.error).to.contain('ID do agente é obrigatório')
    })

    it('deve atualizar configuração de um agente', async () => {
      const updates = { name: 'Updated Agent Name' }
      const updatedAgent = { id: 'agent1', name: 'Updated Agent Name', state: 'running' }
      
      mockServices.agentRegistry.updateAgent.resolves(updatedAgent)

      const response = await request(app)
        .put('/api/agents/agent1')
        .set('X-API-Key', validApiKey)
        .send(updates)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.agent).to.deep.equal(updatedAgent)
      expect(mockServices.agentRegistry.updateAgent.calledWith('agent1', updates)).to.be.true
    })

    it('deve remover um agente', async () => {
      mockServices.lifecycleService.stopAgent.resolves({ success: true })
      mockServices.agentRegistry.unregisterAgent.resolves()

      const response = await request(app)
        .delete('/api/agents/agent1')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.message).to.contain('removido com sucesso')
      expect(mockServices.lifecycleService.stopAgent.calledWith('agent1')).to.be.true
      expect(mockServices.agentRegistry.unregisterAgent.calledWith('agent1')).to.be.true
    })
  })

  describe('API - Controle de Ciclo de Vida', () => {
    const validApiKey = config.security.apiKey

    it('deve iniciar um agente', async () => {
      const startResult = { success: true, pid: 1234, startedAt: new Date() }
      
      mockServices.lifecycleService.startAgent.resolves(startResult)

      const response = await request(app)
        .post('/api/agents/agent1/start')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.deep.equal(startResult)
      expect(response.body.message).to.contain('iniciado com sucesso')
      expect(mockServices.lifecycleService.startAgent.calledWith('agent1')).to.be.true
    })

    it('deve parar um agente', async () => {
      const stopResult = { success: true, stoppedAt: new Date() }
      
      mockServices.lifecycleService.stopAgent.resolves(stopResult)

      const response = await request(app)
        .post('/api/agents/agent1/stop')
        .set('X-API-Key', validApiKey)
        .send({ force: false })
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.deep.equal(stopResult)
      expect(response.body.message).to.contain('parado com sucesso')
      expect(mockServices.lifecycleService.stopAgent.calledWith('agent1', { force: false })).to.be.true
    })

    it('deve reiniciar um agente', async () => {
      const restartResult = { success: true, pid: 5678, restartedAt: new Date() }
      
      mockServices.lifecycleService.restartAgent.resolves(restartResult)

      const response = await request(app)
        .post('/api/agents/agent1/restart')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.deep.equal(restartResult)
      expect(response.body.message).to.contain('reiniciado com sucesso')
      expect(mockServices.lifecycleService.restartAgent.calledWith('agent1')).to.be.true
    })

    it('deve iniciar todos os agentes', async () => {
      const startAllResults = [
        { agentId: 'agent1', success: true },
        { agentId: 'agent2', success: true },
        { agentId: 'agent3', success: false, error: 'Failed to start' }
      ]
      
      mockServices.lifecycleService.startAllAgents.resolves(startAllResults)

      const response = await request(app)
        .post('/api/agents/start-all')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.results).to.deep.equal(startAllResults)
      expect(response.body.data.summary.successful).to.equal(2)
      expect(response.body.data.summary.failed).to.equal(1)
    })

    it('deve parar todos os agentes', async () => {
      const stopAllResults = [
        { agentId: 'agent1', success: true },
        { agentId: 'agent2', success: true }
      ]
      
      mockServices.lifecycleService.stopAllAgents.resolves(stopAllResults)

      const response = await request(app)
        .post('/api/agents/stop-all')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.results).to.deep.equal(stopAllResults)
      expect(response.body.data.summary.successful).to.equal(2)
      expect(response.body.data.summary.failed).to.equal(0)
    })
  })

  describe('API - Processos', () => {
    const validApiKey = config.security.apiKey

    it('deve listar todos os processos', async () => {
      const mockProcesses = [
        { agentId: 'agent1', pid: 1234, uptime: 3600 },
        { agentId: 'agent2', pid: 5678, uptime: 1800 }
      ]
      
      mockServices.processManager.getAllProcesses.resolves(mockProcesses)

      const response = await request(app)
        .get('/api/processes')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.processes).to.deep.equal(mockProcesses)
      expect(response.body.data.count).to.equal(2)
    })

    it('deve obter informações de um processo específico', async () => {
      const mockProcess = { agentId: 'agent1', pid: 1234, uptime: 3600, memoryUsage: { rss: 50000000 } }
      
      mockServices.processManager.getProcessInfo.resolves(mockProcess)

      const response = await request(app)
        .get('/api/processes/agent1')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.process).to.deep.equal(mockProcess)
    })

    it('deve enviar sinal para um processo', async () => {
      const killResult = { success: true, signal: 'SIGTERM' }
      
      mockServices.processManager.killProcess.resolves(killResult)

      const response = await request(app)
        .post('/api/processes/agent1/signal')
        .set('X-API-Key', validApiKey)
        .send({ signal: 'SIGTERM' })
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.deep.equal(killResult)
      expect(mockServices.processManager.killProcess.calledWith('agent1', 'SIGTERM')).to.be.true
    })
  })

  describe('API - Eventos', () => {
    const validApiKey = config.security.apiKey

    it('deve obter histórico de eventos', async () => {
      const mockEvents = {
        events: [
          { id: '1', type: 'agent_started', timestamp: new Date(), agentId: 'agent1' },
          { id: '2', type: 'agent_stopped', timestamp: new Date(), agentId: 'agent2' }
        ],
        total: 2,
        hasMore: false
      }
      
      mockServices.eventService.getEventHistory.resolves(mockEvents)

      const response = await request(app)
        .get('/api/events?limit=10&offset=0')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.deep.equal(mockEvents)
    })

    it('deve publicar evento customizado', async () => {
      const customEvent = {
        type: 'custom_event',
        timestamp: new Date().toISOString(),
        data: { message: 'Test event' }
      }
      
      mockServices.eventService.publishEvent.resolves()

      const response = await request(app)
        .post('/api/events')
        .set('X-API-Key', validApiKey)
        .send(customEvent)
        .expect(201)

      expect(response.body.success).to.be.true
      expect(response.body.message).to.contain('publicado com sucesso')
      expect(mockServices.eventService.publishEvent.calledWith(customEvent)).to.be.true
    })

    it('deve rejeitar evento sem tipo ou timestamp', async () => {
      const invalidEvent = { data: { message: 'Invalid event' } }

      const response = await request(app)
        .post('/api/events')
        .set('X-API-Key', validApiKey)
        .send(invalidEvent)
        .expect(400)

      expect(response.body.success).to.be.false
      expect(response.body.error).to.contain('obrigatórios')
    })
  })

  describe('API - Status e Estatísticas', () => {
    const validApiKey = config.security.apiKey

    it('deve retornar status geral do sistema', async () => {
      const mockSystemStatus = { totalAgents: 5, runningAgents: 3 }
      const mockProcessStats = { active: 3, total: 5 }
      const mockAgentStats = { total: 5, byState: { running: 3, stopped: 2 } }
      const mockEventStats = { totalEvents: 100, eventsToday: 20 }
      const mockConsumerStats = { active: 2, byQueue: {} }
      
      mockServices.lifecycleService.getSystemStatus.resolves(mockSystemStatus)
      mockServices.processManager.getProcessStatistics.resolves(mockProcessStats)
      mockServices.agentRegistry.getAgentStatistics.resolves(mockAgentStats)
      mockServices.eventService.getEventStatistics.resolves(mockEventStats)
      mockServices.eventService.getConsumerStatistics.resolves(mockConsumerStats)

      const response = await request(app)
        .get('/api/status')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.system).to.deep.equal(mockSystemStatus)
      expect(response.body.data.processes).to.deep.equal(mockProcessStats)
      expect(response.body.data.agents).to.deep.equal(mockAgentStats)
      expect(response.body.data.events).to.deep.equal(mockEventStats)
      expect(response.body.data.consumers).to.deep.equal(mockConsumerStats)
    })

    it('deve retornar estatísticas detalhadas', async () => {
      const mockAgentStats = { total: 5, byState: { running: 3, stopped: 2 } }
      const mockProcessStats = { active: 3, total: 5 }
      const mockEventStats = { totalEvents: 100, eventsToday: 20 }
      
      mockServices.agentRegistry.getAgentStatistics.resolves(mockAgentStats)
      mockServices.processManager.getProcessStatistics.resolves(mockProcessStats)
      mockServices.eventService.getEventStatistics.resolves(mockEventStats)

      const response = await request(app)
        .get('/api/statistics')
        .set('X-API-Key', validApiKey)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.agents).to.deep.equal(mockAgentStats)
      expect(response.body.data.processes).to.deep.equal(mockProcessStats)
      expect(response.body.data.events).to.deep.equal(mockEventStats)
    })
  })

  describe('Métricas', () => {
    it('deve retornar métricas em formato Prometheus', async () => {
      mockServices.agentRegistry.getAgentStatistics.resolves({ total: 5, byState: { running: 3, stopped: 2 } })
      mockServices.processManager.getProcessStatistics.resolves({ active: 3, total: 5 })
      mockServices.eventService.getEventStatistics.resolves({ totalEvents: 100 })
      mockServices.eventService.getConsumerStatistics.resolves({ active: 2, byQueue: {} })
      mockServices.lifecycleService.getSystemStatus.resolves({ healthy: true })

      const response = await request(app)
        .get('/metrics')
        .expect(200)

      expect(response.headers['content-type']).to.contain('text/plain')
      expect(response.text).to.contain('# HELP')
      expect(response.text).to.contain('# TYPE')
    })

    it('deve retornar métricas em formato JSON', async () => {
      mockServices.agentRegistry.getAgentStatistics.resolves({ total: 5, byState: { running: 3, stopped: 2 } })
      mockServices.processManager.getProcessStatistics.resolves({ active: 3, total: 5 })
      mockServices.eventService.getEventStatistics.resolves({ totalEvents: 100 })
      mockServices.eventService.getConsumerStatistics.resolves({ active: 2, byQueue: {} })
      mockServices.lifecycleService.getSystemStatus.resolves({ healthy: true })

      const response = await request(app)
        .get('/metrics/json')
        .expect(200)

      expect(response.body).to.have.property('timestamp')
      expect(response.body).to.have.property('metrics')
      expect(Array.isArray(response.body.metrics)).to.be.true
    })
  })

  describe('Tratamento de Erros', () => {
    const validApiKey = config.security.apiKey

    it('deve tratar erros de serviço graciosamente', async () => {
      mockServices.agentRegistry.getAllAgents.rejects(new Error('Database connection failed'))

      const response = await request(app)
        .get('/api/agents')
        .set('X-API-Key', validApiKey)
        .expect(500)

      expect(response.body.success).to.be.false
      expect(response.body.error).to.be.a('string')
    })

    it('deve retornar 404 para endpoints inexistentes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('X-API-Key', validApiKey)
        .expect(404)

      expect(response.body.success).to.be.false
      expect(response.body.error).to.contain('não encontrado')
    })
  })
})