import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <Badge variant="secondary">Attestation Authority</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Evidence Review & Attestation</h1>
        <p className="text-[var(--color-muted-foreground)]">
          The only party that decrypts evidence and holds PII. Reviews evidence against claimed
          fields, issues token-scoped attributes, and manages attestation lifecycle.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Scaffold ready</CardTitle>
          <CardDescription>Phase 0 complete. The review queue lands in Phase 2.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--color-muted-foreground)]">
          <ul className="list-inside list-disc space-y-1">
            <li>Encryption-material, transform, and status endpoints</li>
            <li>Reviewer queue: view photo beside claimed fields, edit, approve, reject</li>
            <li>Attestation browser with revoke + webhook delivery</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
