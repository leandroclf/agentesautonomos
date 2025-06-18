/**
 * Sistema de Agentes Autônomos - Inicializador Principal
 * Fase 1-2: Inicialização e coordenação de todos os agentes
 */

const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const { createLogger } = require('./utils/logger');

// Logger principal do sistema
const logger = createLogger('system');

// Mapa de processos dos agentes
const agentProcesses = new Map();

// Configuração dos agentes disponíveis
const AGENTS = {
  // Agentes principais (Core)
  event: {
    name: 'Event Agent',
    path: './agents/core/event-agent/index.js',
    port: config.agents.event.port,
    essential: true,
    dependencies: []
  },
  planning: {
    name: 'Planning Agent',
    path: './agents/core/planning-agent/index.js',
    port: config.agents.planning.port,
    essential: true,
    dependencies: ['event']
  },
  execution: {
    name: 'Execution Agent',
    path: './agents/core/execution-agent/index.js',
    port: config.agents.execution.port,
    essential: true,
    dependencies: ['planning']
  },
  
  // Agentes auxiliares
  monitoring: {
    name: 'Monitoring Agent',
    path: './agents/auxiliary/monitoring-agent/index.js',
    port: config.agents.monitoring.port,
    essential: false,
    dependencies: []
  },
  security: {
    name: 'Security Agent',
    path: './agents/auxiliary/security-agent/index.js',
    port: config.agents.security.port,
    essential: false,
    dependencies: []
  },
  policy: {
    name: 'Policy Agent',
    path: './agents/auxiliary/policy-agent/index.js',
    port: config.agents.policy.port,
    essential: false,
    dependencies: []
  }
};

// Estados possíveis dos agentes
const AGENT_STATES = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
};

// Estado atual dos agentes
const agentStates = new Map();

// Inicializar estados
Object.keys(AGENTS).forEach(agentId => {
  agentStates.set(agentId, AGENT_STATES.STOPPED);
});

/**
 * Inicia um agente específico
 * @param {string} agentId - ID do agente
 * @returns {Promise<boolean>} - Sucesso da inicialização
 */
async function startAgent(agentId) {
  const agent = AGENTS[agentId];
  if (!agent) {
    logger.error(`Agente não encontrado: ${agentId}`);
    return false;
  }
  
  // Verificar se já está rodando
  if (agentStates.get(agentId) === AGENT_STATES.RUNNING) {
    logger.info(`Agente ${agent.name} já está rodando`);
    return true;
  }
  
  // Verificar dependências
  for (const depId of agent.dependencies) {
    if (agentStates.get(depId) !== AGENT_STATES.RUNNING) {
      logger.warn(`Dependência ${depId} não está rodando para ${agentId}`);
      // Tentar iniciar dependência
      const depStarted = await startAgent(depId);
      if (!depStarted) {
        logger.error(`Falha ao iniciar dependência ${depId} para ${agentId}`);
        return false;
      }
    }
  }
  
  try {
    agentStates.set(agentId, AGENT_STATES.STARTING);
    logger.info(`Iniciando ${agent.name}...`);
    
    const agentPath = path.resolve(__dirname, agent.path);
    const process = spawn('node', [agentPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGENT_ID: agentId,
        AGENT_NAME: agent.name,
        AGENT_PORT: agent.port.toString()
      }
    });
    
    // Configurar handlers do processo
    process.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        logger.info(`[${agent.name}] ${message}`);
      }
    });
    
    process.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        logger.error(`[${agent.name}] ${message}`);
      }
    });
    
    process.on('close', (code) => {
      logger.info(`${agent.name} finalizou com código ${code}`);
      agentStates.set(agentId, AGENT_STATES.STOPPED);
      agentProcesses.delete(agentId);
      
      // Se é um agente essencial e não foi parada intencional, tentar reiniciar
      if (agent.essential && code !== 0 && agentStates.get(agentId) !== AGENT_STATES.STOPPING) {
        logger.warn(`Agente essencial ${agent.name} falhou. Tentando reiniciar em 5 segundos...`);
        setTimeout(() => {
          startAgent(agentId).catch(err => {
            logger.error(`Falha ao reiniciar ${agent.name}:`, err);
          });
        }, 5000);
      }
    });
    
    process.on('error', (err) => {
      logger.error(`Erro no processo ${agent.name}:`, err);
      agentStates.set(agentId, AGENT_STATES.ERROR);
    });
    
    // Armazenar referência do processo
    agentProcesses.set(agentId, process);
    
    // Aguardar um tempo para verificar se iniciou corretamente
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verificar se o processo ainda está rodando
    if (process.killed || process.exitCode !== null) {
      agentStates.set(agentId, AGENT_STATES.ERROR);
      logger.error(`${agent.name} falhou ao iniciar`);
      return false;
    }
    
    agentStates.set(agentId, AGENT_STATES.RUNNING);
    logger.info(`${agent.name} iniciado com sucesso na porta ${agent.port}`);
    return true;
    
  } catch (error) {
    logger.error(`Erro ao iniciar ${agent.name}:`, error);
    agentStates.set(agentId, AGENT_STATES.ERROR);
    return false;
  }
}

/**
 * Para um agente específico
 * @param {string} agentId - ID do agente
 * @returns {Promise<boolean>} - Sucesso da parada
 */
async function stopAgent(agentId) {
  const agent = AGENTS[agentId];
  if (!agent) {
    logger.error(`Agente não encontrado: ${agentId}`);
    return false;
  }
  
  const process = agentProcesses.get(agentId);
  if (!process) {
    logger.info(`${agent.name} não está rodando`);
    agentStates.set(agentId, AGENT_STATES.STOPPED);
    return true;
  }
  
  try {
    agentStates.set(agentId, AGENT_STATES.STOPPING);
    logger.info(`Parando ${agent.name}...`);
    
    // Tentar parada graceful primeiro
    process.kill('SIGTERM');
    
    // Aguardar um tempo para parada graceful
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Se ainda estiver rodando, forçar parada
    if (!process.killed && process.exitCode === null) {
      logger.warn(`Forçando parada de ${agent.name}`);
      process.kill('SIGKILL');
    }
    
    agentStates.set(agentId, AGENT_STATES.STOPPED);
    agentProcesses.delete(agentId);
    logger.info(`${agent.name} parado com sucesso`);
    return true;
    
  } catch (error) {
    logger.error(`Erro ao parar ${agent.name}:`, error);
    return false;
  }
}

/**
 * Inicia todos os agentes na ordem correta
 * @param {string[]} agentIds - IDs dos agentes a iniciar (opcional)
 * @returns {Promise<boolean>} - Sucesso da inicialização
 */
async function startAllAgents(agentIds = null) {
  const agentsToStart = agentIds || Object.keys(AGENTS);
  
  logger.info('Iniciando sistema de agentes autônomos...');
  
  // Ordenar agentes por dependências
  const sortedAgents = topologicalSort(agentsToStart);
  
  let allStarted = true;
  
  for (const agentId of sortedAgents) {
    const started = await startAgent(agentId);
    if (!started) {
      const agent = AGENTS[agentId];
      if (agent.essential) {
        logger.error(`Falha ao iniciar agente essencial ${agent.name}. Abortando inicialização.`);
        allStarted = false;
        break;
      } else {
        logger.warn(`Falha ao iniciar agente auxiliar ${agent.name}. Continuando...`);
      }
    }
  }
  
  if (allStarted) {
    logger.info('Sistema de agentes iniciado com sucesso!');
  } else {
    logger.error('Falha na inicialização do sistema de agentes');
  }
  
  return allStarted;
}

/**
 * Para todos os agentes
 * @returns {Promise<boolean>} - Sucesso da parada
 */
async function stopAllAgents() {
  logger.info('Parando sistema de agentes...');
  
  const agentIds = Array.from(agentProcesses.keys());
  const promises = agentIds.map(agentId => stopAgent(agentId));
  
  const results = await Promise.all(promises);
  const allStopped = results.every(result => result);
  
  if (allStopped) {
    logger.info('Sistema de agentes parado com sucesso');
  } else {
    logger.error('Alguns agentes falharam ao parar');
  }
  
  return allStopped;
}

/**
 * Ordenação topológica dos agentes baseada em dependências
 * @param {string[]} agentIds - IDs dos agentes
 * @returns {string[]} - Agentes ordenados
 */
function topologicalSort(agentIds) {
  const visited = new Set();
  const visiting = new Set();
  const result = [];
  
  function visit(agentId) {
    if (visiting.has(agentId)) {
      throw new Error(`Dependência circular detectada envolvendo ${agentId}`);
    }
    
    if (visited.has(agentId)) {
      return;
    }
    
    visiting.add(agentId);
    
    const agent = AGENTS[agentId];
    if (agent) {
      for (const depId of agent.dependencies) {
        if (agentIds.includes(depId)) {
          visit(depId);
        }
      }
    }
    
    visiting.delete(agentId);
    visited.add(agentId);
    result.push(agentId);
  }
  
  for (const agentId of agentIds) {
    if (!visited.has(agentId)) {
      visit(agentId);
    }
  }
  
  return result;
}

/**
 * Obtém o status de todos os agentes
 * @returns {Object} - Status dos agentes
 */
function getSystemStatus() {
  const status = {
    timestamp: new Date().toISOString(),
    agents: {},
    summary: {
      total: Object.keys(AGENTS).length,
      running: 0,
      stopped: 0,
      error: 0,
      essential_running: 0,
      essential_total: 0
    }
  };
  
  Object.keys(AGENTS).forEach(agentId => {
    const agent = AGENTS[agentId];
    const state = agentStates.get(agentId);
    const process = agentProcesses.get(agentId);
    
    status.agents[agentId] = {
      name: agent.name,
      state: state,
      port: agent.port,
      essential: agent.essential,
      dependencies: agent.dependencies,
      pid: process ? process.pid : null,
      uptime: process ? Date.now() - process.spawnargs.startTime : 0
    };
    
    // Atualizar sumário
    if (state === AGENT_STATES.RUNNING) status.summary.running++;
    else if (state === AGENT_STATES.STOPPED) status.summary.stopped++;
    else if (state === AGENT_STATES.ERROR) status.summary.error++;
    
    if (agent.essential) {
      status.summary.essential_total++;
      if (state === AGENT_STATES.RUNNING) {
        status.summary.essential_running++;
      }
    }
  });
  
  return status;
}

/**
 * Reinicia um agente específico
 * @param {string} agentId - ID do agente
 * @returns {Promise<boolean>} - Sucesso do reinício
 */
async function restartAgent(agentId) {
  logger.info(`Reiniciando agente ${agentId}...`);
  
  const stopped = await stopAgent(agentId);
  if (!stopped) {
    logger.error(`Falha ao parar agente ${agentId} para reinício`);
    return false;
  }
  
  // Aguardar um pouco antes de reiniciar
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const started = await startAgent(agentId);
  if (started) {
    logger.info(`Agente ${agentId} reiniciado com sucesso`);
  } else {
    logger.error(`Falha ao reiniciar agente ${agentId}`);
  }
  
  return started;
}

/**
 * Configurar handlers de sinal para parada graceful
 */
function setupSignalHandlers() {
  const signals = ['SIGINT', 'SIGTERM'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Recebido sinal ${signal}. Iniciando parada graceful...`);
      
      try {
        await stopAllAgents();
        logger.info('Sistema finalizado com sucesso');
        process.exit(0);
      } catch (error) {
        logger.error('Erro durante parada graceful:', error);
        process.exit(1);
      }
    });
  });
  
  // Handler para erros não capturados
  process.on('uncaughtException', (error) => {
    logger.error('Erro não capturado:', error);
    stopAllAgents().finally(() => {
      process.exit(1);
    });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Promise rejeitada não tratada:', { reason, promise });
    stopAllAgents().finally(() => {
      process.exit(1);
    });
  });
}

/**
 * Função principal
 */
async function main() {
  try {
    // Validar configuração
    config.validateConfig();
    
    // Configurar handlers de sinal
    setupSignalHandlers();
    
    // Verificar argumentos da linha de comando
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
      case 'start':
        const agentsToStart = args.slice(1);
        await startAllAgents(agentsToStart.length > 0 ? agentsToStart : null);
        break;
        
      case 'stop':
        await stopAllAgents();
        process.exit(0);
        break;
        
      case 'restart':
        const agentToRestart = args[1];
        if (agentToRestart) {
          await restartAgent(agentToRestart);
        } else {
          await stopAllAgents();
          await new Promise(resolve => setTimeout(resolve, 2000));
          await startAllAgents();
        }
        break;
        
      case 'status':
        const status = getSystemStatus();
        console.log(JSON.stringify(status, null, 2));
        process.exit(0);
        break;
        
      case 'list':
        console.log('Agentes disponíveis:');
        Object.keys(AGENTS).forEach(agentId => {
          const agent = AGENTS[agentId];
          console.log(`  ${agentId}: ${agent.name} (porta ${agent.port})${agent.essential ? ' [ESSENCIAL]' : ''}`);
        });
        process.exit(0);
        break;
        
      default:
        console.log('Uso: node src/index.js <comando> [argumentos]');
        console.log('Comandos:');
        console.log('  start [agente1 agente2 ...]  - Inicia todos os agentes ou agentes específicos');
        console.log('  stop                         - Para todos os agentes');
        console.log('  restart [agente]             - Reinicia todos os agentes ou um agente específico');
        console.log('  status                       - Mostra status do sistema');
        console.log('  list                         - Lista agentes disponíveis');
        process.exit(1);
    }
    
  } catch (error) {
    logger.error('Erro na inicialização:', error);
    process.exit(1);
  }
}

// Executar se for o módulo principal
if (require.main === module) {
  main();
}

// Exportar funções para uso como módulo
module.exports = {
  startAgent,
  stopAgent,
  startAllAgents,
  stopAllAgents,
  restartAgent,
  getSystemStatus,
  AGENTS,
  AGENT_STATES
};