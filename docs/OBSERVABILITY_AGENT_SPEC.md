# Documentação Técnica Completa: Observability Agent

## 📌 Visão Geral do Componente

O Observability Agent é responsável por coletar, processar e expor métricas de todos os agentes do sistema multiagente, fornecendo visibilidade completa sobre o estado operacional, performance e saúde da arquitetura BDI+MARL. Ele atua como o centro de monitoramento e observabilidade do ecossistema.

## 🎯 Requisitos Funcionais

| Código | Requisito |
|--------|----------|
| RF-OBS-001 | Coletar métricas de performance de todos os agentes (latência, throughput, taxa de erro) |
| RF-OBS-002 | Monitorar saúde dos agentes e detectar falhas automaticamente |
| RF-OBS-003 | Expor métricas no formato Prometheus para integração com Grafana |
| RF-OBS-004 | Gerar alertas automáticos baseados em thresholds configuráveis |
| RF-OBS-005 | Manter logs estruturados de todas as operações críticas |
| RF-OBS-006 | Fornecer dashboards em tempo real do status do sistema |
| RF-OBS-007 | Rastrear métricas específicas de BDI (crenças, desejos, intenções) e MARL (recompensas, políticas) |

## 🧱 Arquitetura Interna do Observability Agent

```
[ All Agents ]
      │
[ Metrics Collection API ]
      │
[ Observability Core ]
  ├─ Metrics Aggregator
  ├─ Health Monitor
  ├─ Alert Engine
  ├─ Log Processor
  └─ Dashboard API
      │
[ External Systems ]
  ├─ Prometheus
  ├─ Grafana
  └─ ELK Stack
```

### Detalhamento de Módulos Internos

| Módulo | Responsabilidade |
|--------|------------------|
| Metrics Collection API | Receber métricas de todos os agentes via HTTP/SQS |
| Metrics Aggregator | Processar e agregar métricas por período e tipo |
| Health Monitor | Verificar status de saúde dos agentes periodicamente |
| Alert Engine | Avaliar thresholds e disparar alertas |
| Log Processor | Estruturar e indexar logs para consulta |
| Dashboard API | Expor dados para visualização em tempo real |

## 📊 Tipos de Métricas Coletadas

### Métricas Gerais dos Agentes
```json
{
  "agent_id": "planning-agent-01",
  "timestamp": "2025-06-18T10:30:00Z",
  "metrics": {
    "requests_total": 1250,
    "requests_per_second": 12.5,
    "response_time_avg_ms": 45.2,
    "error_rate_percent": 0.8,
    "memory_usage_mb": 128.5,
    "cpu_usage_percent": 15.3
  }
}
```

### Métricas Específicas BDI
```json
{
  "agent_id": "planning-agent-01",
  "bdi_metrics": {
    "beliefs_count": 25,
    "active_intentions": 3,
    "plans_executed_total": 89,
    "plan_success_rate": 94.5,
    "deliberation_time_avg_ms": 12.8
  }
}
```

### Métricas Específicas MARL
```json
{
  "agent_id": "marl-agent-01",
  "marl_metrics": {
    "episodes_completed": 1500,
    "average_reward": 0.85,
    "policy_updates": 45,
    "exploration_rate": 0.1,
    "convergence_score": 0.92
  }
}
```

## 🚨 Sistema de Alertas

### Configuração de Thresholds
```yaml
alerts:
  agent_health:
    response_time_ms: 1000
    error_rate_percent: 5.0
    memory_usage_mb: 512
  
  bdi_performance:
    plan_success_rate: 85.0
    deliberation_time_ms: 50
  
  marl_performance:
    average_reward: 0.5
    convergence_score: 0.8
```

### Exemplo de Alerta
```json
{
  "alert_id": "alert-001",
  "severity": "warning",
  "agent_id": "planning-agent-01",
  "metric": "response_time_avg_ms",
  "current_value": 1250,
  "threshold": 1000,
  "timestamp": "2025-06-18T10:35:00Z",
  "message": "Planning Agent response time exceeded threshold"
}
```

## 📝 API Endpoints

| Endpoint | Método | Descrição |
|----------|--------|----------|
| `/metrics` | GET | Retorna métricas no formato Prometheus |
| `/health` | GET | Status de saúde de todos os agentes |
| `/alerts` | GET | Lista de alertas ativos |
| `/dashboard/data` | GET | Dados para dashboard em tempo real |
| `/agents/{agent_id}/metrics` | GET | Métricas específicas de um agente |
| `/logs/search` | POST | Busca estruturada nos logs |

## ⚙️ Regras de Negócio

| Regra | Descrição |
|-------|----------|
| OBS-Rule-01 | Métricas devem ser coletadas a cada 30 segundos de todos os agentes ativos |
| OBS-Rule-02 | Alertas críticos devem ser enviados imediatamente via SQS |
| OBS-Rule-03 | Logs devem ser retidos por 90 dias para auditoria |
| OBS-Rule-04 | Dashboards devem atualizar em tempo real (< 5 segundos) |
| OBS-Rule-05 | Métricas históricas devem ser agregadas por hora/dia/semana |

## 📑 Artefatos de Engenharia Gerados

### ✅ JSON Schemas
- Schema de métricas gerais
- Schema de métricas BDI
- Schema de métricas MARL
- Schema de alertas

### ✅ Configurações Prometheus
```yaml
scrape_configs:
  - job_name: 'observability-agent'
    static_configs:
      - targets: ['observability-agent:3000']
    scrape_interval: 30s
```

### ✅ Dashboard Grafana (JSON)
- Painel de visão geral do sistema
- Métricas por agente
- Alertas ativos
- Performance BDI/MARL

### ✅ Alertmanager Configuration
```yaml
route:
  group_by: ['alertname', 'agent_id']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'sqs-alerts'

receivers:
- name: 'sqs-alerts'
  webhook_configs:
  - url: 'http://observability-agent:3000/alerts/webhook'
```

### ✅ Logs Estruturados (ELK)
```json
{
  "@timestamp": "2025-06-18T10:40:00Z",
  "level": "info",
  "agent_id": "planning-agent-01",
  "operation": "plan_execution",
  "duration_ms": 45,
  "success": true,
  "details": {
    "plan_id": "PLAN-001",
    "intention": "notify_team"
  }
}
```

### ✅ Test Cases
- Teste de coleta de métricas
- Teste de geração de alertas
- Teste de agregação de dados
- Teste de integração com Prometheus
- Teste de dashboard em tempo real

### ✅ Diagramas UML
- Diagrama de Sequência: Coleta → Processamento → Exposição
- Diagrama de Componentes internos
- Fluxo de alertas

## 🚀 Roadmap de Desenvolvimento

| Fase | Atividade |
|------|----------|
| 1 | Implementação da API de coleta de métricas |
| 2 | Desenvolvimento do agregador de métricas |
| 3 | Implementação do sistema de alertas |
| 4 | Integração com Prometheus e Grafana |
| 5 | Desenvolvimento dos dashboards |
| 6 | Implementação do processador de logs |
| 7 | Testes de integração e performance |

## 📊 Métricas de Sucesso

- **Latência de coleta**: < 100ms
- **Disponibilidade**: 99.9%
- **Precisão de alertas**: > 95%
- **Tempo de detecção de falhas**: < 1 minuto
- **Retenção de dados**: 90 dias sem perda

---

**Status**: ✅ Observability Agent documentado e pronto para desenvolvimento

**Próximo Componente**: Security & Authentication Agent