#!/usr/bin/env node

/**
 * Script de configuração para desenvolvimento local
 * Configura o ambiente, verifica dependências e inicia os serviços necessários
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');

class DevSetup {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.envFile = path.join(this.projectRoot, '.env');
        this.envExampleFile = path.join(this.projectRoot, '.env.example');
        this.packageJsonFile = path.join(this.projectRoot, 'package.json');
        
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async run() {
        try {
            console.log('🚀 Configurando ambiente de desenvolvimento...');
            console.log('=' .repeat(50));

            await this.checkPrerequisites();
            await this.setupEnvironment();
            await this.installDependencies();
            await this.createDirectories();
            await this.checkDockerServices();
            await this.startServices();

            console.log('\n✅ Configuração concluída com sucesso!');
            console.log('\n📋 Próximos passos:');
            console.log('   1. Execute: docker-compose up -d');
            console.log('   2. Execute: node scripts/start-all.js');
            console.log('   3. Acesse: http://localhost:3000');
            console.log('\n📊 Monitoramento:');
            console.log('   - Prometheus: http://localhost:9090');
            console.log('   - Grafana: http://localhost:3100 (admin/admin)');
            console.log('   - SQS Local: http://localhost:9324');

        } catch (error) {
            console.error('❌ Erro durante a configuração:', error.message);
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    async checkPrerequisites() {
        console.log('\n🔍 Verificando pré-requisitos...');

        // Verificar Node.js
        try {
            const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
            const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);
            
            if (majorVersion < 18) {
                throw new Error(`Node.js 18+ é necessário. Versão atual: ${nodeVersion}`);
            }
            console.log(`   ✅ Node.js ${nodeVersion}`);
        } catch (error) {
            throw new Error('Node.js não encontrado. Instale Node.js 18+');
        }

        // Verificar npm
        try {
            const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
            console.log(`   ✅ npm ${npmVersion}`);
        } catch (error) {
            throw new Error('npm não encontrado');
        }

        // Verificar Docker
        try {
            const dockerVersion = execSync('docker --version', { encoding: 'utf8' }).trim();
            console.log(`   ✅ ${dockerVersion}`);
        } catch (error) {
            console.log('   ⚠️  Docker não encontrado (opcional para desenvolvimento)');
        }

        // Verificar Docker Compose
        try {
            const composeVersion = execSync('docker-compose --version', { encoding: 'utf8' }).trim();
            console.log(`   ✅ ${composeVersion}`);
        } catch (error) {
            console.log('   ⚠️  Docker Compose não encontrado (opcional para desenvolvimento)');
        }
    }

    async setupEnvironment() {
        console.log('\n⚙️  Configurando variáveis de ambiente...');

        if (!fs.existsSync(this.envFile)) {
            if (fs.existsSync(this.envExampleFile)) {
                fs.copyFileSync(this.envExampleFile, this.envFile);
                console.log('   ✅ Arquivo .env criado a partir do .env.example');
            } else {
                throw new Error('Arquivo .env.example não encontrado');
            }
        } else {
            console.log('   ✅ Arquivo .env já existe');
        }

        // Verificar se as variáveis essenciais estão definidas
        const envContent = fs.readFileSync(this.envFile, 'utf8');
        const requiredVars = [
            'NODE_ENV',
            'AWS_REGION',
            'SQS_ENDPOINT'
        ];

        const missingVars = requiredVars.filter(varName => {
            const regex = new RegExp(`^${varName}=.+`, 'm');
            return !regex.test(envContent);
        });

        if (missingVars.length > 0) {
            console.log(`   ⚠️  Variáveis não configuradas: ${missingVars.join(', ')}`);
            console.log('   📝 Edite o arquivo .env antes de continuar');
        } else {
            console.log('   ✅ Variáveis essenciais configuradas');
        }
    }

    async installDependencies() {
        console.log('\n📦 Verificando dependências...');

        if (!fs.existsSync(path.join(this.projectRoot, 'node_modules'))) {
            console.log('   📥 Instalando dependências...');
            execSync('npm install', { 
                cwd: this.projectRoot, 
                stdio: 'inherit' 
            });
            console.log('   ✅ Dependências instaladas');
        } else {
            console.log('   ✅ Dependências já instaladas');
            
            // Verificar se package.json foi modificado
            const packageStats = fs.statSync(this.packageJsonFile);
            const nodeModulesStats = fs.statSync(path.join(this.projectRoot, 'node_modules'));
            
            if (packageStats.mtime > nodeModulesStats.mtime) {
                console.log('   🔄 package.json foi modificado, atualizando dependências...');
                execSync('npm install', { 
                    cwd: this.projectRoot, 
                    stdio: 'inherit' 
                });
                console.log('   ✅ Dependências atualizadas');
            }
        }
    }

    async createDirectories() {
        console.log('\n📁 Criando diretórios necessários...');

        const directories = [
            'logs',
            'data',
            'temp',
            'config/grafana/provisioning/datasources',
            'config/grafana/provisioning/dashboards',
            'config/grafana/dashboards'
        ];

        directories.forEach(dir => {
            const fullPath = path.join(this.projectRoot, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(`   ✅ Criado: ${dir}`);
            } else {
                console.log(`   ✅ Existe: ${dir}`);
            }
        });
    }

    async checkDockerServices() {
        console.log('\n🐳 Verificando serviços Docker...');

        try {
            // Verificar se Docker está rodando
            execSync('docker info', { stdio: 'ignore' });
            console.log('   ✅ Docker está rodando');

            // Verificar se há containers rodando
            const containers = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
            const runningContainers = containers.trim().split('\n').filter(name => name);
            
            if (runningContainers.length > 0) {
                console.log(`   📋 Containers rodando: ${runningContainers.join(', ')}`);
            } else {
                console.log('   📋 Nenhum container rodando');
            }

        } catch (error) {
            console.log('   ⚠️  Docker não está rodando ou não está acessível');
        }
    }

    async startServices() {
        console.log('\n🎯 Opções de inicialização:');
        console.log('   1. Iniciar com Docker Compose (recomendado)');
        console.log('   2. Iniciar apenas os agentes localmente');
        console.log('   3. Pular inicialização');

        const choice = await this.askQuestion('\nEscolha uma opção (1-3): ');

        switch (choice.trim()) {
            case '1':
                await this.startWithDocker();
                break;
            case '2':
                await this.startAgentsLocally();
                break;
            case '3':
                console.log('   ⏭️  Inicialização pulada');
                break;
            default:
                console.log('   ⚠️  Opção inválida, pulando inicialização');
        }
    }

    async startWithDocker() {
        console.log('\n🐳 Iniciando com Docker Compose...');
        
        try {
            // Verificar se docker-compose.yml existe
            const composeFile = path.join(this.projectRoot, 'docker-compose.yml');
            if (!fs.existsSync(composeFile)) {
                throw new Error('docker-compose.yml não encontrado');
            }

            console.log('   🔄 Iniciando serviços...');
            execSync('docker-compose up -d', { 
                cwd: this.projectRoot, 
                stdio: 'inherit' 
            });
            
            console.log('   ✅ Serviços iniciados com Docker Compose');
            
            // Aguardar um pouco para os serviços iniciarem
            console.log('   ⏳ Aguardando serviços iniciarem...');
            await this.sleep(5000);
            
            await this.checkServicesHealth();
            
        } catch (error) {
            console.log(`   ❌ Erro ao iniciar com Docker: ${error.message}`);
        }
    }

    async startAgentsLocally() {
        console.log('\n🏠 Iniciando agentes localmente...');
        
        try {
            const startScript = path.join(this.projectRoot, 'scripts', 'start-all.js');
            if (!fs.existsSync(startScript)) {
                throw new Error('Script start-all.js não encontrado');
            }

            console.log('   🔄 Iniciando agentes...');
            const child = spawn('node', [startScript], {
                cwd: this.projectRoot,
                stdio: 'inherit',
                detached: true
            });

            child.unref();
            console.log('   ✅ Agentes iniciados em background');
            
        } catch (error) {
            console.log(`   ❌ Erro ao iniciar agentes: ${error.message}`);
        }
    }

    async checkServicesHealth() {
        console.log('\n🏥 Verificando saúde dos serviços...');
        
        const services = [
            { name: 'Interface Agent', url: 'http://localhost:3000/health' },
            { name: 'Event Agent', url: 'http://localhost:3001/health' },
            { name: 'Planning Agent', url: 'http://localhost:3002/health' },
            { name: 'Execution Agent', url: 'http://localhost:3003/health' },
            { name: 'SQS Local', url: 'http://localhost:9324' },
            { name: 'Prometheus', url: 'http://localhost:9090' },
            { name: 'Grafana', url: 'http://localhost:3100' }
        ];

        for (const service of services) {
            try {
                const response = await fetch(service.url);
                if (response.ok) {
                    console.log(`   ✅ ${service.name}`);
                } else {
                    console.log(`   ⚠️  ${service.name} (status: ${response.status})`);
                }
            } catch (error) {
                console.log(`   ❌ ${service.name} (não acessível)`);
            }
        }
    }

    askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const setup = new DevSetup();
    setup.run().catch(error => {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = DevSetup;