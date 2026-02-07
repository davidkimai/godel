# Runbook: Godel Deployment

**Purpose:** Step-by-step deployment procedures for Godel  
**Scope:** Docker, Kubernetes, and production deployments  
**Last Updated:** 2026-02-06

---

## Prerequisites

- Access to target environment
- Docker and/or kubectl installed
- Environment variables configured
- Database and Redis accessible

---

## 1. Docker Deployment

### 1.1 Pre-Deployment Checklist

- [ ] `.env` file created with production values
- [ ] Database is running and accessible
- [ ] Redis is running and accessible
- [ ] Ports 7373 (API) and 7374 (WebSocket) are available
- [ ] Sufficient disk space (>10GB)

### 1.2 Deploy with Docker Compose

```bash
# 1. Navigate to project directory
cd /path/to/godel

# 2. Verify environment
cat .env | grep -E "^(GODEL_|DATABASE_URL|REDIS_URL)"

# 3. Pull latest images
docker-compose pull

# 4. Start services
docker-compose up -d

# 5. Verify deployment
docker-compose ps
docker-compose logs -f godel

# 6. Health check
curl http://localhost:7373/health
```

### 1.3 Scale OpenClaw Instances

```bash
# Scale to 10 instances
docker-compose up -d --scale openclaw=10

# Verify scaling
docker-compose ps | grep openclaw
```

### 1.4 Rollback Procedure

```bash
# 1. Stop current deployment
docker-compose down

# 2. Restore from backup (if needed)
docker-compose -f docker-compose.backup.yml up -d

# 3. Or revert to previous image
docker-compose pull godel:previous-tag
docker-compose up -d
```

---

## 2. Kubernetes Deployment

### 2.1 Pre-Deployment Checklist

- [ ] kubectl configured for target cluster
- [ ] Namespace created
- [ ] Secrets created in Kubernetes
- [ ] Storage class available (for PostgreSQL)
- [ ] Ingress controller installed

### 2.2 Deploy with kubectl

```bash
# 1. Set context
kubectl config use-context production

# 2. Create namespace
kubectl create namespace godel

# 3. Create secrets
kubectl create secret generic godel-secrets \
  --from-literal=GODEL_API_KEY="$(openssl rand -hex 32)" \
  --from-literal=GODEL_JWT_SECRET="$(openssl rand -base64 64)" \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=REDIS_URL="redis://..." \
  -n godel

# 4. Apply manifests
kubectl apply -f k8s/ -n godel

# 5. Verify deployment
kubectl get pods -n godel
kubectl get svc -n godel

# 6. Check logs
kubectl logs -f deployment/godel -n godel
```

### 2.3 Deploy with Helm

```bash
# 1. Add Helm repository (if using chart repo)
helm repo add godel https://charts.godel.io
helm repo update

# 2. Install with custom values
helm install godel ./helm/godel \
  --namespace godel \
  --create-namespace \
  --values values.production.yaml

# 3. Verify installation
helm list -n godel
kubectl get pods -n godel

# 4. Upgrade (when needed)
helm upgrade godel ./helm/godel -n godel -f values.production.yaml
```

### 2.4 Rollback Procedure

```bash
# Rollback Helm release
helm rollback godel 1 -n godel

# Or rollback deployment
kubectl rollout undo deployment/godel -n godel

# Verify rollback
kubectl rollout status deployment/godel -n godel
```

---

## 3. Production Deployment Checklist

### 3.1 Security

- [ ] Strong secrets generated (not placeholder values)
- [ ] TLS certificates configured
- [ ] Network policies applied
- [ ] RBAC configured
- [ ] Pod security standards enforced

### 3.2 Monitoring

- [ ] Prometheus scraping configured
- [ ] Grafana dashboards imported
- [ ] Alertmanager rules applied
- [ ] Log aggregation configured

### 3.3 Backup

- [ ] Database backup schedule configured
- [ ] Backup retention policy set
- [ ] Restore procedure tested
- [ ] Disaster recovery plan documented

### 3.4 Performance

- [ ] Resource limits configured
- [ ] HPA (Horizontal Pod Autoscaler) configured
- [ ] Resource quotas applied
- [ ] Load testing completed

---

## 4. Post-Deployment Verification

### 4.1 Health Checks

```bash
# API health
curl -s http://localhost:7373/health | jq

# Ready probe
curl -s http://localhost:7373/health/ready | jq

# Live probe
curl -s http://localhost:7373/health/live | jq
```

### 4.2 Functional Tests

```bash
# 1. Authentication test
curl -X POST http://localhost:7373/api/v1/auth/token \
  -H "Authorization: Bearer $API_KEY"

# 2. Create test agent
curl -X POST http://localhost:7373/api/v1/agents \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"role": "worker", "model": "claude-sonnet-4"}'

# 3. Test intent interface
godel do "Hello, verify deployment"
```

### 4.3 Monitoring Verification

```bash
# Check metrics endpoint
curl -s http://localhost:7373/metrics | grep godel_agents

# Verify logs
kubectl logs -f deployment/godel -n godel | grep "Server started"
```

---

## 5. Troubleshooting

### 5.1 Pod Not Starting

```bash
# Check events
kubectl get events -n godel --sort-by=.lastTimestamp

# Check pod details
kubectl describe pod <pod-name> -n godel

# Check logs
kubectl logs <pod-name> -n godel --previous
```

### 5.2 Database Connection Issues

```bash
# Test connection from pod
kubectl exec -it deployment/godel -n godel -- \
  pg_isready -h postgres -p 5432

# Check secret
kubectl get secret godel-secrets -n godel -o jsonpath='{.data.DATABASE_URL}' | base64 -d
```

### 5.3 High Memory Usage

```bash
# Check resource usage
kubectl top pods -n godel

# Check for memory leaks
kubectl logs -f deployment/godel -n godel | grep "memory"

# Restart if needed
kubectl rollout restart deployment/godel -n godel
```

---

## 6. Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| On-call Engineer | oncall@godel.io | +1 hour |
| Engineering Lead | eng-lead@godel.io | +4 hours |
| DevOps Lead | devops@godel.io | +8 hours |

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-02-06  
**Next Review:** 2026-03-06
