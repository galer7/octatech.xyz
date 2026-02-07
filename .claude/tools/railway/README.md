# Railway CLI Scripts

Reusable scripts for Railway deployments via GraphQL API.

## Setup

1. Get a Railway API token from https://railway.app/account/tokens
2. Set `RAILWAY_TOKEN` in your shell or project's `.env.claude`

```bash
export RAILWAY_TOKEN=your-token-here
```

## Scripts

### Project Management

#### railway-workspaces.sh
List workspaces for the authenticated user.

```bash
~/.claude/scripts/railway/railway-workspaces.sh
```

#### railway-create-project.sh
Create a new Railway project.

```bash
~/.claude/scripts/railway/railway-create-project.sh my-app
```

#### railway-list-services.sh
List all services in a project.

```bash
~/.claude/scripts/railway/railway-list-services.sh <project-id>
```

### Service Management

#### railway-create-service.sh
Create a service in an existing project.

```bash
~/.claude/scripts/railway/railway-create-service.sh \
  --project abc123 \
  --name api \
  --root-dir apps/backend \
  --github user/repo \
  --volume /data
```

Options:
- `--project, -p` (required): Railway project ID
- `--name, -n` (required): Service name
- `--root-dir, -r`: Build root directory
- `--github, -g`: GitHub repo to connect
- `--branch, -b`: GitHub branch (default: main)
- `--volume, -v`: Mount path for persistent volume

#### railway-service-update.sh
Update service configuration (root dir, restart policy, healthcheck).

```bash
~/.claude/scripts/railway/railway-service-update.sh \
  --project abc123 \
  --service api \
  --root-dir / \
  --restart-policy ON_FAILURE \
  --max-retries 10 \
  --healthcheck-path /health
```

#### railway-delete-service.sh
Delete a service.

```bash
~/.claude/scripts/railway/railway-delete-service.sh \
  --project abc123 \
  --service old-service \
  --force
```

### Environment Variables

#### railway-set-vars.sh
Set environment variables for a service.

```bash
# Individual variables
~/.claude/scripts/railway/railway-set-vars.sh \
  -p <project-id> -s <service-id> -e <env-id> \
  DATABASE_URL=postgres://... NODE_ENV=production

# From file
~/.claude/scripts/railway/railway-set-vars.sh \
  -p <project-id> -s <service-id> -e <env-id> \
  --file .env.production
```

### Deployment

#### railway-deploy.sh
Trigger a deployment.

```bash
~/.claude/scripts/railway/railway-deploy.sh \
  --project abc123 \
  --service api
```

#### railway-redeploy.sh
Trigger a redeploy using the latest commit.

```bash
~/.claude/scripts/railway/railway-redeploy.sh \
  --project abc123 \
  --service api
```

#### railway-deploy-status.sh
Check deployment status, optionally wait for completion.

```bash
# Check current status
~/.claude/scripts/railway/railway-deploy-status.sh \
  --project abc123 \
  --service api

# Wait for deployment to complete (with timeout)
~/.claude/scripts/railway/railway-deploy-status.sh \
  --project abc123 \
  --service api \
  --wait \
  --timeout 300
```

Exit codes:
- `0` - Deployment successful
- `1` - Deployment failed/crashed
- `2` - Timeout waiting

### Logs

#### railway-logs.sh
Get deployment or build logs (snapshot).

```bash
~/.claude/scripts/railway/railway-logs.sh \
  --project abc123 \
  --service api \
  --type build \
  --lines 200
```

#### railway-tail-deploy.sh
Tail deployment logs in real-time (polls every few seconds).

```bash
~/.claude/scripts/railway/railway-tail-deploy.sh \
  --project abc123 \
  --service api \
  --type build \
  --interval 3
```

Press Ctrl+C to stop tailing.

## Typical Workflow

```bash
# 1. Check workspaces
~/.claude/scripts/railway/railway-workspaces.sh

# 2. Create project
~/.claude/scripts/railway/railway-create-project.sh my-app

# 3. Create services
~/.claude/scripts/railway/railway-create-service.sh \
  --project <project-id> \
  --name backend \
  --github user/repo

# 4. Set environment variables
~/.claude/scripts/railway/railway-set-vars.sh \
  -p <project-id> -s <service-id> -e <env-id> \
  --file .env.production

# 5. Monitor deployment
~/.claude/scripts/railway/railway-tail-deploy.sh \
  --project <project-id> \
  --service backend \
  --type build

# 6. Check status
~/.claude/scripts/railway/railway-deploy-status.sh \
  --project <project-id> \
  --service backend

# 7. Redeploy if needed
~/.claude/scripts/railway/railway-redeploy.sh \
  --project <project-id> \
  --service backend
```

## Quick Reference

| Script | Purpose |
|--------|---------|
| `railway-workspaces.sh` | List user workspaces |
| `railway-create-project.sh` | Create new project |
| `railway-list-services.sh` | List services in project |
| `railway-create-service.sh` | Create new service |
| `railway-service-update.sh` | Update service config |
| `railway-delete-service.sh` | Delete a service |
| `railway-set-vars.sh` | Set env vars |
| `railway-deploy.sh` | Trigger deploy |
| `railway-redeploy.sh` | Redeploy latest commit |
| `railway-deploy-status.sh` | Check deploy status |
| `railway-logs.sh` | Get logs (snapshot) |
| `railway-tail-deploy.sh` | Tail logs (real-time) |
