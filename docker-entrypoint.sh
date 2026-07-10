#!/bin/sh
set -e

echo "[entrypoint] applying database migrations..."
node --import tsx scripts/apply-migrations.ts

echo "[entrypoint] starting: $*"
exec "$@"
