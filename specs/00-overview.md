# Octatech Platform Overview

## Project Summary

Octatech is a consulting/services business that needs a modern web presence with lead management capabilities. The platform consists of:

1. **Marketing Website** (octatech.xyz) - Landing page with contact form
2. **Blog** (octatech.xyz/blog) - Markdown-based articles
3. **CRM Backend** - Lead management, API, integrations (hosted on Railway)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Pages                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    octatech.xyz                              ││
│  │         (Astro - Landing Page + Blog)                        ││
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐   ││
│  │  │   /                 │  │   /blog                     │   ││
│  │  │   (Landing Page)    │  │   (Blog Articles)           │   ││
│  │  │   - Contact Form    │  │   - Markdown Articles       │   ││
│  │  │   - Cal.com Embed   │  │   - Tags, RSS Feed          │   ││
│  │  └─────────────────────┘  └─────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
             │ POST /api/leads
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Railway                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    CRM API Server                           ││
│  │  - Lead Management (CRUD)                                   ││
│  │  - Authentication (single admin)                            ││
│  │  - API Key Management                                       ││
│  │  - Webhook Dispatch                                         ││
│  │  - AI Lead Parsing (OpenAI)                                 ││
│  │  - Admin Dashboard UI (/admin)                              ││
│  └──────────────────────┬──────────────────────────────────────┘│
│                         │                                        │
│  ┌──────────────────────▼──────────────────────────────────────┐│
│  │                   PostgreSQL                                 ││
│  │  - leads, api_keys, webhooks, notifications, settings       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
             │
             │ Webhooks / Notifications
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐ │
│  │  Discord  │  │ Telegram  │  │   Email   │  │   Cal.com    │ │
│  │  Webhook  │  │    Bot    │  │  (Resend) │  │  (Booking)   │ │
│  └───────────┘  └───────────┘  └───────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
octatech.xyz/
├── specs/                    # Specifications (this folder)
├── packages/
│   ├── blog/                 # Astro site (landing page + blog)
│   │   └── src/
│   │       └── pages/
│   │           ├── index.astro        # Landing page
│   │           └── blog/              # Blog section
│   └── crm/                  # CRM backend + admin UI (Railway)
├── .github/
│   └── workflows/
│       └── deploy-site.yml   # Deploy Astro site to GitHub Pages
└── README.md
```

## Tech Stack

| Component | Technology | Hosting |
|-----------|------------|---------|
| Website (Landing + Blog) | Astro + Tailwind | GitHub Pages |
| CRM Backend | Node.js + Hono | Railway |
| CRM Database | PostgreSQL | Railway |
| CRM Admin UI | React (served by backend) | Railway |
| Email | Resend | - |
| AI | OpenAI API | - |
| Booking | Cal.com | - |

## Domain Configuration

| Domain | Points To |
|--------|-----------|
| octatech.xyz | GitHub Pages (Astro site) |
| api.octatech.xyz | Railway (CRM backend + Admin UI) |

## User Roles

For the initial version:
- **Admin** (single user): Full access to CRM, API keys, settings
- **API Client**: External systems (Claude bot) with API key access

## Related Specifications

- [01-blog.md](./01-blog.md) - Blog system
- [02-contact-form.md](./02-contact-form.md) - Contact form
- [03-crm-data-model.md](./03-crm-data-model.md) - Database schema
- [04-crm-admin-ui.md](./04-crm-admin-ui.md) - Admin interface
- [05-authentication.md](./05-authentication.md) - Auth system
- [06-api-keys.md](./06-api-keys.md) - API key management
- [07-api-endpoints.md](./07-api-endpoints.md) - Public API
- [08-webhooks.md](./08-webhooks.md) - Webhook system
- [09-notifications.md](./09-notifications.md) - Notification channels
- [10-booking.md](./10-booking.md) - Cal.com integration
- [11-ai-features.md](./11-ai-features.md) - AI lead parsing
- [12-infrastructure.md](./12-infrastructure.md) - Deployment
- [13-future-browser-extension.md](./13-future-browser-extension.md) - Future LinkedIn extension
