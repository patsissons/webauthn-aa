# Implementation Notes (as-built)

How the prototype was actually built, and where it **deliberately diverges** from the
design-of-record ([`passkey-bound-age-attestation-v2.md`](passkey-bound-age-attestation-v2.md)).
The v2 spec is preserved as the original design; this document is the source of truth for
the running system.

## Stack & data plane

- **PocketBase** is the data plane (SQLite collections, file storage for evidence, admin UI,
  cron) — substituted for the spec's Drizzle + better-sqlite3 (C.1). Two instances: RP `:8090`,
  AA `:8091`.
- **All business logic runs in Next.js Node API routes.** PocketBase's Goja hooks can't run
  `@simplewebauthn` or WebCrypto, so WebAuthn verification, envelope decryption, and HMAC live
  in the apps; PocketBase is accessed server-side with a superuser token. The one exception is
  the **webhook delivery worker**, which runs as a PocketBase cron hook (`pb_hooks`) signing
  with `$security.hs256`.

## Trust-model hardening (beyond v2)

The spec's "the RP never sees evidence" rests on envelope encryption. We hardened it on two
planes and documented the residual:

- **Data plane — no key-substitution MITM.** The browser fetches the single-use encryption
  **public key directly from the AA** over TLS (`GET /v1/encryption-material/:id`, CORS); the RP
  relays only an opaque `materialId`. A malicious RP _server_ can't swap in its own key.
- **Code plane — AA-owned capture.** Evidence is entered and encrypted in a **cross-origin
  iframe on the AA origin** (`/capture`), which the RP can't script into (same-origin policy),
  so plaintext never exists in RP-controlled code. The AA sets `CSP: frame-ancestors` to allow
  only the RP origin; the iframe posts only the ciphertext envelope back via `postMessage`
  (origin-checked both ways).
- **Residual (documented).** The RP still serves the client JS, and the iframe dialog hides the
  AA's address bar — so a fully malicious RP could exfiltrate plaintext or frame a look-alike
  AA. The phishing-resistant form is a redirect to the AA origin or a non-RP-served verifier
  (native app / extension / issuer app). This matches the spec's production direction (route to
  a government issuer / credentialed provider).

## Event-driven — no polling

The spec's blocking long-poll (A.12) is replaced end-to-end by SSE + webhooks:

- **Applicant status:** RP `GET /api/attest/events` (SSE). It is woken by the AA's **decision
  webhook** (`{event:"decision"}` → in-process attest bus), not by polling the AA. It checks
  status once on connect (covers an already-decided request) and once on the webhook.
- **AA reviewer UIs:** `GET /api/review/events` and `GET /api/attestations/events` (SSE), pushed
  by an in-process event bus that the AA mutation routes emit on.
- **Real-time revocation:** an authenticated client holds `GET /api/session/events` (SSE); the
  revocation webhook pushes an immediate **logout** (no reload), with TTL expiry as the backstop.
- The in-process buses are single-instance (fine for the prototype); a multi-instance deploy
  would back them with PocketBase realtime or a shared broker.

## Eligibility model (revisits A.7)

The spec gated registration on the constraint and stored a frozen `satisfiedConstraints`
snapshot. That locks out a near-boundary user (days from 18) and never re-evaluates. As-built:

- **Registration is decoupled from the gate.** A successful attestation **always issues the
  passkey** (it proves identity); eligibility for a region is a separate verdict at authorization.
- **Re-auth is time-aware via lazy AA refresh.** Fast path = set-membership on the cached
  snapshot (no AA call). On a "not yet eligible" miss — and always for **non-monotonic**
  constraints, which can age _out_ — the RP calls the AA's `GET /v1/attestations/:id`, which
  **recomputes the current age from the DOB it still holds**, then re-evaluates and updates the
  snapshot. The DOB never reaches the RP.
- **Monotonicity.** Each compiled constraint is flagged `monotonic` (age `>=`/`>`, and AND/OR of
  those). Monotonic + cached-pass is trusted without a refresh; everything else refreshes.

## UX / tooling additions

- AA-origin **capture dialog** (iframe) with an in-app **SPECIMEN ID generator** (obviously-fake
  cards) so the demo needs no real ID.
- Region dropdown shows **human-readable constraints** ("Region 1 — age ≥ 18").
- **Logout** button; bulk **Reject all** on the review queue; clickable **attestation audit
  panel** (decrypted evidence + attested fields + active/revoked chip + revoke).

## Dev experience & quality gate

- pnpm + turborepo monorepo; single `pnpm dev` launches both apps + both PocketBase instances
  (binary auto-downloaded, DB seeded).
- **Prettier + ESLint + `pnpm validate`** (format → typecheck → lint → unit → e2e) — see
  [`AGENTS.md`](../AGENTS.md).
- e2e runs against **isolated** PocketBase data dirs (`pb_data_test` via `dev:test`) so it never
  pollutes the `pnpm dev` database.

## Provisioning & reset

- **Self-provisioning.** `getPb()` awaits `ensureProvisioned` (`apps/{rp,aa}/lib/bootstrap.ts`)
  once per process: when the sentinel collection is missing (`credentials` / `rp_clients`) it
  imports the committed schema snapshot via `pb.collections.import(…, deleteMissing=false)`, so a
  hosted deploy needs only an empty instance + a superuser. Concurrent cold-start imports are
  tolerated (errors re-verify existence). The AA additionally seeds its `rp_clients` row from env.
- **Schema snapshots** (`pocketbase/{rp,aa}/schema.json`) are generated from the local DBs by
  `scripts/export-schema.mjs` (system + default `users` collection excluded) and read at runtime
  (`outputFileTracingIncludes` ships them into the serverless bundle). Re-run the exporter after
  changing `pocketbase/*/pb_migrations`.
- **Webhook retry** moves to Vercel Cron (`apps/aa/app/api/cron/webhooks`, `CRON_SECRET`-gated,
  scheduled in `apps/aa/vercel.json`) calling the same `deliverJob()`; the `webhook-worker.pb.js`
  hook stays as the fallback for schedulers that can't run per-minute.
- **Demo reset** is an opt-in PocketBase cron hook (`pocketbase/{rp,aa}/pb_hooks/reset-worker.pb.js`,
  armed by `RESET_ENABLED`, cadence via `RESET_CRON`). It deletes via the record API (evidence
  files cleaned too) from demo-data collections only — `rp_clients` and the schema persist, so the
  demo is usable immediately after a wipe and no secret ever lives inside PocketBase.

## Endpoint quick reference

**RP** (`apps/rp`)

- `POST /api/attest/material` → opaque `materialId` (no key)
- `POST /api/attest/submit` → relay ciphertext to AA transform
- `GET  /api/attest/events` (SSE) → status; `POST /api/attest/status` → single-shot (fail-closed)
- `POST /api/attest/finish` → verify passkey, persist binding, eligibility verdict
- `POST /api/webauthn/authenticate/{options,verify}` → re-auth (verify does lazy refresh)
- `GET  /api/session/events` (SSE) → real-time revoke/expiry logout
- `POST /api/webhooks/attestation` → HMAC-verified `revoked` + `decision`
- `GET  /api/regions`, `GET /api/attest/config`

**AA** (`apps/aa`)

- `POST /api/v1/encryption-material`, `GET /api/v1/encryption-material/:id` (public key, CORS)
- `POST /api/v1/transform`, `GET /api/v1/transform/:requestId`
- `GET  /api/v1/attestations/:id` (bearer) → recomputed eligibility (DOB stays at AA)
- `GET  /api/review/events` (SSE), `GET /api/review/list`, `GET/POST /api/review/:id`,
  `GET /api/review/:id/evidence`, `POST /api/review/reject-all`
- `GET  /api/attestations/events` (SSE), `GET /api/attestations/list`,
  `GET /api/attestations/:id` (audit detail), `POST /api/attestations/:id/revoke`
- `/capture` — AA-origin evidence capture page (embedded as a cross-origin iframe)
