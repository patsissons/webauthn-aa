# Passkey-Bound Age Attestation: System Design, PRD, and Build Plan

**Version:** 2 (supersedes v1)
**Status:** Agreed scope, ready to build
**Owner:** Pat

> **Note (as-built):** this remains the original design-of-record. The running prototype
> deliberately diverges in several places (PocketBase data plane, AA-owned capture, SSE /
> event-driven instead of long-poll, decoupled eligibility with lazy refresh). See
> [`IMPLEMENTATION.md`](IMPLEMENTATION.md) for the as-built architecture and the rationale.

This document is the authoritative spec for the prototype. Feasibility is settled (see v1 for the full study); the short version is that the system uses **stock, unmodified WebAuthn** for the key ceremonies, runs attribute attestation as an **out-of-band step that gates registration**, and binds the outcome to the credential server-side. It is not a WebAuthn protocol change. It is an application-layer protocol that uses WebAuthn as its authentication primitive, and it matches the emerging industry pattern of passkey-bound age tokens.

---

## Part A: System Design

### A.1 Parties

Three logical parties. Two are services we build; the third is the user's browser.

- **Device (Client).** Browser plus its authenticator (platform passkey, roaming key, or password-manager passkey). Collects evidence, encrypts it locally to a key only the AA can decrypt, runs the WebAuthn ceremonies.
- **Relying Party (RP).** Runs WebAuthn ceremonies, resolves the user's region, brokers requests to the AA, owns constraint policy, makes the final pass/fail decision, stores the credential and its attestation binding. **Never** sees decrypted evidence; sees only the attributes its AA token is scoped to.
- **Attestation Authority (AA).** The trusted verifier (in production: a government issuer such as CRA or IRS, or a credentialed commercial provider, routed by evidence type). The **only** party that decrypts evidence and holds the underlying PII. Issues single-use encryption material, transforms evidence into attested data, returns token-scoped attributes, and manages attestation lifecycle (TTL and revocation).

### A.2 Terminology guardrail

"Attestation" is already a WebAuthn word meaning the authenticator vouching for its own provenance. Throughout this document, **authenticator attestation** is that WebAuthn concept and **attribute attestation** (or just attestation) is our age concept. Keep them distinct in code and review.

### A.3 Trust and threat model

- The AA is trusted with PII by design. Everything rests on this.
- The RP is trusted to enforce its gate, honor TTL and revocation, and protect its binding table. Same trust any RP database already carries.
- Evidence confidentiality from the RP rests on envelope encryption: the RP only ever holds ciphertext it cannot decrypt.
- **Accepted limitations, documented deliberately:**
  - Binding a proof to a passkey means sharing the passkey shares the age proof. True of every passkey-bound age token. Acceptable for age assurance, not for high-stakes identity.
  - Location-derived region resolution is spoofable (VPN, GPS spoofing). Accepted. Static region binding is the stronger model where the RP serves one jurisdiction.

### A.4 Data disclosure model (token-bound attribute scope)

The RP can see the attributes it requests from the AA, raw-extracted (for example `name`) or derived (for example `age` computed from date of birth). The RP never sees decrypted evidence and never sees attributes outside its scope.

**The AA API token is bound to a set of data elements.** Each registered RP has an AA bearer token mapped to an `allowedAttributes` set. The AA rejects any transform request whose requested attributes are not a subset of that set. For the prototype, RP scope is `["name", "age"]`; date of birth is computed at the AA into `age` and never leaves it.

This resolves the apparent tension between "RP decides validity" and "minimal disclosure": the RP authors the policy and makes the decision; the AA returns only the minimized, scoped attributes the RP is authorized to see.

### A.5 Region resolution (pluggable)

Region is a property of jurisdiction, never a user choice. The RP resolves it server-side via a pluggable strategy, selected by `REGION_RESOLVER`:

- **`static`** (`StaticRegionResolver`): the RP is bound to one jurisdiction via `RP_REGION`. Strongest, nothing to spoof. The "RP statically bound to a dedicated location" case.
- **`location`** (`LocationRegionResolver`): derives region from a location signal (browser Geolocation coordinates reverse-mapped to a jurisdiction, or server-side IP geolocation as the coarse fallback). Weaker and spoofable; accepted.
- **`demo`** (`DemoRegionResolver`): reads a region override supplied by the demo UI dropdown. Demo only, behind a flag, never enabled in a real deployment.

```ts
interface RegionResolver {
  resolve(ctx: { request: IncomingRequest; demoOverride?: string }): Promise<Region>;
}
interface Region {
  id: string; // "region-1"
  label: string; // "Region 1"
  constraintSetId: string; // which constraint set this region requires, e.g. "age_gte_18"
}
```

Region configuration maps a region to the constraint set it requires:

```jsonc
// regions.json
{
  "region-1": { "label": "Region 1", "module": "age", "config": { "op": ">=", "value": 18 } },
  "region-2": { "label": "Region 2", "module": "age", "config": { "op": ">=", "value": 21 } },
}
```

### A.6 Constraint engine and the age module

The engine is module-agnostic. A constraint module declares what minimized data it needs and how to decide pass/fail.

```ts
type CompareOp = ">=" | ">" | "<=" | "<" | "==" | "!=";
type AgeExpr =
  | { op: CompareOp; value: number }
  | { all: AgeExpr[] } // AND
  | { any: AgeExpr[] }; // OR

interface CompiledConstraint {
  setId: string; // stable id stored in the binding, e.g. "age_gte_18"
  attributeRequests: { name: string; type: "integer" | "string"; derivedFrom?: string }[];
  evaluate(minimized: Record<string, unknown>): { pass: boolean; reason?: string };
}
interface ConstraintModule {
  id: string; // "age"
  version: string; // "1.0.0"
  compile(config: unknown): CompiledConstraint;
}
```

The age module compiles a config into a `setId` and a tree-walking evaluator over the integer `age`. The grammar captures the common case trivially and arbitrary combinations flexibly:

```jsonc
{ "op": ">=", "value": 18 }                                              // age >= 18
{ "op": "==", "value": 21 }                                              // exactly 21
{ "any": [ { "op": "<", "value": 13 }, { "op": ">", "value": 65 } ] }    // age < 13 OR age > 65
{ "all": [ { "op": ">=", "value": 18 }, { "op": "<", "value": 21 } ] }   // 18 <= age < 21
```

Default disclosure is attribute mode: the module requests the derived integer `age` (date of birth stays at the AA) and evaluates locally, which preserves full grammar flexibility.

### A.7 Constraint evaluation timing (important)

A hard requirement from the outset: **the challenge (re-authentication) must never evaluate constraints; it confirms the device was attested.** We honor this strictly:

- **At attestation time (handshake):** the RP evaluates _every_ configured region's constraint set against the AA-returned `age`, and stores the set of constraint IDs that passed (the device's `satisfiedConstraints`). Registration is _gated_ on the resolved region's constraint passing.
- **At re-authentication time (challenge):** the RP resolves the region for the resource being accessed, looks up that region's required `constraintSetId`, and performs a **set-membership check** against the stored `satisfiedConstraints`. No comparison, no recomputation, no AA call.

This keeps re-auth a dumb lookup while letting the demo dropdown authorize an already-attested device against different thresholds. It also means the RP stores derived booleans (passed constraint IDs), not the raw age, which is the more private default. (Alternative: store the integer `age` and evaluate per challenge. Rejected, because it re-evaluates constraints per challenge, violating the stated requirement.)

### A.8 Attestation lifecycle: TTL and revocation

- **TTL is an AA concern.** The AA includes a single `ttl` (expiry) in the attested-data payload covering the whole payload (per-attribute TTL is deferred). The RP stores the resulting `attestationExpiresAt` and is responsible for compliance: any re-auth after expiry fails the freshness check and forces re-attestation.
- **Revocation is webhook-driven.** When the AA revokes an attestation, it enqueues a webhook to the RP that holds it (the RP's `webhookUrl` is registered with the AA per client). Delivery uses retries with exponential backoff via a job runner. The RP receiver invalidates any binding carrying that `attestationId`, after which re-auth fails until the device re-attests.
- **TTL is the backstop.** If webhook delivery exhausts all retries, the TTL still bounds how long a stale or to-be-revoked attestation can be honored.

### A.9 Cryptography

- **Envelope encryption** of evidence. The browser generates a random AES-256-GCM content key, encrypts `{ photo, claimedName, claimedBirthDate }`, then wraps the content key to the AA's public key (RSA-OAEP-256). All via WebCrypto, so the browser has no crypto dependencies. The RP relays the ciphertext blob; only the AA can unwrap.
- **Single-use, ceremony-bound encryption material.** The AA issues an ephemeral public key plus a `nonce` and short TTL per attestation, tracked so it cannot be reused. The nonce binds the ciphertext to one attestation, preventing replay into a different registration.
- **Webhook authenticity.** Each webhook is signed with an HMAC over the body using a per-RP `webhookSecret`; the RP verifies before acting.

### A.10 Protocol flows

**Attested registration (attestation-first):**

1. RP resolves region (resolver, or demo override). Browser collects claimed name + date of birth and a photo.
2. RP requests single-use encryption material from the AA and returns the public key, materialId, and nonce to the browser.
3. Browser envelope-encrypts the evidence and posts the ciphertext to the RP.
4. RP relays to the AA transform endpoint with its scoped attribute request and blocks (long-poll). The AA decrypts and enqueues a pending review request.
5. A human reviewer views the photo beside the claimed fields, edits if needed, and approves or rejects.
6. On approve, the AA stores the attestation record (audit and revocation), and returns `{ attestationId, attributes: { name, age }, ttl }` scoped to the RP token.
7. The RP evaluates all region constraints against `age`, gates on the resolved region's set. On pass: store a pending registration and return WebAuthn creation options. On fail or reject: respond "not eligible," create nothing.
8. Browser runs `navigator.credentials.create()`; the RP verifies and persists the credential plus `name`, `satisfiedConstraints`, `attestationId`, and `attestationExpiresAt`. User is authenticated.

**Re-authentication (challenge):**

1. Browser requests assertion options; RP returns a challenge.
2. Browser runs `navigator.credentials.get()`.
3. RP verifies the signature against the stored public key, resolves the region for the resource, and checks the region's required `constraintSetId` is in `satisfiedConstraints` and that the attestation is neither expired nor revoked. Authorize or deny. No photo, no AA call.

**Revocation (async):**

1. Reviewer revokes an attestation in the AA web app.
2. AA enqueues a signed webhook to the RP, delivered with retries and exponential backoff.
3. RP invalidates bindings carrying that `attestationId`; subsequent re-auth fails until re-attestation.

### A.11 Data models

**AA**

- `rp_clients`: `{ id, name, bearerTokenHash, allowedAttributes[], webhookUrl, webhookSecret, createdAt }`
- `encryption_material`: `{ materialId, publicKeyJwk, privateKeyJwk, nonce, rpClientId, expiresAt, usedAt, createdAt }`
- `attestation_requests` (review queue): `{ id, rpClientId, status(pending|approved|rejected), evidenceImageRef, claimedName, claimedBirthDate, reviewedName, reviewedBirthDate, decidedBy, decidedAt, createdAt }`
- `attestations` (audit + revocation): `{ attestationId, requestId, rpClientId, attestedData(name, birthDate), issuedAt, expiresAt, status(active|revoked), revokedAt, revokedReason }`
- `webhook_jobs`: `{ id, attestationId, rpClientId, event, payload, attempts, nextAttemptAt, status(pending|delivered|failed), lastError, createdAt }`

Evidence (the decrypted photo) is stored by the AA for audit and revocation. Encrypt-at-rest with an AA-local key is a hardening note; a plain blob/file reference is acceptable for the prototype.

**RP**

- `credentials` (identity is the credential): `{ credentialId, publicKey, signCount, transports, displayName, satisfiedConstraints[], attestationId, attestationExpiresAt, attestationStatus(active|revoked|expired), createdAt }`
- `pending_registrations`: `{ pendingRegId, regionId, satisfiedConstraints[], attestationId, attestedName, attestationExpiresAt, webauthnChallenge, status, createdAt }`
- `auth_challenges`: `{ id, challenge, createdAt }`

The RP stores no decrypted evidence, no date of birth, and no government identifier. `credentialId` is per-RP and not correlatable across RPs.

### A.12 AA API contract

- `POST /v1/encryption-material` (RP token): issue single-use material. Returns `{ materialId, publicKeyJwk, nonce, expiresAt }`.
- `POST /v1/transform` (RP token): submit `{ materialId, nonce, ciphertext, requestedAttributes[] }`. Decrypts, enforces `requestedAttributes` is a subset of the token's `allowedAttributes`, enqueues a review request, returns `{ requestId, status: "pending" }` quickly.
- `GET /v1/transform/:requestId` (RP token): **blocking long-poll** up to `AA_AWAIT_MAX_WAIT_MS`. Returns `{ status: "approved", attestationId, attributes, ttl }`, `{ status: "rejected" }`, or `{ status: "pending" }` on timeout. The RP loops until resolved or its total budget elapses. This is the "API supports blocking on async operations" contract: submit is fast, await blocks.
- Outbound webhook to RP: `POST {webhookUrl}` with HMAC signature header, body `{ event: "revoked", attestationId, occurredAt }`.

### A.13 Security must-haves

Single-use ceremony-bound encryption material; envelope encryption; nonce echo so one user's attestation cannot be applied to another's registration; finalize registration only on pass; RP-to-AA bearer auth with per-RP attribute scope enforcement; HMAC-signed webhooks; fail-closed on AA errors or timeouts; standard library WebAuthn verification (no hand-rolled CBOR/COSE). Document the passkey-sharing and location-spoofing limitations in the threat model.

---

## Part B: Product Requirements Document (Prototype)

### B.1 Problem and goal

Age-gating regimes push relying parties to either collect and store sensitive identity documents or outsource to opaque third parties. We want to demonstrate that an RP can age-gate access with **no PII storage beyond minimized scoped attributes**, **no evidence ever visible to the RP**, and **cheap repeat verification** via a passkey, by attesting evidence once at a trusted authority and binding the outcome to a WebAuthn credential.

### B.2 Goals and non-goals

**Goals**

- Prove the full round trip: unauthenticated to photo evidence to authenticated, then repeat authentication with the existing passkey and no photo.
- Show the RP never holds decrypted evidence, only scoped attributes (`name`, `age`).
- Show different jurisdictions enforcing different thresholds (Region 1 `age >= 18`, Region 2 `age >= 21`) via server-side region resolution, controllable by a demo dropdown.
- Show TTL-based freshness and webhook-based revocation forcing re-attestation.
- Demonstrate that AA software running on an arbitrary system can fulfill the role, given a stable contract.

**Non-goals (prototype)**

- Real document forensics, liveness, or fraud detection. Human review stands in for it behind a clean interface.
- Governance and auditing of AA providers by a regulatory body.
- Cross-RP credential reuse (single-RP reuse is sufficient; per-RP credentials are inherent to WebAuthn).
- Production-grade unlinkability (no blind tokens). Per-RP correlation handles are acceptable.
- User account management beyond WebAuthn. The credential is the identity.

### B.3 Personas

- **Applicant (Device user).** Wants access to an age-gated RP. Has a phone or laptop with a passkey-capable authenticator and a photo of an ID.
- **AA reviewer.** Operates the AA queue, verifies evidence against claimed fields, approves/rejects, and can revoke previously issued attestations.
- **RP operator.** Configures region resolution, constraint policy, and AA connection via environment variables.

### B.4 Functional requirements

**RP web app**

- Unauthenticated experience: prompts for region-resolved age gating; collects claimed name, date of birth, and a photo; encrypts evidence in-browser; runs the attested-registration flow; shows a "waiting for verification" state while the AA review is pending.
- Authenticated experience: shows the attested display name and which region thresholds the device satisfies; provides a re-authentication action that uses the passkey only.
- WebAuthn is the only authentication method; any unauthenticated user becomes authenticated by completing attested registration. Identity equals the WebAuthn credential.
- A demo region dropdown overrides the region resolver to demonstrate threshold variation, at registration (controls the gate) and at authorization (controls the required constraint).
- Backing database for WebAuthn credentials and bindings.
- Webhook receiver that verifies HMAC and invalidates bindings on revocation.
- Enforces TTL: re-auth after expiry fails and routes to re-attestation.

**AA web app and API**

- Implements the AA API contract (encryption material, transform submit, blocking await, outbound revocation webhook).
- Review queue UI: lists pending requests; opens a request to view the photo beside claimed fields; allows editing the fields; approve and reject buttons. The transform await unblocks on decision.
- Attestation browser: search and display issued attestations and their status; revoke action.
- Backing database storing evidence and attestation data for audit and revocation.
- Webhook delivery with retries and exponential backoff via a job runner.
- Enforces per-RP attribute scope on transform requests.

### B.5 Acceptance scenarios

1. **Happy path.** Applicant in Region 1, age 27, submits evidence; reviewer approves; applicant gets a passkey and is authenticated.
2. **Cheap repeat.** The same applicant re-authenticates with the passkey only; no photo, no AA call; access granted.
3. **Threshold variation, allowed.** With the dropdown on Region 2, the age-27 device is still authorized (membership lookup), no re-attestation.
4. **Threshold variation, denied.** An age-19 device attested under Region 1 is denied when the dropdown is set to Region 2, via membership lookup, with no constraint recomputation.
5. **Gate rejection.** Setting the dropdown to Region 2 and attempting registration as age 19 fails the gate at registration; no passkey is created.
6. **Reviewer rejection.** Reviewer rejects evidence; applicant sees "not eligible"; nothing is persisted.
7. **Revocation.** Reviewer revokes an issued attestation; the RP receives the webhook and invalidates the binding; the device's next re-auth is denied and routed to re-attestation.
8. **TTL expiry.** After the attestation TTL passes, the device's next re-auth is denied on freshness and routed to re-attestation, even if no webhook arrived.
9. **Replay refused.** A captured ciphertext replayed with a spent or expired material/nonce is rejected by the AA.

### B.6 Non-functional requirements

- Local-first developer experience: `docker compose up` (or a single dev script) brings both apps and their databases up; passkeys work on `localhost`.
- Fail-closed: any AA error, timeout, or verification failure denies, never grants.
- Observability for the demo: visible request queue, visible attestation statuses, visible webhook delivery attempts.

### B.7 Out of scope for the prototype

Document authenticity and liveness; per-attribute TTLs; cross-RP reuse and blind tokens; regulatory auditing; non-WebAuthn auth; multi-credential identities; encrypt-at-rest for stored evidence (noted as hardening).

### B.8 Success criteria

The prototype is successful when an observer can watch a fresh browser go from unauthenticated to authenticated by submitting photo evidence that a reviewer approves, then re-authenticate instantly with only a passkey, and can watch a revocation or TTL expiry force that same device back through attestation, all while confirming the RP database never contains the photo or the date of birth.

---

## Part C: Build Plan

### C.1 Stack and repository

- **Monorepo:** pnpm + turborepo.
- **`apps/rp`:** Next.js (App Router) + shadcn/ui. RP web app and Node API routes. SQLite via Drizzle + better-sqlite3. `@simplewebauthn/server` and `@simplewebauthn/browser`. WebCrypto for the browser envelope.
- **`apps/aa`:** Next.js (App Router) + shadcn/ui. AA web app, API routes, review queue, attestation browser. SQLite via Drizzle + better-sqlite3. Webhook delivery worker (DB-backed `webhook_jobs` polled with exponential backoff), started from `instrumentation.ts`.
- **`packages/contracts`:** shared TypeScript types and zod schemas for the AA API, webhook payloads, and the constraint and region module interfaces.
- **`packages/constraints`:** the constraint engine and the age module.
- **Testing:** Vitest, two tiers (fast deterministic units; slower end-to-end against the running stack), mirroring your evaluation habit.

Localhost note: WebAuthn works on `localhost`; run RP on `:3000`, AA on `:3001`. The browser only ever talks to the RP; the RP brokers to the AA server-to-server, so there are no browser CORS concerns.

### C.2 Phases

**Phase 0: scaffold.** Monorepo, both apps boot with shadcn, SQLite and Drizzle migrations, `packages/contracts` with zod schemas, a single dev script that runs both apps. Acceptance: both apps serve a page; databases migrate.

**Phase 1: stock WebAuthn on the RP (no attestation).** Passkey registration and authentication end to end; persist credential, public key, sign count. Acceptance: a user registers a passkey and re-authenticates. This de-risks the WebAuthn plumbing before any novel logic.

**Phase 2: AA core.** Encryption-material endpoint (single-use, TTL, nonce); transform submit and blocking await; decrypt and envelope handling; review queue UI with view, edit, approve, reject; attestations and audit storage; token-scoped attribute return and scope enforcement. Acceptance: a scripted RP token can submit ciphertext, a reviewer approves, and scoped attributes return.

**Phase 3: RP attestation orchestration.** Evidence capture UI; in-browser envelope encryption; the attestation-first flow (begin, fetch material, submit ciphertext, block on AA await, gate, creation options, finish, persist binding); the "waiting for verification" state. Acceptance: the full round trip from unauthenticated to authenticated works for an approved applicant.

**Phase 4: constraints and regions.** Constraint engine and age module with the grammar; region resolver strategies (static, location, demo) and `regions.json`; evaluate-all-at-attest and store `satisfiedConstraints`; membership-check authorization; the demo dropdown. Acceptance: scenarios 3, 4, and 5.

**Phase 5: lifecycle.** RP TTL enforcement and re-attestation routing; AA revoke UI; webhook delivery worker with retries and exponential backoff; RP webhook receiver with HMAC verification and binding invalidation. Acceptance: scenarios 7 and 8.

**Phase 6: config, hardening, polish.** Environment-variable sweep; fail-closed paths; replay refusal; encrypt-at-rest note; the full Vitest suite; demo walkthrough script covering all acceptance scenarios. Acceptance: scenarios 1, 2, 6, 9 plus a clean end-to-end demo run.

### C.3 Environment variables

**RP**

```bash
RP_ID=localhost
RP_NAME="Demo RP"
RP_ORIGIN=http://localhost:3000

ATTESTATION_API_BASE_URL=http://localhost:3001
ATTESTATION_API_AUTH_TOKEN=...                  # bearer; bound on the AA to allowedAttributes + webhook
ATTESTATION_PROTOCOL_VERSION=1
ATTESTATION_REQUESTED_ATTRIBUTES=name,age
ATTESTATION_AWAIT_TIMEOUT_MS=25000              # per long-poll
ATTESTATION_TOTAL_BUDGET_MS=180000              # overall wait before giving up
ATTESTATION_FAIL_MODE=closed

REGION_RESOLVER=demo                            # static | location | demo
RP_REGION=region-1                              # used when REGION_RESOLVER=static
REGIONS_CONFIG_PATH=./config/regions.json
RP_WEBHOOK_SECRET=...                           # verify inbound AA webhooks

DATABASE_URL=file:./rp.db
```

**AA**

```bash
AA_ORIGIN=http://localhost:3001
AA_ENCRYPTION_MATERIAL_TTL_MS=300000            # single-use material lifetime
AA_AWAIT_MAX_WAIT_MS=25000                      # blocking long-poll ceiling
AA_DATA_TTL_MS=31536000000                      # default attested-payload TTL (1 year)
AA_WEBHOOK_MAX_ATTEMPTS=8
AA_WEBHOOK_BASE_DELAY_MS=1000                   # exponential backoff base
DATABASE_URL=file:./aa.db
```

`config/regions.json` holds the region-to-constraint mapping from A.5. RP clients (token, allowedAttributes, webhookUrl, webhookSecret) are seeded into the AA database.

### C.4 Testing strategy

- **Fast units (Vitest):** age grammar evaluation across operators and `all`/`any`; the registration gate; attribute scope enforcement; region resolver strategies; envelope encrypt/decrypt round trip; membership-check authorization; HMAC webhook verification.
- **End-to-end (against the running stack):** the nine acceptance scenarios, with the reviewer step driven programmatically. Explicitly cover fail-closed on AA timeout, replay refusal, revocation propagation, and TTL expiry.

### C.5 Risks and deferred work

- **Human-in-the-loop latency** versus blocking calls: mitigated by the long-poll ceiling plus total budget and a clear waiting UX; production swaps to 202-plus-polling or a completion webhook.
- **Real evidence verification** is the hard 80 percent and is stubbed behind the reviewer interface; integrating a real provider (or a government issuer) is post-prototype.
- **Region spoofing** under the location resolver is accepted; static binding is recommended wherever the RP serves one jurisdiction.
- **Age drift** under long TTLs: the stored `satisfiedConstraints` reflect age at attestation; re-attestation on expiry refreshes it. Acceptable for the prototype.
