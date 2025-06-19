/**
 * Setup Environment Script
 * Script para configurar e inicializar todo o ambiente de desenvolvimento
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

class EnvironmentSetup {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.projectRoot = path.join(__dirname, '..');
    this.processes = [];
    this.setupSteps = [];
  }

  async setupComplete() {
    console.log('🚀 CONFIGURAÇÃO DO AMBIENTE - AGENTES AUTÔNOMOS');
    console.log('===============================================');
    console.log(`Ambiente: ${this.environment}`);
    console.log(`Diretório: ${this.projectRoot}`);
    console.log('');

    try {
      // Passo 1: Verificar dependências
      await this.checkDependencies();
      
      // Passo 2: Criar diretórios necessários
      await this.createDirectories();
      
      // Passo 3: Provisionar SQS
      await this.provisionSQS();
      
      // Passo 4: Iniciar mocks HTTP
      await this.startHTTPMocks();
      
      // Passo 5: Iniciar agentes
      await this.startAgents();
      
      // Passo 6: Executar smoke test
      await this.runSmokeTest();
      
      // Passo 7: Mostrar status final
      await this.showFinalStatus();
      
      console.log('✅ Ambiente configurado com sucesso!');
      console.log('');
      console.log('🎯 PRÓXIMOS PASSOS:');
      console.log('   1. Acesse http://localhost:3001/health para verificar o Interface Agent');
      console.log('   2. Execute testes: npm test');
      console.log('   3. Monitore logs em ./logs/');
      console.log('   4. Para parar tudo: npm run stop-all');
      
    } catch (error) {
      console.error('❌ Erro durante a configuração:', error);
      await this.cleanup();
      throw error;
    }
  }

  async checkDependencies() {
    console.log('🔍 Verificando dependências...');
    
    // Verificar Node.js
    const nodeVersion = process.version;
    console.log(`   ✅ Node.js: ${nodeVersion}`);
    
    // Verificar package.json
    const packagePath = path.join(this.projectRoot, 'package.json');
    if (!fs.existsSync(packagePath)) {
      throw new Error('package.json não encontrado');
    }
    console.log('   ✅ package.json encontrado');
    
    // Verificar node_modules
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('   ⚠️  node_modules não encontrado, executando npm install...');
      await this.runCommand('npm', ['install'], { cwd: this.projectRoot });
    }
    console.log('   ✅ node_modules verificado');
    
    // Verificar variáveis de ambiente
    const requiredEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.log('   ⚠️  Variáveis de ambiente faltando (usando defaults):');
      missingVars.forEach(varName => {
        console.log(`      - ${varName}`);
      });
      
      // Definir defaults para desenvolvimento
      process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
      process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
      process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';
      process.env.SQS_ENDPOINT = process.env.SQS_ENDPOINT || 'http://localhost:4566'; // LocalStack
    }
    console.log('   ✅ Variáveis de ambiente configuradas');
  }

  async createDirectories() {
    console.log('📁 Criando diretórios necessários...');
    
    const directories = [
      'logs',
      'tmp',
      'data',
      'tests/reports'
    ];
    
    for (const dir of directories) {
      const fullPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`   ✅ Criado: ${dir}`);
      } else {
        console.log(`   ⏭️  Já existe: ${dir}`);
      }
    }
  }

  async provisionSQS() {
    console.log('🔧 Provisionando filas SQS...');
    
    try {
      const provisionScript = path.join(this.projectRoot, 'scripts', 'provision-sqs.js');
      await this.runCommand('node', [provisionScript, 'provision'], {
        cwd: this.projectRoot,
        env: { ...process.env }
      });
      console.log('   ✅ SQS provisionado');
    } catch (error) {
      console.log('   ⚠️  Erro no provisionamento SQS (continuando...):', error.message);
    }
  }

  async startHTTPMocks() {
    console.log('🎭 Iniciando mocks HTTP...');
    
    const mocks = [
      { name: 'policy-api', script: 'mocks/policy-api-mock.js', port: 8001 },
      { name: 'state-api', script: 'mocks/state-api-mock.js', port: 8002 },
      { name: 'schema-registry', script: 'mocks/schema-registry-mock.js', port: 8003 }
    ];
    
    for (const mock of mocks) {
      try {
        const mockPath = path.join(this.projectRoot, mock.script);
        if (fs.existsSync(mockPath)) {
          const process = this.spawnProcess('node', [mockPath], {
            cwd: this.projectRoot,
            env: { ...process.env, PORT: mock.port.toString() }
          });
          
          this.processes.push({ name: mock.name, process, port: mock.port });
          
          // Aguardar inicialização
          await this.sleep(2000);
          
          // Verificar se está funcionando
          try {
            await axios.get(`http://localhost:${mock.port}/health`, { timeout: 3000 });
            console.log(`   ✅ ${mock.name} iniciado na porta ${mock.port}`);
          } catch (error) {
            console.log(`   ⚠️  ${mock.name} pode não estar respondendo`);
          }
        } else {
          console.log(`   ⏭️  Mock não encontrado: ${mock.script}`);
        }
      } catch (error) {
        console.log(`   ❌ Erro ao iniciar ${mock.name}:`, error.message);
      }
    }
  }

  async startAgents() {
    console.log('🤖 Iniciando agentes...');
    
    try {
      const startAllScript = path.join(this.projectRoot, 'scripts', 'start-all.js');
      const agentsProcess = this.spawnProcess('node', [startAllScript], {
        cwd: this.projectRoot,
        env: { ...process.env }
      });
      
      this.processes.push({ name: 'agents', process: agentsProcess });
      
      // Aguardar inicialização dos agentes
      console.log('   ⏳ Aguardando inicialização dos agentes...');
      await this.sleep(10000);
      
      // Verificar se os agentes estão respondendo
      const agents = [
        { name: 'interface-agent', port: 3001 },
        { name: 'event-agent', port: 3002 },
        { name: 'planning-agent', port: 3003 },
        { name: 'execution-agent', port: 3004 },
        { name: 'state-management-agent', port: 3005 },
        { name: 'acl-middleware-agent', port: 3006 }
      ];
      
      for (const agent of agents) {
        try {
          await axios.get(`http://localhost:${agent.port}/health`, { timeout: 5000 });
          console.log(`   ✅ ${agent.name} respondendo na porta ${agent.port}`);
        } catch (error) {
          console.log(`   ⚠️  ${agent.name} não está respondendo na porta ${agent.port}`);
        }
      }
      
    } catch (error) {
      console.log('   ❌ Erro ao iniciar agentes:', error.message);
    }
  }

  async runSmokeTest() {
    console.log('🧪 Executando smoke test...');
    
    try {
      const smokeTestScript = path.join(this.projectRoot, 'tests', 'integration', 'smoke-test.js');
      if (fs.existsSync(smokeTestScript)) {
        await this.runCommand('node', [smokeTestScript], {
          cwd: this.projectRoot,
          env: { ...process.env }
        });
        console.log('   ✅ Smoke test passou');
      } else {
        console.log('   ⏭️  Smoke test não encontrado');
      }
    } catch (error) {
      console.log('   ⚠️  Smoke test falhou:', error.message);
    }
  }

  async showFinalStatus() {
    console.log('');
    console.log('📊 STATUS FINAL DO AMBIENTE');
    console.log('============================');
    
    // Verificar processos
    console.log('🔄 Processos em execução:');
    this.processes.forEach(proc => {
      const status = proc.process.killed ? '❌ Parado' : '✅ Executando';
      const port = proc.port ? ` (porta ${proc.port})` : '';
      console.log(`   ${status} ${proc.name}${port}`);
    });
    
    // Verificar URLs
    console.log('');
    console.log('🌐 URLs disponíveis:');
    const urls = [
      { name: 'Interface Agent', url: 'http://localhost:3001/health' },
      { name: 'Event Agent', url: 'http://localhost:3002/health' },
      { name: 'Planning Agent', url: 'http://localhost:3003/health' },
      { name: 'Execution Agent', url: 'http://localhost:3004/health' },
      { name: 'State Management Agent', url: 'http://localhost:3005/health' },
      { name: 'ACL Middleware Agent', url: 'http://localhost:3006/health' },
      { name: 'Policy API Mock', url: 'http://localhost:8001/health' },
      { name: 'State API Mock', url: 'http://localhost:8002/health' },
      { name: 'Schema Registry Mock', url: 'http://localhost:8003/health' }
    ];
    
    for (const urlInfo of urls) {
      try {
        await axios.get(urlInfo.url, { timeout: 2000 });
        console.log(`   ✅ ${urlInfo.name}: ${urlInfo.url}`);
      } catch (error) {
        console.log(`   ❌ ${urlInfo.name}: ${urlInfo.url} (não respondendo)`);
      }
    }
  }

  spawnProcess(command, args, options = {}) {
    const process = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });
    
    process.stdout.on('data', (data) => {
      // Log output if needed
    });
    
    process.stderr.on('data', (data) => {
      // Log errors if needed
    });
    
    return process;
  }

  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: 'inherit',
        ...options
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Comando falhou com código ${code}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async cleanup() {
    console.log('🧹 Limpando processos...');
    
    for (const proc of this.processes) {
      try {
        if (!proc.process.killed) {
          proc.process.kill('SIGTERM');
          console.log(`   🛑 Parado: ${proc.name}`);
        }
      } catch (error) {
        console.log(`   ⚠️  Erro ao parar ${proc.name}:`, error.message);
      }
    }
    
    // Aguardar um pouco para os processos terminarem
    await this.sleep(2000);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Execução do script
async function main() {
  const setup = new EnvironmentSetup();
  
  // Capturar sinais para cleanup
  process.on('SIGINT', async () => {
    console.log('\n🛑 Interrompido pelo usuário');
    await setup.cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Terminando processos');
    await setup.cleanup();
    process.exit(0);
  });
  
  try {
    await setup.setupComplete();
  } catch (error) {
    console.error('💥 Erro fatal na configuração:', error);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = EnvironmentSetup;