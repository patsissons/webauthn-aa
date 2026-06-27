import { listAttestations, summarizeAttestation } from "@/lib/attestations";
import { onChange } from "@/lib/event-bus";

export const runtime = "nodejs";
export const maxDuration = 60;

// On a multi-instance serverless deploy the in-process bus (onChange) only catches
// same-instance mutations, so each stream also polls the DB (the shared source of
// truth) and pushes only when the payload changes.
const POLL_MS = 3000;

// GET /api/attestations/events — SSE stream of issued attestations. Pushes the
// current list on connect and again whenever one changes.
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastSent = "";
      const send = async () => {
        if (closed) return;
        const rows = await listAttestations();
        const payload = JSON.stringify({ attestations: rows.map(summarizeAttestation) });
        if (payload === lastSent) return;
        lastSent = payload;
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };
      await send();

      const unsub = onChange("attestations", () => void send());
      const poll = setInterval(() => void send(), POLL_MS);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
      const close = () => {
        if (closed) return;
        closed = true;
        unsub();
        clearInterval(poll);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
