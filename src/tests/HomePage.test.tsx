import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type MediaItem, type SavedPost } from "../db/schema";
import type { MediaQueueItem } from "../features/media/mediaQueue";
import { HomePage } from "../pages/HomePage";

const testState = vi.hoisted(() => ({
  posts: [] as SavedPost[],
  queue: [] as MediaQueueItem[],
  refresh: vi.fn(),
  setMediaVisibility: vi.fn(),
}));

vi.mock("../hooks/useMediaLibrary", () => ({
  useMediaLibrary: () => ({
    posts: testState.posts,
    queue: testState.queue,
    isLoading: false,
    error: undefined,
    isDemo: true,
    refresh: testState.refresh,
  }),
}));
vi.mock("../db/mediaRepository", () => ({
  setMediaVisibility: testState.setMediaVisibility,
  restoreAllMedia: vi.fn(),
}));
vi.mock("../db/settingsRepository", () => ({
  getSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
  updateSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
}));
vi.mock("../db/postRepository", () => ({ clearLocalDatabase: vi.fn() }));
vi.mock("../features/import/importJson", () => ({
  importSavedPostsJsonFile: vi.fn(),
}));
vi.mock("../features/slideshow/shuffle", () => ({
  shuffleArray: <T,>(items: T[]) => [...items].reverse(),
}));

describe("Photo archive preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1080,
    });
    const first = createPost("A", "@north.archive", "Night drives");
    const second = createPost("B", "@quietframes", "Landscapes");
    testState.posts = [first, second];
    testState.queue = [
      createQueueItem(first, 0, 2),
      createQueueItem(first, 1, 2),
      createQueueItem(second, 0, 1),
    ];
    testState.refresh.mockResolvedValue(undefined);
    testState.setMediaVisibility.mockResolvedValue(undefined);
  });

  it("shows each media item as a separate, control-free photo card", async () => {
    render(<HomePage />);
    await act(async () => undefined);

    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(3);
    const secondFrame = screen.getAllByRole("button", {
      name: "View photo from @north.archive",
    })[1];
    fireEvent.click(secondFrame);

    const selectedCard = secondFrame.closest("article");
    expect(selectedCard).toHaveClass("is-selected");
    expect(
      screen.queryByRole("button", { name: "Hide this media" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open source on Instagram" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Instagram Viewer")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Horizontal View/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Grid View/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("INS/ARCHIVE")).not.toBeInTheDocument();
    expect(screen.queryByText("YOUR ARCHIVE")).not.toBeInTheDocument();
  });

  it("filters the visual field by creator", async () => {
    render(<HomePage />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByLabelText("Creator"), {
      target: { value: "@quietframes" },
    });
    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(1);
    expect(screen.queryByText(/media · .*sources/)).not.toBeInTheDocument();
  });

  it("shows the import-first landing when the library is empty", async () => {
    testState.posts = [];
    testState.queue = [];
    render(<HomePage />);
    await act(async () => undefined);

    expect(screen.getByText("Import saved posts")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Choose Instagram saved posts JSON file",
      }),
    ).toBeInTheDocument();
  });

  it("keeps a large desktop grid to twelve mounted cards and reaches the end", async () => {
    const source = createPost("LONG", "@long.library", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createQueueItem(source, index, 100),
    );
    render(<HomePage />);
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("button", { name: /Grid View/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("archive-media-card")).toHaveLength(12),
    );

    const scroller = screen.getByTestId("archive-scroller");
    scroller.scrollTop = Number.MAX_SAFE_INTEGER;
    fireEvent.scroll(scroller);
    await waitFor(() =>
      expect(
        document.querySelector('[data-media-id="post:LONG:media:99"]'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getAllByTestId("archive-media-card").length,
    ).toBeLessThanOrEqual(12);
  });

  it("does not request compatibility embeds for the Grid preload rows", async () => {
    const source = createPost("NETWORKBOUND", "@network.bound", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createUnresolvedQueueItem(source, index),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    expect(view.container.querySelectorAll("iframe")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Grid View/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("archive-media-card")).toHaveLength(12),
    );
    expect(view.container.querySelectorAll("iframe")).toHaveLength(2);

    view.container
      .querySelectorAll("iframe")
      .forEach((frame) => fireEvent.load(frame));
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(4),
    );
  });
});

function createPost(
  shortcode: string,
  creator: string,
  collection: string,
): SavedPost {
  const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;
  return {
    id: `post:${shortcode}`,
    url: canonicalUrl,
    canonicalUrl,
    shortcode,
    savedAt: "2026-01-20T12:00:00.000Z",
    importedAt: "2026-01-20T12:00:00.000Z",
    updatedAt: "2026-01-20T12:00:00.000Z",
    collectionNames: [collection],
    sourceFilePaths: ["test.json"],
    sourceFormat: "json",
    localTags: [],
    embedAuthorName: creator,
    status: "unknown",
  };
}

function createQueueItem(
  post: SavedPost,
  sourceIndex: number,
  sourceCount: number,
): MediaQueueItem {
  const media: MediaItem = {
    id: `${post.id}:media:${sourceIndex}`,
    sourcePostId: post.id,
    sourceIndex,
    type: "image",
    sourceKind: "demo",
    creatorHandle: post.embedAuthorName,
    caption: `${post.embedAuthorName} frame ${sourceIndex + 1} of ${sourceCount}`,
    previewUrl: `https://example.com/${post.shortcode}-${sourceIndex}.jpg`,
    assetUrl: `https://example.com/${post.shortcode}-${sourceIndex}.jpg`,
    createdAt: post.importedAt,
    updatedAt: post.updatedAt,
  };
  return { media, post };
}

function createUnresolvedQueueItem(
  post: SavedPost,
  sourceIndex: number,
): MediaQueueItem {
  const media: MediaItem = {
    id: `${post.id}:unresolved:${sourceIndex}`,
    sourcePostId: post.id,
    sourceIndex,
    type: "image",
    sourceKind: "embed",
    creatorHandle: post.embedAuthorName,
    createdAt: post.importedAt,
    updatedAt: post.updatedAt,
  };
  return { media, post };
}
