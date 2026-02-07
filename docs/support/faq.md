# Godel Support: Frequently Asked Questions

**Last Updated:** 2026-02-06  
**Applies to:** Godel v2.0.0

---

## General Questions

### What is Godel?

Godel is a production-grade meta-orchestration platform designed to manage 10-50+ concurrent AI agent sessions. It provides unified task dispatch, priority queue management, session federation, and comprehensive lifecycle orchestration across heterogeneous agent instances.

### What's new in v2.0.0?

- **Intent-based interface:** Use natural language to orchestrate agents (`godel do "implement OAuth"`)
- **Multi-provider orchestration:** Support for 15+ LLM providers
- **Tree-structured sessions:** Branch and fork conversations
- **Federation architecture:** Multi-instance management
- **Server-side LLM proxy:** Secure API key management

### Is Godel ready for production?

Yes! Godel v2.0.0 has passed comprehensive testing:
- 50+ concurrent sessions validated
- 0% error rate in load testing
- 99% security audit score
- Complete documentation

### How do I get started?

```bash
# Install
npm install -g @jtan15010/godel

# Configure
cp .env.example .env
# Edit .env with your settings

# Start
npm start

# Try it
godel do "Create a simple REST API"
```

---

## Installation & Setup

### What are the system requirements?

**Minimum:**
- Node.js 20+
- 2 CPU cores
- 2GB RAM
- PostgreSQL 14+ or SQLite

**Recommended:**
- Node.js 22+
- 4 CPU cores
- 4GB RAM
- PostgreSQL 15+
- Redis 7+

### Can I use SQLite instead of PostgreSQL?

Yes, for development:
```bash
# Add to .env
DATABASE_URL=sqlite://./godel.db
```

For production, PostgreSQL is strongly recommended for:
- Concurrent access
- Data integrity
- Backup/restore capabilities
- Performance

### Do I need Redis?

Redis is recommended but optional:
- **With Redis:** Better performance, pub/sub, persistence options
- **Without Redis:** Falls back to in-memory cache (data lost on restart)

### How do I configure environment variables?

Copy `.env.example` to `.env` and configure:

```bash
# Required
GODEL_DATABASE_URL=postgresql://user:pass@localhost:5432/godel
GODEL_API_KEY=your_secure_key_here
GODEL_JWT_SECRET=your_jwt_secret_here

# Optional
GODEL_REDIS_URL=redis://localhost:6379
GODEL_PORT=7373
GODEL_LOG_LEVEL=info
```

---

## Usage Questions

### How do I create an agent?

```bash
# Basic agent
godel agent spawn --runtime pi --model claude-sonnet-4-5

# With specific role
godel agent create --role worker --model claude-sonnet-4-5

# Execute task immediately
godel agent exec <agent-id> "Implement user authentication"
```

### What's the difference between `dash` and `godel` commands?

`godel` is the current CLI command. `dash` was the previous name - update your scripts to use `godel`.

### How does the intent interface work?

```bash
# Instead of multiple commands:
godel agent create --role worker
godel worktree create --repo /path
godel task create --agent <id> --prompt "..."

# Just describe what you want:
godel do "Implement OAuth2 with Google provider"
```

Godel will:
1. Parse your intent
2. Select appropriate agents
3. Create worktrees
4. Execute tasks
5. Monitor progress

### Can I use my own LLM provider?

Yes! Godel supports 15+ providers:
- Anthropic (Claude)
- OpenAI (GPT-4)
- Google (Gemini)
- Groq
- Cerebras
- And more...

```bash
godel agent spawn --provider openai --model gpt-4o
```

---

## Pricing & Billing

### Is Godel free?

Godel is open-source (MIT License). You pay for:
- Your infrastructure (servers, databases)
- LLM provider usage (Anthropic, OpenAI, etc.)

### How do I set a budget?

```bash
# Set total budget
godel budget set --amount 100.00

# Or in .env
GODEL_BUDGET_TOTAL=100.00
GODEL_BUDGET_ALERT_THRESHOLD=75
```

### How do I track costs?

```bash
# View budget status
godel budget status

# View cost analytics in dashboard
open http://localhost:7373
```

---

## Troubleshooting

### Why can't I connect to the database?

Check:
1. PostgreSQL is running: `pg_isready -h localhost -p 5432`
2. Connection string is correct in `.env`
3. Database exists: `createdb -U postgres godel`

### Why are my agents failing to spawn?

Common causes:
1. **Git worktree issues:** Run `git worktree prune`
2. **Disk space:** Check with `df -h`
3. **Permissions:** Ensure `.claude-worktrees/` is writable
4. **OpenClaw not running:** Start with `openclaw gateway start`

### How do I debug agent issues?

```bash
# Enable debug logging
export GODEL_LOG_LEVEL=debug

# View agent logs
godel logs tail --agent <agent-id>

# Check agent status
godel agent status <agent-id>
```

### What if Godel crashes?

```bash
# Check logs
godel logs tail --follow

# Restart
godel stop
godel start

# Emergency reset
pkill -f "godel"
godel status
```

---

## Security

### How are API keys managed?

- **Server-side:** API keys stored in environment variables
- **Never in code:** No hardcoded keys in v2.0.0
- **Validation:** Runtime check rejects placeholder values

### Is my data secure?

Yes:
- TLS 1.3 for all connections
- Database encryption at rest
- PII detection and redaction
- Audit logging
- RBAC support

### How do I rotate secrets?

```bash
# Generate new secret
export GODEL_API_KEY=$(openssl rand -hex 32)

# Update deployment
kubectl create secret generic godel-secrets \
  --from-literal=GODEL_API_KEY="$GODEL_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

# Rolling restart
kubectl rollout restart deployment/godel
```

---

## Scaling & Performance

### How many concurrent sessions can Godel handle?

**Tested and validated:**
- 10 sessions: Excellent performance (<100ms latency)
- 25 sessions: Production ready (<200ms latency)
- 50 sessions: Enterprise scale (<500ms latency)

### How do I scale Godel?

**Horizontal scaling:**
```bash
# Scale pods
kubectl scale deployment/godel --replicas=5 -n godel
```

**Vertical scaling:**
```bash
# Increase resources
kubectl set resources deployment/godel \
  --limits=cpu=2,memory=4Gi \
  -n godel
```

**Federation (50+ sessions):**
```bash
# Deploy multiple instances
godel federation join --region us-east-1
```

### How do I monitor performance?

```bash
# Built-in metrics
curl http://localhost:7373/metrics

# Dashboard
open http://localhost:7373

# CLI
godel status
godel metrics
```

---

## Integration Questions

### Can I integrate Godel with my CI/CD?

Yes! Use the API:

```bash
# In your CI pipeline
curl -X POST http://godel.internal/api/v1/tasks \
  -H "Authorization: Bearer $GODEL_API_KEY" \
  -d '{
    "payload": {
      "type": "pi_execute",
      "prompt": "Run tests and report results"
    }
  }'
```

### Does Godel work with my IDE?

VSCode extension available:
```bash
# Install from marketplace
code --install-extension godel.godel-vscode
```

### Can I use Godel programmatically?

Yes, via TypeScript SDK:

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: 'http://localhost:7373',
  apiKey: process.env.GODEL_API_KEY
});

const session = await client.pi.sessions.create({
  agent_id: 'agent_001',
  pi_config: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5'
  }
});
```

---

## Deployment Questions

### How do I deploy to production?

See [DEPLOYMENT.md](../DEPLOYMENT.md) for detailed guides:

1. **Docker:** `docker-compose up -d`
2. **Kubernetes:** `kubectl apply -f k8s/`
3. **Helm:** `helm install godel ./helm/godel`

### How do I update Godel?

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Run migrations
npm run migrate

# Build
npm run build

# Restart
kubectl rollout restart deployment/godel -n godel
```

### How do I backup Godel?

```bash
# Database backup
kubectl exec -it deployment/postgres -n godel -- \
  pg_dump -U godel godel_production > backup.sql

# Or use automated backups
kubectl apply -f k8s/backup-cronjob.yaml
```

---

## Contributing

### How can I contribute?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

### Where do I report bugs?

GitHub Issues: [github.com/davidkimai/godel/issues](https://github.com/davidkimai/godel/issues)

### How do I request features?

GitHub Discussions: [github.com/davidkimai/godel/discussions](https://github.com/davidkimai/godel/discussions)

---

## Support

### Where can I get help?

| Resource | Link |
|----------|------|
| Documentation | [docs/](../) |
| GitHub Issues | [Issues](https://github.com/davidkimai/godel/issues) |
| Discussions | [Discussions](https://github.com/davidkimai/godel/discussions) |
| Email | support@godel-ai.io |

### Is there enterprise support?

Yes! Contact support@godel-ai.io for:
- Dedicated support channels
- SLA guarantees
- Custom feature development
- Training and consulting

---

## Quick Reference

### Common Commands

```bash
# Status
godel status

# List agents
godel agent list

# Create team
godel team create --name my-team --task "implement feature"

# Intent interface
godel do "Add authentication to the API"

# Logs
godel logs tail --follow

# Budget
godel budget status
```

### Important URLs

| Resource | URL |
|----------|-----|
| Repository | https://github.com/davidkimai/godel |
| Documentation | https://github.com/davidkimai/godel/tree/main/docs |
| Issues | https://github.com/davidkimai/godel/issues |
| npm Package | https://www.npmjs.com/package/@jtan15010/godel |

---

**Last Updated:** 2026-02-06  
**Document Version:** 1.0.0
