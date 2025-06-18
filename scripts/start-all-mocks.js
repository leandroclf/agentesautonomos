#!/usr/bin/env node
/**
 * Script para iniciar todos os mocks HTTP
 * Fase 1 - Estratégia Anti-Deadlock
 * 
 * Inicia os mocks das APIs críticas em paralelo para desenvolvimento local
 */

const { spawn } = require('child_process');
const path = require('path');
const chalk = require('chalk');

// Configuração dos mocks
const mocks = [
  {
    name: 'Policy API Mock',
    script: path.join(__dirname, '..', 'src', 'mocks', 'policy-api-mock.js'),
    port: 3001,
    color: 'blue'
  },
  {
    name: 'State API Mock',
    script: path.join(__dirname, '..', 'src', 'mocks', 'state-api-mock.js'),
    port: 3002,
    color: 'green'
  },
  {
    name: 'Schema Registry Mock',
    script: path.join(__dirname, '..', 'src', 'mocks', 'schema-registry-mock.js'),
    port: 3003,
    color: 'yellow'
  }
];

const processes = [];

// Função para iniciar um mock
function startMock(mock) {
  console.log(chalk[mock.color](`🚀 Iniciando ${mock.name} na porta ${mock.port}...`));
  
  const process = spawn('node', [mock.script], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, PORT: mock.port }
  });

  process.stdout.on('data', (data) => {
    console.log(chalk[mock.color](`[${mock.name}] ${data.toString().trim()}`));
  });

  process.stderr.on('data', (data) => {
    console.error(chalk.red(`[${mock.name}] ERROR: ${data.toString().trim()}`));
  });

  process.on('close', (code) => {
    console.log(chalk.red(`[${mock.name}] Processo finalizado com código ${code}`));
  });

  return process;
}

// Função para parar todos os processos
function stopAllMocks() {
  console.log(chalk.red('\n🛑 Parando todos os mocks...'));
  processes.forEach(process => {
    if (process && !process.killed) {
      process.kill('SIGTERM');
    }
  });
  process.exit(0);
}

// Handlers para sinais de interrupção
process.on('SIGINT', stopAllMocks);
process.on('SIGTERM', stopAllMocks);

// Iniciar todos os mocks
console.log(chalk.cyan('🎭 Iniciando todos os mocks HTTP...\n'));

mocks.forEach(mock => {
  const mockProcess = startMock(mock);
  processes.push(mockProcess);
});

// Aguardar um pouco e mostrar status
setTimeout(() => {
  console.log(chalk.cyan('\n📊 Status dos Mocks:'));
  mocks.forEach(mock => {
    console.log(chalk[mock.color](`  ✅ ${mock.name}: http://localhost:${mock.port}`));
  });
  console.log(chalk.gray('\n💡 Pressione Ctrl+C para parar todos os mocks\n'));
}, 2000);

// Manter o processo principal vivo
setInterval(() => {}, 1000);