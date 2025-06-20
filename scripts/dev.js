#!/usr/bin/env node
/**
 * Script de Desenvolvimento Simplificado
 * 
 * Este é um wrapper simples para o script completo de configuração.
 * Permite execução rápida com diferentes opções.
 * 
 * Uso:
 *   npm run dev          - Configuração completa
 *   npm run dev:quick     - Apenas agentes (assume Docker já rodando)
 *   npm run dev:test      - Apenas testes de eventos
 *   npm run dev:clean     - Limpar ambiente
 */

const { spawn, exec } = require('child_process');
const path = require('path');

class DevScript {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
  }

  execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🔧 ${command}`);
      exec(command, { cwd: this.projectRoot, ...options }, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ ${error.message}`);
          reject(error);
        } else {
          if (stdout) console.log(stdout);
          if (stderr) console.warn(stderr);
          resolve({ stdout, stderr });
        }
      });
    });
  }

  async runComplete() {
    console.log('🚀 Executando configuração completa...');
    await this.execCommand('node scripts/setup-complete-dev-environment.js');
  }

  async runQuick() {
    console.log('⚡ Configuração rápida (apenas agentes)...');
    console.log('ℹ️  Assumindo que Docker já está rodando');
    
    try {
      // Configurar SQS
      await this.execCommand('node scripts/setup-sqs-queues.js');
      
      // Iniciar agentes (simulado - na prática seria mais complexo)
      console.log('🤖 Iniciando agentes...');
      console.log('ℹ️  Para iniciar agentes manualmente, consulte docs/COMO_TESTAR_EVENTOS.md');
      
    } catch (error) {
      console.error('❌ Erro na configuração rápida:', error.message);
    }
  }

  async runTests() {
    console.log('🧪 Executando apenas testes de eventos...');
    
    const CompleteDevEnvironmentSetup = require('./setup-complete-dev-environment.js');
    const setup = new CompleteDevEnvironmentSetup();
    
    try {
      await setup.step5_RunEventTests();
    } catch (error) {
      console.error('❌ Erro nos testes:', error.message);
    }
  }

  async clean() {
    console.log('🧹 Limpando ambiente...');
    
    try {
      await this.execCommand('docker-compose down');
      console.log('✅ Containers parados');
      
      await this.execCommand('docker system prune -f');
      console.log('✅ Sistema Docker limpo');
      
      console.log('✅ Ambiente limpo com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro na limpeza:', error.message);
    }
  }

  showHelp() {
    console.log(`
🔧 Script de Desenvolvimento - Agentes Autônomos
`);
    console.log('Comandos disponíveis:');
    console.log('  node scripts/dev.js                 - Configuração completa');
    console.log('  node scripts/dev.js quick           - Configuração rápida');
    console.log('  node scripts/dev.js test            - Apenas testes');
    console.log('  node scripts/dev.js clean           - Limpar ambiente');
    console.log('  node scripts/dev.js help            - Mostrar esta ajuda');
    console.log('');
    console.log('Ou use os comandos npm:');
    console.log('  npm run dev                         - Configuração completa');
    console.log('  npm run dev:quick                   - Configuração rápida');
    console.log('  npm run dev:test                    - Apenas testes');
    console.log('  npm run dev:clean                   - Limpar ambiente');
    console.log('');
  }

  async run() {
    const command = process.argv[2] || 'complete';
    
    switch (command) {
      case 'complete':
      case 'full':
        await this.runComplete();
        break;
        
      case 'quick':
      case 'fast':
        await this.runQuick();
        break;
        
      case 'test':
      case 'tests':
        await this.runTests();
        break;
        
      case 'clean':
      case 'cleanup':
        await this.clean();
        break;
        
      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        break;
        
      default:
        console.log(`❌ Comando desconhecido: ${command}`);
        this.showHelp();
        process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const dev = new DevScript();
  dev.run().catch(error => {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  });
}

module.exports = DevScript;