# Dash Deployment Guide

Production deployment guide for the Dash Agent Orchestration Platform.

## Overview

Dash runs as a background service that:
- Orchestrates multiple AI agents via worktrees
- Monitors build and test status
- Generates progress reports
- Integrates with OpenClaw Gateway

## Prerequisites

- Node.js 18+ with npm
- Git 2.35+ with worktree support
- Kimi CLI agent (`kimi -p`)
- OpenClaw Gateway (for notifications)

## Environment Variables

Create `.env` file in project root:

```bash
# Required
DASH_PROJECT_PATH=/Users/jasontang/clawd/projects/dash
DASH_MAX_SWARMS=5
DASH_MAX_CONCURRENT=3

# Build Settings
DASH_BUILD_TIMEOUT=120000
DASH_TEST_TIMEOUT=60000

# Session Budget (in abstract units)
DASH_BUDGET_TOTAL=1.0
DASH_BUDGET_PER_SPRINT=0.25

# Notification Settings
OPENCLAW_GATEWAY_URL=http://127.0.0.1:8080/api
OPENCLAW_GATEWAY_TOKEN=your_gateway_token_here
NOTIFICATION_CHANNEL=telegram
NOTIFICATION_USER_ID=your_user_id

# Optional - Cron Settings
DASH_CRON_ENABLED=true
DASH_BUILD_MONITOR_INTERVAL=30
DASH_SWARM_WATCHDOG_INTERVAL=120
DASH_PROGRESS_REPORT_INTERVAL=1800

# Debug
DASH_LOG_LEVEL=info  # debug, info, warn, error
DASH_DRY_RUN=false
```

### Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASH_PROJECT_PATH` | Yes | - | Absolute path to Dash project |
| `DASH_MAX_SWARMS` | No | 5 | Maximum number of worktrees |
| `DASH_MAX_CONCURRENT` | No | 3 | Max concurrent agent processes |
| `DASH_BUILD_TIMEOUT` | No | 120000 | Build timeout in ms |
| `DASH_TEST_TIMEOUT` | No | 60000 | Test timeout in ms |
| `DASH_BUDGET_TOTAL` | No | 1.0 | Total session budget |
| `DASH_BUDGET_PER_SPRINT` | No | 0.25 | Budget per sprint |
| `OPENCLAW_GATEWAY_URL` | No | - | OpenClaw Gateway API URL |
| `OPENCLAW_GATEWAY_TOKEN` | No | - | Gateway authentication token |
| `NOTIFICATION_CHANNEL` | No | - | Notification channel (telegram, etc) |
| `NOTIFICATION_USER_ID` | No | - | Target user/channel ID |
| `DASH_CRON_ENABLED` | No | true | Enable cron jobs |
| `DASH_LOG_LEVEL` | No | info | Logging verbosity |
| `DASH_DRY_RUN` | No | false | Dry run mode (no actual execution) |

## Installation

### 1. Clone and Setup

```bash
# Clone repository
git clone https://github.com/davidkimai/dash.git
cd dash

# Install dependencies
npm install

# Verify build
npm run build

# Make scripts executable
chmod +x orchestrator.sh sprint-launcher.sh
```

### 2. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit with your settings
nano .env
```

### 3. Test Orchestrator

```bash
# Manual test run
./orchestrator.sh --dry-run

# Check state
cat .dash/orchestrator-state.json
```

## Cron Job Configuration

### Using Crontab (Linux/macOS)

Add to crontab (`crontab -e`):

```bash
# Dash Orchestrator - runs every minute
* * * * * cd /Users/jasontang/clawd/projects/dash && /usr/bin/node .dash/orchestrator-v4.js >> .dash/logs/cron.log 2>&1

# Build Monitor - every 30 seconds
* * * * * (sleep 0; cd /Users/jasontang/clawd/projects/dash && /usr/bin/node .dash/monitor-build.js) >> .dash/logs/monitor.log 2>&1
* * * * * (sleep 30; cd /Users/jasontang/clawd/projects/dash && /usr/bin/node .dash/monitor-build.js) >> .dash/logs/monitor.log 2>&1

# Swarm Watchdog - every 2 minutes
*/2 * * * * cd /Users/jasontang/clawd/projects/dash && /usr/bin/node .dash/swarm-watchdog.js >> .dash/logs/watchdog.log 2>&1

# Progress Report - every 30 minutes
*/30 * * * * cd /Users/jasontang/clawd/projects/dash && /usr/bin/node .dash/progress-report.js >> .dash/logs/reports.log 2>&1
```

### Using launchd (macOS Recommended)

Create `~/Library/LaunchAgents/com.dash.orchestrator.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dash.orchestrator</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/node</string>
        <string>/Users/jasontang/clawd/projects/dash/.dash/orchestrator-v4.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/jasontang/clawd/projects/dash</string>
    <key>StartInterval</key>
    <integer>60</integer>
    <key>StandardOutPath</key>
    <string>/Users/jasontang/clawd/projects/dash/.dash/logs/orchestrator.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/jasontang/clawd/projects/dash/.dash/logs/orchestrator-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>/Users/jasontang</string>
    </dict>
</dict>
</plist>
```

Load the service:

```bash
launchctl load ~/Library/LaunchAgents/com.dash.orchestrator.plist
launchctl start com.dash.orchestrator
```

### Using systemd (Linux)

Create `/etc/systemd/system/dash-orchestrator.service`:

```ini
[Unit]
Description=Dash Agent Orchestrator
After=network.target

[Service]
Type=simple
User=jasontang
WorkingDirectory=/Users/jasontang/clawd/projects/dash
ExecStart=/usr/bin/node .dash/orchestrator-v4.js
Restart=always
RestartSec=60
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/Users/jasontang/clawd/projects/dash/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable dash-orchestrator
sudo systemctl start dash-orchestrator
```

## OpenClaw Gateway Integration

### Gateway Setup

Ensure OpenClaw Gateway is running:

```bash
# Check status
openclaw gateway status

# Start if needed
openclaw gateway start
```

### Notification Configuration

Dash sends notifications via OpenClaw Gateway:

| Event | Notification |
|-------|--------------|
| Swarm started | "🚀 Dash: Swarm 'code-refactor' launched" |
| Build failed | "⚠️ Dash: Build failed in sprint-X" |
| Budget exceeded | "💰 Dash: Budget limit reached" |
| Progress report | "📊 Dash: 3/5 tasks complete" |

### Testing Integration

```bash
# Test notification
curl -X POST \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Dash test notification"}' \
  $OPENCLAW_GATEWAY_URL/notify
```

## Monitoring

### Health Checks

```bash
# Check orchestrator running
pgrep -f "orchestrator-v4"

# View recent logs
tail -f .dash/logs/orchestrator.log

# Check state
cat .dash/orchestrator-state.json | jq
```

### Log Files

| Log File | Purpose |
|----------|---------|
| `.dash/logs/orchestrator.log` | Main orchestrator output |
| `.dash/logs/monitor.log` | Build monitor output |
| `.dash/logs/watchdog.log` | Swarm watchdog output |
| `.dash/logs/reports.log` | Progress reports |
| `.dash/logs/cron.log` | Cron job output |

### State File

```bash
# View current state
cat .dash/orchestrator-state.json
```

Structure:
```json
{
  "status": "running",
  "activeSwarms": 2,
  "lastRun": "2025-02-03T10:30:00Z",
  "budget": {
    "total": 1.0,
    "used": 0.5,
    "remaining": 0.5
  },
  "swarms": [
    {
      "id": "sprint-20250203-103000",
      "status": "active",
      "agent": "code-refactor"
    }
  ]
}
```

## Backup and Recovery

### State Backup

```bash
# Backup state
cp .dash/orchestrator-state.json .dash/orchestrator-state.json.bak

# Backup worktrees (optional)
tar -czf dash-worktrees-backup.tar.gz .claude-worktrees/
```

### Recovery

```bash
# Stop orchestrator
pkill -f orchestrator

# Restore state
cp .dash/orchestrator-state.json.bak .dash/orchestrator-state.json

# Prune stale worktrees
git worktree prune

# Restart
./orchestrator.sh
```

## Security

### File Permissions

```bash
# Secure .env file
chmod 600 .env

# Secure scripts
chmod 750 orchestrator.sh sprint-launcher.sh

# Create logs directory with proper permissions
mkdir -p .dash/logs
chmod 755 .dash
chmod 644 .dash/logs/*
```

### Secret Management

- Never commit `.env` to git
- Use placeholder values in examples
- Rotate tokens regularly
- Use environment-specific configs

### Network Security

- Gateway should bind to localhost only
- Use firewall rules if exposing Gateway
- Enable HTTPS for Gateway in production

## Troubleshooting

### Service Won't Start

```bash
# Check permissions
ls -la orchestrator.sh

# Test manually
node .dash/orchestrator-v4.js --dry-run

# Check Node version
node --version  # Should be 18+

# View error logs
cat .dash/logs/orchestrator-error.log
```

### Crontab Not Running

```bash
# Check cron logs
grep CRON /var/log/syslog

# Test cron entry manually
cd /Users/jasontang/clawd/projects/dash && /usr/bin/node .dash/orchestrator-v4.js --dry-run

# Check environment
env | grep DASH
```

### Gateway Connection Failed

```bash
# Test connectivity
curl -I $OPENCLAW_GATEWAY_URL/health

# Check token
echo $OPENCLAW_GATEWAY_TOKEN | wc -c  # Should be non-zero

# Verify Gateway status
openclaw gateway status
```

## Upgrade Procedure

1. Stop current service
2. Backup state
3. Pull latest code
4. Install dependencies: `npm install`
5. Run migrations if any
6. Start service
7. Verify health

```bash
# Quick upgrade
pkill -f orchestrator
cp .dash/orchestrator-state.json .dash/orchestrator-state.json.bak
git pull origin main
npm install
npm run build
./orchestrator.sh
```

## Uninstallation

```bash
# Stop services
pkill -f orchestrator
launchctl unload ~/Library/LaunchAgents/com.dash.orchestrator.plist  # macOS

# Remove cron entries
crontab -e  # Remove Dash entries

# Clean worktrees
git worktree prune
rm -rf .claude-worktrees/

# Remove state
rm -rf .dash/
```

---

**Version**: 1.0.0  
**Last Updated**: 2025-02-03

---

## Container & Kubernetes Deployment (Phase 3)

This section covers production deployment using Docker and Kubernetes.

### Overview

The Phase 3 deployment includes:
- Multi-stage Docker build for optimized production images
- Kubernetes manifests for cluster deployment
- GitHub Actions CI/CD pipeline for automated deployments
- Deployment script for manual deployments

### Quick Start

#### 1. Build Docker Image

```bash
# Build the production image
docker build -f Dockerfile.production -t ghcr.io/org/dash:latest .

# Test locally
docker run -p 3000:3000 ghcr.io/org/dash:latest
```

#### 2. Push to Registry

```bash
# Log in to container registry
docker login ghcr.io -u $GITHUB_USER

# Push image
docker tag ghcr.io/org/dash:latest ghcr.io/org/dash:$VERSION
docker push ghcr.io/org/dash:$VERSION
```

#### 3. Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f kubernetes/k8s.yaml

# Verify deployment
kubectl get pods -l app=dash
kubectl get svc dash
```

### Docker Build (Dockerfile.production)

The production Dockerfile uses a multi-stage build:

1. **Builder Stage**: Installs dependencies and builds the application
2. **Production Stage**: Creates a minimal, secure runtime image

#### Build Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| NODE_VERSION | 20 | Node.js version |
| ALPINE_VERSION | latest | Alpine Linux version |

#### Image Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest main branch build |
| `v1.0.0` | Versioned release |
| `sha-abc123` | Specific commit SHA |

### Kubernetes Deployment (kubernetes/k8s.yaml)

The Kubernetes manifests include:

#### Resources

| Resource | Description |
|----------|-------------|
| ConfigMap | Application configuration |
| Secret | Sensitive data (tokens, passwords) |
| Deployment | Pod replicas and container spec |
| Service | Internal networking |
| HorizontalPodAutoscaler | Automatic scaling |
| Ingress | External access (with TLS) |

#### Scaling

Default configuration:
- **Replicas**: 3 pods
- **CPU Request**: 100m
- **Memory Request**: 256Mi
- **CPU Limit**: 500m
- **Memory Limit**: 512Mi
- **Auto-scale**: 3-10 replicas based on CPU utilization

#### Health Checks

| Check | Endpoint | Initial Delay | Period |
|-------|----------|---------------|--------|
| Liveness | /health | 30s | 10s |
| Readiness | /health | 5s | 5s |

### GitHub Actions CI/CD (.github/workflows/ci-cd.yml)

The CI/CD pipeline includes:

#### Workflow Stages

1. **Build**: Build and push Docker image
2. **Test**: Run linter and tests
3. **Deploy (Staging)**: Deploy to staging environment
4. **Deploy (Production)**: Deploy to production environment

#### Required Secrets

Configure these in GitHub repository secrets:

| Secret | Description |
|--------|-------------|
| `KUBE_CONFIG` | Kubernetes cluster config for production |
| `KUBE_CONFIG_STAGING` | Kubernetes cluster config for staging |

#### Environment Configuration

| Environment | Trigger | URL |
|-------------|---------|-----|
| Staging | Push to main | https://staging.dash.example.com |
| Production | Push to main | https://dash.example.com |

### Manual Deployment Script (deploy.sh)

Usage:

```bash
# Deploy to production
./deploy.sh production

# Deploy to staging
./deploy.sh staging

# Rollback to previous version
./deploy.sh production --rollback
```

#### Options

| Option | Description |
|--------|-------------|
| `staging` | Deploy to staging environment |
| `production` | Deploy to production environment (default) |
| `--rollback` | Rollback to previous deployment |
| `--help` | Show help message |

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_NAME` | `ghcr.io/org/dash` | Docker image name |
| `K8S_DIR` | `kubernetes` | Kubernetes manifests directory |
| `NAMESPACE` | `default` | Kubernetes namespace |

### TLS/SSL Configuration

For production HTTPS:

1. **cert-manager**: Install via Helm
   ```bash
   helm install cert-manager jetstack/cert-manager \
     --namespace cert-manager \
     --create-namespace \
     --version v1.13.0
   ```

2. **Cluster Issuer**: Already included in `k8s.yaml`
   - Uses Let's Encrypt
   - Staging: `letsencrypt-staging`
   - Production: `letsencrypt-prod`

### Rollback Procedure

#### Option 1: Using deploy.sh

```bash
./deploy.sh production --rollback
```

#### Option 2: Manual kubectl

```bash
# View rollout history
kubectl rollout history deployment/dash -n default

# Rollback to previous
kubectl rollout undo deployment/dash -n default

# Rollback to specific revision
kubectl rollout undo deployment/dash --to-revision=2 -n default
```

#### Option 3: GitHub Actions

Use the GitHub UI to revert a deployment and re-run the workflow.

### Monitoring in Kubernetes

#### View Logs

```bash
# All pods
kubectl logs -l app=dash -n default --tail=100

# Specific pod
kubectl logs <pod-name> -n default

# Follow logs
kubectl logs -l app=dash -n default -f
```

#### Check Status

```bash
# Deployment status
kubectl describe deployment/dash -n default

# Pod status
kubectl get pods -l app=dash -n default

# Service endpoints
kubectl get endpoints dash -n default
```

#### Resource Usage

```bash
# CPU and memory
kubectl top pods -l app=dash -n default

# Events
kubectl get events -n default --sort-by='.lastTimestamp'
```

### Troubleshooting

#### Pod Not Starting

```bash
# Check pod status
kubectl get pods -l app=dash -n default

# View pod events
kubectl describe pod <pod-name> -n default

# Check image pull
kubectl get events -n default | grep -i image
```

#### CrashLoopBackOff

```bash
# Check logs
kubectl logs <pod-name> -n default --previous

# Common causes:
# - Missing environment variables
# - ConfigMap/Secret not found
# - Image pull failed
# - Resource limits too low
```

#### Service Not Accessible

```bash
# Verify service
kubectl get svc dash -n default

# Check endpoints
kubectl get endpoints dash -n default

# Test locally
kubectl port-forward svc/dash 3000:80 -n default
# Then visit http://localhost:3000
```

### Best Practices

1. **Security**
   - Use non-root user in container
   - Regularly update base images
   - Scan images for vulnerabilities
   - Use secrets management (not plain text)

2. **Performance**
   - Configure appropriate resource limits
   - Use readiness probes for rolling updates
   - Set合理的 HPA thresholds

3. **Reliability**
   - Configure liveness and readiness probes
   - Set合理的 replica count
   - Use pod disruption budgets

4. **CI/CD**
   - Run tests before deployment
   - Use staging environment for testing
   - Enable manual approval for production
   - Set up rollback strategy

### Upgrading

#### Blue-Green Deployment

```bash
# Create new deployment with updated image
kubectl set image deployment/dash dash=ghcr.io/org/dash:v2.0.0 -n default

# Wait for new pods
kubectl rollout status deployment/dash -n default

# If issues, rollback
./deploy.sh production --rollback
```

#### Canary Deployment (Advanced)

Consider using Flagger or Argo Rollouts for canary deployments.

### Backup and Restore

#### etcd Backup

```bash
# Backup etcd (cluster administrator)
ETCDCTL_API=3 etcdctl snapshot save backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key
```

#### Restore from Backup

```bash
ETCDCTL_API=3 etcdctl snapshot restore backup.db \
  --data-dir=/var/lib/etcd/restore
```

---

**Phase 3 Added**: 2025-02-04  
**Docker Version**: 20.x  
**Kubernetes Version**: 1.28+  
**Helm Version**: 3.13+ (optional)
