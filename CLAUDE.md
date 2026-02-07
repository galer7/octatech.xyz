# Octatech Project

This is the Octatech monorepo containing the company landing page/blog and CRM application.

## Project Structure

```
packages/
├── blog/     # Astro static site (landing page + engineering blog)
└── crm/      # Hono backend + React admin UI
    └── admin/  # React/Vite admin dashboard
```

## Tech Stack

### Blog (`@octatech/blog`)
- Astro 5.x with Tailwind CSS
- Static site generation

### CRM (`@octatech/crm`)
- **Backend**: Hono framework on Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Argon2 password hashing, session-based auth
- **Admin UI**: React + Vite + Tailwind
- **Testing**: Vitest
- **Other**: OpenAI integration, Resend for email, Zod validation

## Common Commands

```bash
# Development
npm run dev:crm      # Start CRM backend (tsx watch)
npm run dev:admin    # Start admin UI (Vite)
npm run dev:blog     # Start blog (Astro)

# Build
npm run build        # Build all workspaces
npm run build:crm    # Build CRM only
npm run build:admin  # Build admin UI only

# Testing
npm run test         # Run all tests
npm run test -w @octatech/crm  # Run CRM tests

# Database (from packages/crm)
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema changes
npm run db:studio    # Open Drizzle Studio
```

## Debugging Tools

### Namecheap DNS Management
`./.claude/tools/namecheap-dns.sh` - Manage DNS records via Namecheap API

```bash
# List all records
./.claude/tools/namecheap-dns.sh list --api-key KEY --api-user USER --domain example.com

# Add a record
./.claude/tools/namecheap-dns.sh add --api-key KEY --api-user USER --domain example.com \
  --type A --host www --value 192.168.1.1

# Update/delete records (use --record-id from list output)
./.claude/tools/namecheap-dns.sh update --api-key KEY --api-user USER --domain example.com \
  --record-id 12345 --value 192.168.1.2
./.claude/tools/namecheap-dns.sh delete --api-key KEY --api-user USER --domain example.com \
  --record-id 12345
```

### Railway Deployment Scripts
Scripts in `./.claude/tools/railway/` for Railway infrastructure management:

| Script | Description |
|--------|-------------|
| `railway-gql.sh` | Base GraphQL helper for Railway API |
| `railway-workspaces.sh` | List Railway workspaces |
| `railway-create-project.sh` | Create a new Railway project |
| `railway-list-services.sh` | List services in a project |
| `railway-create-service.sh` | Create a new service |
| `railway-delete-service.sh` | Delete a service |
| `railway-service-update.sh` | Update service configuration |
| `railway-set-vars.sh` | Set environment variables |
| `railway-deploy.sh` | Trigger a deployment |
| `railway-redeploy.sh` | Redeploy an existing service |
| `railway-deploy-status.sh` | Check deployment status |
| `railway-tail-deploy.sh` | Tail deployment logs in real-time |
| `railway-logs.sh` | View service logs |

See `./.claude/tools/railway/README.md` for detailed usage

## Environment Variables

CRM requires PostgreSQL connection. See `packages/crm/.env.example` for required variables.

### Tool API Keys (`.env.claude`)

Store API keys for debugging tools in `.env.claude` (gitignored):

```bash
# Namecheap DNS
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_API_USER=your_username

# Railway
RAILWAY_API_TOKEN=your_railway_token
```

Tools can be invoked with these env vars:
```bash
# Namecheap
./.claude/tools/namecheap-dns.sh list --api-key $NAMECHEAP_API_KEY --api-user $NAMECHEAP_API_USER --domain octatech.xyz

# Railway (scripts read RAILWAY_API_TOKEN automatically)
./.claude/tools/railway/railway-list-services.sh --project-id $RAILWAY_PROJECT_ID
```
