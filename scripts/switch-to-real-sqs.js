/**
 * Script para Transição do MockSQSService para SQS Real
 * Fase 1: Configuração para Produção - Semana 1
 * 
 * Este script atualiza todos os agentes para usar SQS real em vez do MockSQSService
 */

const fs = require('fs');
const path = require('path');
const Logger = require('../src/utils/logger');

class SQSTransitionManager {
  constructor() {
    this.logger = new Logger('sqs-transition-manager');
    this.agentFiles = [];
    this.backupDir = path.join(__dirname, '..', 'temp', 'sqs-transition-backup');
    this.transitionResults = [];
  }

  /**
   * Encontrar todos os arquivos de agentes que usam MockSQSService
   */
  findAgentFiles() {
    try {
      this.logger.info('Finding agent files that use MockSQSService...');
      
      const agentsDir = path.join(__dirname, '..', 'src', 'agents');
      const agentFiles = [];
      
      // Função recursiva para encontrar arquivos
      const findFiles = (dir) => {
        const items = fs.readdirSync(dir);
        
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            findFiles(fullPath);
          } else if (item === 'index.js') {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('MockSQSService')) {
              agentFiles.push(fullPath);
            }
          }
        });
      };
      
      findFiles(agentsDir);
      
      this.agentFiles = agentFiles;
      this.logger.info(`Found ${agentFiles.length} agent files using MockSQSService`);
      
      agentFiles.forEach(file => {
        this.logger.info(`  - ${path.relative(process.cwd(), file)}`);
      });
      
    } catch (error) {
      this.logger.error('Failed to find agent files:', error);
      throw error;
    }
  }

  /**
   * Criar backup dos arquivos originais
   */
  createBackup() {
    try {
      this.logger.info('Creating backup of original files...');
      
      // Criar diretório de backup
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
      
      this.agentFiles.forEach(filePath => {
        const relativePath = path.relative(path.join(__dirname, '..', 'src'), filePath);
        const backupPath = path.join(this.backupDir, relativePath);
        
        // Criar diretórios necessários
        const backupDir = path.dirname(backupPath);
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // Copiar arquivo
        fs.copyFileSync(filePath, backupPath);
        this.logger.info(`Backup created: ${relativePath}`);
      });
      
      this.logger.info(`Backup completed in: ${this.backupDir}`);
    } catch (error) {
      this.logger.error('Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Atualizar um arquivo de agente para usar SQS real
   */
  updateAgentFile(filePath) {
    try {
      const relativePath = path.relative(process.cwd(), filePath);
      this.logger.info(`Updating agent file: ${relativePath}`);
      
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      // Substituições necessárias
      const replacements = [
        {
          from: /const MockSQSService = require\('.*mock-sqs-service'\);/g,
          to: '// MockSQSService removed - using real SQS now',
          description: 'Remove MockSQSService import'
        },
        {
          from: /\/\/ Use MockSQSService in development, real SQSService in production[\s\S]*?new MockSQSService\([^)]*\)/g,
          to: 'new SQSService(this.logger)',
          description: 'Replace MockSQSService instantiation with SQSService'
        },
        {
          from: /\? new MockSQSService\([^)]*\)[\s\S]*?: new SQSService\([^)]*\)/g,
          to: 'new SQSService(this.logger)',
          description: 'Replace conditional SQS service creation'
        },
        {
          from: /\/\/ Use existing sqsService if already configured \(MockSQSService in development\)/g,
          to: '// Use existing sqsService if already configured (Real SQS in production)',
          description: 'Update comments'
        }
      ];
      
      replacements.forEach(replacement => {
        if (replacement.from.test(content)) {
          content = content.replace(replacement.from, replacement.to);
          modified = true;
          this.logger.info(`  ✅ ${replacement.description}`);
        }
      });
      
      // Verificar se SQSService está importado
      if (!content.includes("require('../../../services/sqs-service')") && 
          !content.includes("require('../../shared/services/sqsService')")) {
        
        // Adicionar import do SQSService
        const sqsServiceImport = "const SQSService = require('../../../services/sqs-service');";
        
        // Encontrar onde adicionar o import (após outros requires)
        const lines = content.split('\n');
        let insertIndex = 0;
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('require(') && !lines[i].includes('MockSQSService')) {
            insertIndex = i + 1;
          }
        }
        
        lines.splice(insertIndex, 0, sqsServiceImport);
        content = lines.join('\n');
        modified = true;
        this.logger.info('  ✅ Added SQSService import');
      }
      
      if (modified) {
        fs.writeFileSync(filePath, content);
        this.transitionResults.push({
          file: relativePath,
          status: 'success',
          changes: 'Updated to use real SQS'
        });
        this.logger.info(`  ✅ File updated successfully`);
      } else {
        this.transitionResults.push({
          file: relativePath,
          status: 'no-changes',
          changes: 'No changes needed'
        });
        this.logger.info(`  ℹ️ No changes needed`);
      }
      
    } catch (error) {
      this.transitionResults.push({
        file: path.relative(process.cwd(), filePath),
        status: 'error',
        changes: error.message
      });
      this.logger.error(`Failed to update ${filePath}:`, error);
    }
  }

  /**
   * Atualizar todos os arquivos de agentes
   */
  updateAllAgentFiles() {
    try {
      this.logger.info('Updating all agent files to use real SQS...');
      
      this.agentFiles.forEach(filePath => {
        this.updateAgentFile(filePath);
      });
      
      this.logger.info(`Updated ${this.agentFiles.length} agent files`);
    } catch (error) {
      this.logger.error('Failed to update agent files:', error);
      throw error;
    }
  }

  /**
   * Atualizar configuração para produção
   */
  updateEnvironmentConfig() {
    try {
      this.logger.info('Updating environment configuration...');
      
      // Criar arquivo .env para produção se não existir
      const envPath = path.join(__dirname, '..', '.env');
      
      if (!fs.existsSync(envPath)) {
        const envContent = [
          '# Production Environment Configuration',
          '# Generated by switch-to-real-sqs.js',
          '',
          'NODE_ENV=production',
          '',
          '# AWS Configuration',
          'AWS_REGION=us-east-1',
          '# AWS_ACCESS_KEY_ID=<configure>',
          '# AWS_SECRET_ACCESS_KEY=<configure>',
          '',
          '# SQS Configuration',
          'SQS_MAX_MESSAGES=10',
          'SQS_WAIT_TIME=20',
          'SQS_VISIBILITY_TIMEOUT=300',
          '',
          '# Logging',
          'LOG_LEVEL=info',
          'LOG_FORMAT=json'
        ].join('\n');
        
        fs.writeFileSync(envPath, envContent);
        this.logger.info('Created production .env file');
      }
      
    } catch (error) {
      this.logger.error('Failed to update environment config:', error);
      throw error;
    }
  }

  /**
   * Gerar relatório da transição
   */
  generateTransitionReport() {
    try {
      this.logger.info('Generating transition report...');
      
      const report = {
        timestamp: new Date().toISOString(),
        totalFiles: this.transitionResults.length,
        successful: this.transitionResults.filter(r => r.status === 'success').length,
        noChanges: this.transitionResults.filter(r => r.status === 'no-changes').length,
        errors: this.transitionResults.filter(r => r.status === 'error').length,
        backupLocation: this.backupDir,
        details: this.transitionResults
      };
      
      const reportPath = path.join(__dirname, '..', 'temp', `sqs-transition-report-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      this.logger.info(`Transition report saved: ${reportPath}`);
      return report;
    } catch (error) {
      this.logger.error('Failed to generate transition report:', error);
      throw error;
    }
  }

  /**
   * Exibir resumo da transição
   */
  displayTransitionSummary() {
    console.log('\n🔄 SQS Transition Summary');
    console.log('=' .repeat(50));
    
    const successful = this.transitionResults.filter(r => r.status === 'success');
    const noChanges = this.transitionResults.filter(r => r.status === 'no-changes');
    const errors = this.transitionResults.filter(r => r.status === 'error');
    
    console.log(`✅ Successfully updated: ${successful.length}`);
    console.log(`ℹ️ No changes needed: ${noChanges.length}`);
    console.log(`❌ Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Files with errors:');
      errors.forEach(result => {
        console.log(`  - ${result.file}: ${result.changes}`);
      });
    }
    
    console.log(`\n💾 Backup location: ${this.backupDir}`);
    
    console.log('\n📋 Next Steps:');
    if (errors.length === 0) {
      console.log('🎉 Transition completed successfully!');
      console.log('1. Test the system: npm run test:system');
      console.log('2. Configure AWS credentials');
      console.log('3. Start agents: npm run start:all');
    } else {
      console.log('🔧 Fix the errors and run the transition again');
      console.log('To restore backup: npm run restore:sqs-backup');
    }
  }

  /**
   * Executar transição completa
   */
  async run() {
    try {
      this.logger.info('🔄 Starting SQS Transition from Mock to Real...');
      
      this.findAgentFiles();
      this.createBackup();
      this.updateAllAgentFiles();
      this.updateEnvironmentConfig();
      const report = this.generateTransitionReport();
      this.displayTransitionSummary();
      
      this.logger.info('✅ SQS Transition completed!');
      
      // Retornar código de saída baseado no sucesso
      const hasErrors = this.transitionResults.some(r => r.status === 'error');
      process.exit(hasErrors ? 1 : 0);
      
    } catch (error) {
      this.logger.error('❌ SQS Transition failed:', error);
      console.log('\n🔧 To restore backup:');
      console.log(`cp -r ${this.backupDir}/* src/`);
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const manager = new SQSTransitionManager();
  manager.run();
}

module.exports = SQSTransitionManager;