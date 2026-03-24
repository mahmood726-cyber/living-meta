# Living Meta-Analysis - Production Dockerfile
# Multi-stage build for optimal image size and security
#
# Build: docker build -t living-meta:latest .
# Run: docker run -p 80:80 living-meta:latest

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS dependencies
LABEL maintainer="Living Meta-Analysis Team"
LABEL description="Living Meta-Analysis - Browser-native meta-analysis platform"

# Set working directory
WORKDIR /app

# Install build dependencies and security tools
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --ignore-scripts --prefer-offline --no-audit \
    && npm cache clean --force

# =============================================================================
# Stage 2: Build
# =============================================================================
FROM node:20-alpine AS build
WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY . .

# Build application
RUN npm run build \
    && ls -la dist/

# =============================================================================
# Stage 3: Production
# =============================================================================
FROM nginx:1.25-alpine AS production

# Install security tools and utilities
RUN apk add --no-cache \
    curl \
    ca-certificates \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user for running the application
RUN addgroup -g 1001 -S lma && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G lma lma

# Copy built assets from build stage
COPY --from=build --chown=lma:lma /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY deployment/docker/nginx.conf /etc/nginx/nginx.conf

# Create directories for runtime
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    && chown -R lma:lma /var/cache/nginx \
    && chown -R lma:lma /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown lma:lma /var/run/nginx.pid

# Switch to non-root user
USER lma

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["nginx", "-g", "daemon off;"]
