# Octatech Platform Overview

## Project Summary

Octatech is a consulting/services business that needs a modern web presence with lead management capabilities. The platform consists of:

1. **Marketing Website** (octatech.xyz) - Landing page with contact form
2. **Blog** (blog.octatech.xyz) - Markdown-based articles
3. **CRM Backend** - Lead management, API, integrations (hosted on Railway)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Pages                              │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │   octatech.xyz      │    │   blog.octatech.xyz             │ │
│  │   (Landing Page)    │    │   (Astro Static Blog)           │ │
│  │   - Contact Form    │    │   - Markdown Articles           │ │
│  │   - Cal.com Embed   │    │   - Auto-deploy on commit       │ │
│  └─────────┬───────────┘    └─────────────────────────────────┘ │
└────────────┼────────────────────────────────────────────────────┘
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
│  │  - Admin Dashboard UI                                       ││
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
│   ├── web/                  # Landing page (current index.html, modernized)
│   ├── blog/                 # Astro blog for blog.octatech.xyz
│   └── crm/                  # CRM backend + admin UI (Railway)
├── .github/
│   └── workflows/
│       ├── deploy-web.yml    # Deploy landing page to GitHub Pages
│       └── deploy-blog.yml   # Deploy blog to GitHub Pages
└── README.md
```

## Tech Stack

| Component | Technology | Hosting |
|-----------|------------|---------|
| Landing Page | HTML/Tailwind (existing) | GitHub Pages |
| Blog | Astro + Markdown | GitHub Pages |
| CRM Backend | Node.js + Hono | Railway |
| CRM Database | PostgreSQL | Railway |
| CRM Admin UI | React (served by backend) | Railway |
| Email | Resend | - |
| AI | OpenAI API | - |
| Booking | Cal.com | - |

## Domain Configuration

| Domain | Points To |
|--------|-----------|
| octatech.xyz | GitHub Pages (landing) |
| blog.octatech.xyz | GitHub Pages (blog) |
| api.octatech.xyz | Railway (CRM backend) |
| crm.octatech.xyz | Railway (Admin UI) |

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
