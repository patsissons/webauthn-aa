import { Badge } from "@/components/ui/badge";
import { ReviewQueue } from "@/components/review-queue";
import { AttestationBrowser } from "@/components/attestation-browser";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
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
