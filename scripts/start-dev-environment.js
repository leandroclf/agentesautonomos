#!/usr/bin/env node
/**
 * Script Centralizado para Inicialização do Ambiente de Desenvolvimento
 * 
 * Este script organiza e inicia todos os recursos necessários:
 * 1. Infraestrutura (LocalStack, PostgreSQL, Redis)
 * 2. Monitoramento (Prometheus, Grafana)
 * 3. Agentes (Event, Planning, Execution, Interface)
 * 4. Configuração automática de filas SQS
 * 
 * Uso: npm run dev ou node scripts/start-dev-environment.js
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class DevEnvironmentManager {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.isWindows = process.platform === 'win32';
    
    // Configuração dos serviços por categoria
    this.serviceGroups = {
      infrastructure: {
        name: 'Infraestrutura Base',
        services: ['localstack', 'postgres', 'redis'],
        composeFile: 'docker-compose.dev.yml',
        healthChecks: {
          localstack: { url: 'http://localhost:4566/_localstack/health', timeout: 30000 },
          postgres: { port: 5432, timeout: 15000 },
          redis: { port: 6379, timeout: 10000 }
        }
      },
      monitoring: {
        name: 'Monitoramento',
        services: ['prometheus', 'grafana'],
        composeFile: 'docker-compose.dev.yml',
        healthChecks: {
          prometheus: { url: 'http://localhost:9090/-/healthy', timeout: 15000 },
          grafana: { url: 'http://localhost:3000/api/health', timeout: 20000 }
        }
      },
      agents: {
        name: 'Agentes Autônomos',
        services: ['interface-agent', 'event-agent', 'planning-agent', 'execution-agent'],
        composeFile: 'docker-compose.yml',
        healthChecks: {
          'interface-agent': { url: 'http://localhost:3000/health', timeout: 30000 },
          'event-agent': { url: 'http://localhost:3001/health', timeout: 30000 },
          'planning-agent': { url: 'http://localhost:3002/health', timeout: 30000 },
          'execution-agent': { url: 'http://localhost:3003/health', timeout: 30000 }
        }
      }
    };
  }

  async start() {
    console.log('🚀 Iniciando Ambiente de Desenvolvimento Completo\n');
    
    try {
      // 1. Verificar pré-requisitos
      await this.checkPrerequisites();
      
      // 2. Limpar ambiente anterior (opcional)
      await this.cleanupPreviousEnvironment();
      
      // 3. Iniciar infraestrutura base
      await this.startServiceGroup('infrastructure');
      
      // 4. Configurar filas SQS
      await this.setupSQSQueues();
      
      // 5. Iniciar monitoramento
      await this.startServiceGroup('monitoring');
      
      // 6. Iniciar agentes
      await this.startServiceGroup('agents');
      
      // 7. Verificar saúde do sistema
      await this.performHealthChecks();
      
      // 8. Exibir resumo
      this.displaySummary();
      
    } catch (error) {
      console.error('❌ Erro durante a inicialização:', error.message);
      process.exit(1);
    }
  }

  async checkPrerequisites() {
    console.log('🔍 Verificando pré-requisitos...');
    
    // Verificar Docker
    try {
      await this.execCommand('docker --version');
      await this.execCommand('docker-compose --version');
      console.log('✅ Docker e Docker Compose encontrados');
    } catch (error) {
      throw new Error('Docker ou Docker Compose não encontrados. Instale-os primeiro.');
    }
    
    // Verificar Node.js e dependências
    if (!fs.existsSync(path.join(this.projectRoot, 'node_modules'))) {
      console.log('📦 Instalando dependências do Node.js...');
      await this.execCommand('npm install', { cwd: this.projectRoot });
    }
    
    console.log('✅ Pré-requisitos verificados\n');
  }

  async cleanupPreviousEnvironment() {
    console.log('🧹 Limpando ambiente anterior...');
    
    try {
      // Parar containers existentes
      await this.execCommand('docker-compose -f docker-compose.dev.yml down', { cwd: this.projectRoot });
      await this.execCommand('docker-compose -f docker-compose.yml down', { cwd: this.projectRoot });
      
      // Remover containers órfãos
      await this.execCommand('docker container prune -f');
      
      console.log('✅ Ambiente limpo\n');
    } catch (error) {
      console.log('⚠️  Aviso: Erro durante limpeza (pode ser normal se for primeira execução)');
    }
  }

  async startServiceGroup(groupName) {
    const group = this.serviceGroups[groupName];
    console.log(`🔄 Iniciando ${group.name}...`);
    
    const services = group.services.join(' ');
    const command = `docker-compose -f ${group.composeFile} up -d ${services}`;
    
    await this.execCommand(command, { cwd: this.projectRoot });
    
    // Aguardar inicialização
    console.log(`⏳ Aguardando ${group.name} inicializar...`);
    await this.waitForServices(group.services, group.healthChecks);
    
    console.log(`✅ ${group.name} iniciado com sucesso\n`);
  }

  async waitForServices(services, healthChecks) {
    const maxWaitTime = 60000; // 1 minuto
    const checkInterval = 2000; // 2 segundos
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      let allHealthy = true;
      
      for (const service of services) {
        const healthCheck = healthChecks[service];
        if (!healthCheck) continue;
        
        try {
          if (healthCheck.url) {
            await axios.get(healthCheck.url, { timeout: 5000 });
          } else if (healthCheck.port) {
            // Verificar se a porta está aberta
            await this.checkPort(healthCheck.port);
          }
        } catch (error) {
          allHealthy = false;
          break;
        }
      }
      
      if (allHealthy) {
        return;
      }
      
      await this.sleep(checkInterval);
    }
    
    throw new Error(`Timeout aguardando serviços: ${services.join(', ')}`);
  }

  async setupSQSQueues() {
    console.log('🔄 Configurando filas SQS...');
    
    try {
      // Aguardar LocalStack estar pronto
      await this.waitForLocalStack();
      
      // Executar script de configuração SQS
      await this.execCommand('node scripts/setup-sqs-queues.js', { cwd: this.projectRoot });
      
      console.log('✅ Filas SQS configuradas\n');
    } catch (error) {
      throw new Error(`Erro configurando SQS: ${error.message}`);
    }
  }

  async waitForLocalStack() {
    const maxAttempts = 30;
    let attempts = 0;
    
    console.log('🔍 Aguardando LocalStack ficar pronto...');
    
    while (attempts < maxAttempts) {
      try {
        console.log(`⏳ Tentativa ${attempts + 1}/${maxAttempts} - Verificando LocalStack...`);
        const response = await axios.get('http://localhost:4566/_localstack/health', { timeout: 5000 });
        console.log(`📊 Status SQS: ${response.data?.services?.sqs}`);
        
        if (response.data && response.data.services && (response.data.services.sqs === 'running' || response.data.services.sqs === 'available')) {
          console.log('✅ LocalStack pronto!');
          return;
        }
      } catch (error) {
        console.log(`❌ Erro na tentativa ${attempts + 1}: ${error.message}`);
      }
      
      attempts++;
      await this.sleep(2000);
    }
    
    throw new Error('LocalStack não ficou pronto a tempo');
  }

  async performHealthChecks() {
    console.log('🏥 Verificando saúde do sistema...');
    
    const allChecks = [];
    
    for (const [groupName, group] of Object.entries(this.serviceGroups)) {
      for (const service of group.services) {
        const healthCheck = group.healthChecks[service];
        if (healthCheck && healthCheck.url) {
          allChecks.push({ service, url: healthCheck.url });
        }
      }
    }
    
    const results = await Promise.allSettled(
      allChecks.map(async ({ service, url }) => {
        try {
          await axios.get(url, { timeout: 10000 });
          return { service, status: 'healthy' };
        } catch (error) {
          return { service, status: 'unhealthy', error: error.message };
        }
      })
    );
    
    const healthyServices = results.filter(r => r.value?.status === 'healthy').length;
    const totalServices = results.length;
    
    console.log(`✅ Verificação de saúde: ${healthyServices}/${totalServices} serviços saudáveis\n`);
    
    // Exibir detalhes dos serviços não saudáveis
    results.forEach(result => {
      if (result.value?.status === 'unhealthy') {
        console.log(`⚠️  ${result.value.service}: ${result.value.error}`);
      }
    });
  }

  displaySummary() {
    console.log('🎉 Ambiente de Desenvolvimento Iniciado com Sucesso!\n');
    
    console.log('📋 Serviços Disponíveis:');
    console.log('┌─────────────────────┬─────────────────────┬─────────────────────┐');
    console.log('│ Serviço             │ URL                 │ Credenciais         │');
    console.log('├─────────────────────┼─────────────────────┼─────────────────────┤');
    console.log('│ Interface Agent     │ http://localhost:3000│ -                   │');
    console.log('│ Event Agent         │ http://localhost:3001│ -                   │');
    console.log('│ Planning Agent      │ http://localhost:3002│ -                   │');
    console.log('│ Execution Agent     │ http://localhost:3003│ -                   │');
    console.log('│ Grafana             │ http://localhost:3000│ admin/admin123      │');
    console.log('│ Prometheus          │ http://localhost:9090│ -                   │');
    console.log('│ PgAdmin             │ http://localhost:8080│ admin@agentes.local │');
    console.log('│ Redis Commander     │ http://localhost:8081│ -                   │');
    console.log('│ LocalStack          │ http://localhost:4566│ -                   │');
    console.log('└─────────────────────┴─────────────────────┴─────────────────────┘\n');
    
    console.log('🔧 Comandos Úteis:');
    console.log('• Parar ambiente: npm run dev:stop');
    console.log('• Ver logs: docker-compose logs -f [serviço]');
    console.log('• Reiniciar serviço: docker-compose restart [serviço]');
    console.log('• Status containers: docker ps\n');
    
    console.log('📚 Próximos Passos:');
    console.log('• Acesse o Grafana para monitoramento');
    console.log('• Use o Interface Agent para interagir com o sistema');
    console.log('• Consulte os logs dos agentes para debug');
  }

  async stop() {
    console.log('🛑 Parando Ambiente de Desenvolvimento...');
    
    try {
      await this.execCommand('docker-compose -f docker-compose.yml down', { cwd: this.projectRoot });
      await this.execCommand('docker-compose -f docker-compose.dev.yml down', { cwd: this.projectRoot });
      
      console.log('✅ Ambiente parado com sucesso');
    } catch (error) {
      console.error('❌ Erro parando ambiente:', error.message);
    }
  }

  // Métodos utilitários
  async execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const child = exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Comando falhou: ${command}\n${stderr || error.message}`));
        } else {
          resolve(stdout);
        }
      });
      
      // Mostrar output em tempo real para comandos docker-compose
      if (command.includes('docker-compose')) {
        child.stdout.on('data', (data) => {
          process.stdout.write(data);
        });
        child.stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      }
    });
  }

  async checkPort(port) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Port ${port} timeout`));
      });
      
      socket.on('error', (error) => {
        reject(error);
      });
      
      socket.connect(port, 'localhost');
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Execução do script
if (require.main === module) {
  const manager = new DevEnvironmentManager();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'stop':
      manager.stop();
      break;
    case 'start':
    default:
      manager.start();
      break;
  }
}

module.exports = DevEnvironmentManager;