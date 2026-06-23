"use client";

import { useEffect, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";

// AA-owned evidence capture, opened by the RP as a cross-origin popup. Because
// this runs on the AA origin, the RP page cannot script into it (same-origin
// policy) — the plaintext photo/DOB only ever exist here. We encrypt locally and
// postMessage ONLY the ciphertext envelope back to the validated RP origin.
const ALLOWED_RP_ORIGIN = process.env.NEXT_PUBLIC_RP_ORIGIN ?? "";

type State =
  | { kind: "loading" }
  | { kind: "ready"; publicKeyJwk: JsonWebKey; nonce: string }
  | { kind: "sealing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function CapturePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [claimedName, setClaimedName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [region, setRegion] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<string | null>(null);
  const ctx = useRef<{ materialId: string; rpOrigin: string }>({ materialId: "", rpOrigin: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const materialId = params.get("materialId") ?? "";
    const rpOrigin = params.get("rpOrigin") ?? "";
    setRegion(params.get("region") ?? "");
    ctx.current = { materialId, rpOrigin };

    if (!window.opener) {
      setState({ kind: "error", message: "Open this from the relying party, not directly." });
      return;
    }
    if (!rpOrigin || rpOrigin !== ALLOWED_RP_ORIGIN) {
      setState({ kind: "error", message: "Untrusted opener origin." });
      return;
    }
    if (!materialId) {
      setState({ kind: "error", message: "Missing material id." });
      return;
    }

    // Same-origin fetch of the genuine public key (no RP involvement).
    fetch(`/api/v1/encryption-material/${materialId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`material ${r.status}`))))
      .then((m) => setState({ kind: "ready", publicKeyJwk: m.publicKeyJwk, nonce: m.nonce }))
      .catch(() => setState({ kind: "error", message: "Could not load encryption material." }));
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

  function useSpecimen(opts: FakeIdOptions) {
    setClaimedName(opts.name);
    setBirthDate(opts.dob);
    applyPhoto(fakeIdDataUrl(opts), `specimen-${opts.dob}.svg`);
  }

  function generateFromDetails() {
    if (!claimedName.trim() || !birthDate) return;
    applyPhoto(fakeIdDataUrl({ name: claimedName.trim(), dob: birthDate }), "specimen-id.svg");
  }

  function cancel() {
    if (window.opener && ctx.current.rpOrigin) {
      window.opener.postMessage({ type: "evidence-cancelled" }, ctx.current.rpOrigin);
    }
    window.close();
  }

  async function submit() {
    if (state.kind !== "ready") return;
    if (!claimedName.trim() || !birthDate || !photoRef.current) {
      setState({ kind: "error", message: "Provide a name, date of birth, and a photo." });
      return;
    }
    setState({ kind: "sealing" });
    try {
      const envelope = await sealEvidence(state.publicKeyJwk, {
        photo: photoRef.current,
        claimedName: claimedName.trim(),
        claimedBirthDate: birthDate,
      });
      // Only ciphertext leaves the AA origin.
      window.opener.postMessage(
        {
          type: "evidence-envelope",
          payload: { materialId: ctx.current.materialId, nonce: state.nonce, ...envelope },
        },
        ctx.current.rpOrigin,
      );
      setState({ kind: "done" });
      setTimeout(() => window.close(), 300);
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  const busy = state.kind === "sealing" || state.kind === "loading";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <div className="space-y-1">
        <Badge variant="secondary">Attestation Authority</Badge>
        <h1 className="text-2xl font-bold tracking-tight">Verify your age</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Your ID is encrypted here, on the AA. The relying party never sees it — it only receives
          ciphertext it cannot read.{region ? ` (for ${region})` : ""}
        </p>
      </div>

      {state.kind === "error" && (
        <Card>
          <CardContent
            className="pt-6 text-sm text-[var(--color-destructive)]"
            data-testid="capture-error"
          >
            {state.message}
          </CardContent>
        </Card>
      )}

      {state.kind === "done" && (
        <Card>
          <CardContent className="pt-6 text-sm" data-testid="capture-done">
            Evidence submitted. You can close this window.
          </CardContent>
        </Card>
      )}

      {(state.kind === "ready" || state.kind === "sealing" || state.kind === "loading") && (
        <Card data-testid="capture-form">
          <CardHeader>
            <CardTitle>ID evidence</CardTitle>
            <CardDescription>Encrypted in your browser, on the AA origin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              {photoName && (
                <p className="text-xs text-[var(--color-muted-foreground)]">{photoName}</p>
              )}
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
                  <img
                    src={photoPreview}
                    alt="ID evidence preview"
                    data-testid="photo-preview"
                    className="mt-3 max-h-40 w-full rounded-md border border-[var(--color-border)] object-contain"
                  />
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={submit} disabled={busy} data-testid="submit-evidence">
                Encrypt & submit
              </Button>
              <Button
                onClick={cancel}
                variant="outline"
                disabled={busy}
                data-testid="cancel-capture"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
