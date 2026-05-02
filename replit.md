# SalesOS

## Overview

A mobile-first sales CRM built on the pnpm workspace monorepo. SalesOS gives sales reps a calm command deck for contacts, a kanban-style leads pipeline, interaction timelines, tasks, AI red-flag signals from Claude, conversational chat, and voice I/O via Sarvam STT/TTS. Installable as a PWA.

## Artifacts

- `artifacts/api-server` — Express 5 + Drizzle backend (auth, leads, contacts, interactions, tasks, AI signals, documents, chat, voice).
- `artifacts/salesos-web` — React + Vite + wouter + Clerk frontend with tailwind, framer-motion, and PWA service worker.
- `artifacts/mockup-sandbox` — Canvas component preview server.

## Auth & onboarding

- Clerk (via `@clerk/express` on the API and `@clerk/react` on the web) provides sign-in / sign-up.
- On the first authenticated API call, `lib/auth.ts` fetches the Clerk profile, creates an organization + user row, and idempotently seeds demo data (4 companies, 5 contacts, 4 leads, 5 interactions, 6 tasks, 2 AI signals, 3 documents) so the app is alive on first paint.

## AI

- `lib/claude.ts` wraps the Anthropic SDK using `claude-haiku-4-5` for lead analysis and the chat assistant.
- `lib/aiAnalyze.ts` produces structured red-flag signals stored in `aiSignalsTable`.
- `lib/proposalGen.ts` calls Claude with the contact, lead, recent interactions, and the org's branding profile to author a structured proposal, then renders it as standalone branded HTML (inline styles + print media query) saved as a `documents` row.
- Voice: `routes/voice.ts` uses OpenAI Whisper (`gpt-4o-mini-transcribe` via Replit AI Integrations proxy) for push-to-talk speech-to-text and Sarvam `text-to-speech` for spoken replies. The Chat header has a TTS mute toggle persisted in `localStorage` (`salesos.ttsEnabled`).
- Tasks page has three views as tabs: List (`/tasks`), Kanban (`/tasks-kanban` — Today/Tomorrow/Pending/Finished columns), and Calendar (`/tasks-calendar` — month grid with click-day modal). All three live under a shared `TasksTabs` strip exported from `pages/Tasks.tsx`.

## Branding & Proposals

- `companyCredentialsTable` (one row per org, unique on `orgId`) stores company name, base64 logo data URL, three brand colors, footer text, and contact details (website/email/phone/address/tax id).
- `GET/PUT /api/company-credentials` — read and upsert the org's branding profile.
- `POST /api/documents/generate-proposal { contactId, leadId, proposalContext }` — fetches contact + lead + recent interactions + branding, calls Claude, saves a `draft` document, and returns it.
- `GET /api/documents/:id` — fetches one document, used by the detail page.
- Chat: a `send_proposal` intent in `routes/chat.ts` resolves a contact by name, finds an open lead, generates the HTML proposal, and returns the new `documentId` on the chat reply so the UI can deep-link to the preview.
- Settings page (`pages/Settings.tsx`) has Account and Company tabs. The Company tab is the branding form (logo file → base64 ≤ ~2 MB, three color pickers with hex inputs, contact + footer fields, sticky save).
- Document detail page (`pages/DocumentDetail.tsx`, route `/documents/:id`) previews the proposal HTML in a sandboxed iframe via `srcdoc`, with Print/Save-PDF (`iframe.contentWindow.print()`), Mark sent, and Mark approved actions. The iframe uses `sandbox="allow-same-origin allow-modals"` so generated HTML cannot run scripts.

## Import / Export

- `routes/importExport.ts` (multer + xlsx) handles CSV and Excel ingest from HubSpot, Salesforce, Pipedrive, etc.
  - `POST /api/import/preview` returns headers, sample rows, and an auto-detected column → SalesOS field mapping.
  - `POST /api/import/contacts` processes the file with the user's mapping, dedupes contacts by `(orgId, email)`, auto-creates companies, validates emails, maps lead status (`In Progress` → `negotiating`, `Open` → `interested`, etc.), and creates a lead per row with a recognized status.
  - `GET /api/export/contacts?format=csv|xlsx` and `GET /api/export/leads?format=csv|xlsx` stream downloads of the org's data.
- Frontend: `pages/Import.tsx` is a 4-step wizard (upload → map → progress → done). `components/ExportMenu.tsx` is the CSV/Excel dropdown surfaced on Contacts and Pipeline.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (CORS allowlisted to localhost / `.replit.dev` / `.replit.app`)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Frontend**: React 19 + Vite 7 + wouter v3 + tailwind v4 + framer-motion + lucide-react

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
