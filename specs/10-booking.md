# Cal.com Booking Integration Specification

## Overview

Integration with Cal.com for scheduling consultations. The "Book consultation" buttons on the landing page will open Cal.com's booking interface.

## Requirements

### Functional Requirements

1. **Booking Link Configuration**
   - Admin can set Cal.com booking link in settings
   - Link used across all CTAs on landing page

2. **Integration Methods**
   - Embed as popup/modal (preferred for UX)
   - Fallback: direct link to Cal.com page

3. **Booking Flow**
   - User clicks "Book consultation" or "Book a call"
   - Cal.com widget opens as modal overlay
   - User selects time and provides details
   - Confirmation handled by Cal.com

4. **Optional Enhancements**
   - Pre-fill booking form with contact info (if available)
   - Create lead in CRM when booking is made (via Cal.com webhook)

### Non-Functional Requirements

- Widget loads < 2 seconds
- Works on mobile devices
- Graceful degradation if Cal.com unavailable

## Cal.com Setup

### Account Configuration

1. Create Cal.com account at [cal.com](https://cal.com)
2. Set up event type (e.g., "30-minute Discovery Call")
3. Configure availability
4. Get booking link: `https://cal.com/octatech/discovery`

### Event Type Settings (Recommended)

| Setting | Value |
|---------|-------|
| Duration | 30 minutes |
| Title | "Discovery Call" or "Technical Consultation" |
| Description | "Let's discuss your project requirements" |
| Questions | Name, Email, Company (optional), Project description |

## Integration: Embed Widget

### Installation

Add Cal.com embed script to the landing page:

```html
<!-- Cal.com Embed -->
<script>
  (function (C, A, L) {
    let p = function (a, ar) { a.q.push(ar); };
    let d = C.document;
    C.Cal = C.Cal || function () {
      let cal = C.Cal;
      let ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement("script")).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        const api = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];
        typeof namespace === "string" ? (cal.ns[namespace] = api) && p(api, ar) : p(cal, ar);
        return;
      }
      p(cal, ar);
    };
  })(window, "https://app.cal.com/embed/embed.js", "init");

  Cal("init", { origin: "https://cal.com" });
</script>
```

### Button Integration

Convert booking buttons to trigger Cal.com modal:

```html
<button
  data-cal-link="octatech/discovery"
  data-cal-config='{"layout":"month_view"}'
  class="inline-flex items-center h-11 px-4 rounded-xl bg-white text-neutral-900 text-sm font-medium hover:bg-white/90 transition">
  Book consultation
</button>
```

### Styling the Modal

Configure Cal.com embed styles to match Octatech brand:

```javascript
Cal("ui", {
  theme: "dark",
  styles: {
    branding: { brandColor: "#6366f1" }
  },
  hideEventTypeDetails: false,
  layout: "month_view"
});
```

## Integration: Direct Link (Fallback)

If embed doesn't work or for simpler implementation:

```html
<a href="https://cal.com/octatech/discovery"
   target="_blank"
   rel="noopener noreferrer"
   class="...button styles...">
  Book consultation
</a>
```

## CRM Integration (Optional)

### Cal.com Webhook → CRM Lead

Cal.com can send webhooks when bookings are made. This creates a lead automatically.

**Cal.com Webhook Configuration:**
1. In Cal.com dashboard → Settings → Developer → Webhooks
2. Add webhook URL: `https://api.octatech.xyz/api/webhooks/cal`
3. Select event: `BOOKING_CREATED`

**Webhook Payload (from Cal.com):**
```json
{
  "triggerEvent": "BOOKING_CREATED",
  "payload": {
    "title": "Discovery Call",
    "startTime": "2025-01-20T10:00:00Z",
    "endTime": "2025-01-20T10:30:00Z",
    "attendees": [
      {
        "email": "john@acme.com",
        "name": "John Doe",
        "timeZone": "America/New_York"
      }
    ],
    "responses": {
      "company": "Acme Inc",
      "projectDescription": "Need help with..."
    }
  }
}
```

**CRM Endpoint: POST /api/webhooks/cal**

```typescript
app.post('/api/webhooks/cal', async (c) => {
  const payload = await c.req.json();

  if (payload.triggerEvent === 'BOOKING_CREATED') {
    const attendee = payload.payload.attendees[0];

    // Check if lead already exists
    const existingLead = await db.query(
      'SELECT id FROM leads WHERE email = $1',
      [attendee.email]
    );

    if (!existingLead) {
      // Create new lead
      await db.query(`
        INSERT INTO leads (name, email, company, message, source, status)
        VALUES ($1, $2, $3, $4, 'Cal.com Booking', 'new')
      `, [
        attendee.name,
        attendee.email,
        payload.payload.responses?.company,
        payload.payload.responses?.projectDescription
      ]);
    }

    // Log activity if lead exists
    // ...
  }

  return c.json({ success: true });
});
```

## Admin Settings

Store Cal.com link in settings table:

```typescript
// Get setting
const calLink = await getSetting('cal_com_link');
// Default: 'https://cal.com/octatech/discovery'

// Update setting
await setSetting('cal_com_link', 'https://cal.com/octatech/consultation');
```

### Settings UI

```
┌─────────────────────────────────────────────────────────────┐
│ Booking Settings                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Cal.com Booking Link                                        │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ https://cal.com/octatech/discovery                      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ This link will be used for all "Book consultation"          │
│ buttons on the website.                                     │
│                                                             │
│                                              [Save Changes] │
└─────────────────────────────────────────────────────────────┘
```

## Landing Page Updates

Update these elements to use Cal.com:

1. **Header**: "Book consultation" button
2. **Hero Section**: "Book a call" button (Talk to an architect)
3. **Engagement Models**: "Book a call" button in Dedicated Team card
4. **CTA Section**: "Book call" button

## Inputs

| Input | Source | Validation |
|-------|--------|------------|
| Cal.com link | Admin settings | Valid cal.com URL |
| Booking data | Cal.com webhook | Validate signature if available |

## Outputs

| Output | Destination | Description |
|--------|-------------|-------------|
| Modal overlay | Landing page | Cal.com booking interface |
| New lead | CRM database | Created from booking webhook |

## Success Criteria

1. **Functionality**: Clicking button opens booking modal
2. **Mobile**: Modal works on mobile devices
3. **Branding**: Modal matches Octatech dark theme
4. **CRM Integration**: Bookings create leads automatically

## Testing

| Test | Method |
|------|--------|
| Button click | Click booking button, verify modal opens |
| Mobile modal | Test on mobile device |
| Complete booking | Book a test appointment |
| Webhook → Lead | Make booking, verify lead created in CRM |
| Settings update | Change Cal.com link, verify buttons update |

## Dependencies

- Cal.com account (free tier available)
- Cal.com embed script
- Optional: Cal.com webhook for CRM integration

## Future Enhancements

- Pre-fill booking form with lead data
- Show booking confirmation in CRM
- Sync booking status (canceled, rescheduled)
- Multiple event types (discovery, technical deep-dive)
