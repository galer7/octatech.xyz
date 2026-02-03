# Notification Channels Specification

## Overview

Configurable notification system that sends alerts to Discord, Telegram, and Email when events occur (primarily new leads). Each channel is independently configurable.

## Requirements

### Functional Requirements

1. **Channel Configuration**
   - Add/edit/remove notification channels
   - Configure channel-specific settings
   - Select events to notify on
   - Enable/disable per channel

2. **Supported Channels**
   - Discord (via webhook)
   - Telegram (via bot)
   - Email (via Resend)

3. **Notification Content**
   - Rich formatting appropriate for each channel
   - Lead summary with key information
   - Link to view lead in CRM

4. **Testing**
   - Send test notification from admin UI
   - Verify configuration before saving

### Non-Functional Requirements

- Notifications sent within 10 seconds of event
- Async delivery (don't block main operations)
- Graceful failure handling (don't fail the main operation)

## Supported Events

| Event | Default Enabled | Description |
|-------|-----------------|-------------|
| `lead.created` | Yes | New lead submitted |
| `lead.status_changed` | Optional | Lead status updated |

## Channel: Discord

### Configuration

```typescript
interface DiscordConfig {
  webhookUrl: string;  // Discord webhook URL
}
```

### Setup Instructions

1. In Discord server, go to Server Settings → Integrations → Webhooks
2. Create new webhook, copy URL
3. Paste URL in CRM notification settings

### Message Format

Discord embed message:

```json
{
  "embeds": [{
    "title": "New Lead: John Doe",
    "color": 6366961,
    "fields": [
      { "name": "Email", "value": "john@acme.com", "inline": true },
      { "name": "Company", "value": "Acme Inc", "inline": true },
      { "name": "Budget", "value": "$50k-$100k", "inline": true },
      { "name": "Project", "value": "New Product / MVP", "inline": true },
      { "name": "Source", "value": "Google Search", "inline": true }
    ],
    "description": "We need help building a SaaS platform for...",
    "timestamp": "2025-01-15T10:00:00Z",
    "footer": { "text": "Octatech CRM" }
  }],
  "content": null
}
```

### API Call

```http
POST {webhookUrl}
Content-Type: application/json

{embed payload}
```

## Channel: Telegram

### Configuration

```typescript
interface TelegramConfig {
  botToken: string;   // Bot API token from @BotFather
  chatId: string;     // Chat/group ID to send to
}
```

### Setup Instructions

1. Create bot via @BotFather, get token
2. Add bot to desired chat/group
3. Get chat ID (via /getUpdates or @userinfobot)
4. Enter token and chat ID in CRM settings

### Message Format

Telegram HTML formatted message:

```html
<b>🆕 New Lead: John Doe</b>

<b>Email:</b> john@acme.com
<b>Company:</b> Acme Inc
<b>Budget:</b> $50k-$100k
<b>Project:</b> New Product / MVP
<b>Source:</b> Google Search

<i>We need help building a SaaS platform for...</i>

<a href="https://crm.octatech.xyz/leads/uuid">View in CRM →</a>
```

### API Call

```http
POST https://api.telegram.org/bot{token}/sendMessage
Content-Type: application/json

{
  "chat_id": "{chatId}",
  "text": "{formatted message}",
  "parse_mode": "HTML",
  "disable_web_page_preview": true
}
```

## Channel: Email

### Configuration

```typescript
interface EmailConfig {
  to: string;         // Recipient email(s), comma-separated
  from: string;       // Sender email (must be verified domain)
}
```

### Email Provider

**Resend** - chosen for simplicity and good deliverability.

Environment variable: `RESEND_API_KEY`

### Message Format

HTML email:

```html
Subject: New Lead: John Doe - Acme Inc

<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #6366f1;">New Lead Received</h2>

  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">John Doe</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">john@acme.com</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Company</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">Acme Inc</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Budget</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">$50,000 - $100,000</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Project Type</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">New Product / MVP</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Source</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">Google Search</td>
    </tr>
  </table>

  <h3>Message</h3>
  <p style="background: #f5f5f5; padding: 16px; border-radius: 8px;">
    We need help building a SaaS platform for...
  </p>

  <p>
    <a href="https://crm.octatech.xyz/leads/uuid"
       style="display: inline-block; background: #6366f1; color: white;
              padding: 12px 24px; text-decoration: none; border-radius: 8px;">
      View Lead in CRM
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #666; font-size: 12px;">
    Octatech CRM • octatech.xyz
  </p>
</body>
</html>
```

### API Call (Resend)

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Octatech CRM <crm@octatech.xyz>',
  to: ['admin@octatech.xyz'],
  subject: `New Lead: ${lead.name} - ${lead.company}`,
  html: emailHtml,
});
```

## Data Model

```typescript
interface NotificationChannel {
  id: string;
  type: 'discord' | 'telegram' | 'email';
  name: string;
  config: DiscordConfig | TelegramConfig | EmailConfig;
  events: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Admin API Endpoints

### GET /api/admin/notifications

List all notification channels.

### POST /api/admin/notifications

Create a notification channel.

**Request:**
```json
{
  "type": "discord",
  "name": "Main Discord",
  "config": {
    "webhookUrl": "https://discord.com/api/webhooks/..."
  },
  "events": ["lead.created"]
}
```

### PATCH /api/admin/notifications/:id

Update a notification channel.

### DELETE /api/admin/notifications/:id

Delete a notification channel.

### POST /api/admin/notifications/:id/test

Send a test notification.

**Response:**
```json
{
  "success": true,
  "message": "Test notification sent"
}
```

Or on failure:
```json
{
  "success": false,
  "error": "Discord webhook returned 404"
}
```

## Notification Dispatch Flow

```
1. Event occurs (e.g., lead.created)
2. Query enabled notification channels for this event
3. For each channel, queue notification job
4. Worker processes jobs asynchronously:
   a. Format message for channel type
   b. Send to channel API
   c. Log result (success/failure)
5. On failure: log error, don't retry (notifications are best-effort)
```

## Inputs

| Input | Source | Validation |
|-------|--------|------------|
| Discord webhook URL | Admin UI | Valid Discord webhook URL pattern |
| Telegram bot token | Admin UI | Non-empty string |
| Telegram chat ID | Admin UI | Numeric string |
| Email addresses | Admin UI | Valid email format |

## Outputs

| Output | Destination | Content |
|--------|-------------|---------|
| Discord embed | Discord webhook | Rich lead summary |
| Telegram message | Telegram chat | HTML formatted summary |
| Email | Recipient inbox | HTML email with lead details |

## Success Criteria

1. **Delivery**: Notifications arrive within 10 seconds
2. **Formatting**: Messages render correctly in each channel
3. **Configurability**: Can enable/disable per channel
4. **Testing**: Can verify configuration with test message

## Testing

| Test | Method |
|------|--------|
| Discord delivery | Configure webhook, create lead, verify message |
| Telegram delivery | Configure bot, create lead, verify message |
| Email delivery | Configure email, create lead, check inbox |
| Test button | Click test, verify notification received |
| Disabled channel | Disable channel, create lead, verify no notification |
| Invalid config | Enter bad webhook URL, verify error shown |

## Error Handling

Notification failures should:
- Be logged for debugging
- Not block the main operation (lead creation)
- Not trigger retries (best-effort delivery)
- Show warning in admin UI if channel consistently failing

## Security Considerations

1. **Secrets**: Store bot tokens and webhook URLs encrypted
2. **Validation**: Validate URLs before saving
3. **Rate limits**: Respect Discord/Telegram rate limits
4. **Email verification**: Only send from verified domains
