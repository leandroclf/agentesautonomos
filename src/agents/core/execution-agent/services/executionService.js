const { v4: uuidv4 } = require('uuid');
const config = require('../../../../config');

class ExecutionService {
  constructor(sqsService, logger, metrics) {
    this.sqsService = sqsService;
    this.logger = logger;
    this.metrics = metrics;
    
    // Estado interno
    this.executions = new Map(); // executionId -> execution data
    this.workerPool = {
      workers: [],
      queue: [],
      maxWorkers: config.execution.workerPool.maxWorkers,
      activeWorkers: 0
    };
    
    // Clientes para comunicação com outros agentes
    this.planningClient = null;
    this.interfaceClient = null;
    
    // Configurações
    this.config = config.execution;
    
    // Cleanup automático
    this.cleanupInterval = null;
  }

  async initialize() {
    try {
      this.logger.info('Initializing Execution Service');
      
      // Configurar clientes para outros agentes
      this.setupAgentClients();
      
      // Inicializar worker pool
      this.initializeWorkerPool();
      
      // Configurar cleanup automático
      this.setupAutomaticCleanup();
      
      this.logger.info('Execution Service initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Execution Service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  setupAgentClients() {
    // Configurar clientes HTTP para comunicação com outros agentes
    this.planningClient = {
      baseURL: `http://localhost:${config.planning.port}`,
      timeout: 30000
    };
    
    this.interfaceClient = {
      baseURL: `http://localhost:${config.interface.port}`,
      timeout: 10000
    };
  }

  initializeWorkerPool() {
    this.logger.info('Initializing worker pool', {
      maxWorkers: this.workerPool.maxWorkers
    });
    
    // Inicializar workers básicos
    for (let i = 0; i < Math.min(2, this.workerPool.maxWorkers); i++) {
      this.createWorker();
    }
  }

  createWorker() {
    const workerId = uuidv4();
    const worker = {
      id: workerId,
      status: 'idle',
      currentExecution: null,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.workerPool.workers.push(worker);
    this.logger.debug('Worker created', { workerId });
    
    return worker;
  }

  async executePlan(req, res) {
    try {
      const { planId, parameters = {}, priority = 'normal' } = req.body;
      
      // Validar request
      if (!planId) {
        return res.status(400).json({
          error: 'Plan ID is required'
        });
      }
      
      const executionId = uuidv4();
      
      // Criar execução
      const execution = {
        id: executionId,
        planId,
        parameters,
        priority,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [],
        logs: [],
        metrics: {
          startTime: null,
          endTime: null,
          duration: null,
          stepsCompleted: 0,
          stepsTotal: 0
        }
      };
      
      this.executions.set(executionId, execution);
      
      // Adicionar à fila de execução
      this.workerPool.queue.push({
        executionId,
        priority,
        createdAt: new Date()
      });
      
      // Ordenar fila por prioridade
      this.sortQueue();
      
      // Tentar processar imediatamente
      this.processQueue();
      
      // Métricas
      this.metrics.executionRequests.inc({ plan_type: 'unknown' });
      this.metrics.activeExecutions.inc();
      
      this.logger.info('Execution created', {
        executionId,
        planId,
        priority
      });
      
      res.status(202).json({
        executionId,
        status: 'pending',
        message: 'Execution queued successfully'
      });
      
    } catch (error) {
      this.logger.error('Failed to execute plan', {
        error: error.message,
        stack: error.stack
      });
      
      this.metrics.executionErrors.inc({ error_type: 'execution_creation' });
      
      res.status(500).json({
        error: 'Failed to execute plan',
        message: error.message
      });
    }
  }

  sortQueue() {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    
    this.workerPool.queue.sort((a, b) => {
      // Primeiro por prioridade
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Depois por tempo de criação (FIFO)
      return a.createdAt - b.createdAt;
    });
  }

  async processQueue() {
    if (this.workerPool.queue.length === 0) return;
    
    // Encontrar worker disponível
    const availableWorker = this.workerPool.workers.find(w => w.status === 'idle');
    
    if (!availableWorker) {
      // Criar novo worker se possível
      if (this.workerPool.workers.length < this.workerPool.maxWorkers) {
        const newWorker = this.createWorker();
        this.assignExecution(newWorker);
      }
      return;
    }
    
    this.assignExecution(availableWorker);
  }

  async assignExecution(worker) {
    if (this.workerPool.queue.length === 0) return;
    
    const queueItem = this.workerPool.queue.shift();
    const execution = this.executions.get(queueItem.executionId);
    
    if (!execution) {
      this.logger.warn('Execution not found in queue', {
        executionId: queueItem.executionId
      });
      return;
    }
    
    worker.status = 'busy';
    worker.currentExecution = execution.id;
    worker.lastActivity = new Date();
    
    this.workerPool.activeWorkers++;
    this.metrics.activeWorkers.set(this.workerPool.activeWorkers);
    this.metrics.workerQueueSize.set(this.workerPool.queue.length);
    
    // Executar de forma assíncrona
    this.executeInWorker(worker, execution).catch(error => {
      this.logger.error('Worker execution failed', {
        workerId: worker.id,
        executionId: execution.id,
        error: error.message
      });
    });
  }

  async executeInWorker(worker, execution) {
    try {
      this.logger.info('Starting execution in worker', {
        workerId: worker.id,
        executionId: execution.id
      });
      
      execution.status = 'running';
      execution.metrics.startTime = new Date();
      execution.updatedAt = new Date();
      
      // Buscar plano do Planning Agent
      const plan = await this.fetchPlan(execution.planId);
      
      if (!plan) {
        throw new Error(`Plan not found: ${execution.planId}`);
      }
      
      execution.steps = plan.steps || [];
      execution.metrics.stepsTotal = execution.steps.length;
      
      // Executar steps
      for (let i = 0; i < execution.steps.length; i++) {
        const step = execution.steps[i];
        
        try {
          await this.executeStep(execution, step, i);
          execution.metrics.stepsCompleted++;
          
        } catch (stepError) {
          this.logger.error('Step execution failed', {
            executionId: execution.id,
            stepIndex: i,
            stepId: step.id,
            error: stepError.message
          });
          
          // Decidir se continuar ou parar
          if (step.critical !== false) {
            throw stepError;
          }
          
          // Log do erro mas continuar
          execution.logs.push({
            timestamp: new Date(),
            level: 'error',
            message: `Step ${i} failed but continuing: ${stepError.message}`,
            stepIndex: i
          });
        }
      }
      
      // Execução bem-sucedida
      execution.status = 'completed';
      execution.metrics.endTime = new Date();
      execution.metrics.duration = execution.metrics.endTime - execution.metrics.startTime;
      execution.updatedAt = new Date();
      
      this.metrics.executionSuccess.inc({ plan_type: plan.type || 'unknown' });
      this.metrics.executionTime.observe(
        { plan_type: plan.type || 'unknown' },
        execution.metrics.duration / 1000
      );
      
      this.logger.info('Execution completed successfully', {
        executionId: execution.id,
        duration: execution.metrics.duration,
        stepsCompleted: execution.metrics.stepsCompleted
      });
      
    } catch (error) {
      // Execução falhou
      execution.status = 'failed';
      execution.metrics.endTime = new Date();
      execution.metrics.duration = execution.metrics.endTime - execution.metrics.startTime;
      execution.updatedAt = new Date();
      execution.error = error.message;
      
      this.metrics.executionErrors.inc({ error_type: 'execution_runtime' });
      
      this.logger.error('Execution failed', {
        executionId: execution.id,
        error: error.message,
        duration: execution.metrics.duration
      });
      
    } finally {
      // Liberar worker
      worker.status = 'idle';
      worker.currentExecution = null;
      worker.lastActivity = new Date();
      
      this.workerPool.activeWorkers--;
      this.metrics.activeWorkers.set(this.workerPool.activeWorkers);
      this.metrics.activeExecutions.dec();
      
      // Processar próximo item da fila
      setTimeout(() => this.processQueue(), 100);
    }
  }

  async executeStep(execution, step, stepIndex) {
    const startTime = Date.now();
    
    this.logger.debug('Executing step', {
      executionId: execution.id,
      stepIndex,
      stepId: step.id,
      stepType: step.type
    });
    
    execution.logs.push({
      timestamp: new Date(),
      level: 'info',
      message: `Starting step ${stepIndex}: ${step.name || step.id}`,
      stepIndex
    });
    
    try {
      // Simular execução do step baseado no tipo
      await this.executeStepByType(step, execution.parameters);
      
      const duration = Date.now() - startTime;
      
      this.metrics.stepExecutions.inc({
        step_type: step.type,
        status: 'success'
      });
      this.metrics.stepDuration.observe(
        { step_type: step.type },
        duration / 1000
      );
      
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Step ${stepIndex} completed successfully (${duration}ms)`,
        stepIndex,
        duration
      });
      
    } catch (error) {
      this.metrics.stepExecutions.inc({
        step_type: step.type,
        status: 'error'
      });
      
      execution.logs.push({
        timestamp: new Date(),
        level: 'error',
        message: `Step ${stepIndex} failed: ${error.message}`,
        stepIndex,
        error: error.message
      });
      
      throw error;
    }
  }

  async executeStepByType(step, parameters) {
    // Simular diferentes tipos de steps
    const delay = step.estimatedDuration || 1000;
    
    switch (step.type) {
      case 'api_call':
        await this.simulateApiCall(step, parameters);
        break;
        
      case 'data_processing':
        await this.simulateDataProcessing(step, parameters);
        break;
        
      case 'file_operation':
        await this.simulateFileOperation(step, parameters);
        break;
        
      case 'notification':
        await this.simulateNotification(step, parameters);
        break;
        
      default:
        // Step genérico
        await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async simulateApiCall(step, parameters) {
    // Simular chamada de API
    const delay = Math.random() * 2000 + 500;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simular falha ocasional
    if (Math.random() < 0.1) {
      throw new Error('API call failed: Connection timeout');
    }
  }

  async simulateDataProcessing(step, parameters) {
    // Simular processamento de dados
    const delay = Math.random() * 3000 + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateFileOperation(step, parameters) {
    // Simular operação de arquivo
    const delay = Math.random() * 1000 + 200;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateNotification(step, parameters) {
    // Simular envio de notificação
    const delay = Math.random() * 500 + 100;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async fetchPlan(planId) {
    try {
      // Simular busca do plano
      // Em implementação real, faria HTTP request para Planning Agent
      return {
        id: planId,
        type: 'integration',
        steps: [
          {
            id: 'step1',
            name: 'Initialize',
            type: 'api_call',
            estimatedDuration: 1000
          },
          {
            id: 'step2',
            name: 'Process Data',
            type: 'data_processing',
            estimatedDuration: 2000
          },
          {
            id: 'step3',
            name: 'Send Notification',
            type: 'notification',
            estimatedDuration: 500
          }
        ]
      };
      
    } catch (error) {
      this.logger.error('Failed to fetch plan', {
        planId,
        error: error.message
      });
      return null;
    }
  }

  async getExecutionStatus(req, res) {
    try {
      const { id } = req.params;
      const execution = this.executions.get(id);
      
      if (!execution) {
        return res.status(404).json({
          error: 'Execution not found'
        });
      }
      
      res.json({
        id: execution.id,
        planId: execution.planId,
        status: execution.status,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        metrics: execution.metrics,
        progress: {
          stepsCompleted: execution.metrics.stepsCompleted,
          stepsTotal: execution.metrics.stepsTotal,
          percentage: execution.metrics.stepsTotal > 0 
            ? Math.round((execution.metrics.stepsCompleted / execution.metrics.stepsTotal) * 100)
            : 0
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to get execution status', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get execution status',
        message: error.message
      });
    }
  }

  async listExecutions(req, res) {
    try {
      const {
        status,
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;
      
      let executions = Array.from(this.executions.values());
      
      // Filtrar por status
      if (status) {
        executions = executions.filter(e => e.status === status);
      }
      
      // Ordenar
      executions.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        
        if (sortOrder === 'desc') {
          return bVal > aVal ? 1 : -1;
        } else {
          return aVal > bVal ? 1 : -1;
        }
      });
      
      // Paginar
      const total = executions.length;
      const paginatedExecutions = executions.slice(
        parseInt(offset),
        parseInt(offset) + parseInt(limit)
      );
      
      res.json({
        executions: paginatedExecutions.map(e => ({
          id: e.id,
          planId: e.planId,
          status: e.status,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          metrics: e.metrics
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to list executions', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to list executions',
        message: error.message
      });
    }
  }

  async getExecutionLogs(req, res) {
    try {
      const { id } = req.params;
      const { level, limit = 100, offset = 0 } = req.query;
      
      const execution = this.executions.get(id);
      
      if (!execution) {
        return res.status(404).json({
          error: 'Execution not found'
        });
      }
      
      let logs = execution.logs;
      
      // Filtrar por level
      if (level) {
        logs = logs.filter(log => log.level === level);
      }
      
      // Paginar
      const total = logs.length;
      const paginatedLogs = logs.slice(
        parseInt(offset),
        parseInt(offset) + parseInt(limit)
      );
      
      res.json({
        logs: paginatedLogs,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to get execution logs', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get execution logs',
        message: error.message
      });
    }
  }

  async stopExecution(req, res) {
    try {
      const { id } = req.params;
      const execution = this.executions.get(id);
      
      if (!execution) {
        return res.status(404).json({
          error: 'Execution not found'
        });
      }
      
      if (execution.status !== 'running') {
        return res.status(400).json({
          error: 'Execution is not running'
        });
      }
      
      execution.status = 'stopped';
      execution.updatedAt = new Date();
      execution.metrics.endTime = new Date();
      execution.metrics.duration = execution.metrics.endTime - execution.metrics.startTime;
      
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Execution stopped by user request'
      });
      
      this.logger.info('Execution stopped', {
        executionId: id
      });
      
      res.json({
        message: 'Execution stopped successfully',
        status: execution.status
      });
      
    } catch (error) {
      this.logger.error('Failed to stop execution', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to stop execution',
        message: error.message
      });
    }
  }

  async rollbackExecution(req, res) {
    try {
      const { id } = req.params;
      const execution = this.executions.get(id);
      
      if (!execution) {
        return res.status(404).json({
          error: 'Execution not found'
        });
      }
      
      if (!['completed', 'failed', 'stopped'].includes(execution.status)) {
        return res.status(400).json({
          error: 'Cannot rollback running execution'
        });
      }
      
      const rollbackStart = Date.now();
      
      execution.status = 'rolling_back';
      execution.updatedAt = new Date();
      
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Starting rollback process'
      });
      
      // Simular rollback
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      execution.status = 'rolled_back';
      execution.updatedAt = new Date();
      
      const rollbackDuration = Date.now() - rollbackStart;
      
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Rollback completed in ${rollbackDuration}ms`
      });
      
      this.metrics.rollbacks.inc({ reason: 'manual' });
      this.metrics.rollbackDuration.observe(rollbackDuration / 1000);
      
      this.logger.info('Execution rolled back', {
        executionId: id,
        duration: rollbackDuration
      });
      
      res.json({
        message: 'Rollback completed successfully',
        status: execution.status,
        duration: rollbackDuration
      });
      
    } catch (error) {
      this.logger.error('Failed to rollback execution', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to rollback execution',
        message: error.message
      });
    }
  }

  async getWorkerPoolStatus(req, res) {
    try {
      const utilization = this.workerPool.maxWorkers > 0 
        ? (this.workerPool.activeWorkers / this.workerPool.maxWorkers) * 100
        : 0;
      
      this.metrics.workerUtilization.set(utilization);
      
      res.json({
        workers: {
          total: this.workerPool.workers.length,
          active: this.workerPool.activeWorkers,
          idle: this.workerPool.workers.length - this.workerPool.activeWorkers,
          maxWorkers: this.workerPool.maxWorkers,
          utilization: Math.round(utilization)
        },
        queue: {
          size: this.workerPool.queue.length,
          items: this.workerPool.queue.map(item => ({
            executionId: item.executionId,
            priority: item.priority,
            waitTime: Date.now() - item.createdAt.getTime()
          }))
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to get worker pool status', {
        error: error.message
      });
      
      res.status(500).json({
        error: 'Failed to get worker pool status',
        message: error.message
      });
    }
  }

  setupAutomaticCleanup() {
    const cleanupInterval = this.config.cleanup.interval;
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, cleanupInterval);
    
    this.logger.info('Automatic cleanup configured', {
      interval: cleanupInterval
    });
  }

  performCleanup() {
    const now = new Date();
    const retentionPeriod = this.config.cleanup.retentionPeriod;
    let cleanedCount = 0;
    
    for (const [executionId, execution] of this.executions.entries()) {
      const age = now - execution.updatedAt;
      
      if (age > retentionPeriod && 
          ['completed', 'failed', 'stopped', 'rolled_back'].includes(execution.status)) {
        this.executions.delete(executionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.info('Cleanup completed', {
        cleanedExecutions: cleanedCount,
        remainingExecutions: this.executions.size
      });
    }
  }

  async getHealthInfo() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage.set(memUsage.heapUsed);
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'execution-agent',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      executions: {
        total: this.executions.size,
        active: Array.from(this.executions.values()).filter(e => e.status === 'running').length
      },
      workerPool: {
        workers: this.workerPool.workers.length,
        active: this.workerPool.activeWorkers,
        queueSize: this.workerPool.queue.length
      }
    };
  }

  getDetailedMetrics() {
    const executions = Array.from(this.executions.values());
    
    const statusCounts = executions.reduce((acc, exec) => {
      acc[exec.status] = (acc[exec.status] || 0) + 1;
      return acc;
    }, {});
    
    const avgDuration = executions
      .filter(e => e.metrics.duration)
      .reduce((sum, e, _, arr) => sum + e.metrics.duration / arr.length, 0);
    
    return {
      timestamp: new Date().toISOString(),
      executions: {
        total: executions.length,
        byStatus: statusCounts,
        averageDuration: Math.round(avgDuration)
      },
      workerPool: {
        workers: this.workerPool.workers.length,
        active: this.workerPool.activeWorkers,
        utilization: this.workerPool.maxWorkers > 0 
          ? Math.round((this.workerPool.activeWorkers / this.workerPool.maxWorkers) * 100)
          : 0,
        queueSize: this.workerPool.queue.length
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
  }

  async shutdown() {
    this.logger.info('Shutting down Execution Service');
    
    // Parar cleanup automático
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Aguardar execuções ativas terminarem (com timeout)
    const activeExecutions = Array.from(this.executions.values())
      .filter(e => e.status === 'running');
    
    if (activeExecutions.length > 0) {
      this.logger.info('Waiting for active executions to complete', {
        activeCount: activeExecutions.length
      });
      
      // Aguardar até 30 segundos
      const timeout = 30000;
      const start = Date.now();
      
      while (Date.now() - start < timeout) {
        const stillActive = Array.from(this.executions.values())
          .filter(e => e.status === 'running');
        
        if (stillActive.length === 0) break;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    this.logger.info('Execution Service shutdown completed');
  }
}

module.exports = ExecutionService;