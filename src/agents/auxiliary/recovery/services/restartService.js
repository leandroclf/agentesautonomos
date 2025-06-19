/**
 * Restart Service
 * Serviço responsável por reinicializar agentes com diferentes métodos
 */

const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const config = require('../config/recoveryConfig');

class RestartService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.isRunning = false;
    
    // Estado do serviço
    this.activeRestarts = new Map();
    this.restartHistory = [];
    
    // Estatísticas
    this.stats = {
      totalRestarts: 0,
      successfulRestarts: 0,
      failedRestarts: 0,
      averageRestartTime: 0,
      lastRestartTime: null
    };
    
    // Configurações
    this.methods = config.restart.methods;
    this.verification = config.restart.verification;
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Restart Service already running');
      return;
    }

    this.logger.info('Starting Restart Service');
    this.isRunning = true;
    
    // Verificar métodos disponíveis
    await this.checkAvailableMethods();
    
    this.logger.info('Restart Service started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Restart Service not running');
      return;
    }

    this.logger.info('Stopping Restart Service');
    this.isRunning = false;
    
    // Cancelar restarts ativos
    for (const [restartId, restart] of this.activeRestarts) {
      try {
        await this.cancelRestart(restartId, 'service_shutdown');
      } catch (error) {
        this.logger.error('Error canceling restart during shutdown', {
          restartId,
          error: error.message
        });
      }
    }
    
    this.logger.info('Restart Service stopped');
  }

  isRunning() {
    return this.isRunning;
  }

  async restartAgent(agent, options = {}) {
    try {
      const {
        method = 'auto',
        timeout = 30000,
        verify = true,
        force = false
      } = options;

      const restartId = this.generateRestartId(agent);
      
      // Determinar método de restart
      const selectedMethod = this.selectMethod(method, agent);
      if (!selectedMethod) {
        throw new Error(`No suitable restart method found for agent: ${agent}`);
      }

      // Criar restart
      const restart = {
        id: restartId,
        agent,
        method: selectedMethod,
        status: 'initiated',
        startTime: new Date(),
        timeout,
        verify,
        force,
        attempts: 0,
        maxAttempts: 3
      };

      // Registrar restart
      this.activeRestarts.set(restartId, restart);

      this.logger.info('Agent restart initiated', {
        restartId,
        agent,
        method: selectedMethod
      });

      // Emitir evento
      this.emit('restartInitiated', {
        restartId,
        agent,
        method: selectedMethod,
        timestamp: restart.startTime.toISOString()
      });

      // Executar restart
      const result = await this.executeRestart(restartId);
      
      return result;

    } catch (error) {
      this.logger.error('Error restarting agent', {
        agent,
        error: error.message
      });
      throw error;
    }
  }

  async executeRestart(restartId) {
    const restart = this.activeRestarts.get(restartId);
    if (!restart) {
      throw new Error('Restart not found');
    }

    try {
      restart.status = 'executing';
      restart.attempts++;
      
      const startTime = Date.now();
      
      this.logger.info('Executing restart', {
        restartId,
        agent: restart.agent,
        method: restart.method,
        attempt: restart.attempts
      });

      // Executar método específico
      const result = await this.executeMethod(restart);
      
      const duration = Date.now() - startTime;
      restart.duration = duration;
      restart.status = 'completed';
      restart.endTime = new Date();
      restart.result = result;

      // Verificar se o agente está funcionando (se solicitado)
      if (restart.verify) {
        const verificationResult = await this.verifyRestart(restart);
        restart.verified = verificationResult.success;
        restart.verificationDetails = verificationResult;
        
        if (!verificationResult.success) {
          throw new Error(`Restart verification failed: ${verificationResult.error}`);
        }
      }

      // Atualizar estatísticas
      this.updateStats(restart, true);

      // Mover para histórico
      this.moveToHistory(restart);
      this.activeRestarts.delete(restartId);

      this.logger.info('Agent restart completed successfully', {
        restartId,
        agent: restart.agent,
        method: restart.method,
        duration,
        verified: restart.verified
      });

      // Emitir evento
      this.emit('restartCompleted', {
        restartId,
        agent: restart.agent,
        method: restart.method,
        duration,
        verified: restart.verified,
        timestamp: restart.endTime.toISOString()
      });

      return {
        success: true,
        restartId,
        method: restart.method,
        duration,
        verified: restart.verified
      };

    } catch (error) {
      await this.handleRestartFailure(restartId, error);
      throw error;
    }
  }

  async executeMethod(restart) {
    const { method, agent } = restart;
    
    switch (method) {
      case 'pm2':
        return await this.executePM2Restart(restart);
      
      case 'docker':
        return await this.executeDockerRestart(restart);
      
      case 'systemd':
        return await this.executeSystemdRestart(restart);
      
      case 'kubernetes':
        return await this.executeKubernetesRestart(restart);
      
      default:
        throw new Error(`Unknown restart method: ${method}`);
    }
  }

  async executePM2Restart(restart) {
    const { agent, timeout } = restart;
    
    return new Promise((resolve, reject) => {
      const command = `pm2 restart ${agent}`;
      
      this.logger.info('Executing PM2 restart', { agent, command });
      
      const process = exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) {
          this.logger.error('PM2 restart failed', {
            agent,
            error: error.message,
            stderr
          });
          reject(new Error(`PM2 restart failed: ${error.message}`));
          return;
        }
        
        this.logger.info('PM2 restart completed', {
          agent,
          stdout: stdout.trim()
        });
        
        resolve({
          method: 'pm2',
          command,
          output: stdout.trim(),
          success: true
        });
      });
      
      // Timeout manual
      setTimeout(() => {
        process.kill('SIGKILL');
        reject(new Error('PM2 restart timeout'));
      }, timeout);
    });
  }

  async executeDockerRestart(restart) {
    const { agent, timeout } = restart;
    
    return new Promise((resolve, reject) => {
      const containerName = this.getDockerContainerName(agent);
      const command = `docker restart ${containerName}`;
      
      this.logger.info('Executing Docker restart', { agent, containerName, command });
      
      const process = exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) {
          this.logger.error('Docker restart failed', {
            agent,
            containerName,
            error: error.message,
            stderr
          });
          reject(new Error(`Docker restart failed: ${error.message}`));
          return;
        }
        
        this.logger.info('Docker restart completed', {
          agent,
          containerName,
          stdout: stdout.trim()
        });
        
        resolve({
          method: 'docker',
          command,
          containerName,
          output: stdout.trim(),
          success: true
        });
      });
      
      // Timeout manual
      setTimeout(() => {
        process.kill('SIGKILL');
        reject(new Error('Docker restart timeout'));
      }, timeout);
    });
  }

  async executeSystemdRestart(restart) {
    const { agent, timeout } = restart;
    
    return new Promise((resolve, reject) => {
      const serviceName = this.getSystemdServiceName(agent);
      const command = `systemctl restart ${serviceName}`;
      
      this.logger.info('Executing Systemd restart', { agent, serviceName, command });
      
      const process = exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) {
          this.logger.error('Systemd restart failed', {
            agent,
            serviceName,
            error: error.message,
            stderr
          });
          reject(new Error(`Systemd restart failed: ${error.message}`));
          return;
        }
        
        this.logger.info('Systemd restart completed', {
          agent,
          serviceName,
          stdout: stdout.trim()
        });
        
        resolve({
          method: 'systemd',
          command,
          serviceName,
          output: stdout.trim(),
          success: true
        });
      });
      
      // Timeout manual
      setTimeout(() => {
        process.kill('SIGKILL');
        reject(new Error('Systemd restart timeout'));
      }, timeout);
    });
  }

  async executeKubernetesRestart(restart) {
    const { agent, timeout } = restart;
    
    return new Promise((resolve, reject) => {
      const podName = this.getKubernetesPodName(agent);
      const command = `kubectl delete pod ${podName}`;
      
      this.logger.info('Executing Kubernetes restart', { agent, podName, command });
      
      const process = exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) {
          this.logger.error('Kubernetes restart failed', {
            agent,
            podName,
            error: error.message,
            stderr
          });
          reject(new Error(`Kubernetes restart failed: ${error.message}`));
          return;
        }
        
        this.logger.info('Kubernetes restart completed', {
          agent,
          podName,
          stdout: stdout.trim()
        });
        
        resolve({
          method: 'kubernetes',
          command,
          podName,
          output: stdout.trim(),
          success: true
        });
      });
      
      // Timeout manual
      setTimeout(() => {
        process.kill('SIGKILL');
        reject(new Error('Kubernetes restart timeout'));
      }, timeout);
    });
  }

  async verifyRestart(restart) {
    const { agent } = restart;
    const { timeout, maxAttempts, interval, healthCheckPath } = this.verification;
    
    this.logger.info('Verifying restart', { agent });
    
    const agentPort = this.getAgentPort(agent);
    const healthUrl = `http://localhost:${agentPort}${healthCheckPath}`;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.debug('Health check attempt', { agent, attempt, url: healthUrl });
        
        const response = await axios.get(healthUrl, {
          timeout: timeout / maxAttempts
        });
        
        if (response.status === 200) {
          this.logger.info('Restart verification successful', {
            agent,
            attempt,
            status: response.data
          });
          
          return {
            success: true,
            attempts: attempt,
            status: response.data
          };
        }
        
      } catch (error) {
        this.logger.debug('Health check failed', {
          agent,
          attempt,
          error: error.message
        });
        
        if (attempt < maxAttempts) {
          await this.sleep(interval);
        }
      }
    }
    
    return {
      success: false,
      attempts: maxAttempts,
      error: 'Health check failed after all attempts'
    };
  }

  async handleRestartFailure(restartId, error) {
    const restart = this.activeRestarts.get(restartId);
    if (!restart) return;

    restart.status = 'failed';
    restart.error = error.message;
    restart.endTime = new Date();

    this.logger.error('Restart failed', {
      restartId,
      agent: restart.agent,
      method: restart.method,
      attempt: restart.attempts,
      error: error.message
    });

    // Verificar se deve tentar novamente
    if (restart.attempts < restart.maxAttempts) {
      const delay = 5000 * restart.attempts; // Delay crescente
      
      this.logger.info('Scheduling restart retry', {
        restartId,
        attempt: restart.attempts + 1,
        delay
      });
      
      setTimeout(() => {
        this.executeRestart(restartId);
      }, delay);
      
      return;
    }

    // Falha definitiva
    this.updateStats(restart, false);
    this.moveToHistory(restart);
    this.activeRestarts.delete(restartId);

    // Emitir evento
    this.emit('restartFailed', {
      restartId,
      agent: restart.agent,
      method: restart.method,
      error: error.message,
      attempts: restart.attempts,
      timestamp: restart.endTime.toISOString()
    });
  }

  // Métodos auxiliares
  selectMethod(requestedMethod, agent) {
    if (requestedMethod !== 'auto' && this.methods[requestedMethod]?.enabled) {
      return requestedMethod;
    }

    // Seleção automática baseada no ambiente
    const availableMethods = Object.entries(this.methods)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);

    if (availableMethods.includes('pm2')) {
      return 'pm2';
    }
    
    if (availableMethods.includes('docker')) {
      return 'docker';
    }
    
    if (availableMethods.includes('systemd')) {
      return 'systemd';
    }
    
    if (availableMethods.includes('kubernetes')) {
      return 'kubernetes';
    }

    return null;
  }

  async checkAvailableMethods() {
    const methods = Object.keys(this.methods);
    
    for (const method of methods) {
      try {
        const available = await this.checkMethodAvailability(method);
        this.methods[method].available = available;
        
        this.logger.info('Method availability check', {
          method,
          available,
          enabled: this.methods[method].enabled
        });
        
      } catch (error) {
        this.methods[method].available = false;
        this.logger.warn('Method availability check failed', {
          method,
          error: error.message
        });
      }
    }
  }

  async checkMethodAvailability(method) {
    return new Promise((resolve) => {
      let command;
      
      switch (method) {
        case 'pm2':
          command = 'pm2 --version';
          break;
        case 'docker':
          command = 'docker --version';
          break;
        case 'systemd':
          command = 'systemctl --version';
          break;
        case 'kubernetes':
          command = 'kubectl version --client';
          break;
        default:
          resolve(false);
          return;
      }
      
      exec(command, { timeout: 5000 }, (error) => {
        resolve(!error);
      });
    });
  }

  getDockerContainerName(agent) {
    // Mapear agentes para nomes de containers
    return `agentes-autonomos-${agent}`;
  }

  getSystemdServiceName(agent) {
    // Mapear agentes para nomes de serviços systemd
    return `agentes-autonomos-${agent}.service`;
  }

  getKubernetesPodName(agent) {
    // Mapear agentes para nomes de pods Kubernetes
    return `agentes-autonomos-${agent}`;
  }

  getAgentPort(agent) {
    // Mapear agentes para suas portas
    const portMap = {
      'planning-agent': 3001,
      'execution-agent': 3002,
      'event-agent': 3003,
      'monitoring-agent': 3004,
      'learning-agent': 3005,
      'coordination-agent': 3006,
      'marl-agent': 3007,
      'mediation-agent': 3008,
      'orchestration-agent': 3009,
      'data-collection-agent': 3010,
      'notification-agent': 3011,
      'security-agent': 3012,
      'health-checker-agent': 3013,
      'recovery-agent': 3014
    };
    
    return portMap[agent] || 3000;
  }

  updateStats(restart, success) {
    this.stats.totalRestarts++;
    
    if (success) {
      this.stats.successfulRestarts++;
    } else {
      this.stats.failedRestarts++;
    }
    
    if (restart.duration) {
      const totalTime = this.stats.averageRestartTime * (this.stats.totalRestarts - 1) + restart.duration;
      this.stats.averageRestartTime = totalTime / this.stats.totalRestarts;
    }
    
    this.stats.lastRestartTime = new Date();
  }

  moveToHistory(restart) {
    this.restartHistory.push(restart);
    
    // Manter apenas os últimos 100 registros
    if (this.restartHistory.length > 100) {
      this.restartHistory.splice(0, this.restartHistory.length - 100);
    }
  }

  generateRestartId(agent) {
    const time = Date.now();
    return `restart_${agent}_${time}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async cancelRestart(restartId, reason) {
    const restart = this.activeRestarts.get(restartId);
    if (!restart) {
      throw new Error('Restart not found');
    }

    restart.status = 'cancelled';
    restart.endTime = new Date();
    restart.cancelReason = reason;

    this.activeRestarts.delete(restartId);
    this.moveToHistory(restart);

    this.logger.info('Restart cancelled', {
      restartId,
      agent: restart.agent,
      reason
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getters para status
  getActiveRestarts() {
    return Array.from(this.activeRestarts.values());
  }

  getRestartHistory() {
    return this.restartHistory.slice(-20); // Últimos 20
  }

  getStats() {
    return { ...this.stats };
  }

  getAvailableMethods() {
    return Object.entries(this.methods)
      .filter(([_, config]) => config.enabled && config.available)
      .map(([name, config]) => ({
        name,
        description: config.description,
        timeout: config.timeout
      }));
  }
}

module.exports = RestartService;