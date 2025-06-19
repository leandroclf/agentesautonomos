#!/usr/bin/env node

/**
 * Script de Migração da Estrutura do Projeto
 * 
 * Este script automatiza a migração de arquivos para a nova estrutura organizacional
 * seguindo padrões enterprise de organização de projetos.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProjectMigrator {
    constructor() {
        this.projectRoot = process.cwd();
        this.migrations = [
            {
                name: 'Create base directories',
                action: () => this.createDirectories()
            },
            {
                name: 'Move development scripts',
                action: () => this.moveDevScripts()
            },
            {
                name: 'Move deployment scripts',
                action: () => this.moveDeployScripts()
            },
            {
                name: 'Organize infrastructure',
                action: () => this.organizeInfrastructure()
            },
            {
                name: 'Setup configurations',
                action: () => this.setupConfigurations()
            },
            {
                name: 'Update package.json',
                action: () => this.updatePackageJson()
            }
        ];
    }

    async run() {
        console.log('🚀 Iniciando migração da estrutura do projeto...');
        
        for (const migration of this.migrations) {
            try {
                console.log(`📁 ${migration.name}...`);
                await migration.action();
                console.log(`✅ ${migration.name} - Concluído`);
            } catch (error) {
                console.error(`❌ Erro em ${migration.name}:`, error.message);
                process.exit(1);
            }
        }
        
        console.log('🎉 Migração concluída com sucesso!');
        this.printSummary();
    }

    createDirectories() {
        const dirs = [
            'dev/scripts',
            'dev/mocks',
            'deploy/aws',
            'deploy/staging',
            'deploy/production',
            'deploy/ci-cd',
            'infrastructure/localstack/init-scripts',
            'infrastructure/aws',
            'infrastructure/kubernetes',
            'infrastructure/docker',
            'infrastructure/monitoring',
            'config/environments',
            'config/app-configs',
            'config/monitoring',
            'config/templates'
        ];

        dirs.forEach(dir => {
            const fullPath = path.join(this.projectRoot, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        });
    }

    moveDevScripts() {
        const moves = [
            { from: 'scripts/dev-setup.js', to: 'dev/setup.js' },
            { from: 'scripts/local-env-manager.js', to: 'dev/local-stack.js' },
            { from: 'scripts/start-all.js', to: 'dev/scripts/start-all.js' },
            { from: 'scripts/start-mocks.js', to: 'dev/scripts/start-mocks.js' },
            { from: 'scripts/test-system.js', to: 'dev/scripts/test-system.js' },
            { from: 'src/mocks', to: 'dev/mocks' }
        ];

        this.moveFiles(moves);
    }

    moveDeployScripts() {
        const moves = [
            { from: 'scripts/aws-setup.js', to: 'deploy/aws/setup.js' },
            { from: 'scripts/aws-verify.js', to: 'deploy/aws/verify.js' },
            { from: 'scripts/provision-sqs.js', to: 'deploy/aws/provision-sqs.js' }
        ];

        this.moveFiles(moves);
    }

    organizeInfrastructure() {
        const moves = [
            { from: 'setup-aws.ps1', to: 'infrastructure/localstack/setup.ps1' }
        ];

        this.moveFiles(moves);
    }

    setupConfigurations() {
        const moves = [
            { from: 'config/prometheus.yml', to: 'config/monitoring/prometheus.yml' },
            { from: 'config/grafana', to: 'config/monitoring/grafana' }
        ];

        this.moveFiles(moves);
    }

    moveFiles(moves) {
        moves.forEach(({ from, to }) => {
            const fromPath = path.join(this.projectRoot, from);
            const toPath = path.join(this.projectRoot, to);
            
            if (fs.existsSync(fromPath)) {
                const toDir = path.dirname(toPath);
                if (!fs.existsSync(toDir)) {
                    fs.mkdirSync(toDir, { recursive: true });
                }
                
                try {
                    fs.renameSync(fromPath, toPath);
                    console.log(`  📦 Movido: ${from} → ${to}`);
                } catch (error) {
                    console.warn(`  ⚠️  Não foi possível mover ${from}: ${error.message}`);
                }
            }
        });
    }

    updatePackageJson() {
        const packagePath = path.join(this.projectRoot, 'package.json');
        if (!fs.existsSync(packagePath)) return;

        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        // Atualizar scripts
        if (packageJson.scripts) {
            packageJson.scripts = {
                ...packageJson.scripts,
                'dev:setup': 'node dev/setup.js',
                'start': 'node dev/scripts/start-all.js',
                'aws:setup': 'node deploy/aws/setup.js',
                'aws:verify': 'node deploy/aws/verify.js',
                'localstack:up': 'cd infrastructure/localstack && docker-compose up -d',
                'localstack:down': 'cd infrastructure/localstack && docker-compose down',
                'localstack:setup': 'cd infrastructure/localstack && ./init-scripts/01-setup-resources.sh'
            };
        }

        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    }

    printSummary() {
        console.log('\n📋 Resumo da Nova Estrutura:');
        console.log('├── dev/              # Desenvolvimento local');
        console.log('├── deploy/           # Scripts de deployment');
        console.log('├── infrastructure/   # Configurações de infraestrutura');
        console.log('├── config/           # Configurações centralizadas');
        console.log('└── docs/             # Documentação');
        console.log('\n🔧 Próximos passos:');
        console.log('1. Revisar os scripts movidos');
        console.log('2. Testar os comandos npm atualizados');
        console.log('3. Atualizar a documentação se necessário');
    }
}

// Executar migração se chamado diretamente
if (require.main === module) {
    const migrator = new ProjectMigrator();
    migrator.run().catch(console.error);
}

module.exports = ProjectMigrator;