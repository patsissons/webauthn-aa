/// <reference path="../pb_data/types.d.ts" />

// Demo reset worker. On a schedule, wipe the AA's demo-data collections
// (attestation requests + their evidence files, issued attestations, encryption
// material, webhook jobs). The rp_clients registry is PRESERVED — it's config,
// not demo data, and re-seeding it would require the RP bearer-token secret to
// live inside PocketBase. Deleting via the record API (not raw SQL) so the
// evidence image files on attestation_requests are cleaned up too.
//
// Opt-in: only runs when RESET_ENABLED=true (set it as a PocketHost instance env
// var). Cadence via RESET_CRON (standard 5-field cron, default daily 00:00 UTC),
// e.g. "0 * * * *" hourly. Restart the instance after changing either var.
const COLLECTIONS = ["attestation_requests", "attestations", "encryption_material", "webhook_jobs"];

if ($os.getenv("RESET_ENABLED") === "true") {
  const schedule = $os.getenv("RESET_CRON") || "0 0 * * *";
  cronAdd("demoReset", schedule, () => {
    let total = 0;
    for (const name of COLLECTIONS) {
      try {
        const records = $app.findAllRecords(name);
        for (const rec of records) {
          if (rec) {
            $app.delete(rec);
            total++;
          }
        }
      } catch (e) {
        console.log("[reset] failed to clear " + name + ": " + e);
      }
    }
    console.log("[reset] AA demo data cleared (" + total + " records, rp_clients preserved)");
  });
}
