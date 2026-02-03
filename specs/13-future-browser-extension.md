# Browser Extension Specification (Future)

## Overview

A browser extension that allows scraping lead information from LinkedIn profiles and sending it to the CRM. This is a **future feature** and not part of the initial implementation.

## Status

**Not Implemented** - This spec documents planned functionality for future development.

## Requirements

### Functional Requirements

1. **LinkedIn Profile Scraping**
   - Extract contact info from LinkedIn profile pages
   - Capture: name, headline, company, location, profile URL
   - Note: Email/phone usually not available on LinkedIn

2. **Send to CRM**
   - One-click "Add to Octatech CRM" button
   - Authenticate with CRM API key
   - Pre-fill extracted data, allow editing before save

3. **Extension UI**
   - Popup showing extracted profile info
   - Edit fields before sending
   - Status indicator (saved, error)
   - Settings for API configuration

### Non-Functional Requirements

- Works in Chrome and Firefox
- Minimal permissions requested
- Does not store sensitive data locally

## Technical Approach

### Manifest V3 (Chrome Extension)

```json
{
  "manifest_version": 3,
  "name": "Octatech CRM",
  "version": "1.0.0",
  "description": "Add LinkedIn profiles to Octatech CRM",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://api.octatech.xyz/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/in/*"],
      "js": ["content.js"]
    }
  ]
}
```

### Content Script (LinkedIn Scraping)

```typescript
// content.js - runs on LinkedIn profile pages

function scrapeLinkedInProfile(): ProfileData {
  const data: ProfileData = {
    name: null,
    headline: null,
    company: null,
    location: null,
    profileUrl: window.location.href,
    source: 'LinkedIn',
  };

  // Name
  const nameElement = document.querySelector('h1.text-heading-xlarge');
  if (nameElement) {
    data.name = nameElement.textContent?.trim() || null;
  }

  // Headline (usually contains role + company)
  const headlineElement = document.querySelector('.text-body-medium');
  if (headlineElement) {
    data.headline = headlineElement.textContent?.trim() || null;
  }

  // Company (from experience section or headline)
  const companyElement = document.querySelector(
    '[data-field="experience_company_logo"]'
  )?.closest('li')?.querySelector('span[aria-hidden="true"]');
  if (companyElement) {
    data.company = companyElement.textContent?.trim() || null;
  }

  // Location
  const locationElement = document.querySelector(
    '.text-body-small.inline.t-black--light'
  );
  if (locationElement) {
    data.location = locationElement.textContent?.trim() || null;
  }

  return data;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeProfile') {
    const data = scrapeLinkedInProfile();
    sendResponse(data);
  }
});
```

### Popup UI

```html
<!-- popup.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { width: 320px; padding: 16px; font-family: system-ui; }
    h2 { font-size: 16px; margin: 0 0 12px 0; }
    .field { margin-bottom: 12px; }
    label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; }
    input, textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    button { width: 100%; padding: 10px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; }
    button:hover { background: #5558e3; }
    .status { font-size: 12px; margin-top: 8px; text-align: center; }
    .success { color: #10b981; }
    .error { color: #ef4444; }
  </style>
</head>
<body>
  <h2>Add to Octatech CRM</h2>

  <div class="field">
    <label>Name</label>
    <input type="text" id="name" />
  </div>

  <div class="field">
    <label>Company</label>
    <input type="text" id="company" />
  </div>

  <div class="field">
    <label>Headline</label>
    <input type="text" id="headline" />
  </div>

  <div class="field">
    <label>LinkedIn URL</label>
    <input type="text" id="profileUrl" readonly />
  </div>

  <div class="field">
    <label>Notes</label>
    <textarea id="message" rows="3" placeholder="Add context about this lead..."></textarea>
  </div>

  <button id="saveBtn">Save to CRM</button>
  <div class="status" id="status"></div>

  <script src="popup.js"></script>
</body>
</html>
```

### Popup Logic

```typescript
// popup.js

async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if on LinkedIn profile
  if (!tab.url?.includes('linkedin.com/in/')) {
    document.body.innerHTML = '<p>Navigate to a LinkedIn profile to use this extension.</p>';
    return;
  }

  // Request profile data from content script
  const data = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeProfile' });

  // Populate form
  document.getElementById('name').value = data.name || '';
  document.getElementById('company').value = data.company || '';
  document.getElementById('headline').value = data.headline || '';
  document.getElementById('profileUrl').value = data.profileUrl || '';
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Saving...';
  statusEl.className = 'status';

  // Get API key from storage
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    statusEl.textContent = 'Please configure API key in extension settings';
    statusEl.className = 'status error';
    return;
  }

  // Prepare lead data
  const lead = {
    name: document.getElementById('name').value,
    company: document.getElementById('company').value,
    message: document.getElementById('message').value + '\n\nLinkedIn: ' + document.getElementById('profileUrl').value,
    source: 'LinkedIn (Extension)',
  };

  try {
    const response = await fetch('https://api.octatech.xyz/api/v1/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(lead),
    });

    if (response.ok) {
      statusEl.textContent = 'Lead saved successfully!';
      statusEl.className = 'status success';
    } else {
      throw new Error('Failed to save');
    }
  } catch (err) {
    statusEl.textContent = 'Error saving lead. Check API key.';
    statusEl.className = 'status error';
  }
});

init();
```

## LinkedIn Scraping Limitations

### What Can Be Scraped

| Field | Availability | Notes |
|-------|--------------|-------|
| Name | Always | Public on profile |
| Headline | Always | Public on profile |
| Company | Usually | From headline or experience |
| Location | Usually | Public on profile |
| Profile URL | Always | Current page URL |
| About | Sometimes | May require scrolling |
| Experience | Sometimes | May require scrolling |

### What Cannot Be Scraped

| Field | Reason |
|-------|--------|
| Email | Only visible to connections |
| Phone | Only visible to connections |
| Full work history | Requires authentication + scrolling |

### LinkedIn Terms of Service

LinkedIn's ToS prohibits automated scraping. This extension:
- Only scrapes data visible to the logged-in user
- Does not automate actions
- Requires manual trigger by user
- Should be used responsibly for individual leads

## Alternative: LinkedIn Sales Navigator API

For compliant, scalable lead capture, consider LinkedIn Sales Navigator API:
- Official API with proper access
- Requires LinkedIn partnership
- More reliable data access
- Higher cost

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ LinkedIn Page   │────▶│ Browser         │────▶│ Octatech CRM    │
│                 │     │ Extension       │     │ API             │
│ - Profile data  │     │ - Scrape        │     │ - POST /leads   │
│ - User clicks   │     │ - Edit          │     │ - Store lead    │
│   extension     │     │ - Send to CRM   │     │ - Notify admin  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Settings Page

Extension settings for API configuration:

```html
<!-- settings.html -->
<h2>Octatech CRM Settings</h2>

<div class="field">
  <label>API Key</label>
  <input type="password" id="apiKey" placeholder="oct_..." />
  <small>Get your API key from the CRM dashboard</small>
</div>

<button id="saveSettings">Save Settings</button>
```

## Success Criteria

1. **Extraction**: Correctly extracts name, company from 90%+ of profiles
2. **Reliability**: Extension works consistently on LinkedIn
3. **UX**: One-click workflow from profile to saved lead
4. **Security**: API key stored securely, transmitted over HTTPS

## Testing

| Test | Method |
|------|--------|
| Profile scraping | Visit various LinkedIn profiles, verify extraction |
| API submission | Submit lead, verify appears in CRM |
| Error handling | Disconnect network, verify graceful error |
| API key validation | Invalid key, verify clear error message |

## Development Timeline

This is a **future feature**. Estimated implementation:
- Phase 1: Chrome extension MVP
- Phase 2: Firefox support
- Phase 3: Enhanced scraping (more fields)
- Phase 4: Bulk operations (if needed)

## Inputs

| Input | Source |
|-------|--------|
| LinkedIn profile page | Browser content |
| User edits | Extension popup |
| API key | Extension settings |

## Outputs

| Output | Destination |
|--------|-------------|
| Lead data | CRM API |
| Status feedback | Extension popup |

## Security Considerations

1. **API key storage**: Use `chrome.storage.sync` (encrypted)
2. **Minimal permissions**: Only request necessary host permissions
3. **No data collection**: Extension doesn't send data anywhere except user's CRM
4. **HTTPS only**: All API calls over HTTPS
