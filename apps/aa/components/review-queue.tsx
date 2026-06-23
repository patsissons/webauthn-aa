"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface RequestSummary {
  id: string;
  status: "pending" | "approved" | "rejected";
  claimedName: string;
  claimedBirthDate: string;
  reviewedName?: string;
  reviewedBirthDate?: string;
  created: string;
  hasEvidence: boolean;
}

export function ReviewQueue() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selected, setSelected] = useState<RequestSummary | null>(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/review/list?status=pending", { cache: "no-store" });
    const json = await res.json();
    setRequests(json.requests ?? []);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  function select(r: RequestSummary) {
    setSelected(r);
    setName(r.reviewedName || r.claimedName);
    setBirthDate(r.reviewedBirthDate || r.claimedBirthDate);
  }

  async function decide(action: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      await fetch(`/api/review/${selected.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reviewedName: name, reviewedBirthDate: birthDate }),
      });
      setSelected(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rejectAll() {
    if (requests.length === 0) return;
    if (!window.confirm(`Reject all ${requests.length} pending request(s)?`)) return;
    setBusy(true);
    try {
      await fetch("/api/review/reject-all", { method: "POST" });
      setSelected(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card data-testid="review-list">
        <CardHeader>
          <CardTitle>Pending review queue</CardTitle>
          <CardDescription>{requests.length} awaiting decision</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                data-testid="reject-all"
                onClick={rejectAll}
              >
                Reject all ({requests.length})
              </Button>
            </div>
          )}
          {requests.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">No pending requests.</p>
          )}
          {requests.map((r) => (
            <button
              key={r.id}
              data-testid={`review-item-${r.id}`}
              onClick={() => select(r)}
              className={`w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-[var(--color-accent)] ${
                selected?.id === r.id
                  ? "border-[var(--color-primary)]"
                  : "border-[var(--color-border)]"
              }`}
            >
              <div className="font-medium">{r.claimedName}</div>
              <div className="text-[var(--color-muted-foreground)]">DOB {r.claimedBirthDate}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="review-detail">
        <CardHeader>
          <CardTitle>Review evidence</CardTitle>
          <CardDescription>
            {selected ? "Verify the photo against the claimed fields." : "Select a request."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected ? (
            <>
              {selected.hasEvidence && (
                // Plain <img>: this streams a decrypted, one-off evidence blob
                // from an API route, not a static asset for next/image.
                <img
                  src={`/api/review/${selected.id}/evidence`}
                  alt="evidence"
                  className="max-h-64 w-full rounded-md border border-[var(--color-border)] object-contain"
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="rev-name">Name</Label>
                <Input
                  id="rev-name"
                  data-testid="rev-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rev-dob">Date of birth</Label>
                <Input
                  id="rev-dob"
                  data-testid="rev-dob"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={() => decide("approve")} disabled={busy} data-testid="approve-btn">
                  Approve
                </Button>
                <Button
                  onClick={() => decide("reject")}
                  variant="destructive"
                  disabled={busy}
                  data-testid="reject-btn"
                >
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <Badge variant="secondary">Idle</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
