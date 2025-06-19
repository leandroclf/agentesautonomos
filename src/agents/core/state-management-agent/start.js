#!/usr/bin/env node

/**
 * State Management Agent Starter
 * 
 * Script para inicializar o State Management Agent
 * com configurações específicas do ambiente
 */

const StateManagementAgent = require('./index');
const path = require('path');
const fs = require('fs');

// Configurar variáveis de ambiente se não estiverem definidas
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

if (!process.env.STATE_PORT) {
  process.env.STATE_PORT = '3000';
}

// Criar diretório de logs se não existir
const logsDir = path.join(__dirname, '../../../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Criar diretório de dados se persistência estiver habilitada
if (process.env.ENABLE_STATE_PERSISTENCE === 'true') {
  const dataDir = path.join(__dirname, '../../../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Função principal
async function main() {
  console.log('🚀 Starting State Management Agent...');
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Port: ${process.env.STATE_PORT}`);
  console.log(`Persistence: ${process.env.ENABLE_STATE_PERSISTENCE === 'true' ? 'Enabled' : 'Disabled'}`);
  
  try {
    const agent = new StateManagementAgent();
    await agent.start();
    
    console.log('✅ State Management Agent started successfully!');
    console.log(`📊 Health check: http://localhost:${process.env.STATE_PORT}/health`);
    console.log(`📈 Metrics: http://localhost:${process.env.STATE_PORT}/metrics`);
    console.log(`🔧 API: http://localhost:${process.env.STATE_PORT}/api/v1/state`);
    
  } catch (error) {
    console.error('❌ Failed to start State Management Agent:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = main;