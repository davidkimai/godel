# Godel Deployment Guide - Microsoft Azure

Complete guide for deploying Godel to Microsoft Azure.

## Prerequisites

- Azure CLI (az) configured with appropriate credentials
- Terraform >= 1.5.0
- kubectl
- Helm >= 3.0

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Azure Resource Group                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Virtual Network                     │   │
│  │   ┌──────────────┐      ┌──────────────────────────┐     │   │
│  │   │  Azure Load  │      │       AKS Cluster        │     │   │
│  │   │  Balancer    │◄─────│  ┌──────────────────┐    │     │   │
│  │   └──────┬───────┘      │  │   Godel API      │    │     │   │
│  │          │               │  └──────────────────┘    │     │   │
│  │          ▼               │  ┌──────────────────┐    │     │   │
│  │      Internet            │  │   Dashboard      │    │     │   │
│  │                          │  └──────────────────┘    │     │   │
│  │                          │          │               │     │   │
│  │                          │          ▼               │     │   │
│  │                          │  ┌──────────────────┐    │     │   │
│  │                          │  │ Azure Database   │    │     │   │
│  │                          │  │ for PostgreSQL   │    │     │   │
│  │                          │  └──────────────────┘    │     │   │
│  │                          │  ┌──────────────────┐    │     │   │
│  │                          │  │ Azure Cache      │    │     │   │
│  │                          │  │ for Redis        │    │     │   │
│  │                          │  └──────────────────┘    │     │   │
│  │                          └──────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Steps

### 1. Azure Login

```bash
# Login to Azure
az login

# Set subscription
az account set --subscription "Your Subscription Name"

# Set variables
export AZURE_LOCATION=eastus
export ENVIRONMENT=production
```

### 2. Create Terraform State Resources

```bash
# Create resource group for Terraform state
az group create \
  --name godel-terraform-rg \
  --location $AZURE_LOCATION

# Create storage account for state
az storage account create \
  --name godeltfstate \
  --resource-group godel-terraform-rg \
  --location $AZURE_LOCATION \
  --sku Standard_LRS \
  --allow-blob-public-access false

# Create container
az storage container create \
  --name tfstate \
  --account-name godeltfstate
```

### 3. Initialize Terraform

```bash
cd deploy/terraform/azure

# Initialize
terraform init

# Or with backend config
terraform init \
  -backend-config="resource_group_name=godel-terraform-rg" \
  -backend-config="storage_account_name=godeltfstate" \
  -backend-config="container_name=tfstate"
```

### 4. Configure Variables

Create `terraform.tfvars`:

```hcl
azure_location = "East US"
environment    = "production"

# AKS Configuration
vm_size           = "Standard_D4s_v3"
workload_vm_size  = "Standard_D8s_v3"
spot_vm_size      = "Standard_D4s_v3"
node_count        = 3
min_nodes         = 2
max_nodes         = 10

# Database Configuration
db_sku_name = "GP_Standard_D4s_v3"

# Redis Configuration
redis_sku      = "Premium"
redis_capacity = 1

# Azure AD (optional)
aad_admin_group_ids = ["00000000-0000-0000-0000-000000000000"]
```

### 5. Deploy Infrastructure

```bash
# Plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Get outputs
terraform output
```

### 6. Configure kubectl

```bash
# Get AKS credentials
az aks get-credentials \
  --resource-group godel-production-rg \
  --name godel-production-aks

# Verify
kubectl get nodes
```

### 7. Deploy Godel

```bash
# Create namespace
kubectl create namespace godel-production

# Create secrets
kubectl create secret generic godel-secrets \
  --namespace godel-production \
  --from-literal=GODEL_API_KEY=$(openssl rand -base64 32) \
  --from-literal=JWT_SECRET=$(openssl rand -base64 64)

# Get database and Redis connection info
DB_FQDN=$(terraform output -raw postgres_fqdn)
REDIS_HOST=$(terraform output -raw redis_host)

echo "Database: $DB_FQDN"
echo "Redis: $REDIS_HOST"

# Deploy with Helm
helm upgrade --install godel deploy/helm/godel \
  --namespace godel-production \
  --values deploy/helm/godel/values-production.yaml \
  --set externalDatabase.host=$DB_FQDN \
  --set externalRedis.host=$REDIS_HOST \
  --set godelApi.ingress.hosts[0].host=api.godel.dev \
  --set godelDashboard.ingress.hosts[0].host=dashboard.godel.dev
```

## SSL/TLS Configuration

### Using cert-manager

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Wait for cert-manager
kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager

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

### Using Azure Key Vault

```bash
# Create Key Vault
az keyvault create \
  --name godel-$ENVIRONMENT-kv \
  --resource-group godel-$ENVIRONMENT-rg \
  --location $AZURE_LOCATION

# Store certificate
az keyvault certificate import \
  --vault-name godel-$ENVIRONMENT-kv \
  --name godel-cert \
  --file certificate.pfx
```

## Azure Monitor Integration

### Container Insights

```bash
# Enable Container Insights (automatic with Terraform)
# Verify it's working
az aks show \
  --resource-group godel-production-rg \
  --name godel-production-aks \
  --query addonProfiles.omsagent.enabled
```

### View Logs in Azure Portal

```bash
# Query logs
az monitor log-analytics query \
  --workspace $(terraform output -raw log_analytics_workspace_id) \
  --analytics-query "ContainerInventory | where Name contains 'godel'"
```

## Backup and Disaster Recovery

### Azure Database for PostgreSQL Backups

- Geo-redundant backups enabled for production
- Point-in-time restore available
- Long-term retention policies configured

### Azure Storage Backups

```bash
# Configure soft delete for blob storage
az storage blob service-properties delete-policy update \
  --account-name godelbackupproduction \
  --enable true \
  --days-retained 30
```

## Scaling

### AKS Cluster Autoscaler

```bash
# Enable cluster autoscaler (already configured via Terraform)
az aks update \
  --resource-group godel-production-rg \
  --name godel-production-aks \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 20
```

### Virtual Node (ACI)

```bash
# Enable virtual node for burst scaling
az aks enable-addons \
  --resource-group godel-production-rg \
  --name godel-production-aks \
  --addons virtual-node \
  --subnet-name virtual-node-subnet
```

## Troubleshooting

### AKS Issues

```bash
# Get cluster events
kubectl get events --sort-by=.lastTimestamp

# Node status
kubectl describe nodes

# Pod logs
kubectl logs deployment/godel-api -n godel-production --tail=100 -f
```

### Database Connection Issues

```bash
# Test database connection from AKS
kubectl run postgres-client --rm --tty -i --restart='Never' \
  --namespace godel-production \
  --image postgres:15-alpine \
  -- psql "sslmode=require host=$(terraform output -raw postgres_fqdn) user=godel_admin dbname=godel"
```

### Azure-specific Debugging

```bash
# Check AKS node resource health
az aks get-upgrades \
  --resource-group godel-production-rg \
  --name godel-production-aks

# View activity logs
az monitor activity-log list \
  --resource-group godel-production-rg \
  --max-events 50
```

## Cost Optimization

### Use Spot Instances

```bash
# Add spot node pool
az aks nodepool add \
  --cluster-name godel-production-aks \
  --resource-group godel-production-rg \
  --name spot \
  --priority Spot \
  --eviction-policy Delete \
  --node-count 0 \
  --min-count 0 \
  --max-count 10
```

### Reserved Instances

For predictable production workloads, consider Azure Reserved VM Instances for up to 72% savings.

## Security Best Practices

### Network Policies

```bash
# Enable Azure Network Policy
az aks update \
  --resource-group godel-production-rg \
  --name godel-production-aks \
  --network-policy azure
```

### Azure Policy

```bash
# Assign built-in security policy
az policy assignment create \
  --name 'AKS Security Baseline' \
  --scope /subscriptions/$(az account show --query id -o tsv)/resourceGroups/godel-production-rg \
  --policy-set-definition 'Kubernetes cluster pod security baseline standards for Linux-based workloads'
```
