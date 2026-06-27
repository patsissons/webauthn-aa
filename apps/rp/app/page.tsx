import { Badge } from "@/components/ui/badge";
import { AttestFlow } from "@/components/attest-flow";

export default function Home() {
  const aaOrigin = process.env.NEXT_PUBLIC_AA_ORIGIN ?? "http://localhost:3001";
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <a
        href={aaOrigin}
        className="fixed right-4 top-4 z-10 text-sm font-medium text-[var(--color-primary)] hover:underline"
      >
        Attestation Authority ↗
      </a>
      <div className="space-y-2">
        <Badge variant="secondary">Relying Party</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Passkey-Bound Age Attestation</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Age-gated access with no PII storage beyond minimized scoped attributes. The RP never sees
          decrypted evidence — only the attributes its AA token is scoped to.
        </p>
      </div>
      <AttestFlow />
    </main>
  );
}
