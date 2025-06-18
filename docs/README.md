# Sistema de Agentes Autônomos

## Visão Geral

Este projeto implementa uma arquitetura multi-agente baseada em Amazon SQS com Event-Driven Architecture (EDA) e Multi-Agent Reinforcement Learning (MARL). O sistema é composto por agentes core e auxiliares que trabalham de forma coordenada para processar eventos, planejar ações, executar tarefas e monitorar o sistema.

## Arquitetura

### Agentes Core
- **Event Agent** (Porta 3003): Responsável por receber e processar eventos externos
- **Planning Agent** (Porta 3004): Planeja ações baseadas nos eventos recebidos
- **Execution Agent** (Porta 3005): Executa as ações planejadas

### Agentes Auxiliares
- **Monitoring Agent** (Porta 3006): Monitora métricas do sistema e gera alertas
- **Security Agent** (Porta 3007): Gerencia autenticação, autorização e segurança
- **Policy Agent** (Porta 3008): Aplica políticas e verifica conformidade

## Estrutura do Projeto

```
src/
├── agents/
│   ├── core/
│   │   ├── event-agent/
│   │   ├── planning-agent/
│   │   └── execution-agent/
│   └── auxiliary/
│       ├── monitoring-agent/
│       ├── security-agent/
│       └── policy-agent/
├── config/
│   └── index.js          # Configurações centrais
├── services/
│   └── sqs-service.js    # Serviço SQS compartilhado
├── utils/
│   └── logger.js         # Sistema de logging
└── index.js              # Orquestrador principal
```

## Configuração

### Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env` e configure as variáveis:

```bash
cp .env.example .env
```

### Principais Configurações

- **NODE_ENV**: Ambiente (development, production, test)
- **AWS_REGION**: Região AWS para SQS
- **AWS_ACCESS_KEY_ID**: Chave de acesso AWS
- **AWS_SECRET_ACCESS_KEY**: Chave secreta AWS
- **JWT_SECRET**: Segredo para tokens JWT
- **REDIS_URL**: URL do Redis (opcional)

## Instalação

```bash
# Instalar dependências
npm install

# Configurar ambiente
npm run setup
```

## Uso

### Comandos Principais

```bash
# Iniciar todos os agentes
npm start

# Iniciar agentes específicos
npm run start:event
npm run start:planning
npm run start:execution
npm run start:monitoring
npm run start:security
npm run start:policy

# Iniciar apenas agentes core
npm run start:core

# Iniciar apenas agentes auxiliares
npm run start:auxiliary

# Verificar status
npm run status

# Parar todos os agentes
npm stop

# Reiniciar sistema
npm restart
```

### Modo Desenvolvimento

```bash
# Desenvolvimento com hot reload
npm run dev

# Agentes individuais em desenvolvimento
npm run dev:event
npm run dev:planning
npm run dev:execution
npm run dev:monitoring
npm run dev:security
npm run dev:policy
```

### Monitoramento

```bash
# Ver logs em tempo real
npm run logs

# Logs de agentes específicos
npm run logs:event
npm run logs:monitoring

# Verificar saúde do sistema
npm run health

# Ver métricas
npm run metrics
```

## APIs dos Agentes

### Event Agent (Porta 3003)

- `GET /health` - Status do agente
- `POST /events` - Receber novos eventos
- `GET /events` - Listar eventos
- `GET /events/:id` - Obter evento específico
- `GET /metrics` - Métricas do agente

### Planning Agent (Porta 3004)

- `GET /health` - Status do agente
- `POST /plans` - Criar novo plano
- `GET /plans` - Listar planos
- `GET /plans/:id` - Obter plano específico
- `PUT /plans/:id/status` - Atualizar status do plano
- `GET /metrics` - Métricas do agente

### Execution Agent (Porta 3005)

- `GET /health` - Status do agente
- `POST /executions` - Executar ação
- `GET /executions` - Listar execuções
- `GET /executions/:id` - Obter execução específica
- `PUT /executions/:id/status` - Atualizar status da execução
- `GET /metrics` - Métricas do agente

### Monitoring Agent (Porta 3006)

- `GET /health` - Status do agente
- `GET /metrics` - Métricas do sistema
- `GET /metrics/agents/:agentId` - Métricas de agente específico
- `GET /metrics/history` - Histórico de métricas
- `GET /alerts` - Alertas ativos
- `GET /alerts/severity/:level` - Alertas por severidade
- `GET /dashboard` - Dashboard de status

### Security Agent (Porta 3007)

- `GET /health` - Status do agente
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `POST /auth/validate` - Validar token
- `POST /auth/authorize` - Verificar autorização
- `GET /sessions` - Listar sessões
- `DELETE /sessions/:id` - Revogar sessão
- `GET /audit` - Auditoria de segurança
- `GET /threats` - Detecção de ameaças

### Policy Agent (Porta 3008)

- `GET /health` - Status do agente
- `GET /policies` - Listar políticas
- `GET /policies/:id` - Obter política específica
- `POST /policies` - Criar política
- `PUT /policies/:id` - Atualizar política
- `DELETE /policies/:id` - Deletar política
- `POST /policies/evaluate` - Avaliar política
- `GET /compliance` - Verificar conformidade
- `GET /violations` - Listar violações
- `GET /audit` - Relatório de auditoria

## Comunicação entre Agentes

### Filas SQS

Cada agente possui sua própria fila SQS para comunicação assíncrona:

- `event-agent-queue-{env}`
- `planning-agent-queue-{env}`
- `execution-agent-queue-{env}`
- `monitoring-agent-queue-{env}`
- `security-agent-queue-{env}`
- `policy-agent-queue-{env}`

### Dead Letter Queues (DLQ)

Cada fila possui uma DLQ correspondente para mensagens que falharam:

- `event-agent-dlq-{env}`
- `planning-agent-dlq-{env}`
- `execution-agent-dlq-{env}`
- `monitoring-agent-dlq-{env}`
- `security-agent-dlq-{env}`
- `policy-agent-dlq-{env}`

### Tipos de Mensagens

#### Event Agent
- `new_event`: Novo evento recebido
- `event_processed`: Evento processado

#### Planning Agent
- `plan_request`: Solicitação de planejamento
- `plan_created`: Plano criado
- `plan_updated`: Plano atualizado

#### Execution Agent
- `execution_request`: Solicitação de execução
- `execution_started`: Execução iniciada
- `execution_completed`: Execução concluída
- `execution_failed`: Execução falhou

#### Monitoring Agent
- `metrics_report`: Relatório de métricas
- `alert`: Alerta gerado

#### Security Agent
- `security_check`: Verificação de segurança
- `token_validation`: Validação de token
- `authorization_check`: Verificação de autorização

#### Policy Agent
- `policy_evaluation`: Avaliação de política
- `compliance_check`: Verificação de conformidade
- `policy_update`: Atualização de política

## Desenvolvimento

### Testes

```bash
# Executar todos os testes
npm test

# Testes com watch mode
npm run test:watch

# Cobertura de testes
npm run test:coverage
```

### Linting e Formatação

```bash
# Verificar código
npm run lint

# Corrigir problemas automaticamente
npm run lint:fix

# Formatar código
npm run format

# Validar tudo
npm run validate
```

### Docker

```bash
# Build da imagem
npm run docker:build

# Executar container
npm run docker:run
```

## Monitoramento e Observabilidade

### Métricas

O sistema coleta métricas usando Prometheus:

- Métricas de sistema (CPU, memória, disco)
- Métricas de aplicação (requests, latência, erros)
- Métricas customizadas por agente

### Logs

Logs estruturados usando Winston:

- Logs rotativos por dia
- Diferentes níveis (error, warn, info, debug)
- Formato JSON para análise

### Alertas

Sistema de alertas baseado em thresholds:

- Taxa de erro > 5%
- Tempo de resposta > 5s
- Uso de memória > 80%
- Uso de CPU > 80%
- Profundidade da fila > 100
- Status do agente = down

## Segurança

### Autenticação

- JWT tokens com expiração configurável
- Refresh tokens para renovação
- Sessões gerenciadas com cleanup automático

### Autorização

- Sistema baseado em roles e permissions
- Verificação de autorização por endpoint
- Auditoria de acessos

### Proteções

- Rate limiting por IP
- Helmet para headers de segurança
- CORS configurável
- Validação de entrada com Joi
- Sanitização de dados

## Políticas

### Tipos de Políticas

- **Validation**: Validação de dados
- **Enforcement**: Aplicação de regras
- **Authorization**: Controle de acesso
- **Lifecycle**: Ciclo de vida de recursos
- **Protection**: Proteção de dados
- **Regulatory**: Conformidade regulatória

### Conformidade

- Verificação automática de conformidade
- Relatórios de auditoria
- Rastreamento de violações
- Recomendações de correção

## Troubleshooting

### Problemas Comuns

1. **Agente não inicia**
   - Verificar variáveis de ambiente
   - Verificar conectividade com AWS SQS
   - Verificar logs do agente

2. **Mensagens não são processadas**
   - Verificar filas SQS
   - Verificar DLQs
   - Verificar permissões AWS

3. **Alta latência**
   - Verificar métricas de sistema
   - Verificar logs de erro
   - Verificar conectividade de rede

4. **Falhas de autenticação**
   - Verificar JWT_SECRET
   - Verificar expiração de tokens
   - Verificar logs do Security Agent

### Comandos de Diagnóstico

```bash
# Status detalhado
npm run status

# Verificar saúde
npm run health

# Ver métricas
npm run metrics

# Logs em tempo real
npm run logs

# Limpar logs antigos
npm run clean
```

## Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

MIT License - veja o arquivo LICENSE para detalhes.

## Suporte

Para suporte, abra uma issue no repositório ou entre em contato com a equipe de desenvolvimento.