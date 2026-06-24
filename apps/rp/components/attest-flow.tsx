"use client";

import { useEffect, useRef, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Phase =
  | { kind: "evidence" }
  | { kind: "capturing"; url: string | null }
  | { kind: "waiting"; message: string }
  | { kind: "authenticated"; displayName: string; satisfiedConstraints: string[] }
  | { kind: "denied"; region?: { label: string }; reason?: string }
  | { kind: "not_eligible"; region?: { label: string } }
  | { kind: "rejected" }
  | { kind: "session_ended"; reason: string }
  | { kind: "error"; message: string };

interface RegionOption {
  id: string;
  label: string;
  summary?: string;
}

interface EvidenceEnvelopePayload {
  materialId: string;
  nonce: string;
  ciphertext: string;
  iv: string;
  wrappedKey: string;
}

const FALLBACK_REGIONS: RegionOption[] = [
  { id: "region-1", label: "Region 1", summary: "age ≥ 18" },
  { id: "region-2", label: "Region 2", summary: "age ≥ 21" },
];

function regionOptionLabel(r: RegionOption): string {
  return r.summary ? `${r.label} — ${r.summary}` : r.label;
}

// AA origin compiled into the client bundle (honest client config). Evidence is
// captured + encrypted in a cross-origin iframe on THIS origin; the RP only ever
// receives ciphertext, and only accepts it from this exact origin.
const AA_ORIGIN = process.env.NEXT_PUBLIC_AA_ORIGIN ?? "";

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `request failed (${res.status})`);
  return json;
}

export function AttestFlow() {
  const [phase, setPhase] = useState<Phase>({ kind: "evidence" });
  const [demoRegion, setDemoRegion] = useState("region-1");
  const [regions, setRegions] = useState<RegionOption[]>(FALLBACK_REGIONS);
  const budgetRef = useRef({ totalBudgetMs: 180_000, pollIntervalMs: 2000 });
  const captureResolver = useRef<{
    resolve: (p: EvidenceEnvelopePayload) => void;
    reject: (e: Error) => void;
  } | null>(null);
  const sessionEs = useRef<EventSource | null>(null);

  useEffect(() => {
    fetch("/api/regions")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.regions) && j.regions.length) setRegions(j.regions);
      })
      .catch(() => {});
    fetch("/api/attest/config")
      .then((r) => r.json())
      .then((c) => {
        if (c?.totalBudgetMs) budgetRef.current = c;
      })
      .catch(() => {});

    // Receive the ciphertext envelope from the AA capture iframe (origin-checked).
    function onMessage(e: MessageEvent) {
      if (e.origin !== AA_ORIGIN) return;
      const r = captureResolver.current;
      if (!r) return;
      if (e.data?.type === "evidence-envelope") {
        captureResolver.current = null;
        r.resolve(e.data.payload as EvidenceEnvelopePayload);
      } else if (e.data?.type === "evidence-cancelled") {
        captureResolver.current = null;
        r.reject(new Error("cancelled"));
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      sessionEs.current?.close();
    };
  }, []);

  function closeSession() {
    sessionEs.current?.close();
    sessionEs.current = null;
  }

  // Subscribe to the per-session SSE so a revocation / TTL expiry logs us out live.
  function subscribeSession(credentialId: string) {
    closeSession();
    const es = new EventSource(
      `/api/session/events?credentialId=${encodeURIComponent(credentialId)}`,
    );
    sessionEs.current = es;
    es.onmessage = (e) => {
      let d: { type?: string };
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      if (d.type === "revoked" || d.type === "expired") {
        closeSession();
        setPhase({ kind: "session_ended", reason: d.type });
      }
    };
  }

  function onAuthenticated(
    info: { displayName: string; satisfiedConstraints: string[] },
    credentialId: string,
  ) {
    setPhase({ kind: "authenticated", ...info });
    subscribeSession(credentialId);
  }

  // SSE: the RP streams attestation status (it polls the AA server-side).
  function streamDecision(requestId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const es = new EventSource(
        `/api/attest/events?requestId=${encodeURIComponent(requestId)}` +
          `&demoRegion=${encodeURIComponent(demoRegion)}`,
      );
      let settled = false;
      es.onmessage = async (e) => {
        let res: {
          status: string;
          options?: unknown;
          pendingRegId?: string;
          region?: { label: string };
        };
        try {
          res = JSON.parse(e.data);
        } catch {
          return;
        }
        if (res.status === "pending") {
          setPhase({ kind: "waiting", message: "Waiting for verification…" });
          return;
        }
        if (settled) return;
        settled = true;
        es.close();
        try {
          if (res.status === "approved") {
            setPhase({ kind: "waiting", message: "Approved — creating your passkey…" });
            const response = await startRegistration({ optionsJSON: res.options as never });
            const fin = await postJson("/api/attest/finish", {
              pendingRegId: res.pendingRegId,
              response,
              demoRegion,
            });
            // The passkey is always created; whether you're eligible now is separate.
            if (fin.authorized) {
              onAuthenticated(
                {
                  displayName: fin.displayName,
                  satisfiedConstraints: fin.satisfiedConstraints ?? [],
                },
                response.id,
              );
            } else {
              setPhase({ kind: "not_eligible", region: fin.region });
            }
          } else if (res.status === "rejected") {
            setPhase({ kind: "rejected" });
          } else {
            setPhase({ kind: "error", message: "Attestation failed." });
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      es.onerror = () => {
        if (settled) return;
        settled = true;
        es.close();
        reject(new Error("status stream interrupted"));
      };
    });
  }

  async function runVerification() {
    try {
      setPhase({ kind: "capturing", url: null });
      const { materialId } = await postJson("/api/attest/material");
      const url =
        `${AA_ORIGIN}/capture?materialId=${encodeURIComponent(materialId)}` +
        `&rpOrigin=${encodeURIComponent(window.location.origin)}` +
        `&region=${encodeURIComponent(demoRegion)}`;
      const envelopePromise = new Promise<EvidenceEnvelopePayload>((resolve, reject) => {
        captureResolver.current = { resolve, reject };
      });
      setPhase({ kind: "capturing", url });

      const envelope = await envelopePromise;
      setPhase({ kind: "waiting", message: "Submitting encrypted evidence…" });
      const { requestId } = await postJson("/api/attest/submit", {
        materialId: envelope.materialId,
        nonce: envelope.nonce,
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        wrappedKey: envelope.wrappedKey,
      });
      setPhase({ kind: "waiting", message: "Waiting for verification…" });
      await streamDecision(requestId);
    } catch (err) {
      captureResolver.current = null;
      if ((err as Error).message === "cancelled") {
        setPhase({ kind: "evidence" });
        return;
      }
      setPhase({ kind: "error", message: (err as Error).message });
    }
  }

  function cancelCapture() {
    const r = captureResolver.current;
    captureResolver.current = null;
    r?.reject(new Error("cancelled"));
  }

  async function reauthenticate() {
    try {
      setPhase({ kind: "waiting", message: "Verifying passkey…" });
      const { challengeId, options } = await postJson("/api/webauthn/authenticate/options");
      const response = await startAuthentication({ optionsJSON: options });
      const result = await postJson("/api/webauthn/authenticate/verify", {
        challengeId,
        response,
        demoRegion,
      });
      if (!result.verified) throw new Error("not verified");
      if (!result.authorized) {
        // revoked/expired => must re-attest; constraint => not yet eligible.
        if (result.reason === "revoked" || result.reason === "expired") {
          setPhase({ kind: "denied", region: result.region, reason: result.reason });
        } else {
          setPhase({ kind: "not_eligible", region: result.region });
        }
        return;
      }
      onAuthenticated(
        {
          displayName: result.displayName,
          satisfiedConstraints: result.satisfiedConstraints ?? [],
        },
        response.id,
      );
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
    }
  }

  function logout() {
    closeSession();
    setPhase({ kind: "evidence" });
  }

  const busy = phase.kind === "waiting" || phase.kind === "capturing";
  const authenticated = phase.kind === "authenticated";

  return (
    <>
      <Card data-testid="attest-flow">
        <CardHeader>
          <CardTitle>Attested registration</CardTitle>
          <CardDescription>
            Evidence is captured and encrypted in a secure window on the Attestation Authority —
            this relying party never sees it, only ciphertext it cannot read. After a reviewer
            approves, you get a passkey bound to the attestation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="region">Demo region</Label>
            <Select
              id="region"
              data-testid="region"
              value={demoRegion}
              onChange={(e) => setDemoRegion(e.target.value)}
              disabled={busy}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {regionOptionLabel(r)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={runVerification} disabled={busy} data-testid="start-capture">
              Verify your age
            </Button>
            <Button
              onClick={reauthenticate}
              variant="outline"
              disabled={busy}
              data-testid="reauth-btn"
            >
              Re-authenticate
            </Button>
            {authenticated && (
              <Button onClick={logout} variant="ghost" data-testid="logout-btn">
                Logout
              </Button>
            )}
          </div>

          {phase.kind === "waiting" && (
            <p
              className="text-sm text-[var(--color-muted-foreground)]"
              data-testid="status-waiting"
            >
              {phase.message}
            </p>
          )}
          {phase.kind === "authenticated" && (
            <div className="space-y-2" data-testid="status-authenticated">
              <div className="flex items-center gap-2">
                <Badge variant="success">Authenticated</Badge>
                <span className="text-sm">Welcome, {phase.displayName}.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {phase.satisfiedConstraints.map((c) => (
                  <Badge key={c} variant="secondary" data-testid={`constraint-${c}`}>
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {phase.kind === "session_ended" && (
            <p
              className="text-sm text-[var(--color-destructive)]"
              data-testid="status-session-ended"
            >
              You were logged out — attestation {phase.reason}. Please re-verify.
            </p>
          )}
          {phase.kind === "denied" && (
            <p className="text-sm text-[var(--color-destructive)]" data-testid="status-denied">
              Access denied{phase.region ? ` for ${phase.region.label}` : ""}
              {phase.reason ? ` (${phase.reason})` : ""}.
            </p>
          )}
          {phase.kind === "not_eligible" && (
            <p
              className="text-sm text-[var(--color-muted-foreground)]"
              data-testid="status-not-eligible"
            >
              Not eligible{phase.region ? ` for ${phase.region.label}` : ""} yet — your passkey is
              saved and will work once you qualify. Re-authenticate to check.
            </p>
          )}
          {phase.kind === "rejected" && (
            <p className="text-sm text-[var(--color-destructive)]" data-testid="status-rejected">
              Not eligible — evidence was rejected.
            </p>
          )}
          {phase.kind === "error" && (
            <p className="text-sm text-[var(--color-destructive)]" data-testid="status-error">
              {phase.message}
            </p>
          )}
        </CardContent>
      </Card>

      {phase.kind === "capturing" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-testid="capture-dialog"
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
              <span className="text-sm font-medium">Secure capture · Attestation Authority</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelCapture}
                data-testid="capture-cancel"
              >
                Close
              </Button>
            </div>
            {phase.url ? (
              <iframe
                src={phase.url}
                title="AA evidence capture"
                data-testid="capture-iframe"
                className="h-[640px] w-full"
              />
            ) : (
              <div className="p-6 text-sm text-[var(--color-muted-foreground)]">Opening…</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
