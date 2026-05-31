---
name: Clerk import path in salesos-web
description: The Clerk package in salesos-web is @clerk/react, not @clerk/clerk-react.
---

In `artifacts/salesos-web`, Clerk is installed as `@clerk/react` (not the more commonly referenced `@clerk/clerk-react`).

**Why:** The package.json lists `"@clerk/react": "^6.4.7"`. Importing from `@clerk/clerk-react` results in "Cannot find module" TS errors.

**How to apply:** Always import from `"@clerk/react"` in salesos-web components. e.g. `import { useAuth } from "@clerk/react";`
