/**
 * Process Manager Service
 * Serviço para gerenciamento de processos dos agentes
 */

const { spawn, exec } = require('child_process')
const EventEmitter = require('events')
const path = require('path')
const fs = require('fs').promises
const config = require('../config/lifecycleConfig')

class ProcessManagerService extends EventEmitter {
  constructor(logger) {
    super()
    this.logger = logger
    this.processes = new Map()
    this.isInitialized = false
    this.processMonitorInterval = null
  }

  async initialize() {
    try {
      this.logger.info('Inicializando Process Manager Service...')
      
      // Iniciar monitoramento de processos
      this.startProcessMonitoring()
      
      this.isInitialized = true
      this.logger.info('Process Manager Service inicializado com sucesso')
      
    } catch (error) {
      this.logger.error('Erro ao inicializar Process Manager Service:', error)
      throw error
    }
  }

  startProcessMonitoring() {
    this.processMonitorInterval = setInterval(() => {
      this.checkProcesses()
    }, config.monitoring.processCheckInterval || 30000) // 30 segundos
  }

  async checkProcesses() {
    for (const [agentId, processInfo] of this.processes) {
      try {
        const isAlive = await this.isProcessAlive(processInfo.pid)
        
        if (!isAlive && processInfo.state !== 'stopped') {
          this.logger.warn(`Processo do agente ${agentId} (PID: ${processInfo.pid}) não está mais rodando`)
          
          // Atualizar estado do processo
          processInfo.state = 'stopped'
          processInfo.stoppedAt = new Date().toISOString()
          processInfo.exitCode = -1
          
          // Emitir evento de processo parado
          this.emit('processStopped', {
            agentId,
            processId: processInfo.pid,
            exitCode: -1,
            unexpected: true
          })
          
          // Remover da lista de processos ativos
          this.processes.delete(agentId)
        }
      } catch (error) {
        this.logger.error(`Erro ao verificar processo do agente ${agentId}:`, error)
      }
    }
  }

  async isProcessAlive(pid) {
    try {
      // No Windows, usar tasklist
      if (process.platform === 'win32') {
        return new Promise((resolve) => {
          exec(`tasklist /FI "PID eq ${pid}"`, (error, stdout) => {
            if (error) {
              resolve(false)
            } else {
              resolve(stdout.includes(pid.toString()))
            }
          })
        })
      } else {
        // No Unix/Linux, usar kill -0
        return new Promise((resolve) => {
          exec(`kill -0 ${pid}`, (error) => {
            resolve(!error)
          })
        })
      }
    } catch (error) {
      return false
    }
  }

  async startProcess(agentId, options = {}) {
    try {
      this.logger.info(`Iniciando processo para agente: ${agentId}`)
      
      if (this.processes.has(agentId)) {
        const existingProcess = this.processes.get(agentId)
        if (existingProcess.state === 'running') {
          throw new Error(`Processo para agente ${agentId} já está rodando (PID: ${existingProcess.pid})`)
        }
      }

      const {
        command,
        args = [],
        workingDirectory = process.cwd(),
        env = {},
        timeout = 300000, // 5 minutos
        stdio = ['pipe', 'pipe', 'pipe']
      } = options

      if (!command) {
        throw new Error('Comando é obrigatório para iniciar processo')
      }

      // Preparar ambiente
      const processEnv = {
        ...process.env,
        ...env,
        AGENT_ID: agentId,
        NODE_ENV: process.env.NODE_ENV || 'development'
      }

      // Resolver caminho do comando
      const resolvedCommand = await this.resolveCommand(command, workingDirectory)
      
      // Criar diretório de logs se não existir
      const logDir = path.join(workingDirectory, 'logs')
      await this.ensureDirectory(logDir)
      
      // Arquivos de log
      const logFile = path.join(logDir, `${agentId}.log`)
      const errorFile = path.join(logDir, `${agentId}.error.log`)

      this.logger.debug(`Executando comando: ${resolvedCommand} ${args.join(' ')}`)
      this.logger.debug(`Diretório de trabalho: ${workingDirectory}`)

      // Spawn do processo
      const childProcess = spawn(resolvedCommand, args, {
        cwd: workingDirectory,
        env: processEnv,
        stdio,
        detached: false,
        windowsHide: true
      })

      if (!childProcess.pid) {
        throw new Error('Falha ao obter PID do processo')
      }

      // Informações do processo
      const processInfo = {
        pid: childProcess.pid,
        agentId,
        command: resolvedCommand,
        args,
        workingDirectory,
        state: 'starting',
        startedAt: new Date().toISOString(),
        logFile,
        errorFile,
        restartCount: 0,
        process: childProcess
      }

      // Configurar handlers de eventos
      this.setupProcessHandlers(agentId, childProcess, processInfo)

      // Configurar redirecionamento de logs
      await this.setupLogging(childProcess, logFile, errorFile)

      // Armazenar processo
      this.processes.set(agentId, processInfo)

      // Configurar timeout se especificado
      if (timeout > 0) {
        setTimeout(() => {
          if (processInfo.state === 'starting') {
            this.logger.warn(`Timeout ao iniciar processo do agente ${agentId}`)
            this.killProcess(agentId, 'SIGTERM')
          }
        }, timeout)
      }

      this.logger.info(`Processo iniciado para agente ${agentId} (PID: ${childProcess.pid})`)
      
      // Emitir evento de processo iniciado
      this.emit('processStarted', {
        agentId,
        processId: childProcess.pid,
        command: resolvedCommand,
        args
      })

      return {
        pid: childProcess.pid,
        agentId,
        startedAt: processInfo.startedAt
      }

    } catch (error) {
      this.logger.error(`Erro ao iniciar processo para agente ${agentId}:`, error)
      
      // Emitir evento de falha
      this.emit('processFailed', {
        agentId,
        processId: null,
        error
      })
      
      throw error
    }
  }

  setupProcessHandlers(agentId, childProcess, processInfo) {
    // Handler para quando o processo está pronto
    childProcess.on('spawn', () => {
      processInfo.state = 'running'
      this.logger.debug(`Processo do agente ${agentId} está rodando (PID: ${childProcess.pid})`)
    })

    // Handler para quando o processo termina
    childProcess.on('exit', (code, signal) => {
      processInfo.state = 'stopped'
      processInfo.stoppedAt = new Date().toISOString()
      processInfo.exitCode = code
      processInfo.signal = signal

      this.logger.info(`Processo do agente ${agentId} terminou (PID: ${childProcess.pid}, Exit Code: ${code}, Signal: ${signal})`)
      
      // Emitir evento de processo parado
      this.emit('processStopped', {
        agentId,
        processId: childProcess.pid,
        exitCode: code,
        signal,
        unexpected: code !== 0 && !signal
      })

      // Remover da lista de processos ativos
      this.processes.delete(agentId)
    })

    // Handler para erros do processo
    childProcess.on('error', (error) => {
      processInfo.state = 'failed'
      processInfo.error = error.message
      processInfo.failedAt = new Date().toISOString()

      this.logger.error(`Erro no processo do agente ${agentId} (PID: ${childProcess.pid}):`, error)
      
      // Emitir evento de falha
      this.emit('processFailed', {
        agentId,
        processId: childProcess.pid,
        error
      })
    })

    // Handler para disconnect (se aplicável)
    childProcess.on('disconnect', () => {
      this.logger.debug(`Processo do agente ${agentId} desconectado`)
    })
  }

  async setupLogging(childProcess, logFile, errorFile) {
    try {
      const fs = require('fs')
      
      // Stream para log normal
      const logStream = fs.createWriteStream(logFile, { flags: 'a' })
      
      // Stream para log de erro
      const errorStream = fs.createWriteStream(errorFile, { flags: 'a' })
      
      // Redirecionar stdout para log
      if (childProcess.stdout) {
        childProcess.stdout.pipe(logStream)
        childProcess.stdout.on('data', (data) => {
          this.logger.debug(`[${childProcess.pid}] STDOUT: ${data.toString().trim()}`)
        })
      }
      
      // Redirecionar stderr para error log
      if (childProcess.stderr) {
        childProcess.stderr.pipe(errorStream)
        childProcess.stderr.on('data', (data) => {
          this.logger.debug(`[${childProcess.pid}] STDERR: ${data.toString().trim()}`)
        })
      }
      
      // Cleanup ao terminar processo
      childProcess.on('exit', () => {
        logStream.end()
        errorStream.end()
      })
      
    } catch (error) {
      this.logger.warn('Erro ao configurar logging do processo:', error)
    }
  }

  async stopProcess(agentId, force = false) {
    try {
      this.logger.info(`Parando processo do agente: ${agentId} (force: ${force})`)
      
      const processInfo = this.processes.get(agentId)
      if (!processInfo) {
        throw new Error(`Processo para agente ${agentId} não encontrado`)
      }

      if (processInfo.state === 'stopped') {
        this.logger.warn(`Processo do agente ${agentId} já está parado`)
        return { success: true, message: 'Processo já está parado' }
      }

      const { process: childProcess, pid } = processInfo
      
      // Atualizar estado
      processInfo.state = 'stopping'
      processInfo.stoppingAt = new Date().toISOString()

      // Tentar parada graceful primeiro
      if (!force) {
        this.logger.debug(`Enviando SIGTERM para processo ${pid}`)
        childProcess.kill('SIGTERM')
        
        // Aguardar um tempo para parada graceful
        const gracefulTimeout = 10000 // 10 segundos
        const stopped = await this.waitForProcessStop(agentId, gracefulTimeout)
        
        if (stopped) {
          this.logger.info(`Processo do agente ${agentId} parado gracefully`)
          return { success: true, message: 'Processo parado gracefully' }
        }
        
        this.logger.warn(`Processo do agente ${agentId} não parou gracefully, forçando...`)
      }

      // Forçar parada
      this.logger.debug(`Enviando SIGKILL para processo ${pid}`)
      childProcess.kill('SIGKILL')
      
      // Aguardar confirmação de parada
      const stopped = await this.waitForProcessStop(agentId, 5000)
      
      if (!stopped) {
        throw new Error(`Falha ao parar processo do agente ${agentId} (PID: ${pid})`)
      }

      this.logger.info(`Processo do agente ${agentId} parado com sucesso`)
      return { success: true, message: 'Processo parado com sucesso' }

    } catch (error) {
      this.logger.error(`Erro ao parar processo do agente ${agentId}:`, error)
      throw error
    }
  }

  async waitForProcessStop(agentId, timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now()
      
      const checkInterval = setInterval(() => {
        const processInfo = this.processes.get(agentId)
        
        if (!processInfo || processInfo.state === 'stopped') {
          clearInterval(checkInterval)
          resolve(true)
          return
        }
        
        if (Date.now() - startTime >= timeout) {
          clearInterval(checkInterval)
          resolve(false)
        }
      }, 500)
    })
  }

  async killProcess(agentId, signal = 'SIGTERM') {
    try {
      const processInfo = this.processes.get(agentId)
      if (!processInfo) {
        throw new Error(`Processo para agente ${agentId} não encontrado`)
      }

      const { process: childProcess, pid } = processInfo
      
      this.logger.info(`Enviando sinal ${signal} para processo ${pid} (agente: ${agentId})`)
      childProcess.kill(signal)
      
      return { success: true, signal, pid }
      
    } catch (error) {
      this.logger.error(`Erro ao enviar sinal para processo do agente ${agentId}:`, error)
      throw error
    }
  }

  async restartProcess(agentId, options = {}) {
    try {
      this.logger.info(`Reiniciando processo do agente: ${agentId}`)
      
      const processInfo = this.processes.get(agentId)
      if (!processInfo) {
        throw new Error(`Processo para agente ${agentId} não encontrado`)
      }

      // Incrementar contador de restart
      processInfo.restartCount = (processInfo.restartCount || 0) + 1
      
      // Parar processo atual
      if (processInfo.state === 'running') {
        await this.stopProcess(agentId, options.force)
      }
      
      // Aguardar delay se especificado
      if (options.delay) {
        this.logger.debug(`Aguardando ${options.delay}ms antes de reiniciar`)
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
      
      // Iniciar processo novamente
      const startOptions = {
        command: processInfo.command,
        args: processInfo.args,
        workingDirectory: processInfo.workingDirectory,
        ...options
      }
      
      const result = await this.startProcess(agentId, startOptions)
      
      this.logger.info(`Processo do agente ${agentId} reiniciado (restart #${processInfo.restartCount})`)
      
      // Emitir evento de restart
      this.emit('processRestarted', {
        agentId,
        processId: result.pid,
        restartCount: processInfo.restartCount
      })
      
      return {
        ...result,
        restartCount: processInfo.restartCount
      }
      
    } catch (error) {
      this.logger.error(`Erro ao reiniciar processo do agente ${agentId}:`, error)
      throw error
    }
  }

  async getProcessInfo(agentId) {
    const processInfo = this.processes.get(agentId)
    if (!processInfo) {
      return null
    }

    // Retornar cópia sem referência ao processo
    const { process, ...info } = processInfo
    return {
      ...info,
      isAlive: await this.isProcessAlive(info.pid)
    }
  }

  async getAllProcesses() {
    const processes = []
    
    for (const [agentId, processInfo] of this.processes) {
      const { process, ...info } = processInfo
      processes.push({
        ...info,
        isAlive: await this.isProcessAlive(info.pid)
      })
    }
    
    return processes
  }

  async getProcessStatistics() {
    const processes = await this.getAllProcesses()
    
    const stats = {
      total: processes.length,
      running: 0,
      stopped: 0,
      failed: 0,
      totalRestarts: 0,
      averageUptime: 0
    }
    
    let totalUptime = 0
    let runningProcesses = 0
    
    processes.forEach(proc => {
      stats[proc.state] = (stats[proc.state] || 0) + 1
      stats.totalRestarts += proc.restartCount || 0
      
      if (proc.state === 'running' && proc.startedAt) {
        const uptime = Date.now() - new Date(proc.startedAt).getTime()
        totalUptime += uptime
        runningProcesses++
      }
    })
    
    if (runningProcesses > 0) {
      stats.averageUptime = Math.round(totalUptime / runningProcesses)
    }
    
    return stats
  }

  async resolveCommand(command, workingDirectory) {
    try {
      // Se for um caminho absoluto, usar diretamente
      if (path.isAbsolute(command)) {
        return command
      }
      
      // Se for um comando do sistema (node, npm, etc.), usar diretamente
      const systemCommands = ['node', 'npm', 'yarn', 'python', 'java']
      if (systemCommands.includes(command)) {
        return command
      }
      
      // Tentar resolver relativamente ao diretório de trabalho
      const relativePath = path.resolve(workingDirectory, command)
      
      try {
        await fs.access(relativePath)
        return relativePath
      } catch {
        // Se não encontrar, usar comando original
        return command
      }
      
    } catch (error) {
      this.logger.warn(`Erro ao resolver comando ${command}:`, error)
      return command
    }
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }
    }
  }

  async cleanupProcesses() {
    this.logger.info('Limpando processos órfãos...')
    
    const cleaned = []
    
    for (const [agentId, processInfo] of this.processes) {
      try {
        const isAlive = await this.isProcessAlive(processInfo.pid)
        
        if (!isAlive) {
          this.logger.info(`Removendo processo órfão: ${agentId} (PID: ${processInfo.pid})`)
          this.processes.delete(agentId)
          cleaned.push(agentId)
        }
      } catch (error) {
        this.logger.error(`Erro ao verificar processo ${agentId}:`, error)
      }
    }
    
    this.logger.info(`${cleaned.length} processos órfãos removidos`)
    return cleaned
  }

  async shutdown() {
    try {
      this.logger.info('Finalizando Process Manager Service...')
      
      // Parar monitoramento
      if (this.processMonitorInterval) {
        clearInterval(this.processMonitorInterval)
        this.processMonitorInterval = null
      }
      
      // Parar todos os processos
      const stopPromises = []
      for (const agentId of this.processes.keys()) {
        stopPromises.push(
          this.stopProcess(agentId, true).catch(error => {
            this.logger.error(`Erro ao parar processo ${agentId} durante shutdown:`, error)
          })
        )
      }
      
      await Promise.all(stopPromises)
      
      this.isInitialized = false
      this.logger.info('Process Manager Service finalizado')
      
    } catch (error) {
      this.logger.error('Erro ao finalizar Process Manager Service:', error)
      throw error
    }
  }
}

module.exports = ProcessManagerService