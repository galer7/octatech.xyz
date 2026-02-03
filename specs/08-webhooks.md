# Webhooks Specification

## Overview

System for sending HTTP notifications to external URLs when events occur in the CRM (lead created, status changed, etc.). Configurable by the admin.

## Requirements

### Functional Requirements

1. **Webhook Configuration**
   - Create webhooks with target URL
   - Select events to trigger on
   - Optional: shared secret for signature verification
   - Enable/disable webhooks

2. **Event Triggering**
   - Automatic trigger when events occur
   - Async delivery (don't block main operations)
   - Retry failed deliveries with exponential backoff

3. **Delivery Tracking**
   - Log all delivery attempts
   - Track success/failure status codes
   - Track response times
   - Failure count for alerting

4. **Testing**
   - Send test webhook from admin UI
   - View recent delivery history

### Non-Functional Requirements

- Delivery attempt within 5 seconds of event
- Retry up to 5 times over 24 hours
- Webhook timeout: 30 seconds
- Keep 30 days of delivery logs

## Supported Events

| Event | Description | Trigger |
|-------|-------------|---------|
| `lead.created` | New lead added | Contact form, API, AI parse |
| `lead.updated` | Lead information changed | API, admin UI |
| `lead.status_changed` | Lead status changed | API, admin UI |
| `lead.deleted` | Lead removed | API, admin UI |
| `lead.activity_added` | Activity added to lead | API, admin UI |

## Webhook Payload

All webhooks have consistent payload structure:

```json
{
  "id": "delivery-uuid",
  "event": "lead.created",
  "timestamp": "2025-01-15T10:00:00Z",
  "data": {
    // Event-specific data
  }
}
```

### Event: lead.created

```json
{
  "id": "delivery-uuid",
  "event": "lead.created",
  "timestamp": "2025-01-15T10:00:00Z",
  "data": {
    "lead": {
      "id": "lead-uuid",
      "name": "John Doe",
      "email": "john@acme.com",
      "company": "Acme Inc",
      "phone": "+1-555-1234",
      "budget": "$50,000 - $100,000",
      "projectType": "New Product / MVP",
      "message": "We need help building...",
      "source": "Google Search",
      "status": "new",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  }
}
```

### Event: lead.status_changed

```json
{
  "id": "delivery-uuid",
  "event": "lead.status_changed",
  "timestamp": "2025-01-15T14:00:00Z",
  "data": {
    "lead": {
      "id": "lead-uuid",
      "name": "John Doe",
      "email": "john@acme.com",
      "status": "contacted"
    },
    "previousStatus": "new",
    "newStatus": "contacted"
  }
}
```

### Event: lead.updated

```json
{
  "id": "delivery-uuid",
  "event": "lead.updated",
  "timestamp": "2025-01-15T14:00:00Z",
  "data": {
    "lead": {
      "id": "lead-uuid",
      "name": "John Doe",
      "email": "john@acme.com",
      ...
    },
    "changes": {
      "notes": {
        "old": null,
        "new": "Interested in Q2 start"
      }
    }
  }
}
```

### Event: lead.deleted

```json
{
  "id": "delivery-uuid",
  "event": "lead.deleted",
  "timestamp": "2025-01-15T14:00:00Z",
  "data": {
    "leadId": "lead-uuid",
    "name": "John Doe",
    "email": "john@acme.com"
  }
}
```

### Event: lead.activity_added

```json
{
  "id": "delivery-uuid",
  "event": "lead.activity_added",
  "timestamp": "2025-01-15T14:30:00Z",
  "data": {
    "lead": {
      "id": "lead-uuid",
      "name": "John Doe",
      "email": "john@acme.com"
    },
    "activity": {
      "id": "activity-uuid",
      "type": "note",
      "description": "Follow-up call scheduled",
      "createdAt": "2025-01-15T14:30:00Z"
    }
  }
}
```

## HTTP Request

Webhooks are delivered as HTTP POST requests:

```http
POST {webhook_url}
Content-Type: application/json
User-Agent: Octatech-Webhook/1.0
X-Webhook-ID: delivery-uuid
X-Webhook-Event: lead.created
X-Webhook-Timestamp: 1705312800
X-Webhook-Signature: sha256=abc123...

{payload}
```

## Signature Verification

If a webhook has a secret configured, include HMAC signature:

```
X-Webhook-Signature: sha256={HMAC-SHA256(secret, body)}
```

Verification code example:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  const expectedBuffer = Buffer.from(`sha256=${expected}`);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
```

## Retry Policy

| Attempt | Delay After Failure |
|---------|---------------------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 24 hours (final) |

After 6 failed attempts:
- Mark webhook delivery as failed
- Increment webhook failure_count
- If failure_count > 10 consecutive, auto-disable webhook and notify admin

## Data Model

### Webhook

```typescript
interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];        // ['lead.created', 'lead.status_changed']
  secret: string | null;   // For signature verification
  enabled: boolean;
  lastTriggeredAt: Date | null;
  lastStatusCode: number | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Webhook Delivery

```typescript
interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: object;
  statusCode: number | null;
  responseBody: string | null;
  attemptedAt: Date;
  durationMs: number | null;
}
```

## Admin API Endpoints

### GET /api/admin/webhooks

List all webhooks.

**Response:**
```json
{
  "webhooks": [
    {
      "id": "uuid",
      "name": "Zapier Integration",
      "url": "https://hooks.zapier.com/...",
      "events": ["lead.created"],
      "enabled": true,
      "lastTriggeredAt": "2025-01-15T10:00:00Z",
      "lastStatusCode": 200,
      "failureCount": 0
    }
  ]
}
```

### POST /api/admin/webhooks

Create a webhook.

**Request:**
```json
{
  "name": "Zapier Integration",
  "url": "https://hooks.zapier.com/...",
  "events": ["lead.created", "lead.status_changed"],
  "secret": "optional-secret"
}
```

### PATCH /api/admin/webhooks/:id

Update a webhook.

### DELETE /api/admin/webhooks/:id

Delete a webhook (also deletes delivery history).

### POST /api/admin/webhooks/:id/test

Send a test webhook.

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "responseTime": 150,
  "responseBody": "OK"
}
```

### GET /api/admin/webhooks/:id/deliveries

Get delivery history for a webhook.

**Query params:** `page`, `limit`

**Response:**
```json
{
  "deliveries": [
    {
      "id": "uuid",
      "event": "lead.created",
      "statusCode": 200,
      "durationMs": 150,
      "attemptedAt": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

## Inputs

| Input | Source | Validation |
|-------|--------|------------|
| URL | Admin UI | Valid HTTPS URL |
| Events | Admin UI | Valid event names |
| Secret | Admin UI | Optional, any string |

## Outputs

| Output | Description |
|--------|-------------|
| HTTP POST | Sent to configured URL |
| Delivery log | Stored in database |
| Admin notification | If webhook consistently failing |

## Success Criteria

1. **Reliability**: 99% of webhooks delivered within 5 seconds
2. **Retry**: Failed webhooks retried appropriately
3. **Visibility**: Admin can see delivery history
4. **Security**: Signatures allow verification

## Testing

| Test | Method |
|------|--------|
| Successful delivery | Create webhook, trigger event, verify received |
| Retry on failure | Mock 500 response, verify retries |
| Signature verification | Verify signature with test endpoint |
| Timeout handling | Mock slow endpoint, verify timeout |
| Event filtering | Subscribe to one event, verify others not sent |
| Test webhook | Use test button, verify delivery |

## Security Considerations

1. **HTTPS only**: Only allow HTTPS webhook URLs
2. **Private networks**: Block webhooks to private IPs (10.x, 192.168.x, localhost)
3. **Secrets**: Store secrets encrypted at rest
4. **Rate limiting**: Max 100 webhooks per minute per webhook URL
