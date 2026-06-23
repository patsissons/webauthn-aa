import "server-only";
import {
  encryptionMaterialResponseSchema,
  transformSubmitResponseSchema,
  transformStatusResponseSchema,
  type TransformRequest,
  type EncryptionMaterialResponse,
  type TransformStatusResponse,
} from "@webauthn-aa/contracts";
import { rpEnv } from "./env";

function headers() {
  return {
    authorization: `Bearer ${rpEnv.attestationApiAuthToken}`,
    "content-type": "application/json",
  };
}

export async function requestEncryptionMaterial(): Promise<EncryptionMaterialResponse> {
  const res = await fetch(`${rpEnv.attestationApiBaseUrl}/api/v1/encryption-material`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AA encryption-material failed (${res.status})`);
  return encryptionMaterialResponseSchema.parse(await res.json());
}

export async function submitTransform(body: TransformRequest): Promise<{ requestId: string }> {
  const res = await fetch(`${rpEnv.attestationApiBaseUrl}/api/v1/transform`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AA transform failed (${res.status}): ${detail}`);
  }
  return transformSubmitResponseSchema.parse(await res.json());
}

export async function getTransformStatus(requestId: string): Promise<TransformStatusResponse> {
  const res = await fetch(`${rpEnv.attestationApiBaseUrl}/api/v1/transform/${requestId}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AA transform status failed (${res.status})`);
  return transformStatusResponseSchema.parse(await res.json());
}
