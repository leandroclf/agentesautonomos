#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Script para iniciar todos os agentes autônomos
 */
class AgentStarter {
  constructor() {
    this.agents = [
      {
        name: 'interface-agent',
        path: path.join(__dirname, '..', 'src', 'agents', 'core', 'interface-agent', 'index.js'),
        port: 3001,
        env: { PORT: '3001', AGENT_NAME: 'interface-agent' }
      },
      {
        name: 'event-agent',
        path: path.join(__dirname, '..', 'src', 'agents', 'core', 'event-agent', 'index.js'),
        port: 3002,
        env: { PORT: '3002', AGENT_NAME: 'event-agent' }
      },
      {
        name: 'planning-agent',
        path: path.join(__dirname, '..', 'src', 'agents', 'core', 'planning-agent', 'index.js'),
        port: 3003,
        env: { PORT: '3003', AGENT_NAME: 'planning-agent' }
      },
      {
        name: 'execution-agent',
        path: path.join(__dirname, '..', 'src', 'agents', 'core', 'execution-agent', 'index.js'),
        port: 3004,
        env: { PORT: '3004', AGENT_NAME: 'execution-agent' }
      },
      {
        name: 'state-management-agent',
        path: path.join(__dirname, '..', 'src', 'agents', 'core', 'state-management-agent', 'index.js'),
        port: 3005,
        env: { PORT: '3005', AGENT_NAME: 'state-management-agent' }
      },
      {
        name: 'acl-middleware-agent',
        path: path.join(__dirname, '..', 'src', 'agents', 'core', 'acl-middleware-agent', 'index.js'),
        port: 3006,
        env: { PORT: '3006', AGENT_NAME: 'acl-middleware-agent' }
      }
    ];
    
    this.processes = new Map();
    this.isShuttingDown = false;
  }

  /**
   * Verifica se todos os arquivos necessários existem
   */
  validateFiles() {
    const projectRoot = path.resolve(__dirname, '..');
    const missingFiles = [];
    
    for (const agent of this.agents) {
      const agentPath = path.join(projectRoot, agent.path);
      if (!fs.existsSync(agentPath)) {
        missingFiles.push(agentPath);
      }
    }
    
    if (missingFiles.length > 0) {
      console.error('❌ Missing agent files:');
      missingFiles.forEach(file => console.error(`   ${file}`));
      process.exit(1);
    }
    
    console.log('✅ All agent files found');
  }

  /**
   * Verifica se as portas estão disponíveis
   */
  async checkPorts() {
    const net = require('net');
    
    for (const agent of this.agents) {
      const isPortFree = await new Promise((resolve) => {
        const server = net.createServer();
        
        server.listen(agent.port, () => {
          server.close(() => resolve(true));
        });
        
        server.on('error', () => resolve(false));
      });
      
      if (!isPortFree) {
        console.error(`❌ Port ${agent.port} is already in use (needed for ${agent.name})`);
        process.exit(1);
      }
    }
    
    console.log('✅ All ports are available');
  }

  /**
   * Inicia um agente específico
   */
  startAgent(agent) {
    return new Promise((resolve, reject) => {
      const projectRoot = path.resolve(__dirname, '..');
      const agentPath = path.join(projectRoot, agent.path);
      
      console.log(`🚀 Starting ${agent.name} on port ${agent.port}...`);
      
      const env = {
        ...process.env,
        ...agent.env,
        PORT: agent.port.toString()
      };
      
      const childProcess = spawn('node', [agentPath], {
        env,
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      this.processes.set(agent.name, childProcess);
      
      // Configurar logging
      childProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          console.log(`[${agent.name}] ${line}`);
        });
      });
      
      childProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          console.error(`[${agent.name}] ERROR: ${line}`);
        });
      });
      
      childProcess.on('close', (code) => {
        if (!this.isShuttingDown) {
          console.log(`[${agent.name}] Process exited with code ${code}`);
          
          if (code !== 0) {
            console.error(`❌ ${agent.name} failed to start or crashed`);
          }
        }
        
        this.processes.delete(agent.name);
      });
      
      childProcess.on('error', (error) => {
        console.error(`❌ Failed to start ${agent.name}:`, error.message);
        reject(error);
      });
      
      // Aguardar um pouco para verificar se o processo iniciou corretamente
      setTimeout(() => {
        if (this.processes.has(agent.name)) {
          console.log(`✅ ${agent.name} started successfully`);
          resolve();
        } else {
          reject(new Error(`${agent.name} failed to start`));
        }
      }, 2000);
    });
  }

  /**
   * Inicia todos os agentes
   */
  async startAllAgents() {
    console.log('🔄 Starting all agents...');
    
    // Iniciar agentes em sequência para evitar conflitos
    for (const agent of this.agents) {
      try {
        await this.startAgent(agent);
        // Pequena pausa entre inicializações
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to start ${agent.name}:`, error.message);
        await this.shutdown();
        process.exit(1);
      }
    }
    
    console.log('\n🎉 All agents started successfully!');
    console.log('\n📊 Agent Status:');
    this.agents.forEach(agent => {
      console.log(`   ${agent.name}: http://localhost:${agent.port}`);
    });
    
    console.log('\n💡 Useful endpoints:');
    console.log('   Health checks: GET /health on each agent');
    console.log('   Metrics: GET /metrics on each agent');
    console.log('   Interface Agent: http://localhost:3000 (main entry point)');
    
    console.log('\n⚠️  Press Ctrl+C to stop all agents');
  }

  /**
   * Verifica saúde dos agentes
   */
  async checkAgentsHealth() {
    const axios = require('axios');
    
    console.log('\n🔍 Checking agents health...');
    
    for (const agent of this.agents) {
      try {
        const response = await axios.get(`http://localhost:${agent.port}/health`, {
          timeout: 5000
        });
        
        const status = response.data.status || 'unknown';
        const statusIcon = status === 'healthy' ? '✅' : '⚠️';
        
        console.log(`   ${statusIcon} ${agent.name}: ${status}`);
        
      } catch (error) {
        console.log(`   ❌ ${agent.name}: unreachable (${error.message})`);
      }
    }
  }

  /**
   * Para todos os agentes
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    console.log('\n🛑 Shutting down all agents...');
    
    const shutdownPromises = [];
    
    for (const [agentName, process] of this.processes.entries()) {
      shutdownPromises.push(new Promise((resolve) => {
        console.log(`   Stopping ${agentName}...`);
        
        process.on('close', () => {
          console.log(`   ✅ ${agentName} stopped`);
          resolve();
        });
        
        // Tentar parada graceful primeiro
        process.kill('SIGTERM');
        
        // Forçar parada após timeout
        setTimeout(() => {
          if (!process.killed) {
            console.log(`   🔨 Force killing ${agentName}...`);
            process.kill('SIGKILL');
          }
        }, 5000);
      }));
    }
    
    await Promise.all(shutdownPromises);
    console.log('✅ All agents stopped');
  }

  /**
   * Configura handlers de sinal
   */
  setupSignalHandlers() {
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down...');
      await this.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down...');
      await this.shutdown();
      process.exit(0);
    });
    
    process.on('uncaughtException', async (error) => {
      console.error('\n💥 Uncaught exception:', error);
      await this.shutdown();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('\n💥 Unhandled rejection at:', promise, 'reason:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  /**
   * Executa o starter
   */
  async run() {
    try {
      console.log('🤖 Autonomous Agents Starter');
      console.log('==============================\n');
      
      this.setupSignalHandlers();
      
      console.log('🔍 Validating environment...');
      this.validateFiles();
      await this.checkPorts();
      
      await this.startAllAgents();
      
      // Verificar saúde após alguns segundos
      setTimeout(() => {
        this.checkAgentsHealth();
      }, 5000);
      
      // Manter o processo vivo
      await new Promise(() => {});
      
    } catch (error) {
      console.error('💥 Startup failed:', error.message);
      await this.shutdown();
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const starter = new AgentStarter();
  starter.run();
}

module.exports = AgentStarter;