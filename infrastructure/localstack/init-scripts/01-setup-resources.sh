#!/bin/bash

# Script de inicialização do LocalStack
# Cria recursos AWS necessários para desenvolvimento

echo "🚀 Configurando recursos LocalStack..."

# Configurar AWS CLI para LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Função para aguardar LocalStack estar pronto
wait_for_localstack() {
    echo "⏳ Aguardando LocalStack estar pronto..."
    while ! awslocal s3 ls > /dev/null 2>&1; do
        sleep 2
    done
    echo "✅ LocalStack está pronto!"
}

# Aguardar LocalStack
wait_for_localstack

# Criar filas SQS
echo "📨 Criando filas SQS..."

# Filas principais
awslocal sqs create-queue --queue-name event-agent-queue-dev
awslocal sqs create-queue --queue-name planning-agent-queue-dev
awslocal sqs create-queue --queue-name execution-agent-queue-dev
awslocal sqs create-queue --queue-name state-agent-queue-dev

# Dead Letter Queues
awslocal sqs create-queue --queue-name event-agent-queue-dev-dlq
awslocal sqs create-queue --queue-name planning-agent-queue-dev-dlq
awslocal sqs create-queue --queue-name execution-agent-queue-dev-dlq
awslocal sqs create-queue --queue-name state-agent-queue-dev-dlq

# Configurar DLQ policy (exemplo para event-agent)
EVENT_QUEUE_URL=$(awslocal sqs get-queue-url --queue-name event-agent-queue-dev --query 'QueueUrl' --output text)
EVENT_DLQ_URL=$(awslocal sqs get-queue-url --queue-name event-agent-queue-dev-dlq --query 'QueueUrl' --output text)
EVENT_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url $EVENT_DLQ_URL --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

# Configurar redrive policy
REDRIVE_POLICY='{"deadLetterTargetArn":"'$EVENT_DLQ_ARN'","maxReceiveCount":3}'
awslocal sqs set-queue-attributes --queue-url $EVENT_QUEUE_URL --attributes RedrivePolicy="$REDRIVE_POLICY"

echo "✅ Filas SQS criadas com sucesso!"

# Criar buckets S3
echo "🪣 Criando buckets S3..."
awslocal s3 mb s3://agentes-storage-dev
awslocal s3 mb s3://agentes-logs-dev
awslocal s3 mb s3://agentes-backups-dev

echo "✅ Buckets S3 criados com sucesso!"

# Criar tabelas DynamoDB (opcional)
echo "🗄️ Criando tabelas DynamoDB..."
awslocal dynamodb create-table \
    --table-name agentes-state-dev \
    --attribute-definitions \
        AttributeName=agentId,AttributeType=S \
        AttributeName=timestamp,AttributeType=N \
    --key-schema \
        AttributeName=agentId,KeyType=HASH \
        AttributeName=timestamp,KeyType=RANGE \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5

echo "✅ Tabelas DynamoDB criadas com sucesso!"

# Criar secrets (opcional)
echo "🔐 Criando secrets..."
awslocal secretsmanager create-secret \
    --name "agentes/dev/database" \
    --description "Database credentials for development" \
    --secret-string '{"username":"agentes","password":"agentes123","host":"localhost","port":5432,"database":"agentes_dev"}'

echo "✅ Secrets criados com sucesso!"

# Listar recursos criados
echo "\n📋 Recursos criados:"
echo "\n📨 Filas SQS:"
awslocal sqs list-queues

echo "\n🪣 Buckets S3:"
awslocal s3 ls

echo "\n🗄️ Tabelas DynamoDB:"
awslocal dynamodb list-tables

echo "\n🔐 Secrets:"
awslocal secretsmanager list-secrets

echo "\n🎉 LocalStack configurado com sucesso!"
echo "\n🔗 Endpoints disponíveis:"
echo "   - SQS: http://localhost:4566"
echo "   - S3: http://localhost:4566"
echo "   - DynamoDB: http://localhost:4566"
echo "   - Secrets Manager: http://localhost:4566"