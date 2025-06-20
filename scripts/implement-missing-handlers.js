/**
 * Script para Implementar Handlers Ausentes
 * Fase 1: Configuração para Produção - Semana 1
 * 
 * Este script identifica e implementa handlers ausentes nos agentes
 */

const fs = require('fs');
const path = require('path');
const Logger = require('../src/utils/logger');

class HandlerImplementer {
  constructor() {
    this.logger = new Logger('handler-implementer');
    this.agentsDir = path.join(__dirname, '..', 'src', 'agents');
    this.results = [];
  }

  /**
   * Verificar se um agente tem handlers implementados
   */
  async checkAgentHandlers(agentPath, agentName) {
    try {
      const handlersDir = path.join(agentPath, 'handlers');
      const servicesDir = path.join(agentPath, 'services');
      
      const result = {
        agent: agentName,
        path: agentPath,
        hasHandlersDir: fs.existsSync(handlersDir),
        hasServicesDir: fs.existsSync(servicesDir),
        handlers: [],
        services: [],
        missingHandlers: [],
        recommendations: []
      };

      // Verificar handlers existentes
      if (result.hasHandlersDir) {
        const handlerFiles = fs.readdirSync(handlersDir)
          .filter(file => file.endsWith('.js'))
          .map(file => file.replace('.js', ''));
        result.handlers = handlerFiles;
      }

      // Verificar services existentes
      if (result.hasServicesDir) {
        const serviceFiles = fs.readdirSync(servicesDir)
          .filter(file => file.endsWith('.js'))
          .map(file => file.replace('.js', ''));
        result.services = serviceFiles;
      }

      // Identificar handlers ausentes baseado no tipo de agente
      result.missingHandlers = this.identifyMissingHandlers(agentName, result.handlers);
      result.recommendations = this.generateRecommendations(agentName, result);

      this.results.push(result);
      return result;
    } catch (error) {
      this.logger.error(`Error checking handlers for ${agentName}:`, error);
      return null;
    }
  }

  /**
   * Identificar handlers ausentes baseado no tipo de agente
   */
  identifyMissingHandlers(agentName, existingHandlers) {
    const handlerTemplates = {
      'event-agent': ['eventHandler', 'messageHandler', 'errorHandler'],
      'planning-agent': ['planningHandler', 'requestHandler', 'responseHandler'],
      'execution-agent': ['executionHandler', 'stepHandler', 'resultHandler'],
      'interface-agent': ['responseHandler', 'websocketHandler', 'eventHandler'],
      'state-management-agent': ['stateHandler', 'persistenceHandler', 'syncHandler'],
      'monitoring-agent': ['metricsHandler', 'alertHandler', 'healthHandler'],
      'security-agent': ['authHandler', 'validationHandler', 'auditHandler'],
      'policy-agent': ['policyHandler', 'enforcementHandler', 'complianceHandler']
    };

    const requiredHandlers = handlerTemplates[agentName] || ['messageHandler', 'errorHandler'];
    return requiredHandlers.filter(handler => !existingHandlers.includes(handler));
  }

  /**
   * Gerar recomendações para cada agente
   */
  generateRecommendations(agentName, result) {
    const recommendations = [];

    if (!result.hasHandlersDir) {
      recommendations.push({
        type: 'CREATE_DIRECTORY',
        priority: 'HIGH',
        action: 'Create handlers directory',
        path: path.join(result.path, 'handlers')
      });
    }

    if (result.missingHandlers.length > 0) {
      result.missingHandlers.forEach(handler => {
        recommendations.push({
          type: 'CREATE_HANDLER',
          priority: 'MEDIUM',
          action: `Implement ${handler}`,
          handler: handler,
          template: this.getHandlerTemplate(handler, agentName)
        });
      });
    }

    if (!result.hasServicesDir) {
      recommendations.push({
        type: 'CREATE_DIRECTORY',
        priority: 'MEDIUM',
        action: 'Create services directory',
        path: path.join(result.path, 'services')
      });
    }

    return recommendations;
  }

  /**
   * Obter template para um handler específico
   */
  getHandlerTemplate(handlerName, agentName) {
    const templates = {
      messageHandler: this.getMessageHandlerTemplate(agentName),
      errorHandler: this.getErrorHandlerTemplate(agentName),
      eventHandler: this.getEventHandlerTemplate(agentName),
      responseHandler: this.getResponseHandlerTemplate(agentName),
      planningHandler: this.getPlanningHandlerTemplate(),
      executionHandler: this.getExecutionHandlerTemplate(),
      stateHandler: this.getStateHandlerTemplate(),
      metricsHandler: this.getMetricsHandlerTemplate(),
      authHandler: this.getAuthHandlerTemplate(),
      policyHandler: this.getPolicyHandlerTemplate()
    };

    return templates[handlerName] || this.getGenericHandlerTemplate(handlerName, agentName);
  }

  /**
   * Template genérico para handlers
   */
  getGenericHandlerTemplate(handlerName, agentName) {
    return `/**
 * ${handlerName} para ${agentName}
 * Gerado automaticamente pelo script implement-missing-handlers.js
 */

const Logger = require('../../../utils/logger');

class ${handlerName.charAt(0).toUpperCase() + handlerName.slice(1)} {
  constructor() {
    this.logger = new Logger('${agentName}-${handlerName}');
  }

  /**
   * Processar requisição
   */
  async handle(data) {
    try {
      this.logger.info('Processing request:', data);
      
      // TODO: Implementar lógica específica do handler
      
      return {
        success: true,
        data: data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Handler error:', error);
      throw error;
    }
  }
}

module.exports = ${handlerName.charAt(0).toUpperCase() + handlerName.slice(1)};
`;
  }

  /**
   * Template para messageHandler
   */
  getMessageHandlerTemplate(agentName) {
    return `/**
 * Message Handler para ${agentName}
 * Gerado automaticamente pelo script implement-missing-handlers.js
 */

const Logger = require('../../../utils/logger');

class MessageHandler {
  constructor() {
    this.logger = new Logger('${agentName}-message-handler');
  }

  /**
   * Processar mensagem SQS
   */
  async handleMessage(message) {
    try {
      this.logger.info('Processing SQS message:', {
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle
      });

      const messageBody = JSON.parse(message.Body);
      
      // Validar estrutura da mensagem
      if (!messageBody.type || !messageBody.data) {
        throw new Error('Invalid message structure');
      }

      // Processar baseado no tipo de mensagem
      switch (messageBody.type) {
        case 'request':
          return await this.handleRequest(messageBody.data);
        case 'response':
          return await this.handleResponse(messageBody.data);
        case 'event':
          return await this.handleEvent(messageBody.data);
        default:
          this.logger.warn('Unknown message type:', messageBody.type);
          return { success: false, error: 'Unknown message type' };
      }
    } catch (error) {
      this.logger.error('Message handling error:', error);
      throw error;
    }
  }

  /**
   * Processar requisição
   */
  async handleRequest(data) {
    this.logger.info('Processing request:', data);
    // TODO: Implementar lógica específica para requisições
    return { success: true, data };
  }

  /**
   * Processar resposta
   */
  async handleResponse(data) {
    this.logger.info('Processing response:', data);
    // TODO: Implementar lógica específica para respostas
    return { success: true, data };
  }

  /**
   * Processar evento
   */
  async handleEvent(data) {
    this.logger.info('Processing event:', data);
    // TODO: Implementar lógica específica para eventos
    return { success: true, data };
  }
}

module.exports = MessageHandler;
`;
  }

  /**
   * Template para errorHandler
   */
  getErrorHandlerTemplate(agentName) {
    return `/**
 * Error Handler para ${agentName}
 * Gerado automaticamente pelo script implement-missing-handlers.js
 */

const Logger = require('../../../utils/logger');

class ErrorHandler {
  constructor() {
    this.logger = new Logger('${agentName}-error-handler');
  }

  /**
   * Processar erro
   */
  async handleError(error, context = {}) {
    try {
      this.logger.error('Processing error:', {
        error: error.message,
        stack: error.stack,
        context
      });

      // Classificar severidade do erro
      const severity = this.classifyError(error);
      
      // Gerar resposta de erro
      const errorResponse = {
        success: false,
        error: {
          message: error.message,
          type: error.constructor.name,
          severity,
          timestamp: new Date().toISOString(),
          context
        }
      };

      // Notificar sistema de monitoramento se crítico
      if (severity === 'critical') {
        await this.notifyMonitoring(errorResponse);
      }

      return errorResponse;
    } catch (handlingError) {
      this.logger.error('Error in error handler:', handlingError);
      return {
        success: false,
        error: {
          message: 'Error handler failed',
          originalError: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Classificar severidade do erro
   */
  classifyError(error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      return 'critical';
    }
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Notificar sistema de monitoramento
   */
  async notifyMonitoring(errorResponse) {
    try {
      // TODO: Implementar notificação para sistema de monitoramento
      this.logger.warn('Critical error detected - monitoring notification needed:', errorResponse);
    } catch (error) {
      this.logger.error('Failed to notify monitoring:', error);
    }
  }
}

module.exports = ErrorHandler;
`;
  }

  /**
   * Implementar handlers ausentes
   */
  async implementMissingHandlers() {
    try {
      this.logger.info('Implementing missing handlers...');
      
      let implemented = 0;
      
      for (const result of this.results) {
        for (const recommendation of result.recommendations) {
          if (recommendation.type === 'CREATE_DIRECTORY') {
            if (!fs.existsSync(recommendation.path)) {
              fs.mkdirSync(recommendation.path, { recursive: true });
              this.logger.info(`Created directory: ${recommendation.path}`);
            }
          } else if (recommendation.type === 'CREATE_HANDLER') {
            const handlerPath = path.join(result.path, 'handlers', `${recommendation.handler}.js`);
            
            if (!fs.existsSync(handlerPath)) {
              fs.writeFileSync(handlerPath, recommendation.template);
              this.logger.info(`Created handler: ${handlerPath}`);
              implemented++;
            }
          }
        }
      }
      
      this.logger.info(`Implemented ${implemented} missing handlers`);
      return implemented;
    } catch (error) {
      this.logger.error('Failed to implement handlers:', error);
      throw error;
    }
  }

  /**
   * Escanear todos os agentes
   */
  async scanAllAgents() {
    try {
      this.logger.info('Scanning all agents for missing handlers...');
      
      const agentDirs = ['core', 'auxiliary', 'marl', 'mediation', 'management', 'infrastructure'];
      
      for (const dir of agentDirs) {
        const dirPath = path.join(this.agentsDir, dir);
        
        if (fs.existsSync(dirPath)) {
          const agents = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
          
          for (const agent of agents) {
            const agentPath = path.join(dirPath, agent);
            await this.checkAgentHandlers(agentPath, agent);
          }
        }
      }
      
      this.logger.info(`Scanned ${this.results.length} agents`);
    } catch (error) {
      this.logger.error('Failed to scan agents:', error);
      throw error;
    }
  }

  /**
   * Gerar relatório de handlers
   */
  generateReport() {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalAgents: this.results.length,
          agentsWithHandlers: this.results.filter(r => r.hasHandlersDir).length,
          totalMissingHandlers: this.results.reduce((sum, r) => sum + r.missingHandlers.length, 0),
          totalRecommendations: this.results.reduce((sum, r) => sum + r.recommendations.length, 0)
        },
        details: this.results,
        priorityActions: this.getPriorityActions()
      };

      const reportPath = path.join(__dirname, '..', 'temp', `handlers-report-${Date.now()}.json`);
      
      // Criar diretório temp se não existir
      const tempDir = path.dirname(reportPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      this.logger.info(`Handlers report saved: ${reportPath}`);
      return report;
    } catch (error) {
      this.logger.error('Failed to generate report:', error);
      throw error;
    }
  }

  /**
   * Obter ações prioritárias
   */
  getPriorityActions() {
    const actions = [];
    
    this.results.forEach(result => {
      result.recommendations.forEach(rec => {
        if (rec.priority === 'HIGH') {
          actions.push({
            agent: result.agent,
            action: rec.action,
            type: rec.type
          });
        }
      });
    });
    
    return actions;
  }

  /**
   * Exibir resumo
   */
  displaySummary(report) {
    console.log('\n🔧 Handler Implementation Summary');
    console.log('=' .repeat(50));
    
    console.log(`📊 Total Agents: ${report.summary.totalAgents}`);
    console.log(`📁 Agents with Handlers: ${report.summary.agentsWithHandlers}`);
    console.log(`❌ Missing Handlers: ${report.summary.totalMissingHandlers}`);
    console.log(`🔧 Recommendations: ${report.summary.totalRecommendations}`);
    
    if (report.priorityActions.length > 0) {
      console.log('\n🚨 Priority Actions:');
      report.priorityActions.forEach((action, index) => {
        console.log(`${index + 1}. ${action.agent}: ${action.action}`);
      });
    }
    
    console.log('\n📋 Next Steps:');
    console.log('1. Review generated handlers in each agent\'s handlers/ directory');
    console.log('2. Implement specific business logic in TODO sections');
    console.log('3. Add unit tests for new handlers');
    console.log('4. Run system integration test: npm run test:system');
  }

  /**
   * Executar implementação completa
   */
  async run() {
    try {
      this.logger.info('🔧 Starting Handler Implementation...');
      
      await this.scanAllAgents();
      const implemented = await this.implementMissingHandlers();
      const report = this.generateReport();
      this.displaySummary(report);
      
      this.logger.info('✅ Handler Implementation completed!');
      
      // Retornar código de saída baseado no sucesso
      process.exit(0);
      
    } catch (error) {
      this.logger.error('❌ Handler Implementation failed:', error);
      console.log('\n🔧 Troubleshooting:');
      console.log('1. Check file permissions');
      console.log('2. Verify agent directory structure');
      console.log('3. Review logs in temp/ directory');
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const implementer = new HandlerImplementer();
  implementer.run();
}

module.exports = HandlerImplementer;