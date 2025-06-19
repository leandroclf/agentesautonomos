/**
 * Degradation Service - Implementa estratégias de degradação graceful
 * Gerencia níveis de funcionalidade baseado na saúde do sistema
 */

const EventEmitter = require('events');

class DegradationService extends EventEmitter {
  constructor(config, logger, metrics) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    
    this.isRunning = false;
    
    // Níveis de degradação
    this.LEVELS = {
      NORMAL: 'normal',      // Funcionalidade completa
      REDUCED: 'reduced',    // Funcionalidade reduzida
      MINIMAL: 'minimal'     // Funcionalidade mínima
    };
    
    // Estado atual
    this.currentLevel = this.LEVELS.NORMAL;
    this.previousLevel = this.LEVELS.NORMAL;
    this.levelHistory = [];
    
    // Monitoramento
    this.monitoringInterval = null;
    this.healthChecks = new Map();
    
    // Estatísticas
    this.stats = {
      levelChanges: 0,
      timeInNormal: 0,
      timeInReduced: 0,
      timeInMinimal: 0,
      lastLevelChange: null,
      currentLevelStartTime: Date.now()
    };
    
    // Configurações de degradação por funcionalidade
    this.featureConfigs = new Map();
    
    // Cache de decisões de degradação
    this.degradationCache = new Map();
  }
  
  async initialize() {
    try {
      this.logger.info('Inicializando Degradation Service...');
      
      // Inicializar configurações de funcionalidades
      this.initializeFeatureConfigs();
      
      // Inicializar health checks
      this.initializeHealthChecks();
      
      // Iniciar monitoramento
      this.startMonitoring();
      
      // Atualizar métrica inicial
      this.updateLevelMetric();
      
      this.isRunning = true;
      this.logger.info('Degradation Service inicializado com sucesso');
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Degradation Service:', error);
      throw error;
    }
  }
  
  initializeFeatureConfigs() {
    const features = this.config.fallback.degradation.features || {};
    
    // Configurações padrão para funcionalidades
    const defaultFeatures = {
      'data_processing': {
        normal: { enabled: true, complexity: 'full', timeout: 30000 },
        reduced: { enabled: true, complexity: 'simplified', timeout: 15000 },
        minimal: { enabled: true, complexity: 'basic', timeout: 5000 }
      },
      'external_apis': {
        normal: { enabled: true, retries: 3, timeout: 10000 },
        reduced: { enabled: true, retries: 1, timeout: 5000 },
        minimal: { enabled: false, retries: 0, timeout: 0 }
      },
      'caching': {
        normal: { enabled: true, ttl: 3600, maxSize: 1000 },
        reduced: { enabled: true, ttl: 1800, maxSize: 500 },
        minimal: { enabled: true, ttl: 300, maxSize: 100 }
      },
      'logging': {
        normal: { level: 'debug', detailed: true },
        reduced: { level: 'info', detailed: false },
        minimal: { level: 'error', detailed: false }
      }
    };
    
    // Mesclar configurações customizadas com padrões
    const mergedFeatures = { ...defaultFeatures, ...features };
    
    for (const [featureName, config] of Object.entries(mergedFeatures)) {
      this.featureConfigs.set(featureName, config);
      this.logger.debug(`Configuração de funcionalidade carregada: ${featureName}`);
    }
  }
  
  initializeHealthChecks() {
    // Health checks para determinar nível de degradação
    this.healthChecks.set('cpu_usage', {
      check: () => this.checkCpuUsage(),
      threshold: {
        normal: 70,   // < 70% CPU
        reduced: 85,  // 70-85% CPU
        minimal: 95   // 85-95% CPU
      },
      weight: 0.3
    });
    
    this.healthChecks.set('memory_usage', {
      check: () => this.checkMemoryUsage(),
      threshold: {
        normal: 70,   // < 70% Memory
        reduced: 85,  // 70-85% Memory
        minimal: 95   // 85-95% Memory
      },
      weight: 0.3
    });
    
    this.healthChecks.set('error_rate', {
      check: () => this.checkErrorRate(),
      threshold: {
        normal: 5,    // < 5% errors
        reduced: 15,  // 5-15% errors
        minimal: 30   // 15-30% errors
      },
      weight: 0.2
    });
    
    this.healthChecks.set('response_time', {
      check: () => this.checkResponseTime(),
      threshold: {
        normal: 1000,   // < 1s
        reduced: 3000,  // 1-3s
        minimal: 5000   // 3-5s
      },
      weight: 0.2
    });
    
    this.logger.info(`${this.healthChecks.size} health checks inicializados`);
  }
  
  startMonitoring() {
    const interval = this.config.fallback.degradation.monitoringInterval || 10000;
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.evaluateSystemHealth();
      } catch (error) {
        this.logger.error('Erro na avaliação de saúde do sistema:', error);
      }
    }, interval);
    
    this.logger.info(`Monitoramento de degradação iniciado (intervalo: ${interval}ms)`);
  }
  
  async evaluateSystemHealth() {
    const healthScores = new Map();
    let totalWeight = 0;
    
    // Executar todos os health checks
    for (const [checkName, checkConfig] of this.healthChecks.entries()) {
      try {
        const value = await checkConfig.check();
        const score = this.calculateHealthScore(value, checkConfig.threshold);
        
        healthScores.set(checkName, {
          value,
          score,
          weight: checkConfig.weight
        });
        
        totalWeight += checkConfig.weight;
        
        this.logger.debug(`Health check ${checkName}:`, {
          value,
          score,
          weight: checkConfig.weight
        });
        
      } catch (error) {
        this.logger.warn(`Erro no health check ${checkName}:`, error);
        // Assumir score baixo em caso de erro
        healthScores.set(checkName, {
          value: null,
          score: 0,
          weight: checkConfig.weight
        });
        totalWeight += checkConfig.weight;
      }
    }
    
    // Calcular score geral ponderado
    let weightedScore = 0;
    for (const [, data] of healthScores.entries()) {
      weightedScore += data.score * data.weight;
    }
    
    const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    
    // Determinar nível apropriado
    const recommendedLevel = this.determineLevel(overallScore);
    
    this.logger.debug('Avaliação de saúde do sistema:', {
      overallScore,
      currentLevel: this.currentLevel,
      recommendedLevel,
      healthScores: Object.fromEntries(healthScores)
    });
    
    // Aplicar mudança de nível se necessário
    if (recommendedLevel !== this.currentLevel) {
      await this.setLevel(recommendedLevel, 'automatic', {
        overallScore,
        healthScores: Object.fromEntries(healthScores)
      });
    }
  }
  
  calculateHealthScore(value, thresholds) {
    if (value === null || value === undefined) {
      return 0;
    }
    
    // Score de 0-100 baseado nos thresholds
    if (value <= thresholds.normal) {
      return 100; // Excelente
    } else if (value <= thresholds.reduced) {
      // Linear entre normal e reduced
      const range = thresholds.reduced - thresholds.normal;
      const position = value - thresholds.normal;
      return Math.max(0, 100 - (position / range) * 50);
    } else if (value <= thresholds.minimal) {
      // Linear entre reduced e minimal
      const range = thresholds.minimal - thresholds.reduced;
      const position = value - thresholds.reduced;
      return Math.max(0, 50 - (position / range) * 50);
    } else {
      return 0; // Crítico
    }
  }
  
  determineLevel(overallScore) {
    const thresholds = this.config.fallback.degradation.levelThresholds || {
      normal: 80,   // Score >= 80
      reduced: 50,  // Score 50-79
      minimal: 0    // Score < 50
    };
    
    if (overallScore >= thresholds.normal) {
      return this.LEVELS.NORMAL;
    } else if (overallScore >= thresholds.reduced) {
      return this.LEVELS.REDUCED;
    } else {
      return this.LEVELS.MINIMAL;
    }
  }
  
  async setLevel(level, trigger = 'manual', context = {}) {
    if (!Object.values(this.LEVELS).includes(level)) {
      throw new Error(`Nível de degradação inválido: ${level}`);
    }
    
    if (level === this.currentLevel) {
      this.logger.debug(`Nível já está em: ${level}`);
      return;
    }
    
    const previousLevel = this.currentLevel;
    const now = Date.now();
    
    // Atualizar estatísticas de tempo no nível anterior
    this.updateLevelTimeStats(previousLevel, now - this.stats.currentLevelStartTime);
    
    // Aplicar mudança
    this.previousLevel = this.currentLevel;
    this.currentLevel = level;
    this.stats.currentLevelStartTime = now;
    this.stats.levelChanges++;
    this.stats.lastLevelChange = new Date().toISOString();
    
    // Adicionar ao histórico
    this.levelHistory.push({
      from: previousLevel,
      to: level,
      timestamp: new Date().toISOString(),
      trigger,
      context
    });
    
    // Manter apenas últimas 100 mudanças
    if (this.levelHistory.length > 100) {
      this.levelHistory = this.levelHistory.slice(-100);
    }
    
    // Atualizar métrica
    this.updateLevelMetric();
    
    // Limpar cache de decisões
    this.degradationCache.clear();
    
    this.logger.info(`Nível de degradação alterado: ${previousLevel} → ${level}`, {
      trigger,
      context
    });
    
    // Emitir evento
    this.emit('levelChanged', {
      from: previousLevel,
      to: level,
      trigger,
      context
    });
  }
  
  updateLevelTimeStats(level, duration) {
    switch (level) {
      case this.LEVELS.NORMAL:
        this.stats.timeInNormal += duration;
        break;
      case this.LEVELS.REDUCED:
        this.stats.timeInReduced += duration;
        break;
      case this.LEVELS.MINIMAL:
        this.stats.timeInMinimal += duration;
        break;
    }
  }
  
  updateLevelMetric() {
    const levelValue = this.getLevelValue(this.currentLevel);
    this.metrics.degradationLevel.set(levelValue);
  }
  
  getLevelValue(level) {
    switch (level) {
      case this.LEVELS.MINIMAL: return 1;
      case this.LEVELS.REDUCED: return 2;
      case this.LEVELS.NORMAL: return 3;
      default: return 0;
    }
  }
  
  getCurrentLevel() {
    return this.currentLevel;
  }
  
  getFeatureConfig(featureName, level = null) {
    const currentLevel = level || this.currentLevel;
    const cacheKey = `${featureName}_${currentLevel}`;
    
    // Verificar cache
    if (this.degradationCache.has(cacheKey)) {
      return this.degradationCache.get(cacheKey);
    }
    
    const featureConfig = this.featureConfigs.get(featureName);
    if (!featureConfig) {
      this.logger.warn(`Configuração não encontrada para funcionalidade: ${featureName}`);
      return null;
    }
    
    const config = featureConfig[currentLevel];
    if (!config) {
      this.logger.warn(`Configuração não encontrada para nível ${currentLevel} da funcionalidade: ${featureName}`);
      return null;
    }
    
    // Adicionar ao cache
    this.degradationCache.set(cacheKey, config);
    
    return config;
  }
  
  isFeatureEnabled(featureName, level = null) {
    const config = this.getFeatureConfig(featureName, level);
    return config ? config.enabled !== false : true;
  }
  
  getFeatureTimeout(featureName, defaultTimeout = 5000, level = null) {
    const config = this.getFeatureConfig(featureName, level);
    return config && config.timeout !== undefined ? config.timeout : defaultTimeout;
  }
  
  getFeatureRetries(featureName, defaultRetries = 1, level = null) {
    const config = this.getFeatureConfig(featureName, level);
    return config && config.retries !== undefined ? config.retries : defaultRetries;
  }
  
  shouldProcessRequest(complexity = 'normal') {
    switch (this.currentLevel) {
      case this.LEVELS.NORMAL:
        return true;
      case this.LEVELS.REDUCED:
        return complexity !== 'high';
      case this.LEVELS.MINIMAL:
        return complexity === 'low' || complexity === 'basic';
      default:
        return false;
    }
  }
  
  adaptDataProcessing(data, operation = 'default') {
    const config = this.getFeatureConfig('data_processing');
    
    if (!config || !config.enabled) {
      return null;
    }
    
    switch (config.complexity) {
      case 'full':
        return this.processDataFull(data, operation);
      case 'simplified':
        return this.processDataSimplified(data, operation);
      case 'basic':
        return this.processDataBasic(data, operation);
      default:
        return data;
    }
  }
  
  processDataFull(data, operation) {
    // Processamento completo
    return {
      ...data,
      processed: true,
      level: 'full',
      operation,
      timestamp: new Date().toISOString()
    };
  }
  
  processDataSimplified(data, operation) {
    // Processamento simplificado
    const essential = ['id', 'name', 'status', 'timestamp'];
    const simplified = {};
    
    for (const key of essential) {
      if (data[key] !== undefined) {
        simplified[key] = data[key];
      }
    }
    
    return {
      ...simplified,
      processed: true,
      level: 'simplified',
      operation
    };
  }
  
  processDataBasic(data, operation) {
    // Processamento básico
    return {
      id: data.id || 'unknown',
      status: data.status || 'unknown',
      processed: true,
      level: 'basic',
      operation
    };
  }
  
  // Health check implementations
  async checkCpuUsage() {
    const usage = process.cpuUsage();
    // Simular cálculo de CPU (em um ambiente real, usar bibliotecas como 'os-utils')
    return Math.random() * 100;
  }
  
  async checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    return (usedMem / totalMem) * 100;
  }
  
  async checkErrorRate() {
    // Em um ambiente real, calcular baseado em métricas reais
    return Math.random() * 20;
  }
  
  async checkResponseTime() {
    // Em um ambiente real, calcular baseado em métricas reais
    return Math.random() * 3000;
  }
  
  getStats() {
    const now = Date.now();
    const currentLevelDuration = now - this.stats.currentLevelStartTime;
    
    // Calcular tempo total
    const totalTime = this.stats.timeInNormal + 
                     this.stats.timeInReduced + 
                     this.stats.timeInMinimal + 
                     currentLevelDuration;
    
    return {
      ...this.stats,
      currentLevel: this.currentLevel,
      currentLevelDuration,
      totalTime,
      levelDistribution: {
        normal: totalTime > 0 ? (this.stats.timeInNormal + 
          (this.currentLevel === this.LEVELS.NORMAL ? currentLevelDuration : 0)) / totalTime : 0,
        reduced: totalTime > 0 ? (this.stats.timeInReduced + 
          (this.currentLevel === this.LEVELS.REDUCED ? currentLevelDuration : 0)) / totalTime : 0,
        minimal: totalTime > 0 ? (this.stats.timeInMinimal + 
          (this.currentLevel === this.LEVELS.MINIMAL ? currentLevelDuration : 0)) / totalTime : 0
      },
      recentHistory: this.levelHistory.slice(-10)
    };
  }
  
  getHealthStatus() {
    return {
      currentLevel: this.currentLevel,
      previousLevel: this.previousLevel,
      availableFeatures: Array.from(this.featureConfigs.keys()),
      healthChecks: Array.from(this.healthChecks.keys())
    };
  }
  
  isHealthy() {
    return this.isRunning;
  }
  
  getStatus() {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      currentLevel: this.currentLevel,
      stats: this.getStats(),
      health: this.getHealthStatus(),
      cacheSize: this.degradationCache.size
    };
  }
  
  async stop() {
    this.logger.info('Parando Degradation Service...');
    
    this.isRunning = false;
    
    // Parar monitoramento
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Atualizar estatísticas finais
    const now = Date.now();
    this.updateLevelTimeStats(this.currentLevel, now - this.stats.currentLevelStartTime);
    
    this.logger.info('Degradation Service parado');
  }
}

module.exports = DegradationService;