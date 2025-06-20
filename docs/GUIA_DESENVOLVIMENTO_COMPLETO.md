# Guia Completo de Desenvolvimento - Agentes Autônomos

## Visão Geral

Este guia apresenta o sistema completo de configuração do ambiente de desenvolvimento, que automatiza todo o processo desde a instalação de dependências até a execução de testes de eventos.

## 🚀 Início Rápido

### Configuração Completa (Recomendado)

```bash
# Configurar todo o ambiente do zero
npm run dev
```

Este comando executa:
1. ✅ Verificação e instalação de dependências
2. 🐳 Configuração e inicialização do Docker
3. 📬 Criação de filas SQS no LocalStack
4. 🤖 Inicialização de todos os agentes
5. 🧪 Execução de testes de eventos
6. 📊 Verificação final do sistema

### Comandos Alternativos

```bash
# Configuração rápida (assume Docker já rodando)
npm run dev:quick

# Apenas executar testes de eventos
npm run dev:test

# Limpar ambiente completamente
npm run dev:clean
```

## 📋 Pré-requisitos

### Software Necessário

- **Node.js** (v16 ou superior)
- **npm** (v8 ou superior)
- **Docker** (v20 ou superior)
- **Docker Compose** (v2 ou superior)

### Verificação dos Pré-requisitos

```bash
node --version    # v16+
npm --version     # v8+
docker --version  # v20+
docker-compose --version  # v2+
```

## 🏗️ Arquitetura do Sistema

### Serviços Docker

| Serviço | Porta | Descrição |
|---------|-------|----------|
| LocalStack | 4566 | Simulação AWS (SQS, S3, etc.) |
| PostgreSQL | 5432 | Banco de dados principal |
| Redis | 6379 | Cache e sessões |
| Prometheus | 9090 | Monitoramento e métricas |
| Grafana | 3000 | Dashboards e visualização |
| PgAdmin | 8080 | Interface web PostgreSQL |
| Redis Commander | 8081 | Interface web Redis |

### Agentes do Sistema

| Agente | Porta | Responsabilidade |
|--------|-------|------------------|
| Event Agent | 3001 | Recepção e roteamento de eventos |
| Planning Agent | 3002 | Planejamento e estratégia |
| Execution Agent | 3003 | Execução de tarefas |
| Monitoring Agent | 3004 | Monitoramento do sistema |
| Security Agent | 3005 | Segurança e autenticação |
| Interface Agent | 3006 | Interface e API externa |

## 🔧 Scripts Disponíveis

### Scripts Principais

```bash
# Configuração completa do ambiente
npm run dev

# Configuração rápida (Docker já rodando)
npm run dev:quick

# Executar apenas testes de eventos
npm run dev:test

# Limpar ambiente completamente
npm run dev:clean
```

### Scripts de Controle Docker

```bash
# Iniciar serviços Docker
npm run docker:up

# Parar serviços Docker
npm run docker:down

# Ver logs dos serviços
npm run docker:logs

# Rebuild dos containers
npm run docker:build
```

### Scripts de Teste

```bash
# Testes unitários
npm test

# Testes de sistema
npm run test:system

# Testes com cobertura
npm run test:coverage

# Teste de conectividade SQS
npm run test:sqs
```

## 🧪 Testes de Eventos

### Eventos de Teste Automáticos

O sistema executa automaticamente os seguintes testes:

#### 1. Evento de Login de Usuário
```json
{
  "type": "user_action",
  "data": {
    "action": "login",
    "userId": "user123",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "priority": "normal"
}
```

#### 2. Evento de Processamento de Dados
```json
{
  "type": "data_processing",
  "data": {
    "operation": "transform",
    "dataSize": 1024,
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "priority": "high"
}
```

#### 3. Evento de Alerta de Segurança
```json
{
  "type": "security_alert",
  "data": {
    "severity": "medium",
    "source": "firewall",
    "message": "Tentativa de acesso suspeita detectada",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "priority": "urgent"
}
```

### Testes Manuais

Para testes manuais, use:

```bash
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3001/api/events" -Method POST -ContentType "application/json" -Body '{
  "type": "custom_event",
  "data": {
    "message": "Teste manual"
  },
  "priority": "normal"
}'

# curl
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom_event",
    "data": {
      "message": "Teste manual"
    },
    "priority": "normal"
  }'
```

## 📊 Monitoramento

### Interfaces Web

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **PgAdmin**: http://localhost:8080
- **Redis Commander**: http://localhost:8081

### Health Checks

```bash
# Verificar LocalStack
curl http://localhost:4566/health

# Verificar Event Agent
curl http://localhost:3001/health

# Verificar Interface Agent
curl http://localhost:3006/health
```

## 🔍 Troubleshooting

### Problemas Comuns

#### 1. Docker não está rodando
```bash
# Windows
Start-Service docker

# Verificar status
docker info
```

#### 2. Portas em uso
```bash
# Verificar portas em uso
netstat -ano | findstr :4566
netstat -ano | findstr :3001

# Parar processos se necessário
taskkill /PID <PID> /F
```

#### 3. Problemas de conectividade SQS
```bash
# Verificar LocalStack
curl http://localhost:4566/health

# Recriar filas SQS
node scripts/setup-sqs-queues.js
```

#### 4. Agentes não iniciam
```bash
# Verificar logs
npm run docker:logs

# Reiniciar ambiente
npm run dev:clean
npm run dev
```

### Limpeza Completa

Se houver problemas persistentes:

```bash
# Parar tudo
npm run dev:clean

# Limpeza profunda do Docker
docker system prune -a -f
docker volume prune -f

# Reinstalar dependências
rm -rf node_modules
npm install

# Reconfigurar ambiente
npm run dev
```

## 📁 Estrutura de Arquivos

```
scripts/
├── setup-complete-dev-environment.js  # Script principal
├── dev.js                             # Script auxiliar
├── setup-sqs-queues.js               # Configuração SQS
└── ...

docs/
├── GUIA_DESENVOLVIMENTO_COMPLETO.md  # Este arquivo
├── SQS_SETUP_GUIDE.md               # Guia SQS
├── COMO_TESTAR_EVENTOS.md           # Testes manuais
└── ...

config/
├── environments/
│   ├── .env.development             # Configuração desenvolvimento
│   ├── .env.production              # Configuração produção
│   └── .env.test                    # Configuração testes
└── index.js                         # Configuração principal
```

## 🚀 Próximos Passos

Após a configuração bem-sucedida:

1. **Explore os Dashboards**
   - Acesse Grafana para métricas em tempo real
   - Configure alertas personalizados

2. **Desenvolva Novos Agentes**
   - Use a estrutura existente como base
   - Implemente novos tipos de eventos

3. **Customize Testes**
   - Adicione novos cenários de teste
   - Implemente testes de carga

4. **Deploy em Produção**
   - Configure AWS real
   - Implemente CI/CD

## 📚 Documentação Adicional

- [Guia de Configuração SQS](./SQS_SETUP_GUIDE.md)
- [Como Testar Eventos](./COMO_TESTAR_EVENTOS.md)
- [Arquitetura do Sistema](./ARQUITETURA.md)
- [Guia de Deploy](./DEPLOY.md)

## 🤝 Contribuição

Para contribuir com o projeto:

1. Fork o repositório
2. Crie uma branch para sua feature
3. Execute os testes: `npm test`
4. Execute o ambiente completo: `npm run dev`
5. Submeta um Pull Request

## 📞 Suporte

Em caso de problemas:

1. Consulte a seção [Troubleshooting](#-troubleshooting)
2. Verifique os logs: `npm run docker:logs`
3. Execute limpeza: `npm run dev:clean`
4. Abra uma issue no repositório

---

**Última atualização**: Janeiro 2024
**Versão**: 1.0.0