#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

class DevEnvironmentStarter {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../..');
        this.processes = new Map();
        this.isShuttingDown = false;
        this.dockerServices = [
            'localstack',
            'postgres', 
            'redis',
            'pgadmin',
            'redis-commander',
            'prometheus',
            'grafana'
        ];
        
        // Lista de agentes para iniciar
        this.agents = [
            // Core Agents
            { name: 'interface-agent', path: './src/agents/core/interface-agent', port: 3002, env: { AGENT_TYPE: 'interface' } },
            { name: 'event-agent', path: './src/agents/core/event-agent', port: 3003, env: { AGENT_TYPE: 'event' } },
            { name: 'planning-agent', path: './src/agents/core/planning-agent', port: 3004, env: { AGENT_TYPE: 'planning' } },
            { name: 'execution-agent', path: './src/agents/core/execution-agent', port: 3005, env: { AGENT_TYPE: 'execution' } },
            { name: 'monitoring-agent', path: './src/agents/auxiliary/monitoring-agent', port: 3006, env: { AGENT_TYPE: 'monitoring' } },
            
            // MARL Agents
            { name: 'coordination-agent', path: './src/agents/marl/coordination-agent', port: 3008, env: { AGENT_TYPE: 'coordination' } },
            { name: 'security-agent', path: './src/agents/auxiliary/security-agent', port: 3010, env: { AGENT_TYPE: 'security' } },
            
            // External Gateway
            { name: 'external-gateway', path: './src/agents/infrastructure/external-gateway', port: 3001, env: { GATEWAY_TYPE: 'external' } }
        ];
    }

    async checkPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.listen(port, () => {
                server.once('close', () => resolve(true));
                server.close();
            });
            server.on('error', () => resolve(false));
        });
    }

    async waitForService(host, port, timeout = 30000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            try {
                const available = await this.checkPortAvailable(port);
                if (!available) {
                    console.log(`✅ Serviço em ${host}:${port} está disponível`);
                    return true;
                }
            } catch (error) {
                // Continua tentando
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new Error(`Timeout aguardando serviço em ${host}:${port}`);
    }

    async checkDockerInstalled() {
        return new Promise((resolve) => {
            exec('docker --version', (error) => {
                resolve(!error);
            });
        });
    }

    async checkDockerCompose() {
        return new Promise((resolve) => {
            exec('docker-compose --version', (error) => {
                if (error) {
                    // Tenta docker compose (novo formato)
                    exec('docker compose version', (error2) => {
                        resolve(!error2);
                    });
                } else {
                    resolve(true);
                }
            });
        });
    }

    async startDockerServices() {
        console.log('🐳 Iniciando serviços Docker...');
        
        const dockerInstalled = await this.checkDockerInstalled();
        if (!dockerInstalled) {
            throw new Error('Docker não está instalado ou não está disponível no PATH');
        }

        const composeAvailable = await this.checkDockerCompose();
        if (!composeAvailable) {
            throw new Error('Docker Compose não está disponível');
        }

        const composeFile = path.join(this.projectRoot, 'docker-compose.dev.yml');
        if (!fs.existsSync(composeFile)) {
            throw new Error(`Arquivo docker-compose.dev.yml não encontrado em ${composeFile}`);
        }

        return new Promise((resolve, reject) => {
            const dockerProcess = spawn('docker-compose', ['-f', composeFile, 'up', '-d'], {
                cwd: this.projectRoot,
                stdio: 'pipe'
            });

            let output = '';
            dockerProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log(`Docker: ${data.toString().trim()}`);
            });

            dockerProcess.stderr.on('data', (data) => {
                output += data.toString();
                console.log(`Docker Error: ${data.toString().trim()}`);
            });

            dockerProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Serviços Docker iniciados com sucesso');
                    resolve();
                } else {
                    reject(new Error(`Docker Compose falhou com código ${code}\n${output}`));
                }
            });
        });
    }

    async waitForDockerServices() {
        console.log('⏳ Aguardando serviços Docker ficarem prontos...');
        
        const services = [
            { name: 'Redis', host: 'localhost', port: 6379 },
            { name: 'PostgreSQL', host: 'localhost', port: 5432 },
            { name: 'LocalStack', host: 'localhost', port: 4566 }
        ];

        for (const service of services) {
            try {
                await this.waitForService(service.host, service.port);
                console.log(`✅ ${service.name} está pronto`);
            } catch (error) {
                console.warn(`⚠️  ${service.name} não está disponível: ${error.message}`);
            }
        }
    }

    async validateAgentFile(agentPath) {
        const fullPath = path.resolve(this.projectRoot, agentPath);
        const indexFile = path.join(fullPath, 'index.js');
        const packageFile = path.join(fullPath, 'package.json');
        
        if (!fs.existsSync(indexFile)) {
            throw new Error(`Arquivo index.js não encontrado em ${indexFile}`);
        }
        
        if (!fs.existsSync(packageFile)) {
            console.warn(`⚠️  package.json não encontrado em ${packageFile}`);
        }
        
        return true;
    }

    async startAgent(agent) {
        try {
            await this.validateAgentFile(agent.path);
            
            const portAvailable = await this.checkPortAvailable(agent.port);
            if (!portAvailable) {
                console.warn(`⚠️  Porta ${agent.port} já está em uso para ${agent.name}`);
                return null;
            }

            const agentPath = path.resolve(this.projectRoot, agent.path);
            const env = {
                ...process.env,
                PORT: agent.port.toString(),
                NODE_ENV: 'development',
                ...agent.env
            };

            // Carrega variáveis de ambiente do arquivo .env.development.local
            const envFile = path.join(this.projectRoot, '.env.development.local');
            if (fs.existsSync(envFile)) {
                const envContent = fs.readFileSync(envFile, 'utf8');
                envContent.split('\n').forEach(line => {
                    const [key, value] = line.split('=');
                    if (key && value && !key.startsWith('#')) {
                        env[key.trim()] = value.trim();
                    }
                });
            }

            console.log(`🚀 Iniciando ${agent.name} na porta ${agent.port}...`);
            
            const agentProcess = spawn('node', ['index.js'], {
                cwd: agentPath,
                env,
                stdio: 'pipe'
            });

            agentProcess.stdout.on('data', (data) => {
                console.log(`[${agent.name}] ${data.toString().trim()}`);
            });

            agentProcess.stderr.on('data', (data) => {
                console.error(`[${agent.name}] ERROR: ${data.toString().trim()}`);
            });

            agentProcess.on('close', (code) => {
                if (!this.isShuttingDown) {
                    console.log(`❌ ${agent.name} encerrado com código ${code}`);
                    this.processes.delete(agent.name);
                }
            });

            this.processes.set(agent.name, agentProcess);
            
            // Aguarda um pouco para o agente inicializar
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log(`✅ ${agent.name} iniciado com sucesso`);
            return agentProcess;
            
        } catch (error) {
            console.error(`❌ Erro ao iniciar ${agent.name}: ${error.message}`);
            return null;
        }
    }

    async startAllAgents() {
        console.log('🚀 Iniciando todos os agentes...');
        
        const results = [];
        for (const agent of this.agents) {
            const process = await this.startAgent(agent);
            results.push({ agent: agent.name, success: process !== null });
        }
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        console.log(`\n📊 Resumo da inicialização:`);
        console.log(`✅ Agentes iniciados com sucesso: ${successful.length}`);
        if (successful.length > 0) {
            successful.forEach(r => console.log(`   - ${r.agent}`));
        }
        
        if (failed.length > 0) {
            console.log(`❌ Agentes que falharam: ${failed.length}`);
            failed.forEach(r => console.log(`   - ${r.agent}`));
        }
        
        console.log(`\n🌐 URLs disponíveis:`);
        this.agents.forEach(agent => {
            if (this.processes.has(agent.name)) {
                console.log(`   - ${agent.name}: http://localhost:${agent.port}`);
            }
        });
        
        console.log(`\n🔧 Ferramentas de administração:`);
        console.log(`   - PgAdmin: http://localhost:8080 (admin@agentes.local / admin123)`);
        console.log(`   - Redis Commander: http://localhost:8081`);
        console.log(`   - Grafana: http://localhost:3000 (admin / admin123)`);
        console.log(`   - Prometheus: http://localhost:9090`);
    }

    async shutdown() {
        if (this.isShuttingDown) return;
        
        this.isShuttingDown = true;
        console.log('\n🛑 Encerrando ambiente de desenvolvimento...');
        
        // Encerra agentes
        for (const [name, process] of this.processes) {
            console.log(`🛑 Encerrando ${name}...`);
            process.kill('SIGTERM');
        }
        
        // Aguarda um pouco para encerramento gracioso
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Força encerramento se necessário
        for (const [name, process] of this.processes) {
            if (!process.killed) {
                console.log(`🔪 Forçando encerramento de ${name}...`);
                process.kill('SIGKILL');
            }
        }
        
        // Para serviços Docker
        console.log('🐳 Parando serviços Docker...');
        const composeFile = path.join(this.projectRoot, 'docker-compose.dev.yml');
        if (fs.existsSync(composeFile)) {
            exec(`docker-compose -f ${composeFile} down`, (error) => {
                if (error) {
                    console.error('Erro ao parar serviços Docker:', error.message);
                } else {
                    console.log('✅ Serviços Docker parados');
                }
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    }

    setupSignalHandlers() {
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', (error) => {
            console.error('Exceção não capturada:', error);
            this.shutdown();
        });
        process.on('unhandledRejection', (reason) => {
            console.error('Promise rejeitada não tratada:', reason);
            this.shutdown();
        });
    }

    async run() {
        try {
            console.log('🚀 Iniciando ambiente de desenvolvimento dos Agentes Autônomos...');
            
            this.setupSignalHandlers();
            
            // Inicia serviços Docker
            await this.startDockerServices();
            
            // Aguarda serviços ficarem prontos
            await this.waitForDockerServices();
            
            // Inicia agentes
            await this.startAllAgents();
            
            console.log('\n✅ Ambiente de desenvolvimento iniciado com sucesso!');
            console.log('\n💡 Pressione Ctrl+C para encerrar todos os serviços\n');
            
        } catch (error) {
            console.error('❌ Erro ao iniciar ambiente:', error.message);
            await this.shutdown();
            process.exit(1);
        }
    }
}

// Executa se chamado diretamente
if (require.main === module) {
    const starter = new DevEnvironmentStarter();
    starter.run();
}

module.exports = DevEnvironmentStarter;