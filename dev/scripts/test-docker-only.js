#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class DockerOnlyTester {
    constructor() {
        this.passed = 0;
        this.failed = 0;
    }

    async run() {
        console.log('🐳 Testando apenas containers Docker...');
        
        await this.checkDockerContainers();
        await this.checkDockerServices();
        
        this.printSummary();
    }

    async checkDockerContainers() {
        console.log('\n📋 Verificando containers Docker...');
        
        try {
            const { stdout } = await execAsync('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
            
            if (stdout.trim()) {
                console.log('✅ Containers em execução:');
                console.log(stdout);
                this.passed++;
            } else {
                console.log('❌ Nenhum container Docker em execução');
                this.failed++;
            }
        } catch (error) {
            console.log('❌ Erro ao verificar containers Docker:', error.message);
            this.failed++;
        }
    }

    async checkDockerServices() {
        console.log('\n🔍 Verificando serviços específicos...');
        
        const expectedContainers = [
            'agentes-localstack',
            'agentes-postgres', 
            'agentes-redis',
            'agentes-prometheus',
            'agentes-grafana',
            'agentes-pgadmin',
            'agentes-redis-commander'
        ];

        for (const container of expectedContainers) {
            try {
                const { stdout } = await execAsync(`docker ps --filter "name=${container}" --format "{{.Names}}"`);
                
                if (stdout.trim() === container) {
                    console.log(`✅ ${container} está rodando`);
                    this.passed++;
                } else {
                    console.log(`❌ ${container} não está rodando`);
                    this.failed++;
                }
            } catch (error) {
                console.log(`❌ Erro ao verificar ${container}:`, error.message);
                this.failed++;
            }
        }
    }

    printSummary() {
        const total = this.passed + this.failed;
        const successRate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0;
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESUMO DOS TESTES DOCKER');
        console.log('='.repeat(50));
        console.log(`Total de verificações: ${total}`);
        console.log(`✅ Passou: ${this.passed}`);
        console.log(`❌ Falhou: ${this.failed}`);
        console.log(`📈 Taxa de sucesso: ${successRate}%`);
        console.log('='.repeat(50));
        
        if (this.failed === 0) {
            console.log('🎉 Todos os containers Docker estão funcionando!');
        } else if (successRate >= 80) {
            console.log('⚠️ Maioria dos containers está funcionando.');
        } else {
            console.log('🚨 Problemas significativos com containers Docker.');
        }
    }
}

// Executar os testes
if (require.main === module) {
    const tester = new DockerOnlyTester();
    tester.run().catch(console.error);
}

module.exports = DockerOnlyTester;