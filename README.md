# Sistema de Agentes Autônomos

Um sistema distribuído de agentes autônomos para processamento de eventos, planejamento e execução de tarefas, construído com Node.js e AWS SQS.

## 🏗️ Arquitetura

O sistema é composto por 4 agentes principais:

- **Interface Agent** (Porta 3000): Ponto de entrada para requisições externas
- **Event Agent** (Porta 3001): Processamento e roteamento de eventos
- **Planning Agent** (Porta 3002): Geração de planos de execução
- **Execution Agent** (Porta 3003): Execução de planos e tarefas

### Comunicação

- **HTTP**: Para APIs REST e health checks
- **SQS**: Para comunicação assíncrona entre agentes
- **Prometheus**: Para coleta de métricas
- **Grafana**: Para visualização e monitoramento

## 🚀 Início Rápido

### Pré-requisitos

- Node.js 18+
- Docker e Docker Compose
- npm ou yarn

### Instalação

1. **Clone o repositório**
   ```bash
   git clone <repository-url>
   cd agentesautonomos
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   ```bash
   cp .env.example .env
   # Edite o arquivo .env conforme necessário
   ```

### Execução com Docker (Recomendado)

```bash
# Inicia todos os serviços
docker-compose up -d

# Verifica o status
docker-compose ps

# Visualiza logs
docker-compose logs -f
```

### Execução Local

```bash
# Inicia todos os agentes
node scripts/start-all.js

# Ou inicie individualmente
node src/agents/core/interface-agent/index.js
node src/agents/core/event-agent/index.js
node src/agents/core/planning-agent/index.js
node src/agents/core/execution-agent/index.js
```

## 📊 Monitoramento

### URLs de Acesso

- **Interface Agent**: http://localhost:3000
- **Event Agent**: http://localhost:3001
- **Planning Agent**: http://localhost:3002
- **Execution Agent**: http://localhost:3003
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3100 (admin/admin)
- **SQS Local**: http://localhost:9324

### Health Checks

```bash
# Verifica saúde de todos os agentes
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### Métricas

```bash
# Métricas básicas
curl http://localhost:3000/metrics

# Métricas detalhadas
curl http://localhost:3000/metrics/detailed
```

## 🔧 Configuração

### Variáveis de Ambiente

```env
# Configuração do Agente
NODE_ENV=development
PORT=3000
AGENT_NAME=interface

# AWS/SQS
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
AWS_REGION=us-east-1
SQS_ENDPOINT=http://localhost:9324

# Outros Agentes
EVENT_AGENT_HOST=localhost
EVENT_AGENT_PORT=3001
PLANNING_AGENT_HOST=localhost
PLANNING_AGENT_PORT=3002
EXECUTION_AGENT_HOST=localhost
EXECUTION_AGENT_PORT=3003

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Métricas
METRICS_ENABLED=true
METRICS_PORT=9464
```

### Configuração SQS

O sistema usa ElasticMQ para simular SQS localmente. As filas são configuradas automaticamente:

- `interface-events`: Eventos do Interface Agent
- `event-processing`: Processamento de eventos
- `planning-requests`: Solicitações de planejamento
- `execution-requests`: Solicitações de execução
- `notifications`: Notificações do sistema
- `status-updates`: Atualizações de status

## 📝 API Reference

### Interface Agent

```bash
# Criar evento
POST /events
{
  "type": "user_request",
  "data": {
    "action": "process_data",
    "parameters": {}
  }
}

# Listar eventos
GET /events

# Status do evento
GET /events/:id/status
```

### Event Agent

```bash
# Processar evento
POST /process
{
  "eventId": "uuid",
  "type": "user_request",
  "data": {}
}

# Histórico de eventos
GET /events/history
```

### Planning Agent

```bash
# Criar plano
POST /plans
{
  "eventId": "uuid",
  "requirements": {
    "action": "process_data",
    "constraints": []
  }
}

# Listar planos
GET /plans

# Detalhes do plano
GET /plans/:id
```

### Execution Agent

```bash
# Executar plano
POST /execute
{
  "planId": "uuid",
  "priority": "normal"
}

# Status da execução
GET /executions/:id/status

# Parar execução
POST /executions/:id/stop

# Logs da execução
GET /executions/:id/logs
```

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Testes unitários
npm run test:unit

# Testes de integração
npm run test:integration

# Testes end-to-end
npm run test:e2e

# Coverage
npm run test:coverage
```

## 🔍 Troubleshooting

### Problemas Comuns

1. **Agentes não iniciam**
   - Verifique se as portas estão disponíveis
   - Confirme as variáveis de ambiente
   - Verifique os logs: `docker-compose logs <service>`

2. **SQS não conecta**
   - Verifique se o ElasticMQ está rodando
   - Confirme o endpoint SQS nas variáveis de ambiente
   - Teste: `curl http://localhost:9324`

3. **Métricas não aparecem**
   - Verifique se o Prometheus está coletando dados
   - Confirme a configuração em `config/prometheus.yml`
   - Verifique os targets no Prometheus UI

### Logs

```bash
# Logs de todos os serviços
docker-compose logs -f

# Logs de um serviço específico
docker-compose logs -f interface-agent

# Logs locais
tail -f logs/interface-agent.log
```

## 📁 Estrutura do Projeto

```
├── src/
│   ├── agents/
│   │   ├── core/           # Agentes principais
│   │   └── shared/         # Serviços compartilhados
│   ├── config/             # Configurações
│   └── utils/              # Utilitários
├── config/                 # Configurações externas
├── docker/                 # Dockerfiles
├── docs/                   # Documentação
├── scripts/                # Scripts de automação
└── tests/                  # Testes
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

Para suporte, abra uma issue no GitHub ou entre em contato com a equipe de desenvolvimento.

---

**Desenvolvido com ❤️ pela equipe de Agentes Autônomos**