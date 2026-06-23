import { describe, expect, it } from "vitest";
import { credentialRecordFromRegistration } from "./credential-record";

describe("credentialRecordFromRegistration", () => {
  const cred = {
    id: "Y3JlZC1pZA", // "cred-id"
    publicKey: new Uint8Array([1, 2, 3, 4]),
    counter: 0,
    transports: ["internal", "hybrid"],
  };

  it("maps a verified credential to a storable record with base64url public key", () => {
    const rec = credentialRecordFromRegistration(cred, {
      displayName: "Ada Lovelace",
      userHandle: "dXNlcg",
    });
    expect(rec.credentialId).toBe("Y3JlZC1pZA");
    expect(rec.publicKey).toBe(Buffer.from([1, 2, 3, 4]).toString("base64url"));
    expect(rec.counter).toBe(0);
    expect(rec.transports).toEqual(["internal", "hybrid"]);
    expect(rec.displayName).toBe("Ada Lovelace");
    expect(rec.attestationStatus).toBe("active");
  });

  it("defaults attestation binding fields to empty for the stock flow (no PII)", () => {
    const rec = credentialRecordFromRegistration(cred, {
      displayName: "User",
      userHandle: "dXNlcg",
    });
    expect(rec.satisfiedConstraints).toEqual([]);
    expect(rec.attestationId).toBe("");
    expect(rec.attestationExpiresAt).toBe("");
    // The record must never carry evidence-derived PII.
    expect(Object.keys(rec)).not.toContain("birthDate");
    expect(Object.keys(rec)).not.toContain("photo");
  });

  it("honors provided attestation binding context", () => {
    const rec = credentialRecordFromRegistration(cred, {
      displayName: "User",
      userHandle: "dXNlcg",
      satisfiedConstraints: ["age_gte_18", "age_gte_21"],
      attestationId: "att_123",
      attestationExpiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(rec.satisfiedConstraints).toEqual(["age_gte_18", "age_gte_21"]);
    expect(rec.attestationId).toBe("att_123");
    expect(rec.attestationExpiresAt).toBe("2027-01-01T00:00:00.000Z");
  });
});
