# Monitoramento e Observabilidade

## Visão Geral

O sistema de monitoramento fornece observabilidade completa do sistema de agentes autônomos, incluindo métricas de performance, health checks, alertas automáticos e dashboards em tempo real.

## Componentes de Monitoramento

### 1. Sistema de Métricas

#### Métricas Coletadas

**Métricas de Sistema:**
- CPU usage por agente
- Uso de memória (heap, RSS, external)
- Uptime do sistema
- Número de conexões ativas

**Métricas de Aplicação:**
- Throughput de mensagens SQS
- Latência de processamento
- Taxa de erro por agente
- Tempo de resposta de APIs

**Métricas de Negócio:**
- Número de tarefas processadas
- Taxa de sucesso por tipo de operação
- Tempo médio de execução de workflows

#### Configuração de Métricas

```javascript
// src/monitoring/metrics.js
const { metrics } = require('./metrics');

// Counter - incrementa valores
metrics.counter('http_requests_total', {
  method: 'GET',
  status: '200'
});

// Histogram - distribução de valores
metrics.histogram('request_duration_ms', 150, {
  endpoint: '/api/v1/interface/request'
});

// Gauge - valores instantâneos
metrics.gauge('memory_usage_bytes', process.memoryUsage().heapUsed);
```

### 2. Health Checks

#### Health Checks Implementados

**Sistema:**
- Memory usage (< 85%)
- CPU usage (< 80%)
- Disk space (> 10% livre)

**Conectividade:**
- SQS connectivity
- Redis connectivity
- Database connectivity

**Agentes:**
- Status de cada agente
- Tempo de resposta
- Fila de mensagens

#### Configuração de Health Checks

```javascript
// src/monitoring/health.js
const { healthChecks } = require('./health');

// Registrar health check customizado
healthChecks.register('custom_service', async () => {
  try {
    await customService.ping();
    return {
      status: 'healthy',
      details: { responseTime: 50 }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: { error: error.message }
    };
  }
});
```

### 3. Sistema de Alertas

#### Regras de Alerta

**Críticos:**
- Memory usage > 90%
- CPU usage > 90%
- Health check failure
- SQS connection lost

**Warnings:**
- Memory usage > 80%
- CPU usage > 75%
- High error rate (> 5%)
- Slow response time (> 5s)

#### Configuração de Alertas

```javascript
// src/monitoring/alerts.js
const { alerts } = require('./alerts');

// Configurar regra de alerta
alerts.addRule({
  name: 'high_memory_usage',
  condition: 'memory_usage_percent > 85',
  severity: 'warning',
  description: 'Memory usage above 85%',
  actions: ['log', 'webhook']
});
```

## Endpoints de Monitoramento

### Health Check

```http
GET /health
```

**Resposta:**
```json
{
  "status": "healthy",
  "message": "All health checks passing",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": [
    {
      "name": "memory",
      "status": "healthy",
      "duration": 5,
      "details": {
        "heapUsedPercent": 45.2,
        "heapUsed": 123456789,
        "heapTotal": 273456789
      }
    },
    {
      "name": "sqs_connectivity",
      "status": "healthy",
      "duration": 150,
      "details": {
        "region": "us-east-1",
        "queuesAccessible": 8
      }
    }
  ]
}
```

### Métricas

```http
GET /metrics?format=json
```

**Resposta:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "system": {
    "uptime": 3600,
    "memory": {
      "rss": 123456789,
      "heapTotal": 273456789,
      "heapUsed": 123456789,
      "external": 12345678
    },
    "cpu": {
      "user": 1000000,
      "system": 500000
    }
  },
  "application": {
    "http_requests_total": {
      "type": "counter",
      "value": 1250,
      "labels": {
        "method": "GET",
        "status": "200"
      }
    },
    "message_processing_duration": {
      "type": "histogram",
      "count": 500,
      "sum": 75000,
      "avg": 150,
      "p50": 120,
      "p95": 300,
      "p99": 500
    }
  }
}
```

### Métricas Prometheus

```http
GET /metrics?format=prometheus
```

**Resposta:**
```
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1250
http_requests_total{method="POST",status="200"} 850
http_requests_total{method="GET",status="404"} 25

# TYPE message_processing_duration histogram
message_processing_duration_count 500
message_processing_duration_sum 75000
message_processing_duration_bucket{le="100"} 200
message_processing_duration_bucket{le="200"} 400
message_processing_duration_bucket{le="500"} 480
message_processing_duration_bucket{le="+Inf"} 500

# TYPE memory_usage_bytes gauge
memory_usage_bytes 123456789
```

### Alertas

```http
GET /alerts
```

**Resposta:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "count": 2,
  "alerts": [
    {
      "name": "high_memory_usage",
      "severity": "warning",
      "description": "Memory usage above 85%",
      "firstTriggered": "2024-01-15T10:25:00Z",
      "lastTriggered": "2024-01-15T10:29:00Z",
      "count": 5,
      "status": "active",
      "details": {
        "currentValue": 87.5,
        "threshold": 85
      }
    },
    {
      "name": "slow_response_time",
      "severity": "warning",
      "description": "API response time above 3 seconds",
      "firstTriggered": "2024-01-15T10:28:00Z",
      "lastTriggered": "2024-01-15T10:30:00Z",
      "count": 3,
      "status": "active",
      "details": {
        "currentValue": 3.2,
        "threshold": 3.0,
        "endpoint": "/api/v1/execution/execute"
      }
    }
  ]
}
```

## Dashboards

### Dashboard Principal

**Métricas Exibidas:**
- Status geral do sistema
- Throughput de mensagens
- Latência média
- Taxa de erro
- Uso de recursos

### Dashboard por Agente

**Métricas por Agente:**
- Mensagens processadas
- Tempo de processamento
- Taxa de sucesso
- Uso de memória
- Status de health check

### Dashboard de Infraestrutura

**Métricas de Infraestrutura:**
- SQS queue depth
- Redis connections
- Database connections
- Network I/O
- Disk I/O

## Configuração

### Variáveis de Ambiente

```bash
# Monitoramento
MONITORING_ENABLED=true
MONITORING_PORT=3001
MONITORING_INTERVAL=30000

# Métricas
METRICS_ENABLED=true
METRICS_RETENTION_DAYS=30
METRICS_AGGREGATION_INTERVAL=60000

# Alertas
ALERTS_ENABLED=true
ALERTS_WEBHOOK_URL=https://your-webhook.com/alerts
ALERTS_EMAIL_ENABLED=false

# Health Checks
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000
```

### Configuração de Logging

```javascript
// src/config/monitoring.js
module.exports = {
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    port: parseInt(process.env.MONITORING_PORT) || 3001,
    interval: parseInt(process.env.MONITORING_INTERVAL) || 30000,
    
    metrics: {
      enabled: process.env.METRICS_ENABLED === 'true',
      retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS) || 30,
      aggregationInterval: parseInt(process.env.METRICS_AGGREGATION_INTERVAL) || 60000
    },
    
    alerts: {
      enabled: process.env.ALERTS_ENABLED === 'true',
      webhookUrl: process.env.ALERTS_WEBHOOK_URL,
      emailEnabled: process.env.ALERTS_EMAIL_ENABLED === 'true'
    },
    
    healthChecks: {
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000
    }
  }
};
```

## Integração com Ferramentas Externas

### Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'agents-system'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    params:
      format: ['prometheus']
```

### Grafana

```json
{
  "dashboard": {
    "title": "Agents System Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{status}}"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "memory_usage_bytes",
            "legendFormat": "Memory Usage"
          }
        ]
      }
    ]
  }
}
```

### ELK Stack

```yaml
# logstash.conf
input {
  file {
    path => "/app/logs/*.log"
    type => "agents-system"
  }
}

filter {
  if [type] == "agents-system" {
    json {
      source => "message"
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "agents-system-%{+YYYY.MM.dd}"
  }
}
```

## Troubleshooting

### Problemas Comuns

#### 1. Métricas não aparecem

**Sintomas:**
- Endpoint `/metrics` retorna vazio
- Dashboards não mostram dados

**Soluções:**
```bash
# Verificar se monitoramento está habilitado
curl http://localhost:3001/health

# Verificar logs do sistema de monitoramento
tail -f logs/monitoring.log

# Reiniciar sistema de monitoramento
npm run monitor:restart
```

#### 2. Alertas não disparam

**Sintomas:**
- Condições de alerta são atendidas mas alertas não são enviados
- Webhook não recebe notificações

**Soluções:**
```bash
# Verificar configuração de alertas
curl http://localhost:3001/alerts/config

# Testar webhook manualmente
curl -X POST $ALERTS_WEBHOOK_URL -d '{"test": true}'

# Verificar logs de alertas
grep "alert" logs/monitoring.log
```

#### 3. Health checks falham

**Sintomas:**
- `/health` retorna status unhealthy
- Serviços aparecem como down

**Soluções:**
```bash
# Verificar conectividade individual
npm run test:sqs
npm run test:redis
npm run test:database

# Verificar configuração de health checks
curl http://localhost:3001/health?detailed=true

# Aumentar timeout se necessário
export HEALTH_CHECK_TIMEOUT=10000
```

### Comandos Úteis

```bash
# Iniciar monitoramento
npm run monitor:start

# Parar monitoramento
npm run monitor:stop

# Verificar status
npm run monitor:status

# Visualizar métricas
curl http://localhost:3001/metrics?format=json | jq

# Verificar alertas ativos
curl http://localhost:3001/alerts | jq

# Health check detalhado
curl http://localhost:3001/health?detailed=true | jq
```

## Melhores Práticas

### 1. Configuração de Métricas

- **Use labels consistentes** para facilitar agregação
- **Evite cardinalidade alta** em labels
- **Colete métricas relevantes** para o negócio
- **Configure retenção adequada** para evitar uso excessivo de storage

### 2. Alertas

- **Configure thresholds realistas** baseados em dados históricos
- **Evite alert fatigue** com muitos alertas de baixa prioridade
- **Use escalation** para alertas críticos
- **Teste alertas regularmente** para garantir funcionamento

### 3. Health Checks

- **Implemente health checks específicos** para cada dependência
- **Configure timeouts apropriados** para evitar falsos positivos
- **Use health checks para load balancing** e auto-scaling
- **Monitore a própria infraestrutura** de monitoramento

### 4. Performance

- **Otimize coleta de métricas** para minimizar overhead
- **Use sampling** para métricas de alta frequência
- **Configure agregação** para reduzir volume de dados
- **Monitore o próprio sistema** de monitoramento

---

**Próximos Passos**:
1. [Segurança](../security/README.md)
2. [Troubleshooting](../troubleshooting/README.md)
3. [Deployment](../deployment/README.md)