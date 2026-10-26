#!/usr/bin/env bash
# End-to-end deployment smoke test against the real Docker stack (used by CI; also runnable locally).
# Verifies: stack starts + migrates, bootstrap, login through the web proxy, upload, DATA PERSISTS after container
# recreation, CloudPixel link shipped, backup -> mutate -> restore round trip.
set -euo pipefail
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BASE="http://127.0.0.1:${WEB_PORT:-8080}"; PW='Smoke-Passw0rd!!'; JAR="$(mktemp)"; TMP="$(mktemp -d)"
dc() { docker compose "$@"; }
step() { echo; echo "== $*"; }
wait_health() { for _ in $(seq 1 60); do curl -fsS "$BASE/api/health" >/dev/null 2>&1 && return 0; sleep 3; done; echo "health check timed out"; dc logs --tail=80; exit 1; }
login() { CSRF="$(curl -fsS -c "$JAR" -H 'content-type: application/json' -d "{\"username\":\"root\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | jq -r .csrfToken)"; [ -n "$CSRF" ] && [ "$CSRF" != null ]; }
call() { local m="$1" p="$2"; shift 2; curl -fsS -X "$m" -b "$JAR" -H "x-csrf-token: $CSRF" "$@" "$BASE/api$p"; }
jcall() { local m="$1" p="$2" d="$3"; call "$m" "$p" -H 'content-type: application/json' -d "$d"; }

step "start stack"; dc up -d --build; wait_health
step "bootstrap super admin (and refuse a second one)"
dc run --rm -e SUPERADMIN_USERNAME=root -e SUPERADMIN_PASSWORD="$PW" api node dist/cli/create-super-admin.js
! dc run --rm -e SUPERADMIN_USERNAME=root2 -e SUPERADMIN_PASSWORD="$PW" api node dist/cli/create-super-admin.js >/dev/null 2>&1
step "login through the web container (nginx -> api)"; login
[ "$(call GET /auth/me | jq -r .role)" = SUPER_ADMIN ]
step "security headers + CloudPixel attribution shipped"
curl -fsSI "$BASE/" | grep -qi '^content-security-policy:'
JS="$(curl -fsS "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)"; curl -fsS "$BASE$JS" | grep -q 'https://cloudpix.ir'
curl -fsS "$BASE$JS" | grep -q 'قدرت‌یافته با CloudPixel'
step "create data: student + uploaded file"
jcall POST /users '{"username":"smoke_student","password":"Student-Passw0rd!!","role":"STUDENT","firstName":"نمونه","lastName":"تست"}' >/dev/null
printf '%%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%%%EOF\nsmoke\n' > "$TMP/s.pdf"
RID="$(call POST /resources -F title=Smoke -F type=pdf -F scope=GENERAL -F "file=@$TMP/s.pdf;type=application/pdf" | jq -r .id)"
call GET "/resources/$RID/download" -o "$TMP/dl1"; H1="$(sha256sum < "$TMP/dl1")"
step "recreate containers (volumes kept) and verify persistence"
dc down; dc up -d; wait_health; login
[ "$(call GET '/users?q=smoke_student' | jq -r .total)" = 1 ]
call GET "/resources/$RID/download" -o "$TMP/dl2"; [ "$(sha256sum < "$TMP/dl2")" = "$H1" ]
step "create backup via API and download it"
BK="$(call POST /admin/backups | jq -r .name)"; call GET "/admin/backups/$BK" -o "$TMP/$BK"; [ "$(stat -c %s "$TMP/$BK")" -gt 1000 ]
step "mutate data after backup, then restore"
jcall POST /users '{"username":"after_backup","password":"Student-Passw0rd!!","role":"STUDENT","firstName":"x","lastName":"y"}' >/dev/null
printf 'RESTORE\n' | ./scripts/restore.sh "$TMP/$BK"; wait_health; login
[ "$(call GET '/users?q=after_backup' | jq -r .total)" = 0 ]
[ "$(call GET '/users?q=smoke_student' | jq -r .total)" = 1 ]
call GET "/resources/$RID/download" -o "$TMP/dl3"; [ "$(sha256sum < "$TMP/dl3")" = "$H1" ]
echo; echo "SMOKE OK"
