---
name: Chat session tables missing migration
description: chat_sessions and chat_messages had no Drizzle migration; contacts.notes also missing. All fixed in 0002_chat_sessions.sql.
---

## The rule
Any new Drizzle schema table or column addition MUST have a corresponding migration generated and applied before the feature will work at runtime.

## What happened
`chatSessionsTable` and `chatMessagesTable` were added to `lib/db/src/schema/chatSessions.ts` and exported from the schema index, but no Drizzle migration was ever generated. Same for `contacts.notes` column. At runtime, every `db.insert(chatSessionsTable)` threw "relation 'chat_sessions' does not exist", which was silently caught — masking the bug.

**Why:** The Drizzle ORM type system lets you write queries against tables that don't exist in the DB; errors only surface at runtime and only if the catch block re-throws.

## How to apply
- After editing any file in `lib/db/src/schema/`, run:
  ```
  pnpm --filter @workspace/db run generate   # creates SQL migration file
  pnpm --filter @workspace/db run migrate    # applies it to the DB
  ```
- If `generate` fails with a path error (double-path `__dirname` issue in drizzle.config.ts), write the SQL migration manually and add an entry to `lib/db/migrations/meta/_journal.json`.
- Migration SQL should use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` for safety.

## Related bugs fixed at the same time
- `POST /api/chat/sessions` and `GET /api/chat-sessions/:id/messages` routes were missing — frontend pre-session creation and transcript loading hit 404. Added both to `artifacts/api-server/src/routes/chat.ts`.
- `createCalendarEvent` in chat.ts general path was called with 1 arg instead of `(userId, input)`. Fixed.
- Tasks page defaulted to `"today"` filter — tasks created by chat (future/null due dates) were invisible. Changed default to `"open"`.
