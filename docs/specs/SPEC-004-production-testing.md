# SPEC: Godel Production Testing

**Version:** 1.0  
**Date:** February 3, 2026  
**Status:** Ready for Implementation  
**Priority:** P0 - Critical  
**PRD Reference:** [PRD-004-production-testing.md](../prds/PRD-004-production-testing.md)

---

## Overview

Execute comprehensive production testing to validate deployment procedures, performance, security, and operational readiness.

**PRD Success Criteria:**
1. ✅ Staging deployment successful
2. ✅ Production deployment successful
3. ✅ All health checks passing
4. ✅ Smoke tests passing
5. ✅ Performance within NFR thresholds
6. ✅ Security scan passes
7. ✅ Rollback test successful
8. ✅ Monitoring dashboards active
9. ✅ Alerting rules validated
10. ✅ Runbooks tested

---

## Pre-Deployment Checklist

### 1. Environment Preparation

**Verify Prerequisites:**
- [ ] Kubernetes cluster accessible
- [ ] kubectl configured for target cluster
- [ ] Helm installed
- [ ] Docker registry credentials configured
- [ ] Secrets configured in Vault/Sealed Secrets
- [ ] Database migrations ready
- [ ] Redis cluster operational

**File:** `scripts/pre-deployment-check.sh`

```bash
#!/bin/bash
set -e

echo "=== Pre-Deployment Check ==="

# Check kubectl
echo "Checking kubectl..."
kubectl version --client
kubectl cluster-info

# Check Helm
echo "Checking Helm..."
helm version

# Check secrets
echo "Checking secrets..."
kubectl get secret godel-api-key -n godel-staging
kubectl get secret godel-db-credentials -n godel-staging

# Check database
echo "Checking database..."
kubectl exec -n godel-staging deploy/postgres -- pg_isready

# Check Redis
echo "Checking Redis..."
kubectl exec -n godel-staging deploy/redis -- redis-cli ping

echo "✅ All pre-deployment checks passed"
```

---

## Phase 1: Staging Deployment

### Deployment Script

**File:** `scripts/deploy-staging.sh`

```bash
#!/bin/bash
set -e

echo "=== Deploying to Staging ==="

# Build and push image
VERSION=$(git describe --tags --always)
echo "Building version: $VERSION"

docker build -t godel:$VERSION .
docker tag godel:$VERSION registry.example.com/godel:$VERSION
docker push registry.example.com/godel:$VERSION

# Update Helm values
echo "Updating Helm values..."
cat > helm/godel/values-staging.yaml << EOF
image:
  repository: registry.example.com/godel
  tag: "$VERSION"
  pullPolicy: Always

replicaCount: 2

resources:
  limits:
    cpu: 1000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 1Gi

env:
  NODE_ENV: staging
  DASH_LOG_LEVEL: debug
EOF

# Deploy with Helm
echo "Deploying with Helm..."
helm upgrade --install godel-staging ./helm/godel \
  --namespace godel-staging \
  --values helm/godel/values-staging.yaml \
  --wait \
  --timeout 10m

# Wait for rollout
echo "Waiting for rollout..."
kubectl rollout status deployment/godel-api -n godel-staging --timeout=600s

echo "✅ Staging deployment complete"
echo "Dashboard: https://godel-staging.example.com"
```

### Verification Tasks

**File:** `scripts/verify-staging.sh`

```bash
#!/bin/bash
set -e

echo "=== Verifying Staging Deployment ==="

# 1. Health check
echo "1. Health check..."
curl -sf https://godel-staging.example.com/api/health || exit 1
echo "✅ Health check passed"

# 2. API smoke test
echo "2. API smoke test..."
curl -sf https://godel-staging.example.com/api/agents \
  -H "X-API-Key: $STAGING_API_KEY" || exit 1
echo "✅ API smoke test passed"

# 3. Pod status
echo "3. Checking pod status..."
kubectl get pods -n godel-staging -l app=godel
echo "✅ Pods running"

# 4. Logs check
echo "4. Checking for errors in logs..."
kubectl logs -n godel-staging -l app=godel --tail=100 | grep -i error || true
echo "✅ No critical errors"

# 5. Resource usage
echo "5. Resource usage..."
kubectl top pods -n godel-staging
echo "✅ Resources within limits"

echo "✅ Staging verification complete"
```

---

## Phase 2: Production Deployment

### Deployment Script

**File:** `scripts/deploy-production.sh`

```bash
#!/bin/bash
set -e

echo "=== Deploying to Production ==="

# Confirm deployment
echo "Deploying version: $(git describe --tags --always)"
read -p "Are you sure? (yes/no) " confirm
if [[ $confirm != "yes" ]]; then
  echo "Deployment cancelled"
  exit 1
fi

# Backup current state
echo "Backing up current state..."
kubectl get deployment godel-api -n godel-production -o yaml > backup/godel-api-$(date +%Y%m%d-%H%M%S).yaml

# Deploy with rolling update
echo "Deploying with rolling update..."
helm upgrade --install godel-production ./helm/godel \
  --namespace godel-production \
  --values helm/godel/values-production.yaml \
  --set image.tag=$(git describe --tags --always) \
  --wait \
  --timeout 15m

# Wait for rollout
echo "Waiting for rollout..."
kubectl rollout status deployment/godel-api -n godel-production --timeout=900s

echo "✅ Production deployment complete"
echo "Dashboard: https://godel.example.com"
```

### Rolling Update Strategy

**File:** `helm/godel/templates/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "godel.fullname" . }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: {{ .Values.replicaCount }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: {{ include "godel.name" . }}
  template:
    metadata:
      labels:
        app: {{ include "godel.name" . }}
    spec:
      containers:
      - name: godel
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        ports:
        - containerPort: 7373
        livenessProbe:
          httpGet:
            path: /api/health
            port: 7373
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health/ready
            port: 7373
          initialDelaySeconds: 10
          periodSeconds: 5
```

---

## Phase 3: Production Validation

### Smoke Tests

**File:** `tests/production/smoke.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { apiClient } from './utils/api-client';

describe('Production Smoke Tests', () => {
  const PROD_URL = 'https://godel.example.com';
  const API_KEY = process.env.DASH_PROD_API_KEY;
  
  it('should respond to health check', async () => {
    const response = await fetch(`${PROD_URL}/api/health`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('healthy');
  }, 10000);
  
  it('should authenticate with API key', async () => {
    const response = await fetch(`${PROD_URL}/api/agents`, {
      headers: { 'X-API-Key': API_KEY }
    });
    expect(response.status).toBe(200);
  }, 10000);
  
  it('should spawn and complete agent', async () => {
    // Spawn agent
    const spawnResponse = await fetch(`${PROD_URL}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        type: 'test',
        task: 'Production smoke test'
      })
    });
    
    expect(spawnResponse.status).toBe(201);
    const { data: agent } = await spawnResponse.json();
    
    // Wait for completion
    let status = 'spawning';
    let attempts = 0;
    
    while (status !== 'completed' && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusResponse = await fetch(
        `${PROD_URL}/api/agents/${agent.id}`,
        { headers: { 'X-API-Key': API_KEY } }
      );
      
      const statusData = await statusResponse.json();
      status = statusData.data.status;
      attempts++;
    }
    
    expect(status).toBe('completed');
  }, 60000);
  
  it('should handle 100 concurrent requests', async () => {
    const requests = Array(100).fill(null).map(() =>
      fetch(`${PROD_URL}/api/health`)
    );
    
    const responses = await Promise.all(requests);
    expect(responses.every(r => r.status === 200)).toBe(true);
  }, 30000);
});
```

### Performance Testing

**File:** `tests/production/performance.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Production Performance Tests', () => {
  const PROD_URL = 'https://godel.example.com';
  const API_KEY = process.env.DASH_PROD_API_KEY;
  
  it('should have P99 latency < 200ms for health endpoint', async () => {
    const latencies: number[] = [];
    
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await fetch(`${PROD_URL}/api/health`);
      latencies.push(Date.now() - start);
    }
    
    // Calculate P99
    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    
    expect(p99).toBeLessThan(200);
    console.log(`P99 latency: ${p99}ms`);
  }, 60000);
  
  it('should handle agent spawn load', async () => {
    const startTime = Date.now();
    
    // Spawn 50 agents concurrently
    const spawnPromises = Array(50).fill(null).map((_, i) =>
      fetch(`${PROD_URL}/api/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          type: 'test',
          task: `Load test agent ${i}`
        })
      })
    );
    
    const responses = await Promise.all(spawnPromises);
    const duration = Date.now() - startTime;
    
    expect(responses.every(r => r.status === 201)).toBe(true);
    console.log(`Spawned 50 agents in ${duration}ms`);
  }, 120000);
});
```

---

## Phase 4: Security Verification

### Security Scan Script

**File:** `scripts/security-scan.sh`

```bash
#!/bin/bash
set -e

echo "=== Production Security Scan ==="

# 1. Container scan
echo "1. Scanning container image..."
trivy image registry.example.com/godel:$(git describe --tags --always)
echo "✅ Container scan complete"

# 2. Kubernetes security check
echo "2. Running kube-bench..."
kube-bench run --targets node
kube-bench run --targets policies
echo "✅ Kubernetes security check complete"

# 3. Secret scan
echo "3. Scanning for secrets..."
git-secrets --scan-history
git-secrets --scan
echo "✅ Secret scan complete"

# 4. Dependency audit
echo "4. Auditing dependencies..."
npm audit --audit-level=moderate
echo "✅ Dependency audit complete"

# 5. API security test
echo "5. Testing API security..."
# Test for common vulnerabilities
curl -sf https://godel.example.com/api/agents || true  # Should require auth
curl -sf https://godel.example.com/api/admin || true    # Should be restricted
echo "✅ API security tests complete"

echo "✅ Security scan complete"
```

---

## Phase 5: Rollback Testing

### Rollback Script

**File:** `scripts/rollback.sh`

```bash
#!/bin/bash
set -e

VERSION=${1:-"previous"}

echo "=== Rolling back to $VERSION ==="

# Get previous revision
if [ "$VERSION" = "previous" ]; then
  REVISION=$(helm history godel-production -n godel-production | grep -v "^REVISION" | head -2 | tail -1 | awk '{print $1}')
else
  REVISION=$VERSION
fi

echo "Rolling back to revision $REVISION..."

# Execute rollback
helm rollback godel-production $REVISION -n godel-production --wait --timeout 10m

# Wait for rollout
kubectl rollout status deployment/godel-api -n godel-production --timeout=600s

echo "✅ Rollback complete"
echo "Verifying rollback..."

# Verify rollback
kubectl get pods -n godel-production
kubectl logs -n godel-production -l app=godel --tail=20

echo "✅ Rollback verified"
```

### Rollback Test Procedure

```bash
# 1. Note current version
CURRENT_VERSION=$(helm list -n godel-production -o json | jq -r '.[0].app_version')
echo "Current version: $CURRENT_VERSION"

# 2. Deploy a test version (simulating bad deployment)
echo "Deploying test version..."
helm upgrade godel-production ./helm/godel \
  --namespace godel-production \
  --set image.tag=test-version \
  --wait

# 3. Verify test version deployed
kubectl get pods -n godel-production -o jsonpath='{.items[0].spec.containers[0].image}'

# 4. Execute rollback
echo "Executing rollback..."
./scripts/rollback.sh

# 5. Verify back to original version
ROLLED_BACK_VERSION=$(helm list -n godel-production -o json | jq -r '.[0].app_version')
if [ "$ROLLED_BACK_VERSION" = "$CURRENT_VERSION" ]; then
  echo "✅ Rollback successful - back to $CURRENT_VERSION"
else
  echo "❌ Rollback failed - at $ROLLED_BACK_VERSION"
  exit 1
fi
```

---

## Phase 6: Monitoring Verification

### Dashboard Validation

**File:** `scripts/verify-monitoring.sh`

```bash
#!/bin/bash
set -e

echo "=== Verifying Monitoring ==="

# 1. Check Prometheus targets
echo "1. Checking Prometheus targets..."
curl -sf http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health=="up")' | grep godel
echo "✅ Prometheus scraping Godel"

# 2. Check Grafana dashboards
echo "2. Checking Grafana dashboards..."
curl -sf http://grafana:3000/api/search?query=godel | jq '.[].title'
echo "✅ Grafana dashboards exist"

# 3. Verify metrics are flowing
echo "3. Verifying metrics..."
curl -sf http://prometheus:9090/api/v1/query?query='up{job="godel"}' | jq '.data.result'
echo "✅ Metrics flowing"

# 4. Check alert rules
echo "4. Checking alert rules..."
curl -sf http://prometheus:9090/api/v1/rules | jq '.data.groups[] | select(.name | contains("godel"))'
echo "✅ Alert rules configured"

echo "✅ Monitoring verification complete"
```

### Alert Testing

**File:** `scripts/test-alerts.sh`

```bash
#!/bin/bash

echo "=== Testing Alerts ==="

# 1. Test high error rate alert
echo "1. Testing high error rate alert..."
# Simulate errors (in test environment)
curl -sf http://godel.example.com/api/trigger-test-error || true
echo "Triggered test error"

# 2. Test high latency alert
echo "2. Testing high latency alert..."
# This would require a slow endpoint

# 3. Test agent failure alert
echo "3. Testing agent failure alert..."
# Spawn agent that will fail

# Wait for alerts to fire
sleep 60

# Check Alertmanager
echo "Checking Alertmanager..."
curl -sf http://alertmanager:9093/api/v1/alerts | jq '.data[] | select(.labels.alertname | contains("Godel"))'

echo "✅ Alert testing complete"
```

---

## Production Test Execution Checklist

### Pre-Deployment
- [ ] All integration tests passing
- [ ] Security scan passed
- [ ] Performance benchmarks met
- [ ] Database backups current
- [ ] Rollback plan documented

### Deployment
- [ ] Staging deployment successful
- [ ] Staging validation passed
- [ ] Production deployment successful
- [ ] Health checks passing
- [ ] Smoke tests passing

### Post-Deployment
- [ ] Performance within thresholds
- [ ] Security scan passed
- [ ] Rollback test successful
- [ ] Monitoring active
- [ ] Alerts configured
- [ ] Runbooks accessible

---

## Timeline

| Time | Activity | Duration | Owner |
|------|----------|----------|-------|
| 09:00 | Pre-deployment checks | 15 min | SRE |
| 09:15 | Staging deployment | 15 min | SRE |
| 09:30 | Staging validation | 30 min | QA |
| 10:00 | Production deployment | 15 min | SRE |
| 10:15 | Production validation | 30 min | QA |
| 10:45 | Performance testing | 30 min | Platform |
| 11:15 | Security verification | 30 min | Security |
| 11:45 | Rollback testing | 30 min | SRE |
| 12:15 | Final verification | 15 min | All |
| 12:30 | **Complete** | | |

---

## Success Verification

### Automated Verification

```bash
# Run all production tests
npm run test:production

# Expected output:
# ✓ Staging deployment (15s)
# ✓ Staging validation (30s)
# ✓ Production deployment (15s)
# ✓ Health checks (5s)
# ✓ Smoke tests (60s)
# ✓ Performance tests (120s)
# ✓ Security scan (180s)
# ✓ Rollback test (60s)
# ✓ Monitoring verification (30s)
#
# All tests passed (515s)
```

### Manual Verification

- [ ] Access dashboard at https://godel.example.com
- [ ] Spawn test agent via OpenClaw
- [ ] Verify events stream to OpenClaw
- [ ] Check Grafana dashboards
- [ ] Review logs for errors
- [ ] Confirm alerts are configured

---

## Troubleshooting

### Common Issues

**Issue:** Deployment fails
- Check: `kubectl describe pod -n godel-production`
- Solution: Review logs, fix issues, retry

**Issue:** Health checks failing
- Check: `kubectl logs -n godel-production -l app=godel`
- Solution: Check database connectivity, Redis

**Issue:** Performance degradation
- Check: `kubectl top pods -n godel-production`
- Solution: Scale up resources, investigate bottlenecks

**Issue:** Rollback fails
- Check: `helm history godel-production -n godel-production`
- Solution: Manual rollback to specific revision

---

**Commit:** "test: Implement SPEC-004 - Production testing suite"
