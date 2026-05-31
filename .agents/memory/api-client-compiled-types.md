---
name: API client compiled types
description: @workspace/api-client-react resolves from dist/*.d.ts not src/; must update both when adding fields.
---

When you add a field to `lib/api-client-react/src/generated/api.schemas.ts`, TypeScript in the consuming apps still errors because `@workspace/api-client-react` resolves its types from the compiled `dist/generated/api.schemas.d.ts` file, not the source.

**Why:** The package.json `exports` map points to `dist/`, so `pnpm tsc --noEmit` reads the compiled declaration file.

**How to apply:** Whenever you add or rename a field in `lib/api-client-react/src/generated/api.schemas.ts`, make the identical change in `lib/api-client-react/dist/generated/api.schemas.d.ts`. Both files must stay in sync manually (orval is not wired to auto-rebuild).
