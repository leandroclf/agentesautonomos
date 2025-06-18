/**
 * Execution Agent - Agente de Execução
 * Fase 1-2: Execução de planos e coordenação de tarefas
 * 
 * Responsabilidades:
 * - Executar planos do Planning Agent
 * - Coordenar execução de steps
 * - Gerenciar paralelismo e dependências
 * - Monitorar progresso e status
 * - Implementar retry e rollback
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const promClient = require('prom-client');
const SQSService = require('../../shared/services/sqsService');
const ExecutionService = require('./services/executionService');
const config = require('../config');

class ExecutionAgent {
  constructor() {
    this.agentId = 'execution-agent';
    this.logger = new Logger(this.agentId);
    this.app = express();
    this.sqsService = null;
    this.isRunning = false;
    this.server = null;
    
    // Métricas
    this.metrics = {
      plansExecuted: 0,
      stepsExecuted: 0,
      stepsSucceeded: 0,
      stepsFailed: 0,
      stepsRetried: 0,
      averageExecutionTime: 0,
      averageStepTime: 0,
      lastExecutedAt: null,
      startedAt: new Date().toISOString()
    };
    
    // Execuções ativas
    this.activeExecutions = new Map();
    
    // Pool de workers para execução paralela
    this.workerPool = new Map();
    this.maxConcurrentExecutions = config.agents.execution.maxConcurrent || 10;
    
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  /**
   * Configurar middleware do Express
   */
  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: config.security.corsOrigins,
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 500, // máximo 500 requests por janela
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);
    
    // Body parsing
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
  
  /**
   * Configurar rotas do Express
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      const health = {
        status: this.isRunning ? 'healthy' : 'unhealthy',
        agent: this.agentId,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sqsConnected: this.sqsService?.isConnected() || false,
        activeExecutions: this.activeExecutions.size,
        workerPoolSize: this.workerPool.size
      };
      
      res.status(this.isRunning ? 200 : 503).json(health);
    });
    
    // Métricas
    this.app.get('/metrics', (req, res) => {
      res.json({
        agent: this.agentId,
        metrics: this.metrics,
        activeExecutions: this.activeExecutions.size,
        workerPool: {
          size: this.workerPool.size,
          maxConcurrent: this.maxConcurrentExecutions
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Endpoint para execução direta
    this.app.post('/execute', async (req, res) => {
      try {
        const plan = req.body;
        const result = await this.executePlan(plan);
        
        res.json({
          success: true,
          executionId: result.executionId,
          status: result.status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error in direct execution', error, { plan: req.body });
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Status de execução específica
    this.app.get('/executions/:executionId', (req, res) => {
      const { executionId } = req.params;
      const execution = this.activeExecutions.get(executionId);
      
      if (!execution) {
        return res.status(404).json({
          error: 'Execution not found',
          executionId
        });
      }
      
      res.json({
        executionId,
        planId: execution.planId,
        status: execution.status,
        progress: execution.progress,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        steps: execution.steps.map(step => ({
          id: step.id,
          name: step.name,
          status: step.status,
          startedAt: step.startedAt,
          completedAt: step.completedAt,
          error: step.error
        }))
      });
    });
    
    // Listar execuções ativas
    this.app.get('/executions', (req, res) => {
      const executions = Array.from(this.activeExecutions.entries()).map(([executionId, execution]) => ({
        executionId,
        planId: execution.planId,
        status: execution.status,
        progress: execution.progress,
        createdAt: execution.createdAt
      }));
      
      res.json({
        executions,
        total: executions.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Cancelar execução
    this.app.post('/executions/:executionId/cancel', async (req, res) => {
      try {
        const { executionId } = req.params;
        const result = await this.cancelExecution(executionId);
        
        res.json({
          success: true,
          executionId,
          status: result.status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error canceling execution', error, {
          executionId: req.params.executionId
        });
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
    
    // Error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('Express error', error, {
        url: req.url,
        method: req.method,
        body: req.body
      });
      
      res.status(500).json({
        error: 'Internal server error',
        agent: this.agentId,
        timestamp: new Date().toISOString()
      });
    });
  }
  
  /**
   * Executar plano
   */
  async executePlan(planData) {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    const plan = planData.plan || planData;
    
    this.logger.info('Starting plan execution', {
      executionId,
      planId: plan.id,
      stepsCount: plan.steps.length,
      complexity: plan.complexity
    });
    
    // Verificar limite de execuções concorrentes
    if (this.activeExecutions.size >= this.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached');
    }
    
    // Criar registro de execução
    const execution = {
      executionId,
      planId: plan.id,
      plan,
      status: 'running',
      progress: {
        completed: 0,
        total: plan.steps.length,
        percentage: 0
      },
      steps: plan.steps.map(step => ({
        ...step,
        status: 'pending',
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
        retryCount: 0
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      error: null
    };
    
    this.activeExecutions.set(executionId, execution);
    this.metrics.plansExecuted++;
    
    try {
      // Executar steps do plano
      const result = await this.executeSteps(execution);
      
      // Atualizar status final
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.updatedAt = new Date().toISOString();
      execution.result = result;
      
      // Atualizar métricas
      this.metrics.lastExecutedAt = new Date().toISOString();
      const executionTime = Date.now() - startTime;
      this.updateAverageExecutionTime(executionTime);
      
      this.logger.info('Plan execution completed', {
        executionId,
        planId: plan.id,
        executionTime,
        stepsCompleted: execution.progress.completed
      });
      
      // Notificar Planning Agent sobre conclusão
      await this.notifyPlanningAgent(execution, 'completed');
      
      // Remover da lista de execuções ativas após um tempo
      setTimeout(() => {
        this.activeExecutions.delete(executionId);
      }, 300000); // 5 minutos
      
      return {
        executionId,
        status: 'completed',
        result,
        executionTime
      };
      
    } catch (error) {
      this.logger.error('Plan execution failed', error, {
        executionId,
        planId: plan.id
      });
      
      // Atualizar status de erro
      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
      execution.updatedAt = new Date().toISOString();
      execution.error = error.message;
      
      // Notificar Planning Agent sobre falha
      await this.notifyPlanningAgent(execution, 'failed', error);
      
      throw error;
    }
  }
  
  /**
   * Executar steps do plano
   */
  async executeSteps(execution) {
    const { plan, steps } = execution;
    const results = [];
    
    // Identificar grupos de steps paralelos
    const parallelGroups = plan.parallelGroups || [];
    const processedSteps = new Set();
    
    // Executar grupos paralelos
    for (const group of parallelGroups) {
      this.logger.info('Executing parallel group', {
        executionId: execution.executionId,
        groupId: group.id,
        stepsCount: group.steps.length
      });
      
      const groupSteps = steps.filter(step => group.steps.includes(step.id));
      const groupResults = await this.executeStepsInParallel(execution, groupSteps);
      
      results.push(...groupResults);
      group.steps.forEach(stepId => processedSteps.add(stepId));
    }
    
    // Executar steps sequenciais restantes
    const sequentialSteps = steps.filter(step => !processedSteps.has(step.id));
    
    for (const step of sequentialSteps) {
      // Verificar dependências
      await this.waitForDependencies(execution, step);
      
      const stepResult = await this.executeStep(execution, step);
      results.push(stepResult);
    }
    
    return {
      executionId: execution.executionId,
      planId: plan.id,
      stepsResults: results,
      summary: {
        total: steps.length,
        succeeded: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failed').length
      }
    };
  }
  
  /**
   * Executar steps em paralelo
   */
  async executeStepsInParallel(execution, steps) {
    const promises = steps.map(step => this.executeStep(execution, step));
    
    try {
      const results = await Promise.allSettled(promises);
      
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          this.logger.error('Parallel step execution failed', result.reason, {
            executionId: execution.executionId,
            stepId: steps[index].id
          });
          
          return {
            stepId: steps[index].id,
            status: 'failed',
            error: result.reason.message,
            executionTime: 0
          };
        }
      });
    } catch (error) {
      this.logger.error('Parallel execution error', error, {
        executionId: execution.executionId,
        stepsCount: steps.length
      });
      throw error;
    }
  }
  
  /**
   * Aguardar dependências de um step
   */
  async waitForDependencies(execution, step) {
    if (!step.dependencies || step.dependencies.length === 0) {
      return;
    }
    
    this.logger.debug('Waiting for dependencies', {
      executionId: execution.executionId,
      stepId: step.id,
      dependencies: step.dependencies
    });
    
    const maxWaitTime = 30000; // 30 segundos
    const checkInterval = 1000; // 1 segundo
    let waitTime = 0;
    
    while (waitTime < maxWaitTime) {
      const dependenciesMet = step.dependencies.every(depId => {
        const depStep = execution.steps.find(s => s.id.endsWith(depId));
        return depStep && depStep.status === 'completed';
      });
      
      if (dependenciesMet) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    throw new Error(`Dependencies not met for step ${step.id} within timeout`);
  }
  
  /**
   * Executar step individual
   */
  async executeStep(execution, step) {
    const startTime = Date.now();
    
    this.logger.info('Executing step', {
      executionId: execution.executionId,
      stepId: step.id,
      stepName: step.name,
      stepType: step.type
    });
    
    // Atualizar status do step
    step.status = 'running';
    step.startedAt = new Date().toISOString();
    execution.updatedAt = new Date().toISOString();
    
    this.metrics.stepsExecuted++;
    
    try {
      let result;
      
      // Executar baseado no tipo de step
      switch (step.type) {
        case 'validation':
          result = await this.executeValidationStep(execution, step);
          break;
        case 'security':
          result = await this.executeSecurityStep(execution, step);
          break;
        case 'policy':
          result = await this.executePolicyStep(execution, step);
          break;
        case 'processing':
          result = await this.executeProcessingStep(execution, step);
          break;
        case 'data':
          result = await this.executeDataStep(execution, step);
          break;
        case 'response':
          result = await this.executeResponseStep(execution, step);
          break;
        default:
          result = await this.executeGenericStep(execution, step);
      }
      
      // Atualizar status de sucesso
      step.status = 'completed';
      step.completedAt = new Date().toISOString();
      step.result = result;
      
      // Atualizar progresso da execução
      execution.progress.completed++;
      execution.progress.percentage = 
        Math.round((execution.progress.completed / execution.progress.total) * 100);
      execution.updatedAt = new Date().toISOString();
      
      this.metrics.stepsSucceeded++;
      
      const executionTime = Date.now() - startTime;
      this.updateAverageStepTime(executionTime);
      
      this.logger.info('Step completed successfully', {
        executionId: execution.executionId,
        stepId: step.id,
        executionTime
      });
      
      return {
        stepId: step.id,
        status: 'success',
        result,
        executionTime
      };
      
    } catch (error) {
      this.logger.error('Step execution failed', error, {
        executionId: execution.executionId,
        stepId: step.id
      });
      
      // Verificar se deve fazer retry
      if (this.shouldRetryStep(step, error)) {
        return await this.retryStep(execution, step, error);
      }
      
      // Atualizar status de erro
      step.status = 'failed';
      step.completedAt = new Date().toISOString();
      step.error = error.message;
      execution.updatedAt = new Date().toISOString();
      
      this.metrics.stepsFailed++;
      
      throw error;
    }
  }
  
  /**
   * Executar step de validação
   */
  async executeValidationStep(execution, step) {
    const { parameters } = step;
    const originalRequest = parameters.originalRequest;
    
    this.logger.debug('Executing validation step', {
      executionId: execution.executionId,
      stepId: step.id,
      validationRules: parameters.validationRules
    });
    
    // Simular validação (Fase 1 - Mock)
    if (config.env === 'development' && config.useMocks) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simular tempo de processamento
      
      return {
        valid: true,
        validatedData: originalRequest,
        validationRules: parameters.validationRules,
        timestamp: new Date().toISOString()
      };
    }
    
    // Implementação real de validação
    const validationRules = parameters.validationRules || {};
    const errors = [];
    
    // Validar campos obrigatórios
    if (validationRules.required) {
      for (const field of validationRules.required) {
        if (!originalRequest[field]) {
          errors.push(`Required field missing: ${field}`);
        }
      }
    }
    
    // Validar formato
    if (validationRules.format && originalRequest.request) {
      if (validationRules.format === 'string' && typeof originalRequest.request !== 'string') {
        errors.push('Request must be a string');
      }
    }
    
    // Validar tamanho máximo
    if (validationRules.maxLength && originalRequest.request) {
      if (originalRequest.request.length > validationRules.maxLength) {
        errors.push(`Request exceeds maximum length of ${validationRules.maxLength}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
    
    return {
      valid: true,
      validatedData: originalRequest,
      validationRules,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Executar step de segurança
   */
  async executeSecurityStep(execution, step) {
    const { parameters } = step;
    
    this.logger.debug('Executing security step', {
      executionId: execution.executionId,
      stepId: step.id,
      securityChecks: parameters.securityChecks
    });
    
    // Simular verificação de segurança (Fase 1 - Mock)
    if (config.env === 'development' && config.useMocks) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simular tempo de processamento
      
      return {
        securityPassed: true,
        checks: parameters.securityChecks,
        securityLevel: 'standard',
        timestamp: new Date().toISOString()
      };
    }
    
    // Implementação real de verificação de segurança
    const checks = parameters.securityChecks || {};
    const results = {};
    
    // Verificar autenticação
    if (checks.authentication) {
      results.authentication = true; // Implementar verificação real
    }
    
    // Verificar autorização
    if (checks.authorization) {
      results.authorization = true; // Implementar verificação real
    }
    
    // Verificar sanitização de entrada
    if (checks.inputSanitization) {
      results.inputSanitization = true; // Implementar sanitização real
    }
    
    // Verificar rate limiting
    if (checks.rateLimiting) {
      results.rateLimiting = true; // Implementar verificação real
    }
    
    return {
      securityPassed: Object.values(results).every(Boolean),
      checks: results,
      securityLevel: 'standard',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Executar step de política
   */
  async executePolicyStep(execution, step) {
    const { parameters } = step;
    
    this.logger.debug('Executing policy step', {
      executionId: execution.executionId,
      stepId: step.id
    });
    
    // Simular verificação de política (Fase 1 - Mock)
    if (config.env === 'development' && config.useMocks) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simular tempo de processamento
      
      return {
        policyCompliant: true,
        appliedPolicies: ['default_policy'],
        timestamp: new Date().toISOString()
      };
    }
    
    // Implementação real de verificação de política
    return {
      policyCompliant: true,
      appliedPolicies: ['default_policy'],
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Executar step de processamento
   */
  async executeProcessingStep(execution, step) {
    const { parameters } = step;
    const originalRequest = parameters.originalRequest;
    
    this.logger.debug('Executing processing step', {
      executionId: execution.executionId,
      stepId: step.id,
      processingType: parameters.processingType
    });
    
    // Simular processamento (Fase 1 - Mock)
    if (config.env === 'development' && config.useMocks) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Simular tempo de processamento
      
      return {
        processed: true,
        processingType: parameters.processingType,
        result: `Processed request: ${originalRequest.request || 'unknown'}`,
        timestamp: new Date().toISOString()
      };
    }
    
    // Implementação real de processamento
    const processingType = parameters.processingType || 'standard';
    
    let result;
    switch (processingType) {
      case 'standard':
        result = await this.standardProcessing(originalRequest);
        break;
      case 'advanced':
        result = await this.advancedProcessing(originalRequest);
        break;
      default:
        result = await this.standardProcessing(originalRequest);
    }
    
    return {
      processed: true,
      processingType,
      result,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Executar step de dados
   */
  async executeDataStep(execution, step) {
    const { parameters } = step;
    
    this.logger.debug('Executing data step', {
      executionId: execution.executionId,
      stepId: step.id,
      dataSource: parameters.dataSource,
      queryType: parameters.queryType
    });
    
    // Simular operação de dados (Fase 1 - Mock)
    if (config.env === 'development' && config.useMocks) {
      await new Promise(resolve => setTimeout(resolve, 2500)); // Simular tempo de processamento
      
      return {
        dataRetrieved: true,
        dataSource: parameters.dataSource,
        queryType: parameters.queryType,
        recordCount: 42,
        timestamp: new Date().toISOString()
      };
    }
    
    // Implementação real de operação de dados
    const dataSource = parameters.dataSource || 'default';
    const queryType = parameters.queryType || 'read';
    
    return {
      dataRetrieved: true,
      dataSource,
      queryType,
      recordCount: 0, // Implementar contagem real
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Executar step de resposta
   */
  async executeResponseStep(execution, step) {
    const { parameters } = step;
    
    this.logger.debug('Executing response step', {
      executionId: execution.executionId,
      stepId: step.id
    });
    
    // Coletar resultados de steps anteriores
    const previousResults = execution.steps
      .filter(s => s.status === 'completed' && s.result)
      .map(s => s.result);
    
    // Simular geração de resposta (Fase 1 - Mock)
    if (config.env === 'development' && config.useMocks) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simular tempo de processamento
      
      return {
        response: {
          success: true,
          message: 'Request processed successfully',
          data: previousResults,
          executionId: execution.executionId,
          timestamp: new Date().toISOString()
        },
        format: 'json'
      };
    }
    
    // Implementação real de geração de resposta
    return {
      response: {
        success: true,
        message: 'Request processed successfully',
        data: previousResults,
        executionId: execution.executionId,
        timestamp: new Date().toISOString()
      },
      format: 'json'
    };
  }
  
  /**
   * Executar step genérico
   */
  async executeGenericStep(execution, step) {
    this.logger.debug('Executing generic step', {
      executionId: execution.executionId,
      stepId: step.id,
      stepType: step.type
    });
    
    // Simular execução genérica
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      executed: true,
      stepType: step.type,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Processamento padrão
   */
  async standardProcessing(request) {
    // Implementar lógica de processamento padrão
    return `Standard processing completed for: ${request.request || 'unknown'}`;
  }
  
  /**
   * Processamento avançado
   */
  async advancedProcessing(request) {
    // Implementar lógica de processamento avançado
    return `Advanced processing completed for: ${request.request || 'unknown'}`;
  }
  
  /**
   * Verificar se deve fazer retry do step
   */
  shouldRetryStep(step, error) {
    const maxRetries = 3;
    const retryCount = step.retryCount || 0;
    
    // Não fazer retry para erros de validação
    if (error.message.includes('Validation failed')) {
      return false;
    }
    
    // Não fazer retry para erros de segurança
    if (error.message.includes('Security')) {
      return false;
    }
    
    return retryCount < maxRetries;
  }
  
  /**
   * Fazer retry de step
   */
  async retryStep(execution, step, originalError) {
    const retryCount = (step.retryCount || 0) + 1;
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
    
    this.logger.info('Retrying step', {
      executionId: execution.executionId,
      stepId: step.id,
      retryCount,
      delay
    });
    
    this.metrics.stepsRetried++;
    
    // Aguardar antes do retry
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Atualizar contador de retry
    step.retryCount = retryCount;
    step.status = 'pending';
    step.error = null;
    
    // Tentar executar novamente
    try {
      return await this.executeStep(execution, step);
    } catch (retryError) {
      this.logger.error('Step retry failed', retryError, {
        executionId: execution.executionId,
        stepId: step.id,
        retryCount
      });
      
      // Se ainda pode fazer retry, tentar novamente
      if (this.shouldRetryStep(step, retryError)) {
        return await this.retryStep(execution, step, retryError);
      }
      
      throw retryError;
    }
  }
  
  /**
   * Cancelar execução
   */
  async cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    
    if (execution.status === 'completed' || execution.status === 'failed') {
      throw new Error(`Cannot cancel execution in status: ${execution.status}`);
    }
    
    this.logger.info('Canceling execution', {
      executionId,
      planId: execution.planId
    });
    
    // Atualizar status
    execution.status = 'cancelled';
    execution.completedAt = new Date().toISOString();
    execution.updatedAt = new Date().toISOString();
    
    // Cancelar steps em execução
    for (const step of execution.steps) {
      if (step.status === 'running') {
        step.status = 'cancelled';
        step.completedAt = new Date().toISOString();
      }
    }
    
    // Notificar Planning Agent
    await this.notifyPlanningAgent(execution, 'cancelled');
    
    return {
      status: 'cancelled',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Notificar Planning Agent sobre status da execução
   */
  async notifyPlanningAgent(execution, status, error = null) {
    try {
      const notification = {
        type: 'plan_update',
        planId: execution.planId,
        executionId: execution.executionId,
        status,
        progress: execution.progress,
        timestamp: new Date().toISOString(),
        source: this.agentId
      };
      
      if (error) {
        notification.error = error.message;
      }
      
      if (status === 'completed') {
        notification.result = execution.result;
      }
      
      await this.sqsService.sendMessage(
        config.aws.sqs.queues.core.planning,
        notification
      );
      
      this.logger.debug('Planning Agent notified', {
        planId: execution.planId,
        status
      });
    } catch (notificationError) {
      this.logger.error('Failed to notify Planning Agent', notificationError, {
        planId: execution.planId,
        status
      });
    }
  }
  
  /**
   * Gerar ID único para execução
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Atualizar tempo médio de execução
   */
  updateAverageExecutionTime(newTime) {
    if (this.metrics.averageExecutionTime === 0) {
      this.metrics.averageExecutionTime = newTime;
    } else {
      this.metrics.averageExecutionTime = 
        (this.metrics.averageExecutionTime + newTime) / 2;
    }
  }
  
  /**
   * Atualizar tempo médio de step
   */
  updateAverageStepTime(newTime) {
    if (this.metrics.averageStepTime === 0) {
      this.metrics.averageStepTime = newTime;
    } else {
      this.metrics.averageStepTime = 
        (this.metrics.averageStepTime + newTime) / 2;
    }
  }
  
  /**
   * Inicializar serviço SQS
   */
  async initializeSQS() {
    try {
      this.sqsService = new SQSService();
      await this.sqsService.initialize();
      
      // Começar a escutar mensagens
      await this.sqsService.startPolling(
        config.aws.sqs.queues.core.execution,
        this.handleSQSMessage.bind(this)
      );
      
      this.logger.info('SQS service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SQS service', error);
      throw error;
    }
  }
  
  /**
   * Lidar com mensagem SQS
   */
  async handleSQSMessage(message) {
    try {
      const messageData = JSON.parse(message.Body);
      
      switch (messageData.type) {
        case 'execute_plan':
          await this.executePlan(messageData);
          break;
        case 'cancel_execution':
          await this.cancelExecution(messageData.executionId);
          break;
        default:
          this.logger.warn('Unknown message type', {
            type: messageData.type,
            messageId: message.MessageId
          });
      }
      
      // Deletar mensagem da fila após processamento bem-sucedido
      await this.sqsService.deleteMessage(
        config.aws.sqs.queues.core.execution,
        message.ReceiptHandle
      );
      
    } catch (error) {
      this.logger.error('Error handling SQS message', error, {
        messageId: message.MessageId,
        body: message.Body
      });
      
      throw error;
    }
  }
  
  /**
   * Iniciar o agente
   */
  async start() {
    try {
      this.logger.info('Starting Execution Agent...');
      
      // Inicializar SQS
      await this.initializeSQS();
      
      // Iniciar servidor HTTP
      const port = config.agents.execution.port || 3004;
      this.server = this.app.listen(port, () => {
        this.isRunning = true;
        this.logger.info(`Execution Agent started on port ${port}`);
      });
      
      // Configurar health check
      this.setupHealthCheck();
      
    } catch (error) {
      this.logger.error('Failed to start Execution Agent', error);
      throw error;
    }
  }
  
  /**
   * Parar o agente
   */
  async stop() {
    try {
      this.logger.info('Stopping Execution Agent...');
      this.isRunning = false;
      
      // Cancelar execuções ativas
      for (const [executionId] of this.activeExecutions) {
        try {
          await this.cancelExecution(executionId);
        } catch (error) {
          this.logger.warn('Error canceling execution during shutdown', error, {
            executionId
          });
        }
      }
      
      // Parar polling SQS
      if (this.sqsService) {
        await this.sqsService.stopPolling();
        await this.sqsService.close();
      }
      
      // Fechar servidor HTTP
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      this.logger.info('Execution Agent stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Execution Agent', error);
      throw error;
    }
  }
  
  /**
   * Configurar health check periódico
   */
  setupHealthCheck() {
    setInterval(() => {
      if (this.isRunning) {
        this.logger.debug('Health check', {
          status: 'healthy',
          metrics: this.metrics,
          activeExecutions: this.activeExecutions.size
        });
      }
    }, config.agents.healthCheckInterval);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const agent = new ExecutionAgent();
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });
  
  // Iniciar agente
  agent.start().catch((error) => {
    console.error('Failed to start Execution Agent:', error);
    process.exit(1);
  });
}

module.exports = ExecutionAgent;