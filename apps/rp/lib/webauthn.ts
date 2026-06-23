import "server-only";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { rpEnv } from "./env";
import { b64uToBytes } from "./encoding";

export const webauthn = {
  rpID: rpEnv.rpId,
  rpName: rpEnv.rpName,
  origin: rpEnv.rpOrigin,
};

export async function buildRegistrationOptions(args: {
  userHandle: string; // base64url-encoded random handle
  userName: string;
}) {
  return generateRegistrationOptions({
    rpName: webauthn.rpName,
    rpID: webauthn.rpID,
    userID: b64uToBytes(args.userHandle),
    userName: args.userName,
    userDisplayName: args.userName,
    attestationType: "none", // WebAuthn authenticator attestation; not our age attestation
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });
}

export async function verifyRegistration(args: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: webauthn.origin,
    expectedRPID: webauthn.rpID,
    requireUserVerification: false,
  });
}

export async function buildAuthenticationOptions() {
  return generateAuthenticationOptions({
    rpID: webauthn.rpID,
    userVerification: "preferred",
    // Empty allowCredentials => discoverable-credential (usernameless) flow.
    allowCredentials: [],
  });
}

export async function verifyAuthentication(args: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: { id: string; publicKey: string; counter: number; transports?: string[] };
}): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: webauthn.origin,
    expectedRPID: webauthn.rpID,
    requireUserVerification: false,
    credential: {
      id: args.credential.id,
      publicKey: b64uToBytes(args.credential.publicKey),
      counter: args.credential.counter,
      transports: args.credential.transports as never,
    },
  });
}
