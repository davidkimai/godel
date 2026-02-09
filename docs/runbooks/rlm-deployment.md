# RLM Hypervisor Deployment Runbook

Production deployment procedures for RLM Hypervisor GA.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Application Deployment](#application-deployment)
4. [Post-Deployment Validation](#post-deployment-validation)
5. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### 1. Environment Verification

```bash
# Verify target environment
kubectl config current-context  # Should be production cluster
kubectl get nodes  # Verify node health

# Check resource availability
kubectl describe nodes | grep -A 5 "Allocated resources"
```

### 2. Version Verification

```bash
# Verify deployment version
export DEPLOY_VERSION=$(cat VERSION)
echo "Deploying version: $DEPLOY_VERSION"

# Verify container image exists
docker pull rlm-hypervisor:$DEPLOY_VERSION
```

### 3. Configuration Review

```bash
# Validate configuration files
./scripts/validate-config.sh production

# Check secrets are in place
kubectl get secrets -n rlm-production
```

### 4. Database Migrations

```bash
# Check pending migrations
npm run migrate:status -- --env production

# Review migration plan
npm run migrate:plan -- --env production
```

---

## Infrastructure Setup

### 1. Namespace Creation

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: rlm-production
  labels:
    environment: production
    app: rlm-hypervisor
EOF
```

### 2. Resource Quotas

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ResourceQuota
metadata:
  name: rlm-quota
  namespace: rlm-production
spec:
  hard:
    requests.cpu: "100"
    requests.memory: 500Gi
    limits.cpu: "200"
    limits.memory: 800Gi
    pods: "500"
EOF
```

### 3. Network Policies

```bash
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: rlm-network-policy
  namespace: rlm-production
spec:
  podSelector:
    matchLabels:
      app: rlm-hypervisor
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443
EOF
```

---

## Application Deployment

### 1. Deploy Core Services

```bash
#!/bin/bash
# deploy-core.sh

set -e

VERSION=${1:-latest}
NAMESPACE="rlm-production"

echo "=== Deploying RLM Hypervisor Core Services ==="
echo "Version: $VERSION"
echo "Namespace: $NAMESPACE"

# Apply ConfigMaps
echo "Applying ConfigMaps..."
kubectl apply -f k8s/production/configmap.yaml -n $NAMESPACE

# Apply Secrets
echo "Applying Secrets..."
kubectl apply -f k8s/production/secrets.yaml -n $NAMESPACE

# Deploy API Server
echo "Deploying API Server..."
kubectl set image deployment/rlm-api \
  rlm-api=rlm-hypervisor/api:$VERSION \
  -n $NAMESPACE

# Deploy OOLONG Executor
echo "Deploying OOLONG Executor..."
kubectl set image deployment/rlm-oolong \
  rlm-oolong=rlm-hypervisor/oolong:$VERSION \
  -n $NAMESPACE

# Deploy Quota Manager
echo "Deploying Quota Manager..."
kubectl set image deployment/rlm-quota \
  rlm-quota=rlm-hypervisor/quota:$VERSION \
  -n $NAMESPACE

# Deploy Storage Connectors
echo "Deploying Storage Connectors..."
kubectl set image deployment/rlm-storage \
  rlm-storage=rlm-hypervisor/storage:$VERSION \
  -n $NAMESPACE

echo "=== Core Services Deployed ==="
```

### 2. Rolling Update Strategy

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rlm-api
  namespace: rlm-production
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: rlm-api
  template:
    metadata:
      labels:
        app: rlm-api
    spec:
      containers:
      - name: rlm-api
        image: rlm-hypervisor/api:latest
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

### 3. Service Deployment

```bash
# Expose services
kubectl apply -f k8s/production/services.yaml

# Verify endpoints
kubectl get endpoints -n rlm-production
```

### 4. Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rlm-ingress
  namespace: rlm-production
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "1000"
spec:
  tls:
  - hosts:
    - api.rlm-hypervisor.io
    secretName: rlm-tls-secret
  rules:
  - host: api.rlm-hypervisor.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: rlm-api
            port:
              number: 8080
```

---

## Post-Deployment Validation

### 1. Health Checks

```bash
#!/bin/bash
# validate-deployment.sh

NAMESPACE="rlm-production"

echo "=== Validating Deployment ==="

# Check pod status
echo "Checking pod status..."
kubectl get pods -n $NAMESPACE

# Wait for all pods to be ready
echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=rlm-api -n $NAMESPACE --timeout=300s

# Check service endpoints
echo "Checking service endpoints..."
kubectl get endpoints -n $NAMESPACE

# Verify ingress
echo "Verifying ingress..."
kubectl get ingress -n $NAMESPACE

# Test health endpoint
echo "Testing health endpoint..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.rlm-hypervisor.io/health)
if [ "$HTTP_STATUS" == "200" ]; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed: $HTTP_STATUS"
    exit 1
fi

echo "=== Validation Complete ==="
```

### 2. Smoke Tests

```bash
#!/bin/bash
# smoke-tests.sh

API_URL="https://api.rlm-hypervisor.io"
API_KEY="$RLM_SMOKE_TEST_API_KEY"

echo "=== Running Smoke Tests ==="

# Test 1: Basic execution
echo "Test 1: Basic task execution..."
curl -X POST $API_URL/v1/execute \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sequential",
    "description": "Smoke test",
    "input": {"items": [1,2,3], "operation": "sum"}
  }' | jq '.success' | grep -q "true" && echo "✓ Test 1 passed"

# Test 2: Quota check
echo "Test 2: Quota endpoint..."
curl -s $API_URL/v1/quotas/user/smoke-test-user \
  -H "Authorization: Bearer $API_KEY" | jq '.daily' > /dev/null && echo "✓ Test 2 passed"

# Test 3: Storage access
echo "Test 3: Storage endpoint..."
curl -s $API_URL/v1/storage/health \
  -H "Authorization: Bearer $API_KEY" | jq '.status' | grep -q "healthy" && echo "✓ Test 3 passed"

echo "=== Smoke Tests Complete ==="
```

### 3. Load Test (Canary)

```bash
#!/bin/bash
# canary-load-test.sh

DURATION_MINUTES=10
CONCURRENT_REQUESTS=50

echo "=== Running Canary Load Test ($DURATION_MINUTES minutes) ==="

# Start load test in background
curl -X POST $API_URL/v1/admin/load-test \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d "{
    \"durationMinutes\": $DURATION_MINUTES,
    \"concurrentRequests\": $CONCURRENT_REQUESTS,
    \"rampUpSeconds\": 60
  }"

# Monitor metrics during test
echo "Monitoring metrics..."
for i in $(seq 1 $DURATION_MINUTES); do
    sleep 60
    
    # Check error rate
    ERROR_RATE=$(curl -s $API_URL/v1/metrics/error-rate)
    if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
        echo "✗ Error rate too high: $ERROR_RATE"
        exit 1
    fi
    
    # Check latency
    P99_LATENCY=$(curl -s $API_URL/v1/metrics/latency/p99)
    if (( $(echo "$P99_LATENCY > 1000" | bc -l) )); then
        echo "✗ P99 latency too high: ${P99_LATENCY}ms"
        exit 1
    fi
    
    echo "Minute $i: Error rate ${ERROR_RATE}, P99 ${P99_LATENCY}ms ✓"
done

echo "=== Canary Load Test Passed ==="
```

---

## Rollback Procedures

### 1. Immediate Rollback

```bash
#!/bin/bash
# rollback.sh

PREVIOUS_VERSION=${1:-"stable"}
NAMESPACE="rlm-production"

echo "=== Rolling back to $PREVIOUS_VERSION ==="

# Rollback deployments
kubectl rollout undo deployment/rlm-api -n $NAMESPACE
kubectl rollout undo deployment/rlm-oolong -n $NAMESPACE
kubectl rollout undo deployment/rlm-quota -n $NAMESPACE
kubectl rollout undo deployment/rlm-storage -n $NAMESPACE

# Wait for rollback to complete
echo "Waiting for rollback to complete..."
kubectl rollout status deployment/rlm-api -n $NAMESPACE --timeout=300s

# Verify rollback
echo "Verifying rollback..."
./scripts/validate-deployment.sh

echo "=== Rollback Complete ==="
```

### 2. Database Rollback

```bash
#!/bin/bash
# rollback-database.sh

BACKUP_ID=${1:-"pre-deploy"}

echo "=== Rolling back database ==="

# Stop application
echo "Stopping application..."
kubectl scale deployment/rlm-api --replicas=0 -n rlm-production

# Restore from backup
echo "Restoring from backup: $BACKUP_ID"
./scripts/restore-backup.sh $BACKUP_ID

# Verify database
echo "Verifying database integrity..."
npm run db:verify

# Restart application
echo "Restarting application..."
kubectl scale deployment/rlm-api --replicas=5 -n rlm-production

echo "=== Database Rollback Complete ==="
```

### 3. Emergency Procedures

```bash
# If complete system failure:

# 1. Enable maintenance mode
kubectl apply -f k8s/production/maintenance-mode.yaml

# 2. Scale down all services
kubectl scale deployment --all --replicas=0 -n rlm-production

# 3. Restore from last known good state
./scripts/restore-full-backup.sh

# 4. Gradually scale up
kubectl scale deployment rlm-api --replicas=1 -n rlm-production
sleep 30
kubectl scale deployment rlm-api --replicas=3 -n rlm-production
sleep 30
kubectl scale deployment rlm-api --replicas=5 -n rlm-production

# 5. Disable maintenance mode
kubectl delete -f k8s/production/maintenance-mode.yaml
```

---

## Deployment Checklist

- [ ] Pre-deployment checklist complete
- [ ] Database backups verified
- [ ] Rollback plan documented and tested
- [ ] Team notified of deployment window
- [ ] Monitoring dashboards accessible
- [ ] On-call engineer assigned
- [ ] Deployment executed
- [ ] Health checks passed
- [ ] Smoke tests passed
- [ ] Canary load test passed
- [ ] Traffic fully switched
- [ ] Old version scaled down
- [ ] Post-deployment monitoring for 24 hours

---

## Contact Information

- **Deployment Lead:** deploy-team@rlm-hypervisor.io
- **On-Call Engineer:** +1-800-RLM-HELP
- **Escalation:** sre-team@rlm-hypervisor.io
- **Emergency:** #rlm-incidents (Slack)
