import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchiveMediaCard } from "../components/archive/ArchiveMediaCard";
import type { MediaItem, SavedPost } from "../db/schema";
import type { MediaQueueItem } from "../features/media/mediaQueue";

function card(item: MediaQueueItem, onUnavailable = vi.fn(), loadMedia = true) {
  return (
    <ArchiveMediaCard
      item={item}
      index={0}
      selected={false}
      loadMedia={loadMedia}
      layoutStyle={{ width: 400, height: 500 }}
      onSelect={vi.fn()}
      onUnavailable={onUnavailable}
    />
  );
}
describe("ArchiveMediaCard direct images", () => {
  it.each(["remount", "resume"])(
    "revalidates cached successes before displaying after %s",
    (mode) => {
      const item = createItem(`revalidate-${mode}`);
      item.media.previewUrl = undefined;
      const unavailable = vi.fn();
      let view = render(card(item, unavailable));
      const first = view.container.querySelector("img")!;
      Object.defineProperties(first, {
        complete: { configurable: true, value: true },
        naturalWidth: { configurable: true, value: 1080 },
        naturalHeight: { configurable: true, value: 1350 },
      });
      fireEvent.load(first);
      expect(first.style.visibility).toBe("");
      if (mode === "remount") {
        view.unmount();
        view = render(card(item, unavailable));
      } else {
        view.rerender(card(item, unavailable, false));
        view.rerender(card(item, unavailable));
      }
      const replacement = view.container.querySelector("img")!;
      expect(replacement.style.visibility).toBe("hidden");
      Object.defineProperties(replacement, {
        naturalWidth: { configurable: true, value: 320 },
        naturalHeight: { configurable: true, value: 400 },
      });
      fireEvent.load(replacement);
      expect(view.container.querySelector("img")).toBeNull();
      expect(unavailable).toHaveBeenCalledTimes(1);
    },
  );
  it("reuses a resolved URL across window activation but refreshes it when the source changes", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const code = url.split("/p/")[1].split("/")[0];
      return new Response(
        JSON.stringify({
          type: "Note",
          id: `https://oginstagram.com/p/${code}/1`,
          content: "",
          attachment: [
            {
              mediaType: "image/jpeg",
              url: `https://scontent.cdninstagram.com/${code}.jpg`,
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const item = createItem("Reuse-Metadata");
    item.media.assetUrl = undefined;
    item.media.previewUrl = undefined;
    try {
      const view = render(card(item));
      await waitFor(() =>
        expect(view.container.querySelector("img")).toHaveAttribute(
          "src",
          "https://scontent.cdninstagram.com/Reuse-Metadata.jpg",
        ),
      );
      view.rerender(card(item, undefined, false));
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60000);
      view.rerender(card(item));
      await act(async () => undefined);
      expect(fetcher).toHaveBeenCalledTimes(1);
      view.rerender(card(item, undefined, false));
      clock.mockReturnValue(Date.now() + 600000);
      view.rerender(card(item));
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      clock.mockRestore();
      view.rerender(
        card({
          ...item,
          post: { ...item.post, shortcode: "Revised-Metadata" },
        }),
      );
      await waitFor(() =>
        expect(view.container.querySelector("img")).toHaveAttribute(
          "src",
          "https://scontent.cdninstagram.com/Revised-Metadata.jpg",
        ),
      );
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
  it("rejects a low-resolution source instead of displaying a small fallback", () => {
    const item = createItem("resolution");
    item.media.previewUrl = undefined;
    const onUnavailable = vi.fn();
    const view = render(card(item, onUnavailable));
    const image = view.container.querySelector("img")!;
    Object.defineProperties(image, {
      naturalWidth: { value: 320 },
      naturalHeight: { value: 341 },
    });
    fireEvent.load(image);
    expect(view.container.querySelector("img")).toBeNull();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
  it("tries the asset then the preview and reports a terminal failure once", () => {
    const onUnavailable = vi.fn();
    const view = render(card(createItem("fallback"), onUnavailable));
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/asset.jpg",
    );
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/preview.jpg",
    );
    fireEvent.error(view.container.querySelector("img")!);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector("iframe")).toBeNull();
  });
  it("retries when its URLs change", () => {
    const item = createItem("revised");
    const view = render(card(item));
    fireEvent.error(view.container.querySelector("img")!);
    fireEvent.error(view.container.querySelector("img")!);
    view.rerender(
      card({
        ...item,
        media: { ...item.media, assetUrl: "https://example.com/new.jpg" },
      }),
    );
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/new.jpg",
    );
  });
  it("uses the indexed media service for unresolved posts without an iframe or oEmbed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "Note",
            id: "https://oginstagram.com/p/Unresolved/3",
            content: "",
            attachment: [
              {
                mediaType: "image/jpeg",
                url: "https://scontent.cdninstagram.com/photo.jpg",
              },
            ],
          }),
        ),
      ),
    );
    const item = createItem("Unresolved");
    item.media.assetUrl = undefined;
    item.media.previewUrl = undefined;
    item.media.sourceIndex = 2;
    const view = render(card(item));
    await waitFor(() =>
      expect(view.container.querySelector("img")).toHaveAttribute(
        "src",
        "https://scontent.cdninstagram.com/photo.jpg",
      ),
    );
    vi.unstubAllGlobals();
    expect(view.container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.load(view.container.querySelector("img")!);
    expect(screen.queryByRole("status")).toBeNull();
    const image = view.container.querySelector("img")!;
    Object.defineProperty(image, "complete", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 1000,
    });
    view.rerender(card({ ...item, media: { ...item.media } }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
  it("defers requests outside the active zone and preserves the image after activation", () => {
    const item = createItem("deferred");
    const view = render(card(item, undefined, false));
    expect(view.container.querySelector("img")).toBeNull();
    view.rerender(card(item));
    const image = view.container.querySelector("img");
    view.rerender(card(item));
    expect(view.container.querySelector("img")).toBe(image);
  });
  it("opens the post using click or Enter", () => {
    const item = createItem("keyboard"),
      onSelect = vi.fn();
    render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        layoutStyle={{}}
        onSelect={onSelect}
        onUnavailable={vi.fn()}
      />,
    );
    const hit = screen.getByRole("button", { name: "Open post keyboard" });
    fireEvent.click(hit);
    fireEvent.keyDown(hit, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

function createItem(id: string): MediaQueueItem {
  const canonicalUrl = `https://www.instagram.com/p/${id}/`;
  const timestamp = "2026-07-15T00:00:00.000Z";
  const post: SavedPost = {
    id: `post:${id}`,
    url: canonicalUrl,
    canonicalUrl,
    shortcode: id,
    importedAt: timestamp,
    updatedAt: timestamp,
    collectionNames: [],
    sourceFilePaths: ["test.json"],
    sourceFormat: "json",
    localTags: [],
    embedAuthorName: "@tester",
    status: "unknown",
  };
  const media: MediaItem = {
    id: `media:${id}`,
    sourcePostId: post.id,
    sourceIndex: 0,
    type: "image",
    sourceKind: "remote",
    creatorHandle: "@tester",
    assetUrl: "https://example.com/asset.jpg",
    previewUrl: "https://example.com/preview.jpg",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { post, media };
}
