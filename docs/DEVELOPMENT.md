# Guia de Desenvolvimento

Este documento fornece instruções detalhadas para desenvolvedores que desejam contribuir ou trabalhar com o sistema de agentes autônomos.

## 📋 Índice

- [Configuração do Ambiente](#configuração-do-ambiente)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Desenvolvimento Local](#desenvolvimento-local)
- [Testes](#testes)
- [Monitoramento](#monitoramento)
- [Debugging](#debugging)
- [Contribuição](#contribuição)

## 🚀 Configuração do Ambiente

### Pré-requisitos

- **Node.js 18+**: Runtime JavaScript
- **npm 8+**: Gerenciador de pacotes
- **Docker**: Para containerização (opcional)
- **Docker Compose**: Para orquestração de serviços (opcional)
- **Git**: Controle de versão

### Configuração Inicial

1. **Clone o repositório**:
   ```bash
   git clone <repository-url>
   cd agentesautonomos
   ```

2. **Execute o script de configuração**:
   ```bash
   npm run start:dev
   ```
   
   Este script irá:
   - Verificar pré-requisitos
   - Criar arquivo `.env` a partir do `.env.example`
   - Instalar dependências
   - Criar diretórios necessários
   - Configurar serviços Docker (opcional)

3. **Configuração manual** (alternativa):
   ```bash
   # Instalar dependências
   npm install
   
   # Copiar arquivo de ambiente
   cp .env.example .env
   
   # Editar variáveis de ambiente
   # Edite o arquivo .env conforme necessário
   ```

## 📁 Estrutura do Projeto

```
agentesautonomos/
├── src/
│   ├── agents/
│   │   ├── core/                 # Agentes principais
│   │   │   ├── interface-agent/  # Agente de interface
│   │   │   ├── event-agent/      # Agente de eventos
│   │   │   ├── planning-agent/   # Agente de planejamento
│   │   │   └── execution-agent/  # Agente de execução
│   │   └── shared/               # Utilitários compartilhados
│   │       └── utils/
│   └── utils/                    # Utilitários gerais
├── scripts/                      # Scripts de automação
│   ├── start-all.js             # Iniciar todos os agentes
│   ├── dev-setup.js             # Configuração de desenvolvimento
│   ├── test-system.js           # Testes do sistema
│   └── monitor.js               # Monitoramento
├── config/                       # Arquivos de configuração
│   ├── elasticmq.conf           # Configuração SQS local
│   ├── prometheus.yml           # Configuração Prometheus
│   └── grafana/                 # Configurações Grafana
├── docker/                       # Dockerfiles
├── docs/                         # Documentação
├── logs/                         # Arquivos de log
└── tests/                        # Testes
```

## 🛠️ Scripts Disponíveis

### Scripts Principais

```bash
# Configuração e inicialização
npm run start:dev          # Configurar ambiente de desenvolvimento
npm start                  # Iniciar todos os agentes
npm run dev                # Configurar + iniciar (combinado)

# Testes
npm test                   # Executar testes unitários
npm run test:watch         # Testes em modo watch
npm run test:coverage      # Testes com cobertura
npm run test:system        # Testes de sistema/integração

# Monitoramento
npm run monitor            # Verificação única do sistema
npm run monitor:continuous # Monitoramento contínuo
npm run health             # Status em JSON

# Docker
npm run docker:up          # Iniciar serviços Docker
npm run docker:down        # Parar serviços Docker
npm run docker:logs        # Ver logs dos containers
npm run docker:build       # Construir imagens

# Qualidade de código
npm run lint               # Verificar código
npm run lint:fix           # Corrigir problemas automaticamente
npm run format             # Formatar código

# Utilitários
npm run logs               # Ver logs em tempo real
npm run clean              # Limpar arquivos temporários
```

### Scripts Detalhados

#### `npm run start:dev`
Script interativo que:
- Verifica pré-requisitos do sistema
- Configura variáveis de ambiente
- Instala/atualiza dependências
- Cria diretórios necessários
- Oferece opções de inicialização

#### `npm run monitor:continuous`
Monitoramento em tempo real que exibe:
- Status dos agentes (Interface, Event, Planning, Execution)
- Status dos serviços (SQS, Prometheus, Grafana)
- Métricas do sistema
- Tamanho das filas SQS
- Tempos de resposta

#### `npm run test:system`
Testes de integração que verificam:
- Estrutura de arquivos
- Configurações
- Dependências instaladas
- Endpoints dos agentes
- Filas SQS
- Serviços de monitoramento

## 💻 Desenvolvimento Local

### Opção 1: Desenvolvimento com Docker (Recomendado)

```bash
# 1. Configurar ambiente
npm run start:dev

# 2. Iniciar serviços de infraestrutura
npm run docker:up

# 3. Verificar se tudo está funcionando
npm run test:system

# 4. Monitorar sistema
npm run monitor:continuous
```

### Opção 2: Desenvolvimento Local Puro

```bash
# 1. Configurar ambiente
npm run start:dev

# 2. Iniciar apenas os agentes
npm start

# 3. Configurar SQS local manualmente (se necessário)
# Instalar ElasticMQ separadamente
```

### Fluxo de Desenvolvimento

1. **Fazer alterações no código**
2. **Executar testes**:
   ```bash
   npm test
   npm run test:system
   ```
3. **Verificar qualidade do código**:
   ```bash
   npm run lint
   npm run format
   ```
4. **Testar integração**:
   ```bash
   npm run monitor
   ```
5. **Commit e push**

### Hot Reload

Para desenvolvimento com hot reload, use `nodemon`:

```bash
# Instalar nodemon globalmente
npm install -g nodemon

# Executar agente específico com hot reload
nodemon src/agents/core/interface-agent/index.js
```

## 🧪 Testes

### Tipos de Testes

1. **Testes Unitários** (`npm test`)
   - Testam funções e classes isoladamente
   - Usam mocks para dependências externas
   - Executados com Jest

2. **Testes de Integração** (`npm run test:system`)
   - Testam comunicação entre componentes
   - Verificam endpoints e APIs
   - Validam configurações

3. **Testes de Sistema**
   - Testam o sistema completo
   - Incluem cenários end-to-end
   - Verificam fluxos de trabalho completos

### Executando Testes

```bash
# Todos os testes unitários
npm test

# Testes em modo watch (re-executa ao salvar)
npm run test:watch

# Testes com relatório de cobertura
npm run test:coverage

# Testes de sistema/integração
npm run test:system

# Teste específico
npm test -- --testNamePattern="Agent"
```

### Escrevendo Testes

Estrutura de teste padrão:

```javascript
const { AgentClass } = require('../src/agents/core/agent');

describe('AgentClass', () => {
  let agent;
  
  beforeEach(() => {
    agent = new AgentClass();
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  describe('method', () => {
    it('should do something', async () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = await agent.method(input);
      
      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

## 📊 Monitoramento

### Ferramentas de Monitoramento

1. **Monitor Script** (`npm run monitor`)
   - Status em tempo real dos agentes
   - Métricas de performance
   - Verificação de saúde dos serviços

2. **Prometheus** (http://localhost:9090)
   - Coleta de métricas
   - Alertas
   - Queries personalizadas

3. **Grafana** (http://localhost:3100)
   - Dashboards visuais
   - Gráficos de métricas
   - Alertas visuais

### Métricas Importantes

- **Saúde dos Agentes**: Status up/down
- **Tempo de Resposta**: Latência dos endpoints
- **Taxa de Erro**: Percentual de falhas
- **Filas SQS**: Tamanho e throughput
- **Uso de Recursos**: CPU e memória

### Logs

```bash
# Ver logs em tempo real
npm run logs

# Logs específicos
tail -f logs/interface-agent.log
tail -f logs/event-agent.log
tail -f logs/planning-agent.log
tail -f logs/execution-agent.log

# Logs do Docker
npm run docker:logs
```

## 🐛 Debugging

### Debug Local

```bash
# Executar com debug
DEBUG=* node src/agents/core/interface-agent/index.js

# Debug específico
DEBUG=agent:* node src/agents/core/interface-agent/index.js
```

### Debug com VS Code

Configuração `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Interface Agent",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/agents/core/interface-agent/index.js",
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "*"
      }
    }
  ]
}
```

### Troubleshooting Comum

1. **Agente não inicia**:
   - Verificar se a porta está disponível
   - Verificar variáveis de ambiente
   - Verificar logs de erro

2. **Erro de conexão SQS**:
   - Verificar se ElasticMQ está rodando
   - Verificar configuração de endpoint
   - Verificar filas criadas

3. **Métricas não aparecem**:
   - Verificar se Prometheus está rodando
   - Verificar configuração de scraping
   - Verificar endpoints `/metrics`

## 🤝 Contribuição

### Fluxo de Contribuição

1. **Fork** o repositório
2. **Criar branch** para feature/bugfix
3. **Fazer alterações** seguindo padrões
4. **Executar testes** e verificações
5. **Commit** com mensagens descritivas
6. **Push** para o fork
7. **Criar Pull Request**

### Padrões de Código

- **ESLint**: Verificação de qualidade
- **Prettier**: Formatação consistente
- **Conventional Commits**: Mensagens padronizadas
- **JSDoc**: Documentação de código

### Checklist de PR

- [ ] Código segue padrões do projeto
- [ ] Testes passam (`npm test`)
- [ ] Testes de sistema passam (`npm run test:system`)
- [ ] Lint passa (`npm run lint`)
- [ ] Documentação atualizada
- [ ] Changelog atualizado (se necessário)

### Estrutura de Commit

```
type(scope): description

[optional body]

[optional footer]
```

Exemplos:
```
feat(agent): add health check endpoint
fix(sqs): resolve connection timeout issue
docs(readme): update installation instructions
test(integration): add agent communication tests
```

## 📚 Recursos Adicionais

- [Documentação da API](./API.md)
- [Guia de Arquitetura](./ARCHITECTURE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [FAQ](./FAQ.md)

## 🆘 Suporte

Para dúvidas ou problemas:

1. Verificar [Troubleshooting](./TROUBLESHOOTING.md)
2. Verificar [Issues](https://github.com/repo/issues) existentes
3. Criar nova [Issue](https://github.com/repo/issues/new)
4. Contatar equipe de desenvolvimento

---

**Última atualização**: $(date)
**Versão**: 1.0.0