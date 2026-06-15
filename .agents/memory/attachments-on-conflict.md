---
name: Attachments apply ON CONFLICT fix
description: The contacts partial unique index has AND is_duplicate = false — ON CONFLICT clauses must match exactly.
---

The contacts table unique index is:
  contacts_org_email_unique: (org_id, lower(email)) WHERE email IS NOT NULL AND is_duplicate = false

Any raw SQL ON CONFLICT clause targeting this index must include the full predicate:
  ON CONFLICT (org_id, lower(email)) WHERE email IS NOT NULL AND is_duplicate = false

**Why:** The partial unique index was created with `AND is_duplicate = false` so that duplicate-flagged rows don't block new canonical inserts. Postgres requires ON CONFLICT to exactly match the index predicate.

**How to apply:** Check attachments.ts, import.ts, importAi.ts — any upsert on contacts by email must use the full predicate. importAi.ts already had it right; attachments.ts was fixed in Sprint 1.
