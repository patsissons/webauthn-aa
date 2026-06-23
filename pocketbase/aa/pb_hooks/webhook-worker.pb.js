/// <reference path="../pb_data/types.d.ts" />

// Revocation webhook delivery worker (doc A.8). Runs inside PocketBase (Goja)
// every minute as the retry backstop; the AA app also attempts immediate
// delivery on revoke. Signs the body with HMAC-SHA256 (hex) via $security.hs256
// using the per-RP webhookSecret, and applies exponential backoff.
cronAdd("webhookDelivery", "* * * * *", () => {
  const maxAttempts = parseInt($os.getenv("AA_WEBHOOK_MAX_ATTEMPTS") || "8", 10);
  const baseDelay = parseInt($os.getenv("AA_WEBHOOK_BASE_DELAY_MS") || "1000", 10);
  const now = new Date().toISOString();

  let jobs = [];
  try {
    jobs = $app.findRecordsByFilter(
      "webhook_jobs",
      "status = 'pending' && nextAttemptAt <= {:now}",
      "created",
      50,
      0,
      { now },
    );
  } catch (e) {
    return;
  }

  for (const job of jobs) {
    let client;
    try {
      client = $app.findRecordById("rp_clients", job.getString("rpClientId"));
    } catch (e) {
      continue;
    }
    const url = client.getString("webhookUrl");
    const secret = client.getString("webhookSecret");
    if (!url) continue;

    const body = JSON.stringify(job.get("payload"));
    const signature = $security.hs256(body, secret);

    try {
      const res = $http.send({
        url: url,
        method: "POST",
        body: body,
        headers: {
          "content-type": "application/json",
          "x-aa-signature": signature,
          "x-aa-event": job.getString("event"),
        },
        timeout: 10,
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        job.set("status", "delivered");
        $app.save(job);
      } else {
        throw new Error("status " + res.statusCode);
      }
    } catch (e) {
      const attempts = job.getInt("attempts") + 1;
      const delay = baseDelay * Math.pow(2, attempts);
      job.set("attempts", attempts);
      job.set("status", attempts >= maxAttempts ? "failed" : "pending");
      job.set("nextAttemptAt", new Date(Date.now() + delay).toISOString());
      job.set("lastError", String(e));
      $app.save(job);
    }
  }
});
