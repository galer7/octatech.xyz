# Octatech Platform - Implementation Fix Plan

> Generated from gap analysis comparing source code against specs/*.
> Priority: Items are ordered by dependency (build foundations first).
> Status: Items represent work that is NOT YET IMPLEMENTED.

---

## Phase 1: Repository Structure & Infrastructure Foundation ✅ COMPLETED

### 1.1 Monorepo Setup ✅
- [x] Create `packages/` directory structure
- [x] Create `packages/web/` directory and move landing page files (index.html, assets/)
- [x] Create `packages/blog/` directory for Astro blog
- [x] Create `packages/crm/` directory for backend + admin UI
- [x] Update root `package.json` to use npm workspaces
- [x] Create workspace-level scripts (dev, build, lint, test)

### 1.2 CRM Package Initialization ✅
- [x] Initialize `packages/crm/package.json` with dependencies:
  - hono (web framework)
  - @hono/node-server
  - postgres (PostgreSQL client via postgres.js)
  - drizzle-orm + drizzle-kit (ORM and migrations)
  - @node-rs/argon2 (password hashing)
  - openai (AI features)
  - resend (email notifications)
  - zod (validation)
- [x] Create `packages/crm/tsconfig.json`
- [x] Create `packages/crm/src/index.ts` entry point
- [x] Create `packages/crm/src/app.ts` with Hono app, middleware, and health check
- [x] Create `packages/crm/.env.example` with required environment variables
- [x] Create `packages/crm/drizzle.config.ts`

### 1.3 Railway Configuration ✅
- [x] Create `railway.json` for CRM deployment
- [x] Configure build and start commands
- [x] Configure health check endpoint

### 1.4 Blog Package Initialization ✅ (Added)
- [x] Initialize `packages/blog/package.json` with Astro dependencies
- [x] Create `packages/blog/astro.config.mjs` with site URL and integrations
- [x] Create content collection schema for posts
- [x] Create layouts (BaseLayout, PostLayout)
- [x] Create pages (index, posts/[slug], tags/[tag], rss.xml)
- [x] Create sample welcome blog post
- [x] Create CNAME for blog.octatech.xyz

### 1.5 GitHub Workflows ✅ (Added)
- [x] Update deploy-web.yml for packages/web deployment
- [x] Create deploy-blog.yml for packages/blog deployment
- [x] Create ci.yml for pull request checks

---

## Phase 2: Database Schema & Migrations ✅ COMPLETED

### 2.1 PostgreSQL Schema Setup ✅
- [x] Create `packages/crm/src/db/schema.ts` with Drizzle schema definitions
- [x] Define `leads` table (id, name, email, company, phone, budget, project_type, message, source, status, notes, tags, raw_input, ai_parsed, timestamps)
- [x] Define `lead_activities` table (id, lead_id, type, description, old_status, new_status, timestamps)
- [x] Define `api_keys` table (id, name, key_hash, key_prefix, scopes, last_used_at, timestamps, revoked_at)
- [x] Define `webhooks` table (id, name, url, events, secret, enabled, tracking fields, timestamps)
- [x] Define `webhook_deliveries` table (id, webhook_id, event, payload, status_code, response_body, timing)
- [x] Define `notification_channels` table (id, type, name, config, events, enabled, timestamps)
- [x] Define `settings` table (key, value, updated_at)
- [x] Define `admin_user` table (id, email, password_hash, timestamps)
- [x] Define `sessions` table (id, user_id, token_hash, expires_at, metadata, timestamps)

### 2.2 Database Connection & Migrations ✅
- [x] Create `packages/crm/src/db/connection.ts` with PostgreSQL pool
- [x] Create `packages/crm/drizzle.config.ts`
- [x] Generate initial migration files
- [x] Create seed script for initial admin user and default settings
- [x] Add npm scripts for running migrations (db:generate, db:migrate, db:push, db:seed)

### 2.3 Database Tests ✅ (Added)
- [x] Create vitest configuration
- [x] Add comprehensive schema tests for constraints, foreign keys, cascades
- [x] Add tests for indexes and relations
- [x] Add unit tests for enum values and type exports

---

## Phase 3: CRM Backend Core ✅ COMPLETED

### 3.1 Hono Server Setup ✅
- [x] Create `packages/crm/src/app.ts` with Hono app initialization
- [x] Configure CORS middleware (allow octatech.xyz origin, expose rate limit headers)
- [x] Configure JSON body parsing (built into Hono)
- [x] Configure request logging
- [x] Create error handling middleware (`packages/crm/src/middleware/error-handler.ts`)
  - Handles custom ApiError instances with proper status codes
  - Handles Zod validation errors with field-level details
  - Returns consistent JSON error responses per API spec
- [x] Create rate limiting middleware (`packages/crm/src/middleware/rate-limit.ts`)
  - 100 requests/minute for authenticated requests (API key)
  - 10 requests/minute for unauthenticated requests (by IP)
  - 5 requests/15 minutes for login attempts
  - Includes X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers

### 3.2 Health Check Endpoint ✅
- [x] Implement `GET /api/v1/health` endpoint
- [x] Return status ("healthy"), version, timestamp per API spec

### 3.3 Error Classes ✅ (Added)
- [x] Create `packages/crm/src/lib/errors.ts` with custom error classes
  - ApiError base class
  - BadRequestError (400)
  - ValidationError (400)
  - UnauthorizedError (401)
  - InvalidApiKeyError (401)
  - InsufficientScopeError (403)
  - NotFoundError (404)
  - RateLimitedError (429)
  - InternalError (500)

### 3.4 Tests ✅ (Added)
- [x] Add comprehensive tests for error classes
- [x] Add comprehensive tests for rate limiting middleware
- [x] Add comprehensive tests for app endpoints (health, 404, CORS)

---

## Phase 4: Authentication System ✅ COMPLETED

### 4.1 Password Utilities ✅
- [x] Create `packages/crm/src/lib/password.ts`
- [x] Implement password hashing with Argon2id
- [x] Implement password verification
- [x] Implement password strength validation (12+ chars, uppercase, lowercase, number, special char)

### 4.2 Session Management ✅
- [x] Create `packages/crm/src/lib/session.ts`
- [x] Implement secure token generation (32 random bytes, base64url)
- [x] Implement session creation with configurable expiry (24h default, 30d for remember me)
- [x] Implement session validation and refresh
- [x] Implement session cleanup (expired sessions)

### 4.3 Auth Endpoints ✅
- [x] Create `packages/crm/src/routes/auth.ts`
- [x] Implement `POST /api/auth/login` (validate credentials, create session, set httpOnly cookie)
- [x] Implement `POST /api/auth/logout` (delete session, clear cookie)
- [x] Implement `GET /api/auth/me` (return current user if authenticated)
- [x] Implement `POST /api/auth/change-password` (require current password)

### 4.4 Auth Middleware ✅
- [x] Create `packages/crm/src/middleware/auth.ts`
- [x] Implement session validation middleware for admin routes
- [x] Implement rate limiting on login attempts (5 per 15 minutes)
- [x] Implement account lockout after failed attempts

### 4.5 Tests ✅ (Added)
- [x] Add comprehensive tests for password utilities
- [x] Add comprehensive tests for session management
- [x] Add comprehensive tests for auth middleware
- [x] Add comprehensive tests for auth routes

---

## Phase 5: API Key Management

### 5.1 API Key Utilities
- [ ] Create `packages/crm/src/lib/api-keys.ts`
- [ ] Implement key generation (`oct_` prefix + 32 base62 chars)
- [ ] Implement SHA-256 hashing for storage
- [ ] Implement key validation against database
- [ ] Implement scope checking (leads:read, leads:write, leads:delete, leads:*)

### 5.2 API Key Middleware
- [ ] Create `packages/crm/src/middleware/api-key.ts`
- [ ] Extract Bearer token from Authorization header
- [ ] Validate key and check scopes
- [ ] Update last_used_at timestamp
- [ ] Return 401/403 for invalid/insufficient permissions

### 5.3 Admin API Key Endpoints
- [ ] Create `packages/crm/src/routes/admin/api-keys.ts`
- [ ] Implement `GET /api/admin/api-keys` (list all keys with prefix, name, scopes, last used)
- [ ] Implement `POST /api/admin/api-keys` (create key, return full key once)
- [ ] Implement `PATCH /api/admin/api-keys/:id` (update name/scopes)
- [ ] Implement `DELETE /api/admin/api-keys/:id` (revoke key)

---

## Phase 6: Leads API (Public)

### 6.1 Lead Validation
- [ ] Create `packages/crm/src/lib/validation.ts`
- [ ] Define Zod schemas for lead creation/update
- [ ] Validate email format
- [ ] Validate status values (new, contacted, qualified, proposal, won, lost)
- [ ] Validate budget and projectType against allowed values

### 6.2 Lead Endpoints
- [ ] Create `packages/crm/src/routes/api/leads.ts`
- [ ] Implement `GET /api/v1/leads` (list with pagination, filtering, search, sort)
- [ ] Implement `GET /api/v1/leads/:id` (get single lead with activities)
- [ ] Implement `POST /api/v1/leads` (create lead, trigger notifications)
- [ ] Implement `PATCH /api/v1/leads/:id` (update lead, log status changes)
- [ ] Implement `DELETE /api/v1/leads/:id` (delete lead)
- [ ] Implement `POST /api/v1/leads/:id/activities` (add activity to lead)

### 6.3 Lead Creation from Contact Form
- [ ] Create `packages/crm/src/routes/api/public-leads.ts`
- [ ] Implement `POST /api/leads` (public endpoint for contact form)
- [ ] Implement honeypot validation (reject if website field is filled)
- [ ] Return success response even for honeypot (silent rejection)

### 6.4 API Info Endpoint
- [ ] Implement `GET /api/v1/me` (return info about current API key)

---

## Phase 7: Webhook System

### 7.1 Webhook Dispatcher
- [ ] Create `packages/crm/src/lib/webhooks.ts`
- [ ] Implement webhook payload formatting for each event type
- [ ] Implement HMAC-SHA256 signature generation
- [ ] Implement async webhook delivery with timeout (30s)
- [ ] Implement retry logic with exponential backoff (1m, 5m, 30m, 2h, 24h)
- [ ] Implement delivery logging to webhook_deliveries table
- [ ] Implement failure tracking and auto-disable after 10 consecutive failures

### 7.2 Event Triggers
- [ ] Create event dispatcher for `lead.created`
- [ ] Create event dispatcher for `lead.updated`
- [ ] Create event dispatcher for `lead.status_changed`
- [ ] Create event dispatcher for `lead.deleted`
- [ ] Create event dispatcher for `lead.activity_added`

### 7.3 Admin Webhook Endpoints
- [ ] Create `packages/crm/src/routes/admin/webhooks.ts`
- [ ] Implement `GET /api/admin/webhooks` (list all webhooks)
- [ ] Implement `POST /api/admin/webhooks` (create webhook)
- [ ] Implement `PATCH /api/admin/webhooks/:id` (update webhook)
- [ ] Implement `DELETE /api/admin/webhooks/:id` (delete webhook)
- [ ] Implement `POST /api/admin/webhooks/:id/test` (send test payload)
- [ ] Implement `GET /api/admin/webhooks/:id/deliveries` (delivery history)

---

## Phase 8: Notification Channels

### 8.1 Discord Notifications
- [ ] Create `packages/crm/src/lib/notifications/discord.ts`
- [ ] Implement Discord embed message formatting
- [ ] Implement Discord webhook POST request

### 8.2 Telegram Notifications
- [ ] Create `packages/crm/src/lib/notifications/telegram.ts`
- [ ] Implement Telegram HTML message formatting
- [ ] Implement Telegram Bot API sendMessage request

### 8.3 Email Notifications (Resend)
- [ ] Create `packages/crm/src/lib/notifications/email.ts`
- [ ] Implement HTML email template for new leads
- [ ] Implement Resend API integration

### 8.4 Notification Dispatcher
- [ ] Create `packages/crm/src/lib/notifications/dispatcher.ts`
- [ ] Query enabled channels for event type
- [ ] Dispatch to each channel asynchronously
- [ ] Handle failures gracefully (don't block main operation)

### 8.5 Admin Notification Endpoints
- [ ] Create `packages/crm/src/routes/admin/notifications.ts`
- [ ] Implement `GET /api/admin/notifications` (list channels)
- [ ] Implement `POST /api/admin/notifications` (create channel)
- [ ] Implement `PATCH /api/admin/notifications/:id` (update channel)
- [ ] Implement `DELETE /api/admin/notifications/:id` (delete channel)
- [ ] Implement `POST /api/admin/notifications/:id/test` (send test notification)

---

## Phase 9: AI Features

### 9.1 OpenAI Integration
- [ ] Create `packages/crm/src/lib/ai/openai.ts`
- [ ] Configure OpenAI client with API key from settings/env
- [ ] Implement lead parsing system prompt
- [ ] Implement field extraction with gpt-4o-mini
- [ ] Implement budget/projectType mapping to predefined options
- [ ] Return confidence score and extracted fields list

### 9.2 AI Lead Parsing Endpoint
- [ ] Implement `POST /api/v1/leads/parse` in leads routes
- [ ] Accept text input (max 5000 chars)
- [ ] Return parsed lead data with confidence
- [ ] Support `autoSave: true` option to create lead immediately
- [ ] Store raw_input and set ai_parsed flag

---

## Phase 10: Admin UI (React)

### 10.1 Admin UI Setup
- [ ] Create `packages/crm/admin/` directory
- [ ] Initialize Vite + React + TypeScript
- [ ] Configure Tailwind CSS (dark theme, indigo accent)
- [ ] Install React Router, React Query, date-fns
- [ ] Create API client with auth handling

### 10.2 Authentication Pages
- [ ] Create Login page (`/login`)
- [ ] Implement login form with email/password
- [ ] Implement "Remember me" checkbox
- [ ] Implement auth redirect (unauthenticated → login)

### 10.3 Dashboard Page
- [ ] Create Dashboard page (`/`)
- [ ] Display lead count by status
- [ ] Display recent leads list
- [ ] Add quick action buttons (Add Lead, AI Add)

### 10.4 Lead Management Pages
- [ ] Create Lead List page (`/leads`)
- [ ] Implement search, filter by status, sort
- [ ] Implement pagination
- [ ] Create Lead Detail page (`/leads/:id`)
- [ ] Display lead info, status buttons, activity timeline
- [ ] Implement edit lead modal
- [ ] Implement add note form
- [ ] Implement delete confirmation
- [ ] Create Add Lead page (`/leads/new`)
- [ ] Create AI Add Lead page (`/leads/ai`)
- [ ] Implement textarea for pasting text
- [ ] Implement "Parse with AI" button
- [ ] Display extracted fields for editing before save

### 10.5 API Key Management Page
- [ ] Create API Keys page (`/api-keys`)
- [ ] Display keys with prefix, name, scopes, last used
- [ ] Implement create key modal (show full key once)
- [ ] Implement revoke confirmation

### 10.6 Webhook Management Pages
- [ ] Create Webhooks page (`/webhooks`)
- [ ] Display webhooks with status, events
- [ ] Implement create/edit webhook modal
- [ ] Implement enable/disable toggle
- [ ] Implement test webhook button
- [ ] Create Webhook Deliveries page (`/webhooks/:id/deliveries`)

### 10.7 Notification Channels Page
- [ ] Create Notifications page (`/notifications`)
- [ ] Display Discord, Telegram, Email channels
- [ ] Implement configure modal for each type
- [ ] Implement enable/disable toggle
- [ ] Implement test notification button

### 10.8 Settings Page
- [ ] Create Settings page (`/settings`)
- [ ] Implement Cal.com link setting
- [ ] Implement OpenAI API key setting (masked display)
- [ ] Implement change password form

### 10.9 Admin UI Build Integration
- [ ] Configure Vite to build to `packages/crm/dist/admin`
- [ ] Serve admin UI from Hono backend at `/admin/*`

---

## Phase 11: Landing Page Updates

### 11.1 Contact Form Implementation
- [ ] Create contact form section in `packages/web/index.html`
- [ ] Add form fields: name, email, company, phone, budget (dropdown), projectType (dropdown), message, source (dropdown)
- [ ] Add honeypot field (hidden `website` input)
- [ ] Implement client-side validation
- [ ] Implement form submission to `https://api.octatech.xyz/api/leads`
- [ ] Implement loading state during submission
- [ ] Implement success message display
- [ ] Implement error handling with user-friendly messages

### 11.2 Cal.com Integration
- [ ] Add Cal.com embed script to `<head>`
- [ ] Configure Cal.com UI (dark theme, indigo brand color)
- [ ] Update "Book consultation" button in header with `data-cal-link`
- [ ] Update "Talk to an architect" button in hero with `data-cal-link`
- [ ] Update "Book a call" button in Dedicated Team card with `data-cal-link`
- [ ] Update "Book call" button in CTA section with `data-cal-link`

### 11.3 Fix Dead Links
- [ ] Update "Client Portal" link (href="#" → actual URL or remove)
- [ ] Update "View our work" link (href="#" → #case-studies or portfolio)
- [ ] Update "See client results" link (href="#" → case studies)
- [ ] Update footer links (Services, Careers, Privacy, Terms) or remove

### 11.4 Cal.com Webhook Handler
- [ ] Implement `POST /api/webhooks/cal` endpoint in CRM backend
- [ ] Parse Cal.com BOOKING_CREATED webhook payload
- [ ] Create lead from booking data if not exists
- [ ] Add activity to existing lead if found

---

## Phase 12: Blog System

### 12.1 Astro Blog Setup
- [ ] Initialize `packages/blog/package.json` with Astro dependencies
- [ ] Create `packages/blog/astro.config.mjs`
- [ ] Configure site URL (blog.octatech.xyz)
- [ ] Configure Tailwind CSS integration
- [ ] Configure sitemap generation
- [ ] Configure RSS feed generation

### 12.2 Blog Layouts
- [ ] Create `packages/blog/src/layouts/BaseLayout.astro`
- [ ] Match Octatech dark theme styling
- [ ] Include navigation to main site
- [ ] Create `packages/blog/src/layouts/PostLayout.astro`
- [ ] Include post metadata (title, date, author, tags)
- [ ] Include reading time estimate

### 12.3 Blog Pages
- [ ] Create `packages/blog/src/pages/index.astro` (article listing with pagination)
- [ ] Create `packages/blog/src/pages/posts/[slug].astro` (individual articles)
- [ ] Create `packages/blog/src/pages/tags/[tag].astro` (articles by tag)
- [ ] Create `packages/blog/src/pages/rss.xml.js` (RSS feed)

### 12.4 Content Collection
- [ ] Configure content collection in `packages/blog/src/content/config.ts`
- [ ] Define article frontmatter schema (title, description, date, tags, author, draft, image)
- [ ] Create `packages/blog/src/content/posts/` directory
- [ ] Create sample blog post

### 12.5 Blog Assets
- [ ] Create `packages/blog/public/images/` directory
- [ ] Add CNAME file for blog.octatech.xyz

---

## Phase 13: CI/CD & Deployment

### 13.1 Landing Page Deployment
- [ ] Update `.github/workflows/static.yml` to deploy from `packages/web/`
- [ ] Or create new `.github/workflows/deploy-web.yml`
- [ ] Ensure CNAME is preserved

### 13.2 Blog Deployment
- [ ] Create `.github/workflows/deploy-blog.yml`
- [ ] Build Astro blog on push to main (packages/blog/** changes)
- [ ] Deploy to GitHub Pages with blog.octatech.xyz CNAME
- [ ] Note: May need separate repo or subdirectory deployment strategy

### 13.3 CI Pipeline
- [ ] Create `.github/workflows/ci.yml`
- [ ] Run lint on pull requests
- [ ] Run type checking (tsc)
- [ ] Run tests (when added)
- [ ] Build verification for all packages

### 13.4 CRM Deployment (Railway)
- [ ] Configure Railway service for packages/crm
- [ ] Set environment variables in Railway dashboard
- [ ] Configure custom domain (api.octatech.xyz, crm.octatech.xyz)
- [ ] Configure PostgreSQL addon
- [ ] Run initial migrations

---

## Phase 14: Testing & Documentation

### 14.1 API Tests
- [ ] Add test framework (vitest or jest)
- [ ] Write tests for auth endpoints
- [ ] Write tests for leads API endpoints
- [ ] Write tests for API key validation
- [ ] Write tests for webhook delivery

### 14.2 Documentation
- [ ] Update README.md with project structure
- [ ] Document local development setup
- [ ] Document deployment process
- [ ] Document environment variables

---

## Notes

### Dependencies Between Phases
- Phase 2 (Database) must complete before Phases 3-9
- Phase 3 (Server) must complete before Phases 4-9
- Phase 4 (Auth) must complete before Phase 10 (Admin UI)
- Phase 5 (API Keys) must complete before Phase 6 (Leads API)
- Phase 6 (Leads API) should complete before Phase 11 (Contact Form)
- Phase 12 (Blog) is independent and can be done in parallel

### Environment Variables Required
```
DATABASE_URL=postgresql://...
NODE_ENV=production
PORT=3000
ADMIN_EMAIL=admin@octatech.xyz
ADMIN_PASSWORD=<secure-password>
SESSION_SECRET=<32-random-chars>
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
CORS_ORIGIN=https://octatech.xyz
CRM_BASE_URL=https://crm.octatech.xyz
```

### Browser Extension (Future)
- Spec 13 (13-future-browser-extension.md) is explicitly marked as a future feature
- Not included in this plan
- Can be implemented after core platform is stable
