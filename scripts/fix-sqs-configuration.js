#!/usr/bin/env node
/**
 * Script para Corrigir Configuração SQS
 * 
 * Este script resolve o conflito entre ElasticMQ (SQS local) e LocalStack,
 * padronizando o uso do LocalStack para todos os serviços AWS.
 * 
 * Uso: node scripts/fix-sqs-configuration.js
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class SQSConfigurationFixer {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.backupDir = path.join(this.projectRoot, 'temp', 'backup-configs');
  }

  async fix() {
    console.log('🔧 Corrigindo Configuração SQS...');
    
    try {
      // 1. Criar backup das configurações atuais
      await this.createBackup();
      
      // 2. Atualizar docker-compose.yml para usar apenas LocalStack
      await this.updateDockerCompose();
      
      // 3. Atualizar configurações dos agentes
      await this.updateAgentConfigs();
      
      // 4. Criar novo script de inicialização unificado
      await this.createUnifiedStartScript();
      
      // 5. Atualizar documentação
      await this.updateDocumentation();
      
      console.log('✅ Configuração SQS corrigida com sucesso!');
      this.displaySummary();
      
    } catch (error) {
      console.error('❌ Erro durante correção:', error.message);
      process.exit(1);
    }
  }

  async createBackup() {
    console.log('📦 Criando backup das configurações...');
    
    // Criar diretório de backup
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    
    const filesToBackup = [
      'docker-compose.yml',
      'docker-compose.dev.yml',
      'config/elasticmq.conf'
    ];
    
    for (const file of filesToBackup) {
      const sourcePath = path.join(this.projectRoot, file);
      const backupPath = path.join(this.backupDir, `${file.replace(/[/\\]/g, '_')}.backup`);
      
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, backupPath);
        console.log(`  ✅ Backup criado: ${file}`);
      }
    }
  }

  async updateDockerCompose() {
    console.log('🐳 Atualizando docker-compose.yml...');
    
    const dockerComposePath = path.join(this.projectRoot, 'docker-compose.yml');
    let content = fs.readFileSync(dockerComposePath, 'utf8');
    
    // Remover serviço sqs-local (ElasticMQ)
    const sqsLocalRegex = /\s*# SQS Local para desenvolvimento[\s\S]*?start_period: 5s/g;
    content = content.replace(sqsLocalRegex, '');
    
    // Atualizar referências de sqs-local para localstack
    content = content.replace(/sqs-local:9324/g, 'localstack:4566');
    content = content.replace(/depends_on:\s*-\s*sqs-local/g, 'depends_on:\n      - localstack');
    
    // Adicionar serviço LocalStack se não existir
    if (!content.includes('localstack:')) {
      const localstackService = `
  # LocalStack para serviços AWS
  localstack:
    container_name: agentes-localstack
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
      - "4510-4559:4510-4559"
    environment:
      - SERVICES=sqs,s3,dynamodb,lambda,apigateway,cloudformation,sts,iam
      - DEBUG=1
      - DATA_DIR=/var/lib/localstack
      - PERSISTENCE=1
      - SKIP_INFRA_DOWNLOADS=1
    volumes:
      - localstack_data:/var/lib/localstack
    networks:
      - agent-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
`;
      
      // Inserir antes da seção de volumes
      content = content.replace(/^volumes:/m, localstackService + '\nvolumes:');
    }
    
    // Adicionar volume do LocalStack se não existir
    if (!content.includes('localstack_data:')) {
      content = content.replace(/volumes:\s*$/m, 'volumes:\n  localstack_data:');
    }
    
    fs.writeFileSync(dockerComposePath, content);
    console.log('  ✅ docker-compose.yml atualizado');
  }

  async updateAgentConfigs() {
    console.log('⚙️  Atualizando configurações dos agentes...');
    
    // Atualizar variáveis de ambiente nos agentes
    const dockerComposePath = path.join(this.projectRoot, 'docker-compose.yml');
    let content = fs.readFileSync(dockerComposePath, 'utf8');
    
    // Substituir endpoint SQS em todos os agentes
    content = content.replace(/SQS_ENDPOINT=http:\/\/sqs-local:9324/g, 'SQS_ENDPOINT=http://localstack:4566');
    
    fs.writeFileSync(dockerComposePath, content);
    
    // Atualizar arquivo de configuração
    const configPath = path.join(this.projectRoot, 'src', 'config', 'index.js');
    if (fs.existsSync(configPath)) {
      let configContent = fs.readFileSync(configPath, 'utf8');
      configContent = configContent.replace(/localhost:9324/g, 'localhost:4566');
      configContent = configContent.replace(/sqs-local:9324/g, 'localstack:4566');
      fs.writeFileSync(configPath, configContent);
      console.log('  ✅ Configuração dos agentes atualizada');
    }
  }

  async createUnifiedStartScript() {
    console.log('📝 Criando script de inicialização unificado...');
    
    const scriptContent = `#!/usr/bin/env node
/**
 * Script Unificado de Inicialização
 * Inicia apenas LocalStack (sem ElasticMQ separado)
 */

const { exec } = require('child_process');
const path = require('path');

class UnifiedEnvironment {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
  }

  async start() {
    console.log('🚀 Iniciando Ambiente Unificado (LocalStack apenas)...');
    
    try {
      // 1. Parar ambiente anterior
      await this.execCommand('docker-compose down');
      await this.execCommand('docker-compose -f docker-compose.dev.yml down');
      
      // 2. Iniciar infraestrutura (incluindo LocalStack)
      console.log('🔄 Iniciando infraestrutura...');
      await this.execCommand('docker-compose -f docker-compose.dev.yml up -d localstack postgres redis');
      
      // 3. Aguardar LocalStack
      console.log('⏳ Aguardando LocalStack...');
      await this.waitForLocalStack();
      
      // 4. Configurar filas SQS
      console.log('🔄 Configurando filas SQS...');
      await this.execCommand('node scripts/setup-sqs-queues.js');
      
      // 5. Iniciar monitoramento
      console.log('🔄 Iniciando monitoramento...');
      await this.execCommand('docker-compose -f docker-compose.dev.yml up -d prometheus grafana');
      
      // 6. Iniciar agentes
      console.log('🔄 Iniciando agentes...');
      await this.execCommand('docker-compose up -d');
      
      console.log('✅ Ambiente iniciado com sucesso!');
      this.displayUrls();
      
    } catch (error) {
      console.error('❌ Erro:', error.message);
    }
  }

  async waitForLocalStack() {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.execCommand('curl -f http://localhost:4566/health');
        return;
      } catch (error) {
        await this.sleep(2000);
      }
    }
    throw new Error('LocalStack não ficou pronto');
  }

  displayUrls() {
    console.log('\n📋 URLs Disponíveis:');
    console.log('• Agentes: http://localhost:3000-3003');
    console.log('• Grafana: http://localhost:3000 (admin/admin123)');
    console.log('• Prometheus: http://localhost:9090');
    console.log('• LocalStack: http://localhost:4566');
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: this.projectRoot }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(\`\${command}: \${stderr || error.message}\`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (require.main === module) {
  new UnifiedEnvironment().start();
}
`;
    
    const scriptPath = path.join(this.projectRoot, 'scripts', 'start-unified.js');
    fs.writeFileSync(scriptPath, scriptContent);
    console.log('  ✅ Script unificado criado');
  }

  async updateDocumentation() {
    console.log('📚 Atualizando documentação...');
    
    const readmePath = path.join(this.projectRoot, 'docs', 'SQS_CONFIGURATION.md');
    const docContent = `# Configuração SQS Unificada

## Mudanças Implementadas

### Antes
- ElasticMQ (porta 9324) + LocalStack (porta 4566)
- Configuração duplicada e conflitante
- Scripts separados para cada serviço

### Depois
- Apenas LocalStack (porta 4566)
- Configuração unificada
- Script único de inicialização

## Como Usar

\`\`\`bash
# Novo comando unificado
npm run dev

# Ou diretamente
node scripts/start-unified.js
\`\`\`

## Benefícios

1. **Simplicidade**: Um único serviço AWS simulado
2. **Consistência**: Todas as configurações apontam para LocalStack
3. **Performance**: Menos containers rodando
4. **Manutenção**: Configuração centralizada

## Rollback

Se necessário, os backups estão em \`temp/backup-configs/\`
`;
    
    fs.writeFileSync(readmePath, docContent);
    console.log('  ✅ Documentação atualizada');
  }

  displaySummary() {
    console.log('\n🎉 Resumo das Correções:');
    console.log('┌─────────────────────────────────────────────┐');
    console.log('│ ✅ ElasticMQ removido do docker-compose.yml │');
    console.log('│ ✅ LocalStack configurado como SQS único    │');
    console.log('│ ✅ Agentes atualizados para usar LocalStack │');
    console.log('│ ✅ Script unificado criado                  │');
    console.log('│ ✅ Backup das configurações salvo           │');
    console.log('└─────────────────────────────────────────────┘');
    
    console.log('\n🚀 Próximos Passos:');
    console.log('1. Teste o novo ambiente: npm run dev');
    console.log('2. Verifique se todos os agentes conectam');
    console.log('3. Confirme que as filas SQS são criadas');
    console.log('4. Se houver problemas, restaure o backup');
    
    console.log('\n📁 Backups salvos em: temp/backup-configs/');
  }

  async execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: this.projectRoot, ...options }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${command}: ${stderr || error.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

// Execução
if (require.main === module) {
  new SQSConfigurationFixer().fix();
}

module.exports = SQSConfigurationFixer;