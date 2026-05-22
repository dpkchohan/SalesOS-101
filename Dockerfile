FROM node:22-slim

# Enable pnpm via corepack (pinned to match workspace version)
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# ── Dependency layer (cached unless manifests change) ──────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy every package.json in the workspace so pnpm can resolve the graph
COPY lib/db/package.json             lib/db/
COPY lib/api-zod/package.json        lib/api-zod/
COPY lib/api-spec/package.json       lib/api-spec/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/

RUN pnpm install --no-frozen-lockfile

# ── Source layer ───────────────────────────────────────────────────────────
COPY lib/         lib/
COPY artifacts/api-server/ artifacts/api-server/

# ── Build ──────────────────────────────────────────────────────────────────
RUN pnpm --filter @workspace/api-server run build

# ── Runtime ───────────────────────────────────────────────────────────────
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
