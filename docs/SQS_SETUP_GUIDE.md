# Guia de Configuração SQS - Sistema de Agentes Autônomos

## Visão Geral

Este documento explica como configurar e usar as filas SQS (Simple Queue Service) no sistema de agentes autônomos, tanto para desenvolvimento local com LocalStack quanto para produção com AWS.

## Problema Identificado e Solução

### Problema Original
As filas SQS não estavam sendo criadas automaticamente no LocalStack, causando falhas na comunicação entre agentes.

### Causa Raiz
1. **Configuração de Endpoint**: O arquivo `.env.example` estava configurado para porta 9324 (ElasticMQ), mas o LocalStack roda na porta 4566
2. **Carregamento de Configuração**: O sistema não estava carregando corretamente o arquivo `.env.development`
3. **Criação Manual**: Não havia processo automatizado para criar as filas necessárias

### Solução Implementada
1. **Correção da Configuração**: Ajustado endpoint para `http://localhost:4566`
2. **Script de Configuração**: Criado script automatizado para criar todas as filas necessárias
3. **Documentação**: Processo documentado para facilitar setup futuro

## Configuração do Ambiente

### Desenvolvimento Local (LocalStack)

#### 1. Configuração de Ambiente

O arquivo `config/environments/.env.development` deve conter:

```env
# AWS LocalStack
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
SQS_ENDPOINT=http://localhost:4566
S3_ENDPOINT=http://localhost:4566

# Filas SQS (LocalStack)
EVENT_QUEUE_URL=http://localhost:4566/000000000000/event-agent-queue-dev
PLANNING_QUEUE_URL=http://localhost:4566/000000000000/planning-agent-queue-dev
EXECUTION_QUEUE_URL=http://localhost:4566/000000000000/execution-agent-queue-dev
MONITORING_QUEUE_URL=http://localhost:4566/000000000000/monitoring-agent-queue-dev
STATE_QUEUE_URL=http://localhost:4566/000000000000/state-agent-queue-dev
SECURITY_QUEUE_URL=http://localhost:4566/000000000000/security-agent-queue-dev
ACL_QUEUE_URL=http://localhost:4566/000000000000/acl-agent-queue-dev
POLICY_QUEUE_URL=http://localhost:4566/000000000000/policy-agent-queue-dev
```

#### 2. Iniciar LocalStack

```bash
# Iniciar todos os serviços Docker
docker-compose up -d

# Verificar se LocalStack está rodando
curl http://localhost:4566/health
```

#### 3. Criar Filas SQS Automaticamente

```bash
# Executar script de configuração
node scripts/setup-sqs-queues.js
```

O script criará automaticamente:

**Filas Principais:**
- `event-agent-queue-dev`
- `planning-agent-queue-dev`
- `execution-agent-queue-dev`
- `monitoring-agent-queue-dev`
- `state-agent-queue-dev`
- `security-agent-queue-dev`
- `acl-agent-queue-dev`
- `policy-agent-queue-dev`

**Dead Letter Queues (DLQ):**
- `event-agent-dlq-dev`
- `planning-agent-dlq-dev`
- `execution-agent-dlq-dev`
- `monitoring-agent-dlq-dev`
- `state-agent-dlq-dev`
- `security-agent-dlq-dev`
- `acl-agent-dlq-dev`
- `policy-agent-dlq-dev`

### Produção (AWS)

Para produção, configure as variáveis de ambiente:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<sua-access-key>
AWS_SECRET_ACCESS_KEY=<sua-secret-key>
# SQS_ENDPOINT deve ser omitido para usar AWS real
```

## Verificação e Troubleshooting

### Verificar Conectividade

```bash
# Testar conectividade com LocalStack
node debug-sqs-creation.js
```

### Listar Filas Existentes

```bash
# Via AWS CLI (se configurado)
aws --endpoint-url=http://localhost:4566 sqs list-queues

# Via curl
curl "http://localhost:4566/?Action=ListQueues&Version=2012-11-05"
```

### Verificar Status do LocalStack

```bash
# Verificar logs do container
docker logs agentes-localstack

# Verificar saúde dos serviços
curl http://localhost:4566/health
```

## Estrutura de Configuração

### Arquivo de Configuração Principal

O arquivo `src/config/index.js` centraliza todas as configurações:

```javascript
shared: {
  sqs: {
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.SQS_ENDPOINT, // undefined para AWS real
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}
```

### Serviço SQS

O serviço SQS (`src/services/sqs-service.js`) utiliza a configuração para:
- Inicializar cliente SQS
- Enviar mensagens
- Receber mensagens
- Gerenciar URLs de filas

## Scripts Disponíveis

### `scripts/setup-sqs-queues.js`
- **Função**: Criar automaticamente todas as filas necessárias
- **Uso**: `node scripts/setup-sqs-queues.js`
- **Características**:
  - Verifica filas existentes
  - Cria apenas filas faltantes
  - Configura atributos básicos (timeout, retenção, long polling)
  - Fornece relatório detalhado

### `debug-sqs-creation.js`
- **Função**: Debug e teste de conectividade
- **Uso**: `node debug-sqs-creation.js`
- **Características**:
  - Testa conexão com LocalStack
  - Exibe configurações atuais
  - Cria filas de teste
  - Lista filas existentes

## Boas Práticas

### Desenvolvimento
1. **Sempre iniciar LocalStack** antes de executar agentes
2. **Executar script de setup** após reiniciar LocalStack
3. **Verificar logs** em caso de problemas de conectividade
4. **Usar nomes consistentes** para filas (sufixo `-dev` para desenvolvimento)

### Produção
1. **Configurar IAM roles** adequadas para SQS
2. **Usar Dead Letter Queues** para mensagens com falha
3. **Monitorar métricas** de filas (profundidade, idade das mensagens)
4. **Configurar alertas** para filas com muitas mensagens

### Segurança
1. **Nunca commitar** credenciais reais no repositório
2. **Usar variáveis de ambiente** para configurações sensíveis
3. **Rotacionar credenciais** regularmente em produção
4. **Aplicar princípio do menor privilégio** nas políticas IAM

## Troubleshooting Comum

### Erro: "The security token included in the request is invalid"
**Causa**: Credenciais incorretas ou endpoint mal configurado
**Solução**: Verificar variáveis de ambiente e endpoint do LocalStack

### Erro: "Unknown Attribute VisibilityTimeoutSeconds"
**Causa**: Atributos de fila incompatíveis com LocalStack
**Solução**: Usar nomes de atributos corretos (`VisibilityTimeout` ao invés de `VisibilityTimeoutSeconds`)

### Erro: "Container agentes-localstack not found"
**Causa**: LocalStack não está rodando
**Solução**: Executar `docker-compose up -d`

### Filas não aparecem após criação
**Causa**: Cache de URLs ou configuração incorreta
**Solução**: Reiniciar aplicação e verificar configuração de endpoint

## Monitoramento

### Métricas Importantes
- **Profundidade da fila**: Número de mensagens aguardando processamento
- **Idade das mensagens**: Tempo que mensagens ficam na fila
- **Taxa de erro**: Mensagens enviadas para DLQ
- **Throughput**: Mensagens processadas por segundo

### Alertas Recomendados
- Fila com mais de 100 mensagens
- Mensagens mais antigas que 5 minutos
- Taxa de erro acima de 5%
- Fila DLQ com mensagens

## Próximos Passos

1. **Implementar retry automático** para mensagens com falha
2. **Adicionar métricas customizadas** para monitoramento
3. **Configurar auto-scaling** baseado na profundidade das filas
4. **Implementar circuit breaker** para falhas de conectividade
5. **Adicionar testes automatizados** para configuração SQS

---

**Última atualização**: Janeiro 2025
**Versão**: 1.0
**Autor**: Sistema de Agentes Autônomos