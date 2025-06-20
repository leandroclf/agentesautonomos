# Guia de Deployment

## Visão Geral

Este guia cobre o processo completo de deployment do sistema de agentes autônomos, desde o ambiente de desenvolvimento até a produção.

## Ambientes

### Desenvolvimento
- LocalStack para serviços AWS
- Mock services para APIs externas
- Hot reload habilitado
- Logs detalhados

### Staging
- Serviços AWS reais (ambiente de teste)
- APIs externas de teste
- Configuração similar à produção
- Testes automatizados

### Produção
- Serviços AWS completos
- APIs externas de produção
- Monitoramento completo
- Alta disponibilidade

## Pré-requisitos

### Infraestrutura
- **AWS Account** com permissões adequadas
- **Docker** para containerização
- **Node.js** 18+ para desenvolvimento
- **Git** para controle de versão

### Ferramentas
- **AWS CLI** configurado
- **Docker Compose** para orquestração local
- **Terraform** (opcional) para IaC
- **kubectl** (se usando Kubernetes)

## Configuração AWS

### 1. Configurar Credenciais

```bash
# Configurar AWS CLI
aws configure

# Ou usar variáveis de ambiente
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

### 2. Criar Recursos SQS

```bash
# Executar script de configuração
npm run setup:aws-production
```

Ou manualmente:

```bash
# Criar filas SQS
aws sqs create-queue --queue-name interface-agent-requests
aws sqs create-queue --queue-name interface-agent-responses
aws sqs create-queue --queue-name planning-agent-requests
aws sqs create-queue --queue-name planning-agent-responses
aws sqs create-queue --queue-name execution-agent-requests
aws sqs create-queue --queue-name execution-agent-responses

# Criar Dead Letter Queues
aws sqs create-queue --queue-name interface-agent-dlq
aws sqs create-queue --queue-name planning-agent-dlq
aws sqs create-queue --queue-name execution-agent-dlq
```

### 3. Configurar IAM

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl"
      ],
      "Resource": "arn:aws:sqs:*:*:*-agent-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

## Docker

### Dockerfile

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production image
FROM node:18-alpine AS production

WORKDIR /app

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copiar dependências
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Criar diretórios necessários
RUN mkdir -p logs temp && chown -R nodejs:nodejs logs temp

USER nodejs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s   CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

CMD ["npm", "start"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  interface-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=interface
    ports:
      - "3000:3000"
    depends_on:
      - redis
    restart: unless-stopped

  planning-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=planning
    depends_on:
      - redis
    restart: unless-stopped

  execution-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=execution
    depends_on:
      - redis
    restart: unless-stopped

  monitoring-agent:
    build: .
    environment:
      - NODE_ENV=production
      - AGENT_TYPE=monitoring
    ports:
      - "3001:3001"
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
```

## Deployment Local

### 1. Preparar Ambiente

```bash
# Clonar repositório
git clone <repository-url>
cd agentesautonomos

# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env.development
```

### 2. Iniciar LocalStack

```bash
# Iniciar LocalStack
npm run localstack:start

# Configurar SQS local
npm run setup:aws
```

### 3. Executar Sistema

```bash
# Iniciar todos os agentes
npm run start:agents

# Ou iniciar individualmente
npm run start:interface
npm run start:planning
npm run start:execution
```

## Deployment Staging

### 1. Configurar Ambiente

```bash
# Criar arquivo de ambiente
cp .env.example .env.staging

# Editar configurações
vim .env.staging
```

### 2. Build e Deploy

```bash
# Build da aplicação
npm run build

# Executar testes
npm test

# Deploy com Docker
docker-compose -f docker-compose.staging.yml up -d
```

## Deployment Produção

### 1. Preparar Produção

```bash
# Configurar AWS para produção
npm run setup:aws-production

# Migrar para SQS real
npm run switch-to-real-sqs

# Testar conectividade
npm run test:sqs
```

### 2. Deploy com Docker

```bash
# Build da imagem
docker build -t agents-system:latest .

# Tag para registry
docker tag agents-system:latest your-registry/agents-system:latest

# Push para registry
docker push your-registry/agents-system:latest

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Deploy com Kubernetes

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: interface-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: interface-agent
  template:
    metadata:
      labels:
        app: interface-agent
    spec:
      containers:
      - name: interface-agent
        image: your-registry/agents-system:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: AGENT_TYPE
          value: "interface"
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

```bash
# Aplicar configurações
kubectl apply -f k8s/

# Verificar status
kubectl get pods
kubectl get services
```

## CI/CD

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm test
    - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v3
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Build and push Docker image
      run: |
        docker build -t agents-system:latest .
        docker tag agents-system:latest ${{ secrets.ECR_REGISTRY }}/agents-system:latest
        docker push ${{ secrets.ECR_REGISTRY }}/agents-system:latest
    
    - name: Deploy to ECS
      run: |
        aws ecs update-service --cluster production --service agents-system --force-new-deployment
```

## Monitoramento

### Health Checks

```bash
# Verificar saúde do sistema
curl http://localhost:3000/health

# Verificar métricas
curl http://localhost:3000/metrics

# Verificar alertas
curl http://localhost:3000/alerts
```

### Logs

```bash
# Visualizar logs
docker-compose logs -f

# Logs específicos
docker-compose logs -f interface-agent

# Logs com Kubernetes
kubectl logs -f deployment/interface-agent
```

### Métricas

```bash
# Prometheus metrics
curl http://localhost:3000/metrics?format=prometheus

# JSON metrics
curl http://localhost:3000/metrics?format=json
```

## Backup e Recuperação

### Backup de Configurações

```bash
# Backup de configurações
aws s3 cp .env.production s3://your-backup-bucket/configs/
aws s3 cp docker-compose.prod.yml s3://your-backup-bucket/configs/
```

### Backup de Logs

```bash
# Backup automático de logs
aws s3 sync logs/ s3://your-backup-bucket/logs/$(date +%Y-%m-%d)/
```

### Recuperação

```bash
# Restaurar configurações
aws s3 cp s3://your-backup-bucket/configs/.env.production .
aws s3 cp s3://your-backup-bucket/configs/docker-compose.prod.yml .

# Reiniciar sistema
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Problemas Comuns

1. **SQS Connection Failed**
   ```bash
   # Verificar credenciais
   aws sts get-caller-identity
   
   # Testar conectividade
   npm run test:sqs
   ```

2. **High Memory Usage**
   ```bash
   # Verificar uso de memória
   docker stats
   
   # Reiniciar serviços
   docker-compose restart
   ```

3. **Agent Not Responding**
   ```bash
   # Verificar logs
   docker-compose logs agent-name
   
   # Verificar health
   curl http://localhost:3000/health
   ```

### Rollback

```bash
# Rollback com Docker
docker-compose down
docker-compose -f docker-compose.prod.yml up -d

# Rollback com Kubernetes
kubectl rollout undo deployment/interface-agent
```

## Segurança

### SSL/TLS

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Firewall

```bash
# Configurar firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

**Próximos Passos**:
1. [Monitoramento](../monitoring/README.md)
2. [Segurança](../security/README.md)
3. [Troubleshooting](../troubleshooting/README.md)
