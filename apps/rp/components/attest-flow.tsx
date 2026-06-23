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
  | { kind: "waiting"; message: string }
  | { kind: "authenticated"; displayName: string; satisfiedConstraints: string[] }
  | { kind: "denied"; region?: { label: string }; reason?: string }
  | { kind: "not_eligible"; region?: { label: string } }
  | { kind: "rejected" }
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
// captured + encrypted in a popup on THIS origin; the RP only ever receives the
// resulting ciphertext, and only accepts it from this exact origin.
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wait for the AA capture popup to post back a ciphertext envelope. Only messages
// from the genuine AA origin are accepted; the popup closing or cancelling rejects.
function waitForEnvelope(popup: Window): Promise<EvidenceEnvelopePayload> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      fn();
    };
    function onMessage(e: MessageEvent) {
      if (e.origin !== AA_ORIGIN) return;
      if (e.data?.type === "evidence-envelope") {
        finish(() => resolve(e.data.payload as EvidenceEnvelopePayload));
      } else if (e.data?.type === "evidence-cancelled") {
        finish(() => reject(new Error("capture cancelled")));
      }
    }
    const timer = setInterval(() => {
      if (popup.closed) finish(() => reject(new Error("capture window closed")));
    }, 500);
    window.addEventListener("message", onMessage);
  });
}

export function AttestFlow() {
  const [phase, setPhase] = useState<Phase>({ kind: "evidence" });
  const [demoRegion, setDemoRegion] = useState("region-1");
  const [regions, setRegions] = useState<RegionOption[]>(FALLBACK_REGIONS);
  const budgetRef = useRef({ totalBudgetMs: 180_000, pollIntervalMs: 2000 });

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
  }, []);

  async function pollUntilDecision(requestId: string): Promise<void> {
    const { totalBudgetMs, pollIntervalMs } = budgetRef.current;
    const deadline = Date.now() + totalBudgetMs;
    while (Date.now() < deadline) {
      const res = await postJson("/api/attest/status", { requestId, demoRegion });
      if (res.status === "approved") {
        setPhase({ kind: "waiting", message: "Approved — creating your passkey…" });
        const response = await startRegistration({ optionsJSON: res.options });
        const fin = await postJson("/api/attest/finish", {
          pendingRegId: res.pendingRegId,
          response,
        });
        setPhase({
          kind: "authenticated",
          displayName: fin.displayName,
          satisfiedConstraints: fin.satisfiedConstraints ?? [],
        });
        return;
      }
      if (res.status === "rejected") return setPhase({ kind: "rejected" });
      if (res.status === "not_eligible")
        return setPhase({ kind: "not_eligible", region: res.region });
      await sleep(pollIntervalMs);
    }
    setPhase({ kind: "error", message: "Timed out waiting for verification." });
  }

  // Must open the popup synchronously within the click gesture (else it's blocked);
  // then navigate it to the AA capture page once we have a materialId.
  function startVerification() {
    const popup = window.open("about:blank", "aa-capture", "width=480,height=780");
    if (!popup) {
      setPhase({ kind: "error", message: "Popup blocked — allow popups for this site and retry." });
      return;
    }
    void runVerification(popup);
  }

  async function runVerification(popup: Window) {
    try {
      setPhase({ kind: "waiting", message: "Opening secure capture window…" });
      const { materialId } = await postJson("/api/attest/material");
      const url =
        `${AA_ORIGIN}/capture?materialId=${encodeURIComponent(materialId)}` +
        `&rpOrigin=${encodeURIComponent(window.location.origin)}` +
        `&region=${encodeURIComponent(demoRegion)}`;
      popup.location.href = url;

      const envelope = await waitForEnvelope(popup);
      setPhase({ kind: "waiting", message: "Submitting encrypted evidence…" });
      const { requestId } = await postJson("/api/attest/submit", {
        materialId: envelope.materialId,
        nonce: envelope.nonce,
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        wrappedKey: envelope.wrappedKey,
      });
      setPhase({ kind: "waiting", message: "Waiting for verification…" });
      await pollUntilDecision(requestId);
    } catch (err) {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      setPhase({ kind: "error", message: (err as Error).message });
    }
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
        setPhase({ kind: "denied", region: result.region, reason: result.reason });
        return;
      }
      setPhase({
        kind: "authenticated",
        displayName: result.displayName,
        satisfiedConstraints: result.satisfiedConstraints ?? [],
      });
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
    }
  }

  const busy = phase.kind === "waiting";

  return (
    <Card data-testid="attest-flow">
      <CardHeader>
        <CardTitle>Attested registration</CardTitle>
        <CardDescription>
          Evidence is captured and encrypted in a secure window on the Attestation Authority — this
          relying party never sees it, only ciphertext it cannot read. After a reviewer approves,
          you get a passkey bound to the attestation.
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

        <div className="flex gap-3">
          <Button onClick={startVerification} disabled={busy} data-testid="start-capture">
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
        </div>

        {phase.kind === "waiting" && (
          <p className="text-sm text-[var(--color-muted-foreground)]" data-testid="status-waiting">
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
        {phase.kind === "denied" && (
          <p className="text-sm text-[var(--color-destructive)]" data-testid="status-denied">
            Access denied{phase.region ? ` for ${phase.region.label}` : ""}
            {phase.reason ? ` (${phase.reason})` : ""}.
          </p>
        )}
        {phase.kind === "not_eligible" && (
          <p className="text-sm text-[var(--color-destructive)]" data-testid="status-not-eligible">
            Not eligible{phase.region ? ` for ${phase.region.label}` : ""}.
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
  );
}
