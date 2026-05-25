#!/usr/bin/env sh
set -e

echo "Running database migrations..."
pnpm --filter @workspace/db run migrate
echo "Migrations complete. Starting server..."

exec node --enable-source-maps artifacts/api-server/dist/index.mjs
