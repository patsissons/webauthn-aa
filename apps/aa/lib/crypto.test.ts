import { describe, expect, it } from "vitest";
import { generateMaterialKeypair, sealEvidence, openEvidence } from "./crypto";

describe("envelope crypto round trip", () => {
  it("seals with the public key and opens with the private key", async () => {
    const { publicKeyJwk, privateKeyJwk } = await generateMaterialKeypair();
    const evidence = {
      photo: "data:image/png;base64,AAAA",
      claimedName: "Ada Lovelace",
      claimedBirthDate: "1999-01-01",
    };
    const env = await sealEvidence(publicKeyJwk, evidence);
    expect(env.ciphertext).toBeTruthy();
    expect(env.wrappedKey).toBeTruthy();

    const opened = await openEvidence(privateKeyJwk, env);
    expect(opened).toEqual(evidence);
  });

  it("cannot be opened with a different private key", async () => {
    const a = await generateMaterialKeypair();
    const b = await generateMaterialKeypair();
    const env = await sealEvidence(a.publicKeyJwk, {
      photo: "x",
      claimedName: "Bob",
      claimedBirthDate: "2000-05-05",
    });
    await expect(openEvidence(b.privateKeyJwk, env)).rejects.toThrow();
  });
});
