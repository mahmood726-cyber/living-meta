# Living Meta-Analysis - Docker Configuration
# Multi-stage build for production deployment

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy non-root user config
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nginx -u 1001

# Create directory for cache and set permissions
RUN mkdir -p /var/cache/nginx && \
    chown -R nginx:nodejs /var/cache/nginx && \
    chown -R nginx:nodejs /usr/share/nginx/html && \
    chown -R nginx:nodejs /var/log/nginx && \
    chown -R nginx:nodez /etc/nginx/conf.d

# Switch to non-root user
USER nginx

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
