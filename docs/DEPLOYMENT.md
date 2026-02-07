# Deployment Guide

Production deployment options for Godel: Docker, Kubernetes, and cloud platforms.

## Table of Contents

1. [Docker Deployment](#docker-deployment)
2. [Kubernetes Deployment](#kubernetes-deployment)
3. [Production Checklist](#production-checklist)
4. [Monitoring Setup](#monitoring-setup)

---

## Docker Deployment

### Quick Start with Docker Compose

```bash
# Clone repository
git clone https://github.com/davidkimai/godel.git
cd godel

# Create environment file
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Services Included

The included `docker-compose.yml` provides:

| Service | Purpose | Port |
|---------|---------|------|
| `godel` | Main Godel application | 3000 |
| `postgres` | PostgreSQL database | 5432 |
| `redis` | Redis cache | 6379 |
| `grafana` | Monitoring dashboards | 3001 |
| `loki` | Log aggregation | 3100 |

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  godel:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/godel
      - REDIS_URL=redis://redis:6379
      - GODEL_LOG_LEVEL=info
    volumes:
      - ./.godel:/app/.godel
      - ./.claude-worktrees:/app/.claude-worktrees
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=godel
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Building Custom Image

```bash
# Build image
docker build -t my-godel:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -v $(pwd)/.godel:/app/.godel \
  my-godel:latest
```

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build
RUN npm run build

# Create directories
RUN mkdir -p .godel/logs .claude-worktrees

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start command
CMD ["node", "dist/index.js", "server"]
```

### Multi-Stage Build (Production)

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
RUN mkdir -p .godel/logs .claude-worktrees
EXPOSE 3000
CMD ["node", "dist/index.js", "server"]
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.25+)
- kubectl configured
- Helm 3.x (optional)

### Basic Deployment

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: godel
```

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: godel-config
  namespace: godel
data:
  GODEL_LOG_LEVEL: "info"
  GODEL_MAX_SWARMS: "10"
  GODEL_MAX_CONCURRENT: "5"
```

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: godel-secrets
  namespace: godel
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:pass@postgres:5432/godel"
  REDIS_URL: "redis://redis:6379"
  OPENCLAW_GATEWAY_TOKEN: "your-token-here"
```

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: godel-api
  namespace: godel
spec:
  replicas: 3
  selector:
    matchLabels:
      app: godel-api
  template:
    metadata:
      labels:
        app: godel-api
    spec:
      containers:
        - name: godel
          image: dashai/godel:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: godel-config
            - secretRef:
                name: godel-secrets
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          volumeMounts:
            - name: godel-data
              mountPath: /app/.godel
            - name: worktrees
              mountPath: /app/.claude-worktrees
      volumes:
        - name: godel-data
          persistentVolumeClaim:
            claimName: godel-data-pvc
        - name: worktrees
          emptyDir: {}
```

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: godel-api
  namespace: godel
spec:
  selector:
    app: godel-api
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: godel-ingress
  namespace: godel
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt
spec:
  tls:
    - hosts:
        - godel.yourdomain.com
      secretName: godel-tls
  rules:
    - host: godel.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: godel-api
                port:
                  number: 80
```

### PostgreSQL StatefulSet

```yaml
# k8s/postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: godel
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          env:
            - name: POSTGRES_USER
              value: godel
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: password
            - name: POSTGRES_DB
              value: godel
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

### Redis Deployment

```yaml
# k8s/redis.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: godel
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: godel
spec:
  selector:
    app: redis
  ports:
    - port: 6379
```

### Deploy with kubectl

```bash
# Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Check status
kubectl get pods -n godel
kubectl get svc -n godel
kubectl get ingress -n godel
```

### Helm Chart

```bash
# Add Godel Helm repository
helm repo add godel https://charts.godel-ai.io
helm repo update

# Install with default values
helm install godel godel/godel

# Install with custom values
helm install godel godel/godel -f values.yaml

# Upgrade
helm upgrade godel godel/godel
```

Example `values.yaml`:

```yaml
replicaCount: 3

image:
  repository: dashai/godel
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: godel.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: godel-tls
      hosts:
        - godel.yourdomain.com

resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"

persistence:
  enabled: true
  size: 10Gi

postgresql:
  enabled: true
  auth:
    username: godel
    database: godel
  persistence:
    size: 20Gi

redis:
  enabled: true
  architecture: standalone
```

---

## Production Checklist

### Security

- [ ] Change default passwords
- [ ] Enable TLS/HTTPS
- [ ] Configure firewall rules
- [ ] Set up DDoS protection
- [ ] Enable rate limiting
- [ ] Configure CORS properly
- [ ] Use secrets management (Vault, Sealed Secrets)
- [ ] Enable audit logging
- [ ] Set up network policies (Kubernetes)
- [ ] Run security scans on containers

### Reliability

- [ ] Configure health checks
- [ ] Set up liveness/readiness probes
- [ ] Enable automatic restarts
- [ ] Configure resource limits
- [ ] Set up PDBs (Pod Disruption Budgets)
- [ ] Test failure scenarios
- [ ] Document recovery procedures

### Performance

- [ ] Configure connection pooling
- [ ] Enable caching
- [ ] Set up CDN for static assets
- [ ] Optimize database queries
- [ ] Configure horizontal pod autoscaling
- [ ] Load test the deployment

### Observability

- [ ] Set up metrics collection (Prometheus)
- [ ] Configure log aggregation (Loki/ELK)
- [ ] Set up distributed tracing (Jaeger)
- [ ] Create alerting rules
- [ ] Build operational dashboards
- [ ] Configure error tracking (Sentry)

### Backup and Recovery

- [ ] Configure automated database backups
- [ ] Test restore procedures
- [ ] Backup configuration and secrets
- [ ] Document disaster recovery plan
- [ ] Set up cross-region replication (if needed)

### Configuration

```yaml
# Production environment variables
env:
  # Core
  NODE_ENV: production
  GODEL_LOG_LEVEL: warn
  
  # Performance
  GODEL_MAX_SWARMS: 20
  GODEL_MAX_CONCURRENT: 10
  
  # Security
  GODEL_SANDBOX_ENABLED: "true"
  GODEL_REQUIRE_APPROVAL: "true"
  
  # Database
  DATABASE_POOL_SIZE: 20
  DATABASE_SSL_MODE: require
  
  # Cache
  REDIS_CLUSTER_ENABLED: "true"
  
  # Monitoring
  OTEL_EXPORTER_OTLP_ENDPOINT: https://otel-collector:4317
  SENTRY_DSN: https://...@sentry.io/...
```

---

## Monitoring Setup

### Prometheus + Grafana

```yaml
# monitoring/prometheus-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    
    scrape_configs:
      - job_name: 'godel-api'
        static_configs:
          - targets: ['godel-api.godel.svc.cluster.local:3000']
        metrics_path: /metrics
      
      - job_name: 'postgres'
        static_configs:
          - targets: ['postgres-exporter:9187']
      
      - job_name: 'redis'
        static_configs:
          - targets: ['redis-exporter:9121']
```

### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `dash_agents_active` | Number of active agents | > 80% of max |
| `dash_swarms_active` | Number of active teams | > 80% of max |
| `dash_workflows_running` | Running workflows | > 50 |
| `dash_budget_used_percent` | Budget utilization | > 75% warning, > 90% critical |
| `dash_request_duration_seconds` | API response time | > 1s p99 |
| `dash_requests_total` | Request rate | Anomaly detection |
| `dash_errors_total` | Error rate | > 1% of requests |

### Grafana Dashboards

Import pre-built dashboards from `monitoring/dashboards/`:

```bash
# Import via API
curl -X POST \
  http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @monitoring/dashboards/godel-overview.json
```

### Alerting Rules

```yaml
# monitoring/alert-rules.yaml
groups:
  - name: godel
    rules:
      - alert: DashHighErrorRate
        expr: rate(dash_errors_total[5m]) / rate(dash_requests_total[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          
      - alert: DashBudgetExceeded
        expr: dash_budget_used_percent > 90
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Budget exceeded"
          
      - alert: DashAgentsStuck
        expr: dash_agents_active > 0 and rate(dash_agent_completions_total[10m]) == 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Agents may be stuck"
```

### Log Aggregation with Loki

```yaml
# monitoring/loki-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 168h

storage_config:
  boltdb:
    directory: /tmp/loki/index
  filesystem:
    directory: /tmp/loki/chunks
```

### Distributed Tracing

```yaml
# jaeger deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
    spec:
      containers:
        - name: jaeger
          image: jaegertracing/all-in-one:1.45
          ports:
            - containerPort: 16686  # UI
            - containerPort: 14268  # Collector
```

### Uptime Monitoring

```yaml
# blackbox exporter for uptime checks
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_status_codes: [200, 301, 302]
      method: GET
```

---

**Next Steps:**
- [Architecture Overview](ARCHITECTURE.md) - System design
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [Contributing](CONTRIBUTING.md) - Development setup
