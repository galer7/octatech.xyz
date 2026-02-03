# API Key Management Specification

## Overview

System for creating and managing API keys that allow external systems (Claude bot, integrations) to access the CRM API programmatically.

## Requirements

### Functional Requirements

1. **Create API Key**
   - Generate secure random key
   - Assign friendly name
   - Select permission scopes
   - Display full key once (never shown again)
   - Store only hash in database

2. **List API Keys**
   - Show all keys with prefix, name, scopes
   - Show last used timestamp
   - Show creation date
   - Indicate if revoked

3. **Revoke API Key**
   - Soft delete (mark as revoked)
   - Immediately invalidates key
   - Keep record for audit

4. **Use API Key**
   - Authenticate via header: `Authorization: Bearer oct_xxx`
   - Validate key hash against database
   - Check scopes for requested action
   - Update last_used_at timestamp

### Non-Functional Requirements

- Key generation uses cryptographically secure random
- Key validation < 50ms
- Keys are never logged or exposed

## Key Format

```
oct_[32 random alphanumeric characters]

Example: oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

- Prefix `oct_` for easy identification
- 32 characters of base62 (a-z, A-Z, 0-9)
- Total length: 36 characters

## Permission Scopes

| Scope | Description |
|-------|-------------|
| `leads:read` | Read lead information |
| `leads:write` | Create and update leads |
| `leads:delete` | Delete leads |
| `leads:*` | All lead permissions |

Scopes are checked on each API request. A key must have the required scope to perform an action.

## Data Model

```typescript
interface ApiKey {
  id: string;
  name: string;           // "Claude Bot", "Zapier Integration"
  keyHash: string;        // SHA-256 hash of the full key
  keyPrefix: string;      // First 8 chars for display: "oct_a1b2..."
  scopes: string[];       // ["leads:read", "leads:write"]
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}
```

## API Endpoints

### POST /api/admin/api-keys

Create a new API key. **Admin auth required.**

**Request:**
```json
{
  "name": "Claude Bot",
  "scopes": ["leads:read", "leads:write"]
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "name": "Claude Bot",
  "key": "oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "keyPrefix": "oct_a1b2...",
  "scopes": ["leads:read", "leads:write"],
  "createdAt": "2025-01-15T10:00:00Z"
}
```

**Note:** The `key` field is only returned on creation. Store it securely; it cannot be retrieved again.

### GET /api/admin/api-keys

List all API keys. **Admin auth required.**

**Response (200):**
```json
{
  "keys": [
    {
      "id": "uuid",
      "name": "Claude Bot",
      "keyPrefix": "oct_a1b2...",
      "scopes": ["leads:read", "leads:write"],
      "lastUsedAt": "2025-01-15T14:30:00Z",
      "createdAt": "2025-01-10T10:00:00Z",
      "revokedAt": null
    }
  ]
}
```

### DELETE /api/admin/api-keys/:id

Revoke an API key. **Admin auth required.**

**Response (200):**
```json
{
  "success": true,
  "message": "API key revoked"
}
```

### PATCH /api/admin/api-keys/:id

Update API key name or scopes. **Admin auth required.**

**Request:**
```json
{
  "name": "Claude Bot v2",
  "scopes": ["leads:*"]
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "name": "Claude Bot v2",
  "keyPrefix": "oct_a1b2...",
  "scopes": ["leads:*"],
  "lastUsedAt": "2025-01-15T14:30:00Z",
  "createdAt": "2025-01-10T10:00:00Z"
}
```

## Key Generation Algorithm

```typescript
import { randomBytes, createHash } from 'crypto';

function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Generate 24 random bytes (produces 32 base62 chars)
  const bytes = randomBytes(24);

  // Convert to base62
  const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (const byte of bytes) {
    randomPart += base62[byte % 62];
  }

  const key = `oct_${randomPart}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 12) + '...';

  return { key, hash, prefix };
}
```

## Key Validation Algorithm

```typescript
import { createHash } from 'crypto';

async function validateApiKey(key: string): Promise<ApiKey | null> {
  // Check format
  if (!key.startsWith('oct_') || key.length !== 36) {
    return null;
  }

  // Hash the provided key
  const hash = createHash('sha256').update(key).digest('hex');

  // Lookup in database
  const apiKey = await db.query(
    'SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
    [hash]
  );

  if (!apiKey) {
    return null;
  }

  // Update last used
  await db.query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    [apiKey.id]
  );

  return apiKey;
}
```

## Scope Checking

```typescript
function hasScope(apiKey: ApiKey, requiredScope: string): boolean {
  // Check for wildcard
  const [resource, action] = requiredScope.split(':');

  return apiKey.scopes.some(scope => {
    if (scope === requiredScope) return true;
    if (scope === `${resource}:*`) return true;
    if (scope === '*') return true;
    return false;
  });
}

// Usage in middleware
if (!hasScope(apiKey, 'leads:write')) {
  return c.json({ error: 'Insufficient permissions' }, 403);
}
```

## Security Considerations

1. **Key Storage**: Only SHA-256 hash stored in database
2. **Key Display**: Full key shown only once at creation
3. **Transmission**: Keys sent over HTTPS only
4. **Logging**: Keys never written to logs
5. **Timing Attacks**: Use constant-time comparison for hashes

## Inputs

| Input | Source | Validation |
|-------|--------|------------|
| API key | Authorization header | Format oct_[32 chars] |
| Name | Admin UI | 1-255 characters |
| Scopes | Admin UI | Valid scope values |

## Outputs

| Output | Description |
|--------|-------------|
| Full key | Only at creation time |
| Key prefix | For identification in lists |
| Validation result | Valid key + scopes, or rejection |

## Success Criteria

1. **Security**: Cannot derive key from stored hash
2. **Usability**: Easy to create and manage keys
3. **Auditability**: Track when keys are used
4. **Revocation**: Immediate effect when key revoked

## Testing

| Test | Method |
|------|--------|
| Key generation | Generate key, verify format |
| Key uniqueness | Generate 1000 keys, no duplicates |
| Hash storage | Verify only hash in database, not key |
| Valid key auth | Use valid key, request succeeds |
| Invalid key auth | Use wrong key, 401 returned |
| Revoked key auth | Use revoked key, 401 returned |
| Scope enforcement | Use key without required scope, 403 returned |
| Last used update | Use key, verify timestamp updated |

## Admin UI Integration

The admin UI provides:
- Key list with search
- Create key modal with scope checkboxes
- Copy-to-clipboard for new keys
- Revoke confirmation dialog
- Last used relative timestamps ("2 hours ago")
