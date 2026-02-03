# Contact Form Specification

## Overview

A contact form on the main landing page (octatech.xyz) that collects lead information and submits it to the CRM backend. Includes anti-spam protection via honeypot field.

## Requirements

### Functional Requirements

1. **Form Fields**
   - Name (required)
   - Email (required, validated)
   - Company (optional)
   - Phone (optional)
   - Budget Range (optional, dropdown)
   - Project Type (optional, dropdown)
   - Message (required, textarea)
   - How did you hear about us? (optional)

2. **Anti-Spam Protection (Honeypot)**
   - Hidden field that bots will fill out
   - If honeypot field has value, silently reject submission
   - No CAPTCHA (better UX)

3. **Form Behavior**
   - Client-side validation before submission
   - Loading state while submitting
   - Success message on completion
   - Error handling with user-friendly messages
   - Form clears after successful submission

4. **Backend Integration**
   - POST to `https://api.octatech.xyz/api/leads`
   - Creates new lead with status "new"
   - Triggers configured notifications (Discord/Telegram/Email)

### Non-Functional Requirements

- Form submission < 2 seconds
- Works without JavaScript (progressive enhancement, falls back to standard form POST)
- Accessible (proper labels, ARIA attributes)

## Form Fields Detail

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `name` | text | Yes | min 2 chars | Full name |
| `email` | email | Yes | Valid email format | Primary contact |
| `company` | text | No | - | Company/organization |
| `phone` | tel | No | Basic format check | International format supported |
| `budget` | select | No | Predefined options | See options below |
| `projectType` | select | No | Predefined options | See options below |
| `message` | textarea | Yes | min 10 chars | Project description |
| `source` | select | No | Predefined options | Attribution |
| `website` | text (hidden) | No | Must be empty | Honeypot field |

### Budget Range Options

- "Not sure yet"
- "$5,000 - $15,000"
- "$15,000 - $50,000"
- "$50,000 - $100,000"
- "$100,000+"

### Project Type Options

- "New Product / MVP"
- "Staff Augmentation"
- "Legacy Modernization"
- "Cloud Migration"
- "Performance Optimization"
- "Security Audit"
- "Other"

### Source Options

- "Google Search"
- "LinkedIn"
- "Referral"
- "Twitter/X"
- "Conference/Event"
- "Other"

## Honeypot Implementation

```html
<!-- Hidden from real users via CSS -->
<div style="position: absolute; left: -9999px;" aria-hidden="true">
  <label for="website">Website (leave blank)</label>
  <input type="text" name="website" id="website" tabindex="-1" autocomplete="off">
</div>
```

**Backend behavior:**
- If `website` field is not empty → reject silently (return 200 OK but don't save)
- Log rejected submissions for monitoring

## API Request

```http
POST /api/leads
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "company": "Acme Inc",
  "phone": "+1-555-123-4567",
  "budget": "$50,000 - $100,000",
  "projectType": "New Product / MVP",
  "message": "We need help building...",
  "source": "Google Search",
  "honeypot": ""
}
```

## API Response

**Success (201 Created):**
```json
{
  "success": true,
  "message": "Thank you! We'll be in touch within 24 hours."
}
```

**Validation Error (400 Bad Request):**
```json
{
  "success": false,
  "errors": {
    "email": "Please enter a valid email address",
    "message": "Message must be at least 10 characters"
  }
}
```

**Honeypot Triggered (200 OK - silent rejection):**
```json
{
  "success": true,
  "message": "Thank you! We'll be in touch within 24 hours."
}
```

## UI States

1. **Default**: Form ready for input
2. **Validating**: Client-side validation feedback
3. **Submitting**: Button disabled, spinner shown
4. **Success**: Form hidden, success message displayed
5. **Error**: Error message shown, form remains for correction

## Success Criteria

1. **Submission Works**: Form data arrives in CRM database
2. **Honeypot Effective**: Bot submissions are silently rejected
3. **Validation**: Invalid submissions show helpful error messages
4. **Notifications**: Admin receives notification when lead submitted
5. **UX**: Submission feels fast and responsive

## Testing

| Test | Method |
|------|--------|
| Happy path | Fill form correctly, verify lead appears in CRM |
| Validation | Submit with invalid email, verify error shown |
| Required fields | Submit empty form, verify all required errors shown |
| Honeypot | Fill honeypot field, verify no lead created |
| Network error | Disconnect network, verify graceful error message |
| Mobile | Test form on mobile device |

## Integration Points

- **CRM Backend**: `POST /api/leads` endpoint
- **Notifications**: Triggered after successful lead creation
- **Analytics**: Track form submissions (if analytics added later)

## Placement on Landing Page

The contact form will be integrated into:
1. The "Book consultation" CTA sections
2. A dedicated contact section at the bottom of the page
3. Optionally, a modal triggered by various CTAs
