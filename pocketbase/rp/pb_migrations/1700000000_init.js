/// <reference path="../pb_data/types.d.ts" />

// RP data model (doc A.11). The credential IS the identity. These collections
// deliberately store NO photo, NO date of birth, and NO government id. Rules are
// null => superuser-only; the RP Next.js server uses a superuser token.
migrate(
  (app) => {
    const credentials = new Collection({
      type: "base",
      name: "credentials",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "credentialId", type: "text", required: true },
        { name: "publicKey", type: "text", required: true },
        { name: "counter", type: "number", required: false },
        { name: "transports", type: "json", maxSize: 2000 },
        { name: "displayName", type: "text" },
        { name: "userHandle", type: "text", required: true },
        { name: "satisfiedConstraints", type: "json", maxSize: 4000 },
        { name: "attestationId", type: "text" },
        { name: "attestationExpiresAt", type: "date" },
        {
          name: "attestationStatus",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "revoked", "expired"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_credentials_credentialId ON credentials (credentialId)",
      ],
    });
    app.save(credentials);

    const pending = new Collection({
      type: "base",
      name: "pending_registrations",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "regionId", type: "text" },
        { name: "satisfiedConstraints", type: "json", maxSize: 4000 },
        { name: "attestationId", type: "text" },
        { name: "attestedName", type: "text" },
        { name: "attestationExpiresAt", type: "date" },
        { name: "webauthnChallenge", type: "text", required: true },
        { name: "userHandle", type: "text", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "consumed"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [],
    });
    app.save(pending);

    const challenges = new Collection({
      type: "base",
      name: "auth_challenges",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "challenge", type: "text", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_auth_challenges_challenge ON auth_challenges (challenge)"],
    });
    app.save(challenges);
  },
  (app) => {
    for (const name of ["auth_challenges", "pending_registrations", "credentials"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  },
);
