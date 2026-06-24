# Passkey-Bound Age Attestation — Prototype

_Prove your age once to a trusted authority, bind it to a passkey, and breeze through
age-gated sites that never see your ID or date of birth — only that you pass._

Monorepo for the prototype specified in
[`docs/passkey-bound-age-attestation-v2.md`](docs/passkey-bound-age-attestation-v2.md):
a **Relying Party (RP)** age-gates access via WebAuthn, an **Attestation Authority (AA)**
verifies evidence and issues token-scoped attributes, and the outcome is bound to a passkey.

The RP never sees decrypted evidence or date of birth — only the scoped attributes
(`name`, `age`) its AA token is authorized for.

> **As-built vs. spec:** the linked spec is the original design. The running system
> deliberately diverges in several places (PocketBase data plane, AA-owned capture,
> SSE/event-driven instead of polling, decoupled eligibility with lazy refresh). See
> [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) for the as-built architecture, and
> [`docs/DEMO.md`](docs/DEMO.md) for the walkthrough.

## Stack

- **apps/rp** — Next.js (App Router) + Tailwind + shadcn. WebAuthn + attestation orchestration. Port 3000.
- **apps/aa** — Next.js (App Router) + Tailwind + shadcn. Evidence capture (`/capture`), review queue, attestation lifecycle. Port 3001.
- **packages/contracts** — shared zod schemas / types (AA API, webhook, region & constraint interfaces).
- **packages/constraints** — constraint engine + age module.
- **PocketBase** — data plane, file storage, admin UI. RP instance on :8090, AA on :8091.

All WebAuthn and envelope crypto runs in Next.js Node API routes (PocketBase's Goja
hooks cannot run `@simplewebauthn`/WebCrypto); PocketBase is accessed server-side with a
superuser token.

## Highlights

- **Two-plane confidentiality.** The browser fetches the AA's encryption key directly (TLS) and
  enters/encrypts evidence in a **cross-origin iframe on the AA origin** — so neither the RP
  server nor its client code ever sees the plaintext. (Residual phishing trade-off documented in
  [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md).)
- **Event-driven, no polling.** SSE everywhere — applicant status (woken by an AA decision
  webhook), the AA reviewer UIs, and **real-time logout** the moment an attestation is revoked.
- **Time-aware eligibility.** Registration always issues the passkey; re-auth is a fast snapshot
  lookup, with a **lazy AA refresh** that recomputes from the DOB the AA still holds — so a
  near-boundary user isn't locked out and the RP never learns the DOB.

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
pnpm validate         # format check → typecheck → lint → unit → e2e (the full gate)
pnpm test             # Vitest unit suites across the workspace
pnpm test:e2e         # Playwright end-to-end flows
```

e2e runs against isolated PocketBase data dirs (`pb_data_test`), so it never touches the
`pnpm dev` database. See [`AGENTS.md`](AGENTS.md) for the contributor workflow.
