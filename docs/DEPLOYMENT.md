# Living Meta-Analysis - Deployment Guide

This guide covers deploying the Living Meta-Analysis application to production environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Environment Variables](#environment-variables)
6. [Health Checks](#health-checks)
7. [Monitoring](#monitoring)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js**: v18.0.0 or higher
- **Docker**: v20.10.0 or higher (for containerized deployment)
- **Kubernetes**: v1.25.0 or higher (for K8s deployment)
- **nginx**: v1.21.0 or higher (as reverse proxy)
- **Git**: For cloning the repository

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 4 GB
- Storage: 20 GB

**Recommended:**
- CPU: 4+ cores
- RAM: 8+ GB
- Storage: 50+ GB SSD

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/living-meta.git
cd living-meta
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Build Application

```bash
npm run build
```

### 4. Run Tests

```bash
npm test
```

---

## Docker Deployment

### Quick Start

```bash
docker build -t living-meta:latest .
docker run -p 8080:80 living-meta:latest
```

### Production Build with nginx

**Dockerfile:**

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY deployment/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  living-meta:
    build: .
    ports:
      - "8080:80"
    environment:
      - NODE_ENV=production
      - API_BASE_URL=https://clinicaltrials.gov/api/v2
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    volumes:
      - ./data:/app/data
    networks:
      - living-meta-network

networks:
  living-meta-network:
    driver: bridge
```

**Start services:**

```bash
docker-compose up -d
```

---

## Kubernetes Deployment

### Deployment Manifest

**deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: living-meta
  labels:
    app: living-meta
    version: v1.0.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: living-meta
  template:
    metadata:
      labels:
        app: living-meta
        version: v1.0.0
    spec:
      containers:
      - name: living-meta
        image: living-meta:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 80
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        - name: API_BASE_URL
          valueFrom:
            configMapKeyRef:
              name: living-meta-config
              key: api-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
---
apiVersion: v1
kind: Service
metadata:
  name: living-meta-service
spec:
  selector:
    app: living-meta
  ports:
  - port: 80
    targetPort: http
    protocol: TCP
    name: http
  type: LoadBalancer
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: living-meta-config
data:
  api-url: "https://clinicaltrials.gov/api/v2"
  log-level: "info"
```

### Deploy to Kubernetes

```bash
kubectl apply -f deployment/k8s/deployment.yaml
kubectl apply -f deployment/k8s/service.yaml
kubectl apply -f deployment/k8s/ingress.yaml
```

### Ingress Configuration

**ingress.yaml:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: living-meta-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - living-meta.example.com
    secretName: living-meta-tls
  rules:
  - host: living-meta.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: living-meta-service
            port:
              number: 80
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `API_BASE_URL` | ClinicalTrials.gov API URL | `https://clinicaltrials.gov/api/v2` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `LOG_LEVEL` | Logging level | `info` |
| `CT_API_KEY` | ClinicalTrials.gov API key | None |
| `MAX_STUDIES` | Maximum studies per query | `500` |
| `CACHE_TTL` | Cache TTL in seconds | `3600` |
| `SENTRY_DSN` | Sentry error tracking | None |

### Environment File Example

**.env.production:**

```env
NODE_ENV=production
PORT=8080
API_BASE_URL=https://clinicaltrials.gov/api/v2
CT_API_KEY=your_api_key_here
LOG_LEVEL=info
MAX_STUDIES=500
CACHE_TTL=3600
SENTRY_DSN=https://your-sentry-dsn
```

---

## Health Checks

### Health Endpoint

The application exposes health check endpoints:

```bash
# Liveness check
GET /health

# Readiness check
GET /ready

# Detailed health
GET /health/detailed
```

### Response Format

```json
{
  "status": "healthy",
  "timestamp": "2026-01-14T12:00:00Z",
  "checks": {
    "api": "ok",
    "database": "ok",
    "memory": "ok"
  }
}
```

### nginx Health Check

**nginx.conf:**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Monitoring

### Application Metrics

Key metrics to monitor:

- **Response Time**: p50, p95, p99 latency
- **Error Rate**: 4xx, 5xx percentages
- **Throughput**: Requests per second
- **Memory Usage**: Heap size, RSS
- **CPU Usage**: Process CPU percentage

### Prometheus Metrics (Optional)

Add to your application:

```javascript
import { register, Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route']
});
```

### Logging

**Production Log Format:**

```json
{
  "timestamp": "2026-01-14T12:00:00Z",
  "level": "info",
  "message": "Analysis completed",
  "userId": "user-123",
  "analysisId": "analysis-456",
  "duration": 1250,
  "studies": 15
}
```

---

## Rollback Procedures

### Docker Rollback

```bash
# List images
docker images | grep living-meta

# Rollback to previous version
docker stop living-meta
docker rm living-meta
docker run -d -p 8080:80 living-meta:previous-version
```

### Kubernetes Rollback

```bash
# View rollout history
kubectl rollout history deployment/living-meta

# Rollback to previous version
kubectl rollout undo deployment/living-meta

# Rollback to specific revision
kubectl rollout undo deployment/living-meta --to-revision=2
```

### Database Rollback (if applicable)

```bash
# For IndexedDB, client-side only
# Clear cached data by version
indexedDB.deleteDatabase('living-meta-v1.0.0');
```

---

## Troubleshooting

### Common Issues

#### 1. Application fails to start

**Symptoms:** Container exits immediately

**Solutions:**
- Check logs: `docker logs living-meta`
- Verify environment variables
- Check port conflicts: `netstat -tuln | grep 8080`

#### 2. High memory usage

**Symptoms:** OOM kills, slow performance

**Solutions:**
- Increase memory limits in deployment
- Check for memory leaks: `docker stats`
- Optimize bundle size: `npm run analyze`

#### 3. Slow API responses

**Symptoms:** Requests timing out

**Solutions:**
- Check CT.gov API status
- Verify rate limiting
- Add caching layer

#### 4. Build failures

**Symptoms:** Build exits with error

**Solutions:**
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm ci
npm run build
```

### Debug Mode

Enable debug logging:

```bash
docker run -e LOG_LEVEL=debug -p 8080:80 living-meta:latest
```

### Health Check Debugging

```bash
# Check health endpoint
curl http://localhost:8080/health

# Detailed health
curl http://localhost:8080/health/detailed | jq
```

---

## Security Considerations

### Production Checklist

- [ ] Enable HTTPS/TLS
- [ ] Set strong Content Security Policy
- [ ] Enable Subresource Integrity (SRI)
- [ ] Configure rate limiting
- [ ] Enable audit logging
- [ ] Rotate secrets regularly
- [ ] Scan vulnerabilities: `npm audit`
- [ ] Use non-root user in containers

### nginx Security Headers

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

---

## Performance Optimization

### Bundle Size Optimization

```bash
# Analyze bundle
npm run build -- --report

# Enable compression
npm install compression
```

### Caching Strategy

**nginx.conf:**

```nginx
# Static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# HTML files
location ~* \.html$ {
    expires 1h;
    add_header Cache-Control "public";
}
```

### CDN Configuration

For global distribution, consider using a CDN:

1. Upload built assets to CDN
2. Configure CDN origin to your server
3. Enable CDN caching for static assets

---

## Backup and Recovery

### Data Backup

IndexedDB data is stored client-side. For server-side data:

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf backup-$DATE.tar.gz /app/data
aws s3 cp backup-$DATE.tar.gz s3://backups/living-meta/
```

### Disaster Recovery

1. **Restore from backup:** Extract backup archive
2. **Rebuild application:** `npm run build`
3. **Redeploy:** Follow deployment steps

---

## Additional Resources

- [Vite Production Build Guide](https://vitejs.dev/guide/build.html)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [nginx Configuration Guide](https://nginx.org/en/docs/)

---

*Last updated: 2026-01-14*
