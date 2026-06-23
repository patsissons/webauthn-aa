import "server-only";
import { createHash } from "node:crypto";
import { getPb } from "./pb";

export interface RpClient {
  id: string;
  name: string;
  allowedAttributes: string[];
  webhookUrl: string;
  webhookSecret: string;
}

/** Resolve the RP client from a `Bearer <token>` header by sha256 hash lookup. */
export async function authenticateRp(req: Request): Promise<RpClient | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = createHash("sha256").update(match[1]).digest("hex");

  const pb = await getPb();
  const rec = await pb
    .collection("rp_clients")
    .getFirstListItem(pb.filter("bearerTokenHash = {:h}", { h: tokenHash }))
    .catch(() => null);
  if (!rec) return null;

  return {
    id: rec.id,
    name: rec.name,
    allowedAttributes: Array.isArray(rec.allowedAttributes) ? rec.allowedAttributes : [],
    webhookUrl: rec.webhookUrl ?? "",
    webhookSecret: rec.webhookSecret ?? "",
  };
}
