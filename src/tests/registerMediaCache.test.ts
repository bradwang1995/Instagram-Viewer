import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMediaCache } from "../features/media/registerMediaCache";

describe("media cache registration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers the cache-first image worker once at the app base path", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { serviceWorker: { register } });

    registerMediaCache();
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();

    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("/media-cache-sw.js", {
      scope: "/",
    });

    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledOnce();
  });

  it("does nothing when service workers are unavailable", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    vi.stubGlobal("navigator", {});

    registerMediaCache();

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
