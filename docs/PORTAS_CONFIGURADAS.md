# Configuração de Portas - Sistema de Agentes Autônomos

Este documento detalha todas as portas configuradas no sistema quando executado localmente.

## 🚀 Serviços de Infraestrutura

### Banco de Dados e Cache
| Serviço | Porta | Container | Credenciais | Descrição |
|---------|-------|-----------|-------------|-----------|
| **PostgreSQL** | `5432` | `agentes-postgres` | `postgres/postgres123` | Banco de dados principal |
| **Redis** | `6379` | `agentes-redis` | `redis123` | Cache e sessões |
| **PgAdmin** | `8080` | `agentes-pgadmin` | `admin@agentes.local/admin123` | Interface web PostgreSQL |
| **Redis Commander** | `8081` | `agentes-redis-commander` | - | Interface web Redis |

### Monitoramento
| Serviço | Porta | Container | Credenciais | Descrição |
|---------|-------|-----------|-------------|-----------|
| **Prometheus** | `9090` | `agentes-prometheus` | - | Coleta de métricas |
| **Grafana** | `3000` | `agentes-grafana` | `admin/admin123` | Dashboards e visualização |
| **Metrics Server** | `9090` | - | - | Servidor de métricas interno |

### AWS Local
| Serviço | Porta | Container | Descrição |
|---------|-------|-----------|----------|
| **LocalStack** | `4566` | `agentes-localstack` | Simulação AWS (SQS, S3, etc.) |
| **ElasticMQ** | `9324` | - | Simulação SQS (alternativa) |

## 🤖 Agentes do Sistema

### Agentes Principais (Core)
| Agente | Porta Padrão | Variável de Ambiente | Descrição |
|--------|--------------|---------------------|----------|
| **Interface Agent** | `3000` | `PORT` | Interface principal do sistema |
| **Event Agent** | `3001` / `3003` | `EVENT_AGENT_PORT` | Processamento de eventos |
| **Planning Agent** | `3002` / `3004` | `PLANNING_AGENT_PORT` | Planejamento e estratégias |
| **Execution Agent** | `3003` / `3005` | `EXECUTION_AGENT_PORT` | Execução de tarefas |

### Agentes de Infraestrutura
| Agente | Porta Padrão | Variável de Ambiente | Descrição |
|--------|--------------|---------------------|----------|
| **Security Agent** | `3007` | `SECURITY_AGENT_PORT` | Autenticação e autorização |
| **ACL Middleware** | `3006` | `ACL_AGENT_PORT` | Controle de acesso |
| **External Gateway** | `3007` | `PORT` | Gateway para APIs externas |

### Agentes Auxiliares
| Agente | Porta Padrão | Variável de Ambiente | Descrição |
|--------|--------------|---------------------|----------|
| **Monitoring Agent** | `3008` / `3001` | `MONITORING_AGENT_PORT` | Monitoramento do sistema |
| **Policy Agent** | `3009` | `POLICY_AGENT_PORT` | Gestão de políticas |
| **State Management** | `3007` | `STATE_AGENT_PORT` | Gestão de estado |

### Agentes MARL (Multi-Agent Reinforcement Learning)
| Agente | Porta Padrão | Variável de Ambiente | Descrição |
|--------|--------------|---------------------|----------|
| **MARL Agent** | `3010` | `PORT` | Aprendizado por reforço |
| **Coordination Agent** | `3011` | `PORT` | Coordenação entre agentes |
| **Mediator Agent** | `3012` | `PORT` | Mediação de conflitos |
| **Orchestrator Agent** | `3010` | `PORT` | Orquestração de workflows |

## 🔧 Configuração de Desenvolvimento

### URLs de Acesso Local
```bash
# Interfaces Web
Grafana:          http://localhost:3000 (admin/admin123)
Prometheus:       http://localhost:9090
PgAdmin:          http://localhost:8080 (admin@agentes.local/admin123)
Redis Commander:  http://localhost:8081

# Serviços de Infraestrutura
LocalStack:       http://localhost:4566
PostgreSQL:       localhost:5432
Redis:            localhost:6379

# Health Checks dos Agentes
Interface:        http://localhost:3000/health
Event:            http://localhost:3001/health
Planning:         http://localhost:3002/health
Execution:        http://localhost:3003/health
Monitoring:       http://localhost:3001/health
```

### Configuração via Variáveis de Ambiente

```bash
# Portas dos Agentes
PORT=3000                    # Interface Agent
EVENT_AGENT_PORT=3003        # Event Agent
PLANNING_AGENT_PORT=3004     # Planning Agent
EXECUTION_AGENT_PORT=3005    # Execution Agent
MONITORING_AGENT_PORT=3008   # Monitoring Agent
SECURITY_AGENT_PORT=3007     # Security Agent
ACL_AGENT_PORT=3006          # ACL Middleware
POLICY_AGENT_PORT=3009       # Policy Agent
STATE_AGENT_PORT=3007        # State Management

# Portas de Monitoramento
METRICS_PORT=9090            # Servidor de métricas
MONITORING_PORT=3001         # Serviço de monitoramento

# Banco de Dados
DB_HOST=localhost
DB_PORT=5432
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 🐳 Docker Compose

### Comando para Iniciar Ambiente de Desenvolvimento
```bash
# Iniciar todos os serviços
docker-compose -f docker-compose.dev.yml up -d

# Verificar status
docker-compose -f docker-compose.dev.yml ps

# Ver logs
docker-compose -f docker-compose.dev.yml logs -f
```

### Portas Expostas pelo Docker
```yaml
services:
  postgres:    "5432:5432"
  redis:       "6379:6379"
  pgadmin:     "8080:80"
  redis-commander: "8081:8081"
  prometheus:  "9090:9090"
  grafana:     "3000:3000"
  localstack: "4566:4566"
```

## 🔍 Verificação de Status

### Scripts de Verificação
```bash
# Verificar conectividade SQS
node scripts/test-sqs-connectivity.js

# Teste de integração do sistema
node scripts/test-system-integration.js

# Verificar saúde dos agentes
node tests/integration/smoke-test.js
```

### Health Checks Manuais
```bash
# Verificar LocalStack
curl http://localhost:4566/health

# Verificar agentes
curl http://localhost:3000/health  # Interface
curl http://localhost:3001/health  # Event/Monitoring
curl http://localhost:3002/health  # Planning
curl http://localhost:3003/health  # Execution

# Verificar métricas
curl http://localhost:9090/metrics
curl http://localhost:3001/metrics
```

## ⚠️ Conflitos de Porta

### Portas que Podem Conflitar
- **3000**: Grafana vs Interface Agent
- **3001**: Event Agent vs Monitoring Agent
- **3007**: Security Agent vs External Gateway vs State Management
- **3010**: MARL Agent vs Orchestrator Agent
- **9090**: Prometheus vs Metrics Server

### Resolução de Conflitos
1. **Usar variáveis de ambiente** para definir portas específicas
2. **Verificar portas em uso** antes de iniciar:
   ```bash
   netstat -an | findstr :3000
   ```
3. **Configurar portas alternativas** nos arquivos `.env`

## 📝 Notas Importantes

- As portas podem variar dependendo da configuração do ambiente
- Alguns agentes compartilham a mesma porta padrão (conflitos potenciais)
- O sistema usa diferentes portas para desenvolvimento e produção
- LocalStack simula múltiplos serviços AWS na porta 4566
- Grafana e Interface Agent ambos usam porta 3000 por padrão

## 🔗 Links Úteis

- [Configuração de Desenvolvimento](./AMBIENTE_DESENVOLVIMENTO.md)
- [Guia de SQS](./SQS_SETUP_GUIDE.md)
- [Documentação da API](./API_OVERVIEW.md)
- [Troubleshooting](./TROUBLESHOOTING.md)