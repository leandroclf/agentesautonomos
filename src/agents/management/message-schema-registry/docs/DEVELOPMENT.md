# Guia de Desenvolvimento - Message Schema Registry

Este documento fornece informações essenciais para desenvolvedores que desejam contribuir com o Message Schema Registry.

## 📋 Índice

- [Configuração do Ambiente](#configuração-do-ambiente)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Padrões de Código](#padrões-de-código)
- [Testes](#testes)
- [Debugging](#debugging)
- [Performance](#performance)
- [Segurança](#segurança)
- [Contribuição](#contribuição)
- [Troubleshooting](#troubleshooting)

## 🛠️ Configuração do Ambiente

### Pré-requisitos

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Redis**: >= 6.0.0
- **Docker**: >= 20.0.0 (opcional)
- **Git**: >= 2.30.0

### Instalação Local

```bash
# 1. Clonar o repositório
git clone https://github.com/company/message-schema-registry.git
cd message-schema-registry

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# 4. Iniciar serviços de dependência
docker-compose up -d redis

# 5. Executar migrações (se necessário)
npm run migrate

# 6. Iniciar em modo desenvolvimento
npm run dev
```

### Configuração com Docker

```bash
# Desenvolvimento completo com Docker
docker-compose -f docker-compose.dev.yml up

# Apenas serviços de dependência
docker-compose up -d redis aws-localstack
```

### Variáveis de Ambiente

```bash
# .env.development
NODE_ENV=development
PORT=3000
HOST=localhost

# Logging
LOG_LEVEL=debug
LOG_FILE=logs/app.log

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# AWS (para desenvolvimento local)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_SQS_ENDPOINT=http://localhost:4566

# Segurança
JWT_SECRET=your-development-secret
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Features
ENABLE_SWAGGER=true
ENABLE_METRICS=true
ENABLE_CLUSTERING=false
```

## 📁 Estrutura do Projeto

```
src/
├── config/
│   └── schemaConfig.js          # Configurações centralizadas
├── routes/
│   ├── schemaRoutes.js          # Rotas de schemas
│   ├── validationRoutes.js      # Rotas de validação
│   ├── versionRoutes.js         # Rotas de versões
│   ├── compatibilityRoutes.js   # Rotas de compatibilidade
│   ├── migrationRoutes.js       # Rotas de migração
│   └── healthRoutes.js          # Rotas de saúde
├── services/
│   ├── schemaService.js         # Lógica de schemas
│   ├── validationService.js     # Lógica de validação
│   ├── versionService.js        # Lógica de versões
│   ├── compatibilityService.js  # Lógica de compatibilidade
│   ├── migrationService.js      # Lógica de migração
│   ├── cacheService.js          # Serviço de cache
│   ├── metricsService.js        # Serviço de métricas
│   ├── healthService.js         # Serviço de saúde
│   ├── alertService.js          # Serviço de alertas
│   └── sqsService.js            # Serviço SQS
├── middleware/
│   ├── auth.js                  # Autenticação
│   ├── validation.js            # Validação de entrada
│   ├── errorHandler.js          # Tratamento de erros
│   └── logging.js               # Logging de requisições
├── utils/
│   ├── logger.js                # Utilitários de log
│   ├── validators.js            # Validadores customizados
│   └── helpers.js               # Funções auxiliares
├── models/
│   ├── Schema.js                # Modelo de schema
│   ├── Version.js               # Modelo de versão
│   └── Migration.js             # Modelo de migração
├── tests/
│   ├── unit/                    # Testes unitários
│   ├── integration/             # Testes de integração
│   ├── e2e/                     # Testes end-to-end
│   └── fixtures/                # Dados de teste
├── docs/                        # Documentação
├── scripts/                     # Scripts utilitários
└── server.js                    # Ponto de entrada
```

## 📝 Padrões de Código

### ESLint e Prettier

```json
// .eslintrc.js
module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    'no-console': 'warn',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
    'no-var': 'error'
  }
}
```

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80
}
```

### Convenções de Nomenclatura

```javascript
// Classes: PascalCase
class SchemaService {
  // Métodos: camelCase
  async registerSchema(subject, schema) {
    // Variáveis: camelCase
    const schemaId = generateId()
    
    // Constantes: UPPER_SNAKE_CASE
    const MAX_SCHEMA_SIZE = 1024 * 1024
    
    // Propriedades privadas: _camelCase
    this._internalCache = new Map()
  }
}

// Funções: camelCase
function validateSchemaFormat(schema) {
  // ...
}

// Arquivos: kebab-case
// schema-service.js, validation-routes.js
```

### Estrutura de Serviços

```javascript
// Padrão para serviços
class ExampleService {
  constructor(dependencies) {
    this.config = dependencies.config
    this.logger = dependencies.logger
    this.cache = dependencies.cache
    this.metrics = dependencies.metrics
    
    // Estado interno
    this._initialized = false
  }
  
  async initialize() {
    if (this._initialized) return
    
    // Lógica de inicialização
    this.logger.info('ExampleService initialized')
    this._initialized = true
  }
  
  async publicMethod(param) {
    this._validateInput(param)
    
    try {
      const result = await this._processData(param)
      this.metrics.incrementCounter('example_operations_total')
      return result
    } catch (error) {
      this.logger.error('Error in publicMethod', { error, param })
      this.metrics.incrementCounter('example_errors_total')
      throw error
    }
  }
  
  _validateInput(param) {
    if (!param) {
      throw new Error('Parameter is required')
    }
  }
  
  async _processData(param) {
    // Lógica interna
  }
  
  async shutdown() {
    this.logger.info('ExampleService shutting down')
    // Cleanup
  }
}
```

### Tratamento de Erros

```javascript
// Hierarquia de erros customizados
class BaseError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.timestamp = new Date().toISOString()
  }
}

class ValidationError extends BaseError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR')
    this.details = details
  }
}

class NotFoundError extends BaseError {
  constructor(resource, id) {
    super(`${resource} with id '${id}' not found`, 404, 'NOT_FOUND')
    this.resource = resource
    this.id = id
  }
}

// Uso nos serviços
class SchemaService {
  async getSchema(subject, version) {
    if (!subject) {
      throw new ValidationError('Subject is required')
    }
    
    const schema = await this._findSchema(subject, version)
    if (!schema) {
      throw new NotFoundError('Schema', `${subject}:${version}`)
    }
    
    return schema
  }
}
```

### Logging

```javascript
// Padrão de logging estruturado
class SchemaService {
  async registerSchema(subject, schema) {
    const correlationId = generateCorrelationId()
    
    this.logger.info('Schema registration started', {
      correlationId,
      subject,
      format: schema.format,
      size: JSON.stringify(schema).length
    })
    
    try {
      const result = await this._processRegistration(subject, schema)
      
      this.logger.info('Schema registration completed', {
        correlationId,
        subject,
        version: result.version,
        duration: Date.now() - startTime
      })
      
      return result
    } catch (error) {
      this.logger.error('Schema registration failed', {
        correlationId,
        subject,
        error: error.message,
        stack: error.stack
      })
      
      throw error
    }
  }
}
```

## 🧪 Testes

### Estrutura de Testes

```
tests/
├── unit/
│   ├── services/
│   │   ├── schemaService.test.js
│   │   ├── validationService.test.js
│   │   └── versionService.test.js
│   ├── utils/
│   │   ├── validators.test.js
│   │   └── helpers.test.js
│   └── middleware/
│       ├── auth.test.js
│       └── validation.test.js
├── integration/
│   ├── routes/
│   │   ├── schemas.test.js
│   │   ├── validation.test.js
│   │   └── versions.test.js
│   └── services/
│       └── integration.test.js
├── e2e/
│   ├── api.test.js
│   ├── migration.test.js
│   └── compatibility.test.js
├── fixtures/
│   ├── schemas/
│   ├── messages/
│   └── responses/
└── helpers/
    ├── testServer.js
    ├── mockServices.js
    └── fixtures.js
```

### Configuração do Jest

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tests/**',
    '!src/scripts/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  testTimeout: 10000
}
```

### Exemplo de Teste Unitário

```javascript
// tests/unit/services/schemaService.test.js
const SchemaService = require('../../../src/services/schemaService')
const { createMockLogger, createMockCache } = require('../../helpers/mockServices')

describe('SchemaService', () => {
  let schemaService
  let mockLogger
  let mockCache
  let mockMetrics
  
  beforeEach(() => {
    mockLogger = createMockLogger()
    mockCache = createMockCache()
    mockMetrics = {
      incrementCounter: jest.fn(),
      recordHistogram: jest.fn()
    }
    
    schemaService = new SchemaService({
      config: { schemas: { maxSize: 1024 } },
      logger: mockLogger,
      cache: mockCache,
      metrics: mockMetrics
    })
  })
  
  describe('registerSchema', () => {
    it('should register a valid schema', async () => {
      const subject = 'test-subject'
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
      
      const result = await schemaService.registerSchema(subject, {
        format: 'json-schema',
        schema
      })
      
      expect(result).toMatchObject({
        subject,
        format: 'json-schema',
        schema
      })
      expect(result.id).toBeDefined()
      expect(result.version).toBeDefined()
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'schemas_registered_total',
        { subject, format: 'json-schema' }
      )
    })
    
    it('should throw ValidationError for invalid schema', async () => {
      const subject = 'test-subject'
      const invalidSchema = { invalid: true }
      
      await expect(
        schemaService.registerSchema(subject, {
          format: 'json-schema',
          schema: invalidSchema
        })
      ).rejects.toThrow('Invalid schema format')
    })
  })
})
```

### Exemplo de Teste de Integração

```javascript
// tests/integration/routes/schemas.test.js
const request = require('supertest')
const { createTestServer } = require('../../helpers/testServer')
const { loadFixture } = require('../../helpers/fixtures')

describe('Schema Routes', () => {
  let app
  let server
  let authToken
  
  beforeAll(async () => {
    ({ app, server } = await createTestServer())
    authToken = await getAuthToken(app)
  })
  
  afterAll(async () => {
    await server.close()
  })
  
  describe('POST /api/v1/schemas', () => {
    it('should register a new schema', async () => {
      const schemaData = loadFixture('schemas/user-profile.json')
      
      const response = await request(app)
        .post('/api/v1/schemas')
        .set('Authorization', `Bearer ${authToken}`)
        .send(schemaData)
        .expect(201)
      
      expect(response.body).toMatchObject({
        subject: schemaData.subject,
        format: schemaData.format,
        version: expect.stringMatching(/^\d+\.\d+\.\d+$/)
      })
    })
    
    it('should return 400 for invalid schema data', async () => {
      const invalidData = { subject: '' }
      
      const response = await request(app)
        .post('/api/v1/schemas')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400)
      
      expect(response.body.errors).toBeDefined()
    })
  })
})
```

### Scripts de Teste

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false"
  }
}
```

## 🐛 Debugging

### Configuração do VS Code

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/server.js",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["--inspect"]
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache"],
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "test"
      }
    }
  ]
}
```

### Debug com Node.js Inspector

```bash
# Iniciar com debug
node --inspect src/server.js

# Iniciar com debug e break no início
node --inspect-brk src/server.js

# Debug de testes específicos
node --inspect-brk node_modules/.bin/jest tests/unit/services/schemaService.test.js
```

### Logging para Debug

```javascript
// Configuração de debug logging
const logger = require('./utils/logger')

// Em desenvolvimento, usar nível debug
if (process.env.NODE_ENV === 'development') {
  logger.level = 'debug'
}

// Exemplo de uso
class SchemaService {
  async registerSchema(subject, schema) {
    logger.debug('Registering schema', { subject, schemaSize: JSON.stringify(schema).length })
    
    // Adicionar breakpoints condicionais
    if (subject === 'debug-subject') {
      debugger // eslint-disable-line no-debugger
    }
    
    const result = await this._processSchema(schema)
    logger.debug('Schema processed', { result })
    
    return result
  }
}
```

## ⚡ Performance

### Profiling

```bash
# Profiling com Node.js
node --prof src/server.js

# Processar arquivo de profiling
node --prof-process isolate-*.log > profile.txt

# Profiling de memória
node --inspect --expose-gc src/server.js
```

### Monitoramento de Performance

```javascript
// Performance hooks
const { performance, PerformanceObserver } = require('perf_hooks')

class PerformanceMonitor {
  constructor(logger) {
    this.logger = logger
    this.setupObserver()
  }
  
  setupObserver() {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 100) { // Log operações > 100ms
          this.logger.warn('Slow operation detected', {
            name: entry.name,
            duration: entry.duration,
            type: entry.entryType
          })
        }
      }
    })
    
    obs.observe({ entryTypes: ['measure', 'function'] })
  }
  
  measureAsync(name, fn) {
    return async (...args) => {
      const start = performance.now()
      try {
        const result = await fn(...args)
        const end = performance.now()
        performance.measure(name, { start, end })
        return result
      } catch (error) {
        const end = performance.now()
        performance.measure(`${name}-error`, { start, end })
        throw error
      }
    }
  }
}

// Uso
const monitor = new PerformanceMonitor(logger)
const measuredValidation = monitor.measureAsync('schema-validation', originalValidationFn)
```

### Otimizações

```javascript
// Cache inteligente
class SmartCache {
  constructor(redis, options = {}) {
    this.redis = redis
    this.localCache = new Map()
    this.maxLocalSize = options.maxLocalSize || 1000
    this.localTTL = options.localTTL || 60000 // 1 minuto
  }
  
  async get(key) {
    // Tentar cache local primeiro
    const localEntry = this.localCache.get(key)
    if (localEntry && Date.now() < localEntry.expires) {
      return localEntry.value
    }
    
    // Buscar no Redis
    const value = await this.redis.get(key)
    if (value) {
      this.setLocal(key, value)
    }
    
    return value
  }
  
  setLocal(key, value) {
    if (this.localCache.size >= this.maxLocalSize) {
      const firstKey = this.localCache.keys().next().value
      this.localCache.delete(firstKey)
    }
    
    this.localCache.set(key, {
      value,
      expires: Date.now() + this.localTTL
    })
  }
}
```

## 🔒 Segurança

### Validação de Entrada

```javascript
// Sanitização e validação
const validator = require('validator')
const xss = require('xss')

class InputValidator {
  static sanitizeString(input, maxLength = 255) {
    if (typeof input !== 'string') {
      throw new ValidationError('Input must be a string')
    }
    
    // Remover XSS
    const sanitized = xss(input, {
      whiteList: {}, // Não permitir tags HTML
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    })
    
    // Validar comprimento
    if (sanitized.length > maxLength) {
      throw new ValidationError(`Input too long (max: ${maxLength})`)
    }
    
    return sanitized.trim()
  }
  
  static validateEmail(email) {
    if (!validator.isEmail(email)) {
      throw new ValidationError('Invalid email format')
    }
    return email.toLowerCase()
  }
  
  static validateSubject(subject) {
    const sanitized = this.sanitizeString(subject, 100)
    
    // Permitir apenas caracteres alfanuméricos, hífens e underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      throw new ValidationError('Subject contains invalid characters')
    }
    
    return sanitized
  }
}
```

### Rate Limiting Avançado

```javascript
// Rate limiting por usuário e endpoint
const rateLimit = require('express-rate-limit')
const RedisStore = require('rate-limit-redis')

class AdvancedRateLimit {
  constructor(redis) {
    this.redis = redis
  }
  
  createLimiter(options) {
    return rateLimit({
      store: new RedisStore({
        client: this.redis,
        prefix: 'rl:'
      }),
      keyGenerator: (req) => {
        // Rate limit por usuário autenticado ou IP
        return req.user?.id || req.ip
      },
      ...options
    })
  }
  
  // Diferentes limites para diferentes endpoints
  getSchemaLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100, // 100 requests
      message: 'Too many schema requests'
    })
  }
  
  getValidationLimiter() {
    return this.createLimiter({
      windowMs: 1 * 60 * 1000, // 1 minuto
      max: 1000, // 1000 validações por minuto
      message: 'Too many validation requests'
    })
  }
}
```

## 🤝 Contribuição

### Fluxo de Desenvolvimento

```bash
# 1. Criar branch para feature/bugfix
git checkout -b feature/new-validation-format

# 2. Fazer alterações e commits
git add .
git commit -m "feat: add support for Avro schema validation"

# 3. Executar testes
npm test
npm run lint

# 4. Push e criar Pull Request
git push origin feature/new-validation-format
```

### Convenções de Commit

```
feat: nova funcionalidade
fix: correção de bug
docs: alterações na documentação
style: formatação, ponto e vírgula, etc
refactor: refatoração de código
test: adição ou correção de testes
chore: tarefas de manutenção

# Exemplos:
feat(validation): add Avro schema support
fix(cache): resolve Redis connection timeout
docs(api): update validation endpoint documentation
test(schema): add unit tests for schema registration
```

### Code Review Checklist

- [ ] Código segue os padrões estabelecidos
- [ ] Testes unitários adicionados/atualizados
- [ ] Documentação atualizada
- [ ] Performance considerada
- [ ] Segurança validada
- [ ] Logs apropriados adicionados
- [ ] Tratamento de erros implementado
- [ ] Backward compatibility mantida

## 🔧 Troubleshooting

### Problemas Comuns

#### Redis Connection Issues
```bash
# Verificar se Redis está rodando
redis-cli ping

# Verificar logs do Redis
docker logs redis-container

# Testar conexão
telnet localhost 6379
```

#### Memory Leaks
```bash
# Monitorar uso de memória
node --expose-gc --inspect src/server.js

# Forçar garbage collection
curl http://localhost:9229/json/runtime/evaluate \
  -H "Content-Type: application/json" \
  -d '{"expression": "global.gc()"}'
```

#### Performance Issues
```bash
# Profiling de CPU
node --prof src/server.js

# Análise de heap
node --inspect src/server.js
# Abrir chrome://inspect no Chrome
```

### Logs de Debug

```javascript
// Habilitar logs detalhados
process.env.LOG_LEVEL = 'debug'
process.env.DEBUG = 'schema-registry:*'

// Logs específicos por módulo
const debug = require('debug')
const schemaDebug = debug('schema-registry:schema')
const cacheDebug = debug('schema-registry:cache')

schemaDebug('Schema validation started for %s', subject)
cacheDebug('Cache hit for key %s', cacheKey)
```

### Ferramentas de Desenvolvimento

```bash
# Análise de bundle
npm install -g webpack-bundle-analyzer
webpack-bundle-analyzer dist/stats.json

# Análise de dependências
npm audit
npm outdated

# Linting e formatação
npm run lint
npm run format

# Verificação de tipos (se usando TypeScript)
npm run type-check
```

---

**Última atualização**: 2024
**Versão**: 1.0.0
**Mantenedores**: Schema Registry Team