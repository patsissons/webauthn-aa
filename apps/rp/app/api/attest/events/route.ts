import { resolveAttestStatus } from "@/lib/attest-status";
import { onDecision } from "@/lib/attest-bus";
import { rpEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

// On a multi-instance serverless deploy the in-process bus (onDecision) only
// catches same-instance webhook wakeups, so the stream also polls the status (the
// DB is the shared source of truth) and pushes only when it changes.
const POLL_MS = 3000;

// GET /api/attest/events?requestId=...&demoRegion=... — Server-Sent Events.
// Sends the current status on connect, then resolves when the AA's `decision`
// webhook wakes us (in-process bus) or the poll observes the decision in the DB.
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
      let lastSent = "";
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
        const payload = JSON.stringify(result);
        if (payload !== lastSent) {
          lastSent = payload;
          send(result);
        }
        if (result.status !== "pending") {
          done = true;
          close();
        }
      };

      const unsub = onDecision(requestId, () => void check());
      const poll = setInterval(() => void check(), POLL_MS);
      const budget = setTimeout(close, rpEnv.attestationTotalBudgetMs);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
      function cleanup() {
        unsub();
        clearInterval(poll);
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
