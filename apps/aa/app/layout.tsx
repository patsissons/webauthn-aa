import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo AA — Attestation Authority",
  description: "Attestation Authority demo: evidence review queue and attestation lifecycle",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
