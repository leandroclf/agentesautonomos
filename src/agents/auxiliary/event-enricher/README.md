# Event Enricher Agent

## Visão Geral

O **Event Enricher Agent** é um componente crítico do sistema de agentes autônomos responsável por enriquecer eventos com contexto adicional, validar sua estrutura e normalizar dados para garantir consistência em todo o sistema.

## Funcionalidades Principais

### 🔍 Enriquecimento de Eventos
- **Metadados**: Adiciona timestamp de processamento, versão do schema, identificadores únicos
- **Geolocalização**: Enriquece com dados de localização baseados em IP
- **User Agent**: Extrai informações de dispositivo, browser e sistema operacional
- **Informações de Sessão**: Adiciona contexto de sessão do usuário
- **Dados Contextuais**: Integra informações de usuário, organização e aplicação

### ✅ Validação de Eventos
- **Schemas Joi**: Validação robusta usando schemas predefinidos
- **Validação Customizada**: Regras específicas por tipo de evento
- **Sanitização**: Limpeza de dados usando DOMPurify
- **Detecção de Anomalias**: Identificação de eventos suspeitos ou malformados

### 🔄 Normalização de Dados
- **Mapeamento de Campos**: Conversão de nomes de campos para padrão unificado
- **Formatação de Tipos**: Normalização de timestamps, emails, URLs, telefones
- **Estruturação**: Organização de dados em formato consistente
- **Metadados de Normalização**: Rastreamento de transformações aplicadas

### 📊 Contexto e Cache
- **Cache Redis**: Cache inteligente para dados de contexto frequentemente acessados
- **Múltiplas Fontes**: Integração com banco de dados, APIs externas e cache
- **Limpeza Automática**: Gerenciamento automático de cache com TTL
- **Estatísticas**: Métricas de performance de cache e lookups

## Arquitetura

### Componentes Principais

```
event-enricher/
├── index.js                 # Ponto de entrada principal
├── config/
│   └── enricherConfig.js    # Configurações do agente
├── services/
│   ├── enrichmentService.js # Serviço de enriquecimento
│   ├── contextService.js    # Serviço de contexto
│   ├── validationService.js # Serviço de validação
│   └── normalizationService.js # Serviço de normalização
├── routes/
│   └── enricherRoutes.js    # Rotas da API REST
├── middleware/
│   └── enricherMiddleware.js # Middlewares customizados
└── tests/
    └── enricher.test.js     # Testes unitários e integração
```

### Fluxo de Processamento

1. **Recepção**: Eventos chegam via SQS (`raw-events`, `incoming-events`)
2. **Validação**: Verificação de estrutura e sanitização
3. **Normalização**: Padronização de campos e tipos
4. **Enriquecimento**: Adição de contexto e metadados
5. **Publicação**: Envio para filas de destino (`enriched-events`)
6. **Monitoramento**: Coleta de métricas e logs

## Configuração

### Variáveis de Ambiente

```bash
# Servidor
PORT=3006
NODE_ENV=production
LOG_LEVEL=info

# AWS SQS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
SQS_RAW_EVENTS_QUEUE=raw-events-dev
SQS_ENRICHED_EVENTS_QUEUE=enriched-events-dev
SQS_VALIDATION_ERRORS_QUEUE=validation-errors-dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# Cache
CACHE_TTL=3600
CACHE_MAX_SIZE=1000
CACHE_CLEANUP_INTERVAL=300

# Processamento
MAX_CONCURRENT_EVENTS=10
PROCESSING_TIMEOUT=30000
RETRY_ATTEMPTS=3
RETRY_DELAY=1000

# Métricas
METRICS_ENABLED=true
METRICS_PORT=9090
```

### Configuração de Filas SQS

#### Filas de Entrada
- `raw-events-{env}`: Eventos brutos para processamento
- `incoming-events-{env}`: Eventos de entrada direta

#### Filas de Saída
- `enriched-events-{env}`: Eventos enriquecidos processados
- `validation-errors-{env}`: Eventos com erros de validação

#### Dead Letter Queues
- `raw-events-dlq-{env}`: DLQ para eventos brutos
- `incoming-events-dlq-{env}`: DLQ para eventos de entrada

## API REST

### Endpoints Principais

#### Health Check
```http
GET /api/enricher/health
```
Retorna status de saúde do agente e serviços.

#### Status Detalhado
```http
GET /api/enricher/status
```
Informações detalhadas sobre o estado do agente.

#### Estatísticas
```http
GET /api/enricher/stats
```
Estatísticas consolidadas de todos os serviços.

#### Enriquecimento Manual
```http
POST /api/enricher/enrich
Content-Type: application/json

{
  "id": "event-123",
  "type": "user.login",
  "source": "web-app",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "data": {
    "action": "login",
    "userId": "user-456"
  },
  "userId": "user-456",
  "sessionId": "session-789"
}
```

#### Validação Manual
```http
POST /api/enricher/validate
Content-Type: application/json

{
  "id": "event-123",
  "type": "user.register",
  "source": "mobile-app",
  "data": {
    "email": "user@example.com"
  }
}
```

#### Normalização Manual
```http
POST /api/enricher/normalize
Content-Type: application/json

{
  "event_type": "login",
  "user_id": "user-123",
  "created_at": 1704110400000
}
```

#### Métricas Prometheus
```http
GET /api/enricher/metrics
```
Métricas no formato Prometheus.

### Controle de Serviços

```http
# Parar serviço
POST /api/enricher/services/{service}/stop

# Iniciar serviço
POST /api/enricher/services/{service}/start
```

Serviços disponíveis: `enrichment`, `context`, `validation`, `normalization`

## Instalação e Execução

### Pré-requisitos
- Node.js >= 16.0.0
- npm >= 8.0.0
- Redis (para cache)
- AWS SQS (para filas)

### Instalação Local

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Executar em desenvolvimento
npm run dev

# Executar em produção
npm start
```

### Docker

```bash
# Build da imagem
npm run docker:build

# Executar container
npm run docker:run

# Ou usando docker-compose
docker-compose up event-enricher
```

### Kubernetes

```bash
# Deploy usando Helm
helm install event-enricher ./helm/event-enricher

# Ou aplicar manifests diretamente
kubectl apply -f k8s/
```

## Testes

### Executar Testes

```bash
# Todos os testes
npm test

# Testes com watch
npm run test:watch

# Cobertura de código
npm run test:coverage

# Linting
npm run lint

# Validação completa
npm run validate
```

### Estrutura de Testes

- **Testes de Integração**: Testam endpoints da API
- **Testes Unitários**: Testam serviços individuais
- **Testes de Performance**: Validam throughput e latência
- **Testes de Carga**: Simulam alto volume de eventos

## Monitoramento

### Métricas Principais

- `event_enricher_enrichments_total`: Total de enriquecimentos
- `event_enricher_enrichments_duration`: Duração dos enriquecimentos
- `event_enricher_validations_total`: Total de validações
- `event_enricher_validation_errors_total`: Total de erros de validação
- `event_enricher_normalizations_total`: Total de normalizações
- `event_enricher_cache_hits_total`: Cache hits
- `event_enricher_cache_misses_total`: Cache misses
- `event_enricher_service_status`: Status dos serviços

### Logs

O agente utiliza Winston para logging estruturado:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "Event enriched successfully",
  "eventId": "event-123",
  "enrichmentTime": 45,
  "strategies": ["metadata", "context", "geolocation"]
}
```

### Health Checks

- **Liveness**: `/api/enricher/health`
- **Readiness**: Verifica conectividade com Redis e SQS
- **Startup**: Valida inicialização de todos os serviços

## Troubleshooting

### Problemas Comuns

#### Erro de Conexão Redis
```bash
# Verificar conectividade
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Verificar logs
docker logs event-enricher-agent
```

#### Erro de Permissão SQS
```bash
# Verificar políticas IAM
aws iam get-user-policy --user-name event-enricher-user --policy-name SQSAccess

# Testar acesso às filas
aws sqs list-queues --region $AWS_REGION
```

#### Alto Uso de Memória
```bash
# Verificar estatísticas de cache
curl http://localhost:3006/api/enricher/stats

# Ajustar configurações de cache
export CACHE_MAX_SIZE=500
export CACHE_TTL=1800
```

### Debug Mode

```bash
# Ativar logs detalhados
export LOG_LEVEL=debug
export DEBUG=event-enricher:*

# Executar com debug
npm run dev
```

## Contribuição

### Desenvolvimento

1. Fork o repositório
2. Crie uma branch para sua feature
3. Implemente as mudanças
4. Execute os testes
5. Submeta um Pull Request

### Padrões de Código

- ESLint para linting
- Prettier para formatação
- Conventional Commits para mensagens
- 80%+ cobertura de testes

## Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## Suporte

Para suporte e dúvidas:
- Abra uma issue no GitHub
- Consulte a documentação técnica
- Entre em contato com a equipe de desenvolvimento

---

**Event Enricher Agent** - Parte do Sistema de Agentes Autônomos v1.0.0