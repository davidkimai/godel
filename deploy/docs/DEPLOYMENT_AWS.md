# Godel Deployment Guide - AWS

Complete guide for deploying Godel to Amazon Web Services (AWS).

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.5.0
- kubectl
- Helm >= 3.0

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VPC (10.0.0.0/16)                    │
│  ┌─────────────────────┐      ┌─────────────────────────┐   │
│  │   Public Subnets    │      │     Private Subnets     │   │
│  │  ┌───────────────┐  │      │  ┌─────────────────┐    │   │
│  │  │  ALB/Nginx    │  │      │  │   EKS Cluster   │    │   │
│  │  └───────┬───────┘  │      │  │  ┌───────────┐  │    │   │
│  └──────────┼──────────┘      │  │  │ Godel API │  │    │   │
│             │                 │  │  └─────┬─────┘  │    │   │
│             ▼                 │  │  ┌───────────┐  │    │   │
│       Internet                │  │  │Dashboard  │  │    │   │
│                               │  │  └───────────┘  │    │   │
│                               │  └─────────────────┘    │   │
│                               │           │              │   │
│                               │           ▼              │   │
│                               │  ┌─────────────────┐     │   │
│                               │  │   RDS Postgres  │     │   │
│                               │  └─────────────────┘     │   │
│                               │  ┌─────────────────┐     │   │
│                               │  │ ElastiCache Redis│    │   │
│                               │  └─────────────────┘     │   │
│                               └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Steps

### 1. Initialize Terraform

```bash
cd deploy/terraform/aws

# Initialize Terraform
terraform init

# Set environment
export TF_VAR_environment=production  # or staging
```

### 2. Configure Variables

Create a `terraform.tfvars` file:

```hcl
aws_region = "us-east-1"
environment = "production"

# VPC Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# EKS Configuration
node_instance_types = ["m6i.xlarge"]
min_nodes = 3
max_nodes = 20
desired_nodes = 5

# Database Configuration
db_instance_class = "db.r6g.xlarge"
redis_node_type = "cache.r6g.large"
```

### 3. Deploy Infrastructure

```bash
# Plan deployment
terraform plan -out=tfplan

# Apply infrastructure
terraform apply tfplan

# Get outputs
terraform output
```

### 4. Configure kubectl

```bash
# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name godel-production

# Verify cluster access
kubectl get nodes
```

### 5. Deploy Godel with Helm

```bash
# Add Helm repositories
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install ingress-nginx (if not already installed)
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace

# Install cert-manager for TLS
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true

# Create secrets
kubectl create namespace godel-production --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic godel-secrets \
  --namespace godel-production \
  --from-literal=GODEL_API_KEY=$(openssl rand -base64 32) \
  --from-literal=JWT_SECRET=$(openssl rand -base64 64) \
  --from-literal=DATABASE_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=REDIS_PASSWORD=$(openssl rand -base64 32)

# Deploy Godel
helm upgrade --install godel deploy/helm/godel \
  --namespace godel-production \
  --values deploy/helm/godel/values-production.yaml \
  --set godelApi.ingress.hosts[0].host=api.godel.dev \
  --set godelDashboard.ingress.hosts[0].host=dashboard.godel.dev \
  --wait \
  --timeout 10m
```

### 6. Verify Deployment

```bash
# Check pods
kubectl get pods -n godel-production

# Check services
kubectl get svc -n godel-production

# Check ingress
kubectl get ingress -n godel-production

# Test health endpoint
kubectl port-forward svc/godel-api 7373:3001 -n godel-production &
curl http://localhost:7373/health
```

## SSL/TLS Configuration

### Using cert-manager with Let's Encrypt

```bash
# Create ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## Monitoring Setup

### Install Prometheus and Grafana

```bash
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.enabled=true \
  --set prometheus.prometheusSpec.retention=30d
```

## Backup and Disaster Recovery

### Automated RDS Backups

- Automated daily backups with 30-day retention
- Point-in-time recovery enabled
- Cross-region snapshots for disaster recovery

### S3 Backup Strategy

```bash
# Configure backup script
kubectl create cronjob database-backup \
  --image=postgres:15-alpine \
  --schedule="0 2 * * *" \
  --namespace godel-production
```

## Scaling

### Horizontal Pod Autoscaling

```bash
# Verify HPA is working
kubectl get hpa -n godel-production

# Manually scale if needed
kubectl scale deployment godel-api --replicas=10 -n godel-production
```

### Cluster Autoscaling

```bash
# View cluster autoscaler logs
kubectl logs -n kube-system deployment/cluster-autoscaler
```

## Troubleshooting

### Common Issues

1. **Pods not starting**
   ```bash
   kubectl describe pod <pod-name> -n godel-production
   kubectl logs <pod-name> -n godel-production
   ```

2. **Database connection issues**
   ```bash
   # Check RDS security group
   aws rds describe-db-instances --query 'DBInstances[?DBInstanceIdentifier==`godel-production`]'
   ```

3. **Ingress not working**
   ```bash
   kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
   ```

### Support

For issues or questions, please open an issue on GitHub or contact the Godel team.
