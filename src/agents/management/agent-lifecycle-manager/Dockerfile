# Agent Lifecycle Manager Dockerfile
FROM node:18-alpine

# Definir informações do container
LABEL maintainer="Sistema de Agentes Autônomos"
LABEL description="Agent Lifecycle Manager - Gerenciamento de Ciclo de Vida dos Agentes"
LABEL version="1.0.0"

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S agentuser -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências Node.js
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p logs temp && \
    chown -R agentuser:nodejs /app

# Mudar para usuário não-root
USER agentuser

# Expor porta
EXPOSE 3021

# Definir variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3021
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3021/health || exit 1

# Comando de inicialização
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]