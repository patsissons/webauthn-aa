/// <reference path="../pb_data/types.d.ts" />

// Demo reset worker. On a schedule, wipe the RP's demo-data collections
// (registered passkeys + in-flight registration/auth state) so a public demo
// stays clean. The schema is preserved — only records are deleted — so the app
// keeps working immediately after a reset.
//
// Opt-in: only runs when RESET_ENABLED=true (set it as a PocketHost instance env
// var). Cadence via RESET_CRON (standard 5-field cron, default daily 00:00 UTC),
// e.g. "0 * * * *" hourly. Restart the instance after changing either var.
const COLLECTIONS = ["credentials", "pending_registrations", "auth_challenges"];

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
    console.log("[reset] RP demo data cleared (" + total + " records)");
  });
}
