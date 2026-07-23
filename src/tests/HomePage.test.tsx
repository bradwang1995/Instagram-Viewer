import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  getInstagramEmbedAvailability: vi.fn(),
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
vi.mock("../features/embed/instagramOEmbed", () => ({
  getInstagramEmbedAvailability: testState.getInstagramEmbedAvailability,
}));

describe("Photo archive preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
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
    testState.getInstagramEmbedAvailability.mockResolvedValue("available");
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
    expect(screen.queryByText(/local-first photo viewer/i)).not.toBeInTheDocument();
    expect(screen.getByText("Instagram Viewer").closest("a")).toBeNull();
    expect(
      document.querySelector(".archive-header .archive-view-tabs"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reload|refresh/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("INS/ARCHIVE")).not.toBeInTheDocument();
    expect(screen.queryByText("YOUR ARCHIVE")).not.toBeInTheDocument();
  });

  it("keeps view tabs synchronized with URL history navigation", async () => {
    window.history.replaceState({}, "", "/?view=grid");
    render(<HomePage />);
    await act(async () => undefined);

    const horizontalTab = screen.getByRole("button", {
      name: /Horizontal View/,
    });
    const gridTab = screen.getByRole("button", { name: /Grid View/ });
    expect(gridTab).toHaveClass("is-active");
    expect(horizontalTab).not.toHaveClass("is-active");

    const initialHistoryLength = window.history.length;
    fireEvent.click(horizontalTab);
    expect(window.location.search).toBe("?view=horizontal");
    expect(horizontalTab).toHaveClass("is-active");

    fireEvent.click(gridTab);
    expect(window.location.search).toBe("?view=grid");
    expect(gridTab).toHaveClass("is-active");
    expect(window.history.length).toBe(initialHistoryLength + 2);

    const backToHorizontal = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
    });
    window.history.back();
    await act(async () => backToHorizontal);
    expect(window.location.search).toBe("?view=horizontal");
    expect(horizontalTab).toHaveClass("is-active");

    const backToInitialGrid = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
    });
    window.history.back();
    await act(async () => backToInitialGrid);
    expect(window.location.search).toBe("?view=grid");
    expect(gridTab).toHaveClass("is-active");

    const forwardToHorizontal = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
    });
    window.history.forward();
    await act(async () => forwardToHorizontal);
    expect(window.location.search).toBe("?view=horizontal");
    expect(horizontalTab).toHaveClass("is-active");

    const forwardToGrid = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
    });
    window.history.forward();
    await act(async () => forwardToGrid);
    expect(window.location.search).toBe("?view=grid");
    expect(gridTab).toHaveClass("is-active");
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

  it("keeps a dense desktop grid to three bounded four-card rows", async () => {
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

  it("preloads three posts beyond the visible Grid rows with bounded requests", async () => {
    const source = createPost("NETWORKBOUND", "@network.bound", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createUnresolvedQueueItem(source, index),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(3),
    );
    fireEvent.click(screen.getByRole("button", { name: /Grid View/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("archive-media-card")).toHaveLength(12),
    );
    expect(view.container.querySelectorAll("iframe")).toHaveLength(3);

    view.container
      .querySelectorAll("iframe")
      .forEach((frame) => fireEvent.load(frame));
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(6),
    );
    view.container
      .querySelectorAll("iframe")
      .forEach((frame) => fireEvent.load(frame));
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(9),
    );
    view.container
      .querySelectorAll("iframe")
      .forEach((frame) => fireEvent.load(frame));
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(11),
    );
  });

  it("adds slideshow history and advances each known frame before the next post", async () => {
    render(<HomePage />);
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("button", { name: "Slideshow" }));
    expect(window.location.search).toContain("slideshow=1");
    const slideshow = screen.getByRole("region", {
      name: "Slideshow viewer",
    });
    expect(slideshow).toBeInTheDocument();
    expect(within(slideshow).getByText("5s")).toBeInTheDocument();
    expect(DEFAULT_SETTINGS.slideshowIntervalMs).toBe(5_000);
    expect(
      within(slideshow).getByRole("img", {
        name: "@north.archive frame 1 of 2",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    await waitFor(() =>
      expect(
        within(slideshow).getByRole("img", {
          name: "@north.archive frame 2 of 2",
        }),
      ).toBeInTheDocument(),
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        within(slideshow).getByRole("img", {
          name: "@quietframes frame 1 of 1",
        }),
      ).toBeInTheDocument(),
    );

    window.history.replaceState({}, "", "/");
    fireEvent.popState(window);
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Slideshow viewer" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps a slideshow iframe interactive and pauses when it is engaged", async () => {
    const source = createPost("INTERACTIVE", "@interactive", "Saved");
    testState.posts = [source];
    testState.queue = [createUnresolvedQueueItem(source, 0)];

    render(<HomePage />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Slideshow" }));

    const frame = await screen.findByTitle("Instagram preview INTERACTIVE");
    expect(frame).toHaveAttribute("tabindex", "0");
    expect(frame).not.toHaveAttribute("scrolling", "no");
    expect(screen.getByRole("button", { name: "Pause slideshow" })).toBeInTheDocument();

    fireEvent.pointerEnter(frame);
    expect(screen.getByRole("button", { name: "Play slideshow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next post" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTitle("Instagram preview INTERACTIVE")).toBeInTheDocument();
  });

  it("silently removes posts rejected by the official embed check", async () => {
    const blocked = createPost("BLOCKED", "@blocked", "Saved");
    const available = createPost("AVAILABLE", "@available", "Saved");
    testState.posts = [blocked, available];
    testState.queue = [
      createUnresolvedQueueItem(blocked, 0),
      createUnresolvedQueueItem(available, 0),
    ];
    testState.getInstagramEmbedAvailability.mockImplementation((url: string) =>
      Promise.resolve(url.includes("BLOCKED") ? "unavailable" : "available"),
    );

    render(<HomePage />);
    await waitFor(() =>
      expect(
        document.querySelector('[data-media-id="post:BLOCKED:unresolved:0"]'),
      ).not.toBeInTheDocument(),
    );
    expect(
      document.querySelector('[data-media-id="post:AVAILABLE:unresolved:0"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/unavailable|could not display/i),
    ).not.toBeInTheDocument();
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
