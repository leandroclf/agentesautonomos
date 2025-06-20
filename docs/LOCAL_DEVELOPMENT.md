# Desenvolvimento Local - Agentes Autônomos

## Visão Geral

Este guia explica como configurar e executar o ambiente de desenvolvimento local dos Agentes Autônomos.

## Estrutura Simplificada

### Ambiente Local (Desenvolvimento)
- **LocalStack**: Simula serviços AWS (SQS, S3, DynamoDB)
- **PostgreSQL**: Banco de dados local
- **Redis**: Cache local
- **Prometheus + Grafana**: Monitoramento

### Ambiente AWS (Produção)
- **SQS Real**: Filas de mensagens AWS
- **RDS PostgreSQL**: Banco de dados gerenciado
- **ElastiCache Redis**: Cache gerenciado
- **S3**: Armazenamento de objetos

## Pré-requisitos

- Node.js 18+
- Docker e Docker Compose
- Git

## 🚀 Configuração Rápida (Novo Sistema)

> ⚡ **Configuração Automatizada**: Agora você pode configurar todo o ambiente com um único comando!

### Configuração Completa Automatizada
```bash
# Clone o repositório
git clone <repository-url>
cd agentesautonomos

# Instale dependências
npm install

# Configure e inicie todo o ambiente automaticamente
npm run dev
```

### Comandos Alternativos
```bash
# Configuração rápida (se Docker já estiver rodando)
npm run dev:quick

# Apenas testes de eventos
npm run dev:test

# Limpeza do ambiente
npm run dev:clean
```

> 📚 **Documentação Detalhada**: Para mais informações, consulte o [Guia de Desenvolvimento Completo](./GUIA_DESENVOLVIMENTO_COMPLETO.md).

## Configuração Manual (Método Antigo)

### 1. Clonar o Repositório
```bash
git clone <repository-url>
cd agentesautonomos
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Ambiente Local (Manual)
```bash
# Copiar arquivo de configuração
cp .env.development.local.example .env.development.local

# Editar configurações se necessário
# O arquivo já vem com configurações padrão para desenvolvimento
```

### 4. Iniciar Ambiente Completo
```bash
# Script único que inicia tudo
node dev/scripts/start-dev-environment.js
```

Este script irá:
1. Iniciar serviços Docker (LocalStack, PostgreSQL, Redis, etc.)
2. Aguardar serviços ficarem prontos
3. Iniciar todos os agentes
4. Mostrar URLs disponíveis

## Scripts Disponíveis

### Desenvolvimento Local
```bash
# Iniciar ambiente completo
node dev/scripts/start-dev-environment.js

# Apenas configurar ambiente (sem iniciar agentes)
node dev/scripts/setup-local-environment.js

# Monitorar sistema
node dev/scripts/monitor.js

# Testar sistema
node dev/scripts/test-system.js
```

### Produção AWS
```bash
# Deploy em produção
node deploy/aws/deploy-production.js

# Configurar recursos AWS
node deploy/aws/setup.js

# Verificar recursos AWS
node deploy/aws/verify.js
```

## Arquivos de Configuração

### Desenvolvimento Local
- `.env.development.local` - Configurações locais com Docker
- `docker-compose.dev.yml` - Serviços para desenvolvimento

### Produção AWS
- `.env.production` - Configurações de produção
- `docker-compose.aws.yml` - Serviços para produção

## URLs dos Serviços

### Agentes (Desenvolvimento)
- External Gateway: http://localhost:3001
- Interface Agent: http://localhost:3002
- Event Agent: http://localhost:3003
- Planning Agent: http://localhost:3004
- Execution Agent: http://localhost:3005
- Monitoring Agent: http://localhost:3006
- Learning Agent: http://localhost:3007
- Coordination Agent: http://localhost:3008
- Resource Agent: http://localhost:3009
- Security Agent: http://localhost:3010
- Context Agent: http://localhost:3011

### Ferramentas de Administração
- **PgAdmin**: http://localhost:8080
  - Email: admin@agentes.local
  - Senha: admin123
- **Redis Commander**: http://localhost:8081
- **Grafana**: http://localhost:3000
  - Usuário: admin
  - Senha: admin123
- **Prometheus**: http://localhost:9090

## Estrutura de Pastas

```
├── dev/
│   └── scripts/
│       ├── start-dev-environment.js    # Script principal para desenvolvimento
│       ├── setup-local-environment.js  # Configuração do ambiente
│       ├── monitor.js                  # Monitoramento
│       └── test-system.js             # Testes
├── deploy/
│   └── aws/
│       ├── deploy-production.js       # Deploy em produção
│       ├── setup.js                   # Configuração AWS
│       └── verify.js                  # Verificação AWS
├── config/
│   ├── prometheus.yml                 # Configuração Prometheus
│   └── grafana/                       # Configurações Grafana
├── docker-compose.dev.yml             # Docker para desenvolvimento
├── docker-compose.aws.yml             # Docker para produção
├── .env.development.local             # Configurações locais
└── .env.production                    # Configurações produção
```

## Troubleshooting

### Problemas Comuns

#### 1. Porta já em uso
```bash
# Verificar processos usando portas
netstat -ano | findstr :3001

# Parar processo específico
taskkill /PID <PID> /F
```

#### 2. Docker não inicia
```bash
# Verificar status do Docker
docker info

# Reiniciar Docker Desktop
# Ou reiniciar serviço Docker no Linux
sudo systemctl restart docker
```

#### 3. Serviços não ficam prontos
```bash
# Verificar logs dos containers
docker-compose -f docker-compose.dev.yml logs

# Verificar status dos containers
docker-compose -f docker-compose.dev.yml ps
```

#### 4. Erro de conexão com Redis/PostgreSQL
```bash
# Verificar se serviços estão rodando
docker-compose -f docker-compose.dev.yml ps

# Reiniciar serviços específicos
docker-compose -f docker-compose.dev.yml restart redis postgres
```

### Logs e Debugging

```bash
# Logs de todos os serviços
docker-compose -f docker-compose.dev.yml logs -f

# Logs de um serviço específico
docker-compose -f docker-compose.dev.yml logs -f redis

# Logs dos agentes
# Os logs aparecem no terminal onde o script foi executado
```

### Limpeza do Ambiente

```bash
# Parar todos os serviços
docker-compose -f docker-compose.dev.yml down

# Remover volumes (dados serão perdidos)
docker-compose -f docker-compose.dev.yml down -v

# Limpar imagens não utilizadas
docker system prune -f
```

## Migração de Dados

### Backup Local
```bash
# Backup PostgreSQL
docker exec agentes-postgres pg_dump -U postgres agentes_autonomos > backup.sql

# Backup Redis
docker exec agentes-redis redis-cli --rdb /data/backup.rdb
```

### Restore Local
```bash
# Restore PostgreSQL
docker exec -i agentes-postgres psql -U postgres agentes_autonomos < backup.sql

# Restore Redis
docker cp backup.rdb agentes-redis:/data/
docker exec agentes-redis redis-cli DEBUG RELOAD
```

## Performance e Monitoramento

### Métricas Disponíveis
- CPU e memória dos agentes
- Latência das requisições
- Throughput das filas SQS
- Conexões de banco de dados
- Cache hit/miss ratio

### Dashboards Grafana
- **System Overview**: Visão geral do sistema
- **Agent Performance**: Performance individual dos agentes
- **Queue Monitoring**: Monitoramento das filas
- **Database Metrics**: Métricas do banco de dados

## Próximos Passos

1. **Desenvolvimento**: Use o ambiente local para desenvolvimento
2. **Testes**: Execute testes de integração
3. **Deploy**: Configure produção AWS quando pronto
4. **Monitoramento**: Configure alertas no Grafana

## Suporte

Para problemas ou dúvidas:
1. Verifique os logs dos serviços
2. Consulte a seção de troubleshooting
3. Verifique a documentação específica de cada agente
4. Abra uma issue no repositório