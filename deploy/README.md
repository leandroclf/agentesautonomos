# Deploy e Produção

Esta pasta contém todos os scripts e configurações para deploy em diferentes ambientes (staging, produção, etc.).

## 📁 Estrutura

```
deploy/
├── README.md              # Este arquivo
├── aws/                   # Scripts específicos para AWS
│   ├── setup.js          # Configuração da infraestrutura AWS
│   ├── verify.js         # Verificação do ambiente AWS
│   └── provision-sqs.js  # Provisionamento de filas SQS
├── production/            # Scripts para ambiente de produção
│   └── deploy.js
├── staging/               # Scripts para ambiente de staging
│   └── deploy.js
└── ci-cd/                 # Configurações de CI/CD
    ├── github-actions/
    ├── jenkins/
    └── gitlab-ci/
```

## 🚀 Como usar

### Deploy para AWS
```bash
# Configurar infraestrutura AWS
node deploy/aws/setup.js

# Verificar configuração
node deploy/aws/verify.js

# Provisionar recursos SQS
node deploy/aws/provision-sqs.js
```

### Deploy para Staging
```bash
node deploy/staging/deploy.js
```

### Deploy para Produção
```bash
node deploy/production/deploy.js
```

## 🔧 Configuração

### Variáveis de Ambiente
Cada ambiente possui suas próprias variáveis:
- `deploy/aws/.env.aws`
- `deploy/staging/.env.staging`
- `deploy/production/.env.production`

### Credenciais AWS
Configure as credenciais AWS:
```bash
aws configure
# ou
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1
```

## 📋 Pré-requisitos

- AWS CLI configurado
- Credenciais AWS válidas
- Terraform (para infraestrutura como código)
- Docker (para containerização)

## 🔒 Segurança

- Nunca commite credenciais no repositório
- Use AWS IAM roles quando possível
- Mantenha secrets em AWS Secrets Manager
- Revise permissões regularmente

## 📊 Monitoramento

Após o deploy, verifique:
- CloudWatch Logs
- Métricas do Prometheus
- Dashboards do Grafana
- Health checks dos agentes