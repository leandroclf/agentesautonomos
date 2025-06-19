# Event Enricher Agent Dockerfile
# Multi-stage build para otimização de tamanho e segurança

# Stage 1: Build
FROM node:18-alpine AS builder

# Metadados
LABEL maintainer="Sistema de Agentes Autônomos"
LABEL description="Event Enricher Agent - Enriquecimento, validação e normalização de eventos"
LABEL version="1.0.0"

# Instalar dependências do sistema necessárias para build
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Runtime
FROM node:18-alpine AS runtime

# Instalar dependências de runtime
RUN apk add --no-cache \
    dumb-init \
    curl \
    && addgroup -g 1001 -S nodejs \
    && adduser -S enricher -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Copiar node_modules do stage de build
COPY --from=builder --chown=enricher:nodejs /app/node_modules ./node_modules

# Copiar código da aplicação
COPY --chown=enricher:nodejs . .

# Criar diretórios necessários
RUN mkdir -p /app/logs /app/temp && \
    chown -R enricher:nodejs /app

# Configurar usuário não-root
USER enricher

# Expor porta
EXPOSE 3006

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3006
ENV LOG_LEVEL=info
ENV METRICS_ENABLED=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3006/api/enricher/health || exit 1

# Comando de inicialização com dumb-init para gerenciamento de sinais
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]

# Metadados adicionais
LABEL org.opencontainers.image.title="Event Enricher Agent"
LABEL org.opencontainers.image.description="Agente responsável por enriquecer eventos com contexto adicional"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="2024-01-01T00:00:00Z"
LABEL org.opencontainers.image.source="https://github.com/seu-usuario/agentes-autonomos"
LABEL org.opencontainers.image.licenses="MIT"