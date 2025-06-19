/**
 * Backup Service - Serviço de Backup
 * Gerencia backup automático, compressão e armazenamento em S3
 */

const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const EventEmitter = require('events');
const { promisify } = require('util');

class BackupService extends EventEmitter {
  constructor(config, logger, metrics) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.s3 = null;
    this.backupQueue = [];
    this.isProcessing = false;
    this.backupInterval = null;
    this.compressionEnabled = config.persistence?.backup?.compression || false;
    this.localBackupPath = config.persistence?.backup?.location || './backups';
  }

  /**
   * Inicializa o serviço de backup
   */
  async initialize() {
    if (!this.config.persistence.backup.enabled) {
      this.logger.info('Backup desabilitado na configuração');
      return;
    }

    try {
      this.logger.info('Inicializando Backup Service...');
      
      // Configurar AWS S3 se habilitado
      if (this.config.persistence.backup.s3?.enabled) {
        await this.setupS3();
      }
      
      // Criar diretório local de backup
      await this.ensureBackupDirectory();
      
      // Iniciar processamento da fila
      this.startQueueProcessing();
      
      // Configurar backup automático
      this.setupAutomaticBackup();
      
      // Limpar backups antigos
      this.setupCleanupSchedule();
      
      this.logger.info('Backup Service inicializado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar Backup Service:', error);
      throw error;
    }
  }

  /**
   * Configura cliente S3
   */
  async setupS3() {
    try {
      this.s3 = new AWS.S3({
        region: this.config.persistence.backup.s3.region,
        accessKeyId: this.config.persistence.backup.s3.accessKeyId,
        secretAccessKey: this.config.persistence.backup.s3.secretAccessKey,
        endpoint: this.config.persistence.backup.s3.endpoint
      });

      // Testar conexão
      await this.s3.headBucket({ Bucket: this.config.persistence.backup.s3.bucket }).promise();
      this.logger.info('Conexão S3 estabelecida com sucesso');
    } catch (error) {
      this.logger.error('Erro ao configurar S3:', error);
      throw error;
    }
  }

  /**
   * Garante que o diretório de backup existe
   */
  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.localBackupPath, { recursive: true });
      this.logger.debug(`Diretório de backup criado: ${this.localBackupPath}`);
    } catch (error) {
      this.logger.error('Erro ao criar diretório de backup:', error);
      throw error;
    }
  }

  /**
   * Inicia processamento da fila de backup
   */
  startQueueProcessing() {
    this.isProcessing = true;
    this.processBackupQueue();
    this.logger.info('Processamento da fila de backup iniciado');
  }

  /**
   * Processa fila de backup
   */
  async processBackupQueue() {
    while (this.isProcessing) {
      try {
        if (this.backupQueue.length > 0) {
          const backupItem = this.backupQueue.shift();
          await this.performBackup(backupItem);
        } else {
          // Aguardar novos itens
          await this.sleep(1000);
        }
      } catch (error) {
        this.logger.error('Erro no processamento da fila de backup:', error);
        this.metrics.errorCount.inc({ type: 'backup_queue', operation: 'process' });
        await this.sleep(5000);
      }
    }
  }

  /**
   * Agenda um backup
   */
  scheduleBackup(data, options = {}) {
    const backupItem = {
      id: this.generateBackupId(),
      data,
      timestamp: Date.now(),
      type: options.type || 'data',
      priority: options.priority || 'normal',
      metadata: options.metadata || {}
    };

    // Inserir na fila baseado na prioridade
    if (backupItem.priority === 'high') {
      this.backupQueue.unshift(backupItem);
    } else {
      this.backupQueue.push(backupItem);
    }

    this.logger.debug(`Backup agendado: ${backupItem.id}`);
  }

  /**
   * Executa backup de um item
   */
  async performBackup(backupItem) {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Iniciando backup: ${backupItem.id}`);
      
      // Preparar dados para backup
      const backupData = {
        id: backupItem.id,
        timestamp: backupItem.timestamp,
        type: backupItem.type,
        data: backupItem.data,
        metadata: {
          ...backupItem.metadata,
          version: '1.0',
          agent: 'persistence-agent',
          created: new Date().toISOString()
        }
      };

      // Serializar dados
      let serializedData = JSON.stringify(backupData, null, 2);
      
      // Comprimir se habilitado
      if (this.compressionEnabled) {
        serializedData = await this.compressData(serializedData);
      }

      // Salvar localmente
      const localPath = await this.saveLocalBackup(backupItem.id, serializedData);
      
      // Enviar para S3 se habilitado
      if (this.s3) {
        await this.uploadToS3(backupItem.id, serializedData, backupData.metadata);
      }

      // Métricas
      const duration = Date.now() - startTime;
      this.metrics.backupOperations.inc({ type: backupItem.type, status: 'success' });
      
      this.logger.info(`Backup concluído: ${backupItem.id}`, {
        duration,
        size: serializedData.length,
        compressed: this.compressionEnabled
      });

      // Emitir evento
      this.emit('backupCompleted', {
        id: backupItem.id,
        localPath,
        duration,
        size: serializedData.length
      });

    } catch (error) {
      this.logger.error(`Erro no backup ${backupItem.id}:`, error);
      this.metrics.backupOperations.inc({ type: backupItem.type, status: 'error' });
      
      // Emitir evento de erro
      this.emit('backupError', {
        id: backupItem.id,
        error: error.message
      });
    }
  }

  /**
   * Salva backup localmente
   */
  async saveLocalBackup(backupId, data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${backupId}-${timestamp}.json${this.compressionEnabled ? '.gz' : ''}`;
    const filePath = path.join(this.localBackupPath, filename);

    try {
      await fs.writeFile(filePath, data);
      this.logger.debug(`Backup local salvo: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error('Erro ao salvar backup local:', error);
      throw error;
    }
  }

  /**
   * Envia backup para S3
   */
  async uploadToS3(backupId, data, metadata) {
    if (!this.s3) {
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const key = `backups/${timestamp}/${backupId}.json${this.compressionEnabled ? '.gz' : ''}`;
      
      const params = {
        Bucket: this.config.persistence.backup.s3.bucket,
        Key: key,
        Body: data,
        ContentType: this.compressionEnabled ? 'application/gzip' : 'application/json',
        Metadata: {
          backupId,
          timestamp: timestamp,
          agent: 'persistence-agent',
          version: metadata.version || '1.0'
        },
        ServerSideEncryption: 'AES256'
      };

      const result = await this.s3.upload(params).promise();
      this.logger.debug(`Backup enviado para S3: ${result.Location}`);
      
      return result.Location;
    } catch (error) {
      this.logger.error('Erro ao enviar backup para S3:', error);
      throw error;
    }
  }

  /**
   * Comprime dados
   */
  async compressData(data) {
    try {
      const compressed = await promisify(zlib.gzip)(data, {
        level: this.config.persistence.backup.compressionLevel || 6
      });
      
      this.logger.debug(`Dados comprimidos: ${data.length} -> ${compressed.length} bytes`);
      return compressed;
    } catch (error) {
      this.logger.error('Erro na compressão:', error);
      throw error;
    }
  }

  /**
   * Descomprime dados
   */
  async decompressData(compressedData) {
    try {
      const decompressed = await promisify(zlib.gunzip)(compressedData);
      return decompressed.toString();
    } catch (error) {
      this.logger.error('Erro na descompressão:', error);
      throw error;
    }
  }

  /**
   * Configura backup automático
   */
  setupAutomaticBackup() {
    if (!this.config.persistence.backup.interval) {
      return;
    }

    const intervalMs = this.config.persistence.backup.interval * 1000;
    
    this.backupInterval = setInterval(async () => {
      try {
        await this.performFullBackup();
      } catch (error) {
        this.logger.error('Erro no backup automático:', error);
      }
    }, intervalMs);

    this.logger.info(`Backup automático configurado: ${this.config.persistence.backup.interval}s`);
  }

  /**
   * Executa backup completo
   */
  async performFullBackup() {
    this.logger.info('Iniciando backup completo...');
    
    const backupData = {
      type: 'full_backup',
      timestamp: Date.now(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      },
      queue: {
        size: this.backupQueue.length
      },
      config: {
        backup: this.config.persistence.backup,
        cache: this.config.persistence.cache
      }
    };

    this.scheduleBackup(backupData, {
      type: 'system',
      priority: 'high',
      metadata: {
        automatic: true,
        fullBackup: true
      }
    });
  }

  /**
   * Configura limpeza automática de backups antigos
   */
  setupCleanupSchedule() {
    if (!this.config.persistence.backup.retention) {
      return;
    }

    // Executar limpeza a cada 6 horas
    setInterval(async () => {
      try {
        await this.cleanupOldBackups();
      } catch (error) {
        this.logger.error('Erro na limpeza de backups:', error);
      }
    }, 6 * 60 * 60 * 1000);

    this.logger.info(`Limpeza automática configurada: ${this.config.persistence.backup.retention} dias`);
  }

  /**
   * Remove backups antigos
   */
  async cleanupOldBackups() {
    const retentionDays = this.config.persistence.backup.retention;
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    this.logger.info(`Iniciando limpeza de backups anteriores a ${new Date(cutoffTime).toISOString()}`);
    
    let cleanedLocal = 0;
    let cleanedS3 = 0;

    try {
      // Limpar backups locais
      cleanedLocal = await this.cleanupLocalBackups(cutoffTime);
      
      // Limpar backups S3
      if (this.s3) {
        cleanedS3 = await this.cleanupS3Backups(cutoffTime);
      }

      this.logger.info(`Limpeza concluída: ${cleanedLocal} locais, ${cleanedS3} S3`);
    } catch (error) {
      this.logger.error('Erro na limpeza de backups:', error);
    }
  }

  /**
   * Limpa backups locais antigos
   */
  async cleanupLocalBackups(cutoffTime) {
    let cleaned = 0;
    
    try {
      const files = await fs.readdir(this.localBackupPath);
      
      for (const file of files) {
        if (file.startsWith('backup-')) {
          const filePath = path.join(this.localBackupPath, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath);
            cleaned++;
            this.logger.debug(`Backup local removido: ${file}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Erro na limpeza de backups locais:', error);
    }
    
    return cleaned;
  }

  /**
   * Limpa backups S3 antigos
   */
  async cleanupS3Backups(cutoffTime) {
    let cleaned = 0;
    
    try {
      const params = {
        Bucket: this.config.persistence.backup.s3.bucket,
        Prefix: 'backups/'
      };
      
      const objects = await this.s3.listObjectsV2(params).promise();
      
      for (const object of objects.Contents || []) {
        if (object.LastModified.getTime() < cutoffTime) {
          await this.s3.deleteObject({
            Bucket: this.config.persistence.backup.s3.bucket,
            Key: object.Key
          }).promise();
          
          cleaned++;
          this.logger.debug(`Backup S3 removido: ${object.Key}`);
        }
      }
    } catch (error) {
      this.logger.error('Erro na limpeza de backups S3:', error);
    }
    
    return cleaned;
  }

  /**
   * Restaura backup por ID
   */
  async restoreBackup(backupId, options = {}) {
    try {
      this.logger.info(`Iniciando restauração do backup: ${backupId}`);
      
      let backupData = null;
      
      // Tentar restaurar do S3 primeiro
      if (this.s3 && !options.localOnly) {
        backupData = await this.restoreFromS3(backupId);
      }
      
      // Se não encontrou no S3, tentar local
      if (!backupData) {
        backupData = await this.restoreFromLocal(backupId);
      }
      
      if (!backupData) {
        throw new Error(`Backup não encontrado: ${backupId}`);
      }
      
      this.logger.info(`Backup restaurado com sucesso: ${backupId}`);
      return backupData;
    } catch (error) {
      this.logger.error(`Erro na restauração do backup ${backupId}:`, error);
      throw error;
    }
  }

  /**
   * Restaura backup do S3
   */
  async restoreFromS3(backupId) {
    // Implementação da restauração do S3
    // Buscar objeto por metadata ou padrão de nome
    return null;
  }

  /**
   * Restaura backup local
   */
  async restoreFromLocal(backupId) {
    try {
      const files = await fs.readdir(this.localBackupPath);
      const backupFile = files.find(file => file.includes(backupId));
      
      if (!backupFile) {
        return null;
      }
      
      const filePath = path.join(this.localBackupPath, backupFile);
      let data = await fs.readFile(filePath);
      
      // Descomprimir se necessário
      if (backupFile.endsWith('.gz')) {
        data = await this.decompressData(data);
      } else {
        data = data.toString();
      }
      
      return JSON.parse(data);
    } catch (error) {
      this.logger.error('Erro na restauração local:', error);
      return null;
    }
  }

  /**
   * Lista backups disponíveis
   */
  async listBackups(options = {}) {
    const backups = [];
    
    try {
      // Listar backups locais
      if (!options.s3Only) {
        const localBackups = await this.listLocalBackups();
        backups.push(...localBackups);
      }
      
      // Listar backups S3
      if (this.s3 && !options.localOnly) {
        const s3Backups = await this.listS3Backups();
        backups.push(...s3Backups);
      }
      
      // Ordenar por timestamp
      backups.sort((a, b) => b.timestamp - a.timestamp);
      
      return backups;
    } catch (error) {
      this.logger.error('Erro ao listar backups:', error);
      throw error;
    }
  }

  /**
   * Lista backups locais
   */
  async listLocalBackups() {
    const backups = [];
    
    try {
      const files = await fs.readdir(this.localBackupPath);
      
      for (const file of files) {
        if (file.startsWith('backup-')) {
          const filePath = path.join(this.localBackupPath, file);
          const stats = await fs.stat(filePath);
          
          backups.push({
            id: this.extractBackupId(file),
            filename: file,
            path: filePath,
            size: stats.size,
            timestamp: stats.mtime.getTime(),
            location: 'local',
            compressed: file.endsWith('.gz')
          });
        }
      }
    } catch (error) {
      this.logger.error('Erro ao listar backups locais:', error);
    }
    
    return backups;
  }

  /**
   * Lista backups S3
   */
  async listS3Backups() {
    const backups = [];
    
    try {
      const params = {
        Bucket: this.config.persistence.backup.s3.bucket,
        Prefix: 'backups/'
      };
      
      const objects = await this.s3.listObjectsV2(params).promise();
      
      for (const object of objects.Contents || []) {
        backups.push({
          id: this.extractBackupId(object.Key),
          key: object.Key,
          size: object.Size,
          timestamp: object.LastModified.getTime(),
          location: 's3',
          compressed: object.Key.endsWith('.gz')
        });
      }
    } catch (error) {
      this.logger.error('Erro ao listar backups S3:', error);
    }
    
    return backups;
  }

  /**
   * Extrai ID do backup do nome do arquivo
   */
  extractBackupId(filename) {
    const match = filename.match(/backup-([^-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Gera ID único para backup
   */
  generateBackupId() {
    return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Função de sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Para o serviço
   */
  async stop() {
    this.logger.info('Parando Backup Service...');
    
    this.isProcessing = false;
    
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }
    
    // Processar itens restantes na fila
    while (this.backupQueue.length > 0) {
      const item = this.backupQueue.shift();
      try {
        await this.performBackup(item);
      } catch (error) {
        this.logger.error('Erro no backup final:', error);
      }
    }
    
    this.logger.info('Backup Service parado');
  }

  /**
   * Retorna status do serviço
   */
  getStatus() {
    return {
      enabled: this.config.persistence.backup.enabled,
      processing: this.isProcessing,
      queueSize: this.backupQueue.length,
      s3Enabled: !!this.s3,
      compressionEnabled: this.compressionEnabled,
      localPath: this.localBackupPath
    };
  }
}

module.exports = BackupService;