 # SalesOS

**Your AI Sales Coach. Just Talk. Close 20% More Deals.** 

The simplest CRM for the world's most complex job  —a conversational, AI-powered sales assistant built for Indian sales teams. Voice-first, Hinglish-native, zero training required...
 
---   
  
## What is SalesOS?  
  
SalesOS is a CRM that works like WhatsApp, not like enterprise software. A sales rep opens the app, sees their deals, talks to Claude (voice or text), and closes deals. No forms, no menus, no learning curve..

Most CRMs fail because reps don't use them. SalesOS is built around a single principle: **a rep should only ever see 4–5 things, and AI handles the rest in the background.**

### The 3 USPs

1. **Your AI Sales Coach** — Claude suggests next steps, spots patterns, predicts closes..
2. **Just Talk** — Voice or text. "I called John" → logged. No data entry.
3. **Close 20% More Deals** — Faster cycles, better objection handling, smarter prioritization..

---

## Core Features

### For Sales Reps (the 4–5 things)
- **See my deals** — auto-loaded pipeline, sorted by urgency
- **Chat with Claude** — text + voice, English or Hinglish
- **Log what happened** — conversational ("sent a proposal to Acme")
- **Get help** — proactive AI suggestions and red-flag detection
- **Manage tasks** — kanban + calendar views

### For Team Leads
- Team dashboard (pipeline, health score, alerts)
- Per-rep performance metrics
- Coaching feedback system
- Deal-stalling detection

### Intelligence & Automation
- AI red-flag detection (stalling deals, unclear budget)
- Voice input (Whisper STT) and voice output (Sarvam TTS, Hinglish)
- Document/proposal generation with company branding
- Business-card OCR (photo → contact via Claude Vision)
- File attachments in chat (PDF, Word, Excel, images)

### Data Management
- CSV/Excel import with HubSpot/Salesforce/Pipedrive auto-detection
- Duplicate detection (by email + phone, format-insensitive)
- Unique customer IDs (`CUST-000001`, `CUST-000002`, …)
- Contact merge
- CSV/Excel export

### Mobile
- Mobile-first responsive design
- Installable PWA (iOS + Android)
- Offline support for cached pages

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, TailwindCSS, Wouter (routing) |
| Backend | Node.js + Express |
| ORM | Drizzle |
| Database | PostgreSQL (Neon / Supabase) |
| Auth | Clerk |
| AI reasoning | Claude (Anthropic API) |
| Speech-to-text | Whisper (OpenAI SDK) |
| Text-to-speech | Sarvam AI (bulbul:v2, Hinglish) |
| Object storage | Configurable bucket |

---

## Project Structure

```
SalesOS-101/
├── lib/
│   ├── db/                  # Drizzle schema + migrations
│   └── api-spec/            # OpenAPI spec
├── artifacts/
│   ├── api-server/          # Express backend
│   │   └── src/
│   │       ├── routes/      # contacts, companies, leads,
│   │       │                # interactions, tasks, ai-signals,
│   │       │                # documents, emails, voice, import/export
│   │       └── seed.ts      # demo data seeder (idempotent)
│   └── salesos-web/         # React frontend
│       └── src/
│           ├── pages/       # Dashboard, Pipeline, Contacts,
│           │                # Tasks, Chat, Docs, Settings, Import
│           └── components/
└── README.md
```

---

## Environment Variables

Create a `.env` file (never commit it) with:

```
# Database
DATABASE_URL=

# Auth (Clerk)
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
VITE_CLERK_PUBLISHABLE_KEY=

# AI
CLAUDE_API_KEY=
AI_INTEGRATIONS_OPENAI_API_KEY=
AI_INTEGRATIONS_OPENAI_BASE_URL=
SARVAM_AI_API=

# Session
SESSION_SECRET=

# Object storage
DEFAULT_OBJECT_STORAGE_BUCKET_ID=
PUBLIC_OBJECT_SEARCH_PATHS=
PRIVATE_OBJECT_DIR=
```

---

## Getting Started

```bash
# 1. Clone
git clone https://github.com/dpkchohan/SalesOS-101.git
cd SalesOS-101

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env   # then fill in your values

# 4. Run database migrations
cd artifacts/api-server
npx drizzle-kit migrate

# 5. Seed demo data (optional)
npm run seed

# 6. Start backend
npm run dev

# 7. In another terminal — start frontend
cd ../salesos-web
npm run dev
```

Backend runs on the configured API port; frontend on Vite's dev server.

---

## Deployment

Production target (in migration):

- **Frontend** → Vercel
- **Backend** → Railway
- **DNS / CDN** → Cloudflare
- **Database** → Supabase (Postgres)
- **Auth** → Clerk (production instance on `clerk.salesos.pddt.in`)

Live domain: `salesos.pddt.in`

---

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Core CRM, Claude chat, voice, import, mobile/PWA | Shipped |
| 2 | Teams, manager dashboard, coaching, metrics | In progress |
| 3 | MEETOS integration (auto-log meetings) | Planned |
| 4 | Bharat BaaS substrate (smarter AI) | Planned |
| 5 | Team insights | Planned |
| 6 | Marketing / deal-intelligence insights | Planned |
| 7 | Forecasting | Planned |

**Guiding principle across all phases:** reps always see the same 4–5 things; everything just gets smarter underneath.

---

## Design Philosophy

> The best CRM is the one sales reps actually use.

- Complexity is **hidden**, not removed — AI absorbs it.
- No configuration, no training, no jargon.
- One obvious action per screen.
- Help over hassle.

When in doubt, make it simpler.

---

## Support

Email: **sales@pddt.in**
.
---

## License

Proprietary — © Phenomeny LLP. All rights reserved.

Built by [Phenomeny LLP](https://phenomeny.in) · [pddt.in](https://pddt.in)
# Force clean Railway build
