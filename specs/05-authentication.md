# Authentication Specification

## Overview

Authentication system for the CRM admin interface. Single admin user, internet-facing, session-based authentication.

## Requirements

### Functional Requirements

1. **Login**
   - Email + password authentication
   - "Remember me" option (extends session duration)
   - Redirect to intended page after login

2. **Session Management**
   - Secure, httpOnly cookies
   - Configurable session duration
   - Automatic session refresh on activity
   - Manual logout

3. **Password Management**
   - Change password (requires current password)
   - Password strength requirements
   - Future: password reset via email

4. **Security**
   - Rate limiting on login attempts
   - Account lockout after failed attempts
   - Secure password hashing (Argon2 or bcrypt)
   - CSRF protection

### Non-Functional Requirements

- Session persists across browser restarts (if "remember me")
- Login page loads < 500ms
- Failed login feedback doesn't reveal if email exists

## User Model

Single admin user (for initial version):

```typescript
interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}
```

## Session Model

```typescript
interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}
```

## Authentication Flow

### Login Flow

```
1. User visits /login
2. User enters email + password
3. POST /api/auth/login
   - Validate credentials
   - If invalid: return 401, increment failed attempts
   - If locked out: return 423, show lockout message
   - If valid: create session, set cookie, return 200
4. Redirect to dashboard (or intended URL)
```

### Session Validation Flow

```
1. Request arrives with session cookie
2. Extract token from cookie
3. Hash token, lookup session in database
4. If not found or expired: clear cookie, redirect to /login
5. If valid: refresh expiration if needed, continue to route
```

### Logout Flow

```
1. POST /api/auth/logout
2. Delete session from database
3. Clear session cookie
4. Redirect to /login
```

## API Endpoints

### POST /api/auth/login

**Request:**
```json
{
  "email": "admin@octatech.xyz",
  "password": "secretpassword",
  "rememberMe": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@octatech.xyz"
  }
}
```
Sets cookie: `session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/`

**Invalid Credentials (401):**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

**Account Locked (423):**
```json
{
  "success": false,
  "error": "Account locked. Try again in 15 minutes."
}
```

### POST /api/auth/logout

**Response (200):**
```json
{
  "success": true
}
```
Clears session cookie.

### GET /api/auth/me

Returns current user if authenticated.

**Authenticated (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@octatech.xyz"
  }
}
```

**Not Authenticated (401):**
```json
{
  "error": "Not authenticated"
}
```

### POST /api/auth/change-password

**Request:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newstrongpassword"
}
```

**Success (200):**
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

**Invalid Current Password (400):**
```json
{
  "success": false,
  "error": "Current password is incorrect"
}
```

## Security Measures

### Password Requirements

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Not in common password list

### Password Hashing

Use **Argon2id** (preferred) or **bcrypt** with cost factor 12:

```typescript
import { hash, verify } from '@node-rs/argon2';

// Hashing
const passwordHash = await hash(password, {
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4,
});

// Verification
const isValid = await verify(passwordHash, password);
```

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/auth/login | 5 attempts | 15 minutes |
| POST /api/auth/change-password | 3 attempts | 15 minutes |

After exceeding limit:
- Return 429 Too Many Requests
- Lock account for 15 minutes (login only)

### Session Security

- Token: 32 random bytes, base64url encoded
- Storage: Only hash stored in database
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`
- Duration: 24 hours (default), 30 days (remember me)

### CSRF Protection

- Use `SameSite=Lax` cookies (prevents most CSRF)
- For extra safety: require custom header `X-Requested-With: XMLHttpRequest`

## Initial Setup

On first deployment, create admin user via CLI or environment variable:

```bash
# Environment variables for initial setup
ADMIN_EMAIL=admin@octatech.xyz
ADMIN_PASSWORD=initialpassword
```

Or migration script:
```sql
INSERT INTO admin_user (email, password_hash)
VALUES ('admin@octatech.xyz', '$argon2id$...');
```

## Inputs

| Input | Source | Validation |
|-------|--------|------------|
| Email | Login form | Valid email format |
| Password | Login form | Non-empty |
| Session token | Cookie | 32+ bytes, base64url |

## Outputs

| Output | Description |
|--------|-------------|
| Session cookie | Set on successful login |
| User object | Returned from /api/auth/me |
| Error messages | Generic, non-revealing |

## Success Criteria

1. **Security**: Cannot access admin UI without valid session
2. **Usability**: Login flow is fast and straightforward
3. **Persistence**: Session survives browser restart (with remember me)
4. **Protection**: Brute force attempts are blocked

## Testing

| Test | Method |
|------|--------|
| Valid login | Correct credentials → success, cookie set |
| Invalid password | Wrong password → 401, no cookie |
| Invalid email | Unknown email → 401 (same message as wrong password) |
| Rate limiting | 6 attempts → 429 on 6th |
| Session validation | Valid cookie → access granted |
| Expired session | Expired cookie → redirect to login |
| Logout | Session deleted, cookie cleared |
| Password change | Valid current password required |

## Future Enhancements

- Password reset via email
- Two-factor authentication (TOTP)
- Login notifications
- Session management UI (view/revoke sessions)
- Multiple admin users
