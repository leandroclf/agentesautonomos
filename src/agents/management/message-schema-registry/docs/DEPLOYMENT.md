# Guia de Deployment - Message Schema Registry

Este documento fornece instruções detalhadas para deploy do Message Schema Registry em diferentes ambientes.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Pré-requisitos](#pré-requisitos)
- [Configuração de Ambiente](#configuração-de-ambiente)
- [Deploy com Docker](#deploy-com-docker)
- [Deploy em Kubernetes](#deploy-em-kubernetes)
- [Deploy em AWS](#deploy-em-aws)
- [Deploy em Azure](#deploy-em-azure)
- [Deploy em GCP](#deploy-em-gcp)
- [Monitoramento](#monitoramento)
- [Backup e Recuperação](#backup-e-recuperação)
- [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

O Message Schema Registry pode ser deployado em diferentes ambientes:

- **Desenvolvimento**: Docker Compose local
- **Staging**: Kubernetes cluster
- **Produção**: Cloud providers (AWS, Azure, GCP)

### Arquitetura de Deploy

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                            │
│                   (nginx/ALB/etc)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                Schema Registry Instances                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   App 1     │  │   App 2     │  │   App 3     │        │
│  │ (Port 3000) │  │ (Port 3000) │  │ (Port 3000) │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                   Infrastructure                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    Redis    │  │   AWS SQS   │  │ Prometheus  │        │
│  │   Cluster   │  │   Queues    │  │  Metrics    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Pré-requisitos

### Infraestrutura Mínima

#### Desenvolvimento
- **CPU**: 2 cores
- **RAM**: 4GB
- **Disk**: 20GB
- **Network**: 100Mbps

#### Produção
- **CPU**: 4+ cores por instância
- **RAM**: 8GB+ por instância
- **Disk**: 100GB+ SSD
- **Network**: 1Gbps+

### Dependências Externas

- **Redis**: >= 6.0 (para cache)
- **AWS SQS**: Para processamento assíncrono (opcional)
- **Prometheus**: Para métricas (opcional)
- **Load Balancer**: nginx, ALB, etc.

## ⚙️ Configuração de Ambiente

### Variáveis de Ambiente por Ambiente

#### Development
```bash
# .env.development
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Logging
LOG_LEVEL=debug
LOG_FILE=/app/logs/app.log

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_CLUSTER=false

# Features
ENABLE_SWAGGER=true
ENABLE_METRICS=true
ENABLE_CLUSTERING=false

# Security
JWT_SECRET=dev-secret-change-in-production
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
```

#### Staging
```bash
# .env.staging
NODE_ENV=staging
PORT=3000
HOST=0.0.0.0

# Logging
LOG_LEVEL=info
LOG_FILE=/app/logs/app.log

# Redis
REDIS_HOST=redis-staging.cluster.local
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_DB=0
REDIS_CLUSTER=true

# AWS
AWS_REGION=us-east-1
AWS_SQS_QUEUE_URL=${SQS_QUEUE_URL}

# Features
ENABLE_SWAGGER=true
ENABLE_METRICS=true
ENABLE_CLUSTERING=true

# Security
JWT_SECRET=${JWT_SECRET}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=500
```

#### Production
```bash
# .env.production
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Logging
LOG_LEVEL=warn
LOG_FILE=/app/logs/app.log

# Redis
REDIS_HOST=${REDIS_HOST}
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_DB=0
REDIS_CLUSTER=true
REDIS_TLS=true

# AWS
AWS_REGION=${AWS_REGION}
AWS_SQS_QUEUE_URL=${SQS_QUEUE_URL}

# Features
ENABLE_SWAGGER=false
ENABLE_METRICS=true
ENABLE_CLUSTERING=true

# Security
JWT_SECRET=${JWT_SECRET}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Performance
MAX_CONCURRENT_VALIDATIONS=1000
VALIDATION_TIMEOUT=5000
CACHE_TTL=3600
```

## 🐳 Deploy com Docker

### Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY src/ ./src/

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Configurar permissões
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "src/server.js"]
```

### Docker Compose - Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  schema-registry:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - REDIS_HOST=redis
    volumes:
      - ./src:/app/src
      - ./logs:/app/logs
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped

volumes:
  redis_data:
  grafana_data:
```

### Docker Compose - Production

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  schema-registry:
    image: company/schema-registry:${VERSION}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - NODE_ENV=production
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
    secrets:
      - redis_password
      - jwt_secret
    networks:
      - app_network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - schema-registry
    networks:
      - app_network

secrets:
  redis_password:
    external: true
  jwt_secret:
    external: true

networks:
  app_network:
    driver: overlay
```

### Build e Deploy

```bash
# Build da imagem
docker build -t schema-registry:latest .

# Tag para registry
docker tag schema-registry:latest company/schema-registry:1.0.0

# Push para registry
docker push company/schema-registry:1.0.0

# Deploy em produção
docker stack deploy -c docker-compose.prod.yml schema-registry
```

## ☸️ Deploy em Kubernetes

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: schema-registry
  labels:
    name: schema-registry
```

### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: schema-registry-config
  namespace: schema-registry
data:
  NODE_ENV: "production"
  PORT: "3000"
  HOST: "0.0.0.0"
  LOG_LEVEL: "info"
  REDIS_PORT: "6379"
  REDIS_DB: "0"
  REDIS_CLUSTER: "true"
  ENABLE_METRICS: "true"
  ENABLE_CLUSTERING: "true"
  RATE_LIMIT_WINDOW_MS: "900000"
  RATE_LIMIT_MAX_REQUESTS: "100"
```

### Secret

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: schema-registry-secret
  namespace: schema-registry
type: Opaque
data:
  REDIS_PASSWORD: <base64-encoded-password>
  JWT_SECRET: <base64-encoded-secret>
  AWS_ACCESS_KEY_ID: <base64-encoded-key>
  AWS_SECRET_ACCESS_KEY: <base64-encoded-secret>
```

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: schema-registry
  namespace: schema-registry
  labels:
    app: schema-registry
spec:
  replicas: 3
  selector:
    matchLabels:
      app: schema-registry
  template:
    metadata:
      labels:
        app: schema-registry
    spec:
      containers:
      - name: schema-registry
        image: company/schema-registry:1.0.0
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: schema-registry-config
        - secretRef:
            name: schema-registry-secret
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
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
        volumeMounts:
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: logs
        emptyDir: {}
      restartPolicy: Always
```

### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: schema-registry-service
  namespace: schema-registry
  labels:
    app: schema-registry
spec:
  selector:
    app: schema-registry
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: schema-registry-ingress
  namespace: schema-registry
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - schema-registry.company.com
    secretName: schema-registry-tls
  rules:
  - host: schema-registry.company.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: schema-registry-service
            port:
              number: 80
```

### HorizontalPodAutoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: schema-registry-hpa
  namespace: schema-registry
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: schema-registry
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Deploy Script

```bash
#!/bin/bash
# scripts/deploy-k8s.sh

set -e

NAMESPACE="schema-registry"
VERSION=${1:-"latest"}

echo "Deploying Schema Registry version: $VERSION"

# Criar namespace
kubectl apply -f k8s/namespace.yaml

# Aplicar configurações
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Atualizar imagem no deployment
sed -i "s|company/schema-registry:.*|company/schema-registry:$VERSION|g" k8s/deployment.yaml

# Aplicar deployment
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Aguardar rollout
kubectl rollout status deployment/schema-registry -n $NAMESPACE

echo "Deployment completed successfully!"
```

## ☁️ Deploy em AWS

### ECS com Fargate

```json
// aws/task-definition.json
{
  "family": "schema-registry",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/schemaRegistryTaskRole",
  "containerDefinitions": [
    {
      "name": "schema-registry",
      "image": "ACCOUNT.dkr.ecr.REGION.amazonaws.com/schema-registry:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "REDIS_HOST",
          "value": "schema-registry-redis.cache.amazonaws.com"
        }
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:schema-registry/jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/schema-registry",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:3000/health || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

### CloudFormation Template

```yaml
# aws/cloudformation.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Schema Registry Infrastructure'

Parameters:
  Environment:
    Type: String
    Default: production
    AllowedValues: [development, staging, production]
  
  ImageTag:
    Type: String
    Default: latest

Resources:
  # VPC
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub '${Environment}-schema-registry-vpc'

  # Subnets
  PrivateSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: !Select [0, !GetAZs '']
      Tags:
        - Key: Name
          Value: !Sub '${Environment}-private-subnet-1'

  PrivateSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.2.0/24
      AvailabilityZone: !Select [1, !GetAZs '']
      Tags:
        - Key: Name
          Value: !Sub '${Environment}-private-subnet-2'

  # ElastiCache Redis
  RedisSubnetGroup:
    Type: AWS::ElastiCache::SubnetGroup
    Properties:
      Description: Subnet group for Redis
      SubnetIds:
        - !Ref PrivateSubnet1
        - !Ref PrivateSubnet2

  RedisCluster:
    Type: AWS::ElastiCache::ReplicationGroup
    Properties:
      ReplicationGroupDescription: Redis cluster for Schema Registry
      NumCacheClusters: 3
      Engine: redis
      CacheNodeType: cache.r6g.large
      CacheSubnetGroupName: !Ref RedisSubnetGroup
      SecurityGroupIds:
        - !Ref RedisSecurityGroup
      AtRestEncryptionEnabled: true
      TransitEncryptionEnabled: true

  # ECS Cluster
  ECSCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: !Sub '${Environment}-schema-registry'
      CapacityProviders:
        - FARGATE
        - FARGATE_SPOT

  # ECS Service
  ECSService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref ECSCluster
      TaskDefinition: !Ref TaskDefinition
      DesiredCount: 3
      LaunchType: FARGATE
      NetworkConfiguration:
        AwsvpcConfiguration:
          SecurityGroups:
            - !Ref AppSecurityGroup
          Subnets:
            - !Ref PrivateSubnet1
            - !Ref PrivateSubnet2
      LoadBalancers:
        - ContainerName: schema-registry
          ContainerPort: 3000
          TargetGroupArn: !Ref TargetGroup

  # Application Load Balancer
  ALB:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: !Sub '${Environment}-schema-registry-alb'
      Scheme: internet-facing
      Type: application
      SecurityGroups:
        - !Ref ALBSecurityGroup
      Subnets:
        - !Ref PublicSubnet1
        - !Ref PublicSubnet2

Outputs:
  LoadBalancerDNS:
    Description: DNS name of the load balancer
    Value: !GetAtt ALB.DNSName
    Export:
      Name: !Sub '${Environment}-schema-registry-alb-dns'
```

### Deploy Script para AWS

```bash
#!/bin/bash
# scripts/deploy-aws.sh

set -e

ENVIRONMENT=${1:-"production"}
VERSION=${2:-"latest"}
REGION=${3:-"us-east-1"}

echo "Deploying to AWS - Environment: $ENVIRONMENT, Version: $VERSION"

# Build e push da imagem para ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
docker build -t schema-registry:$VERSION .
docker tag schema-registry:$VERSION $ECR_REGISTRY/schema-registry:$VERSION
docker push $ECR_REGISTRY/schema-registry:$VERSION

# Deploy da infraestrutura
aws cloudformation deploy \
  --template-file aws/cloudformation.yaml \
  --stack-name schema-registry-$ENVIRONMENT \
  --parameter-overrides Environment=$ENVIRONMENT ImageTag=$VERSION \
  --capabilities CAPABILITY_IAM \
  --region $REGION

# Atualizar ECS service
aws ecs update-service \
  --cluster $ENVIRONMENT-schema-registry \
  --service schema-registry-service \
  --force-new-deployment \
  --region $REGION

echo "Deployment completed successfully!"
```

## 📊 Monitoramento

### Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'schema-registry'
    static_configs:
      - targets: ['schema-registry:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Alert Rules

```yaml
# monitoring/alert_rules.yml
groups:
- name: schema-registry
  rules:
  - alert: SchemaRegistryDown
    expr: up{job="schema-registry"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Schema Registry instance is down"
      description: "Schema Registry instance {{ $labels.instance }} has been down for more than 1 minute."

  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }} errors per second."

  - alert: HighMemoryUsage
    expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High memory usage"
      description: "Memory usage is above 90%."

  - alert: RedisDown
    expr: up{job="redis"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Redis is down"
      description: "Redis instance {{ $labels.instance }} is down."
```

### Grafana Dashboard

```json
// monitoring/grafana-dashboard.json
{
  "dashboard": {
    "title": "Schema Registry Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{ method }} {{ status }}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "process_resident_memory_bytes",
            "legendFormat": "Memory Usage"
          }
        ]
      }
    ]
  }
}
```

## 💾 Backup e Recuperação

### Backup do Redis

```bash
#!/bin/bash
# scripts/backup-redis.sh

set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/redis"
REDIS_HOST=${REDIS_HOST:-"localhost"}
REDIS_PORT=${REDIS_PORT:-"6379"}

mkdir -p $BACKUP_DIR

echo "Starting Redis backup..."

# Criar backup
redis-cli -h $REDIS_HOST -p $REDIS_PORT --rdb $BACKUP_DIR/dump_$DATE.rdb

# Comprimir backup
gzip $BACKUP_DIR/dump_$DATE.rdb

# Upload para S3 (se configurado)
if [ ! -z "$S3_BUCKET" ]; then
  aws s3 cp $BACKUP_DIR/dump_$DATE.rdb.gz s3://$S3_BUCKET/redis-backups/
fi

# Limpar backups antigos (manter últimos 7 dias)
find $BACKUP_DIR -name "dump_*.rdb.gz" -mtime +7 -delete

echo "Redis backup completed: dump_$DATE.rdb.gz"
```

### Restauração do Redis

```bash
#!/bin/bash
# scripts/restore-redis.sh

set -e

BACKUP_FILE=$1
REDIS_HOST=${REDIS_HOST:-"localhost"}
REDIS_PORT=${REDIS_PORT:-"6379"}

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

echo "Restoring Redis from backup: $BACKUP_FILE"

# Parar Redis
redis-cli -h $REDIS_HOST -p $REDIS_PORT SHUTDOWN NOSAVE || true

# Descomprimir backup se necessário
if [[ $BACKUP_FILE == *.gz ]]; then
  gunzip -c $BACKUP_FILE > /tmp/dump.rdb
else
  cp $BACKUP_FILE /tmp/dump.rdb
fi

# Copiar backup para diretório do Redis
cp /tmp/dump.rdb /var/lib/redis/dump.rdb
chown redis:redis /var/lib/redis/dump.rdb

# Iniciar Redis
systemctl start redis

echo "Redis restoration completed"
```

## 🔧 Troubleshooting

### Logs Centralizados

```bash
# Visualizar logs em tempo real
docker logs -f schema-registry

# Logs do Kubernetes
kubectl logs -f deployment/schema-registry -n schema-registry

# Logs do ECS
aws logs tail /ecs/schema-registry --follow
```

### Health Checks

```bash
# Verificar saúde da aplicação
curl http://localhost:3000/health

# Verificar métricas
curl http://localhost:3000/metrics

# Verificar Redis
redis-cli ping

# Verificar conectividade
telnet redis-host 6379
```

### Performance Debugging

```bash
# Monitorar recursos
top -p $(pgrep node)
htop

# Monitorar rede
netstat -tulpn | grep :3000
ss -tulpn | grep :3000

# Monitorar I/O
iotop
```

### Scripts de Diagnóstico

```bash
#!/bin/bash
# scripts/diagnose.sh

echo "=== Schema Registry Diagnostics ==="
echo "Date: $(date)"
echo

echo "=== Application Status ==="
curl -s http://localhost:3000/health | jq .
echo

echo "=== Redis Status ==="
redis-cli ping
redis-cli info replication
echo

echo "=== System Resources ==="
free -h
df -h
echo

echo "=== Network Connections ==="
netstat -tulpn | grep :3000
echo

echo "=== Recent Logs ==="
tail -n 20 /app/logs/app.log
```

---

**Última atualização**: 2024
**Versão**: 1.0.0
**Equipe**: DevOps & Schema Registry Team