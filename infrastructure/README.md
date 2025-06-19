# Infraestrutura

Esta pasta contém toda a definição de infraestrutura como código (IaC) e configurações de diferentes ambientes.

## 📁 Estrutura

```
infrastructure/
├── README.md              # Este arquivo
├── localstack/            # Configurações para desenvolvimento local
│   ├── docker-compose.yml
│   ├── setup.ps1
│   └── init-scripts/
├── aws/                   # Infraestrutura AWS
│   ├── terraform/
│   ├── cloudformation/
│   └── cdk/
├── kubernetes/            # Manifests Kubernetes
│   ├── base/
│   ├── overlays/
│   └── helm-charts/
├── docker/                # Dockerfiles e configurações
│   ├── agents/
│   ├── monitoring/
│   └── docker-compose/
└── monitoring/            # Configurações de monitoramento
    ├── prometheus/
    ├── grafana/
    └── alertmanager/
```

## 🏗️ Componentes

### LocalStack (Desenvolvimento)
- Emula serviços AWS localmente
- SQS, S3, Lambda, DynamoDB
- Configuração via Docker Compose

### AWS (Produção)
- Terraform para IaC
- CloudFormation templates
- AWS CDK para recursos complexos

### Kubernetes
- Manifests base
- Kustomize overlays
- Helm charts para deploy

### Docker
- Dockerfiles otimizados
- Multi-stage builds
- Configurações de rede

### Monitoramento
- Prometheus para métricas
- Grafana para visualização
- Alertmanager para alertas

## 🚀 Como usar

### Desenvolvimento Local
```bash
# Iniciar LocalStack
cd infrastructure/localstack
docker-compose up -d

# Configurar recursos
./setup.ps1
```

### Deploy AWS
```bash
# Terraform
cd infrastructure/aws/terraform
terraform init
terraform plan
terraform apply

# CloudFormation
aws cloudformation deploy --template-file template.yml --stack-name agentes-stack
```

### Deploy Kubernetes
```bash
# Aplicar manifests
kubectl apply -k infrastructure/kubernetes/overlays/production

# Helm
helm install agentes infrastructure/kubernetes/helm-charts/agentes
```

## 🔧 Configuração

### Variáveis de Ambiente
- Cada ambiente tem suas configurações
- Templates em `config/environments/`
- Secrets gerenciados externamente

### Networking
- VPC configurada por ambiente
- Security groups restritivos
- Load balancers para alta disponibilidade

## 📋 Pré-requisitos

- Docker e Docker Compose
- Terraform >= 1.0
- kubectl configurado
- Helm 3+
- AWS CLI

## 🔒 Segurança

- Princípio do menor privilégio
- Secrets em AWS Secrets Manager
- Criptografia em trânsito e repouso
- Network policies restritivas

## 📊 Monitoramento

- Métricas de infraestrutura
- Logs centralizados
- Alertas proativos
- Dashboards por ambiente