#!/usr/bin/env node

/**
 * Script de monitoramento em tempo real
 * Monitora o status dos agentes, filas SQS e métricas do sistema
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class SystemMonitor {
    constructor() {
        this.agents = [
            { name: 'Interface', port: 3000, status: 'unknown' },
            { name: 'Event', port: 3001, status: 'unknown' },
            { name: 'Planning', port: 3002, status: 'unknown' },
            { name: 'Execution', port: 3003, status: 'unknown' }
        ];
        
        this.services = [
            { name: 'SQS Local', url: 'http://localhost:9324', status: 'unknown' },
            { name: 'Prometheus', url: 'http://localhost:9090', status: 'unknown' },
            { name: 'Grafana', url: 'http://localhost:3100', status: 'unknown' }
        ];
        
        this.metrics = {
            totalRequests: 0,
            errorRate: 0,
            avgResponseTime: 0,
            queueSizes: {},
            lastUpdate: null
        };
        
        this.isRunning = false;
        this.intervalId = null;
        this.logFile = path.join(__dirname, '..', 'logs', 'monitor.log');
        
        // Garantir que o diretório de logs existe
        const logsDir = path.dirname(this.logFile);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    async start(options = {}) {
        const {
            interval = 5000,
            continuous = false,
            output = 'console',
            detailed = false
        } = options;
        
        console.log('🔍 Iniciando monitoramento do sistema...');
        console.log(`📊 Intervalo: ${interval}ms`);
        console.log(`🔄 Contínuo: ${continuous ? 'Sim' : 'Não'}`);
        console.log('=' .repeat(60));
        
        this.isRunning = true;
        
        if (continuous) {
            this.intervalId = setInterval(async () => {
                await this.checkSystem(output, detailed);
            }, interval);
            
            // Configurar handlers para parada graceful
            process.on('SIGINT', () => this.stop());
            process.on('SIGTERM', () => this.stop());
        } else {
            await this.checkSystem(output, detailed);
        }
    }
    
    stop() {
        console.log('\n🛑 Parando monitoramento...');
        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        process.exit(0);
    }
    
    async checkSystem(output = 'console', detailed = false) {
        const timestamp = new Date().toISOString();
        
        try {
            // Verificar agentes
            await this.checkAgents();
            
            // Verificar serviços
            await this.checkServices();
            
            // Coletar métricas
            await this.collectMetrics();
            
            // Verificar filas SQS
            await this.checkQueues();
            
            // Exibir resultados
            if (output === 'console') {
                this.displayConsoleOutput(detailed);
            } else if (output === 'json') {
                this.displayJsonOutput();
            }
            
            // Log para arquivo
            this.logToFile(timestamp);
            
        } catch (error) {
            console.error(`❌ Erro durante monitoramento: ${error.message}`);
            this.logError(timestamp, error);
        }
    }
    
    async checkAgents() {
        const promises = this.agents.map(async (agent) => {
            try {
                const startTime = Date.now();
                const response = await axios.get(`http://localhost:${agent.port}/health`, {
                    timeout: 3000
                });
                const responseTime = Date.now() - startTime;
                
                agent.status = response.status === 200 ? 'healthy' : 'unhealthy';
                agent.responseTime = responseTime;
                agent.lastCheck = new Date().toISOString();
                
                // Tentar obter métricas adicionais
                try {
                    const metricsResponse = await axios.get(`http://localhost:${agent.port}/metrics`, {
                        timeout: 2000
                    });
                    agent.metricsAvailable = true;
                } catch {
                    agent.metricsAvailable = false;
                }
                
            } catch (error) {
                agent.status = 'down';
                agent.responseTime = null;
                agent.lastCheck = new Date().toISOString();
                agent.error = error.code || error.message;
                agent.metricsAvailable = false;
            }
        });
        
        await Promise.all(promises);
    }
    
    async checkServices() {
        const promises = this.services.map(async (service) => {
            try {
                const startTime = Date.now();
                const response = await axios.get(service.url, {
                    timeout: 3000
                });
                const responseTime = Date.now() - startTime;
                
                service.status = response.status === 200 ? 'healthy' : 'unhealthy';
                service.responseTime = responseTime;
                service.lastCheck = new Date().toISOString();
                
            } catch (error) {
                service.status = 'down';
                service.responseTime = null;
                service.lastCheck = new Date().toISOString();
                service.error = error.code || error.message;
            }
        });
        
        await Promise.all(promises);
    }
    
    async collectMetrics() {
        try {
            // Coletar métricas do Prometheus se disponível
            const prometheusService = this.services.find(s => s.name === 'Prometheus');
            if (prometheusService && prometheusService.status === 'healthy') {
                await this.collectPrometheusMetrics();
            }
            
            this.metrics.lastUpdate = new Date().toISOString();
            
        } catch (error) {
            console.error(`⚠️  Erro ao coletar métricas: ${error.message}`);
        }
    }
    
    async collectPrometheusMetrics() {
        try {
            // Exemplo de queries para métricas básicas
            const queries = [
                'up',
                'http_requests_total',
                'http_request_duration_seconds'
            ];
            
            for (const query of queries) {
                try {
                    const response = await axios.get(`http://localhost:9090/api/v1/query`, {
                        params: { query },
                        timeout: 2000
                    });
                    
                    if (response.data && response.data.data && response.data.data.result) {
                        // Processar resultados das métricas
                        this.processMetricResults(query, response.data.data.result);
                    }
                } catch (error) {
                    // Ignorar erros de queries específicas
                }
            }
        } catch (error) {
            throw new Error(`Erro ao consultar Prometheus: ${error.message}`);
        }
    }
    
    processMetricResults(query, results) {
        switch (query) {
            case 'up':
                // Processar status dos serviços
                break;
            case 'http_requests_total':
                // Calcular total de requests
                const total = results.reduce((sum, result) => {
                    return sum + parseFloat(result.value[1] || 0);
                }, 0);
                this.metrics.totalRequests = total;
                break;
            case 'http_request_duration_seconds':
                // Calcular tempo médio de resposta
                break;
        }
    }
    
    async checkQueues() {
        try {
            const sqsService = this.services.find(s => s.name === 'SQS Local');
            if (sqsService && sqsService.status === 'healthy') {
                const response = await axios.get('http://localhost:9324/queue', {
                    timeout: 3000
                });
                
                // Parse da resposta para extrair informações das filas
                const queueInfo = this.parseQueueInfo(response.data);
                this.metrics.queueSizes = queueInfo;
            }
        } catch (error) {
            console.error(`⚠️  Erro ao verificar filas: ${error.message}`);
        }
    }
    
    parseQueueInfo(htmlResponse) {
        // Simples parser para extrair informações das filas do HTML
        const queueSizes = {};
        
        const queues = [
            'interface-events',
            'event-processing', 
            'planning-requests',
            'execution-requests',
            'notifications',
            'status-updates'
        ];
        
        queues.forEach(queue => {
            // Tentar extrair o tamanho da fila do HTML
            const regex = new RegExp(`${queue}.*?(\\d+)`, 'i');
            const match = htmlResponse.match(regex);
            queueSizes[queue] = match ? parseInt(match[1]) : 0;
        });
        
        return queueSizes;
    }
    
    displayConsoleOutput(detailed = false) {
        // Limpar tela
        console.clear();
        
        const timestamp = new Date().toLocaleString('pt-BR');
        console.log(`🔍 Monitor do Sistema - ${timestamp}`);
        console.log('=' .repeat(60));
        
        // Status dos Agentes
        console.log('\n🤖 AGENTES:');
        this.agents.forEach(agent => {
            const statusIcon = this.getStatusIcon(agent.status);
            const responseTime = agent.responseTime ? `${agent.responseTime}ms` : 'N/A';
            const metrics = agent.metricsAvailable ? '📊' : '❌';
            
            console.log(`   ${statusIcon} ${agent.name.padEnd(12)} | ${agent.status.padEnd(10)} | ${responseTime.padEnd(8)} | ${metrics}`);
            
            if (detailed && agent.error) {
                console.log(`      ⚠️  ${agent.error}`);
            }
        });
        
        // Status dos Serviços
        console.log('\n🔧 SERVIÇOS:');
        this.services.forEach(service => {
            const statusIcon = this.getStatusIcon(service.status);
            const responseTime = service.responseTime ? `${service.responseTime}ms` : 'N/A';
            
            console.log(`   ${statusIcon} ${service.name.padEnd(12)} | ${service.status.padEnd(10)} | ${responseTime.padEnd(8)}`);
            
            if (detailed && service.error) {
                console.log(`      ⚠️  ${service.error}`);
            }
        });
        
        // Métricas
        console.log('\n📊 MÉTRICAS:');
        console.log(`   📈 Total de Requests: ${this.metrics.totalRequests}`);
        console.log(`   ⚡ Taxa de Erro: ${this.metrics.errorRate}%`);
        console.log(`   ⏱️  Tempo Médio: ${this.metrics.avgResponseTime}ms`);
        
        // Filas SQS
        if (Object.keys(this.metrics.queueSizes).length > 0) {
            console.log('\n📬 FILAS SQS:');
            Object.entries(this.metrics.queueSizes).forEach(([queue, size]) => {
                const sizeIcon = size > 0 ? '📨' : '📭';
                console.log(`   ${sizeIcon} ${queue.padEnd(20)} | ${size} mensagens`);
            });
        }
        
        // Resumo
        const healthyAgents = this.agents.filter(a => a.status === 'healthy').length;
        const healthyServices = this.services.filter(s => s.status === 'healthy').length;
        
        console.log('\n📋 RESUMO:');
        console.log(`   🤖 Agentes: ${healthyAgents}/${this.agents.length} saudáveis`);
        console.log(`   🔧 Serviços: ${healthyServices}/${this.services.length} saudáveis`);
        
        const overallHealth = (healthyAgents === this.agents.length && healthyServices === this.services.length) 
            ? '🟢 SISTEMA SAUDÁVEL' 
            : '🟡 ATENÇÃO NECESSÁRIA';
        
        console.log(`   🎯 Status Geral: ${overallHealth}`);
        
        if (this.isRunning) {
            console.log('\n⏹️  Pressione Ctrl+C para parar o monitoramento');
        }
    }
    
    displayJsonOutput() {
        const output = {
            timestamp: new Date().toISOString(),
            agents: this.agents,
            services: this.services,
            metrics: this.metrics,
            summary: {
                healthyAgents: this.agents.filter(a => a.status === 'healthy').length,
                totalAgents: this.agents.length,
                healthyServices: this.services.filter(s => s.status === 'healthy').length,
                totalServices: this.services.length
            }
        };
        
        console.log(JSON.stringify(output, null, 2));
    }
    
    getStatusIcon(status) {
        switch (status) {
            case 'healthy': return '🟢';
            case 'unhealthy': return '🟡';
            case 'down': return '🔴';
            default: return '⚪';
        }
    }
    
    logToFile(timestamp) {
        const logEntry = {
            timestamp,
            agents: this.agents.map(a => ({
                name: a.name,
                status: a.status,
                responseTime: a.responseTime
            })),
            services: this.services.map(s => ({
                name: s.name,
                status: s.status,
                responseTime: s.responseTime
            })),
            metrics: this.metrics
        };
        
        try {
            fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
        } catch (error) {
            console.error(`⚠️  Erro ao escrever log: ${error.message}`);
        }
    }
    
    logError(timestamp, error) {
        const errorEntry = {
            timestamp,
            level: 'ERROR',
            message: error.message,
            stack: error.stack
        };
        
        try {
            fs.appendFileSync(this.logFile, JSON.stringify(errorEntry) + '\n');
        } catch (logError) {
            console.error(`⚠️  Erro ao escrever log de erro: ${logError.message}`);
        }
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse argumentos
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--continuous':
            case '-c':
                options.continuous = true;
                break;
            case '--interval':
            case '-i':
                options.interval = parseInt(args[++i]) || 5000;
                break;
            case '--output':
            case '-o':
                options.output = args[++i] || 'console';
                break;
            case '--detailed':
            case '-d':
                options.detailed = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Uso: node monitor.js [opções]

Opções:
  -c, --continuous     Monitoramento contínuo
  -i, --interval <ms>  Intervalo entre verificações (padrão: 5000ms)
  -o, --output <tipo>  Formato de saída: console|json (padrão: console)
  -d, --detailed       Exibir informações detalhadas
  -h, --help           Exibir esta ajuda

Exemplos:
  node monitor.js                    # Verificação única
  node monitor.js -c                 # Monitoramento contínuo
  node monitor.js -c -i 10000        # Contínuo com intervalo de 10s
  node monitor.js -o json            # Saída em JSON
`);
                process.exit(0);
        }
    }
    
    const monitor = new SystemMonitor();
    monitor.start(options).catch(error => {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = SystemMonitor;