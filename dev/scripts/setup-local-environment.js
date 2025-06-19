/**
 * Setup Local Development Environment
 * 
 * Este script configura um ambiente de desenvolvimento local completo:
 * - LocalStack para simular serviços AWS (SQS, S3, etc.)
 * - PostgreSQL para banco de dados
 * - Redis para cache
 * - Criação de filas SQS
 * - Configuração de variáveis de ambiente
 * 
 * Uso: node scripts/setup-local-environment.js
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class LocalEnvironmentSetup {
  constructor() {
    this.services = {
      localstack: { port: 4566, status: 'stopped' },
      postgres: { port: 5432, status: 'stopped' },
      redis: { port: 6379, status: 'stopped' }
    };
    
    this.sqsQueues = [
      'event-agent-queue-dev',
      'planning-agent-queue-dev',
      'execution-agent-queue-dev',
      'monitoring-agent-queue-dev',
      'security-agent-queue-dev',
      'policy-agent-queue-dev',
      'event-agent-queue-dev-dlq',
      'planning-agent-queue-dev-dlq',
      'execution-agent-queue-dev-dlq',
      'monitoring-agent-queue-dev-dlq',
      'security-agent-queue-dev-dlq',
      'policy-agent-queue-dev-dlq'
    ];
    
    this.localstackEndpoint = 'http://localhost:4566';
  }
  
  /**
   * Executar comando e retornar Promise
   */
  execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject({ error, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
  
  /**
   * Verificar se um serviço está rodando
   */
  async checkServiceStatus(port) {
    try {
      const response = await axios.get(`http://localhost:${port}/health`, {
        timeout: 2000
      });
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Verificar se Docker está instalado e rodando
   */
  async checkDockerStatus() {
    try {
      await this.execCommand('docker --version');
      await this.execCommand('docker ps');
      console.log('✅ Docker está instalado e rodando');
      return true;
    } catch (error) {
      console.error('❌ Docker não está instalado ou não está rodando');
      console.error('Por favor, instale o Docker Desktop e certifique-se de que está rodando');
      return false;
    }
  }
  
  /**
   * Criar arquivo docker-compose.yml
   */
  createDockerCompose() {
    const dockerComposeContent = `version: '3.8'

services:
  localstack:
    container_name: agentes-localstack
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
      - "4510-4559:4510-4559"
    environment:
      - SERVICES=sqs,s3,dynamodb,lambda,apigateway,cloudformation,sts,iam
      - DEBUG=1
      - DATA_DIR=/tmp/localstack/data
      - DOCKER_HOST=unix:///var/run/docker.sock
      - HOST_TMP_FOLDER=/tmp/localstack
    volumes:
      - "/tmp/localstack:/tmp/localstack"
      - "/var/run/docker.sock:/var/run/docker.sock"
    networks:
      - agentes-network

  postgres:
    container_name: agentes-postgres
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=agentes_autonomos
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres123
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/sql:/docker-entrypoint-initdb.d
    networks:
      - agentes-network

  redis:
    container_name: agentes-redis
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - agentes-network

  pgadmin:
    container_name: agentes-pgadmin
    image: dpage/pgadmin4:latest
    ports:
      - "8080:80"
    environment:
      - PGADMIN_DEFAULT_EMAIL=admin@agentes.local
      - PGADMIN_DEFAULT_PASSWORD=admin123
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    networks:
      - agentes-network
    depends_on:
      - postgres

  redis-commander:
    container_name: agentes-redis-commander
    image: rediscommander/redis-commander:latest
    ports:
      - "8081:8081"
    environment:
      - REDIS_HOSTS=local:redis:6379
    networks:
      - agentes-network
    depends_on:
      - redis

volumes:
  postgres_data:
  redis_data:
  pgadmin_data:

networks:
  agentes-network:
    driver: bridge
`;
    
    fs.writeFileSync('docker-compose.yml', dockerComposeContent);
    console.log('✅ Arquivo docker-compose.yml criado');
  }
  
  /**
   * Criar scripts SQL de inicialização
   */
  createSQLScripts() {
    const sqlDir = path.join(__dirname, 'sql');
    if (!fs.existsSync(sqlDir)) {
      fs.mkdirSync(sqlDir, { recursive: true });
    }
    
    const initSQL = `-- Inicialização do banco de dados para Agentes Autônomos

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Criar schema para agentes
CREATE SCHEMA IF NOT EXISTS agentes;

-- Tabela de eventos
CREATE TABLE IF NOT EXISTS agentes.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    agent_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);

-- Tabela de planos
CREATE TABLE IF NOT EXISTS agentes.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES agentes.events(id),
    plan_type VARCHAR(100) NOT NULL,
    agent_id VARCHAR(100) NOT NULL,
    plan_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    priority INTEGER DEFAULT 5,
    estimated_duration INTEGER, -- em segundos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(100)
);

-- Tabela de execuções
CREATE TABLE IF NOT EXISTS agentes.executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES agentes.plans(id),
    agent_id VARCHAR(100) NOT NULL,
    execution_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'queued',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER, -- em segundos
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de métricas
CREATE TABLE IF NOT EXISTS agentes.metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(50),
    tags JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de políticas
CREATE TABLE IF NOT EXISTS agentes.policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_name VARCHAR(200) NOT NULL UNIQUE,
    policy_type VARCHAR(100) NOT NULL,
    policy_data JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    version INTEGER DEFAULT 1
);

-- Tabela de violações de política
CREATE TABLE IF NOT EXISTS agentes.policy_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID REFERENCES agentes.policies(id),
    agent_id VARCHAR(100) NOT NULL,
    violation_type VARCHAR(100) NOT NULL,
    violation_data JSONB NOT NULL,
    severity VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'open',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_events_agent_id ON agentes.events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON agentes.events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON agentes.events(created_at);

CREATE INDEX IF NOT EXISTS idx_plans_event_id ON agentes.plans(event_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON agentes.plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_priority ON agentes.plans(priority);

CREATE INDEX IF NOT EXISTS idx_executions_plan_id ON agentes.executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON agentes.executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_agent_id ON agentes.executions(agent_id);

CREATE INDEX IF NOT EXISTS idx_metrics_agent_id ON agentes.metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON agentes.metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON agentes.metrics(metric_name);

CREATE INDEX IF NOT EXISTS idx_policies_active ON agentes.policies(is_active);
CREATE INDEX IF NOT EXISTS idx_policies_type ON agentes.policies(policy_type);

CREATE INDEX IF NOT EXISTS idx_violations_policy_id ON agentes.policy_violations(policy_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON agentes.policy_violations(status);
CREATE INDEX IF NOT EXISTS idx_violations_detected_at ON agentes.policy_violations(detected_at);

-- Inserir políticas padrão
INSERT INTO agentes.policies (policy_name, policy_type, policy_data, priority) VALUES
('max_execution_time', 'execution', '{"max_duration_seconds": 300, "action": "terminate"}', 1),
('max_retry_attempts', 'execution', '{"max_retries": 3, "backoff_multiplier": 2}', 2),
('resource_limits', 'system', '{"max_memory_mb": 512, "max_cpu_percent": 80}', 3),
('security_validation', 'security', '{"require_authentication": true, "validate_input": true}', 1),
('audit_logging', 'compliance', '{"log_all_actions": true, "retention_days": 90}', 4)
ON CONFLICT (policy_name) DO NOTHING;

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para atualizar updated_at
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON agentes.events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON agentes.plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_executions_updated_at BEFORE UPDATE ON agentes.executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON agentes.policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
`;
    
    fs.writeFileSync(path.join(sqlDir, '01-init.sql'), initSQL);
    console.log('✅ Scripts SQL de inicialização criados');
  }
  
  /**
   * Iniciar serviços Docker
   */
  async startDockerServices() {
    try {
      console.log('🚀 Iniciando serviços Docker...');
      
      // Parar serviços existentes
      await this.execCommand('docker-compose down', { cwd: process.cwd() });
      
      // Iniciar serviços
      await this.execCommand('docker-compose up -d', { cwd: process.cwd() });
      
      console.log('✅ Serviços Docker iniciados');
      
      // Aguardar serviços ficarem prontos
      console.log('⏳ Aguardando serviços ficarem prontos...');
      await this.waitForServices();
      
    } catch (error) {
      console.error('❌ Erro ao iniciar serviços Docker:', error);
      throw error;
    }
  }
  
  /**
   * Aguardar serviços ficarem prontos
   */
  async waitForServices() {
    const maxAttempts = 15;
    const delay = 3000;
    
    console.log('⏳ Aguardando serviços ficarem prontos...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Verificar LocalStack
        const localstackResponse = await axios.get(`${this.localstackEndpoint}/health`, {
          timeout: 10000
        });
        
        console.log('✅ LocalStack está respondendo');
        
        // Se chegou até aqui, LocalStack está funcionando
        if (localstackResponse.status === 200) {
          console.log('✅ LocalStack está pronto');
          return;
        }
      } catch (error) {
        console.log(`⏳ Tentativa ${attempt}/${maxAttempts} - Aguardando LocalStack... (${error.message})`);
        
        if (attempt === maxAttempts) {
          console.log('⚠️  LocalStack não respondeu, mas continuando com a configuração...');
          return; // Não falhar, apenas continuar
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  /**
   * Criar filas SQS no LocalStack
   */
  async createSQSQueues() {
    try {
      console.log('📋 Criando filas SQS...');
      
      // Configurar variáveis de ambiente AWS para LocalStack
      process.env.AWS_ACCESS_KEY_ID = 'test';
      process.env.AWS_SECRET_ACCESS_KEY = 'test';
      process.env.AWS_DEFAULT_REGION = 'us-east-1';
      
      for (const queueName of this.sqsQueues) {
        try {
          const createQueueCommand = `aws --endpoint-url=${this.localstackEndpoint} sqs create-queue --queue-name ${queueName} --region us-east-1`;
          await this.execCommand(createQueueCommand);
          console.log(`✅ Fila criada: ${queueName}`);
        } catch (error) {
          console.log(`⚠️  Fila já existe ou erro: ${queueName} - ${error.message}`);
        }
      }
      
      console.log('✅ Filas SQS configuradas');
      
    } catch (error) {
      console.error('❌ Erro ao criar filas SQS:', error);
      throw error;
    }
  }
  
  /**
   * Atualizar arquivo .env para ambiente local
   */
  updateEnvFile() {
    const envContent = `# Ambiente de Desenvolvimento Local
NODE_ENV=development
PORT=3000

# AWS LocalStack Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=http://localhost:4566

# SQS Queues - Core Agents
SQS_EVENT_AGENT_QUEUE=event-agent-queue-dev
SQS_PLANNING_AGENT_QUEUE=planning-agent-queue-dev
SQS_EXECUTION_AGENT_QUEUE=execution-agent-queue-dev

# SQS Queues - Auxiliary Agents
SQS_MONITORING_AGENT_QUEUE=monitoring-agent-queue-dev
SQS_SECURITY_AGENT_QUEUE=security-agent-queue-dev
SQS_POLICY_AGENT_QUEUE=policy-agent-queue-dev

# SQS Configuration
SQS_DLQ_SUFFIX=-dlq
SQS_DLQ_MAX_RECEIVE_COUNT=3
SQS_MAX_MESSAGES=10
SQS_WAIT_TIME=20
SQS_VISIBILITY_TIMEOUT=300
SQS_MAX_RETRY_ATTEMPTS=3
SQS_BACKOFF_MULTIPLIER=2
SQS_INITIAL_DELAY=1000

# Database (PostgreSQL Local)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agentes_autonomos
DB_USER=postgres
DB_PASSWORD=postgres123

# Redis (Local)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Observability
METRICS_PORT=9090
PROMETHEUS_ENDPOINT=/metrics
LOG_LEVEL=debug
LOG_FORMAT=json

# Security
JWT_SECRET=local_development_secret_change_in_production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
API_KEY_HEADER=x-api-key
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=1000

# Agent Ports
EVENT_AGENT_PORT=3003
PLANNING_AGENT_PORT=3004
EXECUTION_AGENT_PORT=3005
MONITORING_AGENT_PORT=3006
SECURITY_AGENT_PORT=3007
POLICY_AGENT_PORT=3008

# Agent Timeouts
EVENT_PROCESSING_TIMEOUT=30000
PLANNING_TIMEOUT=60000
EXECUTION_TIMEOUT=300000

# Agent Retry Configuration
EVENT_RETRY_ATTEMPTS=3
PLANNING_RETRY_ATTEMPTS=3
EXECUTION_RETRY_ATTEMPTS=3

# Monitoring Thresholds
MONITORING_ERROR_RATE_THRESHOLD=0.05
MONITORING_RESPONSE_TIME_THRESHOLD=5000
MONITORING_MEMORY_THRESHOLD=0.8
MONITORING_CPU_THRESHOLD=0.8
MONITORING_QUEUE_DEPTH_THRESHOLD=100
MONITORING_METRICS_INTERVAL=60000
MONITORING_RETENTION_PERIOD=604800000

# Security Configuration
SECURITY_SESSION_TIMEOUT=3600000
SECURITY_MAX_LOGIN_ATTEMPTS=5
SECURITY_LOCKOUT_DURATION=900000
SECURITY_TOKEN_CLEANUP_INTERVAL=3600000

# Policy Configuration
POLICY_CACHE_TIMEOUT=300000
POLICY_MAX_VIOLATION_HISTORY=1000
POLICY_AUDIT_RETENTION=2592000000

# OpenAI Configuration (opcional)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.7

# URLs de Acesso Local
PGADMIN_URL=http://localhost:8080
REDIS_COMMANDER_URL=http://localhost:8081
LOCALSTACK_DASHBOARD_URL=http://localhost:4566
`;
    
    fs.writeFileSync('.env.local', envContent);
    console.log('✅ Arquivo .env.local criado para desenvolvimento');
  }
  
  /**
   * Criar collection do Postman
   */
  createPostmanCollection() {
    const collection = {
      "info": {
        "name": "Agentes Autônomos - Local Development",
        "description": "Collection para testar APIs dos agentes autônomos em ambiente local",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      "variable": [
        {
          "key": "base_url",
          "value": "http://localhost",
          "type": "string"
        },
        {
          "key": "event_port",
          "value": "3003",
          "type": "string"
        },
        {
          "key": "planning_port",
          "value": "3004",
          "type": "string"
        },
        {
          "key": "execution_port",
          "value": "3005",
          "type": "string"
        },
        {
          "key": "monitoring_port",
          "value": "3006",
          "type": "string"
        },
        {
          "key": "security_port",
          "value": "3007",
          "type": "string"
        },
        {
          "key": "policy_port",
          "value": "3008",
          "type": "string"
        }
      ],
      "item": [
        {
          "name": "Event Agent",
          "item": [
            {
              "name": "Health Check",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{event_port}}/health",
                  "host": ["{{base_url}}"],
                  "port": "{{event_port}}",
                  "path": ["health"]
                }
              }
            },
            {
              "name": "Create Event",
              "request": {
                "method": "POST",
                "header": [
                  {
                    "key": "Content-Type",
                    "value": "application/json"
                  }
                ],
                "body": {
                  "mode": "raw",
                  "raw": "{\n  \"eventType\": \"user_action\",\n  \"source\": \"web_interface\",\n  \"data\": {\n    \"action\": \"create_task\",\n    \"userId\": \"user123\",\n    \"taskData\": {\n      \"title\": \"Test Task\",\n      \"description\": \"This is a test task\"\n    }\n  }\n}"
                },
                "url": {
                  "raw": "{{base_url}}:{{event_port}}/api/events",
                  "host": ["{{base_url}}"],
                  "port": "{{event_port}}",
                  "path": ["api", "events"]
                }
              }
            },
            {
              "name": "Get Events",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{event_port}}/api/events",
                  "host": ["{{base_url}}"],
                  "port": "{{event_port}}",
                  "path": ["api", "events"]
                }
              }
            }
          ]
        },
        {
          "name": "Planning Agent",
          "item": [
            {
              "name": "Health Check",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{planning_port}}/health",
                  "host": ["{{base_url}}"],
                  "port": "{{planning_port}}",
                  "path": ["health"]
                }
              }
            },
            {
              "name": "Get Plans",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{planning_port}}/api/plans",
                  "host": ["{{base_url}}"],
                  "port": "{{planning_port}}",
                  "path": ["api", "plans"]
                }
              }
            }
          ]
        },
        {
          "name": "Execution Agent",
          "item": [
            {
              "name": "Health Check",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{execution_port}}/health",
                  "host": ["{{base_url}}"],
                  "port": "{{execution_port}}",
                  "path": ["health"]
                }
              }
            },
            {
              "name": "Get Executions",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{execution_port}}/api/executions",
                  "host": ["{{base_url}}"],
                  "port": "{{execution_port}}",
                  "path": ["api", "executions"]
                }
              }
            }
          ]
        },
        {
          "name": "Monitoring Agent",
          "item": [
            {
              "name": "Health Check",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{monitoring_port}}/health",
                  "host": ["{{base_url}}"],
                  "port": "{{monitoring_port}}",
                  "path": ["health"]
                }
              }
            },
            {
              "name": "Get Metrics",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{monitoring_port}}/api/metrics",
                  "host": ["{{base_url}}"],
                  "port": "{{monitoring_port}}",
                  "path": ["api", "metrics"]
                }
              }
            }
          ]
        },
        {
          "name": "Security Agent",
          "item": [
            {
              "name": "Health Check",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{security_port}}/health",
                  "host": ["{{base_url}}"],
                  "port": "{{security_port}}",
                  "path": ["health"]
                }
              }
            },
            {
              "name": "Get Security Status",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{security_port}}/api/security/status",
                  "host": ["{{base_url}}"],
                  "port": "{{security_port}}",
                  "path": ["api", "security", "status"]
                }
              }
            }
          ]
        },
        {
          "name": "Policy Agent",
          "item": [
            {
              "name": "Health Check",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{policy_port}}/health",
                  "host": ["{{base_url}}"],
                  "port": "{{policy_port}}",
                  "path": ["health"]
                }
              }
            },
            {
              "name": "Get Policies",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "{{base_url}}:{{policy_port}}/api/policies",
                  "host": ["{{base_url}}"],
                  "port": "{{policy_port}}",
                  "path": ["api", "policies"]
                }
              }
            }
          ]
        },
        {
          "name": "System",
          "item": [
            {
              "name": "LocalStack Health",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "http://localhost:4566/health",
                  "protocol": "http",
                  "host": ["localhost"],
                  "port": "4566",
                  "path": ["health"]
                }
              }
            },
            {
              "name": "PgAdmin",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "http://localhost:8080",
                  "protocol": "http",
                  "host": ["localhost"],
                  "port": "8080"
                }
              }
            },
            {
              "name": "Redis Commander",
              "request": {
                "method": "GET",
                "header": [],
                "url": {
                  "raw": "http://localhost:8081",
                  "protocol": "http",
                  "host": ["localhost"],
                  "port": "8081"
                }
              }
            }
          ]
        }
      ]
    };
    
    const collectionsDir = path.join(__dirname, '..', 'postman');
    if (!fs.existsSync(collectionsDir)) {
      fs.mkdirSync(collectionsDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(collectionsDir, 'agentes-autonomos-local.postman_collection.json'),
      JSON.stringify(collection, null, 2)
    );
    
    console.log('✅ Collection do Postman criada');
  }
  
  /**
   * Criar script de inicialização rápida
   */
  createQuickStartScript() {
    const quickStartContent = `#!/bin/bash

# Quick Start Script para Agentes Autônomos
# Este script configura e inicia todo o ambiente de desenvolvimento local

echo "🚀 Iniciando ambiente de desenvolvimento dos Agentes Autônomos..."

# Verificar se Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker não está rodando. Por favor, inicie o Docker Desktop."
    exit 1
fi

# Copiar arquivo de ambiente
if [ ! -f .env ]; then
    cp .env.local .env
    echo "✅ Arquivo .env criado"
fi

# Iniciar serviços
echo "📦 Iniciando serviços Docker..."
docker-compose up -d

# Aguardar serviços ficarem prontos
echo "⏳ Aguardando serviços ficarem prontos..."
sleep 30

# Criar filas SQS
echo "📋 Criando filas SQS..."
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name event-agent-queue-dev --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name planning-agent-queue-dev --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name execution-agent-queue-dev --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name monitoring-agent-queue-dev --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name security-agent-queue-dev --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name policy-agent-queue-dev --region us-east-1

# Criar DLQs
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name event-agent-queue-dev-dlq --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name planning-agent-queue-dev-dlq --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name execution-agent-queue-dev-dlq --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name monitoring-agent-queue-dev-dlq --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name security-agent-queue-dev-dlq --region us-east-1
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name policy-agent-queue-dev-dlq --region us-east-1

echo "✅ Ambiente configurado com sucesso!"
echo ""
echo "🌐 URLs de Acesso:"
echo "   PgAdmin: http://localhost:8080 (admin@agentes.local / admin123)"
echo "   Redis Commander: http://localhost:8081"
echo "   LocalStack Dashboard: http://localhost:4566"
echo ""
echo "🚀 Para iniciar os agentes:"
echo "   npm run start:all"
echo ""
echo "📋 Para testar as APIs, importe a collection do Postman:"
echo "   postman/agentes-autonomos-local.postman_collection.json"
`;
    
    fs.writeFileSync('quick-start.sh', quickStartContent);
    
    // Tornar executável no Unix
    try {
      fs.chmodSync('quick-start.sh', '755');
    } catch (error) {
      // Ignorar erro no Windows
    }
    
    console.log('✅ Script de inicialização rápida criado');
  }
  
  /**
   * Executar setup completo
   */
  async run() {
    try {
      console.log('🎯 Configurando ambiente de desenvolvimento local...');
      console.log('');
      
      // Verificar Docker
      const dockerOk = await this.checkDockerStatus();
      if (!dockerOk) {
        return;
      }
      
      // Criar arquivos de configuração
      this.createDockerCompose();
      this.createSQLScripts();
      this.updateEnvFile();
      this.createPostmanCollection();
      this.createQuickStartScript();
      
      // Iniciar serviços
      await this.startDockerServices();
      
      // Criar filas SQS
      await this.createSQSQueues();
      
      console.log('');
      console.log('🎉 Ambiente de desenvolvimento configurado com sucesso!');
      console.log('');
      console.log('🌐 URLs de Acesso:');
      console.log('   PgAdmin: http://localhost:8080 (admin@agentes.local / admin123)');
      console.log('   Redis Commander: http://localhost:8081');
      console.log('   LocalStack Dashboard: http://localhost:4566');
      console.log('');
      console.log('🚀 Para iniciar os agentes:');
      console.log('   npm run start:all');
      console.log('');
      console.log('📋 Para testar as APIs, importe a collection do Postman:');
      console.log('   postman/agentes-autonomos-local.postman_collection.json');
      console.log('');
      console.log('🔧 Para parar o ambiente:');
      console.log('   docker-compose down');
      
    } catch (error) {
      console.error('❌ Erro durante a configuração:', error);
      process.exit(1);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const setup = new LocalEnvironmentSetup();
  setup.run();
}

module.exports = LocalEnvironmentSetup;