# Deployment Guide

Production deployment options for Dash: Docker, Kubernetes, and cloud platforms.

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
git clone https://github.com/davidkimai/dash.git
cd dash

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
| `dash` | Main Dash application | 3000 |
| `postgres` | PostgreSQL database | 5432 |
| `redis` | Redis cache | 6379 |
| `grafana` | Monitoring dashboards | 3001 |
| `loki` | Log aggregation | 3100 |

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  dash:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/dash
      - REDIS_URL=redis://redis:6379
      - DASH_LOG_LEVEL=info
    volumes:
      - ./.dash:/app/.dash
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
      - POSTGRES_DB=dash
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
docker build -t my-dash:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -v $(pwd)/.dash:/app/.dash \
  my-dash:latest
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
RUN mkdir -p .dash/logs .claude-worktrees

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
RUN mkdir -p .dash/logs .claude-worktrees
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
  name: dash
```

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dash-config
  namespace: dash
data:
  DASH_LOG_LEVEL: "info"
  DASH_MAX_SWARMS: "10"
  DASH_MAX_CONCURRENT: "5"
```

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: dash-secrets
  namespace: dash
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:pass@postgres:5432/dash"
  REDIS_URL: "redis://redis:6379"
  OPENCLAW_GATEWAY_TOKEN: "your-token-here"
```

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dash-api
  namespace: dash
spec:
  replicas: 3
  selector:
    matchLabels:
      app: dash-api
  template:
    metadata:
      labels:
        app: dash-api
    spec:
      containers:
        - name: dash
          image: dashai/dash:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: dash-config
            - secretRef:
                name: dash-secrets
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
            - name: dash-data
              mountPath: /app/.dash
            - name: worktrees
              mountPath: /app/.claude-worktrees
      volumes:
        - name: dash-data
          persistentVolumeClaim:
            claimName: dash-data-pvc
        - name: worktrees
          emptyDir: {}
```

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: dash-api
  namespace: dash
spec:
  selector:
    app: dash-api
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
  name: dash-ingress
  namespace: dash
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt
spec:
  tls:
    - hosts:
        - dash.yourdomain.com
      secretName: dash-tls
  rules:
    - host: dash.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: dash-api
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
  namespace: dash
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
              value: dash
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: password
            - name: POSTGRES_DB
              value: dash
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
  namespace: dash
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
  namespace: dash
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
kubectl get pods -n dash
kubectl get svc -n dash
kubectl get ingress -n dash
```

### Helm Chart

```bash
# Add Dash Helm repository
helm repo add dash https://charts.dash-ai.io
helm repo update

# Install with default values
helm install dash dash/dash

# Install with custom values
helm install dash dash/dash -f values.yaml

# Upgrade
helm upgrade dash dash/dash
```

Example `values.yaml`:

```yaml
replicaCount: 3

image:
  repository: dashai/dash
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: dash.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: dash-tls
      hosts:
        - dash.yourdomain.com

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
    username: dash
    database: dash
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
  DASH_LOG_LEVEL: warn
  
  # Performance
  DASH_MAX_SWARMS: 20
  DASH_MAX_CONCURRENT: 10
  
  # Security
  DASH_SANDBOX_ENABLED: "true"
  DASH_REQUIRE_APPROVAL: "true"
  
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
      - job_name: 'dash-api'
        static_configs:
          - targets: ['dash-api.dash.svc.cluster.local:3000']
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
| `dash_swarms_active` | Number of active swarms | > 80% of max |
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
  -d @monitoring/dashboards/dash-overview.json
```

### Alerting Rules

```yaml
# monitoring/alert-rules.yaml
groups:
  - name: dash
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
