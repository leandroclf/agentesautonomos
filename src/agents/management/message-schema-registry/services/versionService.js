/**
 * Version Service - Gerenciamento de Versões
 * Responsável pelo versionamento semântico e controle de versões de esquemas
 */

const semver = require('semver')
const { EventEmitter } = require('events')

class VersionService extends EventEmitter {
  constructor({ config, schema, cache, metrics, logger }) {
    super()
    this.config = config
    this.schema = schema
    this.cache = cache
    this.metrics = metrics
    this.logger = logger
    
    this.versionHistory = new Map() // subject -> version history
    this.versionTags = new Map() // subject -> tags (latest, stable, etc.)
    this.deprecatedVersions = new Map() // subject -> deprecated versions
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Version Service...')
      
      // Carregar histórico de versões
      await this.loadVersionHistory()
      
      // Configurar listeners de esquema
      this.setupSchemaListeners()
      
      this.isInitialized = true
      this.logger.info('Version Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Version Service:', error)
      throw error
    }
  }

  async loadVersionHistory() {
    try {
      const cachedHistory = await this.cache.get('version_history')
      if (cachedHistory) {
        this.versionHistory = new Map(JSON.parse(cachedHistory))
      }
      
      const cachedTags = await this.cache.get('version_tags')
      if (cachedTags) {
        this.versionTags = new Map(JSON.parse(cachedTags))
      }
      
      const cachedDeprecated = await this.cache.get('deprecated_versions')
      if (cachedDeprecated) {
        this.deprecatedVersions = new Map(JSON.parse(cachedDeprecated))
      }
      
      this.logger.info(`Carregado histórico de versões para ${this.versionHistory.size} subjects`)
    } catch (error) {
      this.logger.warn('Erro ao carregar histórico de versões:', error)
    }
  }

  setupSchemaListeners() {
    this.schema.on('schema.registered', (data) => {
      this.handleSchemaRegistered(data)
    })
    
    this.schema.on('schema.updated', (data) => {
      this.handleSchemaUpdated(data)
    })
    
    this.schema.on('schema.deleted', (data) => {
      this.handleSchemaDeleted(data)
    })
  }

  async createVersion(subject, schemaData, versionInfo = {}) {
    try {
      this.logger.info('Criando nova versão:', { subject, version: versionInfo.version })
      
      const {
        version,
        changeType = 'patch',
        description = '',
        breaking = false,
        tags = []
      } = versionInfo
      
      // Determinar próxima versão se não especificada
      const nextVersion = version || await this.calculateNextVersion(subject, changeType, breaking)
      
      // Validar versão
      if (!this.isValidVersion(nextVersion)) {
        throw new Error(`Versão inválida: ${nextVersion}`)
      }
      
      // Verificar se versão já existe
      if (await this.versionExists(subject, nextVersion)) {
        throw new Error(`Versão já existe: ${subject}:${nextVersion}`)
      }
      
      // Criar registro de versão
      const versionRecord = {
        version: nextVersion,
        subject,
        schemaId: schemaData.id,
        changeType,
        breaking,
        description,
        tags: [...tags],
        createdAt: new Date().toISOString(),
        createdBy: 'system', // TODO: implementar autenticação
        metadata: {
          previousVersion: await this.getLatestVersion(subject),
          changesSummary: await this.generateChangesSummary(subject, schemaData),
          compatibility: await this.assessCompatibility(subject, schemaData)
        }
      }
      
      // Armazenar versão
      await this.storeVersion(subject, versionRecord)
      
      // Atualizar tags
      await this.updateVersionTags(subject, nextVersion, tags)
      
      // Emitir evento
      this.emit('version.created', versionRecord)
      
      // Atualizar métricas
      this.metrics?.incrementCounter('versions_created', {
        subject,
        changeType,
        breaking: breaking.toString()
      })
      
      this.logger.info('Versão criada com sucesso:', {
        subject,
        version: nextVersion,
        changeType,
        breaking
      })
      
      return versionRecord
      
    } catch (error) {
      this.logger.error('Erro ao criar versão:', error)
      this.metrics?.incrementCounter('version_creation_errors')
      throw error
    }
  }

  async calculateNextVersion(subject, changeType, breaking = false) {
    try {
      const currentVersion = await this.getLatestVersion(subject)
      
      if (!currentVersion) {
        // Primeira versão
        return this.config.strategy === 'semantic' ? '1.0.0' : '1'
      }
      
      if (this.config.strategy === 'semantic') {
        return this.calculateSemanticVersion(currentVersion, changeType, breaking)
      } else {
        return this.calculateIncrementalVersion(currentVersion)
      }
      
    } catch (error) {
      this.logger.error('Erro ao calcular próxima versão:', error)
      throw error
    }
  }

  calculateSemanticVersion(currentVersion, changeType, breaking) {
    try {
      if (breaking) {
        return semver.inc(currentVersion, 'major')
      }
      
      switch (changeType) {
        case 'major':
          return semver.inc(currentVersion, 'major')
        case 'minor':
          return semver.inc(currentVersion, 'minor')
        case 'patch':
        default:
          return semver.inc(currentVersion, 'patch')
      }
    } catch (error) {
      this.logger.error('Erro no versionamento semântico:', error)
      throw new Error(`Falha ao calcular versão semântica: ${error.message}`)
    }
  }

  calculateIncrementalVersion(currentVersion) {
    const current = parseInt(currentVersion)
    if (isNaN(current)) {
      throw new Error(`Versão atual inválida para incremento: ${currentVersion}`)
    }
    return (current + 1).toString()
  }

  async getVersions(subject, options = {}) {
    try {
      const {
        includeDeprecated = false,
        limit = 50,
        offset = 0,
        sortOrder = 'desc'
      } = options
      
      const history = this.versionHistory.get(subject)
      if (!history) {
        return {
          versions: [],
          total: 0,
          subject
        }
      }
      
      let versions = [...history.versions]
      
      // Filtrar versões depreciadas se necessário
      if (!includeDeprecated) {
        const deprecated = this.deprecatedVersions.get(subject) || new Set()
        versions = versions.filter(v => !deprecated.has(v.version))
      }
      
      // Ordenar
      versions.sort((a, b) => {
        const comparison = this.compareVersions(a.version, b.version)
        return sortOrder === 'desc' ? -comparison : comparison
      })
      
      // Paginação
      const total = versions.length
      const paginatedVersions = versions.slice(offset, offset + limit)
      
      return {
        versions: paginatedVersions,
        total,
        subject,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
      
    } catch (error) {
      this.logger.error('Erro ao obter versões:', error)
      throw error
    }
  }

  async getVersion(subject, version) {
    try {
      const history = this.versionHistory.get(subject)
      if (!history) {
        return null
      }
      
      // Resolver aliases de versão
      const resolvedVersion = await this.resolveVersionAlias(subject, version)
      
      return history.versions.find(v => v.version === resolvedVersion) || null
    } catch (error) {
      this.logger.error('Erro ao obter versão específica:', error)
      throw error
    }
  }

  async getLatestVersion(subject) {
    try {
      const tags = this.versionTags.get(subject)
      if (tags && tags.latest) {
        return tags.latest
      }
      
      const history = this.versionHistory.get(subject)
      if (!history || history.versions.length === 0) {
        return null
      }
      
      // Encontrar a versão mais recente
      const sortedVersions = history.versions.sort((a, b) => 
        this.compareVersions(b.version, a.version)
      )
      
      return sortedVersions[0].version
    } catch (error) {
      this.logger.error('Erro ao obter versão mais recente:', error)
      return null
    }
  }

  async resolveVersionAlias(subject, version) {
    try {
      // Aliases especiais
      switch (version) {
        case 'latest':
          return await this.getLatestVersion(subject)
        case 'stable':
          return await this.getStableVersion(subject)
        case 'previous':
          return await this.getPreviousVersion(subject)
        default:
          // Verificar se é uma tag customizada
          const tags = this.versionTags.get(subject)
          if (tags && tags[version]) {
            return tags[version]
          }
          return version
      }
    } catch (error) {
      this.logger.error('Erro ao resolver alias de versão:', error)
      return version
    }
  }

  async getStableVersion(subject) {
    try {
      const tags = this.versionTags.get(subject)
      if (tags && tags.stable) {
        return tags.stable
      }
      
      // Se não há tag stable, usar a versão mais recente não-beta
      const history = this.versionHistory.get(subject)
      if (!history) {
        return null
      }
      
      const stableVersions = history.versions.filter(v => 
        !v.version.includes('beta') && 
        !v.version.includes('alpha') && 
        !v.version.includes('rc')
      )
      
      if (stableVersions.length === 0) {
        return null
      }
      
      const sorted = stableVersions.sort((a, b) => 
        this.compareVersions(b.version, a.version)
      )
      
      return sorted[0].version
    } catch (error) {
      this.logger.error('Erro ao obter versão estável:', error)
      return null
    }
  }

  async getPreviousVersion(subject) {
    try {
      const history = this.versionHistory.get(subject)
      if (!history || history.versions.length < 2) {
        return null
      }
      
      const sorted = history.versions.sort((a, b) => 
        this.compareVersions(b.version, a.version)
      )
      
      return sorted[1].version
    } catch (error) {
      this.logger.error('Erro ao obter versão anterior:', error)
      return null
    }
  }

  async tagVersion(subject, version, tag) {
    try {
      this.logger.info('Adicionando tag à versão:', { subject, version, tag })
      
      // Verificar se versão existe
      if (!await this.versionExists(subject, version)) {
        throw new Error(`Versão não encontrada: ${subject}:${version}`)
      }
      
      // Atualizar tags
      if (!this.versionTags.has(subject)) {
        this.versionTags.set(subject, {})
      }
      
      this.versionTags.get(subject)[tag] = version
      
      // Persistir
      await this.persistVersionTags()
      
      // Emitir evento
      this.emit('version.tagged', { subject, version, tag })
      
      this.logger.info('Tag adicionada com sucesso:', { subject, version, tag })
      
    } catch (error) {
      this.logger.error('Erro ao adicionar tag:', error)
      throw error
    }
  }

  async deprecateVersion(subject, version, reason = '') {
    try {
      this.logger.info('Depreciando versão:', { subject, version, reason })
      
      // Verificar se versão existe
      if (!await this.versionExists(subject, version)) {
        throw new Error(`Versão não encontrada: ${subject}:${version}`)
      }
      
      // Adicionar à lista de depreciadas
      if (!this.deprecatedVersions.has(subject)) {
        this.deprecatedVersions.set(subject, new Set())
      }
      
      this.deprecatedVersions.get(subject).add(version)
      
      // Atualizar registro da versão
      const versionRecord = await this.getVersion(subject, version)
      if (versionRecord) {
        versionRecord.deprecated = {
          at: new Date().toISOString(),
          reason,
          by: 'system' // TODO: implementar autenticação
        }
        
        await this.updateVersionRecord(subject, versionRecord)
      }
      
      // Persistir
      await this.persistDeprecatedVersions()
      
      // Emitir evento
      this.emit('version.deprecated', { subject, version, reason })
      
      // Atualizar métricas
      this.metrics?.incrementCounter('versions_deprecated', { subject })
      
      this.logger.info('Versão depreciada com sucesso:', { subject, version })
      
    } catch (error) {
      this.logger.error('Erro ao depreciar versão:', error)
      throw error
    }
  }

  async compareVersions(version1, version2) {
    try {
      if (this.config.strategy === 'semantic') {
        return semver.compare(version1, version2)
      } else {
        const v1 = parseInt(version1)
        const v2 = parseInt(version2)
        return v1 - v2
      }
    } catch (error) {
      this.logger.error('Erro ao comparar versões:', error)
      return 0
    }
  }

  isValidVersion(version) {
    if (this.config.strategy === 'semantic') {
      return semver.valid(version) !== null
    } else {
      return /^\d+$/.test(version)
    }
  }

  async versionExists(subject, version) {
    try {
      const history = this.versionHistory.get(subject)
      if (!history) {
        return false
      }
      
      return history.versions.some(v => v.version === version)
    } catch (error) {
      this.logger.error('Erro ao verificar existência da versão:', error)
      return false
    }
  }

  async storeVersion(subject, versionRecord) {
    try {
      if (!this.versionHistory.has(subject)) {
        this.versionHistory.set(subject, {
          subject,
          versions: [],
          createdAt: new Date().toISOString()
        })
      }
      
      const history = this.versionHistory.get(subject)
      history.versions.push(versionRecord)
      history.updatedAt = new Date().toISOString()
      
      // Persistir
      await this.persistVersionHistory()
      
    } catch (error) {
      this.logger.error('Erro ao armazenar versão:', error)
      throw error
    }
  }

  async updateVersionRecord(subject, versionRecord) {
    try {
      const history = this.versionHistory.get(subject)
      if (!history) {
        throw new Error(`Histórico não encontrado para subject: ${subject}`)
      }
      
      const index = history.versions.findIndex(v => v.version === versionRecord.version)
      if (index === -1) {
        throw new Error(`Versão não encontrada: ${versionRecord.version}`)
      }
      
      history.versions[index] = versionRecord
      history.updatedAt = new Date().toISOString()
      
      await this.persistVersionHistory()
      
    } catch (error) {
      this.logger.error('Erro ao atualizar registro de versão:', error)
      throw error
    }
  }

  async updateVersionTags(subject, version, tags) {
    try {
      if (!this.versionTags.has(subject)) {
        this.versionTags.set(subject, {})
      }
      
      const subjectTags = this.versionTags.get(subject)
      
      // Atualizar tag 'latest' automaticamente
      subjectTags.latest = version
      
      // Adicionar tags customizadas
      for (const tag of tags) {
        subjectTags[tag] = version
      }
      
      await this.persistVersionTags()
      
    } catch (error) {
      this.logger.error('Erro ao atualizar tags de versão:', error)
      throw error
    }
  }

  async generateChangesSummary(subject, schemaData) {
    try {
      // Implementar análise de mudanças entre versões
      const previousVersion = await this.getLatestVersion(subject)
      if (!previousVersion) {
        return 'Primeira versão do esquema'
      }
      
      // TODO: Implementar comparação detalhada de esquemas
      return 'Mudanças detectadas no esquema'
    } catch (error) {
      this.logger.error('Erro ao gerar resumo de mudanças:', error)
      return 'Erro ao analisar mudanças'
    }
  }

  async assessCompatibility(subject, schemaData) {
    try {
      // Implementar avaliação de compatibilidade
      // TODO: Integrar com CompatibilityService
      return {
        backward: true,
        forward: true,
        full: true
      }
    } catch (error) {
      this.logger.error('Erro ao avaliar compatibilidade:', error)
      return {
        backward: false,
        forward: false,
        full: false
      }
    }
  }

  async persistVersionHistory() {
    try {
      await this.cache.set(
        'version_history',
        JSON.stringify([...this.versionHistory.entries()]),
        this.config.retention || 86400 * 30 // 30 dias
      )
    } catch (error) {
      this.logger.error('Erro ao persistir histórico de versões:', error)
    }
  }

  async persistVersionTags() {
    try {
      await this.cache.set(
        'version_tags',
        JSON.stringify([...this.versionTags.entries()]),
        this.config.retention || 86400 * 30
      )
    } catch (error) {
      this.logger.error('Erro ao persistir tags de versão:', error)
    }
  }

  async persistDeprecatedVersions() {
    try {
      const serializable = [...this.deprecatedVersions.entries()].map(([key, set]) => [
        key,
        [...set]
      ])
      
      await this.cache.set(
        'deprecated_versions',
        JSON.stringify(serializable),
        this.config.retention || 86400 * 30
      )
    } catch (error) {
      this.logger.error('Erro ao persistir versões depreciadas:', error)
    }
  }

  async handleSchemaRegistered(data) {
    try {
      await this.createVersion(data.subject, data, {
        changeType: 'minor',
        description: 'Novo esquema registrado'
      })
    } catch (error) {
      this.logger.error('Erro ao processar registro de esquema:', error)
    }
  }

  async handleSchemaUpdated(data) {
    try {
      await this.createVersion(data.subject, data, {
        changeType: 'patch',
        description: 'Esquema atualizado'
      })
    } catch (error) {
      this.logger.error('Erro ao processar atualização de esquema:', error)
    }
  }

  async handleSchemaDeleted(data) {
    try {
      if (data.version) {
        // Depreciar versão específica
        await this.deprecateVersion(data.subject, data.version, 'Esquema deletado')
      } else {
        // Depreciar todas as versões
        const versions = await this.getVersions(data.subject)
        for (const version of versions.versions) {
          await this.deprecateVersion(data.subject, version.version, 'Subject deletado')
        }
      }
    } catch (error) {
      this.logger.error('Erro ao processar deleção de esquema:', error)
    }
  }

  async getVersionStats() {
    try {
      const stats = {
        totalSubjects: this.versionHistory.size,
        totalVersions: 0,
        totalDeprecated: 0,
        versionsByChangeType: {
          major: 0,
          minor: 0,
          patch: 0
        },
        breakingChanges: 0
      }
      
      for (const [subject, history] of this.versionHistory.entries()) {
        stats.totalVersions += history.versions.length
        
        for (const version of history.versions) {
          if (version.changeType) {
            stats.versionsByChangeType[version.changeType]++
          }
          if (version.breaking) {
            stats.breakingChanges++
          }
        }
        
        const deprecated = this.deprecatedVersions.get(subject)
        if (deprecated) {
          stats.totalDeprecated += deprecated.size
        }
      }
      
      return stats
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas de versão:', error)
      throw error
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Version Service...')
      
      // Persistir estado final
      await this.persistVersionHistory()
      await this.persistVersionTags()
      await this.persistDeprecatedVersions()
      
      this.isInitialized = false
      this.logger.info('Version Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Version Service:', error)
      throw error
    }
  }
}

module.exports = VersionService