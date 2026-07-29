# Tradosphere OS — Production Deployment Guide

> Deploy the complete Tradosphere OS stack with SSL, CI/CD, and zero-downtime updates.

## Architecture

```
                         ┌──────────────┐
                         │   Caddy v2    │ ← Let's Encrypt SSL
                         │  Reverse Proxy│
                         └──────┬───────┘
                    ┌───────────┴────────────┐
                    ▼                        ▼
            ┌──────────────┐       ┌─────────────────┐
            │  API Gateway  │       │  Next.js (Web)  │
            │  :4000        │       │  :3000           │
            └──────┬───────┘       └─────────────────┘
        ┌──────────┼──────┬──────────────┬───────┐
        ▼          ▼      ▼              ▼       ▼
    ┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
    │ Auth │ │Market  │ │Edu.    │ │Portfolio│ │Analytics│
    │:4001 │ │Data:4002│ │:4003   │ │:4004   │ │:4005    │
    └──┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └──┬──────┘
       └─────────┼──────────┼──────────┼─────────┘
                 ▼          ▼          ▼
           ┌─────────┐ ┌────────┐ ┌──────────┐
           │Postgres │ │  Redis  │ │ Volumes  │
           │ 16-alp. │ │ 7-alp. │ │ (persist)│
           └─────────┘ └────────┘ └──────────┘
```

## Prerequisites

- **A Linux VPS** (Ubuntu 22.04+ recommended, 4GB RAM min, 8GB+ preferred)
- **A domain name** pointing to your server's IP (A record)
- **Ports 80 and 443** open in your firewall
- **Docker & Docker Compose** installed on the server
- **GitHub account** (for CI/CD and Container Registry)

## Option 1: Quick Manual Deploy (No CI/CD)

### Step 1: Prepare the Server

```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, or run: newgrp docker

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin
```

### Step 2: Copy Files to Server

```bash
# On your local machine, tar the docker/production directory
tar czf tradosphere-deploy.tar.gz docker/production/

# Copy to server
scp tradosphere-deploy.tar.gz user@your-server:~

# On the server
ssh user@your-server
mkdir -p ~/tradosphere
tar xzf tradosphere-deploy.tar.gz -C ~/tradosphere
```

### Step 3: Configure Environment

```bash
cd ~/tradosphere/docker/production
cp .env.production.example .env
nano .env
```

**Required changes in `.env`:**
- `DOMAIN` — your actual domain (e.g., `tradosphere.example.com`)
- `JWT_SECRET` — run `openssl rand -hex 64` and paste the result
- `POSTGRES_PASSWORD` — a strong password

### Step 4: Build Images on Server

```bash
# Only needed if NOT using CI/CD — builds directly on the server
cd ~/tradosphere/docker/production
chmod +x build.sh
./build.sh
```

> ⚠️ Building on the server can take 10-20 minutes on a small VPS.
> Use the CI/CD method below for faster deployments.

### Step 5: Start Everything

```bash
cd ~/tradosphere/docker/production

# Edit Caddyfile: uncomment the production block and replace YOUR_DOMAIN
nano Caddyfile

# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Step 6: Verify

```bash
curl https://your-domain.com/api/health
# → {"status":"ok"}

curl https://your-domain.com
# → Your Tradosphere OS frontend 🎉
```

## Option 2: Full CI/CD Deploy (Recommended)

### Step 1: Set Up GitHub Container Registry

Push your code to GitHub (create a repo first):

```bash
git remote add origin https://github.com/YOUR_USER/tradosphere-os.git
git push -u origin main
```

### Step 2: Add GitHub Secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Your server's IP address |
| `DEPLOY_USER` | SSH username (e.g., `ubuntu`, `root`) |
| `DEPLOY_SSH_KEY` | Your private SSH key (paste the whole file) |
| `DOMAIN` | Your domain name |
| `JWT_SECRET` | `openssl rand -hex 64` — long random string |
| `POSTGRES_PASSWORD` | Strong database password |

### Step 3: Push to Deploy

Push to `main` — the CI/CD pipeline will:
1. ✅ Run lint, build, and all tests
2. 🔨 Build 7 pruned Docker images
3. 📦 Push images to GitHub Container Registry
4. 🚀 SSH into your server, pull new images, restart services

```bash
git add .
git commit -m "feat: some feature"
git push origin main
# → Watch the deployment at Actions tab in GitHub
```

### Step 4: First-Time Server Setup

On your server, you need Docker and Docker Compose:

```bash
# Do this once after CI/CD runs for the first time
git clone https://github.com/YOUR_USER/tradosphere-os.git ~/tradosphere
cd ~/tradosphere/docker/production

# Configure Caddy with your domain
nano Caddyfile
# Uncomment the production block, set YOUR_DOMAIN
# Comment out the localhost block

# Let the CI/CD deploy do the rest on next push
```

## Production Configuration Checklist

### Security

- [ ] `JWT_SECRET` is a long random string (`openssl rand -hex 64`)
- [ ] `POSTGRES_PASSWORD` is strong
- [ ] SSH key authentication only (no password login)
- [ ] Firewall: only ports 22, 80, 443 open
- [ ] Fail2ban installed for SSH protection
- [ ] Automatic security updates enabled

### Monitoring

```bash
# Check all services health
docker compose ps

# View logs in real time
docker compose logs -f

# Check resource usage
docker stats

# API-level health check
curl https://your-domain.com/api/health/services
```

### Backup

```bash
# Backup the PostgreSQL database
docker exec tradosphere-postgres-1 pg_dump -U tradosphere tradosphere_os > backup.sql

# Backup volumes
docker run --rm -v tradosphere_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .
```

### Updating

With CI/CD: just push to `main`.
Without CI/CD:

```bash
cd ~/tradosphere

# Pull latest code
git pull origin main

# Rebuild images
cd docker/production
./build.sh

# Restart
docker compose up -d
```

## Scaling Considerations

| Bottleneck | Symptom | Fix |
|---|---|---|
| Postgres CPU | Slow queries | Add connection pooling (PgBouncer) |
| Redis memory | Evictions | Increase RAM or add Redis cluster |
| API Gateway | 429 rate limits | Increase `GATEWAY_RATE_LIMIT_PER_MIN` |
| Build times | Slow CI/CD | Use GitHub Actions cache (already configured) |

## Rollback

If a deployment fails:

```bash
# On the server
cd ~/tradosphere/docker/production

# Set the previous image tag
export IMAGE_TAG=<previous-commit-sha>

# Restart with the old images
docker compose up -d
```

## Troubleshooting

### "Connection refused" on service startup

Services depend on Postgres/Redis. Give them 30s after `docker compose up -d` — healthchecks handle ordering.

### SSL certificate not provisioning

Caddy needs port 80 accessible from the internet. Check:
```bash
# Port 80 open?
curl -I http://your-domain.com

# Caddy logs
docker compose logs caddy
```

### Out of memory

On a small VPS, you may need to limit Docker memory:
```bash
# In docker-compose.yml, add to any service:
#   deploy:
#     resources:
#       limits:
#         memory: 512M
```
