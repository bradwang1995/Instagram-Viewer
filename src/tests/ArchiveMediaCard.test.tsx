import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveMediaCard } from "../components/archive/ArchiveMediaCard";
import type { MediaItem, SavedPost } from "../db/schema";
import type { MediaQueueItem } from "../features/media/mediaQueue";

describe("ArchiveMediaCard", () => {
  afterEach(() => vi.useRealTimers());

  it("falls back from the asset to the preview and remembers a terminal failure", () => {
    const item = createItem("fallback-test");
    const first = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );

    const asset = first.container.querySelector("img");
    expect(asset).toHaveAttribute("src", "https://example.com/asset.jpg");
    fireEvent.error(asset as HTMLImageElement);
    expect(first.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/preview.jpg",
    );
    fireEvent.error(first.container.querySelector("img") as HTMLImageElement);
    expect(
      screen.getByRole("img", { name: "Photo unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View photo from @tester" }),
    ).toBeInTheDocument();

    first.unmount();
    const remounted = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );
    expect(remounted.container.querySelector("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Photo unavailable" }),
    ).toBeInTheDocument();
  });

  it("retries a stable media ID when its resource URLs change", () => {
    const item = createItem("revised-url");
    const first = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.error(first.container.querySelector("img") as HTMLImageElement);
    fireEvent.error(first.container.querySelector("img") as HTMLImageElement);
    expect(screen.getByRole("img", { name: "Photo unavailable" })).toBeInTheDocument();
    first.unmount();

    const revised = createItem("revised-url");
    revised.media.assetUrl = "https://example.com/revised.jpg";
    revised.media.previewUrl = undefined;
    const second = render(
      <ArchiveMediaCard
        item={revised}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );
    expect(second.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/revised.jpg",
    );
  });

  it("starts no more than two compatibility iframe requests at once", () => {
    const items = Array.from({ length: 5 }, (_, index) => {
      const item = createItem(`embed-${index}`);
      item.media.sourceKind = "embed";
      item.media.assetUrl = undefined;
      item.media.previewUrl = undefined;
      return item;
    });
    const view = render(
      <div>
        {items.map((item, index) => (
          <ArchiveMediaCard
            key={item.media.id}
            item={item}
            index={index}
            selected={index === 0}
            allowCompatibilityPreview
            layoutStyle={{ width: 400, height: 500 }}
            onSelect={vi.fn()}
          />
        ))}
      </div>,
    );

    expect(view.container.querySelectorAll("iframe")).toHaveLength(2);
  });

  it("unmounts timed-out embeds, keeps the request window bounded, and remembers failures", () => {
    vi.useFakeTimers();
    const items = Array.from({ length: 5 }, (_, index) => {
      const item = createItem(`timeout-${index}`);
      item.media.sourceKind = "embed";
      item.media.assetUrl = undefined;
      item.media.previewUrl = undefined;
      return item;
    });
    const view = render(
      <div>
        {items.map((item, index) => (
          <ArchiveMediaCard
            key={item.media.id}
            item={item}
            index={index}
            selected={index === 0}
            allowCompatibilityPreview
            layoutStyle={{ width: 400, height: 500 }}
            onSelect={vi.fn()}
          />
        ))}
      </div>,
    );

    expect(view.container.querySelectorAll("iframe")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(12_000));
    expect(view.container.querySelectorAll("iframe")).toHaveLength(2);
    expect(
      screen.getAllByRole("img", { name: "Photo unavailable" }),
    ).toHaveLength(2);

    act(() => vi.advanceTimersByTime(12_000));
    expect(view.container.querySelectorAll("iframe")).toHaveLength(1);
    expect(
      screen.getAllByRole("img", { name: "Photo unavailable" }),
    ).toHaveLength(4);

    act(() => vi.advanceTimersByTime(12_000));
    expect(view.container.querySelectorAll("iframe")).toHaveLength(0);
    expect(
      screen.getAllByRole("img", { name: "Photo unavailable" }),
    ).toHaveLength(5);

    view.unmount();
    const remounted = render(
      <ArchiveMediaCard
        item={items[0]}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );
    expect(remounted.container.querySelector("iframe")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Photo unavailable" }),
    ).toBeInTheDocument();
  });

  it("does not request a deferred compatibility preview until it is enabled", () => {
    const item = createItem("deferred-embed");
    item.media.sourceKind = "embed";
    item.media.assetUrl = undefined;
    item.media.previewUrl = undefined;
    const view = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview={false}
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );
    expect(view.container.querySelector("iframe")).not.toBeInTheDocument();

    view.rerender(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );
    expect(view.container.querySelector("iframe")).toBeInTheDocument();

    view.rerender(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview={false}
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
      />,
    );
    expect(view.container.querySelector("iframe")).not.toBeInTheDocument();
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
