import { afterEach, describe, expect, it, vi } from "vitest";
import { getInstagramEmbedAvailability } from "../features/embed/instagramOEmbed";

describe("Instagram tokenless oEmbed availability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts an embeddable post", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getInstagramEmbedAvailability("https://www.instagram.com/p/available-a/"),
    ).resolves.toBe("available");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "graph.facebook.com/v25.0/instagram_oembed",
    );
  });

  it("rejects a post that Meta reports as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );

    await expect(
      getInstagramEmbedAvailability(
        "https://www.instagram.com/p/unavailable-b/",
      ),
    ).resolves.toBe("unavailable");
  });

  it("falls back to the iframe on transient validation failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://www.instagram.com/p/transient-c/";

    await expect(getInstagramEmbedAvailability(url)).resolves.toBe("unknown");
    await expect(getInstagramEmbedAvailability(url)).resolves.toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
