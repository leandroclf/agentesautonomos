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

## 📁 Estrutura do Projeto

```
├── src/                   # Código fonte dos agentes
├── dev/                   # Scripts e ferramentas de desenvolvimento
│   ├── setup.js          # Configuração do ambiente de desenvolvimento
│   ├── local-stack.js    # Gerenciamento do LocalStack
│   ├── mocks/            # Serviços mock para desenvolvimento
│   └── scripts/          # Scripts auxiliares de desenvolvimento
├── deploy/                # Scripts de deploy e produção
│   ├── aws/              # Scripts específicos para AWS
│   ├── production/       # Deploy para produção
│   └── staging/          # Deploy para staging
├── infrastructure/        # Infraestrutura como código
│   ├── localstack/       # Configuração LocalStack (desenvolvimento)
│   ├── aws/              # Infraestrutura AWS (Terraform, CloudFormation)
│   ├── kubernetes/       # Manifests Kubernetes
│   ├── docker/           # Dockerfiles e configurações
│   └── monitoring/       # Configurações de monitoramento
├── config/                # Configurações centralizadas
│   ├── environments/     # Templates de ambiente (.env)
│   ├── app-configs/      # Configurações da aplicação
│   └── monitoring/       # Configurações de monitoramento
├── docs/                  # Documentação do projeto
├── tests/                 # Testes automatizados
└── scripts/               # Scripts utilitários gerais
```

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

3. **Configure o ambiente de desenvolvimento**
   ```bash
   npm run dev:setup
   ```

### Desenvolvimento Local

1. **Inicie o LocalStack**
   ```bash
   npm run localstack:up
   ```

2. **Configure os recursos AWS locais**
   ```bash
   npm run localstack:setup
   ```

3. **Inicie todos os agentes**
   ```bash
   npm start
   ```

4. **Ou inicie individualmente**
   ```bash
   npm run start:interface    # Interface Agent (porta 3000)
   npm run start:event        # Event Agent (porta 3001)
   npm run start:planning     # Planning Agent (porta 3002)
   npm run start:execution    # Execution Agent (porta 3003)
   ```

### Execução com Docker

```bash
# Subir todos os serviços
npm run docker:up

# Ver logs
npm run docker:logs

# Parar serviços
npm run docker:down
```

## 🔧 Configuração

### Ambientes

O projeto suporta múltiplos ambientes com configurações específicas:

- **Desenvolvimento**: `config/environments/.env.development`
- **Staging**: `config/environments/.env.staging`
- **Produção**: `config/environments/.env.production`

### Variáveis de Ambiente Principais

```bash
# Ambiente
NODE_ENV=development|staging|production

# Portas dos Agentes
INTERFACE_AGENT_PORT=3000
EVENT_AGENT_PORT=3001
PLANNING_AGENT_PORT=3002
EXECUTION_AGENT_PORT=3003

# AWS/LocalStack
AWS_REGION=us-east-1
SQS_ENDPOINT=http://localhost:4566  # LocalStack

# Filas SQS
EVENT_QUEUE_URL=event-agent-queue
PLANNING_QUEUE_URL=planning-agent-queue
EXECUTION_QUEUE_URL=execution-agent-queue
```

## 🧪 Testes

```bash
# Todos os testes
npm test

# Testes unitários
npm run test:unit

# Testes de sistema
npm run test:system

# Cobertura
npm run test:coverage
```

## 📊 Monitoramento

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001
- **Métricas dos Agentes**: http://localhost:9464/metrics

## 🚀 Deploy

### AWS
```bash
# Configurar infraestrutura
npm run aws:setup

# Verificar configuração
npm run aws:verify
```

### Kubernetes
```bash
# Deploy via Helm
helm install agentes infrastructure/kubernetes/helm-charts/agentes

# Deploy via manifests
kubectl apply -k infrastructure/kubernetes/overlays/production
```

## 📚 Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Desenvolvimento Local](docs/LOCAL_DEVELOPMENT.md)
- [Deploy](docs/DEPLOYMENT.md)
- [API](docs/API.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

Para suporte e dúvidas:
- Consulte a [documentação](docs/)
- Abra uma [issue](https://github.com/seu-usuario/agentesautonomos/issues)
- Entre em contato com a equipe de arquitetura