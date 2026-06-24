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

interface AttestationDetail extends Attestation {
  requestId: string;
  attestedBirthDate?: string;
  age?: number | null;
  revokedReason?: string;
}

function statusBadge(status: "active" | "revoked") {
  return <Badge variant={status === "active" ? "success" : "destructive"}>{status}</Badge>;
}

export function AttestationBrowser() {
  const [items, setItems] = useState<Attestation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AttestationDetail | null>(null);
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

  // Keep the open audit detail in sync when the list changes (e.g. after revoke).
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/attestations/${selectedId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId, items]);

  async function revoke(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/attestations/${id}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "reviewer revoked" }),
      });
      // The SSE stream + the detail effect refresh.
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card data-testid="attestation-browser">
        <CardHeader>
          <CardTitle>Issued attestations</CardTitle>
          <CardDescription>Click one to audit its evidence and status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">No attestations yet.</p>
          )}
          {items.map((a) => (
            <button
              key={a.id}
              data-testid={`attestation-${a.id}`}
              onClick={() => setSelectedId(a.id)}
              className={`flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors hover:bg-[var(--color-accent)] ${
                selectedId === a.id
                  ? "border-[var(--color-primary)]"
                  : "border-[var(--color-border)]"
              }`}
            >
              <div>
                <div className="font-medium">{a.attestedName}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  expires {new Date(a.expiresAt).toLocaleDateString()}
                </div>
              </div>
              {statusBadge(a.status)}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="attestation-detail">
        <CardHeader>
          <CardTitle>Attestation audit</CardTitle>
          <CardDescription>
            {detail ? "Issued attestation — read only." : "Select an attestation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail ? (
            <>
              <div className="flex items-center gap-2" data-testid="audit-status">
                {statusBadge(detail.status)}
                {detail.status === "revoked" && detail.revokedAt && (
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    revoked {new Date(detail.revokedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Evidence from the original request (decrypted, at the AA). */}
              <img
                src={`/api/review/${detail.requestId}/evidence`}
                alt="evidence"
                data-testid="audit-evidence"
                className="max-h-64 w-full rounded-md border border-[var(--color-border)] object-contain"
              />

              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-[var(--color-muted-foreground)]">Name</dt>
                <dd data-testid="audit-name">{detail.attestedName}</dd>
                <dt className="text-[var(--color-muted-foreground)]">Date of birth</dt>
                <dd>{detail.attestedBirthDate ?? "—"}</dd>
                <dt className="text-[var(--color-muted-foreground)]">Age</dt>
                <dd>{detail.age ?? "—"}</dd>
                <dt className="text-[var(--color-muted-foreground)]">Issued</dt>
                <dd>{detail.issuedAt ? new Date(detail.issuedAt).toLocaleString() : "—"}</dd>
                <dt className="text-[var(--color-muted-foreground)]">Expires</dt>
                <dd>{detail.expiresAt ? new Date(detail.expiresAt).toLocaleString() : "—"}</dd>
              </dl>

              {detail.status === "active" && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy === detail.id}
                  data-testid={`revoke-${detail.id}`}
                  onClick={() => revoke(detail.id)}
                >
                  Revoke
                </Button>
              )}
            </>
          ) : (
            <Badge variant="secondary">Idle</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
