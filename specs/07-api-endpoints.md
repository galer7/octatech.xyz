# Public API Endpoints Specification

## Overview

RESTful API for external integrations (Claude bot, browser extension, third-party tools) to interact with the CRM. Authenticated via API keys.

## Base URL

```
https://api.octatech.xyz/api/v1
```

## Authentication

All endpoints require API key authentication via Bearer token:

```http
Authorization: Bearer oct_your_api_key_here
```

Responses for auth failures:

**Missing/Invalid Key (401):**
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

**Insufficient Scope (403):**
```json
{
  "error": "Insufficient permissions. Required scope: leads:write",
  "code": "INSUFFICIENT_SCOPE"
}
```

## Rate Limiting

| Tier | Limit |
|------|-------|
| Per key | 100 requests/minute |
| Per IP (unauthenticated) | 10 requests/minute |

Rate limit headers included in all responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312800
```

**Rate Limited (429):**
```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMITED",
  "retryAfter": 45
}
```

## Endpoints

### Leads

#### GET /api/v1/leads

List leads with filtering and pagination.

**Required Scope:** `leads:read`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 100) |
| `status` | string | - | Filter by status |
| `search` | string | - | Search name, email, company |
| `sort` | string | `-createdAt` | Sort field (prefix `-` for desc) |

**Example Request:**
```http
GET /api/v1/leads?status=new&limit=10&sort=-createdAt
Authorization: Bearer oct_xxx
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@acme.com",
      "company": "Acme Inc",
      "phone": "+1-555-1234",
      "budget": "$50,000 - $100,000",
      "projectType": "New Product / MVP",
      "message": "We need help building...",
      "source": "Google Search",
      "status": "new",
      "tags": ["priority", "enterprise"],
      "notes": null,
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

#### GET /api/v1/leads/:id

Get a single lead by ID.

**Required Scope:** `leads:read`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@acme.com",
    "company": "Acme Inc",
    "phone": "+1-555-1234",
    "budget": "$50,000 - $100,000",
    "projectType": "New Product / MVP",
    "message": "We need help building...",
    "source": "Google Search",
    "status": "new",
    "tags": ["priority"],
    "notes": "Interested in Q2 start",
    "activities": [
      {
        "id": "uuid",
        "type": "note",
        "description": "Initial call completed",
        "createdAt": "2025-01-15T14:00:00Z"
      }
    ],
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T14:00:00Z"
  }
}
```

**Not Found (404):**
```json
{
  "error": "Lead not found",
  "code": "NOT_FOUND"
}
```

#### POST /api/v1/leads

Create a new lead.

**Required Scope:** `leads:write`

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@acme.com",
  "company": "Acme Inc",
  "phone": "+1-555-1234",
  "budget": "$50,000 - $100,000",
  "projectType": "New Product / MVP",
  "message": "We need help building a SaaS platform",
  "source": "API",
  "tags": ["priority"]
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@acme.com",
    ...
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

**Validation Error (400):**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "email": "Invalid email format",
    "name": "Name is required"
  }
}
```

#### POST /api/v1/leads/parse

Create a lead from natural language text (AI-powered).

**Required Scope:** `leads:write`

**Request:**
```json
{
  "text": "Got a message from Sarah Chen (sarah@techstartup.io) at TechStartup Inc. They're looking for help with their cloud migration, budget around $75k, found us through LinkedIn."
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Sarah Chen",
    "email": "sarah@techstartup.io",
    "company": "TechStartup Inc",
    "budget": "$50,000 - $100,000",
    "projectType": "Cloud Migration",
    "source": "LinkedIn",
    "message": "Looking for help with cloud migration",
    "aiParsed": true,
    "rawInput": "Got a message from Sarah Chen...",
    "createdAt": "2025-01-15T10:00:00Z"
  },
  "parsed": {
    "confidence": 0.92,
    "extractedFields": ["name", "email", "company", "budget", "projectType", "source"]
  }
}
```

#### PATCH /api/v1/leads/:id

Update a lead.

**Required Scope:** `leads:write`

**Request:**
```json
{
  "status": "contacted",
  "notes": "Had initial call, very interested"
}
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    ...
    "status": "contacted",
    "notes": "Had initial call, very interested",
    "updatedAt": "2025-01-15T14:00:00Z"
  }
}
```

#### DELETE /api/v1/leads/:id

Delete a lead.

**Required Scope:** `leads:delete`

**Response (200):**
```json
{
  "success": true,
  "message": "Lead deleted"
}
```

#### POST /api/v1/leads/:id/activities

Add an activity to a lead.

**Required Scope:** `leads:write`

**Request:**
```json
{
  "type": "note",
  "description": "Follow-up call scheduled for next week"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "leadId": "lead-uuid",
    "type": "note",
    "description": "Follow-up call scheduled for next week",
    "createdAt": "2025-01-15T14:30:00Z"
  }
}
```

### System

#### GET /api/v1/health

Health check endpoint (no auth required).

**Response (200):**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

#### GET /api/v1/me

Get information about the current API key.

**Required Scope:** Any valid key

**Response (200):**
```json
{
  "keyPrefix": "oct_a1b2...",
  "name": "Claude Bot",
  "scopes": ["leads:read", "leads:write"],
  "createdAt": "2025-01-10T10:00:00Z"
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_API_KEY` | 401 | API key missing or invalid |
| `INSUFFICIENT_SCOPE` | 403 | Key doesn't have required scope |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Webhook Events

When leads are created or updated via API, webhooks are triggered:

- `lead.created` - New lead created
- `lead.updated` - Lead updated
- `lead.status_changed` - Lead status changed
- `lead.deleted` - Lead deleted

See [08-webhooks.md](./08-webhooks.md) for webhook payload format.

## Inputs

| Endpoint | Input | Validation |
|----------|-------|------------|
| Create lead | JSON body | Required fields, email format |
| Parse lead | text string | Non-empty, < 5000 chars |
| Update lead | JSON partial | Valid field values |
| List leads | Query params | Valid page/limit numbers |

## Outputs

All responses follow consistent format:
- Success: `{ "data": ... }` or `{ "success": true }`
- Error: `{ "error": "message", "code": "CODE" }`
- Lists include `pagination` object

## Success Criteria

1. **Reliability**: 99.9% uptime
2. **Performance**: P95 latency < 200ms
3. **Consistency**: Consistent error formats
4. **Documentation**: OpenAPI spec available

## Testing

| Test | Method |
|------|--------|
| CRUD operations | Create, read, update, delete lead via API |
| Pagination | Request pages, verify correct results |
| Search | Search by name/email, verify matches |
| Auth rejection | Request without key, verify 401 |
| Scope rejection | Request with wrong scope, verify 403 |
| Rate limiting | Exceed limit, verify 429 |
| AI parsing | Send text, verify extracted fields |

## SDK / Client Libraries

Future consideration: Provide official clients for:
- TypeScript/JavaScript
- Python
- cURL examples in documentation
