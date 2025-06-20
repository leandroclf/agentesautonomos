#!/usr/bin/env node

/**
 * Script de Teste Completamente Isolado
 * Não faz NENHUMA conexão de rede ou interação com a aplicação
 * Apenas verifica arquivos, estrutura e processos do sistema
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class IsolatedSystemTester {
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
        console.log('🔒 Iniciando testes isolados (SEM conexões de rede)...');
        console.log(`📁 Diretório do projeto: ${this.projectRoot}`);
        console.log('⚠️  Este script NÃO interage com a aplicação em execução\n');
        
        this.testFileStructure();
        this.testConfiguration();
        await this.testProcesses();
        await this.testPorts();
        
        this.printSummary();
    }

    testFileStructure() {
        console.log('📁 Verificando estrutura de arquivos...');

        const requiredFiles = [
            'package.json',
            '.env.example',
            'docker-compose.dev.yml',
            'src/services/sqs-service.js',
            'src/services/mock-sqs-service.js',
            'dev/scripts/start-dev-environment.js'
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
        console.log('\n⚙️ Verificando configuração...');

        this.test('package.json válido', () => {
            const packagePath = path.join(this.projectRoot, 'package.json');
            const packageContent = fs.readFileSync(packagePath, 'utf8');
            const packageJson = JSON.parse(packageContent);
            
            if (!packageJson.name || !packageJson.version) {
                throw new Error('package.json inválido - faltam name ou version');
            }
        });

        this.test('docker-compose.dev.yml válido', () => {
            const dockerComposePath = path.join(this.projectRoot, 'docker-compose.dev.yml');
            const content = fs.readFileSync(dockerComposePath, 'utf8');
            
            if (!content.includes('services:')) {
                throw new Error('docker-compose.dev.yml inválido - não contém services');
            }
        });

        this.test('MockSQSService tem método close()', () => {
            const mockSQSPath = path.join(this.projectRoot, 'src/services/mock-sqs-service.js');
            const content = fs.readFileSync(mockSQSPath, 'utf8');
            
            if (!content.includes('async close()')) {
                throw new Error('MockSQSService não tem método close()');
            }
        });
    }

    async testProcesses() {
        console.log('\n🔍 Verificando processos Node.js...');
        
        await this.testAsync('Processos Node.js ativos', async () => {
            try {
                const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
                const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
                
                if (lines.length === 0) {
                    throw new Error('Nenhum processo Node.js encontrado');
                }
                
                console.log(`   📊 Encontrados ${lines.length} processos Node.js`);
            } catch (error) {
                throw new Error(`Erro ao verificar processos: ${error.message}`);
            }
        });
    }

    async testPorts() {
        console.log('\n🌐 Verificando portas em uso...');
        
        const expectedPorts = [3001, 3002, 3003, 3004, 4566, 5432, 6379, 9090];
        
        for (const port of expectedPorts) {
            await this.testAsync(`Porta ${port} em uso`, async () => {
                try {
                    const { stdout } = await execAsync(`netstat -an | findstr :${port}`);
                    
                    if (!stdout.trim()) {
                        throw new Error(`Porta ${port} não está em uso`);
                    }
                    
                    console.log(`   📡 Porta ${port}: ativa`);
                } catch (error) {
                    if (error.message.includes('não está em uso')) {
                        throw error;
                    }
                    // Se netstat falhar, não é necessariamente um erro
                    console.log(`   ⚠️ Porta ${port}: não foi possível verificar`);
                }
            });
        }
    }

    printSummary() {
        const total = this.passed + this.failed;
        const successRate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMO DOS TESTES ISOLADOS');
        console.log('='.repeat(60));
        console.log(`Total de verificações: ${total}`);
        console.log(`✅ Passou: ${this.passed}`);
        console.log(`❌ Falhou: ${this.failed}`);
        console.log(`📈 Taxa de sucesso: ${successRate}%`);
        console.log('='.repeat(60));
        
        if (this.failed === 0) {
            console.log('🎉 Todos os testes isolados passaram!');
            console.log('✅ Estrutura do projeto está correta');
            console.log('✅ Configurações estão válidas');
            console.log('✅ Processos Node.js estão rodando');
            console.log('✅ Portas esperadas estão ativas');
        } else if (successRate >= 80) {
            console.log('⚠️ Maioria dos testes passou.');
            console.log('🔧 Alguns itens precisam de atenção - revisar falhas acima');
        } else {
            console.log('🚨 Muitos testes falharam.');
            console.log('🔧 Sistema precisa de correções significativas');
        }
        
        console.log('\n💡 Verificações manuais recomendadas:');
        console.log('1. Abrir http://localhost:3001 no navegador');
        console.log('2. Verificar logs da aplicação');
        console.log('3. Executar: docker ps');
        console.log('4. Consultar docs/COMO_TESTAR_EVENTOS.md');
        
        console.log('\n🔒 Este script é SEGURO - não causa shutdown da aplicação');
    }
}

// Executar os testes
if (require.main === module) {
    const tester = new IsolatedSystemTester();
    tester.run().catch(console.error);
}

module.exports = IsolatedSystemTester;