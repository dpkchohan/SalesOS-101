FROM node:22-slim

# Enable pnpm via corepack (pinned to match workspace version)
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# ── Dependency layer (cached unless manifests change) ──────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./

# Copy every package.json in the workspace so pnpm can resolve the graph
COPY lib/db/package.json              lib/db/
COPY lib/api-zod/package.json         lib/api-zod/
COPY lib/api-spec/package.json        lib/api-spec/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/salesos-web/package.json artifacts/salesos-web/
COPY scripts/package.json              scripts/

# Coolify may inject NODE_ENV=production at build time. Explicitly request
# devDependencies because TypeScript/Vite/esbuild are needed to build.
RUN pnpm install --no-frozen-lockfile --prod=false

# ── Source layer ──────────────────────────────────────────────────────────
COPY tsconfig.base.json ./
COPY lib/                   lib/
COPY artifacts/api-server/  artifacts/api-server/
COPY artifacts/salesos-web/ artifacts/salesos-web/

# ── Build ─────────────────────────────────────────────────────────────────
RUN pnpm --filter @workspace/salesos-web run build
RUN pnpm --filter @workspace/api-server run build

# ── Runtime ───────────────────────────────────────────────────────────────
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

COPY scripts/migrate-and-start.sh scripts/migrate-and-start.sh
COPY scripts/lint-migrations.sh scripts/lint-migrations.sh
RUN chmod +x scripts/migrate-and-start.sh scripts/lint-migrations.sh

CMD ["sh", "scripts/migrate-and-start.sh"]
