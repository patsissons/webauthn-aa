import { listAttestations, summarizeAttestation } from "@/lib/attestations";
import { onChange } from "@/lib/event-bus";

export const runtime = "nodejs";

// GET /api/attestations/events — SSE stream of issued attestations. Pushes the
// current list on connect and again whenever one changes (no polling).
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = async () => {
        if (closed) return;
        const rows = await listAttestations();
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ attestations: rows.map(summarizeAttestation) })}\n\n`,
          ),
        );
      };
      await send();

      const unsub = onChange("attestations", () => void send());
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
      const close = () => {
        if (closed) return;
        closed = true;
        unsub();
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
