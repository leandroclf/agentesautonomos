# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /usr/src/app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development
ENV NODE_ENV=development
RUN npm ci --include=dev
COPY . .
RUN chown -R nodeuser:nodejs /usr/src/app
USER nodeuser
EXPOSE 3022
CMD ["dumb-init", "npm", "run", "dev"]

# Production dependencies stage
FROM base AS deps
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Copy production dependencies
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs data backups temp

# Set proper permissions
RUN chown -R nodeuser:nodejs /usr/src/app

# Switch to non-root user
USER nodeuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3022/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Expose port
EXPOSE 3022

# Start application
CMD ["dumb-init", "node", "server.js"]

# Labels for metadata
LABEL maintainer="Message Schema Registry Team"
LABEL version="1.0.0"
LABEL description="Message Schema Registry - Centralized schema management for distributed systems"
LABEL org.opencontainers.image.source="https://github.com/your-org/message-schema-registry"
LABEL org.opencontainers.image.documentation="https://github.com/your-org/message-schema-registry/blob/main/README.md"
LABEL org.opencontainers.image.licenses="MIT"