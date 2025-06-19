# Migração da Estrutura do Projeto

## Visão Geral

Este documento detalha a migração completa da estrutura do projeto para seguir padrões enterprise de organização, melhorando a manutenibilidade, escalabilidade e experiência do desenvolvedor.

## Nova Estrutura

### Antes vs Depois

**Estrutura Anterior:**
```
├── scripts/          # Scripts misturados
├── config/           # Configurações básicas
├── src/              # Código fonte
└── docs/             # Documentação
```

**Nova Estrutura:**
```
├── dev/              # Desenvolvimento local
│   ├── scripts/      # Scripts de desenvolvimento
│   ├── mocks/        # APIs mock
│   └── setup.js      # Configuração local
├── deploy/           # Deployment e produção
│   ├── aws/          # Scripts AWS
│   ├── staging/      # Ambiente de staging
│   └── production/   # Ambiente de produção
├── infrastructure/   # Infraestrutura como código
│   ├── localstack/   # LocalStack setup
│   ├── aws/          # Recursos AWS
│   ├── kubernetes/   # Manifests K8s
│   └── docker/       # Dockerfiles
├── config/           # Configurações centralizadas
│   ├── environments/ # Configs por ambiente
│   ├── monitoring/   # Prometheus, Grafana
│   └── app-configs/  # Configurações da aplicação
├── src/              # Código fonte (inalterado)
└── docs/             # Documentação
```

## Mudanças Implementadas

### 1. Reorganização de Scripts

#### Scripts de Desenvolvimento (`/dev/`)
- `dev-setup.js` → `dev/setup.js`
- `local-env-manager.js` → `dev/local-stack.js`
- `start-all.js` → `dev/scripts/start-all.js`
- `start-mocks.js` → `dev/scripts/start-mocks.js`
- `test-system.js` → `dev/scripts/test-system.js`
- `monitor.js` → `dev/scripts/monitor.js`
- `setup-environment.js` → `dev/scripts/setup-environment.js`
- `setup-local-environment.js` → `dev/scripts/setup-local-environment.js`
- `start-all-mocks.js` → `dev/scripts/start-all-mocks.js`

#### Scripts de Deployment (`/deploy/`)
- `aws-setup.js` → `deploy/aws/setup.js`
- `aws-verify.js` → `deploy/aws/verify.js`
- `provision-sqs.js` → `deploy/aws/provision-sqs.js`

#### Infraestrutura (`/infrastructure/`)
- `setup-aws.ps1` → `infrastructure/localstack/setup.ps1`
- `scripts/sql/` → `infrastructure/localstack/init-scripts/sql/`

#### Mocks (`/dev/mocks/`)
- `src/mocks/` → `dev/mocks/`

### 2. Configurações Centralizadas (`/config/`)

#### Ambientes
- `.env.development` - Configurações para desenvolvimento local
- `.env.production` - Configurações para produção

#### Monitoramento
- `prometheus.yml` → `config/monitoring/prometheus.yml`
- `grafana/` → `config/monitoring/grafana/`

### 3. Infraestrutura como Código

#### LocalStack
- `docker-compose.yml` - Orquestração de serviços locais
- `01-setup-resources.sh` - Script de inicialização de recursos

### 4. Atualização do package.json

```json
{
  "scripts": {
    "dev:setup": "node dev/setup.js",
    "start": "node dev/scripts/start-all.js",
    "aws:setup": "node deploy/aws/setup.js",
    "aws:verify": "node deploy/aws/verify.js",
    "localstack:up": "cd infrastructure/localstack && docker-compose up -d",
    "localstack:down": "cd infrastructure/localstack && docker-compose down",
    "localstack:setup": "cd infrastructure/localstack && ./init-scripts/01-setup-resources.sh"
  }
}
```

## Benefícios da Nova Estrutura

### 1. Separação Clara de Responsabilidades
- **Desenvolvimento**: Scripts e recursos para desenvolvimento local
- **Deployment**: Scripts específicos para diferentes ambientes
- **Infraestrutura**: Configurações de infraestrutura isoladas
- **Configuração**: Configurações centralizadas por ambiente

### 2. Melhor Experiência do Desenvolvedor
- Acesso rápido a scripts de desenvolvimento
- Configuração local simplificada
- Documentação clara em cada pasta

### 3. Escalabilidade
- Estrutura preparada para crescimento
- Fácil adição de novos ambientes
- Separação entre desenvolvimento e produção

### 4. Padrões Enterprise
- Segue convenções de projetos enterprise
- Facilita onboarding de novos desenvolvedores
- Melhora a manutenibilidade

## Guia de Uso

### Desenvolvimento Local
```bash
# Configurar ambiente local
npm run dev:setup

# Iniciar LocalStack
npm run localstack:up

# Configurar recursos LocalStack
npm run localstack:setup

# Iniciar todos os serviços
npm start
```

### Deployment
```bash
# Configurar AWS
npm run aws:setup

# Verificar configuração AWS
npm run aws:verify
```

### Infraestrutura
```bash
# Subir ambiente local completo
cd infrastructure/localstack
docker-compose up -d

# Parar ambiente local
docker-compose down
```

## Migração Automática

Para facilitar futuras reorganizações, foi criado o script:
```bash
node dev/scripts/migrate-project-structure.js
```

Este script automatiza:
- Criação de diretórios
- Movimentação de arquivos
- Atualização do package.json
- Validação da estrutura

## Próximos Passos

1. **Validação**: Testar todos os scripts nas novas localizações
2. **Documentação**: Atualizar READMEs específicos se necessário
3. **CI/CD**: Atualizar pipelines para usar novos caminhos
4. **Treinamento**: Orientar equipe sobre nova estrutura

## Troubleshooting

### Problemas Comuns

1. **Scripts não encontrados**
   - Verificar se o package.json foi atualizado
   - Confirmar se os arquivos foram movidos corretamente

2. **Permissões de execução**
   - No Linux/Mac: `chmod +x infrastructure/localstack/init-scripts/*.sh`

3. **Caminhos relativos quebrados**
   - Revisar imports e requires nos scripts movidos
   - Atualizar caminhos relativos conforme necessário

## Conclusão

A nova estrutura do projeto segue padrões enterprise e melhora significativamente a organização, manutenibilidade e experiência do desenvolvedor. A separação clara entre desenvolvimento, deployment, infraestrutura e configurações facilita o crescimento e a manutenção do projeto.