# SalesOS — Complete Feature Reference

> **Stack:** React + Vite · Express 5 · Drizzle ORM · PostgreSQL · Anthropic Claude · Sarvam AI · Clerk Auth  
> **Deployment:** Coolify (self-hosted) · Supabase (production DB) · S3-compatible object storage  
> Last updated: June 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication & Multi-Tenancy](#2-authentication--multi-tenancy)
3. [Dashboard](#3-dashboard)
4. [Pipeline (Kanban Board)](#4-pipeline-kanban-board)
5. [Leads](#5-leads)
6. [Contacts](#6-contacts)
7. [Tasks](#7-tasks)
8. [AI Chat Assistant](#8-ai-chat-assistant)
9. [Documents (Proposals & Contracts)](#9-documents-proposals--contracts)
10. [Import — Standard CSV/Excel](#10-import--standard-csvexcel)
11. [Import — AI-Powered Smart Import](#11-import--ai-powered-smart-import)
12. [Settings](#12-settings)
13. [Admin Panel](#13-admin-panel)
14. [Cross-Cutting Features](#14-cross-cutting-features)
15. [API Surface](#15-api-surface)

---

## 1. Overview

SalesOS is a **mobile-first, AI-native sales CRM** designed for individual sales reps and small teams. The guiding principle is "close more, scroll less" — every workflow is optimised for speed on a phone, with a richer desktop layout available when needed.

Core design decisions:
- **Single, calm surface** — pipeline, contacts, tasks, and AI in one unified shell
- **Voice-first for India** — built-in multilingual speech input/output via Sarvam AI
- **AI everywhere** — Claude (Anthropic) drives the assistant, document generation, lead analysis, and smart data import
- **Offline-resilient** — `Cache-Control: no-store` on HTML + version polling ensures users always run the latest build without manual refreshes

---

## 2. Authentication & Multi-Tenancy

| Feature | Detail |
|---|---|
| Provider | Clerk (multi-tenant, organisation-scoped) |
| Sign-up / Sign-in | Email/password + social providers via Clerk |
| Organisation isolation | All data (contacts, leads, tasks, documents) is scoped to `orgId` |
| Customer numbers | Auto-assigned sequential IDs in `CUST-000001` format per org |
| Roles | Admin guard on admin-only pages |
| Session tokens | Clerk JWT passed as `Authorization: Bearer` to every API call |

---

## 3. Dashboard

The "Today" page — the default landing view after sign-in.

### Metrics shown
- **Active pipeline value** — sum of `valueUsd` across all open deals (non-won, non-lost)
- **Total open deals** — count across all stages
- **Pipeline bar chart** — per-stage breakdown with animated height bars
- **At-risk leads** — leads flagged by AI signals (red flags), shown as an alert card
- **Tasks due today** — count with a quick-link to the Tasks page
- **Recent activity** — last few interactions logged across all leads

### Behaviour
- Refreshes on mount via TanStack Query
- Pull-to-refresh on mobile
- Quick navigation links to Pipeline, Tasks, and individual at-risk leads

---

## 4. Pipeline (Kanban Board)

Visual deal board across six stages: **New → Interested → Qualified → Negotiating → Won → Lost**

### Desktop
- Full Kanban with columns for each stage
- **Drag and drop** cards between columns using `@dnd-kit/core`
- Deal value and contact name visible on each card
- AI signal count badge (red dot) when a lead has open flags
- Export button (CSV / Excel) via `ExportMenu`

### Mobile
- **Swipe gestures** — swipe left/right to move between stages
- Stage tab bar with smooth scroll to active tab
- Same card layout, touch-optimised tap targets

### Lead cards
Each card shows:
- Contact name + company
- Deal value (formatted with currency)
- Assignee initials avatar
- Signal count badge if AI flags are present

### Stage transitions
Moving a card invalidates pipeline, leads list, and dashboard summary queries simultaneously so all views stay in sync.

---

## 5. Leads

Table/list view of all deals with per-stage filtering.

### Features
- **Stage filter tabs** — All, New, Interested, Qualified, Negotiating, Won, Lost
- **Mobile swipe** — same gesture navigation as Pipeline
- **Inline stage move** — arrow buttons on each row to bump a deal forward or back one stage without opening the detail page
- **Create new lead** — slide-up form: contact picker, value, currency, close date, source
- **Export** — CSV or Excel download of the current filtered view

### Lead Detail page (`/leads/:id`)
Full record view for a single deal:

| Section | Detail |
|---|---|
| Header | Contact name, company, stage badge, deal value |
| Stage mover | One-click advance/retreat through all six stages |
| AI Analysis | "Analyse" button → Claude scans all interactions, tasks, and contact data, returns risk flags and a recommendation paragraph |
| AI Signals | List of all open signals (stale, at-risk, next-step missing, etc.) with severity indicators |
| Interactions | Chronological log — calls, emails, meetings, notes. Each entry shows type icon, date, gist summary, and Claude-extracted gains/misses/next-step |
| Log interaction | Modal form: type, free-text gist → Claude enriches it with structured sentiment, gains, misses, next step |
| Tasks | Deal-scoped task list with create/complete/delete |
| Edit fields | Inline edit for value, currency, close date, source, assignee |

---

## 6. Contacts

The contact book — people and associated company records.

### List view (`/contacts`)
- **Search** — full-text across name, email, phone; also supports `CUST-` customer number lookup
- **Pagination** — 25 per page with prev/next controls
- **Tabs** — "All" and "Duplicates"
- **Duplicate detection** — server automatically detects probable duplicates (by email, phone normalisation); shown in the Duplicates tab with merge action
- **Merge contacts** — select a target contact; all linked leads, tasks, and interactions are re-parented, duplicate record is soft-deleted
- **AI deduplication** — "Auto-deduplicate" button runs a Claude-assisted batch merge across all flagged pairs
- **Create contact** — slide-up form: name, email, phone, title, company (combobox), tags (multi-value input), LinkedIn URL
- **Export** — CSV or Excel

### Contact Detail page (`/contacts/:id`)
| Section | Detail |
|---|---|
| Header | Name, company, customer number |
| Actions | Edit, Delete (with confirm), open in Chat |
| Fields | Name, email, phone, title, company, LinkedIn URL, tags |
| Notes | Long-form free-text field with auto-save |
| Related leads | List of deals linked to this contact, with stage badges and values |
| Related contacts | Other contacts at the same company |
| Interaction history | All logged calls, emails, meetings, notes across all linked leads |
| Company | Inline company name linked to company record |

### Company records
Contacts belong to companies. Companies are created on-demand when a contact form includes a company name. Company credentials (SMTP, branding) are stored separately and used for proposal emails.

---

## 7. Tasks

Three views of the same task data, switchable via a tab bar.

### List view (`/tasks`)
- **Filters** — Today (due today), All open, Completed
- Checkbox to mark complete, with strikethrough animation
- Delete task
- **Create task** — title, due date (date picker), due time, priority (high / medium / low), optional link to a contact or lead
- Tasks due today are highlighted

### Kanban view (`/tasks-kanban`)
- Columns: To Do, In Progress, Done
- Drag cards between columns (desktop)
- Same card data as list view

### Calendar view (`/tasks-calendar`)
- Monthly grid
- Tasks plotted on their due date
- Click a day to see tasks and create new ones

---

## 8. AI Chat Assistant

The centrepiece of SalesOS. A conversational interface powered by **Anthropic Claude** that understands sales context and takes real actions in the CRM.

### Access
`/chat` — full-screen on mobile, right-panel split on desktop.

### Input methods

| Method | Detail |
|---|---|
| Text | Standard keyboard input |
| Voice (microphone) | Records audio in-browser, sends base64 to `/api/voice/transcribe` → Sarvam AI speech-to-text |
| File attachment | Upload CSV, spreadsheet, PDF, or image; Claude extracts contact/lead data and offers to apply it |

### Voice — Sarvam AI
- Model: `saaras:v2.5` (Indian multilingual ASR)
- Supported input languages: English (India), हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം
- Automatic language detection if language is set to "unknown"
- **Text-to-speech output** — assistant replies can be read aloud in the same 6 languages via Sarvam TTS; toggle speaker icon to enable/disable

### Intent detection

Claude parses every message and returns a structured `intent` field. Supported intents and what happens:

| Intent | What SalesOS does |
|---|---|
| `create_contact` | Inserts a new contact, checks for duplicates first, warns if found |
| `create_lead` | Creates a lead linked to a matching contact |
| `update_lead_stage` | Moves a named deal to the specified stage |
| `log_interaction` | Logs a call/email/meeting/note against the named contact; Claude auto-extracts type, gist, sentiment, gains, misses, next step |
| `create_task` | Creates one or more tasks (single or batch); supports due date and priority |
| `send_proposal` | Generates an HTML proposal document and sends it via Gmail to the contact's email |
| `query_pipeline` | Answers natural-language questions about the pipeline ("how many deals in qualified?") |
| `query_calendar` | Queries the connected Google Calendar for upcoming events |
| `search` | Full-text search across contacts and leads, returns a formatted list |
| `general` | Free-form conversation, Q&A, brainstorming — no CRM action |

### Attachment workflow
1. User attaches a file (CSV, image, PDF) to a chat message
2. Claude reads the file and extracts structured contacts/leads
3. A preview card shows extracted records
4. User clicks "Apply" → records are inserted into the CRM

### Conversation history
- Chat sessions are persisted per user in the database
- Session shown on load; new session on "Clear"
- Messages show timestamps, intent badges, and attached cards

### Suggestion chips
Starter suggestions shown in empty state:
- "Add new contact Sarah Lee, sarah@globex.com, VP Eng at Globex"
- "Remind me to follow up with Acme tomorrow"
- "Logged a call with Acme — they want pricing by Friday"
- "Move Initech to qualified"

---

## 9. Documents (Proposals & Contracts)

Manage, generate, and send sales documents.

### List view (`/documents`)
- Filter tabs: All, Drafts, Sent, Approved
- Each card shows document type (proposal / contract / etc.), title, and relative timestamp

### Document Detail (`/documents/:id`)
- Full HTML preview of the generated document
- Status management: draft → sent → approved
- **Regenerate** — re-run AI generation with updated inputs
- **Send via email** — sends the HTML document to the contact's email address using the company's connected Gmail account

### AI proposal generation
Triggered from the Chat assistant (`send_proposal` intent) or from a Lead Detail page:
- Claude receives: company branding (logo, colours, name), contact details, deal value, interaction history
- Outputs a styled HTML proposal document
- Stored in the `documents` table with `status: draft`
- Can be regenerated with a revised prompt

### Gmail integration
- Connected per-org in Settings → Company tab → Google Calendar/Gmail section
- OAuth2 flow: user authorises Gmail send scope
- Tokens stored encrypted in `google_connections` table
- Used exclusively for outbound proposal email sending

---

## 10. Import — Standard CSV/Excel

Manual column-mapping import for structured spreadsheets.

### Workflow (4 steps)
1. **Upload** — drag-and-drop or file picker; `.csv`, `.xls`, `.xlsx` up to 10 MB
2. **Preview & mapping** — server reads headers and first few rows; Claude suggests column-to-field mapping; user can override each mapping via dropdowns
3. **Importing** — progress bar; server processes rows in batches
4. **Done** — summary: contacts created, contacts updated, leads created, companies created, skipped, errors with row numbers and reasons

### Supported SalesOS fields
`name`, `first_name`, `last_name`, `email`, `phone`, `company`, `title`, `lead_status`, `value_usd`, `close_date`, `linkedin_url`, `(do not import)`

### Deduplication during import
- Email and phone are normalised before insert
- If a matching contact exists, the record is updated rather than duplicated
- Companies are matched by name (case-insensitive)

---

## 11. Import — AI-Powered Smart Import

Handles messy, non-standard data that defeats regular column mapping.

### How it differs
- Accepts any structured file — business card exports, CRM dumps, marketing lists, even images of spreadsheets
- Claude analyses the full file to detect data type, estimate quality, flag issues, and auto-map columns — no manual mapping required
- Processes data in batches of 10 rows with up to 2 concurrent Claude calls

### Workflow
1. **Upload** — same drag-and-drop UI; up to 50 MB
2. **AI Preview** — Claude returns:
   - Detected file type
   - Estimated contact and lead count
   - Data quality score (0–100)
   - Issues list (missing emails, inconsistent formats, etc.)
   - Sample of extracted contacts for review
3. **Processing** — background batch job with real-time progress bar
4. **Done** — same summary as standard import

### Storage
Import jobs are persisted in `import_jobs` table so large files can be re-checked if the user navigates away.

---

## 12. Settings

### Account tab
| Setting | Detail |
|---|---|
| Profile photo | Upload avatar (stored in object storage); displayed as initials fallback |
| Display name | Edit name synced with Clerk user profile |
| Email | Read-only (managed by Clerk) |
| Sign out | Calls `clerk.signOut()` |

### Company tab
| Setting | Detail |
|---|---|
| Company name | Org-level display name |
| Logo | Upload company logo (used in proposal documents) |
| Primary colour | Hex colour picker used as accent in proposals |
| Customer number prefix | Custom prefix for auto-assigned contact IDs (default: `CUST`) |
| Google Calendar & Gmail | OAuth2 connect button → authorises read-calendar + send-email scopes; shows connected email once authorised; "Disconnect" button |
| Backfill contacts | One-click sync to import contacts from the connected Google account |

---

## 13. Admin Panel

Accessible only to admin users (guarded by `AdminGuard` component). Not linked from the main nav.

### Feedback (`/admin/feedback`)
- All in-app feedback submissions across all organisations
- Columns: user, org, page URL, description, criticality (1–5 scale with colour coding), status
- Criticality colours: 1 = green, 2 = yellow, 3 = orange, 4 = red, 5 = rose
- Status workflow: open → reviewed → resolved
- Screenshot preview (full-size modal)
- Delete feedback entries
- Paginated with prev/next

### Errors (`/admin/errors`)
- Frontend JavaScript errors captured by the global `ErrorBoundary`
- Columns: user, org, message, page URL, browser user-agent, status, timestamp
- Full stack trace expandable inline
- Search by message text
- Status workflow: new → investigated → fixed → ignored
- Paginated with prev/next

---

## 14. Cross-Cutting Features

### Mobile-first layout
- `AppLayout` renders a **bottom navigation bar** on mobile, **left sidebar** on desktop
- All pages use responsive breakpoints (`md:` prefix)
- Pipeline and Leads use **touch swipe** to navigate between stages
- Chat page fills the full viewport height on mobile with proper keyboard-safe layout
- Framer Motion animations throughout (fade/slide on list items, stagger delays)

### "Update available" banner
- Every production build stamps a unique hash (`Date.now().toString(36)`) into the JS bundle and writes it to `dist/public/version.json`
- The app polls `/version.json` every **5 minutes** in production
- If the hash in `version.json` differs from the hash baked into the running bundle, a non-intrusive banner appears at the bottom of the screen:
  ```
  ┌────────────────────────────────────────┐
  │  Update available        [ ↺ Refresh ] │
  └────────────────────────────────────────┘
  ```
- Clicking "Refresh" calls `window.location.reload()`
- `index.html` and `version.json` are always served with `Cache-Control: no-store` so new navigations/tabs always load the latest build without the banner

### Export
- **ExportMenu** component available on Contacts and Pipeline/Leads pages
- Exports current view as CSV or formatted Excel (`.xlsx`)

### Duplicate contact detection
- On every contact creation (UI form, Chat assistant, import), the server checks for matching email (normalised) or phone (normalised E.164)
- Matches are flagged with `isDuplicate: true` and surfaced in the Contacts → Duplicates tab
- The Chat assistant warns inline if a created contact matches an existing one

### AI signals
- After Claude analyses a lead (`analyze_lead`), it writes structured signals to `ai_signals` table
- Signal types: stale deal, missing next step, pricing objection, budget risk, champion gone, etc.
- Severity: `info`, `warning`, `critical`
- Signals appear as badges on Pipeline cards, as a list on Lead Detail, and as an "at-risk" section on the Dashboard

### In-app feedback
- **FeedbackModal** accessible from the app layout
- Fields: description (free text), criticality (1–5), automatic screenshot capture via `html2canvas`
- Submissions stored in `feedback` table and visible in the Admin Feedback panel

### Error boundary
- Global `ErrorBoundary` wraps the React tree
- Unhandled errors are POSTed to `/api/errors` with message, stack, page URL, and user agent
- Captured in the Admin Errors panel
- User sees a friendly "Something went wrong" screen with a reload button

### Object storage
- S3-compatible bucket used for: contact/company photo uploads, chat attachments, import files
- Pre-signed download URLs for client-side retrieval
- Files are scoped to `userId/orgId` path prefix

### Structured logging
- `pino` JSON logger on the API server
- Request ID injected on every request
- All route errors logged with `req.log.error({ err }, message)`

---

## 15. API Surface

Base path: `/api`  
Auth: `Authorization: Bearer <clerk-jwt>` on all routes except `/api/health`

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check (no auth) |
| GET | `/me` | Current user + org info |
| **Leads** | | |
| GET | `/leads` | List leads (filter by stage, search) |
| POST | `/leads` | Create lead |
| GET | `/leads/:id` | Get single lead with interactions, tasks, signals |
| PATCH | `/leads/:id` | Update lead (stage, value, close date, assignee) |
| DELETE | `/leads/:id` | Delete lead |
| GET | `/pipeline` | Kanban data — leads grouped by stage |
| GET | `/dashboard` | Summary metrics (pipeline value, at-risk count, tasks due today) |
| POST | `/leads/:id/analyze` | Trigger Claude AI analysis, persist signals |
| **Contacts** | | |
| GET | `/contacts` | List contacts (search, paginate, filter by company) |
| POST | `/contacts` | Create contact |
| GET | `/contacts/:id` | Get single contact |
| PATCH | `/contacts/:id` | Update contact |
| DELETE | `/contacts/:id` | Delete contact |
| GET | `/contacts/duplicates` | List duplicate pairs |
| POST | `/contacts/:id/merge` | Merge into target contact |
| POST | `/contacts/deduplicate` | Batch AI-assisted deduplication |
| GET | `/contacts/:id/related` | Contacts at the same company |
| **Tasks** | | |
| GET | `/tasks` | List tasks (filter: dueToday, includeCompleted) |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/:id` | Update task (title, due date, completed) |
| DELETE | `/tasks/:id` | Delete task |
| **Chat** | | |
| POST | `/chat` | Send message, get Claude response + CRM actions |
| GET | `/chat/sessions` | List chat sessions |
| GET | `/chat/sessions/:id` | Get messages for a session |
| **Voice** | | |
| POST | `/voice/transcribe` | Audio base64 → text (Sarvam AI) |
| POST | `/voice/speak` | Text → audio base64 (Sarvam TTS) |
| **Documents** | | |
| GET | `/documents` | List documents |
| POST | `/documents` | Create document |
| GET | `/documents/:id` | Get single document |
| PATCH | `/documents/:id` | Update document (title, status, content) |
| POST | `/documents/generate` | AI-generate HTML proposal from lead data |
| POST | `/documents/:id/regenerate` | Regenerate with new prompt |
| POST | `/documents/:id/send-email` | Send document via Gmail |
| **Import** | | |
| POST | `/import/preview` | Parse CSV/Excel, return headers + AI-suggested mapping |
| POST | `/import/run` | Execute import with provided column mapping |
| POST | `/import-ai/upload` | Upload file for AI smart import |
| GET | `/import-ai/jobs/:id` | Poll AI import job status |
| **Signals** | | |
| GET | `/signals` | List AI signals (filter by leadId) |
| **Interactions** | | |
| POST | `/interactions` | Log an interaction against a lead |
| **Companies** | | |
| GET | `/companies` | List companies (search) |
| POST | `/companies` | Create company |
| **Attachments** | | |
| POST | `/attachments/upload` | Upload file to object storage, return attachment record |
| POST | `/attachments/extract` | Claude extracts contacts/leads from attachment |
| POST | `/attachments/apply` | Insert extracted records into CRM |
| **Settings** | | |
| GET | `/company-credentials` | Get org branding & SMTP config |
| PUT | `/company-credentials` | Upsert org branding |
| GET | `/calendar/status` | Google Calendar connection status |
| POST | `/contacts/backfill` | Import contacts from Google account |
| **Auth** | | |
| GET | `/auth/google/connect` | Start Google OAuth2 flow |
| GET | `/auth/google/callback` | OAuth2 callback handler |
| **Admin** | | |
| GET | `/admin/feedback` | List feedback submissions |
| PATCH | `/admin/feedback/:id` | Update feedback status |
| DELETE | `/admin/feedback/:id` | Delete feedback |
| POST | `/errors` | Report a frontend error |
| GET | `/admin/errors` | List error reports |
| PATCH | `/admin/errors/:id` | Update error status |
| DELETE | `/admin/errors/:id` | Delete error report |
| **Storage** | | |
| GET | `/storage/download-url` | Get pre-signed download URL for a stored file |

---

*This document is generated from the live codebase. If a feature has been added or removed since this was written, the source of truth is the code in `artifacts/salesos-web/src/` and `artifacts/api-server/src/routes/`.*
