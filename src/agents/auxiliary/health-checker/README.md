# Health Checker Agent

## Visão Geral

O Health Checker Agent é um agente auxiliar responsável por monitorar proativamente a saúde de todos os agentes do sistema, detectar falhas precocemente, coletar métricas vitais e enviar alertas automáticos.

## Funcionalidades Principais

### 🔍 Monitoramento Proativo
- Verificação contínua de saúde de todos os agentes
- Detecção precoce de falhas e degradação de performance
- Monitoramento de métricas vitais (tempo de resposta, disponibilidade, erros)
- Verificação de conectividade e status dos serviços

### 📊 Coleta de Métricas
- Agregação de métricas de saúde em tempo real
- Histórico de performance e disponibilidade
- Detecção de anomalias e padrões
- Relatórios de saúde do sistema

### 🚨 Sistema de Alertas
- Alertas automáticos para falhas críticas
- Notificações de degradação de performance
- Múltiplos canais de alerta (webhook, Slack, email)
- Cooldown para evitar spam de alertas

### 📈 Análise e Relatórios
- Dashboard de status do sistema
- Relatórios de uptime e disponibilidade
- Análise de tendências e padrões
- Métricas de SLA e performance

## Arquitetura

### Componentes Principais

```
Health Checker Agent
├── HealthService          # Verificações de saúde
├── AlertService           # Gerenciamento de alertas
├── MetricsService         # Coleta e análise de métricas
└── API REST              # Interface de consulta
```

### Serviços

#### HealthService
- Executa verificações periódicas de saúde
- Mantém status de todos os agentes monitorados
- Detecta mudanças de estado (healthy → degraded → down)
- Emite eventos para outros serviços

#### AlertService
- Processa eventos de mudança de estado
- Envia alertas através de múltiplos canais
- Gerencia cooldown e histórico de alertas
- Suporte a diferentes tipos de alerta

#### MetricsService
- Coleta métricas de performance
- Armazena histórico temporal
- Detecta anomalias e padrões
- Gera relatórios e estatísticas

## Configuração

### Agentes Monitorados

O agente monitora os seguintes componentes por padrão:

```javascript
monitoredAgents: [
  {
    name: 'interface-agent',
    endpoint: 'http://localhost:3001/health',
    critical: true,
    timeout: 5000
  },
  {
    name: 'event-agent',
    endpoint: 'http://localhost:3002/health',
    critical: true,
    timeout: 5000
  },
  // ... outros agentes
]
```

### Configuração de Alertas

```javascript
alerts: {
  webhook: {
    enabled: true,
    url: process.env.ALERT_WEBHOOK_URL
  },
  slack: {
    enabled: false,
    webhookUrl: process.env.SLACK_WEBHOOK_URL
  },
  email: {
    enabled: false,
    // Configuração SMTP
  }
}
```

### Thresholds e Limites

```javascript
thresholds: {
  responseTime: {
    warning: 2000,    // 2s
    critical: 5000    // 5s
  },
  consecutiveFailures: {
    warning: 2,
    critical: 3
  },
  systemHealth: {
    degraded: 0.8,    // 80%
    critical: 0.6     // 60%
  }
}
```

## API REST

### Endpoints Principais

#### GET /health
Retorna o status de saúde do próprio Health Checker Agent.

```json
{
  "status": "healthy",
  "agent": "health-checker-agent",
  "version": "1.0.0",
  "uptime": 3600,
  "services": {
    "healthService": true,
    "alertService": true,
    "metricsService": true
  }
}
```

#### GET /status
Retorna o status geral do sistema.

```json
{
  "systemStatus": {
    "overall": "healthy",
    "totalAgents": 13,
    "healthyAgents": 12,
    "degradedAgents": 1,
    "downAgents": 0,
    "agents": {
      "interface-agent": {
        "status": "healthy",
        "responseTime": 150,
        "lastCheck": "2024-01-15T10:30:00Z"
      }
    }
  }
}
```

#### GET /metrics
Retorna métricas agregadas do sistema.

```json
{
  "metrics": {
    "system": {
      "overallHealth": 0.92,
      "averageResponseTime": 180,
      "totalRequests": 15420,
      "errorRate": 0.02
    },
    "agents": {
      "interface-agent": {
        "uptime": 99.8,
        "averageResponseTime": 150,
        "requestCount": 2340,
        "errorCount": 2
      }
    }
  }
}
```

#### GET /alerts
Retorna histórico de alertas.

```json
{
  "alerts": [
    {
      "id": "alert-001",
      "type": "agent_down",
      "agentName": "planning-agent",
      "message": "Agent planning-agent is down",
      "timestamp": "2024-01-15T10:25:00Z",
      "severity": "critical"
    }
  ],
  "stats": {
    "total": 15,
    "last24h": 3,
    "byType": {
      "agent_down": 2,
      "agent_degraded": 8,
      "system_overload": 1
    }
  }
}
```

#### POST /check
Força uma verificação imediata de saúde.

```json
{
  "message": "Health check executado com sucesso",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Eventos SQS

O Health Checker Agent publica eventos no SQS para integração com outros sistemas:

### Tipos de Eventos

#### agent_failure
```json
{
  "eventType": "agent_failure",
  "agentId": "health-checker-agent",
  "timestamp": "2024-01-15T10:25:00Z",
  "failedAgent": "planning-agent",
  "critical": true,
  "error": "Connection timeout",
  "consecutiveFailures": 3
}
```

#### alert_sent
```json
{
  "eventType": "alert_sent",
  "agentId": "health-checker-agent",
  "timestamp": "2024-01-15T10:25:00Z",
  "data": {
    "type": "agent_down",
    "agentName": "planning-agent",
    "channels": ["webhook", "slack"]
  }
}
```

#### system_metrics_updated
```json
{
  "eventType": "system_metrics_updated",
  "agentId": "health-checker-agent",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "overallHealth": 0.85,
    "totalAgents": 13,
    "healthyAgents": 11
  }
}
```

## Instalação e Execução

### Dependências

```bash
npm install express axios winston helmet cors express-rate-limit
```

### Desenvolvimento

```bash
# Instalar dependências de desenvolvimento
npm install --save-dev jest nodemon eslint

# Executar testes
npm test

# Executar em modo desenvolvimento
npm run dev
```

### Produção

```bash
# Executar o agente
node index.js

# Ou através do script start-all
node scripts/start-all.js
```

### Variáveis de Ambiente

```bash
# Configuração básica
PORT=3010
AGENT_NAME=health-checker-agent
NODE_ENV=production

# Alertas
ALERT_WEBHOOK_URL=https://your-webhook-url.com/alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# AWS SQS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Monitoramento e Observabilidade

### Métricas Expostas

- `health_checks_total`: Total de verificações realizadas
- `agent_status`: Status atual de cada agente (0=down, 1=degraded, 2=healthy)
- `response_time_seconds`: Tempo de resposta por agente
- `alerts_sent_total`: Total de alertas enviados por tipo
- `system_health_score`: Score de saúde geral do sistema

### Logs

O agente produz logs estruturados em JSON:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "agent": "health-checker-agent",
  "message": "Health check completed",
  "data": {
    "agentName": "interface-agent",
    "status": "healthy",
    "responseTime": 150
  }
}
```

## Integração com Outros Agentes

### Recovery Agent
O Health Checker trabalha em conjunto com o Recovery Agent:
- Detecta falhas e envia eventos
- Recovery Agent recebe eventos e executa ações de recuperação
- Feedback loop para validar recuperação

### Monitoring Agent
Complementa o Monitoring Agent:
- Health Checker: foco em disponibilidade e falhas
- Monitoring Agent: foco em métricas de performance e recursos

### Alert Manager
Integração com sistemas externos:
- Webhook para sistemas de ticketing
- Slack para notificações de equipe
- Email para alertas críticos

## Troubleshooting

### Problemas Comuns

#### Falsos Positivos
- Verificar thresholds de timeout
- Ajustar configuração de rede
- Validar conectividade entre agentes

#### Alertas Não Enviados
- Verificar configuração de webhooks
- Validar credenciais de integração
- Checar logs de erro do AlertService

#### Performance
- Ajustar intervalo de verificações
- Otimizar timeouts
- Configurar paralelização adequada

### Debug

```bash
# Habilitar logs debug
DEBUG=health-checker:* node index.js

# Verificar status via API
curl http://localhost:3010/health
curl http://localhost:3010/status
```

## Roadmap

### Próximas Funcionalidades
- [ ] Dashboard web integrado
- [ ] Métricas customizáveis por agente
- [ ] Integração com Prometheus/Grafana
- [ ] Alertas baseados em ML
- [ ] Auto-scaling baseado em saúde
- [ ] Testes de carga automáticos

### Melhorias Planejadas
- [ ] Cache de métricas para performance
- [ ] Compressão de dados históricos
- [ ] API GraphQL para consultas complexas
- [ ] Webhooks bidirecionais
- [ ] Integração com service mesh

## Contribuição

Para contribuir com o Health Checker Agent:

1. Fork o repositório
2. Crie uma branch para sua feature
3. Implemente testes para novas funcionalidades
4. Execute a suite de testes
5. Submeta um Pull Request

### Padrões de Código

- ESLint para linting
- Jest para testes
- JSDoc para documentação
- Conventional Commits para mensagens

---

**Fase 6 - Complementação do Sistema**  
*Health Checker Agent v1.0.0*