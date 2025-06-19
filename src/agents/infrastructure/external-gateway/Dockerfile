# External Event API Gateway Dockerfile
# Multi-stage build para otimização de tamanho

# Stage 1: Build
FROM node:18-alpine AS builder

# Metadados
LABEL maintainer="Agentes Autônomos Team"
LABEL description="External Event API Gateway"
LABEL version="1.0.0"

# Instala dependências do sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de dependências
COPY package*.json ./

# Instala dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Runtime
FROM node:18-alpine AS runtime

# Instala dumb-init para gerenciamento de processos
RUN apk add --no-cache dumb-init

# Cria usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S gateway -u 1001

# Define diretório de trabalho
WORKDIR /app

# Copia dependências do stage de build
COPY --from=builder --chown=gateway:nodejs /app/node_modules ./node_modules

# Copia código da aplicação
COPY --chown=gateway:nodejs . .

# Remove arquivos desnecessários
RUN rm -rf tests/ *.test.js .eslintrc.js .prettierrc

# Cria diretórios necessários
RUN mkdir -p logs && chown gateway:nodejs logs

# Define variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3007
ENV LOG_LEVEL=info
ENV METRICS_PORT=9090

# Expõe portas
EXPOSE 3007 9090

# Define usuário
USER gateway

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3007/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Comando de inicialização
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]

# Dockerfile para desenvolvimento
FROM runtime AS development

# Volta para root para instalar dependências de dev
USER root

# Instala dependências de desenvolvimento
RUN npm install --only=development

# Instala nodemon globalmente
RUN npm install -g nodemon

# Volta para usuário gateway
USER gateway

# Sobrescreve variáveis de ambiente para desenvolvimento
ENV NODE_ENV=development
ENV LOG_LEVEL=debug

# Comando para desenvolvimento
CMD ["nodemon", "index.js"]

# Dockerfile para testes
FROM development AS testing

# Copia arquivos de teste
COPY --chown=gateway:nodejs tests/ ./tests/
COPY --chown=gateway:nodejs jest.config.js ./
COPY --chown=gateway:nodejs .eslintrc.js ./

# Comando para testes
CMD ["npm", "test"]

# Build args para customização
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# Labels para metadados
LABEL org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.name="external-event-gateway" \
      org.label-schema.description="Gateway de API para recebimento de eventos externos" \
      org.label-schema.url="https://github.com/agentesautonomos/external-event-gateway" \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.vcs-url="https://github.com/agentesautonomos/external-event-gateway" \
      org.label-schema.vendor="Agentes Autônomos" \
      org.label-schema.version=$VERSION \
      org.label-schema.schema-version="1.0"