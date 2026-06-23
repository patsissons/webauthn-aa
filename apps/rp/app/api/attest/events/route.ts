import { resolveAttestStatus } from "@/lib/attest-status";
import { rpEnv } from "@/lib/env";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET /api/attest/events?requestId=...&demoRegion=... — Server-Sent Events.
// The RP polls the AA server-side and pushes status to the browser (no client
// polling). Streams `pending` heartbeats until a terminal result, then closes.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId");
  const demoRegion = url.searchParams.get("demoRegion") ?? undefined;
  if (!requestId) return new Response("missing requestId", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const deadline = Date.now() + rpEnv.attestationTotalBudgetMs;
      try {
        while (!req.signal.aborted && Date.now() < deadline) {
          let result;
          try {
            result = await resolveAttestStatus({ requestId, demoRegion });
          } catch {
            send({ status: "error" }); // fail-closed
            break;
          }
          send(result);
          if (result.status !== "pending") break;
          await sleep(1500);
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
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
