export type VerifiedReward = { conversionId: string };

const encoder = new TextEncoder();

export async function verifyReward(
  payload: unknown,
  expectedIdentifier: string,
  secret: string,
  expectedCurrency: number,
): Promise<VerifiedReward | null> {
  if (!payload || typeof payload !== "object") return null;
  const fields = Object.keys(payload);
  // This integration does not set custom parameters. Reject them until ayeT confirms
  // the malformed custom-parameter example and supplies a signed fixture.
  if (
    fields.some(
      (key) =>
        ![
          "status",
          "rewarded",
          "externalIdentifier",
          "currency",
          "conversionId",
          "signature",
        ].includes(key),
    )
  ) {
    return null;
  }
  const {
    status,
    rewarded,
    externalIdentifier,
    currency,
    conversionId,
    signature,
  } = payload as Record<string, unknown>;
  if (
    status !== "success" ||
    rewarded !== true ||
    externalIdentifier !== expectedIdentifier ||
    typeof currency !== "number" ||
    !Number.isSafeInteger(currency) ||
    currency <= 0 ||
    currency !== expectedCurrency ||
    typeof conversionId !== "string" ||
    !/^[\w-]{1,160}$/.test(conversionId) ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{40}$/i.test(signature)
  )
    return null;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["verify"],
  );
  const bytes = new Uint8Array(20);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(signature.slice(i * 2, i * 2 + 2), 16);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    encoder.encode(expectedIdentifier + currency + conversionId),
  );
  return valid ? { conversionId } : null;
}

export async function identify(token: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("instagram-viewer:ayet:v1:" + token),
  );
  return (
    "iv_" +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
