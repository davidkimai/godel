# Multi-Region Deployment Example

Deploy Dash across multiple regions for high availability and geographic distribution.

## Overview

This example demonstrates deploying Dash in a multi-region configuration with:
- Primary and secondary regions
- Database replication
- Cross-region failover
- Geographic load balancing

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Global Load Balancer                            │
│                         (Cloudflare / AWS ALB / etc)                        │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
              ▼                                       ▼
┌─────────────────────────────┐         ┌─────────────────────────────┐
│     US-East (Primary)       │         │    EU-West (Secondary)      │
│  ┌─────────────────────┐    │         │  ┌─────────────────────┐    │
│  │   Dash API Nodes    │    │         │  │   Dash API Nodes    │    │
│  │  ┌─────┐  ┌─────┐   │    │         │  │  ┌─────┐  ┌─────┐   │    │
│  │  │Node1│  │Node2│   │    │         │  │  │Node1│  │Node2│   │    │
│  │  └──┬──┘  └──┬──┘   │    │         │  │  └──┬──┘  └──┬──┘   │    │
│  └─────┼────────┼──────┘    │         │  └─────┼────────┼──────┘    │
│        │        │           │         │        │        │           │
│  ┌─────┴────────┴──────┐    │         │  ┌─────┴────────┴──────┐    │
│  │   PostgreSQL        │    │         │  │   PostgreSQL        │    │
│  │   (Primary)         │◀───┼─────────┼──┼──▶(Read Replica)    │    │
│  └─────────────────────┘    │  Replication   └─────────────────────┘    │
│                             │         │                             │
│  ┌─────────────────────┐    │         │  ┌─────────────────────┐    │
│  │   Redis Cluster     │◀───┼─────────┼──┼──▶Redis Cluster     │    │
│  │   (Master)          │    │  Pub/Sub     │   (Replica)       │    │
│  └─────────────────────┘    │         │  └─────────────────────┘    │
└─────────────────────────────┘         └─────────────────────────────┘
```

## Files

- `terraform/` - Infrastructure as Code
- `k8s/` - Kubernetes manifests for each region
- `docker-compose/` - Docker Compose for each region
- `scripts/` - Deployment and failover scripts
- `config/` - Regional configuration files

## Prerequisites

- Cloud provider accounts (AWS/GCP/Azure)
- Terraform 1.5+
- kubectl configured
- Docker and Docker Compose

## Quick Start

### 1. Deploy Primary Region (US-East)

```bash
cd terraform/us-east
terraform init
terraform apply

# Get outputs
export PRIMARY_DB_URL=$(terraform output database_url)
export PRIMARY_REDIS_URL=$(terraform output redis_url)
```

### 2. Deploy Secondary Region (EU-West)

```bash
cd terraform/eu-west
terraform init
terraform apply

export SECONDARY_DB_URL=$(terraform output database_url)
export SECONDARY_REDIS_URL=$(terraform output redis_url)
```

### 3. Configure Replication

```bash
# Set up PostgreSQL logical replication
./scripts/setup-replication.sh \
  --primary "$PRIMARY_DB_URL" \
  --replica "$SECONDARY_DB_URL"

# Configure Redis cross-region cluster
./scripts/setup-redis-cluster.sh \
  --primary "$PRIMARY_REDIS_URL" \
  --replica "$SECONDARY_REDIS_URL"
```

### 4. Deploy Application

```bash
# Deploy to primary
kubectl apply -f k8s/us-east/

# Deploy to secondary
kubectl apply -f k8s/eu-west/
```

## Terraform Configuration

### Primary Region (US-East)

```hcl
# terraform/us-east/main.tf
provider "aws" {
  region = "us-east-1"
}

module "dash_primary" {
  source = "../modules/dash-region"
  
  region = "us-east-1"
  
  # Database
  db_instance_class = "db.r6g.xlarge"
  db_multi_az       = true
  
  # Redis
  redis_node_type = "cache.r6g.large"
  
  # EKS
  eks_cluster_version = "1.29"
  eks_node_instance_types = ["m6i.xlarge"]
  eks_min_size = 3
  eks_max_size = 10
  
  # Tags
  tags = {
    Environment = "production"
    Region = "primary"
  }
}

output "database_url" {
  value = module.dash_primary.database_url
  sensitive = true
}

output "redis_url" {
  value = module.dash_primary.redis_url
  sensitive = true
}
```

### Secondary Region (EU-West)

```hcl
# terraform/eu-west/main.tf
provider "aws" {
  region = "eu-west-1"
}

module "dash_secondary" {
  source = "../modules/dash-region"
  
  region = "eu-west-1"
  
  # Database (read replica)
  db_instance_class = "db.r6g.large"
  db_replica_of     = "arn:aws:rds:us-east-1:..."
  
  # Redis
  redis_node_type = "cache.r6g.large"
  
  # EKS
  eks_cluster_version = "1.29"
  eks_node_instance_types = ["m6i.large"]
  eks_min_size = 2
  eks_max_size = 6
  
  tags = {
    Environment = "production"
    Region = "secondary"
  }
}
```

## Kubernetes Configuration

### Primary Region

```yaml
# k8s/us-east/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dash-config
  namespace: dash
data:
  DASH_REGION: "us-east-1"
  DASH_ROLE: "primary"
  DASH_LOG_LEVEL: "info"
  DATABASE_URL: "postgresql://..."
  REDIS_URL: "redis://..."
  
  # Replication settings
  DASH_ENABLE_REPLICATION: "true"
  DASH_REPLICA_REGIONS: "eu-west-1"
```

```yaml
# k8s/us-east/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dash-api
  namespace: dash
spec:
  replicas: 5
  template:
    spec:
      containers:
        - name: dash
          image: dashai/dash:latest
          envFrom:
            - configMapRef:
                name: dash-config
            - secretRef:
                name: dash-secrets
          resources:
            requests:
              memory: "1Gi"
              cpu: "1000m"
            limits:
              memory: "4Gi"
              cpu: "4000m"
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - dash-api
                topologyKey: topology.kubernetes.io/zone
```

### Secondary Region

```yaml
# k8s/eu-west/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dash-config
  namespace: dash
data:
  DASH_REGION: "eu-west-1"
  DASH_ROLE: "secondary"
  DASH_PRIMARY_REGION: "us-east-1"
  DATABASE_URL: "postgresql://..."  # Read replica
  REDIS_URL: "redis://..."
  
  # Failover settings
  DASH_FAILOVER_ENABLED: "true"
  DASH_FAILOVER_TIMEOUT: "30"
```

```yaml
# k8s/eu-west/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dash-api
  namespace: dash
spec:
  replicas: 3  # Fewer replicas in secondary
  template:
    spec:
      containers:
        - name: dash
          image: dashai/dash:latest
          envFrom:
            - configMapRef:
                name: dash-config
            - secretRef:
                name: dash-secrets
```

## Failover Procedures

### Automated Failover

```bash
# Check health of primary
./scripts/check-health.sh us-east-1

# If primary is unhealthy, promote secondary
./scripts/failover.sh \
  --from us-east-1 \
  --to eu-west-1
```

### Manual Failover

```bash
# 1. Stop writes to primary
kubectl exec -n dash deployment/dash-api -- dash admin maintenance on

# 2. Promote read replica to primary
aws rds promote-read-replica \
  --db-instance-identifier dash-eu-west-1

# 3. Update DNS/load balancer
./scripts/update-dns.sh --primary eu-west-1

# 4. Verify failover
./scripts/verify-failover.sh eu-west-1
```

### Failback to Primary

```bash
# When primary region recovers
./scripts/failback.sh \
  --primary us-east-1 \
  --secondary eu-west-1
```

## Monitoring

### Regional Health Dashboard

```yaml
# monitoring/dashboard-regions.json
{
  "dashboard": {
    "title": "Multi-Region Health",
    "panels": [
      {
        "title": "Active Agents by Region",
        "targets": [
          {
            "expr": "sum by (region) (dash_agents_active)",
            "legendFormat": "{{region}}"
          }
        ]
      },
      {
        "title": "Replication Lag",
        "targets": [
          {
            "expr": "dash_replication_lag_seconds",
            "legendFormat": "{{source_region}} -> {{target_region}}"
          }
        ]
      }
    ]
  }
}
```

### Alerts

```yaml
# monitoring/alerts.yaml
groups:
  - name: multi-region
    rules:
      - alert: RegionDown
        expr: up{job="dash-api"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Dash region {{ $labels.region }} is down"
          
      - alert: ReplicationLagHigh
        expr: dash_replication_lag_seconds > 30
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High replication lag detected"
          
      - alert: FailoverRequired
        expr: dash_primary_health < 0.5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Primary region unhealthy - failover recommended"
```

## Scripts

### Setup Replication

```bash
#!/bin/bash
# scripts/setup-replication.sh

set -e

PRIMARY=""
REPLICA=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --primary) PRIMARY="$2"; shift 2 ;;
    --replica) REPLICA="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "Setting up replication from $PRIMARY to $REPLICA"

# Create publication on primary
psql "$PRIMARY" -c "CREATE PUBLICATION dash_pub FOR ALL TABLES;"

# Create subscription on replica
psql "$REPLICA" -c "CREATE SUBSCRIPTION dash_sub CONNECTION '$PRIMARY' PUBLICATION dash_pub;"

echo "Replication configured successfully"
```

### Check Health

```bash
#!/bin/bash
# scripts/check-health.sh

REGION=$1

HEALTH=$(curl -sf "https://dash-$REGION.example.com/health" || echo "unhealthy")
LAG=$(psql "$DATABASE_URL" -t -c "SELECT extract(epoch from now() - pg_last_xact_replay_timestamp());" 2>/dev/null || echo "null")

echo "{
  \"region\": \"$REGION\",
  \"health\": \"$HEALTH\",
  \"replication_lag_seconds\": $LAG
}"
```

## Cost Optimization

### Right-Sizing Secondary

```yaml
# Secondary region uses smaller instances
primary:
  eks:
    instance_type: m6i.xlarge
    min_size: 3
    max_size: 10
  
secondary:
  eks:
    instance_type: m6i.large
    min_size: 2
    max_size: 5
```

### Scheduled Scaling

```yaml
# Scale down secondary during low traffic
apiVersion: batch/v1
kind: CronJob
metadata:
  name: scale-secondary
spec:
  schedule: "0 2 * * *"  # 2 AM UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: scaler
              image: bitnami/kubectl
              command:
                - kubectl
                - scale
                - deployment/dash-api
                - --replicas=1
                - -n
                - dash
          restartPolicy: OnFailure
```

## Testing Failover

```bash
# Run chaos engineering tests
./scripts/chaos-test.sh \
  --region us-east-1 \
  --scenario network-partition \
  --duration 300

# Verify automatic recovery
./scripts/verify-recovery.sh
```

## Next Steps

- Review [Architecture](../../docs/ARCHITECTURE.md)
- Learn about [Monitoring](../../docs/DEPLOYMENT.md#monitoring-setup)
- See [Troubleshooting](../../docs/TROUBLESHOOTING.md)
