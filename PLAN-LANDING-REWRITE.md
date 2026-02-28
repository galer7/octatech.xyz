# Landing Page Rewrite Plan

## Problem
The current landing page (`packages/blog/src/pages/index.astro`, 1312 lines) presents Octatech as a large enterprise agency with fabricated metrics and case studies. This undermines credibility with anyone who investigates.

### What's fake (remove)
- "120+ Engineers" — it's one person
- "98% Client Retention" — one client
- "2.5x Avg Velocity" — made up
- "12 Countries" — no
- "50+ enterprise clients" — no
- "FinTech Migration (Zero Downtime)" — fabricated case study
- "$120k/yr Cloud Audit savings" — fabricated
- "HIPAA Compliant" / "SOC2 Compliance" cards — not real
- "Marcus Chen, CTO FinStream" testimonial — fake person
- "Minimum engagement $25k" — unverified

### What's real (keep/highlight)
- Blog: 4 solid technical posts on AI agent workflows, backpressure, control planes
- Design/UX quality is high — dark theme, indigo accent, premium feel
- Cal.com booking integration
- CRM backend (Hono + Drizzle + PostgreSQL)

## New Positioning
Solo engineer → vertical AI studio. Honest, credible, compelling.

**Identity:** "I'm Gabriel Galer. I build AI-powered tools for professional domains where legacy workflows (Excel, manual processes) are the norm."

**Real credentials:**
- 7 years software engineering
- Full-stack TypeScript (React/Next.js + Node)
- Modernized Ruby platform serving 300k+ users (Leafwell)
- Deep knowledge of AI agent architectures (studied Loom, Kiro, Rovo, Claude Code internals)
- Ralph Loop practitioner
- Building: Geostruct (AI for geotechnical engineering), FormForm (AI user journeys for architects)

## New Page Structure

### Hero
- Headline: Something honest about building AI tools for underserved professional domains
- Subtitle: Solo engineer, vertical AI focus
- CTA: "Read the blog" + "Book a call" (Cal.com)
- No fake social proof / partner avatars

### What I Build (2-3 cards)
- **Geostruct** — AI replacing Excel workflows in geotechnical engineering. Romanian standards (NP 122-2010) encoded in software. Desktop app with AI chat.
- **FormForm** — AI-powered adaptive user journeys for architects/interior designers. Turns client responses into design briefs.
- **Leafwell** (contract work) — Modernizing Ruby legacy to TypeScript, event-driven architecture, 300k+ users.

### What I Know (expertise section)
- TypeScript/Node ecosystem (React, Next.js, Hono, Drizzle)
- AI agent workflows (Ralph Loop, agentic coding, control planes)
- Legacy modernization (Ruby→TS, Excel→software)
- Cloud infrastructure (AWS, Railway)

### Blog (keep as-is, prominent link)
Already has good content — "The Missing Control Plane for AI Coding", "Backpressure Is Infrastructure", etc.

### Contact
- Cal.com embed (already works)
- Simple form (keep honeypot, drop budget/company fields)

## Technical Notes
- Keep Astro 5.x + Tailwind stack
- Break up the 1312-line monolithic index.astro into components
- Keep the dark theme / design system — it looks good
- Remove Chart.js (the fake cost savings chart)
- Keep Cal.com integration
- Keep RSS feed / blog infrastructure

## Order of Execution
1. Extract index.astro sections into Astro components
2. Rewrite hero section with honest positioning
3. Replace fake case studies with real projects (Geostruct, FormForm, Leafwell)
4. Replace fake metrics with real expertise section
5. Simplify contact form
6. Remove Chart.js dependency
7. Test and deploy
