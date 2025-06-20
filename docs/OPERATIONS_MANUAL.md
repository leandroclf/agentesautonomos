# Manual de Operações - Sistema de Agentes Autônomos

Este manual fornece instruções detalhadas para operação, manutenção e troubleshooting do sistema de agentes autônomos.

## Índice

1. [Visão Geral Operacional](#visão-geral-operacional)
2. [Instalação e Configuração](#instalação-e-configuração)
3. [Inicialização do Sistema](#inicialização-do-sistema)
4. [Monitoramento](#monitoramento)
5. [Manutenção Preventiva](#manutenção-preventiva)
6. [Troubleshooting](#troubleshooting)
7. [Backup e Recuperação](#backup-e-recuperação)
8. [Escalabilidade](#escalabilidade)
9. [Segurança Operacional](#segurança-operacional)
10. [Procedimentos de Emergência](#procedimentos-de-emergência)
11. [Logs e Auditoria](#logs-e-auditoria)
12. [Performance Tuning](#performance-tuning)

---

## Visão Geral Operacional

### Arquitetura de Deployment

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   API Gateway   │    │   Agent Cluster │
│                 │────│                 │────│                 │
│   (ALB/NGINX)   │    │   (Kong/AWS)    │    │   (Kubernetes)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Monitoring    │    │   Message Queue │    │   Data Storage  │
│                 │    │                 │    │                 │
│ (Prometheus)    │    │   (Amazon SQS)  │    │ (PostgreSQL)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Componentes Principais

| Componente | Função | Status Crítico | Dependências |
|------------|--------|----------------|-------------|
| **API Gateway** | Entrada de requisições | ✅ Crítico | Load Balancer |
| **Agent Cluster** | Processamento principal | ✅ Crítico | SQS, Database |
| **Message Queue** | Comunicação assíncrona | ✅ Crítico | - |
| **Database** | Persistência de dados | ✅ Crítico | - |
| **Cache (Redis)** | Cache de alta performance | ⚠️ Importante | - |
| **Monitoring** | Observabilidade | ⚠️ Importante | - |

---

## Instalação e Configuração

### Pré-requisitos

#### Hardware Mínimo

| Ambiente | CPU | RAM | Storage | Network |
|----------|-----|-----|---------|----------|
| **Desenvolvimento** | 4 cores | 8 GB | 50 GB SSD | 100 Mbps |
| **Staging** | 8 cores | 16 GB | 100 GB SSD | 1 Gbps |
| **Produção** | 16 cores | 32 GB | 500 GB SSD | 10 Gbps |

#### Software

```bash
# Node.js (versão LTS)
node --version  # >= 18.0.0
npm --version   # >= 9.0.0

# Docker
docker --version          # >= 20.10.0
docker-compose --version  # >= 2.0.0

# Kubernetes (para produção)
kubectl version --client  # >= 1.25.0
```

### Instalação Passo a Passo

#### 1. Clone do Repositório

```bash
git clone https://github.com/your-org/agentes-autonomos.git
cd agentes-autonomos
```

#### 2. Configuração de Ambiente

```bash
# Copiar arquivo de configuração
cp .env.example .env

# Editar configurações
vim .env
```

**Variáveis de Ambiente Essenciais:**

```bash
# Aplicação
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/agents_db
REDIS_URL=redis://localhost:6379

# Message Queue
AWS_SQS_REGION=us-east-1
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/agents-queue

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001

# Security
JWT_SECRET=your-super-secret-key
API_KEY=your-api-key

# MARL
MARL_ENABLED=true
MARL_LEARNING_RATE=0.001
MARL_BATCH_SIZE=32
```

#### 3. Instalação de Dependências

```bash
# Instalar dependências
npm install

# Instalar dependências de desenvolvimento (opcional)
npm install --include=dev
```

#### 4. Configuração do Banco de Dados

```bash
# Executar migrações
npm run db:migrate

# Executar seeds (dados iniciais)
npm run db:seed

# Verificar conexão
npm run db:check
```

#### 5. Build da Aplicação

```bash
# Build para produção
npm run build

# Verificar build
npm run build:check
```

---

## Inicialização do Sistema

### Sequência de Inicialização

```mermaid
flowchart TD
    START[🚀 Início]
    INFRA[🏗️ Infraestrutura]
    DB[💾 Database]
    CACHE[⚡ Cache]
    QUEUE[📬 Message Queue]
    AGENTS[🤖 Agentes]
    API[🔌 API Gateway]
    MONITOR[📊 Monitoramento]
    READY[✅ Sistema Pronto]
    
    START --> INFRA
    INFRA --> DB
    DB --> CACHE
    CACHE --> QUEUE
    QUEUE --> AGENTS
    AGENTS --> API
    API --> MONITOR
    MONITOR --> READY
    
    style START fill:#e3f2fd
    style READY fill:#e8f5e8
```

### Scripts de Inicialização

#### Desenvolvimento

```bash
# Inicialização completa para desenvolvimento
npm run dev:start

# Ou passo a passo:
npm run dev:infra     # Inicia infraestrutura (Docker)
npm run dev:db        # Configura banco de dados
npm run dev:agents    # Inicia agentes
npm run dev:api       # Inicia API
```

#### Produção

```bash
# Usando Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# Ou usando Kubernetes
kubectl apply -f k8s/

# Verificar status
npm run prod:health
```

### Verificação de Saúde

```bash
# Health check completo
curl -f http://localhost:3000/health

# Health check detalhado
curl -f http://localhost:3000/health/detailed

# Health check de componentes específicos
curl -f http://localhost:3000/health/agents
curl -f http://localhost:3000/health/database
curl -f http://localhost:3000/health/queue
```

**Resposta Esperada:**

```json
{
  "status": "healthy",
  "timestamp": "2024-12-19T10:30:00Z",
  "version": "1.0.0",
  "components": {
    "database": {
      "status": "healthy",
      "responseTime": 15,
      "connections": 5
    },
    "cache": {
      "status": "healthy",
      "responseTime": 2,
      "hitRate": 0.85
    },
    "messageQueue": {
      "status": "healthy",
      "queueDepth": 12,
      "processingRate": 150
    },
    "agents": {
      "status": "healthy",
      "activeAgents": 8,
      "totalAgents": 10
    }
  }
}
```

---

## Monitoramento

### Dashboard Principal

#### Métricas Críticas

```
┌─────────────────────────────────────────────────────────────┐
│                    SISTEMA DE AGENTES                      │
├─────────────────────────────────────────────────────────────┤
│ Status Geral: 🟢 HEALTHY    │ Uptime: 99.9%               │
│ Agentes Ativos: 8/10        │ CPU: 65%    RAM: 72%        │
├─────────────────────────────────────────────────────────────┤
│ THROUGHPUT                  │ LATÊNCIA                     │
│ Requests/sec: 1,250        │ P50: 45ms    P95: 120ms     │
│ Tasks/min: 450             │ P99: 250ms   Max: 500ms     │
├─────────────────────────────────────────────────────────────┤
│ FILAS                      │ ERROS                        │
│ Pending: 15                │ Error Rate: 0.2%             │
│ Processing: 8              │ Last Error: 2h ago          │
└─────────────────────────────────────────────────────────────┘
```

#### Alertas Configurados

| Métrica | Threshold | Severidade | Ação |
|---------|-----------|------------|------|
| **CPU Usage** | > 80% | ⚠️ Warning | Scale up |
| **Memory Usage** | > 85% | ⚠️ Warning | Investigate |
| **Error Rate** | > 5% | 🚨 Critical | Immediate action |
| **Response Time P95** | > 500ms | ⚠️ Warning | Performance review |
| **Queue Depth** | > 100 | ⚠️ Warning | Scale workers |
| **Agent Failures** | > 2 | 🚨 Critical | Restart agents |

### Comandos de Monitoramento

```bash
# Status em tempo real
npm run monitor:live

# Relatório de performance
npm run monitor:performance

# Análise de logs
npm run monitor:logs

# Métricas de agentes
npm run monitor:agents

# Status da infraestrutura
npm run monitor:infrastructure
```

---

## Manutenção Preventiva

### Cronograma de Manutenção

#### Diário

```bash
#!/bin/bash
# daily-maintenance.sh

echo "[$(date)] Iniciando manutenção diária..."

# Verificar saúde do sistema
npm run health:check

# Limpar logs antigos
find ./logs -name "*.log" -mtime +7 -delete

# Verificar espaço em disco
df -h | grep -E '(8[0-9]|9[0-9])%' && echo "ALERTA: Disco quase cheio"

# Backup incremental
npm run backup:incremental

echo "[$(date)] Manutenção diária concluída."
```

#### Semanal

```bash
#!/bin/bash
# weekly-maintenance.sh

echo "[$(date)] Iniciando manutenção semanal..."

# Análise de performance
npm run analyze:performance

# Otimização do banco de dados
npm run db:optimize

# Limpeza de cache
npm run cache:cleanup

# Atualização de dependências de segurança
npm audit fix

# Backup completo
npm run backup:full

echo "[$(date)] Manutenção semanal concluída."
```

#### Mensal

```bash
#!/bin/bash
# monthly-maintenance.sh

echo "[$(date)] Iniciando manutenção mensal..."

# Análise de capacidade
npm run analyze:capacity

# Revisão de logs de segurança
npm run security:audit

# Teste de recuperação de desastre
npm run test:disaster-recovery

# Atualização de documentação
npm run docs:update

echo "[$(date)] Manutenção mensal concluída."
```

### Tarefas de Limpeza

```bash
# Limpeza de dados temporários
npm run cleanup:temp

# Limpeza de logs antigos
npm run cleanup:logs

# Limpeza de cache expirado
npm run cleanup:cache

# Limpeza de arquivos de build antigos
npm run cleanup:builds
```

---

## Troubleshooting

### Problemas Comuns

#### 1. Agente Não Responde

**Sintomas:**
- Timeout em requisições
- Agente marcado como "unhealthy"
- Logs de erro no agente específico

**Diagnóstico:**

```bash
# Verificar status do agente
curl -f http://localhost:3000/agents/agent-001/health

# Verificar logs
tail -f logs/agents/agent-001.log

# Verificar recursos
top -p $(pgrep -f "agent-001")
```

**Solução:**

```bash
# Restart suave
npm run agent:restart agent-001

# Se não resolver, restart forçado
npm run agent:kill agent-001
npm run agent:start agent-001

# Verificar recuperação
npm run agent:health agent-001
```

#### 2. Alta Latência

**Sintomas:**
- Response time P95 > 500ms
- Usuários reportando lentidão
- Timeout em operações

**Diagnóstico:**

```bash
# Análise de performance
npm run analyze:latency

# Verificar gargalos
npm run analyze:bottlenecks

# Profiling da aplicação
npm run profile:start
```

**Solução:**

```bash
# Escalar horizontalmente
npm run scale:up

# Otimizar cache
npm run cache:optimize

# Revisar queries do banco
npm run db:analyze-slow-queries
```

#### 3. Falha na Comunicação entre Agentes

**Sintomas:**
- Mensagens não entregues
- Timeout em comunicação
- Dead letter queue crescendo

**Diagnóstico:**

```bash
# Verificar status da fila
aws sqs get-queue-attributes --queue-url $SQS_QUEUE_URL

# Verificar conectividade
npm run test:connectivity

# Analisar dead letter queue
npm run analyze:dlq
```

**Solução:**

```bash
# Reprocessar mensagens da DLQ
npm run dlq:reprocess

# Reiniciar workers da fila
npm run queue:restart-workers

# Verificar configuração de rede
npm run network:diagnose
```

### Ferramentas de Diagnóstico

```bash
# Diagnóstico completo do sistema
npm run diagnose:full

# Diagnóstico de rede
npm run diagnose:network

# Diagnóstico de performance
npm run diagnose:performance

# Diagnóstico de memória
npm run diagnose:memory

# Diagnóstico de banco de dados
npm run diagnose:database
```

---

## Backup e Recuperação

### Estratégia de Backup

```mermaid
flowchart TD
    DATA[💾 Dados]
    DAILY[📅 Backup Diário]
    WEEKLY[📅 Backup Semanal]
    MONTHLY[📅 Backup Mensal]
    LOCAL[🏠 Storage Local]
    CLOUD[☁️ Cloud Storage]
    ARCHIVE[📦 Archive]
    
    DATA --> DAILY
    DATA --> WEEKLY
    DATA --> MONTHLY
    
    DAILY --> LOCAL
    WEEKLY --> CLOUD
    MONTHLY --> ARCHIVE
    
    style DATA fill:#e3f2fd
    style CLOUD fill:#e8f5e8
    style ARCHIVE fill:#fff3e0
```

### Procedimentos de Backup

#### Backup Completo

```bash
#!/bin/bash
# backup-full.sh

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/full_${BACKUP_DATE}"

echo "Iniciando backup completo: $BACKUP_DIR"

# Criar diretório de backup
mkdir -p $BACKUP_DIR

# Backup do banco de dados
pg_dump $DATABASE_URL > $BACKUP_DIR/database.sql

# Backup do Redis
redis-cli --rdb $BACKUP_DIR/redis.rdb

# Backup de arquivos de configuração
tar -czf $BACKUP_DIR/config.tar.gz config/

# Backup de logs importantes
tar -czf $BACKUP_DIR/logs.tar.gz logs/

# Backup de modelos MARL
tar -czf $BACKUP_DIR/models.tar.gz models/

# Compactar backup
tar -czf "${BACKUP_DIR}.tar.gz" -C /backups "full_${BACKUP_DATE}"
rm -rf $BACKUP_DIR

echo "Backup completo finalizado: ${BACKUP_DIR}.tar.gz"
```

#### Backup Incremental

```bash
#!/bin/bash
# backup-incremental.sh

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/incremental_${BACKUP_DATE}"
LAST_BACKUP=$(find /backups -name "incremental_*" -type f | sort | tail -1)

echo "Iniciando backup incremental: $BACKUP_DIR"

# Criar diretório de backup
mkdir -p $BACKUP_DIR

# Backup incremental do banco (WAL)
pg_basebackup -D $BACKUP_DIR/db_incremental

# Backup de arquivos modificados
find . -newer "$LAST_BACKUP" -type f -exec cp {} $BACKUP_DIR/ \;

# Compactar backup
tar -czf "${BACKUP_DIR}.tar.gz" -C /backups "incremental_${BACKUP_DATE}"
rm -rf $BACKUP_DIR

echo "Backup incremental finalizado: ${BACKUP_DIR}.tar.gz"
```

### Procedimentos de Recuperação

#### Recuperação Completa

```bash
#!/bin/bash
# restore-full.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Uso: $0 <arquivo_backup>"
    exit 1
fi

echo "Iniciando recuperação completa de: $BACKUP_FILE"

# Parar serviços
npm run stop

# Extrair backup
tar -xzf $BACKUP_FILE -C /tmp/
RESTORE_DIR=$(find /tmp -name "full_*" -type d | head -1)

# Restaurar banco de dados
psql $DATABASE_URL < $RESTORE_DIR/database.sql

# Restaurar Redis
redis-cli --pipe < $RESTORE_DIR/redis.rdb

# Restaurar configurações
tar -xzf $RESTORE_DIR/config.tar.gz -C ./

# Restaurar modelos
tar -xzf $RESTORE_DIR/models.tar.gz -C ./

# Reiniciar serviços
npm run start

# Verificar integridade
npm run verify:integrity

echo "Recuperação completa finalizada"
```

### Teste de Recuperação

```bash
# Teste mensal de recuperação
npm run test:backup-restore

# Verificação de integridade dos backups
npm run verify:backups

# Simulação de disaster recovery
npm run simulate:disaster-recovery
```

---

## Escalabilidade

### Escalabilidade Horizontal

#### Auto Scaling

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agents-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agents-deployment
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### Comandos de Escala

```bash
# Escalar manualmente
kubectl scale deployment agents-deployment --replicas=10

# Verificar status do auto scaling
kubectl get hpa

# Escalar usando Docker Compose
docker-compose up --scale agent-service=5

# Escalar usando scripts customizados
npm run scale:agents 8
npm run scale:workers 12
```

### Escalabilidade Vertical

```bash
# Aumentar recursos de CPU/Memory
kubectl patch deployment agents-deployment -p '{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "agent",
          "resources": {
            "requests": {"cpu": "2", "memory": "4Gi"},
            "limits": {"cpu": "4", "memory": "8Gi"}
          }
        }]
      }
    }
  }
}'
```

### Monitoramento de Capacidade

```bash
# Análise de capacidade atual
npm run analyze:capacity

# Previsão de crescimento
npm run forecast:capacity

# Recomendações de escala
npm run recommend:scaling
```

---

## Segurança Operacional

### Checklist de Segurança

#### Diário
- [ ] Verificar logs de segurança
- [ ] Monitorar tentativas de acesso não autorizado
- [ ] Verificar integridade dos certificados
- [ ] Revisar alertas de segurança

#### Semanal
- [ ] Atualizar dependências de segurança
- [ ] Revisar configurações de firewall
- [ ] Verificar backups de segurança
- [ ] Analisar padrões de tráfego suspeito

#### Mensal
- [ ] Auditoria completa de segurança
- [ ] Teste de penetração
- [ ] Revisão de políticas de acesso
- [ ] Treinamento de segurança da equipe

### Comandos de Segurança

```bash
# Auditoria de segurança
npm run security:audit

# Verificação de vulnerabilidades
npm run security:scan

# Análise de logs de segurança
npm run security:analyze-logs

# Teste de configuração de segurança
npm run security:test-config

# Rotação de chaves
npm run security:rotate-keys
```

---

## Procedimentos de Emergência

### Plano de Resposta a Incidentes

#### Severidade 1 - Sistema Inoperante

```bash
# 1. Avaliação inicial (< 5 min)
npm run emergency:assess

# 2. Ativação do plano de contingência
npm run emergency:activate-contingency

# 3. Comunicação com stakeholders
npm run emergency:notify-stakeholders

# 4. Investigação e correção
npm run emergency:investigate
npm run emergency:fix

# 5. Verificação e monitoramento
npm run emergency:verify
npm run emergency:monitor
```

#### Severidade 2 - Degradação de Performance

```bash
# 1. Identificar gargalo
npm run performance:identify-bottleneck

# 2. Aplicar correção temporária
npm run performance:quick-fix

# 3. Monitorar melhoria
npm run performance:monitor

# 4. Planejar correção definitiva
npm run performance:plan-permanent-fix
```

### Contatos de Emergência

| Função | Nome | Telefone | Email | Disponibilidade |
|--------|------|----------|-------|----------------|
| **Tech Lead** | João Silva | +55 11 99999-0001 | joao@company.com | 24/7 |
| **DevOps** | Maria Santos | +55 11 99999-0002 | maria@company.com | 24/7 |
| **DBA** | Pedro Costa | +55 11 99999-0003 | pedro@company.com | Business hours |
| **Security** | Ana Lima | +55 11 99999-0004 | ana@company.com | On-call |

---

## Logs e Auditoria

### Estrutura de Logs

```
logs/
├── application/
│   ├── app.log
│   ├── error.log
│   └── access.log
├── agents/
│   ├── interface-agent.log
│   ├── planning-agent.log
│   └── execution-agent.log
├── infrastructure/
│   ├── database.log
│   ├── cache.log
│   └── queue.log
├── security/
│   ├── auth.log
│   ├── audit.log
│   └── security.log
└── monitoring/
    ├── metrics.log
    ├── alerts.log
    └── performance.log
```

### Análise de Logs

```bash
# Buscar erros recentes
grep -r "ERROR" logs/ --include="*.log" | tail -20

# Analisar padrões de acesso
awk '{print $1}' logs/application/access.log | sort | uniq -c | sort -nr

# Monitorar logs em tempo real
tail -f logs/application/app.log | grep -E "(ERROR|WARN)"

# Análise de performance
grep "response_time" logs/application/app.log | awk '{sum+=$NF; count++} END {print "Avg:", sum/count}'
```

### Retenção de Logs

| Tipo de Log | Retenção Local | Retenção Cloud | Compressão |
|-------------|----------------|----------------|------------|
| **Application** | 30 dias | 1 ano | Gzip |
| **Security** | 90 dias | 7 anos | Gzip |
| **Audit** | 90 dias | 7 anos | Gzip |
| **Performance** | 7 dias | 6 meses | Gzip |
| **Debug** | 3 dias | - | Gzip |

---

## Performance Tuning

### Otimizações de Database

```sql
-- Análise de queries lentas
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Otimização de índices
CREATE INDEX CONCURRENTLY idx_agents_status ON agents(status) WHERE status = 'active';

-- Análise de bloqueios
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

### Otimizações de Cache

```bash
# Análise de hit rate do Redis
redis-cli info stats | grep keyspace_hits

# Otimização de TTL
redis-cli --scan --pattern "*" | xargs -I {} redis-cli TTL {}

# Limpeza de chaves expiradas
redis-cli --scan --pattern "expired:*" | xargs redis-cli DEL
```

### Otimizações de Aplicação

```bash
# Profiling de CPU
npm run profile:cpu

# Análise de memory leaks
npm run profile:memory

# Otimização de bundle
npm run analyze:bundle

# Benchmark de performance
npm run benchmark:performance
```

---

## Conclusão

Este manual de operações fornece as diretrizes essenciais para manter o sistema de agentes autônomos funcionando de forma eficiente e segura. Para situações não cobertas neste manual, consulte:

- [Documentação da API](API.md)
- [Guia de Troubleshooting Avançado](TROUBLESHOOTING_ADVANCED.md)
- [Procedimentos de Disaster Recovery](DISASTER_RECOVERY.md)
- [Guia de Segurança](SECURITY_GUIDE.md)

### Contato para Suporte

- **Email**: ops-team@company.com
- **Slack**: #ops-agents-autonomos
- **Telefone de Emergência**: +55 11 99999-0000

---

*Última atualização: 2024-12-19*
*Versão: 1.0.0*
*Responsável: Equipe de Operações*