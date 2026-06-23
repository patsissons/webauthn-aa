"use client";

import { useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; message: string }
  | { kind: "authenticated"; displayName: string }
  | { kind: "error"; message: string };

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

export function PasskeyDemo() {
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function register() {
    if (!displayName.trim()) {
      setStatus({ kind: "error", message: "Enter a display name first." });
      return;
    }
    try {
      setStatus({ kind: "busy", message: "Creating passkey…" });
      const { pendingRegId, options } = await postJson("/api/webauthn/register/options", {
        displayName: displayName.trim(),
      });
      const response = await startRegistration({ optionsJSON: options });
      const result = await postJson("/api/webauthn/register/verify", { pendingRegId, response });
      setStatus({ kind: "authenticated", displayName: result.displayName });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  async function authenticate() {
    try {
      setStatus({ kind: "busy", message: "Verifying passkey…" });
      const { challengeId, options } = await postJson("/api/webauthn/authenticate/options");
      const response = await startAuthentication({ optionsJSON: options });
      const result = await postJson("/api/webauthn/authenticate/verify", { challengeId, response });
      if (!result.verified) throw new Error("not verified");
      setStatus({ kind: "authenticated", displayName: result.displayName });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  const busy = status.kind === "busy";

  return (
    <Card data-testid="passkey-demo">
      <CardHeader>
        <CardTitle>Stock WebAuthn (Phase 1)</CardTitle>
        <CardDescription>
          Register a passkey, then re-authenticate with it. Attestation gating arrives in Phase 3.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            data-testid="display-name"
            placeholder="e.g. Ada Lovelace"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="flex gap-3">
          <Button onClick={register} disabled={busy} data-testid="register-btn">
            Register passkey
          </Button>
          <Button onClick={authenticate} variant="outline" disabled={busy} data-testid="authenticate-btn">
            Authenticate
          </Button>
        </div>

        {status.kind === "busy" && (
          <p className="text-sm text-[var(--color-muted-foreground)]" data-testid="status-busy">
            {status.message}
          </p>
        )}
        {status.kind === "authenticated" && (
          <div className="flex items-center gap-2" data-testid="status-authenticated">
            <Badge variant="success">Authenticated</Badge>
            <span className="text-sm">Welcome, {status.displayName}.</span>
          </div>
        )}
        {status.kind === "error" && (
          <p className="text-sm text-[var(--color-destructive)]" data-testid="status-error">
            {status.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
