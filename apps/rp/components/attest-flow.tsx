"use client";

import { useRef, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { sealEvidence } from "@/lib/envelope-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Phase =
  | { kind: "evidence" }
  | { kind: "waiting"; message: string }
  | { kind: "authenticated"; displayName: string; satisfiedConstraints: string[] }
  | { kind: "not_eligible"; region?: { label: string } }
  | { kind: "rejected" }
  | { kind: "error"; message: string };

const REGIONS = [
  { id: "region-1", label: "Region 1 (age ≥ 18)" },
  { id: "region-2", label: "Region 2 (age ≥ 21)" },
];

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

export function AttestFlow() {
  const [phase, setPhase] = useState<Phase>({ kind: "evidence" });
  const [claimedName, setClaimedName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [demoRegion, setDemoRegion] = useState("region-1");
  const photoRef = useRef<string | null>(null);
  const [photoName, setPhotoName] = useState("");

  function onPhoto(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      photoRef.current = reader.result as string;
      setPhotoName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function pollUntilDecision(requestId: string): Promise<void> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const res = await postJson("/api/attest/status", { requestId, demoRegion });
      if (res.status === "approved") {
        setPhase({ kind: "waiting", message: "Approved — creating your passkey…" });
        const response = await startRegistration({ optionsJSON: res.options });
        const fin = await postJson("/api/attest/finish", { pendingRegId: res.pendingRegId, response });
        setPhase({
          kind: "authenticated",
          displayName: fin.displayName,
          satisfiedConstraints: fin.satisfiedConstraints ?? [],
        });
        return;
      }
      if (res.status === "rejected") return setPhase({ kind: "rejected" });
      if (res.status === "not_eligible") return setPhase({ kind: "not_eligible", region: res.region });
      await sleep(2000);
    }
    setPhase({ kind: "error", message: "Timed out waiting for verification." });
  }

  async function submit() {
    if (!claimedName.trim() || !birthDate || !photoRef.current) {
      setPhase({ kind: "error", message: "Provide a name, date of birth, and a photo." });
      return;
    }
    try {
      setPhase({ kind: "waiting", message: "Encrypting evidence…" });
      const material = await postJson("/api/attest/material");
      const envelope = await sealEvidence(material.publicKeyJwk, {
        photo: photoRef.current,
        claimedName: claimedName.trim(),
        claimedBirthDate: birthDate,
      });
      const { requestId } = await postJson("/api/attest/submit", {
        materialId: material.materialId,
        nonce: material.nonce,
        ...envelope,
      });
      setPhase({ kind: "waiting", message: "Waiting for verification…" });
      await pollUntilDecision(requestId);
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
    }
  }

  async function reauthenticate() {
    try {
      setPhase({ kind: "waiting", message: "Verifying passkey…" });
      const { challengeId, options } = await postJson("/api/webauthn/authenticate/options");
      const response = await startAuthentication({ optionsJSON: options });
      const result = await postJson("/api/webauthn/authenticate/verify", { challengeId, response });
      if (!result.verified) throw new Error("not verified");
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
          Submit ID evidence (encrypted in your browser — the RP never sees it). After a reviewer
          approves, you get a passkey bound to the attestation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="claimedName">Full name</Label>
            <Input
              id="claimedName"
              data-testid="claimed-name"
              value={claimedName}
              onChange={(e) => setClaimedName(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birthDate">Date of birth</Label>
            <Input
              id="birthDate"
              data-testid="birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="photo">Photo of ID</Label>
          <Input
            id="photo"
            data-testid="photo"
            type="file"
            accept="image/*"
            onChange={(e) => onPhoto(e.target.files?.[0])}
            disabled={busy}
          />
          {photoName && <p className="text-xs text-[var(--color-muted-foreground)]">{photoName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">Demo region</Label>
          <Select
            id="region"
            data-testid="region"
            value={demoRegion}
            onChange={(e) => setDemoRegion(e.target.value)}
            disabled={busy}
          >
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-3">
          <Button onClick={submit} disabled={busy} data-testid="submit-evidence">
            Verify & create passkey
          </Button>
          <Button onClick={reauthenticate} variant="outline" disabled={busy} data-testid="reauth-btn">
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
