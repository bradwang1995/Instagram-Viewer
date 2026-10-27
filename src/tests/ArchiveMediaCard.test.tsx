import { fireEvent, render, screen } from "@testing-library/react";
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
  it("uses the indexed media service for unresolved posts without an iframe or oEmbed", () => {
    const item = createItem("Unresolved");
    item.media.assetUrl = undefined;
    item.media.previewUrl = undefined;
    item.media.sourceIndex = 2;
    const view = render(card(item));
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://d.oginstagram.com/p/Unresolved/?img_index=3",
    );
    expect(view.container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.load(view.container.querySelector("img")!);
    expect(screen.queryByRole("status")).toBeNull();
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
