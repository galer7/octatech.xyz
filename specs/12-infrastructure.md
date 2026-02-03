# Infrastructure & Deployment Specification

## Overview

Deployment architecture using GitHub Pages for static sites and Railway for the CRM backend/database.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         GitHub                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Repository: octatech.xyz                                ││
│  │ ├── packages/web/     → GitHub Pages (octatech.xyz)     ││
│  │ ├── packages/blog/    → GitHub Pages (blog.octatech.xyz)││
│  │ └── packages/crm/     → Railway (api.octatech.xyz)      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  GitHub Pages   │ │  GitHub Pages   │ │    Railway      │
│  octatech.xyz   │ │blog.octatech.xyz│ │api.octatech.xyz │
│  (Landing Page) │ │    (Blog)       │ │crm.octatech.xyz │
└─────────────────┘ └─────────────────┘ └────────┬────────┘
                                                  │
                                                  ▼
                                         ┌─────────────────┐
                                         │   PostgreSQL    │
                                         │   (Railway)     │
                                         └─────────────────┘
```

## GitHub Pages Deployment

### Landing Page (octatech.xyz)

**Workflow: `.github/workflows/deploy-web.yml`**

```yaml
name: Deploy Landing Page

on:
  push:
    branches: [main]
    paths:
      - 'packages/web/**'
      - '.github/workflows/deploy-web.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'packages/web'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Blog (blog.octatech.xyz)

**Workflow: `.github/workflows/deploy-blog.yml`**

```yaml
name: Deploy Blog

on:
  push:
    branches: [main]
    paths:
      - 'packages/blog/**'
      - '.github/workflows/deploy-blog.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'packages/blog/package-lock.json'

      - name: Install dependencies
        run: npm ci
        working-directory: packages/blog

      - name: Build
        run: npm run build
        working-directory: packages/blog

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'packages/blog/dist'

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages-blog
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Note:** For multiple GitHub Pages sites, you may need to use separate repositories or a custom deployment approach. Alternative: deploy blog to a `/blog` path on the main site.

## Railway Deployment

### CRM Backend

**Service: `octatech-crm`**

Railway auto-deploys from the `packages/crm` directory when changes are pushed.

**railway.json:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build",
    "watchPatterns": ["packages/crm/**"]
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/v1/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Dockerfile (alternative):**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY packages/crm/package*.json ./
RUN npm ci --only=production

COPY packages/crm/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### PostgreSQL

Railway managed PostgreSQL instance.

**Connection:**
- Use `DATABASE_URL` environment variable (auto-set by Railway)
- SSL required for production

### Environment Variables

Set in Railway dashboard:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Auto-set by Railway |
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3000` (auto-set) |
| `ADMIN_EMAIL` | Initial admin email | `admin@octatech.xyz` |
| `ADMIN_PASSWORD` | Initial admin password | Set securely |
| `SESSION_SECRET` | Session signing key | 32+ random chars |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `RESEND_API_KEY` | Resend API key | `re_...` |
| `CORS_ORIGIN` | Allowed origins | `https://octatech.xyz` |
| `CRM_BASE_URL` | CRM URL for email links | `https://crm.octatech.xyz` |

## Domain Configuration

### DNS Records

| Domain | Type | Value | Notes |
|--------|------|-------|-------|
| `octatech.xyz` | A | 185.199.108.153 | GitHub Pages IP |
| `octatech.xyz` | A | 185.199.109.153 | GitHub Pages IP |
| `octatech.xyz` | A | 185.199.110.153 | GitHub Pages IP |
| `octatech.xyz` | A | 185.199.111.153 | GitHub Pages IP |
| `www.octatech.xyz` | CNAME | `octatech.xyz` | Redirect |
| `blog.octatech.xyz` | CNAME | `galer7.github.io` | GitHub Pages |
| `api.octatech.xyz` | CNAME | `*.up.railway.app` | Railway |
| `crm.octatech.xyz` | CNAME | `*.up.railway.app` | Railway (same service) |

### SSL/TLS

- **GitHub Pages**: Automatic via Let's Encrypt
- **Railway**: Automatic via Railway's managed SSL

## Monorepo Structure

```
octatech.xyz/
├── .github/
│   └── workflows/
│       ├── deploy-web.yml
│       ├── deploy-blog.yml
│       └── ci.yml
├── packages/
│   ├── web/                    # Landing page
│   │   ├── index.html
│   │   ├── assets/
│   │   └── CNAME
│   ├── blog/                   # Astro blog
│   │   ├── src/
│   │   ├── astro.config.mjs
│   │   └── package.json
│   └── crm/                    # CRM backend
│       ├── src/
│       ├── migrations/
│       ├── package.json
│       └── tsconfig.json
├── specs/                      # Specifications
├── package.json               # Root package.json (workspace)
├── railway.json
└── README.md
```

### Root package.json

```json
{
  "name": "octatech",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:crm": "npm run dev -w packages/crm",
    "dev:blog": "npm run dev -w packages/blog",
    "build:crm": "npm run build -w packages/crm",
    "build:blog": "npm run build -w packages/blog",
    "lint": "npm run lint --workspaces",
    "test": "npm run test --workspaces"
  }
}
```

## CI/CD Pipeline

### CI Workflow (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run build -w packages/crm

      - name: Test
        run: npm test
        env:
          DATABASE_URL: postgresql://test@localhost/test
```

## Monitoring & Logging

### Railway

- Built-in logging (accessible via Railway dashboard)
- Health check endpoint: `/api/v1/health`
- Automatic restarts on crash

### Recommended Additions

1. **Error tracking**: Sentry
2. **Uptime monitoring**: Better Uptime, UptimeRobot
3. **Analytics**: Plausible, PostHog

## Backup Strategy

### Database Backups

Railway provides automatic daily backups. For additional safety:

1. **Scheduled exports**: Weekly pg_dump to cloud storage
2. **Point-in-time recovery**: Available on Railway Pro

```bash
# Manual backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

## Scaling Considerations

### Current Setup (Starter)

| Resource | Limit |
|----------|-------|
| Railway compute | 512 MB RAM, shared CPU |
| PostgreSQL | 1 GB storage |
| GitHub Pages | Soft limits on bandwidth |

### Growth Path

1. **More traffic**: Upgrade Railway plan, add CDN (Cloudflare)
2. **More data**: Upgrade PostgreSQL plan
3. **More features**: Add Redis for caching, queues

## Security

### Secrets Management

- Environment variables in Railway (encrypted at rest)
- GitHub Secrets for CI/CD
- Never commit secrets to repository

### Network Security

- HTTPS everywhere (enforced)
- CORS configured to allow only known origins
- Rate limiting on API endpoints

## Inputs

| Input | Source |
|-------|--------|
| Code push | GitHub repository |
| Environment variables | Railway dashboard |
| Domain configuration | DNS provider |

## Outputs

| Output | Destination |
|--------|-------------|
| Static site | GitHub Pages |
| API server | Railway |
| Database | Railway PostgreSQL |

## Success Criteria

1. **Reliability**: 99.9% uptime
2. **Performance**: Page load < 2s, API response < 200ms
3. **Deployment**: Push to main triggers deploy < 5 minutes
4. **Recovery**: Can restore from backup within 1 hour

## Testing

| Test | Method |
|------|--------|
| Deployment | Push change, verify live within 5 minutes |
| Health check | Verify `/api/v1/health` returns 200 |
| SSL | Verify HTTPS works for all domains |
| Database connection | Verify API can query database |
| Environment variables | Verify secrets not exposed in logs |
