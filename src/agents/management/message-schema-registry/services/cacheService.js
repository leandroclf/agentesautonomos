/**
 * Cache Service - Gerenciamento de Cache
 * Responsável por operações de cache em memória e distribuído
 */

const { EventEmitter } = require('events')

class CacheService extends EventEmitter {
  constructor({ config, logger }) {
    super()
    this.config = config
    this.logger = logger
    
    // Cache em memória
    this.memoryCache = new Map()
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      totalOperations: 0
    }
    
    // TTL tracking
    this.ttlTimers = new Map()
    
    // Cache distribuído (Redis, etc.) - placeholder
    this.distributedCache = null
    
    this.isInitialized = false
    this.cleanupInterval = null
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Cache Service...')
      
      // Configurar cache distribuído se habilitado
      if (this.config.cache.distributed.enabled) {
        await this.initializeDistributedCache()
      }
      
      // Iniciar limpeza periódica
      this.startPeriodicCleanup()
      
      this.isInitialized = true
      this.logger.info('Cache Service inicializado com sucesso')
    } catch (error) {
      this.logger.error('Erro ao inicializar Cache Service:', error)
      throw error
    }
  }

  async initializeDistributedCache() {
    try {
      // Placeholder para inicialização do Redis ou outro cache distribuído
      // Em uma implementação real, seria algo como:
      // const Redis = require('ioredis')
      // this.distributedCache = new Redis(this.config.cache.distributed.redis)
      
      this.logger.info('Cache distribuído configurado (placeholder)')
    } catch (error) {
      this.logger.error('Erro ao inicializar cache distribuído:', error)
      throw error
    }
  }

  // Operações básicas de cache
  async get(key, options = {}) {
    try {
      this.cacheStats.totalOperations++
      
      // Tentar cache em memória primeiro
      const memoryResult = this.getFromMemory(key)
      if (memoryResult !== undefined) {
        this.cacheStats.hits++
        this.emit('cache.hit', { key, source: 'memory' })
        return memoryResult
      }
      
      // Tentar cache distribuído se disponível
      if (this.distributedCache && options.useDistributed !== false) {
        const distributedResult = await this.getFromDistributed(key)
        if (distributedResult !== undefined) {
          this.cacheStats.hits++
          
          // Armazenar no cache em memória para acesso mais rápido
          if (options.populateMemory !== false) {
            this.setInMemory(key, distributedResult, options.ttl)
          }
          
          this.emit('cache.hit', { key, source: 'distributed' })
          return distributedResult
        }
      }
      
      this.cacheStats.misses++
      this.emit('cache.miss', { key })
      return undefined
      
    } catch (error) {
      this.logger.error(`Erro ao obter cache para chave ${key}:`, error)
      this.cacheStats.misses++
      return undefined
    }
  }

  async set(key, value, ttl = null, options = {}) {
    try {
      this.cacheStats.totalOperations++
      this.cacheStats.sets++
      
      // Armazenar no cache em memória
      if (options.useMemory !== false) {
        this.setInMemory(key, value, ttl)
      }
      
      // Armazenar no cache distribuído se disponível
      if (this.distributedCache && options.useDistributed !== false) {
        await this.setInDistributed(key, value, ttl)
      }
      
      this.emit('cache.set', { key, ttl })
      return true
      
    } catch (error) {
      this.logger.error(`Erro ao definir cache para chave ${key}:`, error)
      return false
    }
  }

  async delete(key, options = {}) {
    try {
      this.cacheStats.totalOperations++
      this.cacheStats.deletes++
      
      let deleted = false
      
      // Remover do cache em memória
      if (options.useMemory !== false) {
        deleted = this.deleteFromMemory(key) || deleted
      }
      
      // Remover do cache distribuído se disponível
      if (this.distributedCache && options.useDistributed !== false) {
        deleted = await this.deleteFromDistributed(key) || deleted
      }
      
      if (deleted) {
        this.emit('cache.delete', { key })
      }
      
      return deleted
      
    } catch (error) {
      this.logger.error(`Erro ao deletar cache para chave ${key}:`, error)
      return false
    }
  }

  async exists(key, options = {}) {
    try {
      // Verificar cache em memória
      if (options.useMemory !== false && this.memoryCache.has(key)) {
        return true
      }
      
      // Verificar cache distribuído se disponível
      if (this.distributedCache && options.useDistributed !== false) {
        return await this.existsInDistributed(key)
      }
      
      return false
      
    } catch (error) {
      this.logger.error(`Erro ao verificar existência da chave ${key}:`, error)
      return false
    }
  }

  async clear(pattern = null, options = {}) {
    try {
      let cleared = 0
      
      // Limpar cache em memória
      if (options.useMemory !== false) {
        cleared += this.clearMemory(pattern)
      }
      
      // Limpar cache distribuído se disponível
      if (this.distributedCache && options.useDistributed !== false) {
        cleared += await this.clearDistributed(pattern)
      }
      
      this.emit('cache.clear', { pattern, cleared })
      return cleared
      
    } catch (error) {
      this.logger.error('Erro ao limpar cache:', error)
      return 0
    }
  }

  // Operações de cache em memória
  getFromMemory(key) {
    const item = this.memoryCache.get(key)
    if (!item) {
      return undefined
    }
    
    // Verificar se expirou
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.deleteFromMemory(key)
      return undefined
    }
    
    // Atualizar último acesso
    item.lastAccessed = Date.now()
    
    return item.value
  }

  setInMemory(key, value, ttl = null) {
    const now = Date.now()
    const item = {
      value,
      createdAt: now,
      lastAccessed: now,
      expiresAt: ttl ? now + (ttl * 1000) : null
    }
    
    // Verificar limite de tamanho do cache
    if (this.memoryCache.size >= this.config.cache.memory.maxSize) {
      this.evictLRU()
    }
    
    this.memoryCache.set(key, item)
    
    // Configurar timer de TTL se necessário
    if (ttl) {
      this.setTTLTimer(key, ttl * 1000)
    }
    
    return true
  }

  deleteFromMemory(key) {
    const deleted = this.memoryCache.delete(key)
    
    // Limpar timer de TTL
    if (this.ttlTimers.has(key)) {
      clearTimeout(this.ttlTimers.get(key))
      this.ttlTimers.delete(key)
    }
    
    return deleted
  }

  clearMemory(pattern = null) {
    let cleared = 0
    
    if (pattern) {
      const regex = new RegExp(pattern)
      for (const key of this.memoryCache.keys()) {
        if (regex.test(key)) {
          this.deleteFromMemory(key)
          cleared++
        }
      }
    } else {
      cleared = this.memoryCache.size
      this.memoryCache.clear()
      
      // Limpar todos os timers
      for (const timer of this.ttlTimers.values()) {
        clearTimeout(timer)
      }
      this.ttlTimers.clear()
    }
    
    return cleared
  }

  // Operações de cache distribuído (placeholder)
  async getFromDistributed(key) {
    if (!this.distributedCache) {
      return undefined
    }
    
    try {
      // Placeholder para implementação real
      // return await this.distributedCache.get(key)
      return undefined
    } catch (error) {
      this.logger.error(`Erro ao obter do cache distribuído: ${key}`, error)
      return undefined
    }
  }

  async setInDistributed(key, value, ttl = null) {
    if (!this.distributedCache) {
      return false
    }
    
    try {
      // Placeholder para implementação real
      // if (ttl) {
      //   return await this.distributedCache.setex(key, ttl, JSON.stringify(value))
      // } else {
      //   return await this.distributedCache.set(key, JSON.stringify(value))
      // }
      return true
    } catch (error) {
      this.logger.error(`Erro ao definir no cache distribuído: ${key}`, error)
      return false
    }
  }

  async deleteFromDistributed(key) {
    if (!this.distributedCache) {
      return false
    }
    
    try {
      // Placeholder para implementação real
      // return await this.distributedCache.del(key) > 0
      return false
    } catch (error) {
      this.logger.error(`Erro ao deletar do cache distribuído: ${key}`, error)
      return false
    }
  }

  async existsInDistributed(key) {
    if (!this.distributedCache) {
      return false
    }
    
    try {
      // Placeholder para implementação real
      // return await this.distributedCache.exists(key) === 1
      return false
    } catch (error) {
      this.logger.error(`Erro ao verificar existência no cache distribuído: ${key}`, error)
      return false
    }
  }

  async clearDistributed(pattern = null) {
    if (!this.distributedCache) {
      return 0
    }
    
    try {
      // Placeholder para implementação real
      // if (pattern) {
      //   const keys = await this.distributedCache.keys(pattern)
      //   if (keys.length > 0) {
      //     return await this.distributedCache.del(...keys)
      //   }
      //   return 0
      // } else {
      //   return await this.distributedCache.flushdb()
      // }
      return 0
    } catch (error) {
      this.logger.error('Erro ao limpar cache distribuído:', error)
      return 0
    }
  }

  // Gerenciamento de TTL
  setTTLTimer(key, ttlMs) {
    // Limpar timer existente se houver
    if (this.ttlTimers.has(key)) {
      clearTimeout(this.ttlTimers.get(key))
    }
    
    // Configurar novo timer
    const timer = setTimeout(() => {
      this.deleteFromMemory(key)
      this.ttlTimers.delete(key)
      this.emit('cache.expired', { key })
    }, ttlMs)
    
    this.ttlTimers.set(key, timer)
  }

  // Eviction LRU (Least Recently Used)
  evictLRU() {
    let oldestKey = null
    let oldestTime = Date.now()
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      this.deleteFromMemory(oldestKey)
      this.cacheStats.evictions++
      this.emit('cache.evicted', { key: oldestKey, reason: 'lru' })
    }
  }

  // Limpeza periódica de itens expirados
  startPeriodicCleanup() {
    const interval = this.config.cache.cleanupInterval || 300000 // 5 minutos
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredItems()
    }, interval)
    
    this.logger.debug(`Limpeza periódica de cache iniciada (intervalo: ${interval}ms)`)
  }

  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      this.logger.debug('Limpeza periódica de cache parada')
    }
  }

  cleanupExpiredItems() {
    const now = Date.now()
    let cleaned = 0
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.deleteFromMemory(key)
        cleaned++
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Limpeza de cache: ${cleaned} itens expirados removidos`)
      this.emit('cache.cleanup', { cleaned })
    }
  }

  // Operações de cache com namespace
  async getNamespaced(namespace, key, options = {}) {
    const namespacedKey = `${namespace}:${key}`
    return await this.get(namespacedKey, options)
  }

  async setNamespaced(namespace, key, value, ttl = null, options = {}) {
    const namespacedKey = `${namespace}:${key}`
    return await this.set(namespacedKey, value, ttl, options)
  }

  async deleteNamespaced(namespace, key, options = {}) {
    const namespacedKey = `${namespace}:${key}`
    return await this.delete(namespacedKey, options)
  }

  async clearNamespace(namespace, options = {}) {
    const pattern = `${namespace}:*`
    return await this.clear(pattern, options)
  }

  // Operações em lote
  async mget(keys, options = {}) {
    const results = {}
    
    for (const key of keys) {
      results[key] = await this.get(key, options)
    }
    
    return results
  }

  async mset(keyValuePairs, ttl = null, options = {}) {
    const results = {}
    
    for (const [key, value] of Object.entries(keyValuePairs)) {
      results[key] = await this.set(key, value, ttl, options)
    }
    
    return results
  }

  async mdel(keys, options = {}) {
    const results = {}
    
    for (const key of keys) {
      results[key] = await this.delete(key, options)
    }
    
    return results
  }

  // Operações de cache com callback (cache-aside pattern)
  async getOrSet(key, fetchFunction, ttl = null, options = {}) {
    try {
      // Tentar obter do cache
      let value = await this.get(key, options)
      
      if (value === undefined) {
        // Cache miss - executar função de busca
        value = await fetchFunction()
        
        // Armazenar no cache
        if (value !== undefined) {
          await this.set(key, value, ttl, options)
        }
      }
      
      return value
      
    } catch (error) {
      this.logger.error(`Erro em getOrSet para chave ${key}:`, error)
      
      // Em caso de erro, tentar executar a função de busca
      try {
        return await fetchFunction()
      } catch (fetchError) {
        this.logger.error(`Erro na função de busca para chave ${key}:`, fetchError)
        throw fetchError
      }
    }
  }

  // Estatísticas e monitoramento
  getStats() {
    const hitRate = this.cacheStats.totalOperations > 0 
      ? (this.cacheStats.hits / this.cacheStats.totalOperations * 100).toFixed(2)
      : 0
    
    return {
      ...this.cacheStats,
      hitRate: parseFloat(hitRate),
      memoryCache: {
        size: this.memoryCache.size,
        maxSize: this.config.cache.memory.maxSize,
        activeTimers: this.ttlTimers.size
      },
      distributedCache: {
        enabled: !!this.distributedCache,
        connected: !!this.distributedCache // Placeholder
      }
    }
  }

  getMemoryUsage() {
    let totalSize = 0
    
    for (const [key, item] of this.memoryCache.entries()) {
      // Estimativa aproximada do tamanho
      totalSize += JSON.stringify({ key, value: item.value }).length
    }
    
    return {
      entries: this.memoryCache.size,
      estimatedSizeBytes: totalSize,
      timers: this.ttlTimers.size
    }
  }

  // Métodos de diagnóstico
  getKeys(pattern = null) {
    const keys = Array.from(this.memoryCache.keys())
    
    if (pattern) {
      const regex = new RegExp(pattern)
      return keys.filter(key => regex.test(key))
    }
    
    return keys
  }

  inspect(key) {
    const item = this.memoryCache.get(key)
    if (!item) {
      return null
    }
    
    return {
      key,
      value: item.value,
      createdAt: new Date(item.createdAt).toISOString(),
      lastAccessed: new Date(item.lastAccessed).toISOString(),
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString() : null,
      ttl: item.expiresAt ? Math.max(0, item.expiresAt - Date.now()) : null,
      size: JSON.stringify(item.value).length
    }
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Cache Service...')
      
      // Parar limpeza periódica
      this.stopPeriodicCleanup()
      
      // Limpar todos os timers
      for (const timer of this.ttlTimers.values()) {
        clearTimeout(timer)
      }
      this.ttlTimers.clear()
      
      // Limpar cache em memória
      this.memoryCache.clear()
      
      // Fechar conexão com cache distribuído
      if (this.distributedCache) {
        // Placeholder para fechamento da conexão
        // await this.distributedCache.disconnect()
        this.distributedCache = null
      }
      
      this.isInitialized = false
      this.logger.info('Cache Service finalizado')
    } catch (error) {
      this.logger.error('Erro ao finalizar Cache Service:', error)
      throw error
    }
  }
}

module.exports = CacheService