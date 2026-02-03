# CRM Data Model Specification

## Overview

PostgreSQL database schema for the CRM system, storing leads, API keys, webhooks, notification settings, and system configuration.

## Database: PostgreSQL

Hosted on Railway. Connection via `DATABASE_URL` environment variable.

## Schema

### Table: `leads`

Primary table for storing lead/contact information.

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact Information
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  phone VARCHAR(50),

  -- Lead Details
  budget VARCHAR(100),
  project_type VARCHAR(100),
  message TEXT NOT NULL,
  source VARCHAR(100),

  -- Lifecycle
  status VARCHAR(50) NOT NULL DEFAULT 'new',

  -- Metadata
  notes TEXT,
  tags TEXT[],  -- Array of tags

  -- AI-parsed data (when lead created via natural language)
  raw_input TEXT,  -- Original text if parsed by AI
  ai_parsed BOOLEAN DEFAULT FALSE,

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contacted_at TIMESTAMPTZ,

  -- Indexes
  CONSTRAINT valid_status CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost'))
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
```

### Lead Status Lifecycle

```
new → contacted → qualified → proposal → won
                                       ↘ lost
```

| Status | Description |
|--------|-------------|
| `new` | Just received, not yet reviewed |
| `contacted` | Initial outreach made |
| `qualified` | Good fit, moving forward |
| `proposal` | Proposal/quote sent |
| `won` | Deal closed successfully |
| `lost` | Deal did not close |

### Table: `lead_activities`

Activity log for each lead (calls, emails, notes).

```sql
CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL,  -- 'note', 'email', 'call', 'meeting', 'status_change'
  description TEXT NOT NULL,

  -- For status changes
  old_status VARCHAR(50),
  new_status VARCHAR(50),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_activities_lead_id ON lead_activities(lead_id);
```

### Table: `api_keys`

API keys for external integrations (Claude bot, etc.).

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,  -- Friendly name, e.g., "Claude Bot"
  key_hash VARCHAR(255) NOT NULL,  -- Hashed API key (never store plain)
  key_prefix VARCHAR(10) NOT NULL,  -- First chars for identification, e.g., "oct_abc..."

  -- Permissions
  scopes TEXT[] NOT NULL DEFAULT '{}',  -- e.g., ['leads:read', 'leads:write']

  -- Tracking
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,

  CONSTRAINT unique_key_hash UNIQUE (key_hash)
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
```

### Table: `webhooks`

Webhook configurations for external notifications.

```sql
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,

  -- Events to trigger on
  events TEXT[] NOT NULL,  -- e.g., ['lead.created', 'lead.status_changed']

  -- Security
  secret VARCHAR(255),  -- For HMAC signature verification

  -- Status
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Tracking
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `webhook_deliveries`

Log of webhook delivery attempts.

```sql
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  event VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,

  -- Response
  status_code INTEGER,
  response_body TEXT,

  -- Timing
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
```

### Table: `notification_channels`

Configurable notification channels (Discord, Telegram, Email).

```sql
CREATE TABLE notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  type VARCHAR(50) NOT NULL,  -- 'discord', 'telegram', 'email'
  name VARCHAR(255) NOT NULL,

  -- Configuration (type-specific)
  config JSONB NOT NULL,
  -- Discord: { "webhook_url": "https://discord.com/api/webhooks/..." }
  -- Telegram: { "bot_token": "...", "chat_id": "..." }
  -- Email: { "to": "admin@example.com", "from": "noreply@octatech.xyz" }

  -- Events to notify on
  events TEXT[] NOT NULL DEFAULT '{"lead.created"}',

  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `settings`

Key-value store for system settings.

```sql
CREATE TABLE settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default settings
INSERT INTO settings (key, value) VALUES
  ('openai_api_key', '""'),  -- Encrypted or use env var
  ('cal_com_link', '"https://cal.com/octatech"'),
  ('company_name', '"Octatech"'),
  ('admin_email', '"admin@octatech.xyz"');
```

### Table: `admin_user`

Single admin user for authentication.

```sql
CREATE TABLE admin_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
```

### Table: `sessions`

Admin session management.

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,

  token_hash VARCHAR(255) NOT NULL UNIQUE,

  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Session metadata
  user_agent TEXT,
  ip_address VARCHAR(45)
);

CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

## Entity Relationships

```
admin_user (1) ─── (N) sessions

leads (1) ─── (N) lead_activities

webhooks (1) ─── (N) webhook_deliveries

notification_channels (standalone)

api_keys (standalone)

settings (standalone key-value)
```

## Inputs

| Table | Input Source |
|-------|--------------|
| leads | Contact form, API, AI parsing |
| lead_activities | Admin UI, API |
| api_keys | Admin UI |
| webhooks | Admin UI |
| notification_channels | Admin UI |
| settings | Admin UI |
| admin_user | Initial setup / Admin UI |
| sessions | Login flow |

## Outputs

| Query | Output |
|-------|--------|
| List leads | Paginated lead list with filters |
| Lead detail | Full lead with activities |
| Dashboard stats | Count by status, recent leads |
| API key list | Keys with last used, scopes |
| Webhook list | Webhooks with delivery stats |

## Success Criteria

1. **Data Integrity**: Foreign keys enforced, no orphan records
2. **Performance**: Queries < 100ms with proper indexes
3. **Security**: Passwords and API keys are hashed
4. **Audit Trail**: Lead activities track all changes

## Testing

| Test | Method |
|------|--------|
| Schema creation | Run migrations on fresh database |
| Constraints | Try inserting invalid status, verify rejection |
| Cascades | Delete lead, verify activities deleted |
| Indexes | Run EXPLAIN on common queries |

## Migrations

Use a migration tool (e.g., `node-pg-migrate` or `drizzle-kit`) to manage schema changes. Migrations stored in `packages/crm/migrations/`.
