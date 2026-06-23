import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <Badge variant="secondary">Relying Party</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Passkey-Bound Age Attestation</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Age-gated access with no PII storage beyond minimized scoped attributes. The RP never
          sees decrypted evidence — only the attributes its AA token is scoped to.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Scaffold ready</CardTitle>
          <CardDescription>Phase 0 complete. WebAuthn flows land in Phase 1.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--color-muted-foreground)]">
          <ul className="list-inside list-disc space-y-1">
            <li>RP web app on :3000</li>
            <li>AA web app on :3001</li>
            <li>PocketBase RP on :8090, AA on :8091</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
