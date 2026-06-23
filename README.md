# Passkey-Bound Age Attestation — Prototype

Monorepo for the prototype specified in
[`docs/passkey-bound-age-attestation-v2.md`](docs/passkey-bound-age-attestation-v2.md):
a **Relying Party (RP)** age-gates access via WebAuthn, an **Attestation Authority (AA)**
verifies evidence and issues token-scoped attributes, and the outcome is bound to a passkey.

The RP never sees decrypted evidence or date of birth — only the scoped attributes
(`name`, `age`) its AA token is authorized for.

## Stack

- **apps/rp** — Next.js (App Router) + Tailwind + shadcn. WebAuthn + attestation orchestration. Port 3000.
- **apps/aa** — Next.js (App Router) + Tailwind + shadcn. Review queue + attestation lifecycle. Port 3001.
- **packages/contracts** — shared zod schemas / types (AA API, webhook, region & constraint interfaces).
- **packages/constraints** — constraint engine + age module.
- **PocketBase** — data plane, file storage, admin UI. RP instance on :8090, AA on :8091.

All WebAuthn and envelope crypto runs in Next.js Node API routes (PocketBase's Goja
hooks cannot run `@simplewebauthn`/WebCrypto); PocketBase is accessed server-side with a
superuser token.

## Quick start

```bash
pnpm install          # also downloads the PocketBase binary into ./bin
pnpm dev              # seeds PocketBase, then launches RP, AA, and both PB instances
```

Then open <http://localhost:3000> (RP) and <http://localhost:3001> (AA). PocketBase admin
UIs: <http://localhost:8090/_> and <http://localhost:8091/_>.

## Environment

- `.env` — committed, non-secret defaults (ports, URLs, region config).
- `.env.local` — gitignored secrets, including the shared RP↔AA bearer token and webhook
  HMAC secret. `scripts/seed.mjs` provisions PocketBase superusers and the AA `rp_clients`
  row from these values.

## Testing

```bash
pnpm test             # Vitest unit suites across the workspace
pnpm test:e2e         # Playwright end-to-end flows (Phase 6)
```
