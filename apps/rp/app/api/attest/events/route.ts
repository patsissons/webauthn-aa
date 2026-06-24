import { resolveAttestStatus } from "@/lib/attest-status";
import { onDecision } from "@/lib/attest-bus";
import { rpEnv } from "@/lib/env";

export const runtime = "nodejs";

// GET /api/attest/events?requestId=...&demoRegion=... — Server-Sent Events.
// Event-driven (no polling): sends the current status on connect, then waits for
// the AA's `decision` webhook (delivered to /api/webhooks/attestation, which
// wakes us via the in-process bus) before re-checking once and resolving.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId");
  const demoRegion = url.searchParams.get("demoRegion") ?? undefined;
  if (!requestId) return new Response("missing requestId", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let done = false;
      const send = (data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const check = async () => {
        if (done || closed) return;
        let result;
        try {
          result = await resolveAttestStatus({ requestId, demoRegion });
        } catch {
          if (!done && !closed) {
            done = true;
            send({ status: "error" }); // fail-closed
            close();
          }
          return;
        }
        if (done || closed) return;
        send(result);
        if (result.status !== "pending") {
          done = true;
          close();
        }
      };

      const unsub = onDecision(requestId, () => void check());
      const budget = setTimeout(close, rpEnv.attestationTotalBudgetMs);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
      function cleanup() {
        unsub();
        clearTimeout(budget);
        clearInterval(heartbeat);
      }
      req.signal.addEventListener("abort", close);

      // Initial state (handles an already-decided request and shows "pending").
      void check();
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
