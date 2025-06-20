#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class AWSProductionDeployer {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../..');
        this.requiredEnvVars = [
            'AWS_REGION',
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'DB_HOST',
            'DB_USER',
            'DB_PASSWORD',
            'REDIS_HOST',
            'REDIS_PASSWORD',
            'GRAFANA_ADMIN_PASSWORD'
        ];
    }

    async validateEnvironment() {
        console.log('🔍 Validando ambiente de produção...');
        
        // Verifica se o arquivo .env.production existe
        const envFile = path.join(this.projectRoot, '.env.production');
        if (!fs.existsSync(envFile)) {
            throw new Error('Arquivo .env.production não encontrado. Execute: cp .env.production.example .env.production');
        }

        // Carrega variáveis de ambiente
        const envContent = fs.readFileSync(envFile, 'utf8');
        const envVars = {};
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value && !key.startsWith('#')) {
                envVars[key.trim()] = value.trim();
            }
        });

        // Verifica variáveis obrigatórias
        const missingVars = this.requiredEnvVars.filter(varName => !envVars[varName] || envVars[varName] === '');
        if (missingVars.length > 0) {
            throw new Error(`Variáveis de ambiente obrigatórias não configuradas: ${missingVars.join(', ')}`);
        }

        console.log('✅ Ambiente de produção validado');
        return envVars;
    }

    async checkAWSCLI() {
        return new Promise((resolve) => {
            exec('aws --version', (error) => {
                resolve(!error);
            });
        });
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
                    exec('docker compose version', (error2) => {
                        resolve(!error2);
                    });
                } else {
                    resolve(true);
                }
            });
        });
    }

    async validateAWSResources(envVars) {
        console.log('🔍 Validando recursos AWS...');
        
        const checks = [
            {
                name: 'RDS PostgreSQL',
                command: `aws rds describe-db-instances --region ${envVars.AWS_REGION}`,
                validate: (output) => output.includes(envVars.DB_HOST)
            },
            {
                name: 'ElastiCache Redis',
                command: `aws elasticache describe-cache-clusters --region ${envVars.AWS_REGION}`,
                validate: (output) => output.includes(envVars.REDIS_HOST)
            },
            {
                name: 'SQS Queues',
                command: `aws sqs list-queues --region ${envVars.AWS_REGION}`,
                validate: (output) => output.includes('agentes-event-processing-prod')
            }
        ];

        for (const check of checks) {
            try {
                const output = await this.execCommand(check.command);
                if (check.validate(output)) {
                    console.log(`✅ ${check.name} disponível`);
                } else {
                    console.warn(`⚠️  ${check.name} pode não estar configurado corretamente`);
                }
            } catch (error) {
                console.warn(`⚠️  Erro ao verificar ${check.name}: ${error.message}`);
            }
        }
    }

    async execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${error.message}\n${stderr}`));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    async buildImages() {
        console.log('🏗️  Construindo imagens Docker...');
        
        const composeFile = path.join(this.projectRoot, 'docker-compose.aws.yml');
        if (!fs.existsSync(composeFile)) {
            throw new Error('Arquivo docker-compose.aws.yml não encontrado');
        }

        return new Promise((resolve, reject) => {
            const buildProcess = spawn('docker-compose', ['-f', composeFile, 'build', '--no-cache'], {
                cwd: this.projectRoot,
                stdio: 'pipe',
                env: { ...process.env, COMPOSE_DOCKER_CLI_BUILD: '1', DOCKER_BUILDKIT: '1' }
            });

            buildProcess.stdout.on('data', (data) => {
                console.log(`Build: ${data.toString().trim()}`);
            });

            buildProcess.stderr.on('data', (data) => {
                console.log(`Build: ${data.toString().trim()}`);
            });

            buildProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Imagens construídas com sucesso');
                    resolve();
                } else {
                    reject(new Error(`Build falhou com código ${code}`));
                }
            });
        });
    }

    async deployServices() {
        console.log('🚀 Fazendo deploy dos serviços...');
        
        const composeFile = path.join(this.projectRoot, 'docker-compose.aws.yml');
        const envFile = path.join(this.projectRoot, '.env.production');
        
        return new Promise((resolve, reject) => {
            const deployProcess = spawn('docker-compose', [
                '-f', composeFile,
                '--env-file', envFile,
                'up', '-d', '--remove-orphans'
            ], {
                cwd: this.projectRoot,
                stdio: 'pipe'
            });

            deployProcess.stdout.on('data', (data) => {
                console.log(`Deploy: ${data.toString().trim()}`);
            });

            deployProcess.stderr.on('data', (data) => {
                console.log(`Deploy: ${data.toString().trim()}`);
            });

            deployProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Deploy realizado com sucesso');
                    resolve();
                } else {
                    reject(new Error(`Deploy falhou com código ${code}`));
                }
            });
        });
    }

    async checkServicesHealth() {
        console.log('🏥 Verificando saúde dos serviços...');
        
        const services = [
            { name: 'External Gateway', url: 'http://localhost:3001/health' },
            { name: 'Interface Agent', url: 'http://localhost:3002/health' },
            { name: 'Event Agent', url: 'http://localhost:3003/health' },
            { name: 'Planning Agent', url: 'http://localhost:3004/health' },
            { name: 'Execution Agent', url: 'http://localhost:3005/health' },
            { name: 'Grafana', url: 'http://localhost:3000/api/health' },
            { name: 'Prometheus', url: 'http://localhost:9090/-/healthy' }
        ];

        for (const service of services) {
            try {
                await this.waitForService(service.url, 60000);
                console.log(`✅ ${service.name} está saudável`);
            } catch (error) {
                console.warn(`⚠️  ${service.name} não está respondendo: ${error.message}`);
            }
        }
    }

    async waitForService(url, timeout = 30000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            try {
                await this.execCommand(`curl -f ${url}`);
                return true;
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        throw new Error(`Timeout aguardando serviço em ${url}`);
    }

    async showDeploymentInfo() {
        console.log('\n📊 Informações do Deploy:');
        console.log('🌐 URLs dos serviços:');
        console.log('   - External Gateway: http://localhost:3001');
        console.log('   - Interface Agent: http://localhost:3002');
        console.log('   - Event Agent: http://localhost:3003');
        console.log('   - Planning Agent: http://localhost:3004');
        console.log('   - Execution Agent: http://localhost:3005');
        console.log('\n🔧 Ferramentas de monitoramento:');
        console.log('   - Grafana: http://localhost:3000');
        console.log('   - Prometheus: http://localhost:9090');
        console.log('\n📝 Logs dos serviços:');
        console.log('   docker-compose -f docker-compose.aws.yml logs -f [service-name]');
        console.log('\n🛑 Para parar os serviços:');
        console.log('   docker-compose -f docker-compose.aws.yml down');
    }

    async run() {
        try {
            console.log('🚀 Iniciando deploy de produção AWS...');
            
            // Validações
            const envVars = await this.validateEnvironment();
            
            const awsCliInstalled = await this.checkAWSCLI();
            if (!awsCliInstalled) {
                throw new Error('AWS CLI não está instalado');
            }
            
            const dockerInstalled = await this.checkDockerInstalled();
            if (!dockerInstalled) {
                throw new Error('Docker não está instalado');
            }
            
            const composeAvailable = await this.checkDockerCompose();
            if (!composeAvailable) {
                throw new Error('Docker Compose não está disponível');
            }
            
            // Valida recursos AWS
            await this.validateAWSResources(envVars);
            
            // Build e deploy
            await this.buildImages();
            await this.deployServices();
            
            // Aguarda serviços ficarem prontos
            await new Promise(resolve => setTimeout(resolve, 10000));
            await this.checkServicesHealth();
            
            // Mostra informações
            await this.showDeploymentInfo();
            
            console.log('\n✅ Deploy de produção concluído com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro no deploy de produção:', error.message);
            process.exit(1);
        }
    }
}

// Executa se chamado diretamente
if (require.main === module) {
    const deployer = new AWSProductionDeployer();
    deployer.run();
}

module.exports = AWSProductionDeployer;