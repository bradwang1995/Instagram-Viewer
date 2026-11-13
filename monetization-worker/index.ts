import {
  DAY,
  FALLBACK_DURATION,
  type Entitlement,
} from "../src/features/monetization/types";
import { identify, verifyReward } from "./reward";

type Statement = {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
};

type Bindings = {
  DB?: { prepare(sql: string): Statement };
  ACCESS_LIMIT?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
  SITE_ORIGIN?: string;
  AYET_ENABLED?: string;
  AYET_DEDICATED_KEY_CONFIRMED?: string;
  AYET_REWARD_CURRENCY?: string;
  NO_FILL_POLICY?: string;
  AYET_PUBLISHER_API_KEY?: string;
  SESSION_SIGNING_SECRET?: string;
};

async function readPayload(request: Request): Promise<unknown> {
  if (
    !request.headers.get("Content-Type")?.startsWith("application/json") ||
    !request.body
  )
    return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    const result: unknown = JSON.parse(body + decoder.decode());
    return result && typeof result === "object" && "payload" in result
      ? result.payload
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const {
      DB,
      ACCESS_LIMIT,
      SITE_ORIGIN,
      AYET_PUBLISHER_API_KEY,
      SESSION_SIGNING_SECRET,
    } = env;
    const origin = request.headers.get("Origin");
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    const json = (body: object, status = 200) =>
      Response.json(body, { status, headers });
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/api/health")
      return json({ ok: true });
    if (!origin || origin !== SITE_ORIGIN)
      return json({ error: "origin" }, 403);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "X-Grant-Issued");
    if (request.method === "OPTIONS") {
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      return new Response(null, { status: 204, headers });
    }
    if (
      !DB ||
      !ACCESS_LIMIT ||
      !SESSION_SIGNING_SECRET ||
      SESSION_SIGNING_SECRET.length < 32
    ) {
      return json({ error: "disabled" }, 503);
    }
    const token = /^Bearer ([a-f0-9]{64})$/.exec(
      request.headers.get("Authorization") ?? "",
    )?.[1];
    if (!token) return json({ error: "session" }, 401);

    try {
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      const { success } = await ACCESS_LIMIT.limit({ key: ip });
      if (!success) return json({ error: "rate_limit" }, 429);
      const guest = await identify(token, SESSION_SIGNING_SECRET);
      const now = Date.now();
      const currency = Number(env.AYET_REWARD_CURRENCY);
      const rewardedAvailable =
        env.AYET_ENABLED === "true" &&
        env.AYET_DEDICATED_KEY_CONFIRMED === "true" &&
        Boolean(AYET_PUBLISHER_API_KEY) &&
        Number.isSafeInteger(currency) &&
        currency > 0;
      const status = async () => {
        const queryTime = Date.now();
        const entitlement = await DB.prepare(
          "SELECT 'free_rewarded' AS type, expires_at AS expiresAt FROM conversions WHERE guest = ? AND expires_at > ? " +
            "UNION ALL SELECT 'no_fill_temporary', expires_at FROM fallback WHERE guest = ? AND expires_at > ? " +
            "ORDER BY type, expiresAt DESC LIMIT 1",
        )
          .bind(guest, queryTime, guest, queryTime)
          .first<Entitlement>();
        const serverTime = Date.now();
        return json({
          serverTime,
          rewardedAvailable,
          entitlement:
            entitlement && entitlement.expiresAt > serverTime
              ? entitlement
              : null,
        });
      };
      if (request.method === "GET" && path === "/api/access/status")
        return await status();
      if (request.method !== "POST") return json({ error: "route" }, 404);
      if (!rewardedAvailable || !AYET_PUBLISHER_API_KEY)
        return json({ error: "disabled" }, 503);
      if (path === "/api/access/ayet/identity")
        return json({ externalIdentifier: guest });
      if (path === "/api/access/fallback" && env.NO_FILL_POLICY !== "retry") {
        await DB.prepare(
          "INSERT INTO fallback (guest, expires_at) VALUES (?, ?) " +
            "ON CONFLICT(guest) DO UPDATE SET expires_at = excluded.expires_at WHERE fallback.expires_at <= ?",
        )
          .bind(guest, now + FALLBACK_DURATION, now - (DAY - FALLBACK_DURATION))
          .run();
        return await status();
      }
      if (path !== "/api/access/ayet/reward")
        return json({ error: "route" }, 404);
      const reward = await verifyReward(
        await readPayload(request),
        guest,
        AYET_PUBLISHER_API_KEY,
        currency,
      );
      if (!reward) return json({ error: "reward" }, 403);

      // The conversion row is the grant. A conflict cannot update or extend it.
      const result = await DB.prepare(
        "INSERT INTO conversions (id, guest, expires_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
      )
        .bind(reward.conversionId, guest, Date.now() + DAY)
        .run();
      if (!result.meta.changes) {
        const previous = await DB.prepare(
          "SELECT guest FROM conversions WHERE id = ?",
        )
          .bind(reward.conversionId)
          .first<{ guest: string }>();
        if (previous?.guest !== guest) return json({ error: "reward" }, 403);
      }
      headers.set("X-Grant-Issued", String(Boolean(result.meta.changes)));
      return await status();
    } catch {
      return json({ error: "unavailable" }, 503);
    }
  },
};
