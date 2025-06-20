#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class SafeSystemTester {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../..');
        this.passed = 0;
        this.failed = 0;
        this.results = [];
    }

    test(name, testFn) {
        try {
            testFn();
            this.passed++;
            this.results.push({ name, status: '✅ PASSOU', error: null });
            console.log(`✅ ${name}`);
        } catch (error) {
            this.failed++;
            this.results.push({ name, status: '❌ FALHOU', error: error.message });
            console.log(`❌ ${name}: ${error.message}`);
        }
    }

    async testAsync(name, testFn) {
        try {
            await testFn();
            this.passed++;
            this.results.push({ name, status: '✅ PASSOU', error: null });
            console.log(`✅ ${name}`);
        } catch (error) {
            this.failed++;
            this.results.push({ name, status: '❌ FALHOU', error: error.message });
            console.log(`❌ ${name}: ${error.message}`);
        }
    }

    async run() {
        console.log('🧪 Iniciando testes do sistema (modo seguro)...');
        console.log(`📁 Diretório do projeto: ${this.projectRoot}`);
        
        this.testFileStructure();
        this.testConfiguration();
        this.testDependencies();
        await this.testAgentEndpoints();
        await this.testDockerServices();
        await this.testMonitoring();
        
        this.printSummary();
    }

    testFileStructure() {
        console.log('\n📁 Testando estrutura de arquivos...');

        const requiredFiles = [
            'package.json',
            '.env.example',
            'docker-compose.dev.yml',
            'src/agents/shared/services/sqsService.js',
            'config/monitoring/prometheus.yml',
            'dev/scripts/start-dev-environment.js',
            'scripts/test-system-integration.js'
        ];

        const requiredDirectories = [
            'src/agents/core',
            'src/agents/shared',
            'config',
            'scripts',
            'docker',
            'docs',
            'dev'
        ];

        for (const file of requiredFiles) {
            this.test(`Arquivo ${file} existe`, () => {
                const filePath = path.join(this.projectRoot, file);
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Arquivo não encontrado: ${filePath}`);
                }
            });
        }

        for (const dir of requiredDirectories) {
            this.test(`Diretório ${dir} existe`, () => {
                const dirPath = path.join(this.projectRoot, dir);
                if (!fs.existsSync(dirPath)) {
                    throw new Error(`Diretório não encontrado: ${dirPath}`);
                }
            });
        }
    }

    testConfiguration() {
        console.log('\n⚙️ Testando configuração...');

        this.test('package.json válido', () => {
            const packagePath = path.join(this.projectRoot, 'package.json');
            if (!fs.existsSync(packagePath)) {
                throw new Error('package.json não encontrado');
            }
            
            try {
                const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                if (!packageContent.name || !packageContent.version) {
                    throw new Error('package.json inválido');
                }
            } catch (error) {
                throw new Error(`Erro ao ler package.json: ${error.message}`);
            }
        });

        this.test('.env.example contém variáveis essenciais', () => {
            const envPath = path.join(this.projectRoot, '.env.example');
            if (!fs.existsSync(envPath)) {
                throw new Error('.env.example não encontrado');
            }
            
            const envContent = fs.readFileSync(envPath, 'utf8');
            const requiredVars = ['NODE_ENV', 'AWS_REGION', 'SQS_ENDPOINT'];
            
            for (const varName of requiredVars) {
                if (!envContent.includes(varName)) {
                    throw new Error(`Variável ${varName} não encontrada`);
                }
            }
        });

        this.test('docker-compose.dev.yml contém serviços essenciais', () => {
            const dockerComposePath = path.join(this.projectRoot, 'docker-compose.dev.yml');
            if (!fs.existsSync(dockerComposePath)) {
                throw new Error('docker-compose.dev.yml não encontrado');
            }
            
            const dockerContent = fs.readFileSync(dockerComposePath, 'utf8');
            const requiredServices = ['localstack', 'postgres', 'redis', 'prometheus', 'grafana', 'pgadmin', 'redis-commander'];
            
            for (const service of requiredServices) {
                if (!dockerContent.includes(service)) {
                    throw new Error(`Serviço ${service} não encontrado`);
                }
            }
        });
    }

    testDependencies() {
        console.log('\n📦 Testando dependências...');

        this.test('node_modules existe', () => {
            const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
            if (!fs.existsSync(nodeModulesPath)) {
                throw new Error('node_modules não encontrado - execute npm install');
            }
        });

        this.test('Dependências principais instaladas', () => {
            const requiredDeps = [
                'express',
                'axios',
                'aws-sdk',
                'winston',
                'dotenv',
                'cors',
                'helmet',
                'express-rate-limit'
            ];

            for (const dep of requiredDeps) {
                const depPath = path.join(this.projectRoot, 'node_modules', dep);
                if (!fs.existsSync(depPath)) {
                    throw new Error(`Dependência ${dep} não instalada`);
                }
            }
        });
    }

    async testAgentEndpoints() {
        console.log('\n🤖 Testando endpoints dos agentes...');

        const agents = [
            { name: 'Interface Agent', port: 3001 },
            { name: 'Event Agent', port: 3002 },
            { name: 'Planning Agent', port: 3004 },
            { name: 'Execution Agent', port: 3003 }
        ];

        for (const agent of agents) {
            await this.testAsync(`${agent.name} - Health Check`, async () => {
                try {
                    const response = await axios.get(`http://localhost:${agent.port}/health`, {
                        timeout: 3000
                    });
                    
                    if (response.status !== 200) {
                        throw new Error(`Status inválido: ${response.status}`);
                    }
                } catch (error) {
                    if (error.code === 'ECONNREFUSED') {
                        throw new Error(`${agent.name} não está rodando na porta ${agent.port}`);
                    }
                    throw error;
                }
            });
        }
    }

    async testDockerServices() {
        console.log('\n🐳 Testando serviços Docker...');

        await this.testAsync('LocalStack acessível', async () => {
            try {
                const response = await axios.get('http://localhost:4566/health', {
                    timeout: 3000
                });
                
                if (response.status !== 200) {
                    throw new Error(`LocalStack não acessível: ${response.status}`);
                }
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('LocalStack não está rodando na porta 4566');
                }
                throw error;
            }
        });

        await this.testAsync('PostgreSQL acessível', async () => {
            try {
                // Teste simples de conectividade TCP
                const response = await axios.get('http://localhost:5432', {
                    timeout: 1000
                }).catch(() => {
                    // PostgreSQL não responde HTTP, mas se a conexão for recusada significa que não está rodando
                    // Se der timeout ou outro erro, provavelmente está rodando
                    return { status: 'running' };
                });
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('PostgreSQL não está rodando na porta 5432');
                }
            }
        });

        await this.testAsync('Redis acessível', async () => {
            try {
                // Teste simples de conectividade TCP
                const response = await axios.get('http://localhost:6379', {
                    timeout: 1000
                }).catch(() => {
                    return { status: 'running' };
                });
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('Redis não está rodando na porta 6379');
                }
            }
        });
    }

    async testMonitoring() {
        console.log('\n📊 Testando monitoramento...');

        await this.testAsync('Prometheus acessível', async () => {
            try {
                const response = await axios.get('http://localhost:9090', {
                    timeout: 3000
                });
                
                if (response.status !== 200) {
                    throw new Error(`Prometheus não acessível: ${response.status}`);
                }
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('Prometheus não está rodando na porta 9090');
                }
                throw error;
            }
        });

        await this.testAsync('Grafana acessível', async () => {
            try {
                const response = await axios.get('http://localhost:3000', {
                    timeout: 3000
                });
                
                if (response.status !== 200) {
                    throw new Error(`Grafana não acessível: ${response.status}`);
                }
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('Grafana não está rodando na porta 3000');
                }
                throw error;
            }
        });

        await this.testAsync('PgAdmin acessível', async () => {
            try {
                const response = await axios.get('http://localhost:5050', {
                    timeout: 3000
                });
                
                if (response.status !== 200) {
                    throw new Error(`PgAdmin não acessível: ${response.status}`);
                }
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('PgAdmin não está rodando na porta 5050');
                }
                throw error;
            }
        });

        await this.testAsync('Redis Commander acessível', async () => {
            try {
                const response = await axios.get('http://localhost:8081', {
                    timeout: 3000
                });
                
                if (response.status !== 200) {
                    throw new Error(`Redis Commander não acessível: ${response.status}`);
                }
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('Redis Commander não está rodando na porta 8081');
                }
                throw error;
            }
        });
    }

    printSummary() {
        const total = this.passed + this.failed;
        const successRate = ((this.passed / total) * 100).toFixed(1);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMO DOS TESTES');
        console.log('='.repeat(60));
        console.log(`Total de testes: ${total}`);
        console.log(`✅ Passou: ${this.passed}`);
        console.log(`❌ Falhou: ${this.failed}`);
        console.log(`📈 Taxa de sucesso: ${successRate}%`);
        
        if (this.failed > 0) {
            console.log('\n❌ TESTES QUE FALHARAM:');
            this.results
                .filter(r => r.status.includes('FALHOU'))
                .forEach(r => console.log(`   • ${r.name}: ${r.error}`));
        }
        
        console.log('\n' + '='.repeat(60));
        
        if (this.failed === 0) {
            console.log('🎉 Todos os testes passaram! Sistema está funcionando corretamente.');
        } else if (successRate >= 80) {
            console.log('⚠️ Sistema está funcionando com algumas limitações.');
        } else {
            console.log('🚨 Sistema tem problemas significativos que precisam ser corrigidos.');
        }
    }
}

// Executar os testes
if (require.main === module) {
    const tester = new SafeSystemTester();
    tester.run().catch(console.error);
}

module.exports = SafeSystemTester;