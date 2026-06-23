import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo RP — Passkey-Bound Age Attestation",
  description: "Relying Party demo: age-gated access via WebAuthn + attribute attestation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
