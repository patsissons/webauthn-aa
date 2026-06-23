import { Badge } from "@/components/ui/badge";
import { AttestFlow } from "@/components/attest-flow";

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
      <AttestFlow />
    </main>
  );
}
