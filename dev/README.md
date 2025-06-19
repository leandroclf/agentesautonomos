# Desenvolvimento Local

Esta pasta contém todos os scripts e ferramentas necessários para desenvolvimento local do sistema de agentes autônomos.

## 📁 Estrutura

```
dev/
├── README.md              # Este arquivo
├── setup.js              # Script principal de configuração do ambiente
├── local-stack.js         # Configuração do LocalStack
├── mocks/                 # Serviços mock para desenvolvimento
│   ├── policy-api-mock.js
│   ├── schema-registry-mock.js
│   └── state-api-mock.js
└── scripts/               # Scripts auxiliares de desenvolvimento
    ├── start-all.js
    ├── start-mocks.js
    └── test-system.js
```

## 🚀 Como usar

### Configuração inicial
```bash
# Configurar ambiente de desenvolvimento
node dev/setup.js

# Iniciar LocalStack
node dev/local-stack.js

# Iniciar todos os serviços mock
node dev/scripts/start-mocks.js
```

### Scripts disponíveis

- **setup.js**: Configura o ambiente completo de desenvolvimento
- **local-stack.js**: Gerencia o LocalStack (AWS local)
- **mocks/**: Serviços mock para APIs externas
- **scripts/start-all.js**: Inicia todos os agentes em modo desenvolvimento
- **scripts/start-mocks.js**: Inicia apenas os serviços mock
- **scripts/test-system.js**: Executa testes do sistema

## 📋 Pré-requisitos

- Node.js 18+
- Docker (para LocalStack)
- npm ou yarn

## 🔧 Configuração

O script de setup criará automaticamente:
- Arquivo `.env` baseado no template
- Configurações do LocalStack
- Filas SQS locais
- Buckets S3 locais

## 🐛 Troubleshooting

Para problemas comuns, consulte:
- [Troubleshooting Geral](../docs/TROUBLESHOOTING.md)
- [Desenvolvimento Local](../docs/LOCAL_DEVELOPMENT.md)