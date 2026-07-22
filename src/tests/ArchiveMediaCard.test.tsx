import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveMediaCard } from "../components/archive/ArchiveMediaCard";
import type { MediaItem, SavedPost } from "../db/schema";
import { getInstagramEmbedAvailability } from "../features/embed/instagramOEmbed";
import type { MediaQueueItem } from "../features/media/mediaQueue";

vi.mock("../features/embed/instagramOEmbed", () => ({
  getInstagramEmbedAvailability: vi.fn(),
}));

const mockGetInstagramEmbedAvailability = vi.mocked(
  getInstagramEmbedAvailability,
);

describe("ArchiveMediaCard", () => {
  beforeEach(() => {
    mockGetInstagramEmbedAvailability.mockResolvedValue("available");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("falls back from the asset to the preview and remembers a terminal failure", () => {
    const item = createItem("fallback-test");
    const onUnavailable = vi.fn();
    const first = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
        onUnavailable={onUnavailable}
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
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(first.container).toBeEmptyDOMElement();

    first.unmount();
    const remounted = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
        onUnavailable={onUnavailable}
      />,
    );
    expect(remounted.container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it("retries a stable media ID when its resource URLs change", () => {
    const item = createItem("revised-url");
    const onUnavailable = vi.fn();
    const first = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
        onUnavailable={onUnavailable}
      />,
    );
    fireEvent.error(first.container.querySelector("img") as HTMLImageElement);
    fireEvent.error(first.container.querySelector("img") as HTMLImageElement);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
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
        onUnavailable={vi.fn()}
      />,
    );
    expect(second.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/revised.jpg",
    );
  });

  it("starts no more than two compatibility iframe requests at once", async () => {
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
            onUnavailable={vi.fn()}
          />
        ))}
      </div>,
    );

    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(2),
    );
  });

  it("silently omits timed-out embeds, keeps the request window bounded, and remembers failures", async () => {
    vi.useFakeTimers();
    const onUnavailable = vi.fn();
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
            onUnavailable={onUnavailable}
          />
        ))}
      </div>,
    );

    await act(async () => undefined);
    expect(view.container.querySelectorAll("iframe")).toHaveLength(2);
    await act(async () => vi.advanceTimersByTime(12_000));
    expect(view.container.querySelectorAll("iframe")).toHaveLength(2);
    expect(onUnavailable).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(12_000));
    expect(view.container.querySelectorAll("iframe")).toHaveLength(1);
    expect(onUnavailable).toHaveBeenCalledTimes(4);

    await act(async () => vi.advanceTimersByTime(12_000));
    expect(view.container.querySelectorAll("iframe")).toHaveLength(0);
    expect(onUnavailable).toHaveBeenCalledTimes(5);

    view.unmount();
    const remounted = render(
      <ArchiveMediaCard
        item={items[0]}
        index={0}
        selected={false}
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
        onUnavailable={onUnavailable}
      />,
    );
    expect(remounted.container.querySelector("iframe")).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it("does not request a deferred compatibility preview until it is enabled", async () => {
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
        onUnavailable={vi.fn()}
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
        onUnavailable={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(view.container.querySelector("iframe")).toBeInTheDocument(),
    );

    view.rerender(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected={false}
        allowCompatibilityPreview={false}
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
        onUnavailable={vi.fn()}
      />,
    );
    expect(view.container.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("silently rejects a post that the official oEmbed endpoint marks unavailable", async () => {
    mockGetInstagramEmbedAvailability.mockResolvedValueOnce("unavailable");
    const item = createItem("private-post");
    item.media.sourceKind = "embed";
    item.media.assetUrl = undefined;
    item.media.previewUrl = undefined;
    const onUnavailable = vi.fn();
    const view = render(
      <ArchiveMediaCard
        item={item}
        index={0}
        selected
        allowCompatibilityPreview
        layoutStyle={{ width: 400, height: 500 }}
        onSelect={vi.fn()}
        onUnavailable={onUnavailable}
      />,
    );

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(view.container.querySelector("iframe")).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable|error/i)).not.toBeInTheDocument();
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
