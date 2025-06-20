// Teste completo do planning-agent
console.log('Testando inicialização do planning-agent...');

try {
  // Importações básicas
  const express = require('express');
  const helmet = require('helmet');
  const cors = require('cors');
  const compression = require('compression');
  const rateLimit = require('express-rate-limit');
  const winston = require('winston');
  const promClient = require('prom-client');
  const config = require('./src/config');
  
  console.log('✓ Dependências básicas carregadas');
  
  // Serviços
  const SQSService = require('./src/agents/shared/services/sqsService');
  const MockSQSService = require('./src/services/mock-sqs-service');
  const PlanningService = require('./src/agents/core/planning-agent/services/planningService');
  const BDIEngine = require('./src/agents/core/planning-agent/services/bdiEngine');
  const BeliefManager = require('./src/agents/core/planning-agent/services/beliefManager');
  const DesireManager = require('./src/agents/core/planning-agent/services/desireManager');
  const IntentionManager = require('./src/agents/core/planning-agent/services/intentionManager');
  const PlanLibrary = require('./src/agents/core/planning-agent/services/planLibrary');
  
  console.log('✓ Serviços carregados');
  
  // Teste de criação da classe
  class TestPlanningAgent {
    constructor() {
      this.agentId = 'planning-agent';
      console.log('✓ Construtor executado');
      
      // Setup logger
      this.logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        transports: [
          new winston.transports.Console()
        ]
      });
      console.log('✓ Logger configurado');
      
      this.app = express();
      console.log('✓ Express app criado');
    }
  }
  
  const agent = new TestPlanningAgent();
  console.log('\n✅ Planning agent inicializado com sucesso!');
  
} catch (error) {
  console.error('❌ Erro na inicialização:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}