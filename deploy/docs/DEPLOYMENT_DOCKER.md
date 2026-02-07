# Godel Deployment Guide - Docker Compose

Guide for deploying Godel using Docker Compose for local development and small-scale production.

## Quick Start

### Local Development

```bash
cd deploy/docker

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f godel

# Stop
docker-compose down
```

### With Tracing (Optional)

```bash
# Start with Jaeger for distributed tracing
docker-compose --profile tracing up -d

# Access Jaeger UI at http://localhost:16686
```

## Configuration

### Environment Variables

Create a `.env` file in `deploy/docker/`:

```bash
# API Configuration
GODEL_API_KEY=your_secure_api_key_here
JWT_SECRET=your_jwt_secret_here

# Database (for production docker-compose.prod.yml)
DATABASE_URL=postgresql://user:pass@host:5432/godel
REDIS_URL=redis://host:6379

# Optional
LOG_LEVEL=info
MAX_CONCURRENT_AGENTS=50
```

Generate secure secrets:

```bash
# Generate API key
node -e "console.log('godel_live_' + require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
openssl rand -base64 64
```

## Production Deployment

### Single Server Production

```bash
cd deploy/docker

# Copy and edit environment
cp .env.example .env.production
nano .env.production

# Start production stack
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Scale API replicas
docker-compose -f docker-compose.prod.yml up -d --scale godel=3
```

### With SSL (Let's Encrypt)

```bash
# First run - obtain certificates
docker-compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.com \
  --agree-tos \
  --email your-email@example.com

# Start with SSL
docker-compose -f docker-compose.prod.yml --profile ssl up -d
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                       │
│                                                         │
│  ┌──────────────┐                                       │
│  │   Nginx      │◄─── 80/443 (External)                │
│  │  (Reverse    │                                       │
│  │   Proxy)     │                                       │
│  └──────┬───────┘                                       │
│         │                                               │
│         ▼                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐   │
│  │   Godel API  │───►│  PostgreSQL  │    │  Redis   │   │
│  │   (xN)       │    │              │    │          │   │
│  └──────────────┘    └──────────────┘    └──────────┘   │
│         │                                               │
│         ▼                                               │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │  Prometheus  │───►│   Grafana    │                   │
│  └──────────────┘    └──────────────┘                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Services

### Local Development Stack

| Service | Port | Description |
|---------|------|-------------|
| godel | 7373 | Main API server |
| postgres | 5432 | PostgreSQL database |
| redis | 6379 | Redis cache |
| prometheus | 9090 | Metrics collection |
| grafana | 3000 | Monitoring dashboards |
| jaeger | 16686 | Distributed tracing (optional) |

### Production Stack

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80/443 | Load balancer & SSL termination |
| godel | 7373 | Main API server (scalable) |
| certbot | - | Let's Encrypt certificate renewal |

## Volumes

Data is persisted in Docker volumes:

- `postgres-data` - PostgreSQL database files
- `redis-data` - Redis data files
- `godel-logs` - Application logs
- `prometheus-data` - Prometheus time-series data
- `grafana-data` - Grafana dashboards and settings

## Updating

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d

# Or rebuild locally
docker-compose build --no-cache
docker-compose up -d
```

## Backup and Restore

### Backup

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U godel godel > backup_$(date +%Y%m%d).sql

# Backup Redis
docker-compose exec redis redis-cli SAVE
docker cp $(docker-compose ps -q redis):/data/dump.rdb redis_backup_$(date +%Y%m%d).rdb
```

### Restore

```bash
# Restore PostgreSQL
docker-compose exec -T postgres psql -U godel godel < backup_20240101.sql

# Restore Redis
docker cp redis_backup_20240101.rdb $(docker-compose ps -q redis):/data/dump.rdb
docker-compose restart redis
```

## Monitoring

### View Metrics

```bash
# Prometheus UI
open http://localhost:9090

# Grafana Dashboard
open http://localhost:3000
# Default: admin/admin
```

### Health Checks

```bash
# API health
curl http://localhost:7373/health

# Full health check with dependencies
curl http://localhost:7373/ready
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs godel

# Check for port conflicts
lsof -i :7373

# Restart with rebuild
docker-compose up -d --build --force-recreate godel
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Reset database (WARNING: data loss)
docker-compose down -v
docker-compose up -d postgres
```

### Out of Disk Space

```bash
# Clean up unused images
docker system prune -a

# Check volume usage
docker system df -v

# Resize volumes (if needed)
# See Docker documentation for your platform
```

## Security Considerations

### Production Checklist

- [ ] Change default Grafana password
- [ ] Set strong GODEL_API_KEY and JWT_SECRET
- [ ] Enable SSL/TLS with valid certificates
- [ ] Configure firewall rules
- [ ] Enable Docker Content Trust
- [ ] Regular security updates
- [ ] Backup encryption

### Running as Non-Root

The production Dockerfile runs as user ID 1001 (godel). Ensure:

```bash
# Check file permissions
ls -la deploy/docker/nginx/ssl/

# Fix if needed
chmod 600 deploy/docker/nginx/ssl/*.pem
```

## Advanced Configuration

### Custom Nginx Config

Edit `deploy/docker/nginx/nginx.conf`:

```nginx
# Add custom locations
location /custom {
    proxy_pass http://backend;
}
```

Then restart:

```bash
docker-compose restart nginx
```

### Environment-Specific Overrides

Create `docker-compose.override.yml`:

```yaml
version: '3.8'
services:
  godel:
    environment:
      CUSTOM_VAR: value
    volumes:
      - ./custom-config:/app/config
```

## Migration from Docker Compose to Kubernetes

When ready to scale:

1. Export data from Docker volumes
2. Deploy to Kubernetes using Helm
3. Import data to managed database
4. Update DNS to point to Kubernetes ingress

See the [Kubernetes deployment guide](./README.md) for details.
