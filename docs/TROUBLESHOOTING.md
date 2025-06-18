# Guia de Troubleshooting

Este documento fornece soluções para problemas comuns encontrados no sistema de agentes autônomos.

## 📋 Índice

- [Problemas de Inicialização](#problemas-de-inicialização)
- [Problemas de Conectividade](#problemas-de-conectividade)
- [Problemas de Performance](#problemas-de-performance)
- [Problemas de Monitoramento](#problemas-de-monitoramento)
- [Problemas de Docker](#problemas-de-docker)
- [Problemas de Dependências](#problemas-de-dependências)
- [Logs e Debugging](#logs-e-debugging)
- [Ferramentas de Diagnóstico](#ferramentas-de-diagnóstico)

## 🚀 Problemas de Inicialização

### Agente não inicia

**Sintomas**:
- Erro "EADDRINUSE" ou "Port already in use"
- Processo termina imediatamente
- Timeout na inicialização

**Diagnóstico**:
```bash
# Verificar portas em uso
netstat -ano | findstr :3000
netstat -ano | findstr :3001
netstat -ano | findstr :3002
netstat -ano | findstr :3003

# Verificar processos Node.js
tasklist | findstr node.exe
```

**Soluções**:

1. **Porta em uso**:
   ```bash
   # Matar processo na porta
   npx kill-port 3000
   
   # Ou alterar porta no .env
   INTERFACE_AGENT_PORT=3010
   ```

2. **Variáveis de ambiente**:
   ```bash
   # Verificar se .env existe
   ls -la .env
   
   # Copiar do exemplo se não existir
   cp .env.example .env
   ```

3. **Dependências**:
   ```bash
   # Reinstalar dependências
   rm -rf node_modules package-lock.json
   npm install
   ```

### Erro de configuração

**Sintomas**:
- "Cannot read property of undefined"
- "Invalid configuration"
- Agente inicia mas não responde

**Diagnóstico**:
```bash
# Verificar configuração
node -e "console.log(require('dotenv').config())"

# Testar configuração específica
node -e "require('dotenv').config(); console.log(process.env.AWS_REGION)"
```

**Soluções**:

1. **Arquivo .env malformado**:
   ```bash
   # Validar sintaxe do .env
   cat .env | grep -v '^#' | grep -v '^$' | grep -v '='
   
   # Recriar do exemplo
   cp .env.example .env
   ```

2. **Variáveis obrigatórias**:
   ```bash
   # Verificar variáveis essenciais
   grep -E "(NODE_ENV|AWS_REGION|SQS_ENDPOINT)" .env
   ```

## 🔌 Problemas de Conectividade

### Agentes não se comunicam

**Sintomas**:
- "ECONNREFUSED"
- "Network timeout"
- Circuit breaker ativado

**Diagnóstico**:
```bash
# Testar conectividade entre agentes
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health

# Verificar logs de rede
npm run monitor
```

**Soluções**:

1. **Verificar se todos os agentes estão rodando**:
   ```bash
   npm run monitor
   
   # Ou verificar individualmente
   curl -f http://localhost:3000/health || echo "Interface Agent down"
   curl -f http://localhost:3001/health || echo "Event Agent down"
   ```

2. **Resetar circuit breakers**:
   ```bash
   # Reiniciar agentes
   npm run docker:down
   npm run docker:up
   
   # Ou reiniciar processo específico
   pkill -f "interface-agent"
   node src/agents/core/interface-agent/index.js
   ```

3. **Verificar configuração de rede**:
   ```bash
   # Verificar se Docker network existe
   docker network ls | grep agents
   
   # Recriar network se necessário
   docker-compose down
   docker-compose up -d
   ```

### SQS não conecta

**Sintomas**:
- "Unable to connect to SQS"
- "Queue does not exist"
- Mensagens não são processadas

**Diagnóstico**:
```bash
# Verificar se ElasticMQ está rodando
curl http://localhost:9324

# Verificar filas
curl http://localhost:9324/queue

# Verificar logs do ElasticMQ
docker logs elasticmq
```

**Soluções**:

1. **ElasticMQ não está rodando**:
   ```bash
   # Iniciar ElasticMQ
   docker-compose up -d elasticmq
   
   # Verificar status
   docker ps | grep elasticmq
   ```

2. **Filas não criadas**:
   ```bash
   # Recriar filas (ElasticMQ recria automaticamente)
   docker-compose restart elasticmq
   
   # Verificar configuração
   cat config/elasticmq.conf
   ```

3. **Configuração SQS incorreta**:
   ```bash
   # Verificar endpoint no .env
   grep SQS_ENDPOINT .env
   
   # Deve ser: SQS_ENDPOINT=http://localhost:9324
   ```

## ⚡ Problemas de Performance

### Alta latência

**Sintomas**:
- Respostas lentas (>5s)
- Timeouts frequentes
- CPU alta

**Diagnóstico**:
```bash
# Verificar métricas
npm run monitor:continuous

# Verificar uso de CPU/memória
top -p $(pgrep -f "node.*agent")

# Verificar logs de performance
tail -f logs/interface-agent.log | grep "duration"
```

**Soluções**:

1. **Otimizar configuração**:
   ```javascript
   // Aumentar timeout nos agentes
   const TIMEOUT = process.env.REQUEST_TIMEOUT || 30000;
   
   // Configurar pool de conexões
   const agent = new https.Agent({
     keepAlive: true,
     maxSockets: 50
   });
   ```

2. **Escalar horizontalmente**:
   ```bash
   # Escalar agentes com Docker
   docker-compose up -d --scale interface-agent=2
   docker-compose up -d --scale event-agent=2
   ```

3. **Otimizar queries**:
   ```javascript
   // Implementar cache
   const NodeCache = require('node-cache');
   const cache = new NodeCache({ stdTTL: 600 });
   
   // Usar batch processing
   const batch = await Promise.all(requests);
   ```

### Memory leak

**Sintomas**:
- Uso de memória crescente
- "Out of memory" errors
- Performance degradante

**Diagnóstico**:
```bash
# Monitorar memória
while true; do
  ps aux | grep node | grep -v grep
  sleep 10
done

# Usar Node.js profiling
node --inspect src/agents/core/interface-agent/index.js
```

**Soluções**:

1. **Identificar vazamentos**:
   ```javascript
   // Adicionar monitoring de memória
   setInterval(() => {
     const usage = process.memoryUsage();
     console.log('Memory usage:', {
       rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
       heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB'
     });
   }, 30000);
   ```

2. **Limpar recursos**:
   ```javascript
   // Limpar timers e listeners
   process.on('SIGTERM', () => {
     clearInterval(intervalId);
     server.close();
     process.exit(0);
   });
   ```

## 📊 Problemas de Monitoramento

### Prometheus não coleta métricas

**Sintomas**:
- Métricas vazias no Grafana
- Erro "Target down" no Prometheus
- Endpoints /metrics não respondem

**Diagnóstico**:
```bash
# Verificar endpoints de métricas
curl http://localhost:3000/metrics
curl http://localhost:3001/metrics

# Verificar configuração do Prometheus
curl http://localhost:9090/targets

# Verificar logs do Prometheus
docker logs prometheus
```

**Soluções**:

1. **Verificar configuração**:
   ```yaml
   # config/prometheus.yml
   scrape_configs:
     - job_name: 'interface-agent'
       static_configs:
         - targets: ['interface-agent:3000']
       metrics_path: '/metrics'
       scrape_interval: 15s
   ```

2. **Reiniciar Prometheus**:
   ```bash
   docker-compose restart prometheus
   
   # Verificar se carregou configuração
   curl http://localhost:9090/api/v1/targets
   ```

### Grafana não mostra dados

**Sintomas**:
- Dashboards vazios
- "No data" nos painéis
- Erro de conexão com Prometheus

**Diagnóstico**:
```bash
# Verificar conexão Grafana -> Prometheus
curl http://localhost:3100/api/datasources/proxy/1/api/v1/query?query=up

# Verificar logs do Grafana
docker logs grafana
```

**Soluções**:

1. **Configurar datasource**:
   ```bash
   # Acessar Grafana: http://localhost:3100
   # Login: admin/admin
   # Adicionar Prometheus datasource: http://prometheus:9090
   ```

2. **Importar dashboards**:
   ```bash
   # Dashboards estão em config/grafana/dashboards/
   # Importar via UI ou provisioning
   ```

## 🐳 Problemas de Docker

### Container não inicia

**Sintomas**:
- "Container exited with code 1"
- "No such file or directory"
- Build falha

**Diagnóstico**:
```bash
# Verificar logs do container
docker logs interface-agent
docker logs event-agent

# Verificar build
docker-compose build interface-agent

# Verificar imagens
docker images | grep agent
```

**Soluções**:

1. **Rebuild containers**:
   ```bash
   # Rebuild sem cache
   docker-compose build --no-cache
   
   # Remover imagens antigas
   docker rmi $(docker images -f "dangling=true" -q)
   ```

2. **Verificar Dockerfile**:
   ```dockerfile
   # Verificar se paths estão corretos
   COPY package*.json ./
   COPY src/ ./src/
   COPY config/ ./config/
   
   # Verificar se comando está correto
   CMD ["node", "src/agents/core/interface-agent/index.js"]
   ```

### Problemas de rede Docker

**Sintomas**:
- Containers não se comunicam
- "Name resolution failed"
- "Connection refused"

**Diagnóstico**:
```bash
# Verificar network
docker network ls
docker network inspect agentesautonomos_agents-network

# Testar conectividade entre containers
docker exec interface-agent ping event-agent
```

**Soluções**:

1. **Recriar network**:
   ```bash
   docker-compose down
   docker network prune
   docker-compose up -d
   ```

2. **Verificar configuração de rede**:
   ```yaml
   # docker-compose.yml
   networks:
     agents-network:
       driver: bridge
   
   services:
     interface-agent:
       networks:
         - agents-network
   ```

## 📦 Problemas de Dependências

### Erro de instalação npm

**Sintomas**:
- "npm ERR! peer dep missing"
- "Module not found"
- "Cannot resolve dependency"

**Diagnóstico**:
```bash
# Verificar versões
node --version
npm --version

# Verificar package.json
npm ls

# Verificar cache
npm cache verify
```

**Soluções**:

1. **Limpar e reinstalar**:
   ```bash
   # Limpar completamente
   rm -rf node_modules package-lock.json
   npm cache clean --force
   npm install
   ```

2. **Resolver conflitos de versão**:
   ```bash
   # Instalar versões específicas
   npm install express@4.18.0
   
   # Usar npm audit para resolver vulnerabilidades
   npm audit fix
   ```

### Versão incompatível

**Sintomas**:
- "Unsupported engine"
- "Requires Node.js >= 18"
- Funcionalidades não funcionam

**Soluções**:

1. **Atualizar Node.js**:
   ```bash
   # Verificar versão atual
   node --version
   
   # Instalar Node.js 18+ via nvm (Linux/Mac)
   nvm install 18
   nvm use 18
   
   # Windows: baixar do site oficial
   ```

2. **Usar Docker para isolamento**:
   ```bash
   # Usar versão específica no Dockerfile
   FROM node:18-alpine
   ```

## 📝 Logs e Debugging

### Configurar logging detalhado

```bash
# Ativar debug mode
export DEBUG=*
node src/agents/core/interface-agent/index.js

# Debug específico
export DEBUG=agent:*
export DEBUG=coordination:*
```

### Analisar logs

```bash
# Logs em tempo real
npm run logs

# Logs específicos
tail -f logs/interface-agent.log
tail -f logs/event-agent.log

# Filtrar erros
grep -i error logs/*.log
grep -i "failed\|timeout\|refused" logs/*.log

# Analisar performance
grep "duration" logs/*.log | sort -k3 -n
```

### Debugging com VS Code

```json
// .vscode/launch.json
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
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["--inspect"]
    }
  ]
}
```

## 🔧 Ferramentas de Diagnóstico

### Script de diagnóstico completo

```bash
#!/bin/bash
# diagnose.sh

echo "=== DIAGNÓSTICO DO SISTEMA ==="
echo "Data: $(date)"
echo

echo "--- Versões ---"
node --version
npm --version
docker --version 2>/dev/null || echo "Docker não instalado"
echo

echo "--- Processos Node.js ---"
ps aux | grep node | grep -v grep
echo

echo "--- Portas em uso ---"
netstat -tulpn | grep -E ":(3000|3001|3002|3003|9090|9324|3100)"
echo

echo "--- Status dos serviços ---"
curl -s http://localhost:3000/health | jq . 2>/dev/null || echo "Interface Agent: DOWN"
curl -s http://localhost:3001/health | jq . 2>/dev/null || echo "Event Agent: DOWN"
curl -s http://localhost:3002/health | jq . 2>/dev/null || echo "Planning Agent: DOWN"
curl -s http://localhost:3003/health | jq . 2>/dev/null || echo "Execution Agent: DOWN"
echo

echo "--- Docker containers ---"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo

echo "--- Últimos erros nos logs ---"
find logs/ -name "*.log" -exec grep -l "ERROR\|error" {} \; | head -3 | while read file; do
  echo "=== $file ==="
  tail -5 "$file" | grep -i error
  echo
done

echo "--- Uso de recursos ---"
df -h | grep -E "(Filesystem|/dev/)"
free -h 2>/dev/null || echo "Comando free não disponível"
echo

echo "=== FIM DO DIAGNÓSTICO ==="
```

### Executar diagnóstico

```bash
# Tornar executável
chmod +x diagnose.sh

# Executar
./diagnose.sh > diagnostic-report.txt

# Ou usar o script de teste do sistema
npm run test:system
```

### Monitoramento contínuo

```bash
# Monitor em tempo real
npm run monitor:continuous

# Monitor com output JSON para análise
npm run monitor -- --output json > monitor.json

# Análise de tendências
watch -n 30 'npm run health'
```

## 🆘 Quando Pedir Ajuda

Antes de pedir ajuda, colete as seguintes informações:

1. **Informações do sistema**:
   ```bash
   node --version
   npm --version
   uname -a  # Linux/Mac
   systeminfo  # Windows
   ```

2. **Logs relevantes**:
   ```bash
   # Últimos 50 linhas de cada log
   tail -50 logs/*.log
   
   # Logs de erro específicos
   grep -A 5 -B 5 "ERROR" logs/*.log
   ```

3. **Configuração**:
   ```bash
   # Configuração sanitizada (sem senhas)
   cat .env | sed 's/=.*/=***HIDDEN***/'
   ```

4. **Status do sistema**:
   ```bash
   npm run test:system
   npm run health
   ```

5. **Passos para reproduzir** o problema

6. **Comportamento esperado** vs **comportamento atual**

---

**Última atualização**: $(date)
**Versão**: 1.0.0

Para mais ajuda, consulte:
- [Documentação de Desenvolvimento](./DEVELOPMENT.md)
- [Arquitetura do Sistema](./ARCHITECTURE.md)
- [Issues no GitHub](https://github.com/repo/issues)