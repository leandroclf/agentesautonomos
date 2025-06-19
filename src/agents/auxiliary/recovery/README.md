# Recovery Agent

O Recovery Agent é um agente auxiliar responsável pela recuperação automática de falhas e escalação de problemas críticos no sistema de agentes autônomos.

## Funcionalidades

### 🔄 Recuperação Automática
- **Estratégias de Recuperação**: Restart, Graceful Restart, Force Restart, Health Reset, Service Restart
- **Detecção de Falhas**: Monitoramento contínuo de agentes e serviços
- **Retry Logic**: Sistema inteligente de tentativas com backoff exponencial
- **Cooldown**: Prevenção de loops de recuperação

### 🚀 Gerenciamento de Restart
- **Múltiplos Métodos**: PM2, Docker, Systemd, Kubernetes
- **Verificação de Restart**: Validação automática de sucesso
- **Rollback**: Capacidade de reverter restarts falhados
- **Estatísticas**: Métricas detalhadas de operações

### 📢 Sistema de Escalação
- **Níveis de Escalação**: Low, Medium, High, Critical
- **Notificações Múltiplas**: Log, Metrics, Alert, Email, SMS, Slack
- **Cooldown Inteligente**: Prevenção de spam de notificações
- **Templates Customizáveis**: Mensagens personalizadas por tipo

### 🛡️ Segurança
- **Rate Limiting**: Proteção contra abuso de APIs
- **Autenticação**: Sistema de tokens Bearer
- **IP Whitelist**: Controle de acesso por IP
- **Input Validation**: Sanitização de entrada
- **Attack Detection**: Detecção de padrões maliciosos

### 📊 Observabilidade
- **Métricas Prometheus**: Métricas detalhadas de operações
- **Logging Estruturado**: Logs em formato JSON com Winston
- **Health Checks**: Endpoints de saúde e status
- **Dashboards**: Métricas para Grafana

## Arquitetura

```
recovery/
├── index.js                 # Ponto de entrada principal
├── config/
│   └── recoveryConfig.js    # Configurações do agente
├── services/
│   ├── recoveryService.js   # Lógica de recuperação
│   ├── restartService.js    # Gerenciamento de restarts
│   └── escalationService.js # Sistema de escalação
├── routes/
│   └── recoveryRoutes.js    # Rotas da API REST
├── middleware/
│   ├── security.js          # Middleware de segurança
│   └── metrics.js           # Middleware de métricas
├── package.json             # Dependências e scripts
└── README.md               # Esta documentação
```

## Configuração

### Variáveis de Ambiente

```bash
# Servidor
PORT=3015
NODE_ENV=production

# AWS SQS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Notificações
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

SMS_ACCOUNT_SID=your_twilio_sid
SMS_AUTH_TOKEN=your_twilio_token
SMS_FROM_NUMBER=+1234567890

SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_CHANNEL=#alerts

# Segurança
AUTH_TOKENS=token1,token2,token3
ALLOWED_IPS=127.0.0.1,192.168.1.0/24
```

### Configuração de Recuperação

O arquivo `config/recoveryConfig.js` contém todas as configurações:

```javascript
module.exports = {
  port: process.env.PORT || 3015,
  
  recovery: {
    strategies: {
      restart: { timeout: 30000, maxRetries: 3 },
      graceful_restart: { timeout: 60000, maxRetries: 2 },
      force_restart: { timeout: 10000, maxRetries: 1 },
      health_reset: { timeout: 15000, maxRetries: 2 },
      service_restart: { timeout: 45000, maxRetries: 2 }
    },
    cooldown: 300000, // 5 minutos
    maxConcurrentRecoveries: 5
  },
  
  escalation: {
    levels: {
      low: { notifications: ['log'], cooldown: 600000 },
      medium: { notifications: ['log', 'metrics'], cooldown: 300000 },
      high: { notifications: ['log', 'metrics', 'alert'], cooldown: 180000 },
      critical: { notifications: ['log', 'metrics', 'alert', 'email', 'sms', 'slack'], cooldown: 60000 }
    }
  }
};
```

## API Endpoints

### Health Check
```http
GET /health
```

Retorna o status de saúde do agente.

### Status Detalhado
```http
GET /status
```

Retorna informações detalhadas sobre todos os serviços.

### Iniciar Recuperação
```http
POST /recover
Content-Type: application/json

{
  "agent": "planning-agent",
  "strategy": "restart",
  "reason": "health_check_failed",
  "details": {
    "error": "Connection timeout",
    "lastSeen": "2024-01-15T10:30:00Z"
  }
}
```

### Reiniciar Agente
```http
POST /restart
Content-Type: application/json

{
  "agent": "execution-agent",
  "method": "pm2",
  "force": false
}
```

### Escalar Problema
```http
POST /escalate
Content-Type: application/json

{
  "level": "critical",
  "reason": "multiple_agent_failures",
  "details": {
    "affectedAgents": ["planning", "execution", "event"],
    "impact": "system_unavailable"
  }
}
```

### Listar Recuperações Ativas
```http
GET /recoveries
```

### Histórico de Recuperações
```http
GET /recoveries/history
```

### Cancelar Recuperação
```http
DELETE /recoveries/{recoveryId}
Content-Type: application/json

{
  "reason": "manual_intervention"
}
```

### Métricas Prometheus
```http
GET /metrics
```

## Instalação e Execução

### Pré-requisitos
- Node.js >= 18.0.0
- npm >= 8.0.0
- AWS SQS configurado
- PM2 (opcional, para gerenciamento de processos)

### Instalação

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Executar em desenvolvimento
npm run dev

# Executar em produção
npm start
```

### Docker

```bash
# Build da imagem
npm run docker:build

# Executar container
npm run docker:run
```

### PM2

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar com PM2
pm2 start index.js --name recovery-agent

# Monitorar
pm2 monit

# Logs
pm2 logs recovery-agent
```

## Testes

```bash
# Executar todos os testes
npm test

# Executar testes em modo watch
npm run test:watch

# Gerar relatório de cobertura
npm run test:coverage

# Linting
npm run lint
npm run lint:fix
```

## Monitoramento

### Métricas Disponíveis

- `recovery_agent_http_requests_total` - Total de requests HTTP
- `recovery_agent_http_request_duration_seconds` - Duração de requests
- `recovery_agent_recovery_operations_total` - Total de operações de recuperação
- `recovery_agent_restart_operations_total` - Total de operações de restart
- `recovery_agent_escalation_operations_total` - Total de escalações
- `recovery_agent_notifications_total` - Total de notificações enviadas
- `recovery_agent_system_health` - Status de saúde do sistema
- `recovery_agent_memory_usage_bytes` - Uso de memória
- `recovery_agent_cpu_usage_percent` - Uso de CPU

### Dashboards Grafana

Importe os dashboards disponíveis em `/monitoring/grafana/` para visualizar:

- Performance de recuperações
- Taxa de sucesso de restarts
- Distribuição de escalações por nível
- Métricas de sistema e recursos

### Alertas

Configure alertas no Prometheus/Alertmanager para:

- Taxa de falha de recuperação > 20%
- Tempo de resposta > 30s
- Escalações críticas
- Uso de memória > 80%
- Uso de CPU > 90%

## Integração com Outros Agentes

### Health Checker Agent
O Recovery Agent trabalha em conjunto com o Health Checker Agent:

```javascript
// Health Checker detecta falha
healthChecker.on('agentDown', (agentInfo) => {
  recoveryAgent.recover({
    agent: agentInfo.name,
    strategy: 'auto',
    reason: 'health_check_failed',
    details: agentInfo
  });
});
```

### Notification Service
Para notificações avançadas:

```javascript
// Integração com serviço de notificações
const notificationService = require('../notification/notificationService');

escalationService.on('escalationTriggered', async (escalation) => {
  await notificationService.send({
    type: 'escalation',
    level: escalation.level,
    data: escalation
  });
});
```

## Troubleshooting

### Problemas Comuns

1. **Falha na conexão SQS**
   ```bash
   # Verificar credenciais AWS
   aws sts get-caller-identity
   
   # Testar conectividade
   aws sqs list-queues --region us-east-1
   ```

2. **Notificações não enviadas**
   ```bash
   # Verificar configurações de email
   curl -X POST http://localhost:3015/escalate \
     -H "Content-Type: application/json" \
     -d '{"level":"low","reason":"test"}'
   ```

3. **Rate limiting ativo**
   ```bash
   # Verificar logs
   tail -f logs/recovery-agent.log | grep "rate limit"
   ```

### Logs

Os logs são estruturados em JSON e incluem:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Recovery operation completed",
  "recoveryId": "recovery_restart_1705315800000_abc123",
  "agent": "planning-agent",
  "strategy": "restart",
  "duration": 15000,
  "success": true
}
```

## Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## Licença

MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## Suporte

Para suporte e dúvidas:

- 📧 Email: suporte@agentes-autonomos.com
- 💬 Slack: #recovery-agent
- 🐛 Issues: [GitHub Issues](https://github.com/seu-usuario/agentes-autonomos/issues)
- 📖 Wiki: [Documentação Completa](https://github.com/seu-usuario/agentes-autonomos/wiki)