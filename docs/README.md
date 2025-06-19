# Documentação - Sistema de Agentes Autônomos

## 📋 Visão Geral

Este projeto implementa uma arquitetura multi-agente baseada em Amazon SQS com Event-Driven Architecture (EDA) e Multi-Agent Reinforcement Learning (MARL). O sistema é composto por agentes core e auxiliares que trabalham de forma coordenada para processar eventos, planejar ações, executar tarefas e monitorar o sistema.

## 📚 Índice da Documentação

### 🏗️ Arquitetura e Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Arquitetura técnica completa do sistema
- **[ARQUITETURA_BDI_MARL_INTEGRADA.md](./ARQUITETURA_BDI_MARL_INTEGRADA.md)** - Integração BDI + MARL
- **[API.md](./API.md)** - Documentação das APIs do sistema

### 🤖 Especificações de Agentes
- **[ADVANCED_AGENTS.md](./ADVANCED_AGENTS.md)** - Agentes avançados do sistema
- **[AGENT_LIFECYCLE_MANAGER_SPEC.md](./AGENT_LIFECYCLE_MANAGER_SPEC.md)** - Gerenciador de ciclo de vida
- **[EVENT_ENRICHER_AGENT.md](./EVENT_ENRICHER_AGENT.md)** - Agente de enriquecimento de eventos
- **[EXTERNAL_EVENT_API_GATEWAY.md](./EXTERNAL_EVENT_API_GATEWAY.md)** - Gateway de eventos externos
- **[KNOWLEDGE_BASE_LOADER_AGENT_SPEC.md](./KNOWLEDGE_BASE_LOADER_AGENT_SPEC.md)** - Carregador de base de conhecimento
- **[OBSERVABILITY_AGENT_SPEC.md](./OBSERVABILITY_AGENT_SPEC.md)** - Agente de observabilidade
- **[POLICY_MANAGEMENT_API_AGENT_SPEC.md](./POLICY_MANAGEMENT_API_AGENT_SPEC.md)** - Gerenciamento de políticas
- **[RECOVERY_FALLBACK_AGENT_SPEC.md](./RECOVERY_FALLBACK_AGENT_SPEC.md)** - Recuperação e fallback
- **[SECURITY_AUTHENTICATION_AGENT_SPEC.md](./SECURITY_AUTHENTICATION_AGENT_SPEC.md)** - Segurança e autenticação

### 🛠️ Desenvolvimento e Deploy
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Guia de desenvolvimento
- **[LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md)** - Desenvolvimento local
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Guia de deployment
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Solução de problemas

### 📁 Agentes Core
- **[agents/core-agents.md](./agents/core-agents.md)** - Documentação dos agentes principais

## 🚀 Início Rápido

Para novos desenvolvedores, recomendamos começar com:

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Entenda a arquitetura geral do sistema
2. **[LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md)** - Configure seu ambiente de desenvolvimento
3. **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Guia completo de desenvolvimento
4. **[agents/core-agents.md](./agents/core-agents.md)** - Conheça os agentes principais

## 📖 Como Usar Esta Documentação

- **Arquitetura e Design**: Para entender como o sistema funciona
- **Especificações de Agentes**: Para detalhes técnicos de cada componente
- **Desenvolvimento e Deploy**: Para configurar, desenvolver e implantar o sistema

## 🔧 Configuração Rápida

```bash
# Instalar dependências
npm install

# Configurar ambiente local
npm run setup

# Iniciar sistema completo
npm start
```

Para mais detalhes, consulte [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).

---

**Nota**: Esta documentação foi reorganizada para facilitar a navegação e compreensão por novos desenvolvedores. Arquivos transitórios e temporários foram removidos para manter apenas a documentação essencial e atualizada.