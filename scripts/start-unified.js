#!/usr/bin/env node
/**
 * Script Unificado de Inicialização
 * Inicia apenas LocalStack (sem ElasticMQ separado)
 */

const { exec } = require('child_process');
const path = require('path');

class UnifiedEnvironment {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
  }

  async start() {
    console.log('🚀 Iniciando Ambiente Unificado (LocalStack apenas)...');
    
    try {
      // 1. Parar ambiente anterior
      await this.execCommand('docker-compose down');
      await this.execCommand('docker-compose -f docker-compose.dev.yml down');
      
      // 2. Iniciar infraestrutura (incluindo LocalStack)
      console.log('🔄 Iniciando infraestrutura...');
      await this.execCommand('docker-compose -f docker-compose.dev.yml up -d localstack postgres redis');
      
      // 3. Aguardar LocalStack
      console.log('⏳ Aguardando LocalStack...');
      await this.waitForLocalStack();
      
      // 4. Configurar filas SQS
      console.log('🔄 Configurando filas SQS...');
      await this.execCommand('node scripts/setup-sqs-queues.js');
      
      // 5. Iniciar monitoramento
      console.log('🔄 Iniciando monitoramento...');
      await this.execCommand('docker-compose -f docker-compose.dev.yml up -d prometheus grafana');
      
      // 6. Iniciar agentes
      console.log('🔄 Iniciando agentes...');
      await this.execCommand('docker-compose up -d');
      
      console.log('✅ Ambiente iniciado com sucesso!');
      this.displayUrls();
      
    } catch (error) {
      console.error('❌ Erro:', error.message);
    }
  }

  async waitForLocalStack() {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.execCommand('curl -f http://localhost:4566/health');
        return;
      } catch (error) {
        await this.sleep(2000);
      }
    }
    throw new Error('LocalStack não ficou pronto');
  }

  displayUrls() {
    console.log('
📋 URLs Disponíveis:');
    console.log('• Agentes: http://localhost:3000-3003');
    console.log('• Grafana: http://localhost:3000 (admin/admin123)');
    console.log('• Prometheus: http://localhost:9090');
    console.log('• LocalStack: http://localhost:4566');
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: this.projectRoot }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${command}: ${stderr || error.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (require.main === module) {
  new UnifiedEnvironment().start();
}
