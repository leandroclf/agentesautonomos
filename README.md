# 🤖 Agentes Autônomos

Sistema distribuído de agentes autônomos para processamento de eventos, automação de tarefas e orquestração inteligente.

## 🏗️ Arquitetura

O sistema é baseado em uma arquitetura de microserviços com agentes especializados que se comunicam via mensageria assíncrona (SQS) e mantêm estado compartilhado.

### Componentes Principais

- **Agentes Core**: Processamento principal (State Management, Event Processing, Policy Management)
- **Agentes Auxiliares**: Funções de suporte (Monitoring, Notification, Audit)
- **Infraestrutura**: AWS SQS, S3, PostgreSQL, Redis
- **Observabilidade**: Métricas, logs, health checks e DLQ monitoring

## 📁 Estrutura do Projeto

```
├── src/
│   ├── agents/
│   │   ├── core/              # Agentes principais
│   │   │   ├── state-management/
│   │   │   ├── event-processing/
│   │   │   ├── policy-management/
│   │   │   └── schema-registry/
│   │   └── auxiliary/         # Agentes auxiliares
│   │       ├── monitoring/
│   │       ├── notification/
│   │       └── audit/
│   ├── utils/                 # Utilitários compartilhados
│   │   ├── logger.js
│   │   ├── observability.js
│   │   └── metrics-server.js
│   ├── config/                # Configurações
│   └── mocks/                 # APIs mock para desenvolvimento
├── infrastructure/            # Configurações de infraestrutura
│   ├── aws/
│   ├── kubernetes/
│   ├── helm/
│   └── docker/
├── tests/                     # Testes automatizados
├── scripts/                   # Scripts de automação
├── docs/                      # Documentação técnica
└── docker-compose.yml         # Ambiente local
```

## 🚀 Execução Local

### Pré-requisitos

- Node.js 18+
- Docker e Docker Compose
- AWS CLI (opcional, para produção)

### Configuração Inicial

1. **Clone e instale dependências:**
   ```bash
   git clone <repository>
   cd agentesautonomos
   npm install
   ```

2. **Configure variáveis de ambiente:**
   ```bash
   cp .env.template .env
   # Edite .env conforme necessário
   ```

3. **Inicie a infraestrutura local:**
   ```bash
   docker-compose up -d
   ```

4. **Configure AWS/LocalStack:**
   ```bash
   # Windows PowerShell
   .\scripts\setup-aws.ps1
   
   # Linux/Mac
   chmod +x scripts/setup-aws.sh
   ./scripts/setup-aws.sh
   ```

### Executando o Sistema

#### Opção 1: Sistema Completo
```bash
npm start
```

#### Opção 2: Componentes Individuais

**APIs Mock (desenvolvimento):**
```bash
node scripts/start-all-mocks.js
```

**Servidor de Métricas:**
```bash
node src/utils/metrics-server.js
```

**Agentes Específicos:**
```bash
# State Management Agent
node src/agents/core/state-management/index.js

# Event Processing Agent
node src/agents/core/event-processing/index.js
```

### Monitoramento e Observabilidade

- **Dashboard de Métricas**: http://localhost:9090/dashboard
- **Health Check**: http://localhost:9090/health
- **APIs Mock**:
  - Policy API: http://localhost:3001
  - State API: http://localhost:3002
  - Schema Registry: http://localhost:3003
- **LocalStack Console**: http://localhost:4566

## 🧪 Desenvolvimento

### Scripts Disponíveis

```bash
npm start              # Inicia o sistema completo
npm test               # Executa testes
npm run dev            # Modo desenvolvimento com hot-reload
npm run lint           # Verifica código
npm run format         # Formata código
npm run build          # Build para produção
```

### Testes

```bash
# Todos os testes
npm test

# Testes específicos
npm test -- --grep "State Management"

# Testes com coverage
npm run test:coverage
```

## 📊 Fase Atual: Fase 1 - Infraestrutura Base

### ✅ Concluído
- [x] Estrutura base do projeto
- [x] Docker Compose com LocalStack
- [x] Configuração de SQS queues e DLQs
- [x] APIs Mock para desenvolvimento
- [x] Sistema de observabilidade básico
- [x] Servidor de métricas HTTP
- [x] Documentação inicial

### 🔄 Próximos Passos (Fase 2)
- [ ] Implementação do State Management Agent
- [ ] Event Processing Agent
- [ ] Policy Management Agent
- [ ] Testes de integração
- [ ] CI/CD pipeline

## 📚 Documentação

- [Plano de Implementação Sequencial](docs/PLANO_SEQUENCIAL_IMPLEMENTACAO.md)
- [Arquitetura Detalhada](docs/ARQUITETURA.md)
- [Guia de Desenvolvimento](docs/DESENVOLVIMENTO.md)
- [APIs e Contratos](docs/APIS.md)

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

---

**Status do Projeto**: 🟡 Em Desenvolvimento Ativo (Fase 1)
**Última Atualização**: $(date)
**Versão**: 1.0.0-alpha