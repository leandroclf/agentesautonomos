# Script para configurar AWS CLI com LocalStack
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "us-east-1"

# Criar fila SQS
Write-Host "Criando fila SQS: event-agent-queue-dev"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name event-agent-queue-dev --region us-east-1

# Criar fila SQS para DLQ
Write-Host "Criando fila SQS: event-agent-queue-dev-dlq"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name event-agent-queue-dev-dlq --region us-east-1

# Criar bucket S3
Write-Host "Criando bucket S3: agentes-storage-dev"
aws --endpoint-url=http://localhost:4566 s3 mb s3://agentes-storage-dev --region us-east-1

# Listar recursos criados
Write-Host "\nRecursos criados:"
Write-Host "Filas SQS:"
aws --endpoint-url=http://localhost:4566 sqs list-queues --region us-east-1

Write-Host "\nBuckets S3:"
aws --endpoint-url=http://localhost:4566 s3 ls