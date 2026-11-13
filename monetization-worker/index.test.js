// @vitest-environment node
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { DAY } from "../src/features/monetization/types";

const origin = "https://viewer.example";
const secret = "fixture-only";
const epoch = 1_800_000_000_000;
let sqlite;
let env;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(epoch);
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("./migrations/0001_access.sql", import.meta.url),
      "utf8",
    ),
  );
  env = {
    SITE_ORIGIN: origin,
    AYET_ENABLED: "true",
    AYET_DEDICATED_KEY_CONFIRMED: "true",
    AYET_REWARD_CURRENCY: "10",
    AYET_PUBLISHER_API_KEY: secret,
    SESSION_SIGNING_SECRET: "local fixture secret with 32 characters",
    ACCESS_LIMIT: { limit: async () => ({ success: true }) },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              first: async () => sqlite.prepare(sql).get(...args) ?? null,
              run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
            };
          },
        };
      },
    },
  };
});
afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});

function call(path, options = {}) {
  const {
    token = "a".repeat(64),
    site = origin,
    method = "GET",
    payload,
  } = options;
  return worker.fetch(
    new Request("https://access.example/api/access/" + path, {
      method,
      headers: {
        Origin: site,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(payload && { body: JSON.stringify({ payload }) }),
    }),
    env,
  );
}

async function signed(token, conversionId = "fixture-video-1") {
  const identity = await call("ayet/identity", { method: "POST", token });
  const { externalIdentifier } = await identity.json();
  return {
    status: "success",
    rewarded: true,
    externalIdentifier,
    conversionId,
    currency: 10,
    signature: createHmac("sha1", secret)
      .update(externalIdentifier + "10" + conversionId)
      .digest("hex"),
  };
}

describe("access Worker with migration applied", () => {
  it("grants exactly 24 hours, survives concurrent retries, and expires server-side", async () => {
    const payload = await signed();
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        call("ayet/reward", { method: "POST", payload }),
      ),
    );
    expect(
      responses.map((res) => res.headers.get("X-Grant-Issued")).sort(),
    ).toEqual(["false", "false", "true"]);
    expect(await responses[0].json()).toEqual({
      serverTime: epoch,
      rewardedAvailable: true,
      entitlement: { type: "free_rewarded", expiresAt: epoch + DAY },
    });
    vi.mocked(Date.now).mockReturnValue(epoch + DAY);
    expect((await (await call("status")).json()).entitlement).toBeNull();
    const replay = await call("ayet/reward", { method: "POST", payload });
    expect(replay.headers.get("X-Grant-Issued")).toBe("false");
    expect((await replay.json()).entitlement).toBeNull();
  });

  it("rejects cross-guest replay, invalid signatures, unsigned claims and unknown fields", async () => {
    const payload = await signed();
    for (const modified of [
      { ...payload, signature: "0".repeat(40) },
      { ...payload, rewarded: false },
      { ...payload, status: "failed" },
      { ...payload, custom_1: "unexpected" },
      { complete: true },
      { type: "premium" },
    ]) {
      expect(
        (await call("ayet/reward", { method: "POST", payload: modified }))
          .status,
      ).toBe(403);
    }
    expect(
      (await call("ayet/reward", { method: "POST", payload })).status,
    ).toBe(200);
    const other = "b".repeat(64);
    expect(
      (await call("ayet/reward", { method: "POST", token: other, payload }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("ayet/reward", {
          method: "POST",
          token: other,
          payload: await signed(other),
        })
      ).status,
    ).toBe(403);
  });

  it("labels fallback separately, limits it, and honors the policy switch", async () => {
    const res = await call("fallback", { method: "POST" });
    expect((await res.json()).entitlement).toEqual({
      type: "no_fill_temporary",
      expiresAt: epoch + 3_600_000,
    });
    vi.mocked(Date.now).mockReturnValue(epoch + 3_600_000);
    expect(
      (await (await call("fallback", { method: "POST" })).json()).entitlement,
    ).toBeNull();
    env.NO_FILL_POLICY = "retry";
    expect((await call("fallback", { method: "POST" })).status).toBe(404);
  });

  it("rejects unknown origins and invalid credentials and honors the kill switch and rate limit", async () => {
    expect(
      (await call("status", { site: "https://preview.example" })).status,
    ).toBe(403);
    expect((await call("status", { token: "invalid" })).status).toBe(401);
    env.ACCESS_LIMIT.limit = async () => ({ success: false });
    expect((await call("status")).status).toBe(429);
    env.ACCESS_LIMIT.limit = async () => ({ success: true });
    env.AYET_ENABLED = "false";
    expect((await (await call("status")).json()).rewardedAvailable).toBe(false);
    expect((await call("ayet/identity", { method: "POST" })).status).toBe(503);
    env.AYET_ENABLED = "true";
    env.AYET_DEDICATED_KEY_CONFIRMED = "false";
    expect((await call("fallback", { method: "POST" })).status).toBe(503);
  });
});
