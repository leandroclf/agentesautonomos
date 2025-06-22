# Dependências e Configuração do Sistema

## 📋 Sumário

- [Tecnologias Base](#tecnologias-base)
- [Dependências do Node.js](#dependências-do-nodejs)
- [Serviços Externos](#serviços-externos)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Configuração por Ambiente](#configuração-por-ambiente)
- [Configuração de Segurança](#configuração-de-segurança)
- [Configuração de Monitoramento](#configuração-de-monitoramento)
- [Configuração de Banco de Dados](#configuração-de-banco-de-dados)
- [Configuração de Cache](#configuração-de-cache)
- [Troubleshooting](#troubleshooting)

## 🛠️ Tecnologias Base

### Runtime e Framework

| Tecnologia | Versão | Propósito | Documentação |
|------------|--------|-----------|-------------|
| **Node.js** | ≥18.0.0 | Runtime JavaScript | [nodejs.org](https://nodejs.org) |
| **Express.js** | ^4.18.0 | Framework web | [expressjs.com](https://expressjs.com) |
| **TypeScript** | ^5.0.0 | Tipagem estática | [typescriptlang.org](https://www.typescriptlang.org) |

### Arquitetura e Padrões

| Padrão | Implementação | Benefício |
|--------|---------------|----------|
| **Event-Driven Architecture** | Amazon SQS | Desacoplamento, Escalabilidade |
| **BDI (Belief-Desire-Intention)** | Planning Agent | Inteligência Artificial |
| **MARL (Multi-Agent RL)** | MARL Agents | Aprendizado Colaborativo |
| **Microservices** | Agentes Independentes | Manutenibilidade |
| **CQRS** | Separação Read/Write | Performance |

## 📦 Dependências do Node.js

### Dependências de Produção

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "compression": "^1.7.4",
    "express-rate-limit": "^6.7.0",
    "winston": "^3.8.2",
    "prom-client": "^14.2.0",
    "aws-sdk": "^2.1400.0",
    "pg": "^8.11.0",
    "redis": "^4.6.7",
    "joi": "^17.9.2",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.1.4",
    "uuid": "^9.0.0",
    "lodash": "^4.17.21",
    "moment": "^2.29.4",
    "axios": "^1.4.0"
  }
}
```

### Dependências de Desenvolvimento

```json
{
  "devDependencies": {
    "jest": "^29.5.0",
    "supertest": "^6.3.3",
    "eslint": "^8.42.0",
    "prettier": "^2.8.8",
    "nodemon": "^2.0.22",
    "concurrently": "^8.2.0",
    "husky": "^8.0.3",
    "lint-staged": "^13.2.2",
    "@types/node": "^20.3.1",
    "@types/express": "^4.17.17",
    "@types/jest": "^29.5.2"
  }
}
```

### Análise Detalhada de Dependências

#### Segurança
```javascript
// helmet - Proteção de headers HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// cors - Controle de CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// express-rate-limit - Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: 'Muitas requisições deste IP'
});
```

#### Logging e Monitoramento
```javascript
// winston - Sistema de logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// prom-client - Métricas Prometheus
const promClient = require('prom-client');
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP',
  labelNames: ['method', 'route', 'status_code']
});
```

#### Validação e Transformação
```javascript
// joi - Validação de schemas
const eventSchema = Joi.object({
  id: Joi.string().uuid().required(),
  type: Joi.string().valid('user_action', 'system_event').required(),
  timestamp: Joi.date().iso().required(),
  payload: Joi.object().required(),
  metadata: Joi.object().optional()
});

// Exemplo de validação
const { error, value } = eventSchema.validate(eventData);
if (error) {
  throw new ValidationError(error.details[0].message);
}
```

## 🌐 Serviços Externos

### Amazon Web Services (AWS)

#### Amazon SQS
```javascript
// Configuração SQS
const AWS = require('aws-sdk');

const sqsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.SQS_ENDPOINT // Para LocalStack
};

const sqs = new AWS.SQS(sqsConfig);

// Filas configuradas
const QUEUES = {
  INTERFACE_REQUESTS: 'interface-agent-requests',
  EVENT_PROCESSING: 'event-agent-processing',
  PLANNING_REQUESTS: 'planning-agent-requests',
  EXECUTION_TASKS: 'execution-agent-tasks',
  DLQ: 'dead-letter-queue'
};
```

#### Configuração de Filas
```javascript
// Parâmetros de fila padrão
const queueParams = {
  QueueName: queueName,
  Attributes: {
    'VisibilityTimeoutSeconds': '300',
    'MessageRetentionPeriod': '1209600', // 14 dias
    'ReceiveMessageWaitTimeSeconds': '20', // Long polling
    'RedrivePolicy': JSON.stringify({
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: 3
    })
  }
};
```

### PostgreSQL

```javascript
// Configuração PostgreSQL
const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'agentes_autonomos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // máximo de conexões
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
};

const pool = new Pool(dbConfig);
```

### Redis

```javascript
// Configuração Redis
const redis = require('redis');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
};

const client = redis.createClient(redisConfig);
```

## 🔧 Variáveis de Ambiente

### Arquivo .env.example

```bash
# ===========================================
# CONFIGURAÇÕES GERAIS
# ===========================================
NODE_ENV=development
LOG_LEVEL=info
PORT=3000

# ===========================================
# CONFIGURAÇÕES DOS AGENTES
# ===========================================

# Interface Agent
INTERFACE_AGENT_PORT=3001
INTERFACE_AGENT_HOST=localhost

# Event Agent
EVENT_AGENT_PORT=3002
EVENT_AGENT_HOST=localhost

# Planning Agent
PLANNING_AGENT_PORT=3003
PLANNING_AGENT_HOST=localhost

# Execution Agent
EXECUTION_AGENT_PORT=3004
EXECUTION_AGENT_HOST=localhost

# ===========================================
# CONFIGURAÇÕES AWS/SQS
# ===========================================
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1

# Para desenvolvimento local (LocalStack)
SQS_ENDPOINT=http://localhost:4566

# Para produção (deixar vazio para usar endpoint padrão)
# SQS_ENDPOINT=

# ===========================================
# CONFIGURAÇÕES DE BANCO DE DADOS
# ===========================================

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agentes_autonomos
DB_USER=postgres
DB_PASSWORD=postgres123

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ===========================================
# CONFIGURAÇÕES DE SEGURANÇA
# ===========================================
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ===========================================
# CONFIGURAÇÕES DE MONITORAMENTO
# ===========================================

# Prometheus
PROMETHEUS_PORT=9090
METRICS_ENDPOINT=/metrics

# Health Check
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000

# ===========================================
# CONFIGURAÇÕES DE DESENVOLVIMENTO
# ===========================================

# Mock APIs (para desenvolvimento)
MOCK_API_ENABLED=true
MOCK_API_DELAY=100

# Debug
DEBUG=agentes:*
VERBOSE_LOGGING=true
```

### Validação de Variáveis de Ambiente

```javascript
// src/config/validation.js
const Joi = require('joi');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  
  // AWS/SQS
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_REGION: Joi.string().default('us-east-1'),
  SQS_ENDPOINT: Joi.string().uri().optional(),
  
  // Database
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  
  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  
  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  
  // Monitoring
  PROMETHEUS_PORT: Joi.number().port().default(9090),
  HEALTH_CHECK_INTERVAL: Joi.number().default(30000)
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Erro na validação de variáveis de ambiente: ${error.message}`);
}

module.exports = envVars;
```

## 🏗️ Configuração por Ambiente

### Desenvolvimento

```javascript
// src/config/development.js
module.exports = {
  database: {
    logging: true,
    pool: {
      min: 2,
      max: 10
    }
  },
  
  sqs: {
    endpoint: 'http://localhost:4566', // LocalStack
    region: 'us-east-1'
  },
  
  redis: {
    retryDelayOnFailover: 100,
    lazyConnect: true
  },
  
  logging: {
    level: 'debug',
    console: true,
    file: false
  },
  
  monitoring: {
    enabled: true,
    interval: 5000
  }
};
```

### Produção

```javascript
// src/config/production.js
module.exports = {
  database: {
    logging: false,
    pool: {
      min: 10,
      max: 50
    },
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  
  sqs: {
    region: process.env.AWS_REGION,
    // endpoint será o padrão da AWS
  },
  
  redis: {
    retryDelayOnFailover: 500,
    lazyConnect: false,
    tls: {
      servername: process.env.REDIS_HOST
    }
  },
  
  logging: {
    level: 'info',
    console: false,
    file: true,
    syslog: true
  },
  
  monitoring: {
    enabled: true,
    interval: 30000,
    alerting: true
  },
  
  security: {
    helmet: {
      contentSecurityPolicy: true,
      hsts: true
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 1000
    }
  }
};
```

### Teste

```javascript
// src/config/test.js
module.exports = {
  database: {
    logging: false,
    pool: {
      min: 1,
      max: 5
    }
  },
  
  sqs: {
    endpoint: 'http://localhost:4566',
    region: 'us-east-1'
  },
  
  redis: {
    db: 15 // Database separado para testes
  },
  
  logging: {
    level: 'error',
    console: false,
    file: false
  },
  
  monitoring: {
    enabled: false
  }
};
```

## 🔒 Configuração de Segurança

### JWT Configuration

```javascript
// src/config/security.js
const jwt = require('jsonwebtoken');

const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  algorithm: 'HS256',
  issuer: 'agentes-autonomos',
  audience: 'agentes-autonomos-users'
};

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }
  
  jwt.verify(token, jwtConfig.secret, jwtConfig, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};
```

### Configuração de HTTPS

```javascript
// src/config/https.js
const https = require('https');
const fs = require('fs');

const httpsOptions = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH || './certs/private-key.pem'),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH || './certs/certificate.pem'),
  ca: fs.readFileSync(process.env.SSL_CA_PATH || './certs/ca-certificate.pem')
};

// Para produção
if (process.env.NODE_ENV === 'production') {
  const server = https.createServer(httpsOptions, app);
  server.listen(process.env.HTTPS_PORT || 443);
}
```

## 📊 Configuração de Monitoramento

### Prometheus Metrics

```javascript
// src/config/metrics.js
const promClient = require('prom-client');

// Registro padrão
const register = new promClient.Registry();

// Métricas customizadas
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const eventProcessingDuration = new promClient.Histogram({
  name: 'event_processing_duration_seconds',
  help: 'Duração do processamento de eventos',
  labelNames: ['agent', 'event_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections_total',
  help: 'Número total de conexões ativas',
  labelNames: ['type']
});

const sqsMessages = new promClient.Counter({
  name: 'sqs_messages_total',
  help: 'Total de mensagens SQS processadas',
  labelNames: ['queue', 'status']
});

// Registrar métricas
register.registerMetric(httpRequestDuration);
register.registerMetric(eventProcessingDuration);
register.registerMetric(activeConnections);
register.registerMetric(sqsMessages);

// Métricas padrão do Node.js
register.setDefaultLabels({
  app: 'agentes-autonomos',
  version: process.env.npm_package_version
});

promClient.collectDefaultMetrics({ register });

module.exports = {
  register,
  httpRequestDuration,
  eventProcessingDuration,
  activeConnections,
  sqsMessages
};
```

### Health Checks

```javascript
// src/config/health.js
const healthChecks = {
  database: async () => {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy', latency: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  },
  
  redis: async () => {
    try {
      await redisClient.ping();
      return { status: 'healthy', latency: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  },
  
  sqs: async () => {
    try {
      await sqs.listQueues().promise();
      return { status: 'healthy', latency: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
};

const performHealthCheck = async () => {
  const results = {};
  
  for (const [service, check] of Object.entries(healthChecks)) {
    const start = Date.now();
    try {
      results[service] = await check();
      results[service].latency = Date.now() - start;
    } catch (error) {
      results[service] = {
        status: 'unhealthy',
        error: error.message,
        latency: Date.now() - start
      };
    }
  }
  
  return results;
};
```

## 🗄️ Configuração de Banco de Dados

### Migrations

```sql
-- migrations/001_create_events_table.sql
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  agent_id VARCHAR(100),
  correlation_id UUID,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_events_correlation_id ON events(correlation_id);
```

```sql
-- migrations/002_create_agent_states_table.sql
CREATE TABLE IF NOT EXISTS agent_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL,
  state_key VARCHAR(200) NOT NULL,
  state_value JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, state_key)
);

CREATE INDEX idx_agent_states_agent_id ON agent_states(agent_id);
CREATE INDEX idx_agent_states_key ON agent_states(state_key);
```

### Connection Pool

```javascript
// src/config/database.js
const { Pool } = require('pg');

class DatabaseManager {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 30000,
      query_timeout: 30000
    });
    
    this.pool.on('error', (err) => {
      console.error('Erro inesperado no pool de conexões:', err);
      process.exit(-1);
    });
  }
  
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Query executada:', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Erro na query:', { text, error: error.message });
      throw error;
    }
  }
  
  async getClient() {
    return await this.pool.connect();
  }
  
  async close() {
    await this.pool.end();
  }
}

module.exports = new DatabaseManager();
```

## 🚀 Configuração de Cache

### Redis Configuration

```javascript
// src/config/cache.js
const redis = require('redis');

class CacheManager {
  constructor() {
    this.client = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
    
    this.client.on('error', (err) => {
      console.error('Erro no Redis:', err);
    });
    
    this.client.on('connect', () => {
      console.log('Conectado ao Redis');
    });
  }
  
  async set(key, value, ttl = 3600) {
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
    } catch (error) {
      console.error('Erro ao definir cache:', error);
      throw error;
    }
  }
  
  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Erro ao obter cache:', error);
      return null;
    }
  }
  
  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Erro ao deletar cache:', error);
    }
  }
  
  async flush() {
    try {
      await this.client.flushdb();
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
    }
  }
}

module.exports = new CacheManager();
```

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Conexão com SQS
```bash
# Verificar se LocalStack está rodando
docker ps | grep localstack

# Testar conectividade
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

#### 2. Conexão com PostgreSQL
```bash
# Verificar se PostgreSQL está rodando
psql -h localhost -U postgres -d agentes_autonomos -c "SELECT version();"
```

#### 3. Conexão com Redis
```bash
# Testar conexão Redis
redis-cli -h localhost -p 6379 ping
```

#### 4. Problemas de Memória
```javascript
// Monitoramento de memória
const memoryUsage = process.memoryUsage();
console.log({
  rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
  heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
  heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
  external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
});
```

### Logs de Debug

```javascript
// Habilitar logs detalhados
process.env.DEBUG = 'agentes:*';
process.env.VERBOSE_LOGGING = 'true';

// Logs específicos por módulo
process.env.DEBUG = 'agentes:interface,agentes:event,agentes:planning';
```

### Verificação de Saúde

```bash
# Endpoint de health check
curl http://localhost:3000/health

# Métricas Prometheus
curl http://localhost:3000/metrics

# Status detalhado
curl http://localhost:3000/status
```

---

## 📚 Próximos Passos

Para continuar a configuração:

1. [Instalação e Execução](INSTALACAO_EXECUCAO.md)
2. [API e Endpoints](API_ENDPOINTS.md)
3. [Monitoramento e Observabilidade](MONITORAMENTO.md)

---

*Documentação gerada automaticamente - Última atualização: $(date)*