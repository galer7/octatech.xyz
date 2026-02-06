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

Use scripts from `~/.claude/scripts/` for debugging:
<!-- TODO: Document specific scripts available -->

## Environment Variables

CRM requires PostgreSQL connection. See `packages/crm/.env.example` for required variables.
