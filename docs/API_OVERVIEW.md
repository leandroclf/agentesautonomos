# Visão Geral da API - Sistema de Agentes Autônomos

## Introdução

Este documento fornece uma visão geral da API do Sistema de Agentes Autônomos, baseado na arquitetura SOI (Self-Organizing Intelligence). A API completa está documentada no arquivo `openapi.yaml`.

## Arquitetura

### Características Principais

- **Arquitetura SOI**: Agentes com criação, iteração e interação
- **Multi-Agente**: Arquiteturas que refletem sistemas multi-agente
- **Eventos**: Processamento de eventos em tempo real
- **Escalas Distribuídas**: Rede para performance
- **Monitoramento**: Prometheus e Grafana

### Agentes Principais

1. **Interface Agent**: Gerencia interação com usuários
2. **Event Agent**: Processa eventos do sistema
3. **Planning Agent**: Realiza planejamento de tarefas
4. **Execution Agent**: Executa tarefas planejadas
5. **Mediator Agent**: Medeia comunicação entre agentes
6. **Orchestrator Agent**: Orquestra fluxos complexos

## Endpoints Principais

### Autenticação
- `POST /auth/login` - Realizar login
- `POST /auth/logout` - Realizar logout
- `POST /auth/refresh` - Renovar token

### Agentes Core

#### Interface Agent
- `POST /agents/interface/sessions` - Criar sessão
- `GET /agents/interface/sessions/{sessionId}` - Obter sessão
- `PUT /agents/interface/sessions/{sessionId}` - Atualizar sessão
- `DELETE /agents/interface/sessions/{sessionId}` - Encerrar sessão
- `POST /agents/interface/sessions/{sessionId}/messages` - Enviar mensagem

#### Event Agent
- `POST /agents/event/process` - Processar evento
- `GET /agents/event/events` - Listar eventos
- `GET /agents/event/events/{eventId}` - Obter evento específico
- `POST /agents/event/subscribe` - Subscrever a eventos
- `DELETE /agents/event/subscribe/{subscriptionId}` - Cancelar subscrição

#### Planning Agent
- `POST /agents/planning/plans` - Criar plano
- `GET /agents/planning/plans` - Listar planos
- `GET /agents/planning/plans/{planId}` - Obter plano específico
- `PUT /agents/planning/plans/{planId}` - Atualizar plano
- `DELETE /agents/planning/plans/{planId}` - Deletar plano
- `POST /agents/planning/plans/{planId}/execute` - Executar plano

#### Execution Agent
- `POST /agents/execution/tasks` - Criar tarefa
- `GET /agents/execution/tasks` - Listar tarefas
- `GET /agents/execution/tasks/{taskId}` - Obter tarefa específica
- `PUT /agents/execution/tasks/{taskId}` - Atualizar tarefa
- `DELETE /agents/execution/tasks/{taskId}` - Cancelar tarefa
- `POST /agents/execution/tasks/{taskId}/start` - Iniciar execução
- `POST /agents/execution/tasks/{taskId}/pause` - Pausar execução
- `POST /agents/execution/tasks/{taskId}/resume` - Retomar execução
- `POST /agents/execution/tasks/{taskId}/stop` - Parar execução

#### Mediator Agent
- `POST /agents/mediator/mediate` - Mediar comunicação
- `GET /agents/mediator/sessions` - Listar sessões de mediação
- `GET /agents/mediator/sessions/{sessionId}` - Obter sessão de mediação
- `POST /agents/mediator/sessions/{sessionId}/resolve` - Resolver conflito

#### Orchestrator Agent
- `POST /agents/orchestrator/workflows` - Criar workflow
- `GET /agents/orchestrator/workflows` - Listar workflows
- `GET /agents/orchestrator/workflows/{workflowId}` - Obter workflow específico
- `PUT /agents/orchestrator/workflows/{workflowId}` - Atualizar workflow
- `DELETE /agents/orchestrator/workflows/{workflowId}` - Deletar workflow
- `POST /agents/orchestrator/workflows/{workflowId}/execute` - Executar workflow
- `POST /agents/orchestrator/workflows/{workflowId}/pause` - Pausar workflow
- `POST /agents/orchestrator/workflows/{workflowId}/resume` - Retomar workflow
- `POST /agents/orchestrator/workflows/{workflowId}/stop` - Parar workflow

### Schema Registry
- `POST /schema-registry/schemas` - Registrar schema
- `GET /schema-registry/schemas` - Listar schemas
- `GET /schema-registry/schemas/{schemaId}` - Obter schema específico
- `PUT /schema-registry/schemas/{schemaId}` - Atualizar schema
- `DELETE /schema-registry/schemas/{schemaId}` - Deletar schema
- `POST /schema-registry/schemas/{schemaId}/validate` - Validar dados contra schema

### Monitoramento
- `GET /monitoring/health` - Verificar saúde do sistema
- `GET /monitoring/metrics` - Obter métricas
- `GET /monitoring/agents/{agentId}/status` - Status de agente específico
- `GET /monitoring/agents/{agentId}/metrics` - Métricas de agente específico
- `GET /monitoring/system/performance` - Performance do sistema

## Autenticação

A API utiliza autenticação Bearer Token (JWT). Para acessar endpoints protegidos:

1. Faça login via `POST /auth/login`
2. Use o token retornado no header `Authorization: Bearer <token>`
3. Renove o token quando necessário via `POST /auth/refresh`

## Códigos de Status

- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Requisição inválida
- `401` - Não autorizado
- `403` - Acesso negado
- `404` - Recurso não encontrado
- `409` - Conflito
- `422` - Entidade não processável
- `500` - Erro interno do servidor
- `503` - Serviço indisponível

## Modelos de Dados Principais

### Session
- `id`: Identificador único
- `userId`: ID do usuário
- `status`: Status da sessão (active, inactive, expired)
- `metadata`: Metadados adicionais
- `createdAt`: Data de criação
- `updatedAt`: Data da última atualização

### Event
- `id`: Identificador único
- `type`: Tipo do evento
- `source`: Fonte do evento
- `data`: Dados do evento
- `timestamp`: Timestamp do evento
- `metadata`: Metadados adicionais

### Plan
- `id`: Identificador único
- `name`: Nome do plano
- `description`: Descrição
- `status`: Status (draft, active, completed, cancelled)
- `goals`: Objetivos do plano
- `constraints`: Restrições e limitações
- `createdAt`: Data de criação
- `updatedAt`: Data da última atualização
- `createdBy`: ID do usuário criador

### Task
- `id`: Identificador único
- `planId`: ID do plano associado
- `name`: Nome da tarefa
- `description`: Descrição
- `status`: Status (pending, running, completed, failed, cancelled)
- `priority`: Prioridade (low, medium, high, critical)
- `dependencies`: Dependências da tarefa
- `estimatedDuration`: Duração estimada
- `actualDuration`: Duração real
- `createdAt`: Data de criação
- `updatedAt`: Data da última atualização

## Documentação Adicional

- **Especificação OpenAPI**: `openapi.yaml`
- **Documentação Online**: https://docs.agentesautonomos.com
- **Arquitetura**: `ARCHITECTURE.md`
- **Guia de Desenvolvimento**: `DEVELOPMENT.md`

## Servidores

- **Desenvolvimento**: http://localhost:8080
- **Produção**: https://api.agentesautonomos.com

---

*Versão da API: 3.0.1*
*Última atualização: $(Get-Date -Format "yyyy-MM-dd")*