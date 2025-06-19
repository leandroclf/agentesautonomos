# Dockerfile para Persistence Agent
FROM node:18-alpine

# Metadados
LABEL maintainer="Sistema de Agentes Autônomos"
LABEL description="Persistence Agent - Gerencia armazenamento avançado de dados e estado"
LABEL version="1.0.0"

# Instalar dependências do sistema
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S persistence -u 1001 -G nodejs

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p logs backups data && \
    chown -R persistence:nodejs /app

# Mudar para usuário não-root
USER persistence

# Expor porta
EXPOSE 3016

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3016/health || exit 1

# Comando de inicialização
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]