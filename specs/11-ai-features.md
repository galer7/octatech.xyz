# AI Features Specification

## Overview

AI-powered features for the CRM, primarily using OpenAI to parse natural language input into structured lead data.

## Requirements

### Functional Requirements

1. **Natural Language Lead Parsing**
   - Accept free-form text describing a potential lead
   - Extract structured data: name, email, company, phone, budget, project type, source
   - Display extracted data for review before saving
   - Store original text for reference

2. **Configuration**
   - OpenAI API key stored in settings
   - Model selection (default: gpt-4o-mini for cost efficiency)

### Non-Functional Requirements

- Parsing completes < 5 seconds
- Graceful handling of unclear/incomplete input
- Cost-efficient (use smaller models where possible)

## Lead Parsing Feature

### User Flow

1. Admin navigates to "Add Lead" → "AI Parse" tab
2. Pastes or types natural language text
3. Clicks "Parse with AI"
4. System shows extracted fields for review
5. Admin can edit any field
6. Admin clicks "Save" to create lead

### Input Examples

**Example 1: Email-style input**
```
Got a message from Sarah Chen (sarah@techstartup.io) at TechStartup Inc.
They're looking for help with their cloud migration, budget around $75k,
found us through LinkedIn. Her phone is 415-555-9876.
```

**Example 2: Brief notes**
```
John Doe, john@acme.com, Acme Inc
Wants MVP for fintech app
Budget: 50-100k
Referral from Mike
```

**Example 3: Conversation summary**
```
Spoke with Maria Garcia who runs engineering at DataFlow Corp.
They need staff augmentation - 3 senior devs for 6 months.
She mentioned they found us at the TechCrunch conference.
Email is mgarcia@dataflow.io, didn't get budget but seemed like enterprise.
```

### OpenAI Prompt

```typescript
const systemPrompt = `You are a lead data extraction assistant. Extract structured lead information from natural language text.

Return a JSON object with these fields (use null for missing/unclear values):
- name: Full name of the contact
- email: Email address
- company: Company or organization name
- phone: Phone number (any format)
- budget: Map to one of these options or null:
  - "Not sure yet"
  - "$5,000 - $15,000"
  - "$15,000 - $50,000"
  - "$50,000 - $100,000"
  - "$100,000+"
- projectType: Map to one of these options or null:
  - "New Product / MVP"
  - "Staff Augmentation"
  - "Legacy Modernization"
  - "Cloud Migration"
  - "Performance Optimization"
  - "Security Audit"
  - "Other"
- source: How they found us (e.g., "Google Search", "LinkedIn", "Referral", "Conference", etc.)
- message: A brief summary of their needs/project (1-2 sentences)
- confidence: A number 0-1 indicating overall extraction confidence

Only return valid JSON, no explanation.`;

const userPrompt = `Extract lead information from this text:

"""
${inputText}
"""`;
```

### API Call

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function parseLeadText(text: string): Promise<ParsedLead> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt.replace('${inputText}', text) }
    ],
    temperature: 0.1,  // Low temperature for consistent extraction
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed;
}
```

### Response Structure

```typescript
interface ParsedLead {
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  budget: string | null;
  projectType: string | null;
  source: string | null;
  message: string | null;
  confidence: number;
}
```

### Example Response

For input:
```
Got a message from Sarah Chen (sarah@techstartup.io) at TechStartup Inc.
They're looking for help with their cloud migration, budget around $75k,
found us through LinkedIn.
```

Output:
```json
{
  "name": "Sarah Chen",
  "email": "sarah@techstartup.io",
  "company": "TechStartup Inc",
  "phone": null,
  "budget": "$50,000 - $100,000",
  "projectType": "Cloud Migration",
  "source": "LinkedIn",
  "message": "Looking for help with cloud migration",
  "confidence": 0.92
}
```

## API Endpoint

### POST /api/v1/leads/parse

Parse natural language into lead data.

**Required Scope:** `leads:write`

**Request:**
```json
{
  "text": "Got a message from Sarah Chen..."
}
```

**Response (200):**
```json
{
  "parsed": {
    "name": "Sarah Chen",
    "email": "sarah@techstartup.io",
    "company": "TechStartup Inc",
    "phone": null,
    "budget": "$50,000 - $100,000",
    "projectType": "Cloud Migration",
    "source": "LinkedIn",
    "message": "Looking for help with cloud migration"
  },
  "confidence": 0.92,
  "extractedFields": ["name", "email", "company", "budget", "projectType", "source", "message"]
}
```

To also save the lead immediately:

**Request:**
```json
{
  "text": "Got a message from Sarah Chen...",
  "autoSave": true
}
```

**Response (201):**
```json
{
  "lead": {
    "id": "uuid",
    "name": "Sarah Chen",
    ...
    "aiParsed": true,
    "rawInput": "Got a message from Sarah Chen..."
  },
  "parsed": { ... },
  "confidence": 0.92
}
```

### Error Handling

**Parsing failed (422):**
```json
{
  "error": "Could not extract lead information",
  "code": "PARSE_FAILED",
  "confidence": 0.15,
  "parsed": {
    "name": null,
    "email": null,
    ...
  }
}
```

**OpenAI error (503):**
```json
{
  "error": "AI service temporarily unavailable",
  "code": "AI_SERVICE_ERROR"
}
```

## Admin UI Integration

### AI Add Lead Page

```
┌─────────────────────────────────────────────────────────────┐
│  Add Lead with AI                                    [Back] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Paste any text about a potential lead and AI will extract  │
│  the relevant information.                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │ (textarea for input)                                    ││
│  │                                                         ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│                                   [Parse with AI] (loading) │
│                                                             │
│  ─────────────────── Extracted Information ───────────────  │
│                                                             │
│  Confidence: ████████░░ 85%                                │
│                                                             │
│  Name:     [Sarah Chen_____________]                        │
│  Email:    [sarah@techstartup.io___]                        │
│  Company:  [TechStartup Inc________]                        │
│  Phone:    [_______________________]                        │
│  Budget:   [$50,000 - $100,000 ▼___]                        │
│  Project:  [Cloud Migration ▼______]                        │
│  Source:   [LinkedIn_______________]                        │
│  Message:  [Looking for help with cloud migration]          │
│                                                             │
│                              [Cancel]  [Save Lead]          │
└─────────────────────────────────────────────────────────────┘
```

## Settings Configuration

### OpenAI API Key

Store in settings table (encrypted or via environment variable):

```typescript
// Environment variable (recommended)
process.env.OPENAI_API_KEY

// Or stored in settings (encrypted)
await getSetting('openai_api_key');
```

### Settings UI

```
┌─────────────────────────────────────────────────────────────┐
│ AI Settings                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ OpenAI API Key                                              │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ sk-••••••••••••••••••••••••••••••••                     ││
│ └─────────────────────────────────────────────────────────┘│
│ Used for AI lead parsing. Get your key at platform.openai.com│
│                                                             │
│                                              [Save Changes] │
└─────────────────────────────────────────────────────────────┘
```

## Cost Estimation

Using gpt-4o-mini:
- ~$0.15 per 1M input tokens
- ~$0.60 per 1M output tokens
- Average lead parse: ~500 input tokens, ~200 output tokens
- **Cost per parse: ~$0.0002 ($0.02 per 100 parses)**

## Inputs

| Input | Source | Validation |
|-------|--------|------------|
| Natural language text | Admin UI / API | Non-empty, < 5000 characters |
| OpenAI API key | Settings | Valid OpenAI key format |

## Outputs

| Output | Description |
|--------|-------------|
| Parsed lead data | Structured JSON with extracted fields |
| Confidence score | 0-1 indicating extraction quality |
| Extracted fields list | Which fields were successfully extracted |

## Success Criteria

1. **Accuracy**: Correctly extracts obvious fields (name, email) > 95% of time
2. **Speed**: Parsing completes < 5 seconds
3. **Usability**: Admin can review and edit before saving
4. **Cost**: Stays under $1/month for typical usage

## Testing

| Test | Method |
|------|--------|
| Clear input | Provide well-formatted text, verify all fields extracted |
| Partial input | Provide text with missing fields, verify nulls returned |
| Ambiguous input | Provide unclear text, verify low confidence |
| Budget mapping | Provide "$75k" text, verify maps to "$50k-$100k" |
| Email extraction | Various email formats, verify correct extraction |
| API error | Mock OpenAI failure, verify graceful error handling |

## Future Enhancements

- Lead enrichment (lookup company info from domain)
- Duplicate detection (check if similar lead exists)
- Smart suggestions (suggest follow-up actions)
- Email/conversation parsing (extract leads from email threads)
- Voice input (speech-to-text → lead parsing)
