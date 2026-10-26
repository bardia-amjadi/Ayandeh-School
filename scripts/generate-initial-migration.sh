#!/usr/bin/env bash
# Run ONCE on a machine with internet access to Prisma engines and a throwaway Postgres:
#   docker run -d --name pgtmp -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:16-alpine
#   DATABASE_URL=postgresql://postgres:x@localhost:5432/postgres scripts/generate-initial-migration.sh
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
npx prisma migrate dev --name init --create-only
echo "Review and commit apps/api/prisma/migrations/"
