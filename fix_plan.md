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

## Phase 5: API Key Management ✅ COMPLETED

### 5.1 API Key Utilities ✅
- [x] Create `packages/crm/src/lib/api-keys.ts`
- [x] Implement key generation (`oct_` prefix + 32 base62 chars)
- [x] Implement SHA-256 hashing for storage
- [x] Implement key validation against database
- [x] Implement scope checking (leads:read, leads:write, leads:delete, leads:*)

### 5.2 API Key Middleware ✅
- [x] Create `packages/crm/src/middleware/api-key.ts`
- [x] Extract Bearer token from Authorization header
- [x] Validate key and check scopes
- [x] Update last_used_at timestamp
- [x] Return 401/403 for invalid/insufficient permissions

### 5.3 Admin API Key Endpoints ✅
- [x] Create `packages/crm/src/routes/admin/api-keys.ts`
- [x] Implement `GET /api/admin/api-keys` (list all keys with prefix, name, scopes, last used)
- [x] Implement `POST /api/admin/api-keys` (create key, return full key once)
- [x] Implement `PATCH /api/admin/api-keys/:id` (update name/scopes)
- [x] Implement `DELETE /api/admin/api-keys/:id` (revoke key)

### 5.4 Tests ✅ (Added)
- [x] Add comprehensive tests for API key utilities (key generation, hashing, format validation, scope checking)
- [x] Add comprehensive tests for API key middleware (Bearer extraction, validation, scope enforcement)
- [x] Add comprehensive tests for admin API key routes (CRUD operations)

---

## Phase 6: Leads API (Public) ✅ COMPLETED

### 6.1 Lead Validation ✅
- [x] Create `packages/crm/src/lib/validation.ts`
- [x] Define Zod schemas for lead creation/update
- [x] Validate email format
- [x] Validate status values (new, contacted, qualified, proposal, won, lost)
- [x] Validate budget and projectType against allowed values

### 6.2 Lead Endpoints ✅
- [x] Create `packages/crm/src/routes/api/leads.ts`
- [x] Implement `GET /api/v1/leads` (list with pagination, filtering, search, sort)
- [x] Implement `GET /api/v1/leads/:id` (get single lead with activities)
- [x] Implement `POST /api/v1/leads` (create lead, trigger notifications)
- [x] Implement `PATCH /api/v1/leads/:id` (update lead, log status changes)
- [x] Implement `DELETE /api/v1/leads/:id` (delete lead)
- [x] Implement `POST /api/v1/leads/:id/activities` (add activity to lead)
- [x] Implement `GET /api/v1/leads/:id/activities` (get activities for a lead)

### 6.3 Lead Creation from Contact Form ✅
- [x] Create `packages/crm/src/routes/api/public-leads.ts`
- [x] Implement `POST /api/leads` (public endpoint for contact form)
- [x] Implement honeypot validation (reject if website field is filled)
- [x] Return success response even for honeypot (silent rejection)

### 6.4 API Info Endpoint ✅
- [x] Implement `GET /api/v1/me` (return info about current API key)

### 6.5 Tests ✅ (Added)
- [x] Add comprehensive tests for validation schemas (150 tests)
- [x] Add comprehensive tests for Leads API routes (70 tests)
- [x] Add comprehensive tests for public leads endpoint (42 tests)
- [x] Add comprehensive tests for API info endpoint (19 tests)

---

## Phase 7: Webhook System ✅ COMPLETED

### 7.1 Webhook Dispatcher ✅
- [x] Create `packages/crm/src/lib/webhooks.ts`
- [x] Implement webhook payload formatting for each event type
- [x] Implement HMAC-SHA256 signature generation
- [x] Implement async webhook delivery with timeout (30s)
- [x] Implement retry logic with exponential backoff (1m, 5m, 30m, 2h, 24h)
- [x] Implement delivery logging to webhook_deliveries table
- [x] Implement failure tracking and auto-disable after 10 consecutive failures

### 7.2 Event Triggers ✅
- [x] Create event dispatcher for `lead.created`
- [x] Create event dispatcher for `lead.updated`
- [x] Create event dispatcher for `lead.status_changed`
- [x] Create event dispatcher for `lead.deleted`
- [x] Create event dispatcher for `lead.activity_added`

### 7.3 Admin Webhook Endpoints ✅
- [x] Create `packages/crm/src/routes/admin/webhooks.ts`
- [x] Implement `GET /api/admin/webhooks` (list all webhooks)
- [x] Implement `POST /api/admin/webhooks` (create webhook)
- [x] Implement `PATCH /api/admin/webhooks/:id` (update webhook)
- [x] Implement `DELETE /api/admin/webhooks/:id` (delete webhook)
- [x] Implement `POST /api/admin/webhooks/:id/test` (send test payload)
- [x] Implement `GET /api/admin/webhooks/:id/deliveries` (delivery history)

### 7.4 Webhook Tests ✅ (Added)
- [x] Add comprehensive tests for webhook payload formatting
- [x] Add comprehensive tests for HMAC-SHA256 signature generation
- [x] Add comprehensive tests for webhook delivery and retry logic
- [x] Add comprehensive tests for admin webhook routes (CRUD operations)

---

## Phase 8: Notification Channels ✅ COMPLETED

### 8.1 Discord Notifications ✅
- [x] Create `packages/crm/src/lib/notifications/discord.ts`
- [x] Implement Discord embed message formatting (rich embeds with fields for lead data)
- [x] Implement Discord webhook POST request with timeout and error handling

### 8.2 Telegram Notifications ✅
- [x] Create `packages/crm/src/lib/notifications/telegram.ts`
- [x] Implement Telegram HTML message formatting with proper escaping
- [x] Implement Telegram Bot API sendMessage request

### 8.3 Email Notifications (Resend) ✅
- [x] Create `packages/crm/src/lib/notifications/email.ts`
- [x] Implement HTML email template for new leads and status changes
- [x] Implement Resend API integration with proper error handling

### 8.4 Notification Dispatcher ✅
- [x] Create `packages/crm/src/lib/notifications/dispatcher.ts`
- [x] Query enabled channels for event type
- [x] Dispatch to each channel asynchronously (fire-and-forget)
- [x] Handle failures gracefully (don't block main operation)
- [x] Implement convenience functions for lead.created and lead.status_changed events

### 8.5 Admin Notification Endpoints ✅
- [x] Create `packages/crm/src/routes/admin/notifications.ts`
- [x] Implement `GET /api/admin/notifications` (list channels)
- [x] Implement `GET /api/admin/notifications/:id` (get single channel)
- [x] Implement `POST /api/admin/notifications` (create channel with Zod validation)
- [x] Implement `PATCH /api/admin/notifications/:id` (update channel)
- [x] Implement `DELETE /api/admin/notifications/:id` (delete channel)
- [x] Implement `POST /api/admin/notifications/:id/test` (send test notification)
- [x] Implement `GET /api/admin/notifications/events/list` (list available events)
- [x] Implement `GET /api/admin/notifications/types/list` (list channel types with config hints)

### 8.6 Notification Tests ✅ (Added)
- [x] Add comprehensive tests for types.ts (type guards, URL generation, enum values) - 23 tests
- [x] Add comprehensive tests for discord.ts (validation, embed formatting, delivery) - 29 tests
- [x] Add comprehensive tests for telegram.ts (validation, HTML formatting, delivery) - 38 tests
- [x] Add comprehensive tests for email.ts (validation, HTML templates, delivery) - 38 tests
- [x] Add comprehensive tests for dispatcher.ts (dispatch, channel querying, async) - 17 tests
- [x] Add comprehensive tests for admin routes (CRUD operations, validation) - 26 tests

---

## Phase 9: AI Features ✅ COMPLETED

### 9.1 OpenAI Integration ✅
- [x] Create `packages/crm/src/lib/ai/openai.ts`
- [x] Configure OpenAI client with API key from settings/env
- [x] Implement lead parsing system prompt
- [x] Implement field extraction with gpt-4o-mini
- [x] Implement budget/projectType mapping to predefined options
- [x] Return confidence score and extracted fields list

### 9.2 AI Lead Parsing Endpoint ✅
- [x] Implement `POST /api/v1/leads/parse` in leads routes
- [x] Accept text input (max 5000 chars)
- [x] Return parsed lead data with confidence
- [x] Support `autoSave: true` option to create lead immediately
- [x] Store raw_input and set ai_parsed flag

### 9.3 AI Tests ✅ (Added)
- [x] Add comprehensive tests for budget mapping functions - 26 tests
- [x] Add comprehensive tests for project type mapping functions - 23 tests
- [x] Add comprehensive tests for OpenAI client creation and configuration - 4 tests
- [x] Add comprehensive tests for parseLeadText function (mocked OpenAI) - 13 tests
- [x] Add comprehensive tests for error classes - 3 tests
- [x] Add comprehensive tests for parse endpoint (validation, autoSave, errors) - 19 tests

---

## Phase 10: Admin UI (React) ✅ COMPLETED

### 10.1 Admin UI Setup ✅
- [x] Create `packages/crm/admin/` directory
- [x] Initialize Vite + React + TypeScript
- [x] Configure Tailwind CSS (dark theme, indigo accent #6366f1)
- [x] Install React Router, React Query, date-fns, clsx
- [x] Create API client with auth handling and CSRF protection

### 10.2 Authentication Pages ✅
- [x] Create Login page (`/login`)
- [x] Implement login form with email/password
- [x] Implement "Remember me" checkbox
- [x] Implement auth redirect (unauthenticated → login via ProtectedRoute)

### 10.3 Dashboard Page ✅
- [x] Create Dashboard page (`/`)
- [x] Display lead count by status with animated stat cards
- [x] Display recent leads list with status badges
- [x] Add quick action buttons (Add Lead, AI Add)

### 10.4 Lead Management Pages ✅
- [x] Create Lead List page (`/leads`)
- [x] Implement search, filter by status, sort
- [x] Implement pagination with page info
- [x] Create Lead Detail page (`/leads/:id`)
- [x] Display lead info, status buttons, activity timeline
- [x] Implement edit lead modal
- [x] Implement add note form
- [x] Implement delete confirmation
- [x] Create Add Lead page (`/leads/new`)
- [x] Create AI Add Lead page (`/leads/ai`)
- [x] Implement textarea for pasting text
- [x] Implement "Parse with AI" button
- [x] Display extracted fields for editing before save

### 10.5 API Key Management Page ✅
- [x] Create API Keys page (`/api-keys`)
- [x] Display keys with prefix, name, scopes, last used
- [x] Implement create key modal (show full key once with copy button)
- [x] Implement revoke confirmation

### 10.6 Webhook Management Pages ✅
- [x] Create Webhooks page (`/webhooks`)
- [x] Display webhooks with status, events
- [x] Implement create/edit webhook modal
- [x] Implement enable/disable toggle
- [x] Implement test webhook button
- [x] Create Webhook Deliveries page (`/webhooks/:id/deliveries`)

### 10.7 Notification Channels Page ✅
- [x] Create Notifications page (`/notifications`)
- [x] Display Discord, Telegram, Email channels with type-specific icons
- [x] Implement configure modal for each type with type-specific fields
- [x] Implement enable/disable toggle
- [x] Implement test notification button

### 10.8 Settings Page ✅
- [x] Create Settings page (`/settings`)
- [x] Implement Cal.com link setting
- [x] Implement OpenAI API key setting (masked display)
- [x] Implement change password form with validation

### 10.9 Admin UI Build Integration ✅
- [x] Configure Vite to build to `packages/crm/dist/admin`
- [x] Serve admin UI from Hono backend at `/admin/*`
- [x] Implement SPA fallback for client-side routing
- [x] Update CRM package.json with build:admin script
- [x] Update root package.json workspaces to include admin

---

## Phase 11: Landing Page Updates ✅ COMPLETED

### 11.1 Contact Form Implementation ✅
- [x] Create contact form section in `packages/web/index.html`
- [x] Add form fields: name, email, company, phone, budget (dropdown), projectType (dropdown), message, source (dropdown)
- [x] Add honeypot field (hidden `website` input)
- [x] Implement client-side validation
- [x] Implement form submission to `https://api.octatech.xyz/api/leads`
- [x] Implement loading state during submission
- [x] Implement success message display
- [x] Implement error handling with user-friendly messages
- [x] Add "Contact" link to header navigation

### 11.2 Cal.com Integration ✅
- [x] Add Cal.com embed script to `<head>`
- [x] Configure Cal.com UI (dark theme, indigo brand color #6366f1)
- [x] Update "Book consultation" button in header with `data-cal-link="octatech/discovery"`
- [x] Update "Talk to an architect" button in hero with `data-cal-link`
- [x] Update "Book a call" button in Dedicated Team card with `data-cal-link`
- [x] Update "Book call" button in CTA section with `data-cal-link`

### 11.3 Fix Dead Links ✅
- [x] Update "Client Portal" link → `https://crm.octatech.xyz/admin` (with target="_blank")
- [x] Update "View our work" link → `#case-studies`
- [x] Update "See client results" link → `#case-studies`
- [x] Update footer links:
  - Services → `#expertise`
  - Careers → `mailto:careers@octatech.xyz`
  - Privacy → `/privacy` (placeholder)
  - Terms → `/terms` (placeholder)

### 11.4 Cal.com Webhook Handler ✅
- [x] Create `packages/crm/src/routes/api/cal-webhook.ts`
- [x] Implement `POST /api/webhooks/cal` endpoint
- [x] Add Zod validation schemas for Cal.com webhook payload
- [x] Parse Cal.com BOOKING_CREATED webhook payload
- [x] Create lead from booking data if not exists (source: "Cal.com Booking")
- [x] Add "meeting" activity to existing lead if found
- [x] Register route in `packages/crm/src/app.ts`
- [x] Export from `packages/crm/src/routes/api/index.ts`

### 11.5 Tests ✅ (Added)
- [x] Add comprehensive tests for Cal.com webhook handler (30 tests)
  - Validation tests (empty body, missing fields, invalid email)
  - Event handling tests (BOOKING_CREATED, ignored events)
  - Lead creation tests (new lead, with company, with projectDescription)
  - Existing lead tests (add activity, no duplicate lead)
  - Error handling tests (database errors, invalid JSON)

---

## Phase 12: Blog System ✅ COMPLETED

### 12.1 Astro Blog Setup ✅
- [x] Initialize `packages/blog/package.json` with Astro dependencies
- [x] Create `packages/blog/astro.config.mjs`
- [x] Configure site URL (blog.octatech.xyz)
- [x] Configure Tailwind CSS integration
- [x] Configure sitemap generation
- [x] Configure RSS feed generation

### 12.2 Blog Layouts ✅
- [x] Create `packages/blog/src/layouts/BaseLayout.astro`
- [x] Match Octatech dark theme styling
- [x] Include navigation to main site
- [x] Create `packages/blog/src/layouts/PostLayout.astro`
- [x] Include post metadata (title, date, author, tags)
- [x] Include reading time estimate

### 12.3 Blog Pages ✅
- [x] Create `packages/blog/src/pages/index.astro` (article listing with pagination)
- [x] Create `packages/blog/src/pages/posts/[slug].astro` (individual articles)
- [x] Create `packages/blog/src/pages/tags/[tag].astro` (articles by tag)
- [x] Create `packages/blog/src/pages/rss.xml.ts` (RSS feed)

### 12.4 Content Collection ✅
- [x] Configure content collection in `packages/blog/src/content/config.ts`
- [x] Define article frontmatter schema (title, description, date, tags, author, draft, image)
- [x] Create `packages/blog/src/content/posts/` directory
- [x] Create sample blog post (welcome.md)

### 12.5 Blog Assets ✅
- [x] Create `packages/blog/public/images/` directory
- [x] Add CNAME file for blog.octatech.xyz

---

## Phase 13: CI/CD & Deployment ✅ COMPLETED

### 13.1 Landing Page Deployment ✅
- [x] Create `.github/workflows/deploy-web.yml`
- [x] Deploy from `packages/web/` on push to main
- [x] CNAME is preserved in packages/web/

### 13.2 Blog Deployment ✅
- [x] Create `.github/workflows/deploy-blog.yml`
- [x] Build Astro blog on push to main (packages/blog/** changes)
- [x] Deploy to GitHub Pages with blog.octatech.xyz CNAME

### 13.3 CI Pipeline ✅
- [x] Create `.github/workflows/ci.yml`
- [x] Run lint on pull requests
- [x] Build CRM verification
- [x] Run tests

### 13.4 CRM Deployment (Railway) ⏳ Infrastructure Only
- [ ] Configure Railway service for packages/crm
- [ ] Set environment variables in Railway dashboard
- [ ] Configure custom domain (api.octatech.xyz, crm.octatech.xyz)
- [ ] Configure PostgreSQL addon
- [ ] Run initial migrations

> Note: Phase 13.4 requires manual Railway configuration - not code changes.

---

## Phase 14: Testing & Documentation ✅ COMPLETED

### 14.1 API Tests ✅
- [x] Add test framework (vitest)
- [x] Write tests for auth endpoints (1,132 lines of tests)
- [x] Write tests for leads API endpoints (2,181 lines of tests)
- [x] Write tests for API key validation (396 + 699 lines of tests)
- [x] Write tests for webhook delivery (1,496 lines of tests)
- [x] 25 test files, 1061 tests passing

### 14.2 Documentation ✅
- [x] Update README.md with project structure
- [x] Document local development setup
- [x] Document deployment process
- [x] Document environment variables

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
