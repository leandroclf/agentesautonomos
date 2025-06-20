# Configuração e Acesso ao Grafana

## 📊 Informações de Acesso

### Credenciais Padrão
- **URL**: http://localhost:3000
- **Usuário**: `admin`
- **Senha**: `admin123`

### Portas Configuradas
- **Grafana**: 3000
- **Prometheus**: 9090

## 🚀 Como Acessar

1. **Certifique-se que o ambiente está rodando**:
   ```bash
   npm run dev
   ```

2. **Acesse o Grafana**:
   - Abra seu navegador
   - Vá para: http://localhost:3000
   - Faça login com `admin` / `admin123`

3. **Primeiro Acesso**:
   - O Grafana pode solicitar para alterar a senha padrão
   - Você pode pular esta etapa clicando em "Skip"

## 📈 Dashboards Disponíveis

### Dashboard Principal: "Agentes Autônomos"
Localizado em: `/config/grafana/dashboards/agentes-autonomos-dashboard.json`

**Métricas Incluídas**:
- 📊 **Taxa de Requisições HTTP** por agente
- 🟢 **Status dos Agentes** (Up/Down)
- 💻 **Uso de CPU** por agente
- 🧠 **Uso de Memória** por agente
- 🎯 **Atividade dos Agentes** (eventos, decisões, ações)

### Como Importar Dashboards

1. Acesse Grafana (http://localhost:3000)
2. Vá em **"+"** → **Import**
3. Cole o conteúdo do arquivo JSON ou faça upload
4. Configure o datasource como "Prometheus"
5. Clique em **Import**

## 🔧 Configuração Técnica

### Datasource Prometheus
- **URL**: http://prometheus:9090
- **Configuração**: `/config/grafana/provisioning/datasources/prometheus.yml`
- **Auto-provisionado**: Sim

### Estrutura de Arquivos
```
config/grafana/
├── dashboards/
│   └── agentes-autonomos-dashboard.json
└── provisioning/
    ├── dashboards/
    │   └── dashboards.yml
    └── datasources/
        └── prometheus.yml
```

## 📊 Métricas Personalizadas

### Queries Prometheus Úteis

```promql
# Taxa de requisições por agente
rate(http_requests_total[5m])

# Status dos serviços
up{job="interface-agent"}
up{job="event-agent"}
up{job="planning-agent"}
up{job="execution-agent"}

# CPU por processo
rate(process_cpu_seconds_total[5m]) * 100

# Memória por processo
process_resident_memory_bytes

# Métricas customizadas dos agentes
agent_events_processed_total
agent_decisions_made_total
agent_actions_executed_total
```

## 🛠️ Troubleshooting

### Grafana não carrega
1. Verifique se o container está rodando:
   ```bash
   docker ps | grep grafana
   ```

2. Verifique os logs:
   ```bash
   docker logs agentes-grafana
   ```

### Dashboards não aparecem
1. Verifique se os arquivos estão no local correto
2. Reinicie o container do Grafana:
   ```bash
   docker-compose restart grafana
   ```

### Prometheus não conecta
1. Verifique se o Prometheus está rodando:
   ```bash
   curl http://localhost:9090/api/v1/query?query=up
   ```

2. Teste a conectividade interna:
   ```bash
   docker exec agentes-grafana curl http://prometheus:9090/api/v1/query?query=up
   ```

## 🎨 Personalização

### Criando Novos Dashboards
1. Acesse Grafana
2. Vá em **"+"** → **Dashboard**
3. Adicione painéis com queries Prometheus
4. Salve e exporte como JSON
5. Coloque o arquivo em `/config/grafana/dashboards/`

### Temas e Aparência
- **Tema Padrão**: Dark
- **Personalização**: Settings → Preferences
- **Logo**: Pode ser customizado via environment variables

## 📚 Recursos Adicionais

- [Documentação Oficial Grafana](https://grafana.com/docs/)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/)
- [Dashboard Examples](https://grafana.com/grafana/dashboards/)

---

**Nota**: Este setup foi configurado automaticamente durante a inicialização do ambiente de desenvolvimento.