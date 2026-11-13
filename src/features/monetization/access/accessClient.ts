import {
  DAY,
  FALLBACK_DURATION,
  type AccessStatus,
  type Entitlement,
} from "../types";

export const MOCK_KEY = "instagram-viewer:monetization:mock:v1";
const SESSION_KEY = "instagram-viewer:monetization:guest:v1";

export function guestToken() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  localStorage.setItem(SESSION_KEY, token);
  return token;
}

function isEntitlement(value: unknown): value is Entitlement {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    !("expiresAt" in value)
  )
    return false;
  return (
    ["free_rewarded", "premium", "no_fill_temporary"].some(
      (kind) => kind === value.type,
    ) && Number.isSafeInteger(value.expiresAt)
  );
}

export function parseStatus(data: unknown): AccessStatus {
  if (
    !data ||
    typeof data !== "object" ||
    !("serverTime" in data) ||
    typeof data.serverTime !== "number" ||
    !Number.isSafeInteger(data.serverTime) ||
    !("entitlement" in data) ||
    (data.entitlement !== null && !isEntitlement(data.entitlement))
  ) {
    throw new Error("Invalid access response");
  }
  return { serverTime: data.serverTime, entitlement: data.entitlement };
}

export function mockStatus(): AccessStatus {
  const serverTime = Date.now();
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MOCK_KEY) ?? "null");
    if (
      isEntitlement(value) &&
      value.type !== "premium" &&
      value.expiresAt > serverTime
    ) {
      return { serverTime, entitlement: value };
    }
  } catch {
    // Corrupt or inaccessible demo storage starts at the entrance.
  }
  return { serverTime, entitlement: null };
}

export function mockGrant(
  type: "free_rewarded" | "no_fill_temporary",
): AccessStatus {
  const serverTime = Date.now();
  const entitlement = {
    type,
    expiresAt:
      serverTime + (type === "free_rewarded" ? DAY : FALLBACK_DURATION),
  };
  localStorage.setItem(MOCK_KEY, JSON.stringify(entitlement));
  return { serverTime, entitlement };
}

export function createAccessClient(origin: string) {
  async function request(path: string, signal: AbortSignal, body?: object) {
    const response = await fetch(origin + "/api/access/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + guestToken(),
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok) throw new Error("Access request failed");
    return response;
  }
  return {
    status: async (signal: AbortSignal) =>
      parseStatus(await (await request("status", signal)).json()),
    fallback: async (signal: AbortSignal) =>
      parseStatus(await (await request("fallback", signal, {})).json()),
    reward: async (signal: AbortSignal, payload: unknown) => {
      const response = await request("ayet/reward", signal, { payload });
      return {
        status: parseStatus(await response.json()),
        issued: response.headers.get("X-Grant-Issued") === "true",
      };
    },
    identifier: async (signal: AbortSignal) => {
      const data = await (await request("ayet/identity", signal, {})).json();
      if (
        typeof data.externalIdentifier !== "string" ||
        !/^iv_[a-f0-9]{64}$/.test(data.externalIdentifier)
      ) {
        throw new Error("Invalid guest identity");
      }
      return data.externalIdentifier as string;
    },
  };
}
