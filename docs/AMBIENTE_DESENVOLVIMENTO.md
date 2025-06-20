# Ambiente de Desenvolvimento - Guia Completo

## Visão Geral

Este documento descreve como configurar e usar o ambiente de desenvolvimento organizado para o projeto Agentes Autônomos. O novo sistema centraliza todos os recursos necessários em um único comando.

## Arquitetura do Ambiente

### Componentes Principais

#### 1. Infraestrutura Base
- **LocalStack**: Simula serviços AWS (SQS, S3, DynamoDB)
- **PostgreSQL**: Banco de dados principal
- **Redis**: Cache e sessões

#### 2. Monitoramento
- **Prometheus**: Coleta de métricas
- **Grafana**: Visualização e dashboards

#### 3. Agentes Autônomos
- **Interface Agent** (porta 3000): Interface principal
- **Event Agent** (porta 3001): Processamento de eventos
- **Planning Agent** (porta 3002): Planejamento e decisões
- **Execution Agent** (porta 3003): Execução de ações

#### 4. Ferramentas de Administração
- **PgAdmin** (porta 8080): Administração PostgreSQL
- **Redis Commander** (porta 8081): Administração Redis

## Comandos Principais

### Iniciar Ambiente Completo
```bash
npm run dev
```

Este comando:
1. Verifica pré-requisitos (Docker, Node.js)
2. Limpa ambiente anterior
3. Inicia infraestrutura base
4. Configura filas SQS automaticamente
5. Inicia monitoramento
6. Inicia todos os agentes
7. Verifica saúde do sistema

### Parar Ambiente
```bash
npm run dev:stop
```

### Comandos Alternativos
```bash
# Usar script legado (se necessário)
npm run dev:legacy

# Comandos Docker diretos
docker-compose -f docker-compose.dev.yml up -d  # Infraestrutura
docker-compose -f docker-compose.yml up -d      # Agentes
```

## Estrutura de Arquivos

### Docker Compose
- `docker-compose.dev.yml`: Infraestrutura e monitoramento
- `docker-compose.yml`: Agentes e SQS local (ElasticMQ)

### Scripts
- `scripts/start-dev-environment.js`: Script principal centralizado
- `scripts/setup-sqs-queues.js`: Configuração automática de filas
- `scripts/setup-complete-dev-environment.js`: Script legado

### Configurações
- `config/elasticmq.conf`: Configuração do SQS local
- `config/environments/.env.development`: Variáveis de ambiente
- `config/monitoring/prometheus.yml`: Configuração Prometheus

## Fluxo de Inicialização

### 1. Verificação de Pré-requisitos
- Docker e Docker Compose instalados
- Node.js e dependências npm
- Portas disponíveis

### 2. Limpeza do Ambiente
- Para containers existentes
- Remove containers órfãos
- Limpa volumes se necessário

### 3. Inicialização por Grupos

#### Grupo 1: Infraestrutura (30-45s)
```
LocalStack → PostgreSQL → Redis
```

#### Grupo 2: Configuração SQS (10-15s)
```
Aguarda LocalStack → Cria 16 filas SQS
```

#### Grupo 3: Monitoramento (15-20s)
```
Prometheus → Grafana
```

#### Grupo 4: Agentes (30-60s)
```
Interface → Event → Planning → Execution
```

### 4. Verificação de Saúde
- Health checks automáticos
- Relatório de status
- Identificação de problemas

## URLs de Acesso

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| Interface Agent | http://localhost:3000 | - |
| Event Agent | http://localhost:3001 | - |
| Planning Agent | http://localhost:3002 | - |
| Execution Agent | http://localhost:3003 | - |
| Grafana | http://localhost:3000 | admin/admin123 |
| Prometheus | http://localhost:9090 | - |
| PgAdmin | http://localhost:8080 | admin@agentes.local/admin123 |
| Redis Commander | http://localhost:8081 | - |
| LocalStack | http://localhost:4566 | - |

## Monitoramento e Debug

### Verificar Status dos Containers
```bash
docker ps
```

### Ver Logs
```bash
# Logs de um serviço específico
docker-compose logs -f [nome-do-serviço]

# Logs de todos os agentes
docker-compose logs -f interface-agent event-agent planning-agent execution-agent

# Logs da infraestrutura
docker-compose -f docker-compose.dev.yml logs -f localstack postgres redis
```

### Reiniciar Serviços
```bash
# Reiniciar um agente específico
docker-compose restart event-agent

# Reiniciar grupo de serviços
docker-compose -f docker-compose.dev.yml restart localstack
```

## Resolução de Problemas

### Problema: LocalStack não inicia
**Sintomas**: Erro de conexão na porta 4566
**Solução**:
```bash
# Verificar se a porta está em uso
netstat -an | findstr 4566

# Reiniciar LocalStack
docker-compose -f docker-compose.dev.yml restart localstack
```

### Problema: Agentes não conseguem conectar ao SQS
**Sintomas**: Erro "QueueDoesNotExist"
**Solução**:
```bash
# Recriar filas SQS
node scripts/setup-sqs-queues.js

# Reiniciar agentes
docker-compose restart event-agent planning-agent execution-agent
```

### Problema: Conflito de Portas
**Sintomas**: Erro "port already in use"
**Solução**:
```bash
# Identificar processo usando a porta
netstat -ano | findstr :3000

# Parar ambiente e tentar novamente
npm run dev:stop
npm run dev
```

### Problema: Containers Unhealthy
**Sintomas**: Status "unhealthy" no docker ps
**Solução**:
```bash
# Verificar logs do container
docker logs [container-name]

# Verificar health check
docker inspect [container-name] | grep -A 10 Health
```

## Desenvolvimento e Testes

### Testar Conectividade SQS
```bash
npm run test:sqs
```

### Executar Testes do Sistema
```bash
npm run test:system
```

### Monitorar Métricas
1. Acesse Grafana: http://localhost:3000
2. Login: admin/admin123
3. Navegue pelos dashboards pré-configurados

### Verificar Filas SQS
```bash
# Via AWS CLI (configurado para LocalStack)
aws --endpoint-url=http://localhost:4566 sqs list-queues

# Via interface web do LocalStack
curl http://localhost:4566/health
```

## Configurações Avançadas

### Variáveis de Ambiente
Edite `config/environments/.env.development` para personalizar:
- Credenciais de banco
- Configurações de rede
- Parâmetros dos agentes

### Volumes Docker
Os dados são persistidos em volumes nomeados:
- `postgres_data`: Dados PostgreSQL
- `redis_data`: Dados Redis
- `localstack_data`: Estado LocalStack
- `grafana_data`: Configurações Grafana
- `prometheus_data`: Métricas Prometheus

### Rede Docker
Todos os serviços usam a rede `agentes-network` (172.20.0.0/16)

## Migração do Sistema Anterior

Se você estava usando o sistema anterior:

1. **Pare o ambiente antigo**:
   ```bash
   docker-compose down
   docker-compose -f docker-compose.dev.yml down
   ```

2. **Use o novo sistema**:
   ```bash
   npm run dev
   ```

3. **Script legado ainda disponível**:
   ```bash
   npm run dev:legacy
   ```

## Próximos Passos

1. **Configurar IDE**: Configure seu editor para debug remoto
2. **Personalizar Dashboards**: Adicione métricas específicas no Grafana
3. **Implementar Testes**: Adicione testes de integração
4. **Otimizar Performance**: Ajuste recursos dos containers

## Suporte

Para problemas ou dúvidas:
1. Consulte os logs dos containers
2. Verifique a documentação específica em `docs/`
3. Execute o health check automático do script
4. Consulte o troubleshooting em `docs/TROUBLESHOOTING.md`