# Event Enricher Agent - Documentação Técnica

## Visão Geral

O **Event Enricher Agent** é um componente fundamental do sistema de agentes autônomos, responsável por enriquecer eventos com contexto adicional, validar sua estrutura e normalizar dados para garantir consistência em todo o ecossistema.

## Status de Implementação

✅ **IMPLEMENTADO** - Fase 6 (Janeiro 2024)

- **Localização**: `src/agents/auxiliary/event-enricher/`
- **Porta**: 3006
- **Prioridade**: Alta
- **Dependências**: Nenhuma crítica

## Arquitetura e Componentes

### Estrutura de Arquivos

```
src/agents/auxiliary/event-enricher/
├── index.js                    # Ponto de entrada principal
├── package.json               # Dependências e scripts
├── Dockerfile                 # Containerização
├── README.md                  # Documentação do componente
├── config/
│   └── enricherConfig.js      # Configurações centralizadas
├── services/
│   ├── enrichmentService.js   # Lógica de enriquecimento
│   ├── contextService.js      # Gerenciamento de contexto
│   ├── validationService.js   # Validação de eventos
│   └── normalizationService.js # Normalização de dados
├── routes/
│   └── enricherRoutes.js      # Endpoints da API REST
├── middleware/
│   └── enricherMiddleware.js  # Middlewares customizados
└── tests/
    └── enricher.test.js       # Testes unitários e integração
```

### Serviços Principais

#### 1. EnrichmentService
- **Função**: Coordena o processo de enriquecimento
- **Estratégias**: Metadata, geolocalização, user agent, sessão, contexto
- **Cache**: Implementa cache inteligente para performance
- **Métricas**: Coleta estatísticas de enriquecimento

#### 2. ContextService
- **Função**: Adiciona contexto de usuário, sessão e organização
- **Fontes**: Redis, banco de dados, APIs externas
- **Cache**: TTL configurável com limpeza automática
- **Fallback**: Graceful degradation quando contexto não disponível

#### 3. ValidationService
- **Função**: Valida estrutura e conteúdo dos eventos
- **Schemas**: Joi schemas para diferentes tipos de evento
- **Sanitização**: DOMPurify para limpeza de dados
- **Regras Customizadas**: Validações específicas por domínio

#### 4. NormalizationService
- **Função**: Normaliza campos e tipos de dados
- **Mapeamentos**: Conversão de nomes de campos legados
- **Formatação**: Timestamps, emails, URLs, telefones
- **Metadados**: Rastreamento de transformações aplicadas

## Integração com SQS

### Filas de Entrada

#### raw-events-{env}
- **Propósito**: Eventos brutos para processamento completo
- **Formato**: JSON com estrutura flexível
- **Volume**: Alto (1000+ eventos/min)
- **DLQ**: `raw-events-dlq-{env}`

#### incoming-events-{env}
- **Propósito**: Eventos de entrada direta
- **Formato**: JSON pré-estruturado
- **Volume**: Médio (500+ eventos/min)
- **DLQ**: `incoming-events-dlq-{env}`

### Filas de Saída

#### enriched-events-{env}
- **Propósito**: Eventos enriquecidos e processados
- **Formato**: JSON estruturado com metadados
- **Consumidores**: Outros agentes do sistema
- **Retenção**: 14 dias

#### validation-errors-{env}
- **Propósito**: Eventos com erros de validação
- **Formato**: JSON com detalhes do erro
- **Consumidores**: Monitoring Agent, alertas
- **Retenção**: 7 dias

## API REST

### Endpoints de Saúde

```http
GET /api/enricher/health
```
**Resposta**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "services": {
    "enrichment": true,
    "context": true,
    "validation": true,
    "normalization": true
  },
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Endpoints de Processamento

```http
POST /api/enricher/enrich
Content-Type: application/json

{
  "id": "evt_123",
  "type": "user.login",
  "source": "web-app",
  "data": {
    "userId": "user_456",
    "ip": "192.168.1.1"
  }
}
```

**Resposta**:
```json
{
  "success": true,
  "original": { /* evento original */ },
  "enriched": {
    "id": "evt_123",
    "type": "user.login",
    "source": "web-app",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "data": {
      "userId": "user_456",
      "ip": "192.168.1.1"
    },
    "enrichment": {
      "metadata": {
        "processedAt": "2024-01-01T12:00:01.000Z",
        "version": "1.0.0",
        "enricherId": "enricher-001"
      },
      "geolocation": {
        "country": "BR",
        "region": "SP",
        "city": "São Paulo"
      },
      "context": {
        "user": {
          "name": "João Silva",
          "email": "joao@example.com"
        },
        "session": {
          "id": "sess_789",
          "startTime": "2024-01-01T11:30:00.000Z"
        }
      }
    }
  },
  "processingTime": 45
}
```

### Endpoints de Métricas

```http
GET /api/enricher/stats
```
**Resposta**:
```json
{
  "enrichment": {
    "totalEnrichments": 15420,
    "successfulEnrichments": 15380,
    "failedEnrichments": 40,
    "averageProcessingTime": 42.5,
    "strategiesUsed": {
      "metadata": 15420,
      "geolocation": 12340,
      "context": 11200,
      "userAgent": 8900
    }
  },
  "validation": {
    "totalValidations": 15420,
    "validEvents": 15380,
    "invalidEvents": 40,
    "validationErrors": {
      "schema": 25,
      "custom": 15
    }
  },
  "context": {
    "totalLookups": 11200,
    "cacheHits": 8960,
    "cacheMisses": 2240,
    "cacheHitRate": 0.8
  }
}
```

## Configuração

### Variáveis de Ambiente Principais

```bash
# Servidor
PORT=3006
NODE_ENV=production
LOG_LEVEL=info

# AWS SQS
AWS_REGION=us-east-1
SQS_RAW_EVENTS_QUEUE=raw-events-prod
SQS_ENRICHED_EVENTS_QUEUE=enriched-events-prod
SQS_VALIDATION_ERRORS_QUEUE=validation-errors-prod

# Redis (Cache)
REDIS_HOST=redis.cluster.local
REDIS_PORT=6379
REDIS_PASSWORD=secure_password
CACHE_TTL=3600
CACHE_MAX_SIZE=1000

# Processamento
MAX_CONCURRENT_EVENTS=10
PROCESSING_TIMEOUT=30000
RETRY_ATTEMPTS=3

# Enriquecimento
ENABLE_GEOLOCATION=true
ENABLE_USER_AGENT_PARSING=true
ENABLE_CONTEXT_LOOKUP=true
CONTEXT_TIMEOUT=5000
```

### Configuração de Estratégias

```javascript
// enricherConfig.js
module.exports = {
  enrichment: {
    strategies: {
      metadata: {
        enabled: true,
        addTimestamp: true,
        addVersion: true,
        addEnricherId: true
      },
      geolocation: {
        enabled: true,
        provider: 'geoip-lite',
        includeISP: false,
        timeout: 1000
      },
      userAgent: {
        enabled: true,
        parseDevice: true,
        parseBrowser: true,
        parseOS: true
      },
      context: {
        enabled: true,
        sources: ['redis', 'database'],
        timeout: 5000,
        fallbackToCache: true
      }
    }
  }
};
```

## Monitoramento e Observabilidade

### Métricas Prometheus

```prometheus
# Enriquecimentos
event_enricher_enrichments_total{status="success|failure"}
event_enricher_enrichments_duration_seconds
event_enricher_enrichment_strategies_total{strategy="metadata|geo|context"}

# Validações
event_enricher_validations_total{result="valid|invalid"}
event_enricher_validation_errors_total{type="schema|custom"}

# Cache
event_enricher_cache_operations_total{operation="hit|miss|set|delete"}
event_enricher_cache_size_current

# Sistema
event_enricher_service_status{service="enrichment|context|validation"}
event_enricher_memory_usage_bytes
event_enricher_cpu_usage_percent
```

### Logs Estruturados

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "service": "event-enricher",
  "component": "enrichmentService",
  "message": "Event enriched successfully",
  "eventId": "evt_123",
  "enrichmentTime": 45,
  "strategiesApplied": ["metadata", "geolocation", "context"],
  "cacheHit": true,
  "correlationId": "req_456"
}
```

### Alertas Recomendados

1. **Taxa de Erro Alta**
   - Métrica: `rate(event_enricher_enrichments_total{status="failure"}[5m]) > 0.05`
   - Ação: Investigar logs de erro

2. **Latência Alta**
   - Métrica: `histogram_quantile(0.95, event_enricher_enrichments_duration_seconds) > 1.0`
   - Ação: Verificar performance do cache e contexto

3. **Cache Miss Rate Alto**
   - Métrica: `rate(event_enricher_cache_operations_total{operation="miss"}[5m]) / rate(event_enricher_cache_operations_total[5m]) > 0.3`
   - Ação: Ajustar TTL ou tamanho do cache

4. **Serviço Indisponível**
   - Métrica: `event_enricher_service_status == 0`
   - Ação: Restart automático ou alerta para ops

## Testes

### Cobertura de Testes

- **Testes Unitários**: 95% cobertura
- **Testes de Integração**: Endpoints da API
- **Testes de Performance**: Throughput e latência
- **Testes de Carga**: Simulação de alto volume

### Executar Testes

```bash
# Todos os testes
npm test

# Testes com cobertura
npm run test:coverage

# Testes de performance
npm run test:performance

# Testes de carga
npm run test:load
```

### Cenários de Teste

1. **Enriquecimento Básico**
   - Evento válido → Enriquecimento completo
   - Evento inválido → Erro de validação
   - Evento parcial → Normalização e enriquecimento

2. **Performance**
   - 1000 eventos/min → Latência < 100ms
   - Cache hit rate > 80%
   - Uso de memória < 512MB

3. **Resiliência**
   - Redis indisponível → Fallback graceful
   - SQS timeout → Retry automático
   - Sobrecarga → Rate limiting

## Deployment

### Docker

```dockerfile
# Multi-stage build otimizado
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3006
CMD ["node", "index.js"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: event-enricher-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: event-enricher-agent
  template:
    metadata:
      labels:
        app: event-enricher-agent
    spec:
      containers:
      - name: event-enricher
        image: event-enricher-agent:1.0.0
        ports:
        - containerPort: 3006
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_HOST
          value: "redis-service"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/enricher/health
            port: 3006
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/enricher/health
            port: 3006
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Roadmap e Melhorias

### Versão 1.1 (Q2 2024)
- [ ] Suporte a múltiplos provedores de geolocalização
- [ ] Cache distribuído com Redis Cluster
- [ ] Enriquecimento baseado em ML
- [ ] API GraphQL para consultas complexas

### Versão 1.2 (Q3 2024)
- [ ] Streaming de eventos com Kafka
- [ ] Enriquecimento em tempo real
- [ ] Dashboard de monitoramento
- [ ] Auto-scaling baseado em métricas

### Versão 2.0 (Q4 2024)
- [ ] Arquitetura serverless
- [ ] Processamento distribuído
- [ ] IA para detecção de anomalias
- [ ] Multi-tenancy

## Troubleshooting

### Problemas Comuns

#### 1. Alto Uso de Memória
**Sintomas**: OOM kills, performance degradada
**Causas**: Cache muito grande, vazamentos de memória
**Soluções**:
- Reduzir `CACHE_MAX_SIZE`
- Implementar limpeza periódica
- Monitorar heap dumps

#### 2. Latência Alta
**Sintomas**: Timeouts, filas crescendo
**Causas**: Lookups de contexto lentos, cache misses
**Soluções**:
- Otimizar queries de contexto
- Aumentar TTL do cache
- Implementar circuit breaker

#### 3. Erros de Validação
**Sintomas**: Muitos eventos na DLQ
**Causas**: Schemas desatualizados, dados corrompidos
**Soluções**:
- Atualizar schemas de validação
- Implementar sanitização mais robusta
- Adicionar logs detalhados

### Comandos de Debug

```bash
# Verificar logs em tempo real
kubectl logs -f deployment/event-enricher-agent

# Verificar métricas
curl http://localhost:3006/api/enricher/metrics

# Verificar status dos serviços
curl http://localhost:3006/api/enricher/status

# Testar enriquecimento manual
curl -X POST http://localhost:3006/api/enricher/enrich \
  -H "Content-Type: application/json" \
  -d '{"id":"test","type":"test.event","data":{}}'
```

## Conclusão

O Event Enricher Agent é um componente crítico que garante a qualidade e consistência dos dados no sistema de agentes autônomos. Sua implementação robusta, com foco em performance, observabilidade e resiliência, estabelece uma base sólida para o processamento de eventos em escala.

**Status**: ✅ Implementado e pronto para produção
**Próximo**: External Event API Gateway
**Impacto**: Melhoria significativa na qualidade dos dados processados