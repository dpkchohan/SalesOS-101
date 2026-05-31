-- Migration: add notes to contacts, create chat_sessions and chat_messages
-- Run this manually in the Supabase SQL editor (or via psql) for production.
-- The Drizzle ORM handles this automatically in development when SUPABASE_SESSION_URL is set.

-- 1. Add notes column to contacts (safe to re-run — uses IF NOT EXISTS pattern)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes text;

-- 2. Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_sessions_org_idx     ON chat_sessions (org_id);
CREATE INDEX IF NOT EXISTS chat_sessions_contact_idx ON chat_sessions (contact_id);
CREATE INDEX IF NOT EXISTS chat_sessions_user_idx    ON chat_sessions (user_id);

-- 3. Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id);
