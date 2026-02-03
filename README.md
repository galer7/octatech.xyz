# Octatech Platform

A modern consulting platform with marketing website, blog, and CRM backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Pages                              │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │   octatech.xyz      │    │   blog.octatech.xyz             │ │
│  │   (Landing Page)    │    │   (Astro Static Blog)           │ │
│  └─────────┬───────────┘    └─────────────────────────────────┘ │
└────────────┼────────────────────────────────────────────────────┘
             │ POST /api/leads
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Railway                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    CRM API Server                           ││
│  │  - Lead Management     - Webhook Dispatch                   ││
│  │  - Authentication      - AI Lead Parsing                    ││
│  │  - API Key Management  - Admin Dashboard UI                 ││
│  └──────────────────────┬──────────────────────────────────────┘│
│  ┌──────────────────────▼──────────────────────────────────────┐│
│  │                   PostgreSQL                                 ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
             │
             │ Webhooks / Notifications
             ▼
┌─────────────────────────────────────────────────────────────────┐
│       Discord  │  Telegram  │  Email (Resend)  │  Cal.com       │
└─────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
octatech.xyz/
├── packages/
│   ├── web/                  # Landing page (HTML/Tailwind)
│   ├── blog/                 # Astro blog for blog.octatech.xyz
│   └── crm/                  # CRM backend + admin UI
│       ├── src/              # Hono API server
│       ├── admin/            # React admin dashboard
│       └── drizzle/          # Database migrations
├── specs/                    # Feature specifications
├── .github/workflows/        # CI/CD pipelines
└── package.json              # Monorepo root
```

## Tech Stack

| Component | Technology | Hosting |
|-----------|------------|---------|
| Landing Page | HTML/Tailwind | GitHub Pages |
| Blog | Astro + Markdown | GitHub Pages |
| CRM Backend | Node.js + Hono + Drizzle ORM | Railway |
| Database | PostgreSQL | Railway |
| Admin UI | React + Tailwind + React Query | Railway |
| Email | Resend | - |
| AI | OpenAI API | - |
| Booking | Cal.com | - |

## Prerequisites

- Node.js >= 20.0.0
- PostgreSQL (local or remote)
- npm

## Local Development

### 1. Clone and Install

```bash
git clone https://github.com/octatech/octatech.xyz.git
cd octatech.xyz
npm install
```

### 2. Configure Environment

Copy the example environment file and configure it:

```bash
cp packages/crm/.env.example packages/crm/.env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (default: 3000) |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Initial admin password |
| `SESSION_SECRET` | 32+ character secret for sessions |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `RESEND_API_KEY` | Resend API key for email notifications |
| `CORS_ORIGIN` | Allowed CORS origin |
| `CRM_BASE_URL` | Base URL for the CRM |

### 3. Setup Database

```bash
# Push schema to database
npm run db:push -w @octatech/crm

# Seed initial admin user and settings
npm run db:seed -w @octatech/crm
```

### 4. Start Development Servers

```bash
# CRM backend (http://localhost:3000)
npm run dev:crm

# Admin UI (http://localhost:5173)
npm run dev:admin

# Blog (http://localhost:4321)
npm run dev:blog
```

## Available Scripts

### Root Level

| Script | Description |
|--------|-------------|
| `npm run dev:crm` | Start CRM backend in dev mode |
| `npm run dev:admin` | Start admin UI in dev mode |
| `npm run dev:blog` | Start blog in dev mode |
| `npm run build` | Build all packages |
| `npm run lint` | Lint all packages |
| `npm run test` | Run tests in all packages |

### CRM Package

| Script | Description |
|--------|-------------|
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes directly |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

## API Overview

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/leads` | Submit lead from contact form |
| `POST` | `/api/webhooks/cal` | Cal.com webhook handler |

### Authenticated Endpoints (API Key)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/me` | Current API key info |
| `GET` | `/api/v1/leads` | List leads (paginated) |
| `GET` | `/api/v1/leads/:id` | Get lead details |
| `POST` | `/api/v1/leads` | Create lead |
| `PATCH` | `/api/v1/leads/:id` | Update lead |
| `DELETE` | `/api/v1/leads/:id` | Delete lead |
| `POST` | `/api/v1/leads/:id/activities` | Add activity |
| `GET` | `/api/v1/leads/:id/activities` | Get activities |
| `POST` | `/api/v1/leads/parse` | Parse lead with AI |

### Admin Endpoints (Session Auth)

| Prefix | Description |
|--------|-------------|
| `/api/auth/*` | Login, logout, password change |
| `/api/admin/api-keys/*` | API key management |
| `/api/admin/webhooks/*` | Webhook management |
| `/api/admin/notifications/*` | Notification channels |
| `/api/admin/settings/*` | System settings |

## Deployment

### Landing Page & Blog

Deployed automatically via GitHub Actions on push to `main`:
- `packages/web/**` changes → deploy to octatech.xyz
- `packages/blog/**` changes → deploy to blog.octatech.xyz

### CRM Backend

Deploy to Railway:

1. Create a new Railway project
2. Add PostgreSQL service
3. Add web service from this repo
4. Configure:
   - Root directory: `packages/crm`
   - Build command: `npm run build`
   - Start command: `npm run start`
5. Set environment variables
6. Configure custom domains (api.octatech.xyz, crm.octatech.xyz)

## Testing

```bash
# Run all tests
npm test

# Run CRM tests only
npm test -w @octatech/crm

# Run with coverage
cd packages/crm && npm run test -- --coverage
```

The CRM package has comprehensive test coverage including:
- Authentication (login, logout, sessions, rate limiting)
- API key validation and scope checking
- Leads API (CRUD, pagination, filtering, AI parsing)
- Webhook delivery and retry logic
- Notification channels (Discord, Telegram, Email)

## Domain Configuration

| Domain | Points To |
|--------|-----------|
| octatech.xyz | GitHub Pages (landing) |
| blog.octatech.xyz | GitHub Pages (blog) |
| api.octatech.xyz | Railway (CRM API) |
| crm.octatech.xyz | Railway (Admin UI) |

## License

Private - All rights reserved.
