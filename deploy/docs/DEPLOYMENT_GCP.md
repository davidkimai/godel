# Godel Deployment Guide - Google Cloud Platform (GCP)

Complete guide for deploying Godel to Google Cloud Platform.

## Prerequisites

- gcloud CLI configured with appropriate credentials
- Terraform >= 1.5.0
- kubectl
- Helm >= 3.0

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        GCP Project                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                     VPC Network                        │  │
│  │  ┌─────────────────┐    ┌──────────────────────────┐   │  │
│  │  │  Cloud Load     │    │      GKE Cluster         │   │  │
│  │  │  Balancer       │◄───│  ┌──────────────────┐    │   │  │
│  │  └────────┬────────┘    │  │   Godel API      │    │   │  │
│  │           │             │  └──────────────────┘    │   │  │
│  │           │             │  ┌──────────────────┐    │   │  │
│  │           ▼             │  │   Dashboard      │    │   │  │
│  │      Internet           │  └──────────────────┘    │   │  │
│  │                         │           │              │   │  │
│  │                         │           ▼              │   │  │
│  │                         │  ┌──────────────────┐    │   │  │
│  │                         │  │  Cloud SQL       │    │   │  │
│  │                         │  │  (PostgreSQL)    │    │   │  │
│  │                         │  └──────────────────┘    │   │  │
│  │                         │  ┌──────────────────┐    │   │  │
│  │                         │  │  Memorystore     │    │   │  │
│  │                         │  │  (Redis)         │    │   │  │
│  │                         │  └──────────────────┘    │   │  │
│  │                         └──────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Deployment Steps

### 1. Set up GCP Project

```bash
# Set project ID
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1

gcloud config set project $GCP_PROJECT_ID
gcloud config set compute/region $GCP_REGION
```

### 2. Enable Required APIs

```bash
gcloud services enable container.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable servicenetworking.googleapis.com
```

### 3. Create Terraform State Bucket

```bash
gsutil mb -p $GCP_PROJECT_ID gs://godel-terraform-state
```

### 4. Initialize Terraform

```bash
cd deploy/terraform/gcp

# Initialize
cat > backend.tfvars <<EOF
bucket = "godel-terraform-state"
prefix = "gcp/terraform.tfstate"
EOF

terraform init -backend-config=backend.tfvars
```

### 5. Configure Variables

Create `terraform.tfvars`:

```hcl
gcp_project_id = "your-project-id"
gcp_region     = "us-central1"
environment    = "production"

# GKE Configuration
enable_autopilot = true  # Set to false for standard mode

# If using standard mode
machine_type = "e2-standard-4"
min_nodes    = 2
max_nodes    = 10

# Database
db_tier = "db-custom-4-16384"

# Redis
redis_memory_gb = 5
```

### 6. Deploy Infrastructure

```bash
# Plan and apply
terraform plan -out=tfplan
terraform apply tfplan
```

### 7. Configure kubectl

```bash
# Get credentials
gcloud container clusters get-credentials godel-production \
  --region $GCP_REGION \
  --project $GCP_PROJECT_ID

# Verify
kubectl get nodes
```

### 8. Deploy Godel

```bash
# Install ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace

# Create namespace and secrets
kubectl create namespace godel-production

# Create secrets from Terraform outputs
kubectl create secret generic godel-secrets \
  --namespace godel-production \
  --from-literal=GODEL_API_KEY=$(openssl rand -base64 32) \
  --from-literal=JWT_SECRET=$(openssl rand -base64 64)

# Connect to Cloud SQL using Cloud SQL Proxy
# https://cloud.google.com/sql/docs/mysql/connect-kubernetes-engine

# Deploy with Helm
helm upgrade --install godel deploy/helm/godel \
  --namespace godel-production \
  --values deploy/helm/godel/values-production.yaml \
  --set godelApi.image.repository=gcr.io/$GCP_PROJECT_ID/godel-api \
  --set godelApi.ingress.hosts[0].host=api.godel.dev \
  --set godelDashboard.ingress.hosts[0].host=dashboard.godel.dev
```

## Cloud SQL Connection

### Option 1: Cloud SQL Proxy (Recommended)

```bash
# Install Cloud SQL Proxy sidecar
helm upgrade --install godel deploy/helm/godel \
  --set godelApi.cloudSqlProxy.enabled=true \
  --set godelApi.cloudSqlProxy.instanceConnectionName=PROJECT:REGION:INSTANCE
```

### Option 2: Private IP

```bash
# Update values to use private IP
helm upgrade --install godel deploy/helm/godel \
  --set externalDatabase.host=$(terraform output -raw cloudsql_private_ip) \
  --set externalDatabase.enabled=true
```

## SSL/TLS with Google-managed Certificates

```bash
# Create managed certificate
cat <<EOF | kubectl apply -f -
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: godel-cert
  namespace: godel-production
spec:
  domains:
    - api.godel.dev
    - dashboard.godel.dev
EOF

# Update ingress to use the certificate
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: godel-ingress
  namespace: godel-production
  annotations:
    networking.gke.io/managed-certificates: godel-cert
    kubernetes.io/ingress.class: gce
spec:
  rules:
  - host: api.godel.dev
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: godel-api
            port:
              number: 3001
EOF
```

## Monitoring with Cloud Operations

```bash
# View logs
gcloud logging read "resource.type=k8s_container AND resource.labels.cluster_name=godel-production"

# View metrics
gcloud monitoring metrics list | grep godel
```

## Backup Strategy

### Cloud SQL Backups

- Automated daily backups enabled
- Point-in-time recovery available
- Cross-region replicas for DR

### Cloud Storage Lifecycle

```bash
# Configure lifecycle policy for backup bucket
gsutil lifecycle set lifecycle.json gs://godel-backups-production-$GCP_PROJECT_ID
```

## Scaling

### GKE Autopilot

With Autopilot, GKE automatically scales based on workload demands.

### Standard Mode Scaling

```bash
# Node pool autoscaling
gcloud container clusters update godel-production \
  --enable-autoscaling \
  --min-nodes=2 \
  --max-nodes=20 \
  --node-pool=workload \
  --region=$GCP_REGION
```

## Troubleshooting

### View GKE Logs

```bash
# Stream logs
kubectl logs -f deployment/godel-api -n godel-production

# Cloud SQL logs
gcloud logging read "resource.type=cloudsql_database"
```

### Common Issues

1. **Permission denied errors**
   ```bash
   # Check IAM bindings
   gcloud projects get-iam-policy $GCP_PROJECT_ID
   ```

2. **Connection timeouts to Cloud SQL**
   - Verify Cloud SQL Proxy is running
   - Check VPC connector configuration

## Cost Optimization

### Use Preemptible Nodes for Spot Workloads

```bash
# Add spot node pool
gcloud container node-pools create spot \
  --cluster=godel-production \
  --region=$GCP_REGION \
  --spot \
  --machine-type=e2-standard-4
```

### Schedule Scaling

```bash
# Scale down dev/test outside business hours
gcloud scheduler jobs create http scale-down \
  --schedule="0 19 * * 1-5" \
  --uri="https://container.googleapis.com/v1/projects/$GCP_PROJECT_ID/zones/$GCP_REGION/clusters/godel-production/nodePools/workload/setSize?size=1"
```
