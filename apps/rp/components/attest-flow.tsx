"use client";

import { useEffect, useRef, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { sealEvidence } from "@/lib/envelope-client";
import {
  fakeIdDataUrl,
  ADULT_SPECIMEN_OPTS,
  MINOR_SPECIMEN_OPTS,
  type FakeIdOptions,
} from "@/lib/fake-id";
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
  | { kind: "denied"; region?: { label: string }; reason?: string }
  | { kind: "not_eligible"; region?: { label: string } }
  | { kind: "rejected" }
  | { kind: "error"; message: string };

interface RegionOption {
  id: string;
  label: string;
  summary?: string;
}

const FALLBACK_REGIONS: RegionOption[] = [
  { id: "region-1", label: "Region 1", summary: "age ≥ 18" },
  { id: "region-2", label: "Region 2", summary: "age ≥ 21" },
];

function regionOptionLabel(r: RegionOption): string {
  return r.summary ? `${r.label} — ${r.summary}` : r.label;
}

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

// AA origin compiled into the client bundle (honest client config). The browser
// uses THIS to fetch the encryption key directly from the AA — never a URL or key
// supplied by the RP in a per-request response.
const AA_ORIGIN = process.env.NEXT_PUBLIC_AA_ORIGIN ?? "";

async function fetchAaMaterial(
  materialId: string,
): Promise<{ publicKeyJwk: JsonWebKey; nonce: string }> {
  if (!AA_ORIGIN) throw new Error("AA origin is not configured");
  const res = await fetch(`${AA_ORIGIN}/api/v1/encryption-material/${materialId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`could not fetch AA key (${res.status})`);
  return res.json();
}

export function AttestFlow() {
  const [phase, setPhase] = useState<Phase>({ kind: "evidence" });
  const [claimedName, setClaimedName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [demoRegion, setDemoRegion] = useState("region-1");
  const photoRef = useRef<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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

  function applyPhoto(dataUrl: string, name: string) {
    photoRef.current = dataUrl;
    setPhotoPreview(dataUrl);
    setPhotoName(name);
  }

  function onPhoto(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyPhoto(reader.result as string, file.name);
    reader.readAsDataURL(file);
  }

  // Generate an obviously-fake SPECIMEN ID card and use it as the evidence
  // photo, syncing the claimed name + DOB so the reviewer sees a coherent card.
  function useSpecimen(opts: FakeIdOptions) {
    setClaimedName(opts.name);
    setBirthDate(opts.dob);
    applyPhoto(fakeIdDataUrl(opts), `specimen-${opts.dob}.svg`);
  }

  function generateFromDetails() {
    if (!claimedName.trim() || !birthDate) {
      setPhase({ kind: "error", message: "Enter a name and date of birth first." });
      return;
    }
    applyPhoto(fakeIdDataUrl({ name: claimedName.trim(), dob: birthDate }), "specimen-id.svg");
  }

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

  async function submit() {
    if (!claimedName.trim() || !birthDate || !photoRef.current) {
      setPhase({ kind: "error", message: "Provide a name, date of birth, and a photo." });
      return;
    }
    try {
      setPhase({ kind: "waiting", message: "Encrypting evidence…" });
      // The RP only relays an opaque materialId; the genuine public key + nonce
      // are fetched DIRECTLY from the AA (TLS-authenticated) so the RP cannot
      // substitute its own key to read the evidence.
      const { materialId } = await postJson("/api/attest/material");
      const aaMaterial = await fetchAaMaterial(materialId);
      const envelope = await sealEvidence(aaMaterial.publicKeyJwk, {
        photo: photoRef.current,
        claimedName: claimedName.trim(),
        claimedBirthDate: birthDate,
      });
      const { requestId } = await postJson("/api/attest/submit", {
        materialId,
        nonce: aaMaterial.nonce,
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

          <div className="rounded-md border border-dashed border-[var(--color-border)] p-3">
            <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">
              No ID handy? Generate an obviously-fake SPECIMEN card for the demo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                data-testid="gen-adult"
                onClick={() => useSpecimen(ADULT_SPECIMEN_OPTS)}
              >
                Adult specimen
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                data-testid="gen-minor"
                onClick={() => useSpecimen(MINOR_SPECIMEN_OPTS)}
              >
                Minor specimen
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                data-testid="gen-from-details"
                onClick={generateFromDetails}
              >
                From entered details
              </Button>
            </div>
            {photoPreview && (
              <div className="mt-3 space-y-1">
                <img
                  src={photoPreview}
                  alt="ID evidence preview"
                  data-testid="photo-preview"
                  className="max-h-40 w-full rounded-md border border-[var(--color-border)] object-contain"
                />
                <a
                  href={photoPreview}
                  download={photoName || "specimen-id.svg"}
                  className="text-xs underline"
                  data-testid="photo-download"
                >
                  Download image
                </a>
              </div>
            )}
          </div>
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
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {regionOptionLabel(r)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-3">
          <Button onClick={submit} disabled={busy} data-testid="submit-evidence">
            Verify & create passkey
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
