# Ayandeh School (مدرسه آینده)

Persian-first (RTL) school management system: **React + Vite + TypeScript** · **NestJS + TypeScript** · **PostgreSQL + Prisma** · Docker Compose · GitHub Actions → GHCR.

> ## Honest status
> All features in the specification are implemented in code. **Nothing has been executed end-to-end yet.** The code was authored in a
> sandbox without Docker, PostgreSQL or access to Prisma's engine downloads, so what *has* been verified locally is limited to:
> the web app's `tsc` + `vite build`, and the pure-logic unit tests (57 tests passing: conflicts, access rules, URL/slug/file-type/ClamAV-protocol checks, Markdown
> sanitising; the 2 money tests need the Prisma client and have not run). The API has **never been compiled** against the generated Prisma client,
> and the e2e suite and Docker smoke test have **never run**. Expect the first CI run to surface some compile/test failures; fix-forward is
> expected. See `docs/ACCEPTANCE.md`. A successful build exists only when the GitHub Actions run for your commit is green.

## First steps (in this order)
1. Push this repo to GitHub.
2. **Actions → "Generate Prisma migration" → Run workflow** (once). It creates and commits `apps/api/prisma/migrations/…_init` using Prisma's own tooling on a GitHub-hosted runner. (Re-run it after any future schema change.)
3. The **CI** workflow then runs on that commit: typecheck, unit + e2e tests (PostgreSQL service), build, production-compose validation, Docker **smoke test** (persistence + backup/restore), and — on `main` / `v*.*.*` tags — publishes images to GHCR.
4. Send/fix whatever fails. Do not deploy until it is green.

## What is implemented
| Area | Implementation |
|---|---|
| Auth | opaque server-side sessions (hashed token, HttpOnly + SameSite=Strict cookie), CSRF double-submit token, argon2id, login/reset rate limits, session revocation (logout, logout-all, password change, deactivation), admin-issued one-time reset tokens, no public registration, first super admin via CLI |
| Authorization | central permission model, global guards, resource-level checks in services; deputy permissions configurable by super admin from a fixed whitelist |
| Academic | years, grade levels, subjects, classes, subject↔teacher assignment, enrollment (one per student per year), weekly timetable and exams with **non-blocking conflict warnings**, create/edit/move/delete |
| Grades | teacher limited to assigned class+subject, publish/hide per grade, hidden grades never leave the server for students; no GPA/report cards (out of scope) |
| Finance | `Decimal` money, items, per-student charges with price snapshot, installments, discounts, manual payments with mandatory `Idempotency-Key`, row-locked overpayment check, void with reason, student-only own view, school-wide summary |
| Online sessions | external **https** links only (credentials/localhost/private/IP hosts rejected), teacher self-publish for own classes, upcoming/past, push on publish |
| Content | posts (draft/publish, categories, tags, search, external video link, featured + inline images), custom Markdown pages (reserved/unique slugs, preview), editable About/Contact/school info, server-side Markdown sanitising (raw HTML dropped, allow-listed tags, https images) |
| Files | content sniffing (client type ignored), server-generated names, root-confined paths, configurable size/type limits (super admin), attachment-only downloads with `nosniff` + sandbox CSP, authorization on every download, optional **ClamAV** scanning (fail-closed) |
| Resources | library with grade/subject/class scopes and class-only attachments |
| Announcements | all/class audience, publish & expiry windows, read status, push on publish |
| Tickets | student↔administration threads, owner-only access, reply/close, push on reply |
| Push/PWA | manifest, icons, service worker (caches only `/assets/*` + offline page, never `/api`), VAPID Web Push, per-category preferences, generic non-sensitive payloads |
| Admin | dashboards with real data, user management (search/paginate/role rules), audit log (secrets scrubbed) + viewer, system settings, in-app consistent backups |
| Profiles | role-aware profile, field-level edit allow-list (email/phone), private avatar, password change |
| UI | RTL Persian, Jalali dates via `Intl`, responsive, light/dark via `prefers-color-scheme`, CloudPixel footer link (single config point), role-based panels |

**Known limitations / decisions:** no GPA, report cards, attendance, homework, parents, online payments, video conferencing or scheduled backups (per spec); uploads are held in memory while checked (size-capped); push delivery depends on browser/OS (iOS needs the PWA added to the Home Screen, iOS ≥ 16.4) and requires HTTPS; rate limiting is in-process (single API instance); backups are unencrypted files — protect and move them off-server; public blog images are served by unguessable URL and are public by design; Jalali dates use the browser's `Intl` calendar rather than a separate library; uploaded-file content scanning other than ClamAV is magic-byte validation only.

## Local development
```bash
cp .env.example .env            # POSTGRES_PASSWORD etc.; set COOKIE_SECURE=false for plain http
docker compose up -d --build    # builds from source: db, migrate, api, web on http://127.0.0.1:8080
docker compose run --rm -e SUPERADMIN_USERNAME=root -e SUPERADMIN_PASSWORD='<12+ chars>' api node dist/cli/create-super-admin.js
# optional sample data (never in production): docker compose run --rm -e NODE_ENV=development api node dist/cli/seed-dev.js
```
Without Docker: `npm ci`, run Postgres, `DATABASE_URL=… npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`, `npm run build -w apps/api && node apps/api/dist/main.js`, `npm run dev -w apps/web`. Tests: `npm run test:unit -w apps/api` (no DB) and `npm run test:e2e -w apps/api` (needs a **disposable** migrated database in `DATABASE_URL`; it truncates tables).

## CI/CD (GitHub-hosted runners only; no self-hosted runner, no custom secrets)
* `.github/workflows/ci.yml` — `verify` → `smoke` + `compose-config` → `images` → `release-assets`. Images: `ghcr.io/<owner>/ayandeh-school-api` and `-web`, tagged `sha-<full commit>`, semver on `vX.Y.Z` tags, and `latest` on the default branch. PRs build but do not push. Tag releases attach `docker-compose.prod.yml` and `.env.example`.
* `.github/workflows/generate-migration.yml` — manual; commits the Prisma migration.
* **Repository settings:** only the automatic `GITHUB_TOKEN` is used. Ensure *Settings → Actions → General → Workflow permissions* allows read/write for the migration commit job (or keep default and use a branch rule exception). After the first publish, set each package to public or create a **PAT with `read:packages`** for the server.
* Release: `git tag v0.1.0 && git push origin v0.1.0`.

## Production deployment (server needs only Docker + Compose)
```bash
mkdir ayandeh && cd ayandeh
# download deploy/docker-compose.prod.yml, .env.example, scripts/restore.sh (from the Release assets / repo)
cp .env.example .env && chmod 600 .env       # set POSTGRES_PASSWORD, IMAGE_OWNER, IMAGE_TAG, VAPID_*; keep COOKIE_SECURE=true
echo "$GHCR_PAT" | docker login ghcr.io -u <github-user> --password-stdin     # only if images are private
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d    # runs `prisma migrate deploy`, then api, web
docker compose -f docker-compose.prod.yml run --rm -e SUPERADMIN_USERNAME=admin -e SUPERADMIN_PASSWORD='<12+ chars>' api node dist/cli/create-super-admin.js
```
`web` listens on `127.0.0.1:${WEB_PORT}`; put a TLS reverse proxy (Caddy/nginx/Traefik) in front, forwarding `X-Forwarded-Proto: https`. The database publishes no ports. Optional antivirus: `docker compose -f docker-compose.prod.yml --profile antivirus up -d` and set `CLAMAV_HOST=clamav` in `.env`.
**Update / rollback:** change `IMAGE_TAG` (`sha-<commit>` or `0.2.0`), `pull`, `up -d` (migrations run automatically); roll back by restoring the previous tag (and a backup if a migration was destructive).
**Web Push:** `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in `.env`. Without them push is disabled and the UI says so.
**Initial administrator:** only via the CLI above (refuses if one exists). There are no default credentials.

## Backup & recovery
Super admin → *Backup* page (or `POST /api/admin/backups`): produces one `.tar` (`db.dump` + `uploads.tar` + checksummed `manifest.json`) in the `backups` volume (mode 600). Uploads are paused during the run so DB and files match. Download it and keep it **off the server, access-controlled**.
Restore: `COMPOSE_FILE=docker-compose.prod.yml ./restore.sh backup-YYYYMMDD-HHMMSS.tar` (type `RESTORE`; verifies checksums, replaces DB + uploads). Verify: `GET /api/health` is ok, you can log in, a known record exists, a known file downloads. PostgreSQL is pinned to 15 so the API image's `pg_dump` matches; upgrade both together.
Manual alternative: `docker compose exec -T db pg_dump -U $POSTGRES_USER -Fc $POSTGRES_DB > db.dump` plus a tar of the `ayandeh_uploads` volume, taken with `api`/`web` stopped.
