/**
 * Local Environment Manager
 * 
 * Script para gerenciar o ambiente de desenvolvimento local de forma granular:
 * - Iniciar/parar serviços individuais
 * - Verificar status dos serviços
 * - Limpar dados de desenvolvimento
 * - Resetar ambiente
 * - Backup/restore de dados
 * 
 * Uso: 
 *   node scripts/local-env-manager.js <comando> [opções]
 * 
 * Comandos:
 *   start [service]     - Iniciar todos os serviços ou um específico
 *   stop [service]      - Parar todos os serviços ou um específico
 *   restart [service]   - Reiniciar todos os serviços ou um específico
 *   status              - Verificar status de todos os serviços
 *   logs [service]      - Mostrar logs de um serviço
 *   clean               - Limpar dados de desenvolvimento
 *   reset               - Resetar ambiente completamente
 *   backup              - Fazer backup dos dados
 *   restore [file]      - Restaurar backup
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class LocalEnvironmentManager {
  constructor() {
    this.services = {
      localstack: {
        name: 'LocalStack (AWS Services)',
        container: 'agentes-localstack',
        port: 4566,
        healthUrl: 'http://localhost:4566/health',
        description: 'Simula serviços AWS (SQS, S3, etc.)'
      },
      postgres: {
        name: 'PostgreSQL Database',
        container: 'agentes-postgres',
        port: 5432,
        healthUrl: null,
        description: 'Banco de dados principal'
      },
      redis: {
        name: 'Redis Cache',
        container: 'agentes-redis',
        port: 6379,
        healthUrl: null,
        description: 'Cache e sessões'
      },
      pgadmin: {
        name: 'PgAdmin',
        container: 'agentes-pgadmin',
        port: 8080,
        healthUrl: 'http://localhost:8080',
        description: 'Interface web para PostgreSQL'
      },
      'redis-commander': {
        name: 'Redis Commander',
        container: 'agentes-redis-commander',
        port: 8081,
        healthUrl: 'http://localhost:8081',
        description: 'Interface web para Redis'
      }
    };
    
    this.agents = {
      event: { port: 3003, name: 'Event Agent' },
      planning: { port: 3004, name: 'Planning Agent' },
      execution: { port: 3005, name: 'Execution Agent' },
      monitoring: { port: 3006, name: 'Monitoring Agent' },
      security: { port: 3007, name: 'Security Agent' },
      policy: { port: 3008, name: 'Policy Agent' }
    };
  }
  
  /**
   * Executar comando e retornar Promise
   */
  execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject({ error, stderr, stdout });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
  
  /**
   * Verificar se um serviço está rodando
   */
  async checkServiceHealth(service) {
    const serviceConfig = this.services[service];
    if (!serviceConfig) {
      return { status: 'unknown', message: 'Serviço não encontrado' };
    }
    
    try {
      // Verificar se container está rodando
      const { stdout } = await this.execCommand(`docker ps --filter "name=${serviceConfig.container}" --format "{{.Status}}"`);
      
      if (!stdout.trim()) {
        return { status: 'stopped', message: 'Container parado' };
      }
      
      if (stdout.includes('Up')) {
        // Se tem URL de health check, verificar
        if (serviceConfig.healthUrl) {
          try {
            await axios.get(serviceConfig.healthUrl, { timeout: 3000 });
            return { status: 'healthy', message: 'Serviço funcionando' };
          } catch (error) {
            return { status: 'unhealthy', message: 'Container rodando mas serviço não responde' };
          }
        } else {
          return { status: 'running', message: 'Container rodando' };
        }
      } else {
        return { status: 'starting', message: 'Container iniciando' };
      }
      
    } catch (error) {
      return { status: 'error', message: `Erro ao verificar: ${error.message}` };
    }
  }
  
  /**
   * Verificar status de um agente
   */
  async checkAgentHealth(agent) {
    const agentConfig = this.agents[agent];
    if (!agentConfig) {
      return { status: 'unknown', message: 'Agente não encontrado' };
    }
    
    try {
      const response = await axios.get(`http://localhost:${agentConfig.port}/health`, {
        timeout: 3000
      });
      
      if (response.status === 200) {
        return { status: 'healthy', message: 'Agente funcionando', data: response.data };
      } else {
        return { status: 'unhealthy', message: `Status HTTP: ${response.status}` };
      }
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { status: 'stopped', message: 'Agente não está rodando' };
      } else {
        return { status: 'error', message: `Erro: ${error.message}` };
      }
    }
  }
  
  /**
   * Iniciar serviço específico
   */
  async startService(serviceName) {
    try {
      if (serviceName === 'all') {
        console.log('🚀 Iniciando todos os serviços...');
        await this.execCommand('docker-compose up -d');
        console.log('✅ Todos os serviços iniciados');
      } else if (this.services[serviceName]) {
        console.log(`🚀 Iniciando ${this.services[serviceName].name}...`);
        await this.execCommand(`docker-compose up -d ${serviceName}`);
        console.log(`✅ ${this.services[serviceName].name} iniciado`);
      } else {
        console.error(`❌ Serviço '${serviceName}' não encontrado`);
        this.listAvailableServices();
        return;
      }
      
      // Aguardar um pouco para os serviços iniciarem
      console.log('⏳ Aguardando serviços ficarem prontos...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`❌ Erro ao iniciar serviço(s):`, error.stderr || error.message);
    }
  }
  
  /**
   * Parar serviço específico
   */
  async stopService(serviceName) {
    try {
      if (serviceName === 'all') {
        console.log('🛑 Parando todos os serviços...');
        await this.execCommand('docker-compose down');
        console.log('✅ Todos os serviços parados');
      } else if (this.services[serviceName]) {
        console.log(`🛑 Parando ${this.services[serviceName].name}...`);
        await this.execCommand(`docker-compose stop ${serviceName}`);
        console.log(`✅ ${this.services[serviceName].name} parado`);
      } else {
        console.error(`❌ Serviço '${serviceName}' não encontrado`);
        this.listAvailableServices();
        return;
      }
      
    } catch (error) {
      console.error(`❌ Erro ao parar serviço(s):`, error.stderr || error.message);
    }
  }
  
  /**
   * Reiniciar serviço específico
   */
  async restartService(serviceName) {
    console.log(`🔄 Reiniciando ${serviceName}...`);
    await this.stopService(serviceName);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.startService(serviceName);
  }
  
  /**
   * Mostrar status de todos os serviços
   */
  async showStatus() {
    console.log('📊 Status dos Serviços de Infraestrutura:');
    console.log('=' .repeat(60));
    
    for (const [serviceName, serviceConfig] of Object.entries(this.services)) {
      const health = await this.checkServiceHealth(serviceName);
      const statusIcon = this.getStatusIcon(health.status);
      
      console.log(`${statusIcon} ${serviceConfig.name.padEnd(25)} | ${health.status.padEnd(10)} | ${health.message}`);
      if (serviceConfig.port) {
        console.log(`   📍 Porta: ${serviceConfig.port} | ${serviceConfig.description}`);
      }
      console.log('');
    }
    
    console.log('📊 Status dos Agentes:');
    console.log('=' .repeat(60));
    
    for (const [agentName, agentConfig] of Object.entries(this.agents)) {
      const health = await this.checkAgentHealth(agentName);
      const statusIcon = this.getStatusIcon(health.status);
      
      console.log(`${statusIcon} ${agentConfig.name.padEnd(25)} | ${health.status.padEnd(10)} | ${health.message}`);
      console.log(`   📍 Porta: ${agentConfig.port}`);
      console.log('');
    }
  }
  
  /**
   * Obter ícone para status
   */
  getStatusIcon(status) {
    switch (status) {
      case 'healthy':
      case 'running':
        return '✅';
      case 'starting':
        return '🟡';
      case 'stopped':
        return '🔴';
      case 'unhealthy':
      case 'error':
        return '❌';
      default:
        return '❓';
    }
  }
  
  /**
   * Mostrar logs de um serviço
   */
  async showLogs(serviceName, follow = false) {
    try {
      if (!this.services[serviceName]) {
        console.error(`❌ Serviço '${serviceName}' não encontrado`);
        this.listAvailableServices();
        return;
      }
      
      const followFlag = follow ? '-f' : '';
      const command = `docker-compose logs ${followFlag} --tail=50 ${serviceName}`;
      
      console.log(`📋 Logs do ${this.services[serviceName].name}:`);
      console.log('=' .repeat(60));
      
      if (follow) {
        // Para logs em tempo real, usar spawn
        const child = spawn('docker-compose', ['logs', '-f', '--tail=50', serviceName], {
          stdio: 'inherit'
        });
        
        process.on('SIGINT', () => {
          child.kill('SIGINT');
          process.exit(0);
        });
      } else {
        const { stdout } = await this.execCommand(command);
        console.log(stdout);
      }
      
    } catch (error) {
      console.error(`❌ Erro ao obter logs:`, error.stderr || error.message);
    }
  }
  
  /**
   * Limpar dados de desenvolvimento
   */
  async cleanData() {
    try {
      console.log('🧹 Limpando dados de desenvolvimento...');
      
      // Parar serviços
      await this.execCommand('docker-compose down');
      
      // Remover volumes
      await this.execCommand('docker-compose down -v');
      
      // Remover imagens órfãs
      await this.execCommand('docker system prune -f');
      
      console.log('✅ Dados limpos com sucesso');
      
    } catch (error) {
      console.error(`❌ Erro ao limpar dados:`, error.stderr || error.message);
    }
  }
  
  /**
   * Resetar ambiente completamente
   */
  async resetEnvironment() {
    try {
      console.log('🔄 Resetando ambiente completamente...');
      
      // Limpar dados
      await this.cleanData();
      
      // Recriar e iniciar serviços
      await this.execCommand('docker-compose up -d --force-recreate');
      
      console.log('⏳ Aguardando serviços ficarem prontos...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Recriar filas SQS
      await this.recreateSQSQueues();
      
      console.log('✅ Ambiente resetado com sucesso');
      
    } catch (error) {
      console.error(`❌ Erro ao resetar ambiente:`, error.stderr || error.message);
    }
  }
  
  /**
   * Recriar filas SQS
   */
  async recreateSQSQueues() {
    const queues = [
      'event-agent-queue-dev',
      'planning-agent-queue-dev',
      'execution-agent-queue-dev',
      'monitoring-agent-queue-dev',
      'security-agent-queue-dev',
      'policy-agent-queue-dev',
      'event-agent-queue-dev-dlq',
      'planning-agent-queue-dev-dlq',
      'execution-agent-queue-dev-dlq',
      'monitoring-agent-queue-dev-dlq',
      'security-agent-queue-dev-dlq',
      'policy-agent-queue-dev-dlq'
    ];
    
    console.log('📋 Recriando filas SQS...');
    
    for (const queueName of queues) {
      try {
        const command = `aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name ${queueName} --region us-east-1`;
        await this.execCommand(command);
        console.log(`✅ Fila criada: ${queueName}`);
      } catch (error) {
        console.log(`⚠️  Erro ao criar fila ${queueName}: ${error.message}`);
      }
    }
  }
  
  /**
   * Fazer backup dos dados
   */
  async backupData() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(__dirname, '..', 'backups', timestamp);
      
      if (!fs.existsSync(path.dirname(backupDir))) {
        fs.mkdirSync(path.dirname(backupDir), { recursive: true });
      }
      fs.mkdirSync(backupDir);
      
      console.log(`💾 Fazendo backup para: ${backupDir}`);
      
      // Backup do PostgreSQL
      console.log('📦 Backup do PostgreSQL...');
      const pgDumpCommand = `docker exec agentes-postgres pg_dump -U postgres agentes_autonomos > "${path.join(backupDir, 'postgres.sql')}"`;
      await this.execCommand(pgDumpCommand);
      
      // Backup do Redis
      console.log('📦 Backup do Redis...');
      const redisDumpCommand = `docker exec agentes-redis redis-cli BGSAVE`;
      await this.execCommand(redisDumpCommand);
      
      // Copiar dump do Redis
      const redisCopyCommand = `docker cp agentes-redis:/data/dump.rdb "${path.join(backupDir, 'redis.rdb')}"`;
      await this.execCommand(redisCopyCommand);
      
      // Salvar configurações
      const configData = {
        timestamp: new Date().toISOString(),
        services: this.services,
        agents: this.agents,
        environment: process.env.NODE_ENV || 'development'
      };
      
      fs.writeFileSync(
        path.join(backupDir, 'config.json'),
        JSON.stringify(configData, null, 2)
      );
      
      console.log(`✅ Backup concluído: ${backupDir}`);
      
    } catch (error) {
      console.error(`❌ Erro ao fazer backup:`, error.stderr || error.message);
    }
  }
  
  /**
   * Restaurar backup
   */
  async restoreData(backupPath) {
    try {
      if (!fs.existsSync(backupPath)) {
        console.error(`❌ Backup não encontrado: ${backupPath}`);
        return;
      }
      
      console.log(`📥 Restaurando backup de: ${backupPath}`);
      
      // Verificar se serviços estão rodando
      const pgHealth = await this.checkServiceHealth('postgres');
      const redisHealth = await this.checkServiceHealth('redis');
      
      if (pgHealth.status !== 'healthy' && pgHealth.status !== 'running') {
        console.log('🚀 Iniciando PostgreSQL...');
        await this.startService('postgres');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      if (redisHealth.status !== 'healthy' && redisHealth.status !== 'running') {
        console.log('🚀 Iniciando Redis...');
        await this.startService('redis');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Restaurar PostgreSQL
      const pgBackupFile = path.join(backupPath, 'postgres.sql');
      if (fs.existsSync(pgBackupFile)) {
        console.log('📥 Restaurando PostgreSQL...');
        const pgRestoreCommand = `docker exec -i agentes-postgres psql -U postgres agentes_autonomos < "${pgBackupFile}"`;
        await this.execCommand(pgRestoreCommand);
      }
      
      // Restaurar Redis
      const redisBackupFile = path.join(backupPath, 'redis.rdb');
      if (fs.existsSync(redisBackupFile)) {
        console.log('📥 Restaurando Redis...');
        await this.execCommand('docker exec agentes-redis redis-cli FLUSHALL');
        const redisCopyCommand = `docker cp "${redisBackupFile}" agentes-redis:/data/dump.rdb`;
        await this.execCommand(redisCopyCommand);
        await this.execCommand('docker restart agentes-redis');
      }
      
      console.log('✅ Backup restaurado com sucesso');
      
    } catch (error) {
      console.error(`❌ Erro ao restaurar backup:`, error.stderr || error.message);
    }
  }
  
  /**
   * Listar serviços disponíveis
   */
  listAvailableServices() {
    console.log('\n📋 Serviços disponíveis:');
    for (const [serviceName, serviceConfig] of Object.entries(this.services)) {
      console.log(`   ${serviceName.padEnd(15)} - ${serviceConfig.name}`);
    }
    console.log('   all             - Todos os serviços');
  }
  
  /**
   * Mostrar ajuda
   */
  showHelp() {
    console.log(`
🔧 Local Environment Manager - Agentes Autônomos
`);
    console.log('Uso: node scripts/local-env-manager.js <comando> [opções]\n');
    console.log('Comandos:');
    console.log('  start [service]     Iniciar todos os serviços ou um específico');
    console.log('  stop [service]      Parar todos os serviços ou um específico');
    console.log('  restart [service]   Reiniciar todos os serviços ou um específico');
    console.log('  status              Verificar status de todos os serviços');
    console.log('  logs <service>      Mostrar logs de um serviço');
    console.log('  logs-f <service>    Seguir logs de um serviço em tempo real');
    console.log('  clean               Limpar dados de desenvolvimento');
    console.log('  reset               Resetar ambiente completamente');
    console.log('  backup              Fazer backup dos dados');
    console.log('  restore <path>      Restaurar backup');
    console.log('  help                Mostrar esta ajuda\n');
    
    this.listAvailableServices();
    
    console.log('\n📝 Exemplos:');
    console.log('  node scripts/local-env-manager.js start');
    console.log('  node scripts/local-env-manager.js start postgres');
    console.log('  node scripts/local-env-manager.js status');
    console.log('  node scripts/local-env-manager.js logs localstack');
    console.log('  node scripts/local-env-manager.js backup');
  }
  
  /**
   * Executar comando baseado nos argumentos
   */
  async run() {
    const args = process.argv.slice(2);
    const command = args[0];
    const target = args[1];
    
    switch (command) {
      case 'start':
        await this.startService(target || 'all');
        break;
        
      case 'stop':
        await this.stopService(target || 'all');
        break;
        
      case 'restart':
        await this.restartService(target || 'all');
        break;
        
      case 'status':
        await this.showStatus();
        break;
        
      case 'logs':
        if (!target) {
          console.error('❌ Especifique o serviço para mostrar logs');
          this.listAvailableServices();
          return;
        }
        await this.showLogs(target, false);
        break;
        
      case 'logs-f':
        if (!target) {
          console.error('❌ Especifique o serviço para seguir logs');
          this.listAvailableServices();
          return;
        }
        await this.showLogs(target, true);
        break;
        
      case 'clean':
        await this.cleanData();
        break;
        
      case 'reset':
        await this.resetEnvironment();
        break;
        
      case 'backup':
        await this.backupData();
        break;
        
      case 'restore':
        if (!target) {
          console.error('❌ Especifique o caminho do backup');
          return;
        }
        await this.restoreData(target);
        break;
        
      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        break;
        
      default:
        console.error(`❌ Comando desconhecido: ${command}`);
        this.showHelp();
        break;
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const manager = new LocalEnvironmentManager();
  manager.run().catch(error => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
}

module.exports = LocalEnvironmentManager;