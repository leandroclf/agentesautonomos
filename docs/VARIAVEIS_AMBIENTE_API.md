# Variáveis de Ambiente para API - Sistema de Agentes Autônomos

## Configuração de Portas para Desenvolvimento

Este documento descreve como configurar as variáveis de ambiente para usar a API do Sistema de Agentes Autônomos em ambiente de desenvolvimento.

## Servidores Disponíveis

### Servidor Principal Configurável
- **URL**: `{{baseUrl}}`
- **Padrão**: `http://localhost:3000`
- **Descrição**: Servidor configurável via variáveis de ambiente

### Agentes do Sistema

| Agente | Porta | URL | Descrição |
|--------|-------|-----|-----------|
| Interface Agent | 3000 | `http://localhost:3000` | Gerencia interação com usuários |
| Event Agent | 3001 | `http://localhost:3001` | Processa eventos do sistema |
| Planning Agent | 3002 | `http://localhost:3002` | Realiza planejamento de tarefas |
| Execution Agent | 3003 | `http://localhost:3003` | Executa tarefas planejadas |
| Planning Agent (Alt) | 3004 | `http://localhost:3004` | Porta alternativa para Planning |
| Execution Agent (Alt) | 3005 | `http://localhost:3005` | Porta alternativa para Execution |
| ACL Middleware Agent | 3006 | `http://localhost:3006` | Controle de acesso |
| Security Agent | 3007 | `http://localhost:3007` | Segurança e autenticação |
| Monitoring Agent | 3008 | `http://localhost:3008` | Monitoramento do sistema |
| Policy Agent | 3009 | `http://localhost:3009` | Gerenciamento de políticas |
| MARL Agent | 3010 | `http://localhost:3010` | Multi-Agent Reinforcement Learning |
| Coordination Agent | 3011 | `http://localhost:3011` | Coordenação entre agentes |
| Mediator Agent | 3012 | `http://localhost:3012` | Mediação de comunicação |

### Serviços de Infraestrutura

| Serviço | Porta | URL | Descrição |
|---------|-------|-----|-----------|
| Prometheus | 9090 | `http://localhost:9090` | Métricas e monitoramento |
| Grafana | 3000 | `http://localhost:3000` | Dashboard de monitoramento |
| PostgreSQL | 5432 | `localhost:5432` | Banco de dados principal |
| Redis | 6379 | `localhost:6379` | Cache e sessões |
| PgAdmin | 8080 | `http://localhost:8080` | Interface web PostgreSQL |
| Redis Commander | 8081 | `http://localhost:8081` | Interface web Redis |

## Configuração em Clientes API

### Postman
1. Importe o arquivo `openapi.yaml`
2. Configure as variáveis de ambiente:
   - `baseUrl`: `http://localhost:3000` (ou porta desejada)
   - `token`: Seu JWT token após login

### Insomnia
1. Importe o arquivo OpenAPI
2. Configure o Environment:
   ```json
   {
     "baseUrl": "http://localhost:3000",
     "token": "seu_jwt_token_aqui"
   }
   ```

### Swagger UI
1. Acesse: `http://localhost:3000/api-docs` (se disponível)
2. Ou use o Swagger Editor online com o arquivo `openapi.yaml`
3. Selecione o servidor desejado no dropdown

## Variáveis de Ambiente Recomendadas

```bash
# Arquivo .env para desenvolvimento
INTERFACE_AGENT_PORT=3000
EVENT_AGENT_PORT=3001
PLANNING_AGENT_PORT=3002
EXECUTION_AGENT_PORT=3003
MONITORING_AGENT_PORT=3008
SECURITY_AGENT_PORT=3007
ACL_MIDDLEWARE_PORT=3006
POLICY_AGENT_PORT=3009
MARL_AGENT_PORT=3010
COORDINATION_AGENT_PORT=3011
MEDIATOR_AGENT_PORT=3012

# Infraestrutura
POSTGRES_PORT=5432
REDIS_PORT=6379
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
PGADMIN_PORT=8080
REDIS_COMMANDER_PORT=8081

# URLs base
BASE_URL=http://localhost:3000
API_VERSION=v1
```

## Resolução de Conflitos de Porta

### Conflitos Identificados
- **Porta 3000**: Grafana vs Interface Agent
- **Porta 3001**: Event Agent vs Monitoring Agent
- **Porta 3007**: Security Agent vs External Gateway
- **Porta 3010**: MARL Agent vs Orchestrator Agent

### Soluções
1. **Usar portas alternativas** conforme documentado
2. **Configurar variáveis de ambiente** específicas
3. **Usar Docker Compose** para isolamento
4. **Verificar portas disponíveis** antes de iniciar serviços

## Scripts de Verificação

### Verificar Portas Disponíveis (PowerShell)
```powershell
# Verificar se porta está em uso
netstat -an | findstr :3000

# Verificar múltiplas portas
$ports = @(3000,3001,3002,3003,3004,3005,3006,3007,3008,3009,3010,3011,3012)
foreach ($port in $ports) {
    $result = netstat -an | findstr ":$port"
    if ($result) {
        Write-Host "Porta $port está em uso: $result"
    } else {
        Write-Host "Porta $port está disponível"
    }
}
```

### Health Check dos Agentes
```bash
# Verificar status dos agentes
curl http://localhost:3000/health  # Interface Agent
curl http://localhost:3001/health  # Event Agent
curl http://localhost:3002/health  # Planning Agent
curl http://localhost:3003/health  # Execution Agent
# ... continue para outros agentes
```

## Comandos Docker Compose

```bash
# Iniciar todos os serviços
docker-compose -f docker-compose.dev.yml up -d

# Verificar status
docker-compose -f docker-compose.dev.yml ps

# Ver logs de um serviço específico
docker-compose -f docker-compose.dev.yml logs interface-agent

# Parar todos os serviços
docker-compose -f docker-compose.dev.yml down
```

## Notas Importantes

1. **Autenticação**: Todos os endpoints (exceto `/auth/login`) requerem Bearer Token
2. **CORS**: Configurado para desenvolvimento local
3. **Rate Limiting**: Aplicado conforme configuração de cada agente
4. **Health Checks**: Disponíveis em `/health` para cada agente
5. **Métricas**: Expostas em `/metrics` (formato Prometheus)

## Links Úteis

- [Documentação Principal](./API_OVERVIEW.md)
- [Configuração de Portas](./PORTAS_CONFIGURADAS.md)
- [OpenAPI Specification](./openapi.yaml)
- [Docker Compose](../docker-compose.dev.yml)
- [Configurações](../src/config/index.js)