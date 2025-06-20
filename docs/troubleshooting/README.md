# Guia de Troubleshooting

## Visão Geral

Este guia fornece soluções para problemas comuns no sistema de agentes autônomos, incluindo diagnósticos, correções e procedimentos de recuperação.

## Problemas Comuns

### 1. Problemas de Conectividade

#### SQS Connection Issues

**Sintomas:**
- Agentes não recebem mensagens
- Erro: "Unable to connect to SQS"
- Timeout em operações SQS

**Diagnóstico:**
```bash
# Testar conectividade SQS
npm run test:sqs

# Verificar configuração AWS
aws sts get-caller-identity

# Verificar filas SQS
aws sqs list-queues --region us-east-1
```

**Soluções:**

1. **Verificar Credenciais AWS:**
```bash
# Verificar variáveis de ambiente
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
echo $AWS_REGION

# Reconfigurar credenciais se necessário
aws configure
```

2. **Verificar Permissões IAM:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ListQueues"
      ],
      "Resource": "arn:aws:sqs:*:*:agents-*"
    }
  ]
}
```

3. **Verificar Network/Firewall:**
```bash
# Testar conectividade com endpoint SQS
curl -I https://sqs.us-east-1.amazonaws.com

# Verificar DNS
nslookup sqs.us-east-1.amazonaws.com
```

4. **Recrear Filas SQS:**
```bash
# Executar setup AWS
npm run setup:aws-production

# Verificar criação das filas
aws sqs list-queues --queue-name-prefix agents-
```

#### Redis Connection Issues

**Sintomas:**
- Erro: "Redis connection failed"
- Cache não funciona
- Sessões perdidas

**Diagnóstico:**
```bash
# Testar conectividade Redis
redis-cli ping

# Verificar status do Redis
redis-cli info server

# Verificar configuração
redis-cli config get '*'
```

**Soluções:**

1. **Verificar Serviço Redis:**
```bash
# Windows (se usando Redis local)
net start redis

# Docker
docker ps | grep redis
docker start redis-container

# Verificar logs
docker logs redis-container
```

2. **Verificar Configuração:**
```javascript
// src/config/redis.js
module.exports = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
};
```

3. **Reiniciar Conexão:**
```bash
# Reiniciar aplicação
npm run restart

# Limpar cache Redis
redis-cli flushall
```

### 2. Problemas de Performance

#### High Memory Usage

**Sintomas:**
- Uso de memória > 85%
- Aplicação lenta
- Out of Memory errors

**Diagnóstico:**
```bash
# Verificar uso de memória
curl http://localhost:3001/metrics | grep memory

# Verificar processo Node.js
ps aux | grep node

# Análise detalhada de memória
node --inspect app.js
# Abrir Chrome DevTools -> Memory tab
```

**Soluções:**

1. **Otimizar Código:**
```javascript
// Evitar vazamentos de memória
// Limpar listeners
process.removeAllListeners('uncaughtException');

// Limpar timers
clearInterval(intervalId);
clearTimeout(timeoutId);

// Limpar cache periodicamente
setInterval(() => {
  cache.clear();
}, 60000);
```

2. **Configurar Garbage Collection:**
```bash
# Executar com GC otimizado
node --max-old-space-size=4096 --gc-interval=100 app.js

# Forçar garbage collection
node --expose-gc app.js
```

3. **Monitorar Memory Leaks:**
```javascript
// src/monitoring/memoryMonitor.js
setInterval(() => {
  const usage = process.memoryUsage();
  console.log({
    rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
    external: Math.round(usage.external / 1024 / 1024) + ' MB'
  });
}, 30000);
```

#### High CPU Usage

**Sintomas:**
- CPU > 80%
- Aplicação não responsiva
- Timeouts frequentes

**Diagnóstico:**
```bash
# Verificar CPU usage
top -p $(pgrep node)

# Profiling com Node.js
node --prof app.js
# Gerar relatório
node --prof-process isolate-*.log > profile.txt

# Verificar métricas
curl http://localhost:3001/metrics | grep cpu
```

**Soluções:**

1. **Otimizar Algoritmos:**
```javascript
// Evitar loops síncronos longos
// Usar async/await para operações I/O
async function processLargeArray(items) {
  for (const item of items) {
    await processItem(item);
    // Permitir que event loop processe outras tarefas
    await new Promise(resolve => setImmediate(resolve));
  }
}
```

2. **Implementar Rate Limiting:**
```javascript
// Limitar processamento concorrente
const pLimit = require('p-limit');
const limit = pLimit(5);

const promises = items.map(item => 
  limit(() => processItem(item))
);
```

3. **Worker Threads para CPU-intensive tasks:**
```javascript
// src/workers/cpuIntensive.js
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (isMainThread) {
  const worker = new Worker(__filename);
  worker.postMessage({ data: heavyComputationData });
  worker.on('message', (result) => {
    console.log('Result:', result);
  });
} else {
  parentPort.on('message', ({ data }) => {
    const result = performHeavyComputation(data);
    parentPort.postMessage(result);
  });
}
```

### 3. Problemas de Agentes

#### Agent Not Starting

**Sintomas:**
- Agente não aparece em health check
- Erro na inicialização
- Process exits immediately

**Diagnóstico:**
```bash
# Verificar logs do agente
tail -f logs/agents/interface-agent.log

# Verificar status dos agentes
curl http://localhost:3001/health | jq '.checks[] | select(.name | contains("agent"))'

# Verificar processos
ps aux | grep "interface-agent"
```

**Soluções:**

1. **Verificar Configuração:**
```javascript
// Verificar arquivo de configuração
const config = require('./src/config/agents.js');
console.log('Agent config:', JSON.stringify(config, null, 2));
```

2. **Verificar Dependências:**
```bash
# Verificar se todas as dependências estão instaladas
npm list --depth=0

# Reinstalar dependências se necessário
npm ci
```

3. **Inicialização Manual:**
```bash
# Iniciar agente manualmente para debug
node src/agents/core/interface-agent/index.js

# Com debug verbose
DEBUG=* node src/agents/core/interface-agent/index.js
```

4. **Verificar Handlers:**
```bash
# Verificar se handlers estão implementados
npm run implement:handlers

# Verificar estrutura de handlers
find src/agents -name "handlers" -type d
```

#### Agent Crashes

**Sintomas:**
- Agente para de responder
- Uncaught exceptions
- Memory leaks

**Diagnóstico:**
```bash
# Verificar crash logs
grep -i "error\|crash\|exception" logs/agents/*.log

# Verificar core dumps
ls -la core.*

# Verificar system logs
journalctl -u agents-system
```

**Soluções:**

1. **Implementar Error Handling:**
```javascript
// src/agents/core/interface-agent/index.js
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log error
  logger.error('Uncaught exception', { error: error.stack });
  // Graceful shutdown
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled rejection', { reason, promise });
});
```

2. **Implementar Health Checks:**
```javascript
// src/agents/shared/healthCheck.js
class AgentHealthCheck {
  constructor(agentName) {
    this.agentName = agentName;
    this.lastHeartbeat = Date.now();
    this.isHealthy = true;
  }

  heartbeat() {
    this.lastHeartbeat = Date.now();
    this.isHealthy = true;
  }

  checkHealth() {
    const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
    const maxInterval = 60000; // 1 minute
    
    if (timeSinceLastHeartbeat > maxInterval) {
      this.isHealthy = false;
      return {
        status: 'unhealthy',
        reason: 'No heartbeat for ' + timeSinceLastHeartbeat + 'ms'
      };
    }
    
    return { status: 'healthy' };
  }
}
```

3. **Implementar Auto-restart:**
```javascript
// src/monitoring/processManager.js
const { spawn } = require('child_process');

class ProcessManager {
  constructor() {
    this.processes = new Map();
  }

  startAgent(agentName, scriptPath) {
    const process = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AGENT_NAME: agentName }
    });

    process.on('exit', (code) => {
      console.log(`Agent ${agentName} exited with code ${code}`);
      if (code !== 0) {
        console.log(`Restarting agent ${agentName}...`);
        setTimeout(() => this.startAgent(agentName, scriptPath), 5000);
      }
    });

    this.processes.set(agentName, process);
  }
}
```

### 4. Problemas de API

#### API Timeouts

**Sintomas:**
- Requests demoram mais que 30s
- Gateway timeout (504)
- Client timeout errors

**Diagnóstico:**
```bash
# Testar response time
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/v1/interface/request

# Verificar métricas de latência
curl http://localhost:3001/metrics | grep duration

# Verificar logs de performance
grep "slow" logs/api.log
```

**Soluções:**

1. **Otimizar Database Queries:**
```javascript
// Adicionar índices
db.collection.createIndex({ "field": 1 });

// Usar agregação eficiente
db.collection.aggregate([
  { $match: { status: "active" } },
  { $limit: 100 }
]);

// Implementar cache
const cache = new Map();
const getCachedData = async (key) => {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const data = await fetchFromDatabase(key);
  cache.set(key, data);
  return data;
};
```

2. **Implementar Timeouts:**
```javascript
// src/middleware/timeout.js
const timeout = (ms) => {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      res.status(408).json({ error: 'Request timeout' });
    }, ms);
    
    res.on('finish', () => clearTimeout(timer));
    next();
  };
};

// Usar middleware
app.use('/api', timeout(30000)); // 30 seconds
```

3. **Implementar Circuit Breaker:**
```javascript
// src/utils/circuitBreaker.js
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}
```

#### Rate Limiting Issues

**Sintomas:**
- HTTP 429 (Too Many Requests)
- Clients bloqueados
- Legitimate requests rejected

**Diagnóstico:**
```bash
# Verificar rate limit status
curl -I http://localhost:3000/api/v1/interface/request
# Verificar headers: X-RateLimit-*

# Verificar Redis para rate limit data
redis-cli keys "rl:*"
redis-cli get "rl:api:127.0.0.1"
```

**Soluções:**

1. **Ajustar Limites:**
```javascript
// src/config/rateLimit.js
module.exports = {
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Aumentar limite
    skipSuccessfulRequests: false
  },
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10, // Mais tentativas para auth
    skipSuccessfulRequests: true
  }
};
```

2. **Implementar Whitelist:**
```javascript
// src/middleware/rateLimitWhitelist.js
const whitelist = ['127.0.0.1', '::1', '10.0.0.0/8'];

const rateLimitWithWhitelist = rateLimit({
  ...rateLimitConfig,
  skip: (req) => {
    return whitelist.some(ip => {
      if (ip.includes('/')) {
        // CIDR notation
        return ipRangeCheck(req.ip, ip);
      }
      return req.ip === ip;
    });
  }
});
```

3. **Rate Limit por Usuário:**
```javascript
// Rate limit baseado em usuário autenticado
const userRateLimit = rateLimit({
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  max: (req) => {
    // Diferentes limites por role
    const userRole = req.user?.role;
    switch (userRole) {
      case 'admin': return 10000;
      case 'premium': return 1000;
      case 'basic': return 100;
      default: return 50;
    }
  }
});
```

### 5. Problemas de Deployment

#### Docker Issues

**Sintomas:**
- Container não inicia
- Build failures
- Port binding errors

**Diagnóstico:**
```bash
# Verificar containers
docker ps -a

# Verificar logs
docker logs container-name

# Verificar imagem
docker images | grep agents

# Verificar recursos
docker system df
```

**Soluções:**

1. **Verificar Dockerfile:**
```dockerfile
# Dockerfile
FROM node:18-alpine

# Adicionar debugging
RUN echo "Building agents system..."

# Verificar dependências
COPY package*.json ./
RUN npm ci --only=production

# Verificar permissões
USER node
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/app.js"]
```

2. **Verificar Docker Compose:**
```yaml
# docker-compose.yml
version: '3.8'
services:
  agents-system:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    depends_on:
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

3. **Debugging Container:**
```bash
# Executar container interativamente
docker run -it --rm agents-system /bin/sh

# Verificar arquivos no container
docker exec -it container-name ls -la

# Verificar variáveis de ambiente
docker exec -it container-name env

# Verificar logs em tempo real
docker logs -f container-name
```

#### Environment Issues

**Sintomas:**
- Configuração incorreta
- Missing environment variables
- Wrong environment detected

**Diagnóstico:**
```bash
# Verificar variáveis de ambiente
env | grep -E "NODE_ENV|AWS_|REDIS_|SQS_"

# Verificar arquivo .env
cat .env

# Verificar configuração carregada
node -e "console.log(require('./src/config'));"
```

**Soluções:**

1. **Validar Environment Variables:**
```javascript
// src/config/validation.js
const requiredEnvVars = [
  'NODE_ENV',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'REDIS_HOST'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}
```

2. **Environment-specific Configuration:**
```javascript
// src/config/index.js
const env = process.env.NODE_ENV || 'development';

const configs = {
  development: require('./development'),
  staging: require('./staging'),
  production: require('./production')
};

module.exports = configs[env];
```

3. **Configuration Validation:**
```javascript
// src/config/validator.js
const Joi = require('joi');

const configSchema = Joi.object({
  nodeEnv: Joi.string().valid('development', 'staging', 'production').required(),
  port: Joi.number().port().default(3000),
  aws: Joi.object({
    region: Joi.string().required(),
    accessKeyId: Joi.string().required(),
    secretAccessKey: Joi.string().required()
  }).required(),
  redis: Joi.object({
    host: Joi.string().required(),
    port: Joi.number().port().default(6379)
  }).required()
});

const { error, value } = configSchema.validate(config);
if (error) {
  throw new Error(`Configuration validation failed: ${error.message}`);
}
```

## Ferramentas de Diagnóstico

### 1. Health Check Script

```bash
#!/bin/bash
# scripts/health-check.sh

echo "=== System Health Check ==="

# Verificar serviços principais
echo "Checking main services..."
curl -s http://localhost:3000/health | jq '.status' || echo "❌ Main API not responding"
curl -s http://localhost:3001/health | jq '.status' || echo "❌ Monitoring API not responding"

# Verificar SQS
echo "Checking SQS connectivity..."
npm run test:sqs > /dev/null 2>&1 && echo "✅ SQS OK" || echo "❌ SQS Failed"

# Verificar Redis
echo "Checking Redis connectivity..."
redis-cli ping > /dev/null 2>&1 && echo "✅ Redis OK" || echo "❌ Redis Failed"

# Verificar agentes
echo "Checking agents..."
for agent in interface-agent planning-agent execution-agent; do
  if pgrep -f "$agent" > /dev/null; then
    echo "✅ $agent running"
  else
    echo "❌ $agent not running"
  fi
done

# Verificar uso de recursos
echo "Checking resource usage..."
echo "Memory: $(free -h | awk '/^Mem:/ {print $3"/"$2}')"
echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Disk: $(df -h / | awk 'NR==2 {print $5}')"

echo "=== Health Check Complete ==="
```

### 2. Log Analyzer

```javascript
// scripts/analyze-logs.js
const fs = require('fs');
const path = require('path');

class LogAnalyzer {
  constructor(logDir = './logs') {
    this.logDir = logDir;
  }

  analyzeLogs(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const results = {
      errors: [],
      warnings: [],
      performance: [],
      summary: {}
    };

    const logFiles = fs.readdirSync(this.logDir)
      .filter(file => file.endsWith('.log'))
      .map(file => path.join(this.logDir, file));

    for (const logFile of logFiles) {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const logEntry = JSON.parse(line);
          const logTime = new Date(logEntry.timestamp);

          if (logTime < since) continue;

          if (logEntry.level === 'error') {
            results.errors.push(logEntry);
          } else if (logEntry.level === 'warn') {
            results.warnings.push(logEntry);
          }

          if (logEntry.duration && logEntry.duration > 5000) {
            results.performance.push(logEntry);
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }

    results.summary = {
      totalErrors: results.errors.length,
      totalWarnings: results.warnings.length,
      slowRequests: results.performance.length,
      period: `${hours} hours`
    };

    return results;
  }

  generateReport() {
    const analysis = this.analyzeLogs();
    
    console.log('=== Log Analysis Report ===');
    console.log(`Period: ${analysis.summary.period}`);
    console.log(`Errors: ${analysis.summary.totalErrors}`);
    console.log(`Warnings: ${analysis.summary.totalWarnings}`);
    console.log(`Slow Requests: ${analysis.summary.slowRequests}`);
    
    if (analysis.errors.length > 0) {
      console.log('\n=== Recent Errors ===');
      analysis.errors.slice(-5).forEach(error => {
        console.log(`${error.timestamp}: ${error.message}`);
      });
    }
    
    if (analysis.performance.length > 0) {
      console.log('\n=== Slow Requests ===');
      analysis.performance.slice(-5).forEach(req => {
        console.log(`${req.timestamp}: ${req.url} (${req.duration}ms)`);
      });
    }
  }
}

// Executar análise
if (require.main === module) {
  const analyzer = new LogAnalyzer();
  analyzer.generateReport();
}

module.exports = LogAnalyzer;
```

### 3. Performance Monitor

```javascript
// scripts/performance-monitor.js
const os = require('os');
const fs = require('fs');

class PerformanceMonitor {
  constructor() {
    this.metrics = [];
    this.interval = null;
  }

  start(intervalMs = 30000) {
    this.interval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
    
    console.log('Performance monitoring started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('Performance monitoring stopped');
  }

  collectMetrics() {
    const metric = {
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      system: {
        loadAvg: os.loadavg(),
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
        uptime: os.uptime()
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid
      }
    };

    this.metrics.push(metric);
    
    // Manter apenas últimas 100 métricas
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }

    this.checkThresholds(metric);
  }

  checkThresholds(metric) {
    const memoryUsagePercent = (metric.memory.heapUsed / metric.memory.heapTotal) * 100;
    const systemMemoryPercent = ((metric.system.totalMem - metric.system.freeMem) / metric.system.totalMem) * 100;
    
    if (memoryUsagePercent > 85) {
      console.warn(`⚠️  High heap memory usage: ${memoryUsagePercent.toFixed(2)}%`);
    }
    
    if (systemMemoryPercent > 90) {
      console.warn(`⚠️  High system memory usage: ${systemMemoryPercent.toFixed(2)}%`);
    }
    
    if (metric.system.loadAvg[0] > os.cpus().length) {
      console.warn(`⚠️  High CPU load: ${metric.system.loadAvg[0].toFixed(2)}`);
    }
  }

  generateReport() {
    if (this.metrics.length === 0) {
      console.log('No metrics collected yet');
      return;
    }

    const latest = this.metrics[this.metrics.length - 1];
    const memoryUsagePercent = (latest.memory.heapUsed / latest.memory.heapTotal) * 100;
    const systemMemoryPercent = ((latest.system.totalMem - latest.system.freeMem) / latest.system.totalMem) * 100;

    console.log('=== Performance Report ===');
    console.log(`Timestamp: ${latest.timestamp}`);
    console.log(`Process Uptime: ${Math.floor(latest.process.uptime / 60)} minutes`);
    console.log(`Heap Memory: ${(latest.memory.heapUsed / 1024 / 1024).toFixed(2)} MB (${memoryUsagePercent.toFixed(2)}%)`);
    console.log(`System Memory: ${systemMemoryPercent.toFixed(2)}% used`);
    console.log(`CPU Load: ${latest.system.loadAvg[0].toFixed(2)}`);
    console.log(`Metrics Collected: ${this.metrics.length}`);
  }

  saveReport(filename) {
    const report = {
      generatedAt: new Date().toISOString(),
      metrics: this.metrics
    };
    
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`Performance report saved to ${filename}`);
  }
}

// Executar monitor
if (require.main === module) {
  const monitor = new PerformanceMonitor();
  
  monitor.start(10000); // Coletar a cada 10 segundos
  
  // Gerar relatório a cada 5 minutos
  setInterval(() => {
    monitor.generateReport();
  }, 5 * 60 * 1000);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    monitor.stop();
    monitor.saveReport(`performance-report-${Date.now()}.json`);
    process.exit(0);
  });
}

module.exports = PerformanceMonitor;
```

## Procedimentos de Recuperação

### 1. System Recovery

```bash
#!/bin/bash
# scripts/system-recovery.sh

echo "=== System Recovery Procedure ==="

# 1. Parar todos os serviços
echo "Stopping all services..."
npm run stop:all

# 2. Verificar e limpar recursos
echo "Cleaning up resources..."
# Limpar cache Redis
redis-cli flushall

# Limpar logs antigos
find logs/ -name "*.log" -mtime +7 -delete

# Limpar temp files
rm -rf tmp/*

# 3. Verificar dependências
echo "Checking dependencies..."
npm audit fix

# 4. Verificar configuração
echo "Validating configuration..."
node scripts/validate-config.js

# 5. Testar conectividade
echo "Testing connectivity..."
npm run test:sqs
npm run test:redis

# 6. Reiniciar serviços
echo "Restarting services..."
npm run start:all

# 7. Verificar health
echo "Checking system health..."
sleep 30
npm run health:check

echo "=== Recovery Complete ==="
```

### 2. Database Recovery

```javascript
// scripts/database-recovery.js
const fs = require('fs');
const path = require('path');

class DatabaseRecovery {
  constructor() {
    this.backupDir = './backups';
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupDir, `backup-${timestamp}.json`);
    
    try {
      // Backup configuration
      const config = require('../src/config');
      const agentsData = await this.exportAgentsData();
      const systemState = await this.exportSystemState();
      
      const backup = {
        timestamp,
        config,
        agentsData,
        systemState
      };
      
      fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
      console.log(`Backup created: ${backupFile}`);
      
      return backupFile;
    } catch (error) {
      console.error('Backup failed:', error);
      throw error;
    }
  }

  async restoreFromBackup(backupFile) {
    try {
      const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      
      console.log(`Restoring from backup: ${backup.timestamp}`);
      
      // Restore agents data
      await this.restoreAgentsData(backup.agentsData);
      
      // Restore system state
      await this.restoreSystemState(backup.systemState);
      
      console.log('Restore completed successfully');
    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  }

  async exportAgentsData() {
    // Export agents configuration and state
    return {
      configurations: {},
      states: {},
      metrics: {}
    };
  }

  async exportSystemState() {
    // Export system state
    return {
      queues: {},
      cache: {},
      sessions: {}
    };
  }

  async restoreAgentsData(data) {
    // Restore agents data
    console.log('Restoring agents data...');
  }

  async restoreSystemState(data) {
    // Restore system state
    console.log('Restoring system state...');
  }

  listBackups() {
    const backups = fs.readdirSync(this.backupDir)
      .filter(file => file.startsWith('backup-') && file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);
        return {
          file,
          path: filePath,
          size: stats.size,
          created: stats.mtime
        };
      })
      .sort((a, b) => b.created - a.created);
    
    return backups;
  }
}

// CLI interface
if (require.main === module) {
  const recovery = new DatabaseRecovery();
  const command = process.argv[2];
  
  switch (command) {
    case 'backup':
      recovery.createBackup();
      break;
    case 'restore':
      const backupFile = process.argv[3];
      if (!backupFile) {
        console.error('Please specify backup file');
        process.exit(1);
      }
      recovery.restoreFromBackup(backupFile);
      break;
    case 'list':
      const backups = recovery.listBackups();
      console.log('Available backups:');
      backups.forEach(backup => {
        console.log(`  ${backup.file} (${backup.size} bytes, ${backup.created})`);
      });
      break;
    default:
      console.log('Usage: node database-recovery.js [backup|restore|list] [backup-file]');
  }
}

module.exports = DatabaseRecovery;
```

## Comandos Úteis

### Diagnóstico Rápido

```bash
# Status geral do sistema
npm run health:check

# Verificar logs de erro
grep -i error logs/*.log | tail -20

# Verificar uso de recursos
top -p $(pgrep -d',' node)

# Verificar conectividade
npm run test:system

# Análise de performance
node scripts/performance-monitor.js
```

### Limpeza e Manutenção

```bash
# Limpar logs antigos
find logs/ -name "*.log" -mtime +7 -delete

# Limpar cache
redis-cli flushall

# Limpar node_modules e reinstalar
rm -rf node_modules package-lock.json
npm install

# Verificar e corrigir dependências
npm audit fix
```

### Backup e Restore

```bash
# Criar backup
node scripts/database-recovery.js backup

# Listar backups
node scripts/database-recovery.js list

# Restaurar backup
node scripts/database-recovery.js restore backup-2024-01-15T10-30-00-000Z.json
```

## Contatos de Suporte

### Escalation Matrix

| Severidade | Tempo de Resposta | Contato |
|------------|-------------------|----------|
| Critical | 15 minutos | On-call Engineer |
| High | 1 hora | Development Team |
| Medium | 4 horas | Support Team |
| Low | 24 horas | Help Desk |

### Emergency Procedures

1. **Sistema Completamente Down:**
   - Execute `scripts/system-recovery.sh`
   - Contate on-call engineer
   - Documente incidente

2. **Performance Crítica:**
   - Execute `scripts/performance-monitor.js`
   - Identifique gargalos
   - Implemente mitigações temporárias

3. **Security Incident:**
   - Isole sistema afetado
   - Preserve evidências
   - Contate security team
   - Execute incident response plan

---

**Recursos Adicionais:**
- [Monitoramento](../monitoring/README.md)
- [Segurança](../security/README.md)
- [Deployment](../deployment/README.md)
- [Arquitetura](../architecture/README.md)