"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Attestation {
  id: string;
  attestedName: string;
  status: "active" | "revoked";
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export function AttestationBrowser() {
  const [items, setItems] = useState<Attestation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // SSE: the server pushes the attestation list on connect and on every change.
  useEffect(() => {
    const es = new EventSource("/api/attestations/events");
    es.onmessage = (e) => {
      try {
        setItems(JSON.parse(e.data).attestations ?? []);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => es.close();
  }, []);

  async function revoke(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/attestations/${id}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "reviewer revoked" }),
      });
      // The SSE stream pushes the updated list.
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="attestation-browser">
      <CardHeader>
        <CardTitle>Issued attestations</CardTitle>
        <CardDescription>Search status and revoke. Revocation webhooks the RP.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-[var(--color-muted-foreground)]">No attestations yet.</p>
        )}
        {items.map((a) => (
          <div
            key={a.id}
            data-testid={`attestation-${a.id}`}
            className="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3 text-sm"
          >
            <div>
              <div className="font-medium">{a.attestedName}</div>
              <div className="text-xs text-[var(--color-muted-foreground)]">
                expires {new Date(a.expiresAt).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={a.status === "active" ? "success" : "destructive"}>{a.status}</Badge>
              {a.status === "active" && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === a.id}
                  data-testid={`revoke-${a.id}`}
                  onClick={() => revoke(a.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
