# Sistema de Agentes Autônomos

## Visão Geral

Sistema multi-agente autônomo para automação de processos empresariais, utilizando arquitetura baseada em SQS para comunicação assíncrona entre agentes especializados.

## 🏗️ Arquitetura

### Agentes Core
- **Interface Agent**: Gerencia interações com usuários e sistemas externos
- **Planning Agent**: Responsável pelo planejamento e coordenação de tarefas
- **Execution Agent**: Executa tarefas e operações específicas
- **Monitoring Agent**: Monitora performance e saúde do sistema

### Agentes Auxiliares
- **Security Agent**: Gerencia autenticação, autorização e auditoria
- **Event Agent**: Processa eventos e notificações do sistema
- **Policy Agent**: Aplica políticas e regras de negócio

### Infraestrutura
- **SQS Service**: Comunicação assíncrona entre agentes
- **Logging System**: Sistema de logs estruturado
- **Monitoring System**: Métricas, health checks e alertas
- **Configuration Management**: Gerenciamento centralizado de configurações

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- AWS CLI configurado (para produção)
- Docker (opcional, para LocalStack)

### Instalação

```bash
# Clonar repositório
git clone <repository-url>
cd agentesautonomos

# Instalar dependências
npm install

# Configurar ambiente de desenvolvimento
cp .env.example .env.development

# Iniciar LocalStack (desenvolvimento)
npm run localstack:start

# Configurar SQS local
npm run setup:aws
```

### Desenvolvimento

```bash
# Iniciar todos os agentes
npm run start:agents

# Iniciar monitoramento
npm run monitor:start

# Executar testes
npm test
```

### Produção

```bash
# Configurar AWS SQS para produção
npm run setup:aws-production

# Migrar para SQS real
npm run switch-to-real-sqs

# Testar conectividade
npm run test:sqs

# Iniciar sistema
npm start
```

## 📚 Documentação

- [Arquitetura do Sistema](./docs/architecture/README.md)
- [Guia de Desenvolvimento](./docs/development/README.md)
- [Documentação da API](./docs/api/README.md)
- [Deployment](./docs/deployment/README.md)
- [Monitoramento](./docs/monitoring/README.md)
- [Segurança](./docs/security/README.md)
- [Troubleshooting](./docs/troubleshooting/README.md)

## 🔧 Scripts Disponíveis

### Desenvolvimento
- `npm run dev`: Iniciar em modo desenvolvimento
- `npm run test`: Executar testes
- `npm run test:watch`: Executar testes em modo watch
- `npm run lint`: Verificar código com ESLint
- `npm run format`: Formatar código com Prettier

### Agentes
- `npm run start:agents`: Iniciar todos os agentes
- `npm run start:interface`: Iniciar apenas interface agent
- `npm run start:planning`: Iniciar apenas planning agent
- `npm run start:execution`: Iniciar apenas execution agent

### AWS/SQS
- `npm run setup:aws`: Configurar AWS local (LocalStack)
- `npm run setup:aws-production`: Configurar AWS produção
- `npm run test:sqs`: Testar conectividade SQS
- `npm run switch-to-real-sqs`: Migrar para SQS real

### Monitoramento
- `npm run monitor:start`: Iniciar sistema de monitoramento
- `npm run logs:view`: Visualizar logs do sistema
- `npm run logs:errors`: Visualizar logs de erro
- `npm run test:system`: Testar integração do sistema

### Utilitários
- `npm run clean`: Limpar arquivos temporários
- `npm run setup:logging-monitoring`: Configurar logging e monitoramento
- `npm run implement:handlers`: Implementar handlers faltantes

## 🌍 Ambientes

### Desenvolvimento
- LocalStack para AWS services
- Mock APIs para serviços externos
- Logs detalhados habilitados
- Hot reload ativado

### Produção
- AWS SQS real
- APIs externas reais
- Logs otimizados
- Monitoramento completo
- Alertas configurados

## 📊 Monitoramento

### Endpoints de Monitoramento
- `GET /health`: Status geral do sistema
- `GET /metrics`: Métricas do sistema (JSON/Prometheus)
- `GET /alerts`: Alertas ativos
- `GET /status`: Status detalhado dos componentes

### Métricas Coletadas
- Performance dos agentes
- Uso de memória e CPU
- Latência de comunicação SQS
- Taxa de erro por componente
- Throughput de mensagens

## 🔒 Segurança

- Autenticação baseada em tokens JWT
- Autorização por roles e permissões
- Auditoria completa de ações
- Criptografia de dados sensíveis
- Rate limiting em APIs

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 📞 Suporte

- Documentação: [docs/](./docs/)
- Issues: [GitHub Issues](https://github.com/your-org/agentesautonomos/issues)
- Wiki: [GitHub Wiki](https://github.com/your-org/agentesautonomos/wiki)

## 🗺️ Roadmap

### Fase 1: Configuração para Produção (Semana 1)
- ✅ Configuração de logging e monitoramento
- ✅ Migração para SQS real
- ✅ Implementação de handlers faltantes
- ✅ Documentação técnica
- 🔄 Testes de integração
- 🔄 Configuração de CI/CD

### Fase 2: Otimização e Escalabilidade (Semana 2)
- 🔄 Otimização de performance
- 🔄 Implementação de cache
- 🔄 Balanceamento de carga
- 🔄 Auto-scaling

### Fase 3: Recursos Avançados (Semana 3-4)
- 🔄 Machine Learning integrado
- 🔄 Analytics avançado
- 🔄 Dashboard web
- 🔄 Mobile app

---

**Última atualização**: 2025-06-20
**Versão**: 1.0.0
**Status**: Em desenvolvimento ativo
