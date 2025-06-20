# 🚀 Sistema Completo de Desenvolvimento - Agentes Autônomos

## Visão Geral

Este projeto implementa um sistema completo de configuração e execução do ambiente de desenvolvimento para a arquitetura de agentes autônomos. O sistema automatiza todo o processo desde a instalação até os testes de eventos.

## ⚡ Início Rápido

### Configuração Completa (Um Comando)

```bash
# Configurar todo o ambiente do zero
npm run dev
```

**Este comando executa automaticamente:**
- ✅ Verificação de dependências (Node.js, Docker, etc.)
- 🐳 Configuração e inicialização do Docker
- 📬 Criação de filas SQS no LocalStack
- 🤖 Inicialização de todos os agentes
- 🧪 Execução de testes de eventos
- 📊 Verificação final do sistema

### Comandos Alternativos

```bash
# Configuração rápida (Docker já rodando)
npm run dev:quick

# Apenas testes de eventos
npm run dev:test

# Limpar ambiente
npm run dev:clean
```

## 📋 Pré-requisitos

- **Node.js** v16+
- **npm** v8+
- **Docker** v20+
- **Docker Compose** v2+

## 🏗️ Arquitetura

### Serviços (Portas)
- **LocalStack**: 4566 (AWS Simulation)
- **PostgreSQL**: 5432
- **Redis**: 6379
- **Prometheus**: 9090
- **Grafana**: 3000
- **PgAdmin**: 8080
- **Redis Commander**: 8081

### Agentes (Portas)
- **Event Agent**: 3001
- **Planning Agent**: 3002
- **Execution Agent**: 3003
- **Monitoring Agent**: 3004
- **Security Agent**: 3005
- **Interface Agent**: 3006

## 🧪 Testes Automáticos

O sistema executa automaticamente:

1. **Evento de Login**: Teste de autenticação
2. **Processamento de Dados**: Teste de performance
3. **Alerta de Segurança**: Teste de prioridade

## 📊 Monitoramento

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **PgAdmin**: http://localhost:8080
- **Redis Commander**: http://localhost:8081

## 🔧 Scripts Disponíveis

| Comando | Descrição |
|---------|----------|
| `npm run dev` | Configuração completa |
| `npm run dev:quick` | Configuração rápida |
| `npm run dev:test` | Apenas testes |
| `npm run dev:clean` | Limpar ambiente |
| `npm run docker:up` | Iniciar Docker |
| `npm run docker:down` | Parar Docker |
| `npm test` | Testes unitários |

## 🔍 Troubleshooting

### Problema: Docker não inicia
```bash
# Verificar Docker
docker info

# Reiniciar Docker (Windows)
Restart-Service docker
```

### Problema: Portas em uso
```bash
# Verificar portas
netstat -ano | findstr :4566

# Limpar ambiente
npm run dev:clean
```

### Problema: Agentes não respondem
```bash
# Verificar logs
npm run docker:logs

# Reconfigurar
npm run dev:clean
npm run dev
```

## 📁 Estrutura do Projeto

```
📦 agentes-autonomos/
├── 📂 scripts/
│   ├── 🚀 setup-complete-dev-environment.js  # Script principal
│   ├── ⚡ dev.js                             # Script auxiliar
│   └── 📬 setup-sqs-queues.js               # Configuração SQS
├── 📂 docs/
│   ├── 📖 GUIA_DESENVOLVIMENTO_COMPLETO.md  # Guia detalhado
│   ├── 📬 SQS_SETUP_GUIDE.md               # Guia SQS
│   └── 🧪 COMO_TESTAR_EVENTOS.md           # Testes manuais
├── 📂 src/agents/                           # Código dos agentes
├── 📂 config/                               # Configurações
└── 🐳 docker-compose.yml                   # Serviços Docker
```

## 🎯 Próximos Passos

1. **Execute o ambiente**: `npm run dev`
2. **Acesse Grafana**: http://localhost:3000
3. **Teste eventos**: `npm run dev:test`
4. **Desenvolva**: Adicione novos agentes
5. **Deploy**: Configure produção

## 📚 Documentação Completa

- [📖 Guia Completo](./docs/GUIA_DESENVOLVIMENTO_COMPLETO.md)
- [📬 Configuração SQS](./docs/SQS_SETUP_GUIDE.md)
- [🧪 Testes de Eventos](./docs/COMO_TESTAR_EVENTOS.md)

## 🤝 Contribuição

1. Fork o projeto
2. Crie sua feature: `git checkout -b feature/nova-feature`
3. Execute testes: `npm run dev`
4. Commit: `git commit -m 'Add nova feature'`
5. Push: `git push origin feature/nova-feature`
6. Abra um Pull Request

## 📞 Suporte

- 📖 Consulte a [documentação](./docs/)
- 🔍 Verifique [troubleshooting](#-troubleshooting)
- 🧹 Execute limpeza: `npm run dev:clean`
- 🐛 Abra uma issue no repositório

---

**🎉 Pronto para desenvolver!** Execute `npm run dev` e comece a trabalhar.