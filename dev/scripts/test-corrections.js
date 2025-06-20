#!/usr/bin/env node

/**
 * Script de Teste das Correções
 * Valida que as correções implementadas funcionam corretamente
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class CorrectionTester {
    constructor() {
        this.passed = 0;
        this.failed = 0;
        this.projectRoot = path.resolve(__dirname, '../..');
    }

    async run() {
        console.log('🔧 Testando Correções Implementadas...');
        console.log('=' .repeat(50));
        
        await this.testMockSQSServiceFix();
        await this.testScriptSafety();
        await this.testDocumentationCleanup();
        
        this.printSummary();
    }

    async testMockSQSServiceFix() {
        console.log('\n🔍 Verificando correção do MockSQSService...');
        
        try {
            const mockSQSPath = path.join(this.projectRoot, 'src/services/mock-sqs-service.js');
            const content = fs.readFileSync(mockSQSPath, 'utf8');
            
            if (content.includes('async close()')) {
                console.log('✅ Método close() adicionado ao MockSQSService');
                this.passed++;
            } else {
                console.log('❌ Método close() não encontrado no MockSQSService');
                this.failed++;
            }
            
            if (content.includes('return await this.shutdown()')) {
                console.log('✅ Método close() chama shutdown() corretamente');
                this.passed++;
            } else {
                console.log('❌ Método close() não implementado corretamente');
                this.failed++;
            }
            
        } catch (error) {
            console.log('❌ Erro ao verificar MockSQSService:', error.message);
            this.failed++;
        }
    }

    async testScriptSafety() {
        console.log('\n🛡️ Verificando segurança dos scripts...');
        
        const scripts = [
            'test-system.js',
            'test-system-safe.js', 
            'check-system-status.js'
        ];

        for (const script of scripts) {
            try {
                const scriptPath = path.join(this.projectRoot, 'dev/scripts', script);
                const content = fs.readFileSync(scriptPath, 'utf8');
                
                // Verificar se contém avisos de segurança
                if (content.includes('DESABILITADO') || content.includes('desabilitados')) {
                    console.log(`✅ ${script} - Contém avisos de segurança`);
                    this.passed++;
                } else {
                    console.log(`⚠️ ${script} - Pode não ter avisos de segurança`);
                }
                
                // Verificar se não faz requisições HTTP perigosas
                if (!content.includes('axios.get') && !content.includes('axios.post')) {
                    console.log(`✅ ${script} - Não contém requisições HTTP perigosas`);
                    this.passed++;
                } else if (content.includes('// Não executar') || content.includes('DESABILITADO')) {
                    console.log(`✅ ${script} - Requisições HTTP desabilitadas`);
                    this.passed++;
                } else {
                    console.log(`❌ ${script} - Ainda contém requisições HTTP ativas`);
                    this.failed++;
                }
                
            } catch (error) {
                console.log(`❌ Erro ao verificar ${script}:`, error.message);
                this.failed++;
            }
        }
    }

    async testDocumentationCleanup() {
        console.log('\n📚 Verificando limpeza da documentação...');
        
        const removedFiles = [
            'CORRECOES_SCRIPTS_TESTE.md',
            'ARQUITETURA_BDI_MARL_INTEGRADA.md',
            'ESPECIFICACOES_TECNICAS_COMPONENTES_PENDENTES.md',
            'PLANO_DESENVOLVIMENTO_UNIFICADO.md'
        ];

        for (const file of removedFiles) {
            const filePath = path.join(this.projectRoot, 'docs', file);
            
            if (!fs.existsSync(filePath)) {
                console.log(`✅ ${file} - Removido com sucesso`);
                this.passed++;
            } else {
                console.log(`❌ ${file} - Ainda existe`);
                this.failed++;
            }
        }
        
        // Verificar se PROBLEMA_SCRIPTS_TESTE.md foi atualizado
        try {
            const problemFilePath = path.join(this.projectRoot, 'docs/PROBLEMA_SCRIPTS_TESTE.md');
            const content = fs.readFileSync(problemFilePath, 'utf8');
            
            if (content.includes('Correções Implementadas')) {
                console.log('✅ PROBLEMA_SCRIPTS_TESTE.md - Atualizado com correções');
                this.passed++;
            } else {
                console.log('❌ PROBLEMA_SCRIPTS_TESTE.md - Não foi atualizado');
                this.failed++;
            }
            
        } catch (error) {
            console.log('❌ Erro ao verificar PROBLEMA_SCRIPTS_TESTE.md:', error.message);
            this.failed++;
        }
    }

    printSummary() {
        const total = this.passed + this.failed;
        const successRate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0;
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESUMO DAS CORREÇÕES');
        console.log('='.repeat(50));
        console.log(`Total de verificações: ${total}`);
        console.log(`✅ Passou: ${this.passed}`);
        console.log(`❌ Falhou: ${this.failed}`);
        console.log(`📈 Taxa de sucesso: ${successRate}%`);
        console.log('='.repeat(50));
        
        if (this.failed === 0) {
            console.log('🎉 Todas as correções foram implementadas com sucesso!');
            console.log('✅ Scripts de teste agora são seguros para execução');
            console.log('✅ Problema sqsService.close resolvido');
            console.log('✅ Documentação desnecessária removida');
        } else if (successRate >= 80) {
            console.log('⚠️ Maioria das correções implementada com sucesso.');
            console.log('🔧 Algumas verificações falharam - revisar itens marcados com ❌');
        } else {
            console.log('🚨 Problemas significativos nas correções.');
            console.log('🔧 Revisar e corrigir itens marcados com ❌');
        }
        
        console.log('\n💡 Próximos passos:');
        console.log('1. Executar aplicação: node dev/scripts/start-dev-environment.js');
        console.log('2. Testar scripts seguros: node dev/scripts/test-docker-only.js');
        console.log('3. Verificar interfaces web nos navegadores');
    }
}

// Executar os testes
if (require.main === module) {
    const tester = new CorrectionTester();
    tester.run().catch(console.error);
}

module.exports = CorrectionTester;