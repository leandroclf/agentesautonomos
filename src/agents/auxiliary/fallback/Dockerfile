# Fallback Agent Dockerfile
# Agente de Estratégias de Fallback - Sistema de Agentes Autônomos

# Usar imagem oficial do Node.js LTS
FROM node:18-alpine

# Metadados da imagem
LABEL maintainer="Sistema de Agentes Autônomos"
LABEL description="Fallback Agent - Implementa estratégias de resiliência e fallback"
LABEL version="1.0.0"
LABEL component="auxiliary"
LABEL service="fallback"

# Instalar dependências do sistema
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S fallback && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G fallback fallback

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários e ajustar permissões
RUN mkdir -p logs temp cache && \
    chown -R fallback:fallback /app && \
    chmod -R 755 /app

# Mudar para usuário não-root
USER fallback

# Expor porta do serviço
EXPOSE 3020

# Configurar health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3020/health || exit 1

# Definir entrypoint e comando
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]