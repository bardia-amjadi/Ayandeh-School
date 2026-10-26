# Acceptance checklist → how each scenario is verified

"Automated" means a test exists in this repository and runs in CI (`apps/api/test/e2e.spec.ts` against a real PostgreSQL
service, or `scripts/smoke.sh` against the real Docker stack). **None of it has been executed yet** — the authoring
environment had no Docker, no PostgreSQL and no access to Prisma's engine downloads. A scenario is only "passing" once the
CI run for your commit is green. Item 18 and the browser-side parts of 17 need a manual check.

| # | Scenario | Verified by |
|---|---|---|
| 1 | First super admin created securely | e2e "bootstrap" (argon2 hash, second bootstrap refused); smoke.sh |
| 2 | Admin creates teacher & student accounts | e2e "super admin creates admin; admin creates staff and students" |
| 3 | Users access only their panels | e2e (no public registration, 401/403 matrix); panel menus follow server permissions |
| 4 | Teacher cannot touch unrelated class | e2e "teacher cannot enter, read or publish grades for an unrelated class" |
| 5 | Student cannot read others' grades/finance | e2e "student cannot read other data…", `/grades/mine`, `/finance/mine` |
| 6 | Teacher enters, hides, publishes grade | e2e "grades hidden/published" |
| 7 | Hidden grades excluded from student APIs | e2e (same test; field-level assertions) |
| 8 | Timetable conflicts warn, never block | e2e "timetable + exams" (+ pure-function unit tests) |
| 9 | Finance maths consistent | e2e "finance" (installments sum, discount, idempotent payment, overpay, void) + unit tests |
| 10 | External session link published for own class | e2e "teacher publishes external link…" (URL validation incl. SSRF-ish hosts) |
| 11 | Students see only own class sessions/files | e2e sessions + class attachment checks |
| 12 | Public/private resource rules | e2e "class attachments are class-only; general resources open" |
| 13 | Blog posts and custom pages | e2e "posts…" and "custom pages…" |
| 14 | Markdown cannot run scripts | unit tests (markdown.spec) + e2e public post/contact assertions |
| 15 | Tickets: create, reply, close | e2e "ticket flow with owner-only access" |
| 16 | About/Contact editable without redeploy | e2e "editable About & Contact" |
| 17 | CloudPixel link below footer | smoke.sh greps the shipped bundle for the exact text + URL; **visual placement: check manually** |
| 18 | Push works in a supported browser | e2e covers subscription management; payload test covers non-sensitive content; **real delivery needs HTTPS + VAPID keys + a browser — manual** |
| 19 | Data & uploads persist after container recreation | smoke.sh (`down`/`up`, DB row and file hash compared) |
| 20 | Manual backup & restore | smoke.sh (API backup → download → mutate → `restore.sh` → verify) |
| 21 | Starts via documented Compose workflow | smoke.sh uses the same compose/Dockerfiles; production compose is validated in `compose-config` |
