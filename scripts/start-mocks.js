/**
 * Script para iniciar todos os mocks HTTP
 * Estratégia Anti-Deadlock - Fase 1
 * 
 * Execução: npm run mocks:start
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuração dos mocks
const MOCKS = [
  {
    name: 'Policy API Mock',
    script: path.join(__dirname, '..', 'src', 'mocks', 'policy-api-mock.js'),
    port: 3001,
    env: { MOCK_POLICY_API_PORT: '3001' }
  },
  {
    name: 'State API Mock',
    script: path.join(__dirname, '..', 'src', 'mocks', 'state-api-mock.js'),
    port: 3002,
    env: { MOCK_STATE_API_PORT: '3002' }
  },
  {
    name: 'Schema Registry Mock',
    script: path.join(__dirname, '..', 'src', 'mocks', 'schema-registry-mock.js'),
    port: 3003,
    env: { MOCK_SCHEMA_REGISTRY_PORT: '3003' }
  }
];

const runningProcesses = [];

/**
 * Inicia um mock específico
 */
function startMock(mockConfig) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Iniciando ${mockConfig.name} na porta ${mockConfig.port}...`);
    
    const process = spawn('node', [mockConfig.script], {
      env: {
        ...process.env,
        ...mockConfig.env
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let started = false;
    
    process.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[${mockConfig.name}] ${output.trim()}`);
      
      if (output.includes('running on port') && !started) {
        started = true;
        resolve(process);
      }
    });
    
    process.stderr.on('data', (data) => {
      console.error(`[${mockConfig.name}] ERROR: ${data.toString().trim()}`);
    });
    
    process.on('error', (error) => {
      console.error(`❌ Erro ao iniciar ${mockConfig.name}:`, error.message);
      reject(error);
    });
    
    process.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ ${mockConfig.name} terminou com código ${code}`);
      } else {
        console.log(`✅ ${mockConfig.name} terminou normalmente`);
      }
    });
    
    // Timeout de 10 segundos para inicialização
    setTimeout(() => {
      if (!started) {
        console.error(`⏰ Timeout ao iniciar ${mockConfig.name}`);
        process.kill();
        reject(new Error(`Timeout starting ${mockConfig.name}`));
      }
    }, 10000);
  });
}

/**
 * Verifica se uma porta está disponível
 */
function checkPort(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true); // Porta disponível
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false); // Porta ocupada
    });
  });
}

/**
 * Verifica se todos os mocks estão respondendo
 */
async function healthCheck() {
  const axios = require('axios');
  
  console.log('\n🔍 Verificando saúde dos mocks...');
  
  for (const mock of MOCKS) {
    try {
      const response = await axios.get(`http://localhost:${mock.port}/health`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        console.log(`✅ ${mock.name}: ${response.data.status}`);
      } else {
        console.log(`⚠️  ${mock.name}: Status ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${mock.name}: ${error.message}`);
    }
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🎭 INICIANDO MOCKS HTTP - ESTRATÉGIA ANTI-DEADLOCK');
  console.log('=' .repeat(60));
  
  try {
    // Verificar se as portas estão disponíveis
    console.log('🔍 Verificando disponibilidade das portas...');
    for (const mock of MOCKS) {
      const available = await checkPort(mock.port);
      if (!available) {
        console.error(`❌ Porta ${mock.port} já está em uso (${mock.name})`);
        process.exit(1);
      }
      console.log(`✅ Porta ${mock.port} disponível`);
    }
    
    // Iniciar todos os mocks
    console.log('\n🚀 Iniciando mocks...');
    for (const mock of MOCKS) {
      try {
        const process = await startMock(mock);
        runningProcesses.push({ name: mock.name, process });
      } catch (error) {
        console.error(`❌ Falha ao iniciar ${mock.name}:`, error.message);
        // Parar processos já iniciados
        runningProcesses.forEach(({ process }) => process.kill());
        process.exit(1);
      }
    }
    
    console.log('\n✅ Todos os mocks foram iniciados com sucesso!');
    
    // Aguardar um pouco e fazer health check
    setTimeout(healthCheck, 2000);
    
    console.log('\n📋 URLs dos Mocks:');
    MOCKS.forEach(mock => {
      console.log(`   ${mock.name}: http://localhost:${mock.port}`);
      console.log(`   Health Check: http://localhost:${mock.port}/health`);
    });
    
    console.log('\n🛑 Para parar todos os mocks, pressione Ctrl+C');
    
  } catch (error) {
    console.error('❌ Erro durante inicialização:', error.message);
    process.exit(1);
  }
}

/**
 * Cleanup ao receber sinais de término
 */
function cleanup() {
  console.log('\n🛑 Parando todos os mocks...');
  
  runningProcesses.forEach(({ name, process }) => {
    console.log(`   Parando ${name}...`);
    process.kill('SIGTERM');
  });
  
  setTimeout(() => {
    console.log('✅ Todos os mocks foram parados');
    process.exit(0);
  }, 2000);
}

// Handlers para sinais de término
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGQUIT', cleanup);

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = {
  startMock,
  checkPort,
  healthCheck,
  MOCKS
};