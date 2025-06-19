FROM node:18-alpine

# Instalar curl para health checks
RUN apk add --no-cache curl

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json
COPY package.json ./

# Instalar dependências
RUN npm install --legacy-peer-deps

# Copiar código fonte
COPY src/ ./src/
COPY config/ ./config/

# Criar diretório de logs
RUN mkdir -p logs

# Expor porta
EXPOSE 3001

# Definir usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Comando para iniciar o agente
CMD ["node", "src/agents/core/event-agent/index.js"]