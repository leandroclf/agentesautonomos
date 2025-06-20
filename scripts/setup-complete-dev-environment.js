/**
 * Script Completo de Configuração do Ambiente de Desenvolvimento
 * 
 * Este script configura todo o ambiente de desenvolvimento do zero:
 * 1. Verifica e instala dependências
 * 2. Configura Docker e LocalStack
 * 3. Cria filas SQS necessárias
 * 4. Inicia todos os agentes
 * 5. Executa testes de eventos
 * 
 * Uso: node scripts/setup-complete-dev-environment.js
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class CompleteDevEnvironmentSetup {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.configPath = path.join(this.projectRoot, 'config', 'environments', '.env.development');
    
    this.services = {
      localstack: { port: 4566, name: 'agentes-localstack' },
      postgres: { port: 5432, name: 'agentes-postgres' },
      redis: { port: 6379, name: 'agentes-redis' },
      prometheus: { port: 9090, name: 'agentes-prometheus' },
      grafana: { port: 3000, name: 'agentes-grafana' }
    };
    
    this.agents = [
      { name: 'Event Agent', port: 3001, path: 'src/agents/core/event' },
      { name: 'Planning Agent', port: 3002, path: 'src/agents/core/planning' },
      { name: 'Execution Agent', port: 3003, path: 'src/agents/core/execution' },
      { name: 'Monitoring Agent', port: 3004, path: 'src/agents/auxiliary/monitoring' },
      { name: 'Security Agent', port: 3005, path: 'src/agents/auxiliary/security' },
      { name: 'Interface Agent', port: 3006, path: 'src/agents/infrastructure/interface' }
    ];
    
    this.testEvents = [
      {
        name: 'Login de Usuário',
        endpoint: 'http://localhost:3001/api/events',
        data: {
          type: 'user_action',
          data: {
            action: 'login',
            userId: 'user123',
            timestamp: new Date().toISOString()
          },
          priority: 'normal'
        }
      },
      {
        name: 'Processamento de Dados',
        endpoint: 'http://localhost:3001/api/events',
        data: {
          type: 'data_processing',
          data: {
            operation: 'transform',
            dataSize: 1024,
            timestamp: new Date().toISOString()
          },
          priority: 'high'
        }
      },
      {
        name: 'Alerta de Segurança',
        endpoint: 'http://localhost:3001/api/events',
        data: {
          type: 'security_alert',
          data: {
            severity: 'medium',
            source: 'firewall',
            message: 'Tentativa de acesso suspeita detectada',
            timestamp: new Date().toISOString()
          },
          priority: 'urgent'
        }
      }
    ];
  }

  /**
   * Executar comando e retornar Promise
   */
  execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🔧 Executando: ${command}`);
      exec(command, { cwd: this.projectRoot, ...options }, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Erro: ${error.message}`);
          reject(error);
        } else {
          if (stdout) console.log(stdout);
          if (stderr) console.warn(stderr);
          resolve({ stdout, stderr });
        }
      });
    });
  }

  /**
   * Aguardar um tempo específico
   */
  async wait(seconds) {
    console.log(`⏳ Aguardando ${seconds} segundos...`);
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Verificar se um serviço está rodando
   */
  async checkService(url, serviceName) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      console.log(`✅ ${serviceName} está rodando`);
      return true;
    } catch (error) {
      console.log(`❌ ${serviceName} não está acessível`);
      return false;
    }
  }

  /**
   * Etapa 1: Verificar e instalar dependências
   */
  async step1_CheckDependencies() {
    console.log('\n🔍 ETAPA 1: Verificando dependências...');
    
    try {
      // Verificar Node.js
      const nodeVersion = await this.execCommand('node --version');
      console.log(`✅ Node.js: ${nodeVersion.stdout.trim()}`);
      
      // Verificar npm
      const npmVersion = await this.execCommand('npm --version');
      console.log(`✅ npm: ${npmVersion.stdout.trim()}`);
      
      // Verificar Docker
      const dockerVersion = await this.execCommand('docker --version');
      console.log(`✅ Docker: ${dockerVersion.stdout.trim()}`);
      
      // Verificar Docker Compose
      const composeVersion = await this.execCommand('docker-compose --version');
      console.log(`✅ Docker Compose: ${composeVersion.stdout.trim()}`);
      
      // Instalar dependências do projeto
      console.log('\n📦 Instalando dependências do projeto...');
      await this.execCommand('npm install');
      
      console.log('✅ Todas as dependências verificadas e instaladas!');
      
    } catch (error) {
      console.error('❌ Erro ao verificar dependências:', error.message);
      throw error;
    }
  }

  /**
   * Etapa 2: Configurar e iniciar Docker
   */
  async step2_SetupDocker() {
    console.log('\n🐳 ETAPA 2: Configurando Docker e serviços...');
    
    try {
      // Parar containers existentes
      console.log('🛑 Parando containers existentes...');
      try {
        await this.execCommand('docker-compose down');
      } catch (error) {
        console.log('ℹ️  Nenhum container para parar');
      }
      
      // Iniciar serviços Docker
      console.log('🚀 Iniciando serviços Docker...');
      await this.execCommand('docker-compose up -d');
      
      // Aguardar inicialização
      await this.wait(15);
      
      // Verificar serviços
      console.log('\n🔍 Verificando serviços Docker...');
      const checks = [
        this.checkService('http://localhost:4566/health', 'LocalStack'),
        this.checkService('http://localhost:9090', 'Prometheus'),
        this.checkService('http://localhost:3000', 'Grafana')
      ];
      
      await Promise.all(checks);
      
      console.log('✅ Serviços Docker configurados e rodando!');
      
    } catch (error) {
      console.error('❌ Erro ao configurar Docker:', error.message);
      throw error;
    }
  }

  /**
   * Etapa 3: Configurar filas SQS
   */
  async step3_SetupSQS() {
    console.log('\n📬 ETAPA 3: Configurando filas SQS...');
    
    try {
      // Executar script de configuração SQS
      console.log('🔧 Criando filas SQS no LocalStack...');
      await this.execCommand('node scripts/setup-sqs-queues.js');
      
      console.log('✅ Filas SQS configuradas com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro ao configurar SQS:', error.message);
      throw error;
    }
  }

  /**
   * Etapa 4: Iniciar agentes
   */
  async step4_StartAgents() {
    console.log('\n🤖 ETAPA 4: Iniciando agentes...');
    
    try {
      // Verificar se existem processos de agentes rodando
      console.log('🔍 Verificando agentes existentes...');
      
      for (const agent of this.agents) {
        const agentPath = path.join(this.projectRoot, agent.path);
        
        if (fs.existsSync(agentPath)) {
          console.log(`🚀 Iniciando ${agent.name}...`);
          
          // Iniciar agente em background
          const agentProcess = spawn('node', ['index.js'], {
            cwd: agentPath,
            detached: true,
            stdio: 'ignore'
          });
          
          agentProcess.unref();
          
          // Aguardar um pouco antes do próximo
          await this.wait(2);
          
          console.log(`✅ ${agent.name} iniciado`);
        } else {
          console.log(`⚠️  ${agent.name} não encontrado em ${agentPath}`);
        }
      }
      
      // Aguardar inicialização completa
      console.log('⏳ Aguardando inicialização completa dos agentes...');
      await this.wait(10);
      
      console.log('✅ Agentes iniciados!');
      
    } catch (error) {
      console.error('❌ Erro ao iniciar agentes:', error.message);
      throw error;
    }
  }

  /**
   * Etapa 5: Executar testes de eventos
   */
  async step5_RunEventTests() {
    console.log('\n🧪 ETAPA 5: Executando testes de eventos...');
    
    try {
      // Aguardar um pouco para garantir que os agentes estão prontos
      await this.wait(5);
      
      console.log('📡 Enviando eventos de teste...');
      
      for (let i = 0; i < this.testEvents.length; i++) {
        const testEvent = this.testEvents[i];
        
        console.log(`\n🔸 Teste ${i + 1}: ${testEvent.name}`);
        
        try {
          const response = await axios.post(testEvent.endpoint, testEvent.data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          
          console.log(`✅ Evento enviado com sucesso`);
          console.log(`📊 Status: ${response.status}`);
          console.log(`📋 Resposta: ${JSON.stringify(response.data, null, 2)}`);
          
        } catch (error) {
          if (error.response) {
            console.log(`⚠️  Evento enviado mas com erro: ${error.response.status}`);
            console.log(`📋 Resposta: ${JSON.stringify(error.response.data, null, 2)}`);
          } else {
            console.log(`❌ Erro ao enviar evento: ${error.message}`);
          }
        }
        
        // Aguardar entre testes
        if (i < this.testEvents.length - 1) {
          await this.wait(3);
        }
      }
      
      console.log('\n✅ Testes de eventos concluídos!');
      
    } catch (error) {
      console.error('❌ Erro durante testes de eventos:', error.message);
      throw error;
    }
  }

  /**
   * Verificar status final do sistema
   */
  async checkSystemStatus() {
    console.log('\n📊 VERIFICAÇÃO FINAL DO SISTEMA...');
    
    try {
      // Verificar serviços Docker
      console.log('\n🐳 Status dos Serviços Docker:');
      const dockerStatus = await this.execCommand('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
      console.log(dockerStatus.stdout);
      
      // Verificar conectividade dos serviços
      console.log('\n🔗 Conectividade dos Serviços:');
      const serviceChecks = [
        { name: 'LocalStack', url: 'http://localhost:4566/health' },
        { name: 'Prometheus', url: 'http://localhost:9090' },
        { name: 'Grafana', url: 'http://localhost:3000' },
        { name: 'Interface Agent', url: 'http://localhost:3001/health' }
      ];
      
      for (const service of serviceChecks) {
        await this.checkService(service.url, service.name);
      }
      
      console.log('\n🎉 Sistema configurado e rodando com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro na verificação final:', error.message);
    }
  }

  /**
   * Executar configuração completa
   */
  async run() {
    console.log('🚀 INICIANDO CONFIGURAÇÃO COMPLETA DO AMBIENTE DE DESENVOLVIMENTO');
    console.log('=' .repeat(80));
    
    try {
      await this.step1_CheckDependencies();
      await this.step2_SetupDocker();
      await this.step3_SetupSQS();
      await this.step4_StartAgents();
      await this.step5_RunEventTests();
      await this.checkSystemStatus();
      
      console.log('\n' + '=' .repeat(80));
      console.log('🎉 CONFIGURAÇÃO COMPLETA FINALIZADA COM SUCESSO!');
      console.log('\n📋 Próximos passos:');
      console.log('1. Acesse Grafana: http://localhost:3000 (admin/admin)');
      console.log('2. Acesse Prometheus: http://localhost:9090');
      console.log('3. Acesse PgAdmin: http://localhost:8080');
      console.log('4. Acesse Redis Commander: http://localhost:8081');
      console.log('5. Consulte docs/COMO_TESTAR_EVENTOS.md para mais testes');
      console.log('\n🔧 Para parar o ambiente: docker-compose down');
      
    } catch (error) {
      console.error('\n❌ FALHA NA CONFIGURAÇÃO:', error.message);
      console.log('\n🔧 Para limpar e tentar novamente:');
      console.log('1. docker-compose down');
      console.log('2. docker system prune -f');
      console.log('3. node scripts/setup-complete-dev-environment.js');
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const setup = new CompleteDevEnvironmentSetup();
  setup.run().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = CompleteDevEnvironmentSetup;