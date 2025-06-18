# Ambiente de Desenvolvimento Local

Este guia explica como configurar e usar o ambiente de desenvolvimento local para o sistema de Agentes Autônomos.

## 📋 Pré-requisitos

### Software Necessário

1. **Docker Desktop**
   - Windows: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
   - Certifique-se de que o Docker está rodando

2. **Node.js** (versão 16 ou superior)
   - [Download Node.js](https://nodejs.org/)

3. **AWS CLI** (para LocalStack)
   ```bash
   # Windows (usando Chocolatey)
   choco install awscli
   
   # Ou baixar diretamente
   # https://aws.amazon.com/cli/
   ```

4. **Git**
   - [Download Git](https://git-scm.com/)

### Verificação dos Pré-requisitos

```bash
# Verificar Docker
docker --version
docker ps

# Verificar Node.js
node --version
npm --version

# Verificar AWS CLI
aws --version
```

## 🚀 Configuração Inicial

### 1. Instalação das Dependências

```bash
# Instalar dependências do projeto
npm install
```

### 2. Configuração Automática do Ambiente

```bash
# Configurar ambiente completo automaticamente
npm run setup:local
```

Este comando irá:
- Criar arquivo `docker-compose.yml`
- Configurar scripts SQL de inicialização
- Criar arquivo `.env.local` com configurações
- Iniciar todos os serviços Docker
- Criar filas SQS no LocalStack
- Gerar collection do Postman
- Criar script de inicialização rápida

### 3. Configuração Manual (Alternativa)

Se preferir configurar manualmente:

```bash
# Copiar arquivo de ambiente
cp .env.local .env

# Iniciar serviços
npm run env:start

# Aguardar serviços ficarem prontos
npm run env:status
```

## 🔧 Gerenciamento do Ambiente

### Scripts Disponíveis

| Comando | Descrição |
|---------|----------|
| `npm run env:start` | Iniciar todos os serviços |
| `npm run env:stop` | Parar todos os serviços |
| `npm run env:restart` | Reiniciar todos os serviços |
| `npm run env:status` | Verificar status dos serviços |
| `npm run env:logs` | Ver logs dos serviços |
| `npm run env:clean` | Limpar dados de desenvolvimento |
| `npm run env:reset` | Resetar ambiente completamente |
| `npm run env:backup` | Fazer backup dos dados |

### Gerenciamento Granular

```bash
# Iniciar serviço específico
node scripts/local-env-manager.js start postgres
node scripts/local-env-manager.js start redis
node scripts/local-env-manager.js start localstack

# Ver logs de um serviço
node scripts/local-env-manager.js logs localstack
node scripts/local-env-manager.js logs-f postgres  # seguir logs em tempo real

# Parar serviço específico
node scripts/local-env-manager.js stop redis
```

## 🌐 Serviços e Portas

### Serviços de Infraestrutura

| Serviço | Porta | URL | Credenciais |
|---------|-------|-----|-------------|
| **LocalStack** | 4566 | http://localhost:4566 | - |
| **PostgreSQL** | 5432 | localhost:5432 | postgres/postgres123 |
| **Redis** | 6379 | localhost:6379 | - |
| **PgAdmin** | 8080 | http://localhost:8080 | admin@agentes.local/admin123 |
| **Redis Commander** | 8081 | http://localhost:8081 | - |

### Agentes

| Agente | Porta | URL | Health Check |
|--------|-------|-----|-------------|
| **Event Agent** | 3003 | http://localhost:3003 | /health |
| **Planning Agent** | 3004 | http://localhost:3004 | /health |
| **Execution Agent** | 3005 | http://localhost:3005 | /health |
| **Monitoring Agent** | 3006 | http://localhost:3006 | /health |
| **Security Agent** | 3007 | http://localhost:3007 | /health |
| **Policy Agent** | 3008 | http://localhost:3008 | /health |

## 📊 Monitoramento e Logs

### Verificar Status

```bash
# Status completo do ambiente
npm run env:status

# Status dos agentes
npm run status
```

### Visualizar Logs

```bash
# Logs de todos os serviços
docker-compose logs

# Logs de um serviço específico
docker-compose logs localstack
docker-compose logs postgres

# Seguir logs em tempo real
docker-compose logs -f redis
```

### Interfaces Web

1. **PgAdmin** (http://localhost:8080)
   - Gerenciar banco PostgreSQL
   - Login: admin@agentes.local / admin123

2. **Redis Commander** (http://localhost:8081)
   - Visualizar dados do Redis
   - Monitorar cache e sessões

3. **LocalStack Dashboard** (http://localhost:4566)
   - Status dos serviços AWS simulados
   - Gerenciar filas SQS

## 🧪 Testes e Desenvolvimento

### Iniciar Agentes

```bash
# Iniciar todos os agentes
npm run start:all

# Iniciar agente específico
npm run start:event
npm run start:planning
npm run start:execution
```

### Testes com Postman

1. Importar collection: `postman/agentes-autonomos-local.postman_collection.json`
2. Configurar variáveis de ambiente no Postman
3. Executar requests de teste

### Testes com cURL

```bash
# Health check dos agentes
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health

# Criar evento
curl -X POST http://localhost:3003/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "user_action",
    "source": "test",
    "data": {
      "action": "test_action",
      "userId": "test123"
    }
  }'

# Listar eventos
curl http://localhost:3003/api/events
```

## 🗄️ Banco de Dados

### Estrutura do Banco

O banco PostgreSQL é inicializado automaticamente com:

- **Schema**: `agentes`
- **Tabelas**:
  - `events` - Eventos do sistema
  - `plans` - Planos de execução
  - `executions` - Execuções realizadas
  - `metrics` - Métricas dos agentes
  - `policies` - Políticas do sistema
  - `policy_violations` - Violações de política

### Conectar ao Banco

```bash
# Via Docker
docker exec -it agentes-postgres psql -U postgres agentes_autonomos

# Via PgAdmin (http://localhost:8080)
# Host: postgres
# Port: 5432
# Database: agentes_autonomos
# Username: postgres
# Password: postgres123
```

### Queries Úteis

```sql
-- Listar eventos recentes
SELECT * FROM agentes.events ORDER BY created_at DESC LIMIT 10;

-- Verificar status dos planos
SELECT status, COUNT(*) FROM agentes.plans GROUP BY status;

-- Métricas por agente
SELECT agent_id, COUNT(*) as total_metrics 
FROM agentes.metrics 
GROUP BY agent_id;
```

## 📋 Filas SQS (LocalStack)

### Filas Criadas Automaticamente

**Filas Principais:**
- `event-agent-queue-dev`
- `planning-agent-queue-dev`
- `execution-agent-queue-dev`
- `monitoring-agent-queue-dev`
- `security-agent-queue-dev`
- `policy-agent-queue-dev`

**Dead Letter Queues (DLQ):**
- `event-agent-queue-dev-dlq`
- `planning-agent-queue-dev-dlq`
- `execution-agent-queue-dev-dlq`
- `monitoring-agent-queue-dev-dlq`
- `security-agent-queue-dev-dlq`
- `policy-agent-queue-dev-dlq`

### Comandos AWS CLI para LocalStack

```bash
# Listar filas
aws --endpoint-url=http://localhost:4566 sqs list-queues --region us-east-1

# Enviar mensagem
aws --endpoint-url=http://localhost:4566 sqs send-message \
  --queue-url http://localhost:4566/000000000000/event-agent-queue-dev \
  --message-body '{"test": "message"}' \
  --region us-east-1

# Receber mensagens
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/event-agent-queue-dev \
  --region us-east-1
```

## 🔧 Solução de Problemas

### Problemas Comuns

#### 1. Docker não está rodando
```bash
# Verificar status do Docker
docker ps

# Se não funcionar, iniciar Docker Desktop
```

#### 2. Portas em uso
```bash
# Verificar quais portas estão em uso
netstat -an | findstr :4566
netstat -an | findstr :5432

# Parar serviços conflitantes
npm run env:stop
```

#### 3. Serviços não ficam prontos
```bash
# Verificar logs dos serviços
npm run env:logs localstack
npm run env:logs postgres

# Reiniciar serviços
npm run env:restart
```

#### 4. Agentes não conseguem conectar
```bash
# Verificar se .env está configurado corretamente
cat .env

# Verificar se LocalStack está rodando
curl http://localhost:4566/health

# Verificar filas SQS
aws --endpoint-url=http://localhost:4566 sqs list-queues --region us-east-1
```

### Logs de Debug

```bash
# Habilitar logs detalhados
export LOG_LEVEL=debug

# Ou no arquivo .env
LOG_LEVEL=debug
```

### Reset Completo

```bash
# Se tudo falhar, reset completo
npm run env:reset

# Ou manualmente
docker-compose down -v
docker system prune -f
npm run setup:local
```

## 💾 Backup e Restore

### Fazer Backup

```bash
# Backup automático
npm run env:backup

# Backup será salvo em: backups/YYYY-MM-DDTHH-mm-ss/
```

### Restaurar Backup

```bash
# Restaurar backup específico
node scripts/local-env-manager.js restore backups/2024-01-15T10-30-00
```

### Backup Manual

```bash
# Backup PostgreSQL
docker exec agentes-postgres pg_dump -U postgres agentes_autonomos > backup.sql

# Backup Redis
docker exec agentes-redis redis-cli BGSAVE
docker cp agentes-redis:/data/dump.rdb ./redis-backup.rdb
```

## 🔄 Fluxo de Desenvolvimento

### 1. Iniciar Dia de Trabalho

```bash
# Verificar status
npm run env:status

# Iniciar se necessário
npm run env:start

# Iniciar agentes
npm run start:all
```

### 2. Durante o Desenvolvimento

```bash
# Monitorar logs
npm run env:logs

# Verificar saúde dos serviços
npm run env:status

# Reiniciar agente específico
npm run restart:event
```

### 3. Finalizar Dia de Trabalho

```bash
# Parar agentes
npm run stop:all

# Fazer backup (opcional)
npm run env:backup

# Parar serviços (opcional)
npm run env:stop
```

## 📚 Recursos Adicionais

### Documentação

- [README Principal](./README.md)
- [Plano de Implementação](./PLANO_SEQUENCIAL_IMPLEMENTACAO.md)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [LocalStack Documentation](https://docs.localstack.cloud/)

### Ferramentas Úteis

- **Docker Desktop**: Interface gráfica para Docker
- **Postman**: Testes de API
- **DBeaver**: Cliente universal de banco de dados
- **Redis Desktop Manager**: Cliente gráfico para Redis

### Scripts de Automação

- `scripts/setup-local-environment.js` - Configuração inicial
- `scripts/local-env-manager.js` - Gerenciamento do ambiente
- `quick-start.sh` - Script bash para inicialização rápida

## 🆘 Suporte

Se encontrar problemas:

1. Verificar logs dos serviços
2. Consultar seção de solução de problemas
3. Fazer reset do ambiente
4. Verificar documentação do Docker/LocalStack
5. Criar issue no repositório do projeto

---

**Última atualização**: 2024-01-15
**Versão**: 1.0.0