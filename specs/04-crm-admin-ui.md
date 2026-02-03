# CRM Admin UI Specification

## Overview

A web-based admin interface for managing leads, API keys, webhooks, and notification settings. Accessible at `crm.octatech.xyz` (or `api.octatech.xyz/admin`).

## Requirements

### Functional Requirements

1. **Dashboard**
   - Overview stats (leads by status, total leads, recent activity)
   - Recent leads list
   - Quick actions (add lead, view settings)

2. **Lead Management**
   - List all leads with search, filter, sort
   - View lead detail with full history
   - Edit lead information
   - Change lead status with activity logging
   - Add notes/activities to leads
   - Delete leads (with confirmation)
   - Quick add lead (manual entry)
   - AI add lead (paste text, AI parses)

3. **API Key Management**
   - List API keys (show prefix, name, last used, scopes)
   - Create new API key (displays full key once, then only prefix)
   - Revoke API keys
   - Edit API key name/scopes

4. **Webhook Management**
   - List webhooks with status
   - Create/edit webhooks (URL, events, secret)
   - Enable/disable webhooks
   - View delivery history and failures
   - Test webhook (send test payload)

5. **Notification Channels**
   - Configure Discord webhook
   - Configure Telegram bot
   - Configure Email notifications
   - Enable/disable per channel
   - Test notifications

6. **Settings**
   - Update Cal.com booking link
   - Update OpenAI API key
   - Update admin email
   - Change admin password

### Non-Functional Requirements

- Responsive design (usable on mobile)
- Fast navigation (SPA feel)
- Secure (authentication required)
- Clean, professional UI matching Octatech brand

## Technology

- **React** with TypeScript
- **Tailwind CSS** for styling
- **React Query** for data fetching
- **React Router** for navigation
- Served by the same Hono backend (or as static files)

## Pages / Routes

```
/login                    - Login page
/                         - Dashboard
/leads                    - Lead list
/leads/:id                - Lead detail
/leads/new                - Add lead (manual)
/leads/ai                 - Add lead (AI parse)
/api-keys                 - API key management
/webhooks                 - Webhook management
/webhooks/:id/deliveries  - Webhook delivery history
/notifications            - Notification channels
/settings                 - System settings
```

## UI Components

### Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  Octatech CRM                              [Settings] [Logout]
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ New      │ │ Contacted│ │ Qualified│ │ Proposal │       │
│  │   12     │ │    5     │ │    3     │ │    2     │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  Recent Leads                        [+ Add Lead] [AI Add]  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ John Doe      john@acme.com     New    2 hours ago      ││
│  │ Jane Smith    jane@corp.io      Contacted  1 day ago    ││
│  │ ...                                                      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Lead List

```
┌─────────────────────────────────────────────────────────────┐
│  Leads                                    [+ Add] [AI Add]  │
├─────────────────────────────────────────────────────────────┤
│  Search: [_______________]  Status: [All ▼]  Sort: [Date ▼] │
├─────────────────────────────────────────────────────────────┤
│  ☐ Name          Email              Company    Status  Date │
│  ──────────────────────────────────────────────────────────│
│  ☐ John Doe      john@acme.com      Acme Inc   New    1/15 │
│  ☐ Jane Smith    jane@corp.io       Corp.io    Qual.  1/14 │
│  ☐ Bob Wilson    bob@startup.co     Startup    Prop.  1/13 │
│                                                             │
│  [< Prev]  Page 1 of 5  [Next >]                           │
└─────────────────────────────────────────────────────────────┘
```

### Lead Detail

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Leads                           [Edit] [Delete]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  John Doe                                                   │
│  john@acme.com | Acme Inc | +1-555-1234                    │
│                                                             │
│  Status: [New ▼] → [Contacted] [Qualified] [Proposal] [Won] │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Budget: $50k-$100k    Project: New Product / MVP        ││
│  │ Source: Google Search                                    ││
│  │                                                          ││
│  │ Message:                                                 ││
│  │ "We need help building a new SaaS platform for..."      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Activity                                     [+ Add Note]  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 📝 Jan 15, 2:30 PM - Note                               ││
│  │    "Spoke with John, interested in Q2 start"            ││
│  │                                                          ││
│  │ 🔄 Jan 15, 10:00 AM - Status changed                    ││
│  │    new → contacted                                       ││
│  │                                                          ││
│  │ ✨ Jan 14, 3:00 PM - Lead created                       ││
│  │    Via contact form                                      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### AI Lead Add

```
┌─────────────────────────────────────────────────────────────┐
│  Add Lead with AI                                    [Back] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Paste any text about a potential lead and AI will extract  │
│  the relevant information.                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Got a message from Sarah Chen (sarah@techstartup.io)    ││
│  │ at TechStartup Inc. They're looking for help with       ││
│  │ their cloud migration, budget around $75k, found us     ││
│  │ through LinkedIn. Phone: 415-555-9876                   ││
│  │                                                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│                                            [Parse with AI]  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Extracted Information:                      [Edit] [Save]  │
│                                                             │
│  Name: Sarah Chen                                           │
│  Email: sarah@techstartup.io                               │
│  Company: TechStartup Inc                                   │
│  Phone: 415-555-9876                                        │
│  Budget: $50,000 - $100,000                                │
│  Project Type: Cloud Migration                              │
│  Source: LinkedIn                                           │
│  Message: Looking for help with cloud migration             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### API Keys

```
┌─────────────────────────────────────────────────────────────┐
│  API Keys                                    [+ Create Key] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name           Key              Scopes         Last Used   │
│  ─────────────────────────────────────────────────────────  │
│  Claude Bot     oct_abc...xyz    leads:*        2 hours ago │
│                                                   [Revoke]  │
│                                                             │
│  Zapier         oct_def...uvw    leads:read     Never       │
│                                                   [Revoke]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Notification Channels

```
┌─────────────────────────────────────────────────────────────┐
│  Notification Channels                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Discord                                    [Enabled] [Test]│
│  Webhook: https://discord.com/api/webhooks/...              │
│  Events: lead.created, lead.status_changed                  │
│                                                    [Edit]   │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Telegram                                  [Disabled] [Test]│
│  Not configured                                             │
│                                                 [Configure] │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Email                                      [Enabled] [Test]│
│  To: admin@octatech.xyz                                     │
│  Events: lead.created                                       │
│                                                    [Edit]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Inputs

| Input | Description |
|-------|-------------|
| User credentials | Email + password for login |
| Lead data | Manual entry or AI-parsed text |
| API key config | Name, scopes |
| Webhook config | URL, events, secret |
| Notification config | Channel-specific settings |

## Outputs

| Output | Description |
|--------|-------------|
| Dashboard view | Stats and recent activity |
| Lead list | Filtered, sorted, paginated |
| Lead detail | Full information + activity log |
| Success/error toasts | Feedback on actions |

## Success Criteria

1. **Usability**: Admin can complete common tasks without documentation
2. **Performance**: Pages load < 1 second, actions feel instant
3. **Reliability**: No data loss, proper error handling
4. **Security**: Unauthenticated access redirected to login
5. **Mobile**: Core functions work on mobile devices

## Testing

| Test | Method |
|------|--------|
| Login flow | Valid/invalid credentials |
| Lead CRUD | Create, read, update, delete lead |
| Status change | Change status, verify activity logged |
| AI parsing | Paste text, verify extraction |
| API key lifecycle | Create, use, revoke |
| Notification test | Send test notification to each channel |
| Responsive | Test all pages at mobile viewport |

## Design Guidelines

- Dark theme matching Octatech brand
- Indigo accent color (#6366f1)
- Clean typography, adequate spacing
- Clear visual hierarchy
- Consistent button styles and feedback
