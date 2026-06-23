/// <reference path="../pb_data/types.d.ts" />

// AA data model (doc A.11). All rules are null => superuser-only access; the AA
// Next.js server talks to PocketBase with a superuser token. Record ids serve
// as materialId / requestId / attestationId in the API contract.
migrate(
  (app) => {
    const rpClients = new Collection({
      type: "base",
      name: "rp_clients",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "name", type: "text", required: true },
        { name: "bearerTokenHash", type: "text", required: true },
        { name: "allowedAttributes", type: "json", required: true, maxSize: 2000 },
        { name: "webhookUrl", type: "text" },
        { name: "webhookSecret", type: "text" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_rp_clients_token ON rp_clients (bearerTokenHash)",
      ],
    });
    app.save(rpClients);

    const material = new Collection({
      type: "base",
      name: "encryption_material",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "publicKeyJwk", type: "json", required: true, maxSize: 20000 },
        { name: "privateKeyJwk", type: "json", required: true, maxSize: 20000 },
        { name: "nonce", type: "text", required: true },
        { name: "rpClientId", type: "text", required: true },
        { name: "expiresAt", type: "date", required: true },
        { name: "usedAt", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_material_nonce ON encryption_material (nonce)"],
    });
    app.save(material);

    const requests = new Collection({
      type: "base",
      name: "attestation_requests",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "rpClientId", type: "text", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "approved", "rejected"],
        },
        {
          name: "evidenceImage",
          type: "file",
          maxSelect: 1,
          maxSize: 8388608,
        },
        { name: "claimedName", type: "text" },
        { name: "claimedBirthDate", type: "text" },
        { name: "reviewedName", type: "text" },
        { name: "reviewedBirthDate", type: "text" },
        { name: "requestedAttributes", type: "json", maxSize: 2000 },
        { name: "decidedBy", type: "text" },
        { name: "decidedAt", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_requests_status ON attestation_requests (status)"],
    });
    app.save(requests);

    const attestations = new Collection({
      type: "base",
      name: "attestations",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "requestId", type: "text", required: true },
        { name: "rpClientId", type: "text", required: true },
        { name: "attestedName", type: "text" },
        { name: "attestedBirthDate", type: "text" },
        { name: "issuedAt", type: "date", required: true },
        { name: "expiresAt", type: "date", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "revoked"],
        },
        { name: "revokedAt", type: "date" },
        { name: "revokedReason", type: "text" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_attestations_status ON attestations (status)"],
    });
    app.save(attestations);

    const webhookJobs = new Collection({
      type: "base",
      name: "webhook_jobs",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "attestationId", type: "text", required: true },
        { name: "rpClientId", type: "text", required: true },
        { name: "event", type: "text", required: true },
        { name: "payload", type: "json", maxSize: 5000 },
        { name: "attempts", type: "number", required: false },
        { name: "nextAttemptAt", type: "date" },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "delivered", "failed"],
        },
        { name: "lastError", type: "text" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_webhook_jobs_status ON webhook_jobs (status)"],
    });
    app.save(webhookJobs);
  },
  (app) => {
    for (const name of [
      "webhook_jobs",
      "attestations",
      "attestation_requests",
      "encryption_material",
      "rp_clients",
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  },
);
