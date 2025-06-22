# Documentação do Sistema de Agentes Autônomos

## Índice Geral

### 📋 Documentação Principal Consolidada

| Documento | Descrição | Conteúdo |
|-----------|-----------|----------|
| **[README](README.md)** | Visão geral do projeto | Introdução, objetivos, tecnologias |
| **[OVERVIEW](OVERVIEW.md)** | Visão geral completa do sistema | Propósito, arquitetura de módulos, desenvolvimento, testes, fluxos, TODO, referências |
| **[ARCHITECTURE](ARCHITECTURE.md)** | Arquitetura detalhada | Padrões, componentes, diagramas |
| **[AGENTS](AGENTS.md)** | Documentação completa dos agentes | Todos os agentes (core, auxiliares, avançados), especificações, lifecycle |
| **[API](API.md)** | Documentação da API | Endpoints, schemas, exemplos |
| **[SETUP](SETUP.md)** | Configuração e instalação | Pré-requisitos, instalação, configuração, SQS, Grafana, dependências |
| **[DEVELOPMENT](DEVELOPMENT.md)** | Guia de desenvolvimento | Ambiente, padrões, testes, CI/CD |
| **[OPERATIONS_BACKUP](OPERATIONS_BACKUP.md)** | Operações e backup | Manual operacional, backup, recuperação, monitoramento, troubleshooting |
| **[OPERATIONS](OPERATIONS.md)** | Operações do sistema | Procedimentos operacionais, manutenção |

### 🏗️ Documentação Especializada

| Documento | Descrição |
|-----------|-----------|
| **[ARCHITECTURE_DIAGRAMS](ARCHITECTURE_DIAGRAMS.md)** | Diagramas de arquitetura |
| **[CONTRIBUTING](CONTRIBUTING.md)** | Guia de contribuição |

## 🎯 Documentos Essenciais

| Documento | Descrição | Status | Prioridade |
|-----------|-----------|--------|------------|
| [📋 README Principal](../README.md) | **Documento principal** - Visão completa do sistema | ✅ Atualizado | ⭐⭐⭐ |
| [📝 TODO - Plano de Desenvolvimento](./TODO.md) | **Roadmap sequencial** - 39 tarefas organizadas | ✅ Novo | ⭐⭐⭐ |
| [🏗️ Arquitetura](./ARCHITECTURE.md) | Arquitetura técnica detalhada | ✅ Completo | ⭐⭐⭐ |
| [🚀 Guia de Desenvolvimento](./GUIA_DESENVOLVIMENTO_COMPLETO.md) | Configuração automatizada do ambiente | ✅ Completo | ⭐⭐⭐ |
| [🧪 Como Testar Eventos](./COMO_TESTAR_EVENTOS.md) | Guia para testes de eventos | ✅ Completo | ⭐⭐ |

## 🔧 Configuração e Desenvolvimento

### Configuração do Ambiente

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [🏠 Desenvolvimento Local](./LOCAL_DEVELOPMENT.md) | Configuração do ambiente local | ✅ Completo |
| [📬 Configuração SQS](./SQS_SETUP_GUIDE.md) | Guia específico para configuração SQS | ✅ Completo |
| [📜 Scripts Atualizados](./SCRIPTS_ATUALIZADOS.md) | Mudanças na estrutura de scripts | ✅ Completo |
| [🌍 Ambiente de Desenvolvimento](./AMBIENTE_DESENVOLVIMENTO.md) | Configuração completa do ambiente | ✅ Completo |

### Desenvolvimento e Operação

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [⚙️ Development](./DEVELOPMENT.md) | Guia geral de desenvolvimento | ✅ Completo |
| [🔧 Troubleshooting](./TROUBLESHOOTING.md) | Solução de problemas comuns | ✅ Completo |
| [🚀 Deployment](./DEPLOYMENT.md) | Guias de deploy e produção | ✅ Completo |

## 🏗️ Arquitetura e Especificações

### Arquitetura Geral

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [🏛️ Arquitetura](./ARCHITECTURE.md) | Visão geral da arquitetura do sistema | ✅ Completo |
| [🔌 API](./API.md) | Documentação das APIs | ✅ Completo |
| [🤖 Agentes Core](./agents/core-agents.md) | Especificação dos agentes principais | ✅ Completo |

### Agentes Especializados

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [🚀 Agentes Avançados](./ADVANCED_AGENTS.md) | Documentação de agentes avançados | ✅ Completo |
| [📈 Event Enricher Agent](./EVENT_ENRICHER_AGENT.md) | Agente de enriquecimento de eventos | ✅ Completo |
| [🌐 External Event API Gateway](./EXTERNAL_EVENT_API_GATEWAY.md) | Gateway de eventos externos | ✅ Completo |
| [🔄 Agent Lifecycle Manager](./AGENT_LIFECYCLE_MANAGER_SPEC.md) | Gerenciador de ciclo de vida | ✅ Completo |
| [📚 Knowledge Base Loader](./KNOWLEDGE_BASE_LOADER_AGENT_SPEC.md) | Carregador de base de conhecimento | ✅ Completo |
| [👁️ Observability Agent](./OBSERVABILITY_AGENT_SPEC.md) | Agente de observabilidade | ✅ Completo |
| [📋 Policy Management API](./POLICY_MANAGEMENT_API_AGENT_SPEC.md) | API de gerenciamento de políticas | ✅ Completo |
| [🛡️ Recovery Fallback Agent](./RECOVERY_FALLBACK_AGENT_SPEC.md) | Agente de recuperação e fallback | ✅ Completo |
| [🔐 Security Authentication Agent](./SECURITY_AUTHENTICATION_AGENT_SPEC.md) | Agente de segurança e autenticação | ✅ Completo |

## 🚀 Deploy e Produção

### Deploy

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [🚀 Deploy](./DEPLOY.md) | Guia de deploy | ✅ Completo |
| [📦 Deployment](./DEPLOYMENT.md) | Procedimentos de deployment | ✅ Completo |
| [🌍 Ambiente de Desenvolvimento](./AMBIENTE_DESENVOLVIMENTO.md) | Configuração do ambiente | ✅ Completo |

### Monitoramento

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [📊 Monitoramento](./MONITORING.md) | Sistema de monitoramento | ✅ Completo |
| [👁️ Observabilidade](./OBSERVABILITY.md) | Estratégias de observabilidade | ✅ Completo |

## 🧪 Testes

### Testes de Sistema

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [🧪 Event Testing](./EVENT_TESTING.md) | Testes de eventos | ✅ Completo |
| [✅ Testes](./TESTS.md) | Documentação de testes | ✅ Completo |

## 📚 Referências

### Documentação Técnica

| Documento | Descrição | Status |
|-----------|-----------|--------|
| [📝 Changelog](./CHANGELOG.md) | Histórico de mudanças | ✅ Completo |
| [📖 Glossário](./GLOSSARY.md) | Termos e definições | ✅ Completo |
| [🔗 Referências](./REFERENCES.md) | Links e recursos externos | ✅ Completo |

## 📁 Documentação por Categoria

### 🏗️ Arquitetura
- [🏛️ Arquitetura Geral](./ARCHITECTURE.md) - Visão geral do sistema
- [🔌 API](./API.md) - Documentação das APIs

### 🤖 Agentes
- [🤖 Agentes Core](./agents/core-agents.md) - Agentes principais
- [🚀 Agentes Avançados](./ADVANCED_AGENTS.md) - Funcionalidades avançadas
- [📈 Event Enricher](./EVENT_ENRICHER_AGENT.md) - Enriquecimento de eventos
- [🌐 External Event API Gateway](./EXTERNAL_EVENT_API_GATEWAY.md) - Gateway externo
- [🔄 Agent Lifecycle Manager](./AGENT_LIFECYCLE_MANAGER_SPEC.md) - Gerenciamento de ciclo
- [📚 Knowledge Base Loader](./KNOWLEDGE_BASE_LOADER_AGENT_SPEC.md) - Base de conhecimento
- [👁️ Observability Agent](./OBSERVABILITY_AGENT_SPEC.md) - Observabilidade
- [📋 Policy Management API](./POLICY_MANAGEMENT_API_AGENT_SPEC.md) - Gerenciamento de políticas
- [🛡️ Recovery Fallback Agent](./RECOVERY_FALLBACK_AGENT_SPEC.md) - Recuperação
- [🔐 Security Authentication](./SECURITY_AUTHENTICATION_AGENT_SPEC.md) - Segurança

### ⚙️ Configuração
- [🏠 Desenvolvimento Local](./LOCAL_DEVELOPMENT.md) - Setup local
- [📬 Configuração SQS](./SQS_SETUP_GUIDE.md) - Configuração de filas
- [📜 Scripts Atualizados](./SCRIPTS_ATUALIZADOS.md) - Mudanças em scripts
- [🌍 Ambiente de Desenvolvimento](./AMBIENTE_DESENVOLVIMENTO.md) - Ambiente completo

### 🚀 Deploy
- [🚀 Deploy](./DEPLOY.md) - Guia de deploy
- [📦 Deployment](./DEPLOYMENT.md) - Procedimentos de produção

### 📊 Monitoramento
- [📊 Monitoramento](./MONITORING.md) - Sistema de monitoramento
- [👁️ Observabilidade](./OBSERVABILITY.md) - Estratégias de observação

### 🧪 Testes
- [🧪 Event Testing](./EVENT_TESTING.md) - Testes de eventos
- [✅ Testes](./TESTS.md) - Documentação de testes

### 🔧 Desenvolvimento
- [⚙️ Development](./DEVELOPMENT.md) - Guia de desenvolvimento
- [🔧 Troubleshooting](./TROUBLESHOOTING.md) - Solução de problemas

### 📚 Referências
- [📝 Changelog](./CHANGELOG.md) - Histórico de mudanças
- [📖 Glossário](./GLOSSARY.md) - Termos e definições
- [🔗 Referências](./REFERENCES.md) - Links externos

### Diretórios Organizados
- [Core Agents](./agents/) - Documentação dos agentes principais
- [Auxiliary Agents](./agents/auxiliary/) - Agentes auxiliares
- [Infrastructure Agents](./agents/infrastructure/) - Agentes de infraestrutura
- [API Documentation](./api/) - Documentação das APIs
- [Architecture Details](./architecture/) - Detalhes da arquitetura
- [Deployment Guides](./deployment/) - Guias de deploy
- [Development Guides](./development/) - Guias de desenvolvimento
- [Monitoring](./monitoring/) - Documentação de monitoramento
- [Security](./security/) - Documentação de segurança
- [Troubleshooting Guides](./troubleshooting/) - Guias de solução de problemas

## 🎯 Fluxo de Trabalho Recomendado

### Para Novos Desenvolvedores

1. 📖 **Leia primeiro**: [README Principal](../README.md)
2. 🚀 **Configure o ambiente**: [Guia de Desenvolvimento Completo](./GUIA_DESENVOLVIMENTO_COMPLETO.md)
3. 🧪 **Teste o sistema**: [Como Testar Eventos](./COMO_TESTAR_EVENTOS.md)
4. 🏗️ **Entenda a arquitetura**: [Arquitetura](./ARCHITECTURE.md)
5. 💻 **Desenvolva**: [Development](./DEVELOPMENT.md)

### Para Desenvolvedores Experientes

1. ⚡ **Quick Start**: `npm run dev`
2. 📚 **Consulte**: [Scripts Atualizados](./SCRIPTS_ATUALIZADOS.md)
3. 🔧 **Customize**: [Configuração SQS](./SQS_SETUP_GUIDE.md)
4. 🚀 **Deploy**: [Deployment](./DEPLOYMENT.md)

## 🔄 Atualizações Recentes

### Janeiro 2024 - v2.0.0

- ✅ **Novo sistema de desenvolvimento automatizado**
- ✅ **Scripts simplificados e consolidados**
- ✅ **Documentação reorganizada**
- ✅ **Configuração com um único comando**
- ✅ **Testes automatizados integrados**

### Principais Mudanças

- 🔄 **Scripts atualizados**: Consulte [Scripts Atualizados](./SCRIPTS_ATUALIZADOS.md)
- 📚 **Nova documentação**: [Guia de Desenvolvimento Completo](./GUIA_DESENVOLVIMENTO_COMPLETO.md)
- ⚡ **Configuração simplificada**: `npm run dev`

## 📞 Suporte

### Problemas Comuns
- 🔧 [Troubleshooting](./TROUBLESHOOTING.md)
- 📋 [Scripts Atualizados](./SCRIPTS_ATUALIZADOS.md)

### Documentação Adicional
- 📖 [README de Desenvolvimento](../README_DESENVOLVIMENTO.md)
- 🏗️ [Arquitetura](./ARCHITECTURE.md)
- 🚀 [Deployment](./DEPLOYMENT.md)

### Contato
- 🐛 **Issues**: Abra uma issue no repositório
- 💬 **Discussões**: Use as discussões do GitHub
- 📧 **Suporte**: Consulte a documentação primeiro

---

**Última Atualização**: Fevereiro 2024  
**Versão da Documentação**: 2.0.0  
**Status**: ✅ Reorganizada e atualizada  
**Próximos passos**: Consultar [TODO.md](./TODO.md) para tarefas pendentes