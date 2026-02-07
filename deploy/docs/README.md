# Godel Deployment Documentation

Complete deployment automation for the Godel Agent Orchestration Platform.

## Quick Start

### Local Development (Docker Compose)

```bash
cd deploy/docker
docker-compose up -d

# Access API at http://localhost:7373
# Access Grafana at http://localhost:3000 (admin/admin)
```

### Kubernetes (Helm)

```bash
# Add Helm repos
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install with default values
helm install godel deploy/helm/godel

# Or with production values
helm install godel deploy/helm/godel \
  --values deploy/helm/godel/values-production.yaml
```

### Cloud Deployment (Terraform)

```bash
# AWS
cd deploy/terraform/aws
terraform init
terraform apply

# GCP
cd deploy/terraform/gcp
terraform init
terraform apply

# Azure
cd deploy/terraform/azure
terraform init
terraform apply
```

## Deployment Options

| Method | Best For | Complexity | Cost |
|--------|----------|------------|------|
| [Docker Compose](./DEPLOYMENT_DOCKER.md) | Local dev, small deployments | Low | Low |
| [AWS (EKS)](./DEPLOYMENT_AWS.md) | Production, enterprise | Medium | Medium |
| [GCP (GKE)](./DEPLOYMENT_GCP.md) | Production, ML workloads | Medium | Medium |
| [Azure (AKS)](./DEPLOYMENT_AZURE.md) | Enterprise, Windows hybrid | Medium | Medium |

## Directory Structure

```
deploy/
├── docker/                   # Docker Compose configurations
│   ├── docker-compose.yml    # Local development
│   ├── docker-compose.prod.yml  # Production deployment
│   └── nginx/                # Nginx reverse proxy config
├── helm/                     # Kubernetes Helm charts
│   └── godel/                # Main Godel chart
│       ├── Chart.yaml
│       ├── values.yaml       # Default values
│       ├── values-staging.yaml
│       ├── values-production.yaml
│       ├── values-local.yaml
│       └── templates/        # K8s resource templates
├── terraform/                # Infrastructure as Code
│   ├── aws/                  # AWS infrastructure (EKS, RDS, ElastiCache)
│   ├── gcp/                  # GCP infrastructure (GKE, Cloud SQL, Memorystore)
│   └── azure/                # Azure infrastructure (AKS, PostgreSQL, Redis)
└── docs/                     # Deployment documentation
    ├── README.md             # This file
    ├── DEPLOYMENT_AWS.md
    ├── DEPLOYMENT_GCP.md
    ├── DEPLOYMENT_AZURE.md
    └── DEPLOYMENT_DOCKER.md
```

## Environment Values

### Values Files

| File | Environment | Use Case |
|------|-------------|----------|
| `values.yaml` | Default | Base configuration |
| `values-local.yaml` | Local | Minikube/kind development |
| `values-staging.yaml` | Staging | Pre-production testing |
| `values-production.yaml` | Production | Production workloads |

### Environment Differences

| Feature | Local | Staging | Production |
|---------|-------|---------|------------|
| Replicas | 1 | 2 | 5+ |
| Resources | Minimal | Moderate | High |
| Autoscaling | No | Yes | Yes (HPA + Cluster) |
| SSL | No | Let's Encrypt | Let's Encrypt/Custom |
| Monitoring | Prometheus | Prometheus + Grafana | Full stack |
| Backups | No | Daily | Continuous + DR |
| Database | Container | Container | Managed (RDS/Cloud SQL) |
| Redis | Container | Container | Managed (ElastiCache/Memorystore) |

## CI/CD Integration

### GitHub Actions

The repository includes GitHub Actions workflows:

- **CI** (`.github/workflows/ci.yml`): Build, test, lint on every push
- **Release** (`.github/workflows/release.yml`): Automated releases with versioning
- **Deploy Staging** (`.github/workflows/deploy-staging.yml`): Auto-deploy to staging
- **Deploy Production** (`.github/workflows/deploy-production.yml`): Deploy to production with approval

### Required Secrets

Configure these secrets in your GitHub repository:

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `KUBE_CONFIG` | Base64-encoded kubeconfig |
| `STAGING_API_SECRET_KEY` | API key for staging |
| `STAGING_JWT_SECRET` | JWT secret for staging |
| `PRODUCTION_API_SECRET_KEY` | API key for production |
| `PRODUCTION_JWT_SECRET` | JWT secret for production |
| `SLACK_WEBHOOK_URL` | Deployment notifications |

## Rollback Procedures

### Helm Rollback

```bash
# View release history
helm history godel -n godel-production

# Rollback to previous version
helm rollback godel -n godel-production

# Rollback to specific revision
helm rollback godel 3 -n godel-production
```

### Manual Rollback via GitHub Actions

1. Go to Actions → Deploy to Production
2. Click "Run workflow"
3. Check "Rollback to previous version?"
4. Optionally specify rollback version
5. Click "Run workflow"

### Database Rollback

```bash
# Restore from backup (AWS RDS)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier godel-production \
  --target-db-instance-identifier godel-production-restored \
  --restore-time 2024-01-15T00:00:00Z
```

## Monitoring

### Health Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### Alerts

Configure alerts for:
- High error rates (> 1%)
- High latency (p95 > 500ms)
- Pod restarts (> 3 in 5 minutes)
- Database connection failures
- Disk space (> 80%)

## Troubleshooting

### Common Issues

1. **ImagePullBackOff**: Check image tag exists and registry credentials
2. **CrashLoopBackOff**: Check pod logs for application errors
3. **Pending pods**: Check resource quotas and node capacity
4. **Database connection errors**: Verify network policies and secrets

### Debug Commands

```bash
# Check pod status
kubectl get pods -n godel-production

# View logs
kubectl logs -f deployment/godel-api -n godel-production

# Describe pod
kubectl describe pod <pod-name> -n godel-production

# Exec into pod
kubectl exec -it <pod-name> -n godel-production -- /bin/sh

# Check events
kubectl get events -n godel-production --sort-by=.lastTimestamp
```

## Support

For deployment issues:
1. Check the specific cloud deployment guide
2. Review application logs
3. Open an issue on GitHub with:
   - Deployment method used
   - Error messages
   - Relevant configuration (sanitized)
