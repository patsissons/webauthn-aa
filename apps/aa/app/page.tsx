import { Badge } from "@/components/ui/badge";
import { ReviewQueue } from "@/components/review-queue";
import { AttestationBrowser } from "@/components/attestation-browser";

export default function Home() {
  const rpOrigin = process.env.NEXT_PUBLIC_RP_ORIGIN ?? "http://localhost:3000";
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <a
        href={rpOrigin}
        className="fixed right-4 top-4 z-10 text-sm font-medium text-[var(--color-primary)] hover:underline"
      >
        Relying Party ↗
      </a>
      <div className="space-y-2">
        <Badge variant="secondary">Attestation Authority</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Evidence Review & Attestation</h1>
        <p className="text-[var(--color-muted-foreground)]">
          The only party that decrypts evidence and holds PII. Reviews evidence against claimed
          fields, issues token-scoped attributes, and manages attestation lifecycle.
        </p>
      </div>
      <ReviewQueue />
      <AttestationBrowser />
    </main>
  );
}
