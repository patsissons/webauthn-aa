import { NextResponse } from "next/server";
import { getEvidenceImage } from "@/lib/requests";

export const runtime = "nodejs";

// GET /api/review/:id/evidence — stream the decrypted photo for the reviewer UI.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await getEvidenceImage(id);
  if (!image) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(image.bytes, {
    headers: { "content-type": image.contentType, "cache-control": "no-store" },
  });
}
