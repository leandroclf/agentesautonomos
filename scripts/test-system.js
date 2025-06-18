#!/usr/bin/env node

/**
 * Script de teste do sistema
 * Executa testes de integração e validação da configuração
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

class SystemTester {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async run() {
        console.log('🧪 Iniciando testes do sistema...');
        console.log('=' .repeat(50));

        try {
            await this.testFileStructure();
            await this.testConfiguration();
            await this.testDependencies();
            await this.testAgentEndpoints();
            await this.testSQSQueues();
            await this.testMonitoring();
            await this.testIntegration();

            this.printResults();

        } catch (error) {
            console.error('❌ Erro durante os testes:', error.message);
            process.exit(1);
        }
    }

    async testFileStructure() {
        console.log('\n📁 Testando estrutura de arquivos...');

        const requiredFiles = [
            'package.json',
            '.env.example',
            'docker-compose.yml',
            'src/agents/core/interface-agent/index.js',
            'src/agents/core/event-agent/index.js',
            'src/agents/core/planning-agent/index.js',
            'src/agents/core/execution-agent/index.js',
            'src/agents/shared/utils/coordination.js',
            'config/elasticmq.conf',
            'config/prometheus.yml',
            'scripts/start-all.js',
            'scripts/dev-setup.js'
        ];

        const requiredDirectories = [
            'src/agents/core',
            'src/agents/shared',
            'config',
            'scripts',
            'docker'
        ];

        // Testar arquivos
        for (const file of requiredFiles) {
            const filePath = path.join(this.projectRoot, file);
            this.test(`Arquivo existe: ${file}`, () => {
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Arquivo não encontrado: ${file}`);
                }
            });
        }

        // Testar diretórios
        for (const dir of requiredDirectories) {
            const dirPath = path.join(this.projectRoot, dir);
            this.test(`Diretório existe: ${dir}`, () => {
                if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                    throw new Error(`Diretório não encontrado: ${dir}`);
                }
            });
        }
    }

    async testConfiguration() {
        console.log('\n⚙️  Testando configuração...');

        // Testar package.json
        this.test('package.json válido', () => {
            const packagePath = path.join(this.projectRoot, 'package.json');
            const packageContent = fs.readFileSync(packagePath, 'utf8');
            const packageJson = JSON.parse(packageContent);
            
            if (!packageJson.name || !packageJson.version) {
                throw new Error('package.json inválido');
            }
        });

        // Testar .env.example
        this.test('.env.example contém variáveis essenciais', () => {
            const envExamplePath = path.join(this.projectRoot, '.env.example');
            const envContent = fs.readFileSync(envExamplePath, 'utf8');
            
            const requiredVars = [
                'NODE_ENV',
                'AWS_REGION',
                'SQS_ENDPOINT',
                'INTERFACE_AGENT_PORT',
                'EVENT_AGENT_PORT',
                'PLANNING_AGENT_PORT',
                'EXECUTION_AGENT_PORT'
            ];

            for (const varName of requiredVars) {
                if (!envContent.includes(varName)) {
                    throw new Error(`Variável ${varName} não encontrada em .env.example`);
                }
            }
        });

        // Testar docker-compose.yml
        this.test('docker-compose.yml válido', () => {
            const composePath = path.join(this.projectRoot, 'docker-compose.yml');
            const composeContent = fs.readFileSync(composePath, 'utf8');
            
            const requiredServices = [
                'elasticmq',
                'interface-agent',
                'event-agent',
                'planning-agent',
                'execution-agent',
                'prometheus',
                'grafana'
            ];

            for (const service of requiredServices) {
                if (!composeContent.includes(service)) {
                    throw new Error(`Serviço ${service} não encontrado em docker-compose.yml`);
                }
            }
        });
    }

    async testDependencies() {
        console.log('\n📦 Testando dependências...');

        this.test('node_modules existe', () => {
            const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
            if (!fs.existsSync(nodeModulesPath)) {
                throw new Error('node_modules não encontrado. Execute: npm install');
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
            { name: 'Interface Agent', port: 3000 },
            { name: 'Event Agent', port: 3001 },
            { name: 'Planning Agent', port: 3002 },
            { name: 'Execution Agent', port: 3003 }
        ];

        for (const agent of agents) {
            await this.testAsync(`${agent.name} - Health Check`, async () => {
                try {
                    const response = await axios.get(`http://localhost:${agent.port}/health`, {
                        timeout: 5000
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

            await this.testAsync(`${agent.name} - Metrics`, async () => {
                try {
                    const response = await axios.get(`http://localhost:${agent.port}/metrics`, {
                        timeout: 5000
                    });
                    
                    if (response.status !== 200) {
                        throw new Error(`Metrics não disponíveis: ${response.status}`);
                    }
                } catch (error) {
                    if (error.code === 'ECONNREFUSED') {
                        throw new Error(`${agent.name} não está rodando`);
                    }
                    throw error;
                }
            });
        }
    }

    async testSQSQueues() {
        console.log('\n📬 Testando filas SQS...');

        await this.testAsync('SQS Local acessível', async () => {
            try {
                const response = await axios.get('http://localhost:9324', {
                    timeout: 5000
                });
                
                if (response.status !== 200) {
                    throw new Error(`SQS Local não acessível: ${response.status}`);
                }
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('SQS Local não está rodando na porta 9324');
                }
                throw error;
            }
        });

        await this.testAsync('Filas SQS configuradas', async () => {
            try {
                const response = await axios.get('http://localhost:9324/queue', {
                    timeout: 5000
                });
                
                const expectedQueues = [
                    'interface-events',
                    'event-processing',
                    'planning-requests',
                    'execution-requests',
                    'notifications',
                    'status-updates'
                ];

                const responseText = response.data;
                for (const queue of expectedQueues) {
                    if (!responseText.includes(queue)) {
                        throw new Error(`Fila ${queue} não encontrada`);
                    }
                }
            } catch (error) {
                throw new Error(`Erro ao verificar filas: ${error.message}`);
            }
        });
    }

    async testMonitoring() {
        console.log('\n📊 Testando monitoramento...');

        await this.testAsync('Prometheus acessível', async () => {
            try {
                const response = await axios.get('http://localhost:9090', {
                    timeout: 5000
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
                const response = await axios.get('http://localhost:3100', {
                    timeout: 5000
                });
                
                if (response.status !== 200) {
                    throw new Error(`Grafana não acessível: ${response.status}`);
                }
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('Grafana não está rodando na porta 3100');
                }
                throw error;
            }
        });
    }

    async testIntegration() {
        console.log('\n🔗 Testando integração...');

        await this.testAsync('Comunicação entre agentes', async () => {
            try {
                // Testar se o Interface Agent consegue se comunicar com outros agentes
                const response = await axios.post('http://localhost:3000/api/test-integration', {
                    test: true
                }, {
                    timeout: 10000
                });
                
                if (response.status !== 200) {
                    throw new Error(`Teste de integração falhou: ${response.status}`);
                }
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    console.log('   ⚠️  Endpoint de teste não implementado (opcional)');
                    return;
                }
                throw error;
            }
        });
    }

    test(name, testFn) {
        try {
            testFn();
            console.log(`   ✅ ${name}`);
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASSED' });
        } catch (error) {
            console.log(`   ❌ ${name}: ${error.message}`);
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAILED', error: error.message });
        }
    }

    async testAsync(name, testFn) {
        try {
            await testFn();
            console.log(`   ✅ ${name}`);
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASSED' });
        } catch (error) {
            console.log(`   ❌ ${name}: ${error.message}`);
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAILED', error: error.message });
        }
    }

    printResults() {
        console.log('\n' + '=' .repeat(50));
        console.log('📋 RESULTADOS DOS TESTES');
        console.log('=' .repeat(50));
        
        console.log(`\n✅ Testes aprovados: ${this.results.passed}`);
        console.log(`❌ Testes falharam: ${this.results.failed}`);
        console.log(`📊 Total de testes: ${this.results.tests.length}`);
        
        const successRate = (this.results.passed / this.results.tests.length * 100).toFixed(1);
        console.log(`📈 Taxa de sucesso: ${successRate}%`);

        if (this.results.failed > 0) {
            console.log('\n❌ TESTES FALHARAM:');
            this.results.tests
                .filter(test => test.status === 'FAILED')
                .forEach(test => {
                    console.log(`   • ${test.name}: ${test.error}`);
                });
        }

        console.log('\n' + '=' .repeat(50));
        
        if (this.results.failed === 0) {
            console.log('🎉 Todos os testes passaram! Sistema está funcionando corretamente.');
        } else {
            console.log('⚠️  Alguns testes falharam. Verifique a configuração e tente novamente.');
            process.exit(1);
        }
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const tester = new SystemTester();
    tester.run().catch(error => {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = SystemTester;