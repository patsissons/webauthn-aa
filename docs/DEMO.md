# Demo Walkthrough

Covers the nine acceptance scenarios from the spec (B.5). Most are also exercised
automatically by the Playwright suite (`pnpm test:e2e`); this is the manual script.

## Start the stack

```bash
pnpm install      # downloads PocketBase into ./bin on first run
pnpm dev          # seeds PocketBase, then launches RP, AA, and both PB instances
```

- **RP** (applicant): <http://localhost:3000>
- **AA** (reviewer): <http://localhost:3001>
- PocketBase admin UIs: <http://localhost:8090/_> (RP) and <http://localhost:8091/_> (AA)

Use a Chromium-based browser so platform passkeys work on `localhost`. The RP only
ever talks to the AA server-to-server.

## Scenarios

1. **Happy path.** On the RP, enter a name, a date of birth that is 18+ (e.g.
   `1998-01-01`), upload any image as the ID photo, leave the region on **Region 1**,
   and click **Verify & create passkey**. The page shows "Waiting for verification".
   On the AA, open the pending request, confirm the photo beside the claimed fields,
   and click **Approve**. The RP creates a passkey and shows **Authenticated** with the
   satisfied thresholds (`age_gte_18`, `age_gte_21`).
2. **Cheap repeat.** Reload the RP and click **Re-authenticate**. Access is granted with
   the passkey only — no photo, no AA call.
3. **Threshold variation, allowed.** Set the demo dropdown to **Region 2** and click
   **Re-authenticate**. The age-28 device is still authorized (set-membership lookup),
   with no re-attestation.
4. **Threshold variation, denied.** Repeat scenario 1 with a date of birth that is 18–20
   (e.g. `2007-01-01`) under Region 1. Then set the dropdown to **Region 2** and
   re-authenticate: access is **denied** (`age_gte_21` is not in the device's satisfied
   set), via membership lookup with no recomputation.
5. **Gate rejection.** Set the dropdown to **Region 2** and submit evidence with a date
   of birth that is 18–20. After the reviewer approves, the RP gate rejects it at
   registration ("Not eligible for Region 2") and **no passkey is created**.
6. **Reviewer rejection.** Submit evidence and **Reject** it on the AA. The applicant sees
   "Not eligible — evidence was rejected"; nothing is persisted.
7. **Revocation.** After a happy-path registration, open the AA **Issued attestations**
   panel and click **Revoke**. A signed webhook is delivered to the RP (watch
   `webhook_jobs` in the AA admin UI), which invalidates the binding. The device's next
   re-authentication is **denied (revoked)** and routes back to attestation.
8. **TTL expiry.** Approve a request with a short TTL (the demo dropdown uses the default
   1-year TTL; the e2e suite approves with `ttlMs` to force expiry). Once expired, the
   next re-authentication is **denied (expired)** on freshness, even with no webhook.
9. **Replay refused.** A captured ciphertext replayed with a spent or expired
   material/nonce is rejected by the AA (`400`). See
   `e2e/attestation.spec.ts` → "refuses a replayed (already-used) material".

## Privacy check

In the RP PocketBase admin (<http://localhost:8090/_>), open the `credentials`
collection: it contains the public key, display name, `satisfiedConstraints`,
`attestationId`, and expiry — **no photo, no date of birth, no government identifier**.
The decrypted photo and DOB live only at the AA (`attestation_requests` /
`attestations` on <http://localhost:8091/_>).

## Security notes (prototype)

- **Fail-closed.** Any AA error, timeout, or verification failure denies — never grants.
- **Single-use, nonce-bound material** prevents replaying one user's evidence into
  another registration.
- **Envelope encryption**: the RP only ever relays ciphertext it cannot decrypt.
- **No RP key-substitution MITM**: the browser fetches the encryption public key
  **directly from the AA** (TLS-authenticated); the RP relays only an opaque
  materialId, so a malicious RP _server_ cannot swap in its own key to harvest
  evidence.
- **AA-owned capture**: evidence is entered + encrypted in a cross-origin iframe
  on the AA origin, which the RP cannot script into (same-origin policy), so
  plaintext never exists in RP-controlled code — closing the code-plane MITM too.
  Trade-off: the iframe dialog (chosen for UX) hides the AA's address bar, so it
  is weaker against AA-phishing than a popup/redirect would be; a malicious RP
  could frame a look-alike AA. Strongest form is a redirect to the AA origin or a
  non-RP-served verifier (native app / extension / issuer app).
- **Real-time revocation**: an authenticated client holds an SSE session; the
  revocation webhook pushes an immediate logout (no reload), with TTL expiry as
  the backstop.
- **HMAC-signed webhooks**: the RP verifies the signature before invalidating a binding.
- **Documented limitations**: sharing a passkey shares the age proof; location-derived
  region resolution is spoofable (use the `static` resolver for a single-jurisdiction RP).
- **Deferred hardening**: stored evidence is a plain blob (encrypt-at-rest is a noted
  hardening step); no per-attribute TTLs; no blind tokens (per-RP correlation is accepted).

```

```
