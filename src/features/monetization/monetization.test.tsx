import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, readConfig } from "./config";
import { MonetizationGate } from "./index";
import { MOCK_KEY, parseStatus } from "./access/accessClient";
import { playAyet } from "./providers/ayetRewarded";
import {
  chooseInventory,
  reserveInventory,
  type Inventory,
} from "./providers/inventory";
import { createTelemetry, report } from "./telemetry";
import { DAY } from "./types";

const viewer = <div>Existing viewer</div>;
const watch = () => screen.getByRole("button", { name: /Watch an Ad/ });

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "performance",
    ],
  });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  config.mode = "disabled";
  config.premiumInfo = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("monetization entrance", () => {
  it("leaves the viewer untouched with flags off", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<MonetizationGate>{viewer}</MonetizationGate>);
    expect(screen.getByText("Existing viewer")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Watch an Ad/ })).toBeNull();
    expect(document.querySelector("script[src*='ayet']")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("unlocks once on rapid clicks, restores on remount and re-gates at expiry", async () => {
    config.mode = "mock";
    const { unmount } = render(<MonetizationGate>{viewer}</MonetizationGate>);
    expect(screen.getByRole("heading")).toHaveFocus();
    act(() => {
      watch().click();
      watch().click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(screen.getByText("Existing viewer")).toBeVisible();
    expect(JSON.parse(localStorage.getItem(MOCK_KEY)!).expiresAt).toBe(
      Date.now() + DAY,
    );
    unmount();
    render(<MonetizationGate>{viewer}</MonetizationGate>);
    expect(screen.getByText("Existing viewer")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Access status" }));
    expect(screen.getByText("24h 0m remaining")).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(DAY);
    });
    expect(watch()).toBeEnabled();
  });

  it.each([
    ["complete", "The video ended without a verified reward."],
    ["blocked", "The video service could not load."],
    ["unavailable", "The video is unavailable"],
    ["cancelled", "The video was cancelled."],
    ["verification", "We couldn’t verify the reward."],
  ])("keeps the gate after %s", async (outcome, message) => {
    config.mode = "mock";
    render(<MonetizationGate>{viewer}</MonetizationGate>);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: outcome },
    });
    fireEvent.click(watch());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(localStorage.getItem(MOCK_KEY)).toBeNull();
  });

  it.each(["no_fill", "cap"])(
    "provides separately labelled temporary access for %s",
    async (outcome) => {
      config.mode = "mock";
      render(<MonetizationGate>{viewer}</MonetizationGate>);
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: outcome },
      });
      fireEvent.click(watch());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fireEvent.click(screen.getByRole("button", { name: "Access status" }));
      expect(
        screen.getByText("Temporary access", { exact: true }),
      ).toBeVisible();
    },
  );

  it("does not use a premium fixture in local storage and supports Escape cancellation", async () => {
    config.mode = "mock";
    config.premiumInfo = true;
    localStorage.setItem(
      MOCK_KEY,
      JSON.stringify({ type: "premium", expiresAt: Date.now() + DAY }),
    );
    render(<MonetizationGate>{viewer}</MonetizationGate>);
    fireEvent.click(
      screen.getByRole("button", { name: "Premium — Coming later" }),
    );
    expect(screen.queryByText("Existing viewer")).toBeNull();
    fireEvent.click(watch());
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), {
      key: "Escape",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(watch()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
    expect(
      parseStatus({
        serverTime: 1,
        entitlement: { type: "premium", expiresAt: 2 },
      }).entitlement?.type,
    ).toBe("premium");
  });
});

describe("vendor adapters", () => {
  it.each([false, true])(
    "treats completion independently of delayed reward (%s)",
    async (rewarded) => {
      const sdk: NonNullable<Window["AyetVideoSdk"]> = {
        init: vi.fn(),
        requestAd: (_slot, success) => success(),
        isAdAvailable: () => true,
        playFullsizeAd: vi.fn(),
        destroy: vi.fn(),
      };
      const operation = playAyet(
        sdk,
        "fixture",
        new AbortController().signal,
        vi.fn(),
      );
      sdk.callbackComplete?.();
      if (rewarded) sdk.callbackRewarded?.({ signed: "fixture" });
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await operation).toEqual(
        rewarded ? { reward: { signed: "fixture" } } : { failure: "complete" },
      );
      expect(sdk.destroy).toHaveBeenCalledTimes(1);
      expect(sdk.callbackRewarded).toBeUndefined();
    },
  );

  it("requires a configured production origin and rejects preview hosts and missing IDs", () => {
    const env = {
      PROD: true,
      VITE_MONETIZATION_ENABLED: "true",
      VITE_AD_MODE: "rewarded",
      VITE_AYET_ENABLED: "true",
      VITE_MONETIZATION_SITE_ORIGIN: "https://viewer.example",
      VITE_MONETIZATION_API_ORIGIN: "https://access.example",
      VITE_AYET_PLACEMENT_ID: "12",
      VITE_AYET_REWARDED_ADSLOT: "fixture",
    };
    expect(readConfig(env, "https://viewer.example").mode).toBe("live");
    expect(readConfig(env, "https://branch.pages.dev").mode).toBe("disabled");
    expect(
      readConfig(
        { ...env, VITE_AYET_PLACEMENT_ID: "" },
        "https://viewer.example",
      ).mode,
    ).toBe("disabled");
  });

  it("picks one eligible provider deterministically and shares a frequency cap", () => {
    const units: Inventory[] = [
      {
        provider: "adsterra",
        unitId: "fixture",
        format: "popunder",
        approvedHtml: "<p>fixture</p>",
      },
      {
        provider: "exoclick",
        zoneId: "1",
        format: "popunder",
        approvedHtml: "<p>fixture</p>",
        category: "mainstream",
      },
    ];
    const context = {
      production: true,
      surface: "entrance" as const,
      entitled: false,
      adultAdsEnabled: false,
      approvedAdultAudienceAndSite: true,
      adsterra: true,
      exoclick: true,
      consent: {
        rewarded: false,
        analytics: false,
        adult: true,
        adsterra: true,
        exoclick: true,
      },
    };
    expect(chooseInventory(units, context, "guest", true)).toBe(
      chooseInventory(units, context, "guest", true),
    );
    expect(chooseInventory(units, context, "guest")).toBe(units[0]);
    expect(
      chooseInventory(
        [{ ...units[1], category: "adult" } as Inventory],
        context,
        "guest",
      ),
    ).toBeNull();
    expect(
      chooseInventory(units, { ...context, surface: "viewer" }, "guest"),
    ).toBeNull();
    expect(
      chooseInventory(units, { ...context, entitled: true }, "guest"),
    ).toBeNull();
    expect(reserveInventory(localStorage, 1, DAY)).toBe(true);
    expect(reserveInventory(localStorage, 2, DAY)).toBe(false);
  });

  it("counts only consented event names and requires dashboard revenue", () => {
    let consent = false;
    const metrics = createTelemetry(() => consent);
    metrics.record("watch_clicked");
    consent = true;
    metrics.record("watch_clicked");
    metrics.record("ad_no_fill");
    expect(metrics.snapshot()).toEqual({ watch_clicked: 1, ad_no_fill: 1 });
    expect(report(metrics.snapshot())).toMatchObject({
      noFillRate: 1,
      revenuePer1000Visits: null,
    });
  });
});
