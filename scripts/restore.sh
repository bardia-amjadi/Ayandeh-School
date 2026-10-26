#!/usr/bin/env bash
# Restore a backup-YYYYMMDD-HHMMSS.tar produced by the in-app backup tool.
# Usage (on the server, next to .env):  ./restore.sh backup-20261024-120309.tar
# DESTRUCTIVE: replaces the database contents and the uploads volume.
set -euo pipefail
F="${1:?backup .tar path}"; C="docker compose -f ${COMPOSE_FILE:-docker-compose.prod.yml}"
[ -f "$F" ] || { echo "not found: $F"; exit 1; }
read -r -p "This REPLACES all current data. Type RESTORE to continue: " ans; [ "$ans" = "RESTORE" ] || exit 1
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
tar -xf "$F" -C "$T"
( cd "$T" && sha256sum -c <(python3 - <<'PY'
import json;m=json.load(open("manifest.json"))["sha256"]
print("\n".join(f"{h}  {f}" for f,h in m.items()))
PY
) )
$C stop api web
$C up -d db
$C exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$T/db.dump"
docker run --rm -v ayandeh_uploads:/u -v "$T":/b alpine sh -c 'rm -rf /u/* /u/.[!.]* 2>/dev/null; tar -xf /b/uploads.tar -C /u'
$C up -d
echo "Restored. Verify: log in, open a record and download an uploaded file; GET /api/health should be ok."
