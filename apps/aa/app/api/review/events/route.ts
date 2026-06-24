import { listRequests, summarizeRequest } from "@/lib/requests";
import { onChange } from "@/lib/event-bus";

export const runtime = "nodejs";

// GET /api/review/events — SSE stream of the pending review queue. Pushes the
// current list on connect and again whenever a request changes (no polling).
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = async () => {
        if (closed) return;
        const rows = await listRequests(status);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ requests: rows.map(summarizeRequest) })}\n\n`),
        );
      };
      await send();

      const unsub = onChange("requests", () => void send());
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
