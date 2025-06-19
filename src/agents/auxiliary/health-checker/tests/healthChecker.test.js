/**
 * Testes para Health Checker Agent
 * Fase 6: Complementação do Sistema
 */

const request = require('supertest');
const HealthCheckerAgent = require('../index');
const HealthService = require('../services/healthService');
const AlertService = require('../services/alertService');
const MetricsService = require('../services/metricsService');

// Mock dos serviços
jest.mock('../services/healthService');
jest.mock('../services/alertService');
jest.mock('../services/metricsService');
jest.mock('../../../../services/sqs-service');
jest.mock('../../../../utils/logger');

describe('Health Checker Agent', () => {
  let agent;
  let mockHealthService;
  let mockAlertService;
  let mockMetricsService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock instances
    mockHealthService = {
      on: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      getSystemStatus: jest.fn().mockReturnValue({
        overall: 'healthy',
        agents: {
          'test-agent': { status: 'healthy', responseTime: 100 }
        }
      }),
      performHealthChecks: jest.fn().mockResolvedValue()
    };
    
    mockAlertService = {
      on: jest.fn(),
      initialize: jest.fn(),
      isEnabled: true,
      getAlertHistory: jest.fn().mockReturnValue([]),
      getAlertStats: jest.fn().mockReturnValue({
        total: 0,
        byType: {},
        last24h: 0
      }),
      clearHistory: jest.fn(),
      handleAgentDown: jest.fn(),
      handleAgentDegraded: jest.fn(),
      handleAgentRecovered: jest.fn(),
      handleSystemOverload: jest.fn()
    };
    
    mockMetricsService = {
      on: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      isRunning: true,
      getAllMetrics: jest.fn().mockReturnValue({
        system: { cpu: 50, memory: 60 },
        agents: {}
      }),
      getAgentMetrics: jest.fn(),
      getMetricsHistory: jest.fn(),
      generateReport: jest.fn().mockReturnValue({
        summary: 'System healthy',
        details: {}
      }),
      processAgentStatusUpdate: jest.fn()
    };
    
    // Mock constructors
    HealthService.mockImplementation(() => mockHealthService);
    AlertService.mockImplementation(() => mockAlertService);
    MetricsService.mockImplementation(() => mockMetricsService);
    
    agent = new HealthCheckerAgent();
  });

  afterEach(async () => {
    if (agent && agent.server) {
      agent.server.close();
    }
  });

  describe('Inicialização', () => {
    test('deve criar instância corretamente', () => {
      expect(agent).toBeInstanceOf(HealthCheckerAgent);
      expect(agent.agentId).toBe('health-checker-agent');
      expect(agent.isRunning).toBe(false);
    });

    test('deve configurar serviços corretamente', () => {
      expect(HealthService).toHaveBeenCalled();
      expect(AlertService).toHaveBeenCalled();
      expect(MetricsService).toHaveBeenCalled();
    });

    test('deve configurar event listeners', () => {
      expect(mockHealthService.on).toHaveBeenCalledWith('agentDown', expect.any(Function));
      expect(mockHealthService.on).toHaveBeenCalledWith('agentDegraded', expect.any(Function));
      expect(mockHealthService.on).toHaveBeenCalledWith('agentRecovered', expect.any(Function));
      expect(mockHealthService.on).toHaveBeenCalledWith('agentStatusUpdated', expect.any(Function));
    });
  });

  describe('API Endpoints', () => {
    beforeEach(async () => {
      // Mock initialize para evitar SQS
      agent.initializeSQS = jest.fn().mockResolvedValue();
      await agent.initialize();
    });

    test('GET /health - deve retornar status de saúde', async () => {
      agent.isRunning = true;
      
      const response = await request(agent.app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        agent: 'health-checker-agent',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        services: {
          healthService: true,
          alertService: true,
          metricsService: true,
          sqsConnected: false
        },
        stats: expect.any(Object)
      });
    });

    test('GET /health - deve retornar unhealthy quando não está rodando', async () => {
      agent.isRunning = false;
      
      const response = await request(agent.app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
    });

    test('GET /status - deve retornar status do sistema', async () => {
      const response = await request(agent.app)
        .get('/status')
        .expect(200);

      expect(response.body).toMatchObject({
        agent: 'health-checker-agent',
        timestamp: expect.any(String),
        systemStatus: {
          overall: 'healthy',
          agents: expect.any(Object)
        }
      });

      expect(mockHealthService.getSystemStatus).toHaveBeenCalled();
    });

    test('GET /metrics - deve retornar métricas do sistema', async () => {
      const response = await request(agent.app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        agent: 'health-checker-agent',
        timestamp: expect.any(String),
        metrics: {
          system: expect.any(Object),
          agents: expect.any(Object)
        }
      });

      expect(mockMetricsService.getAllMetrics).toHaveBeenCalled();
    });

    test('GET /metrics/agents/:agentName - deve retornar métricas de agente específico', async () => {
      const mockAgentMetrics = {
        status: 'healthy',
        responseTime: 150,
        uptime: 99.9
      };
      
      mockMetricsService.getAgentMetrics.mockReturnValue(mockAgentMetrics);

      const response = await request(agent.app)
        .get('/metrics/agents/test-agent')
        .expect(200);

      expect(response.body).toMatchObject({
        agent: 'health-checker-agent',
        agentName: 'test-agent',
        metrics: mockAgentMetrics,
        timestamp: expect.any(String)
      });

      expect(mockMetricsService.getAgentMetrics).toHaveBeenCalledWith('test-agent');
    });

    test('GET /metrics/agents/:agentName - deve retornar 404 para agente não encontrado', async () => {
      mockMetricsService.getAgentMetrics.mockReturnValue(null);

      const response = await request(agent.app)
        .get('/metrics/agents/nonexistent-agent')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Agent not found',
        agentName: 'nonexistent-agent'
      });
    });

    test('GET /alerts - deve retornar histórico de alertas', async () => {
      const mockAlerts = [
        {
          id: '1',
          type: 'agent_down',
          message: 'Agent test-agent is down',
          timestamp: new Date().toISOString()
        }
      ];
      
      mockAlertService.getAlertHistory.mockReturnValue(mockAlerts);

      const response = await request(agent.app)
        .get('/alerts')
        .expect(200);

      expect(response.body).toMatchObject({
        agent: 'health-checker-agent',
        alerts: mockAlerts,
        stats: expect.any(Object),
        timestamp: expect.any(String)
      });

      expect(mockAlertService.getAlertHistory).toHaveBeenCalledWith(100);
    });

    test('GET /report - deve retornar relatório de saúde', async () => {
      const response = await request(agent.app)
        .get('/report')
        .expect(200);

      expect(response.body).toMatchObject({
        agent: 'health-checker-agent',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        systemStatus: expect.any(Object),
        metrics: expect.any(Object),
        alerts: expect.any(Object),
        stats: expect.any(Object)
      });
    });

    test('POST /check - deve executar verificação de saúde', async () => {
      const response = await request(agent.app)
        .post('/check')
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Health check executado com sucesso',
        timestamp: expect.any(String)
      });

      expect(mockHealthService.performHealthChecks).toHaveBeenCalled();
    });

    test('POST /check - deve tratar erro na verificação', async () => {
      const error = new Error('Health check failed');
      mockHealthService.performHealthChecks.mockRejectedValue(error);

      const response = await request(agent.app)
        .post('/check')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Erro ao executar health check',
        message: 'Health check failed'
      });
    });

    test('DELETE /alerts - deve limpar histórico de alertas', async () => {
      const response = await request(agent.app)
        .delete('/alerts')
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Histórico de alertas limpo',
        timestamp: expect.any(String)
      });

      expect(mockAlertService.clearHistory).toHaveBeenCalled();
    });
  });

  describe('Event Handlers', () => {
    beforeEach(async () => {
      agent.initializeSQS = jest.fn().mockResolvedValue();
      agent.publishAgentFailureEvent = jest.fn().mockResolvedValue();
      await agent.initialize();
    });

    test('deve processar evento agentDown', async () => {
      const eventData = {
        agentName: 'test-agent',
        critical: true,
        error: 'Connection timeout',
        consecutiveFailures: 3
      };

      await agent.handleAgentDown(eventData);

      expect(mockAlertService.handleAgentDown).toHaveBeenCalledWith(eventData);
      expect(agent.publishAgentFailureEvent).toHaveBeenCalledWith(eventData);
    });

    test('deve processar evento agentDegraded', async () => {
      const eventData = {
        agentName: 'test-agent',
        responseTime: 5000,
        threshold: 2000
      };

      await agent.handleAgentDegraded(eventData);

      expect(mockAlertService.handleAgentDegraded).toHaveBeenCalledWith(eventData);
    });

    test('deve processar evento agentRecovered', async () => {
      const eventData = {
        agentName: 'test-agent',
        downtime: 300000
      };

      await agent.handleAgentRecovered(eventData);

      expect(mockAlertService.handleAgentRecovered).toHaveBeenCalledWith(eventData);
    });

    test('deve processar anomalia detectada', async () => {
      const anomaly = {
        type: 'low_system_health',
        timestamp: new Date().toISOString(),
        severity: 'high',
        metrics: {
          cpu: 95,
          memory: 90
        }
      };

      await agent.handleAnomalyDetected(anomaly);

      expect(mockAlertService.handleSystemOverload).toHaveBeenCalledWith({
        timestamp: anomaly.timestamp,
        metrics: anomaly
      });
    });
  });

  describe('Relatórios', () => {
    beforeEach(async () => {
      agent.initializeSQS = jest.fn().mockResolvedValue();
      await agent.initialize();
    });

    test('deve gerar relatório de saúde completo', () => {
      const report = agent.generateHealthReport();

      expect(report).toMatchObject({
        agent: 'health-checker-agent',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        systemStatus: expect.any(Object),
        metrics: expect.any(Object),
        alerts: expect.any(Object),
        stats: expect.any(Object)
      });

      expect(mockHealthService.getSystemStatus).toHaveBeenCalled();
      expect(mockMetricsService.generateReport).toHaveBeenCalled();
      expect(mockAlertService.getAlertStats).toHaveBeenCalled();
    });
  });

  describe('Lifecycle', () => {
    test('deve inicializar serviços corretamente', async () => {
      agent.initializeSQS = jest.fn().mockResolvedValue();
      
      await agent.initialize();

      expect(agent.initializeSQS).toHaveBeenCalled();
      expect(mockAlertService.initialize).toHaveBeenCalled();
      expect(mockMetricsService.start).toHaveBeenCalled();
      expect(mockHealthService.start).toHaveBeenCalled();
    });

    test('deve parar serviços corretamente', async () => {
      agent.initializeSQS = jest.fn().mockResolvedValue();
      await agent.initialize();
      
      // Mock do processo de shutdown
      const originalExit = process.exit;
      process.exit = jest.fn();
      
      await agent.shutdown();

      expect(agent.isRunning).toBe(false);
      expect(mockHealthService.stop).toHaveBeenCalled();
      expect(mockMetricsService.stop).toHaveBeenCalled();
      
      // Restaurar process.exit
      process.exit = originalExit;
    });
  });

  describe('Estatísticas', () => {
    test('deve incrementar contador de health checks', () => {
      const initialCount = agent.stats.totalHealthChecks;
      
      // Simular evento de health check completado
      const healthCheckHandler = mockHealthService.on.mock.calls
        .find(call => call[0] === 'healthCheckCompleted')[1];
      
      healthCheckHandler({});
      
      expect(agent.stats.totalHealthChecks).toBe(initialCount + 1);
    });

    test('deve incrementar contador de alertas enviados', () => {
      const initialCount = agent.stats.alertsSent;
      
      // Simular evento de alerta enviado
      const alertSentHandler = mockAlertService.on.mock.calls
        .find(call => call[0] === 'alertSent')[1];
      
      alertSentHandler({ type: 'agent_down' });
      
      expect(agent.stats.alertsSent).toBe(initialCount + 1);
    });
  });
});