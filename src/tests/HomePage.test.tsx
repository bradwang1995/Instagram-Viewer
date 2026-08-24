import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
let observedRootMargins: string[] = [];

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
    observedRootMargins = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          _callback: IntersectionObserverCallback,
          options?: IntersectionObserverInit,
        ) {
          observedRootMargins.push(options?.rootMargin ?? "");
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver,
    );
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows each media item as a separate, control-free photo card", async () => {
    render(<HomePage />);
    await act(async () => undefined);

    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(3);
    const unselectedCard = screen
      .getAllByTestId("archive-media-card")
      .find((card) => !card.classList.contains("is-selected"));
    const secondFrame = unselectedCard?.querySelector(
      ".archive-card-hit",
    ) as HTMLElement;
    expect(secondFrame).not.toHaveAttribute("role");
    expect(secondFrame).not.toHaveAttribute("tabindex");
    fireEvent.keyDown(secondFrame, { key: "Enter" });
    expect(secondFrame.closest("article")).not.toHaveClass("is-selected");
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
      screen.getByRole("tab", { name: /Horizontal View/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Grid View/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Slideshow" })).toBeInTheDocument();
    expect(
      screen.queryByText(/local-first photo viewer/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Instagram Viewer").closest("a")).toBeNull();
    expect(
      document.querySelector(".archive-header .archive-view-tabs"),
    ).toBeInTheDocument();
    [
      screen.getByRole("tab", { name: /Horizontal View/ }),
      screen.getByRole("tab", { name: /Grid View/ }),
      screen.getByRole("tab", { name: "Slideshow" }),
      screen.getByRole("button", { name: "Import JSON" }),
    ].forEach((control) => expect(control).toHaveClass("viewer-control"));
    expect(
      screen.queryByRole("button", { name: "Filter" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Start time" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "End time" }),
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

    const horizontalTab = screen.getByRole("tab", {
      name: /Horizontal View/,
    });
    const gridTab = screen.getByRole("tab", { name: /Grid View/ });
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

  it("uses a one-screen IntersectionObserver margin in both layouts", async () => {
    render(<HomePage />);
    await waitFor(() =>
      expect(observedRootMargins).toContain("0px 100% 0px 0px"),
    );

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    await waitFor(() =>
      expect(observedRootMargins).toContain("0px 0px 100% 0px"),
    );
  });

  it("shares the date range across Horizontal, Grid, and Slideshow", async () => {
    const laterDate = "2026-03-20T12:00:00.000Z";
    testState.posts[1] = {
      ...testState.posts[1],
      savedAt: laterDate,
      importedAt: laterDate,
      updatedAt: laterDate,
    };
    testState.queue[2] = createQueueItem(testState.posts[1], 0, 1);

    render(<HomePage />);
    await act(async () => undefined);

    fireEvent.change(screen.getByRole("slider", { name: "Start time" }), {
      target: { value: "1" },
    });
    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(3);
    expect(
      document.querySelectorAll('[data-media-visibility="visible"]'),
    ).toHaveLength(3);
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-media-visibility="visible"]'),
      ).toHaveLength(1),
    );
    expect(
      document.querySelectorAll('[data-media-visibility="visible"]'),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-media-visibility="filtered"]'),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    expect(
      document.querySelectorAll('[data-media-visibility="visible"]'),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));
    const slideshow = screen.getByRole("region", {
      name: "Slideshow viewer",
    });
    expect(
      within(slideshow).getByRole("slider", { name: "Start time" }),
    ).toHaveValue("1");
    await waitFor(() =>
      expect(
        slideshow.querySelector('[data-slideshow-slot="0"]'),
      ).toHaveAttribute("data-media-id", testState.queue[2].media.id),
    );
    await waitFor(() =>
      expect(
        within(slideshow).getByTitle("Instagram preview B"),
      ).toBeInTheDocument(),
    );
  });

  it("keeps filter feedback immediate but applies the queue at exactly 300ms", async () => {
    const laterDate = "2026-03-20T12:00:00.000Z";
    testState.posts[1] = {
      ...testState.posts[1],
      savedAt: laterDate,
      importedAt: laterDate,
      updatedAt: laterDate,
    };
    testState.queue[2] = createQueueItem(testState.posts[1], 0, 1);
    render(<HomePage />);
    await act(async () => undefined);
    vi.useFakeTimers();

    const startTime = screen.getByRole("slider", { name: "Start time" });
    fireEvent.change(startTime, { target: { value: "1" } });

    expect(startTime).toHaveValue("1");
    expect(
      document.querySelectorAll('[data-media-visibility="visible"]'),
    ).toHaveLength(3);

    act(() => vi.advanceTimersByTime(299));
    expect(
      document.querySelectorAll('[data-media-visibility="visible"]'),
    ).toHaveLength(3);

    act(() => vi.advanceTimersByTime(1));
    expect(
      document.querySelectorAll('[data-media-visibility="visible"]'),
    ).toHaveLength(1);
  });

  it("visually date-filters an activated iframe without destroying it", async () => {
    const first = createPost("FILTER-A", "@keep.frame", "Saved");
    const laterDate = "2026-03-20T12:00:00.000Z";
    const second = {
      ...createPost("FILTER-B", "@other.frame", "Saved"),
      savedAt: laterDate,
      importedAt: laterDate,
      updatedAt: laterDate,
    };
    testState.posts = [first, second];
    testState.queue = [
      createUnresolvedQueueItem(first, 0),
      createUnresolvedQueueItem(second, 0),
    ];
    const view = render(<HomePage />);
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(2),
    );
    const retainedFrame = view.container.querySelector(
      'iframe[data-instagram-id="post:FILTER-A:unresolved:0"]',
    );

    fireEvent.change(screen.getByRole("slider", { name: "Start time" }), {
      target: { value: "1" },
    });

    await waitFor(() =>
      expect(
        retainedFrame?.closest('[data-media-visibility="filtered"]'),
      ).toBeInTheDocument(),
    );
    expect(retainedFrame).toBeInTheDocument();
    expect(
      retainedFrame?.closest('[data-media-visibility="filtered"]'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Start time" }), {
      target: { value: "0" },
    });
    await waitFor(() =>
      expect(
        view.container.querySelector(
          'iframe[data-instagram-id="post:FILTER-A:unresolved:0"]',
        ),
      ).toBe(retainedFrame),
    );
  });

  it("preserves iframe DOM identity when source items are reordered", async () => {
    const first = createPost("SORT-A", "@sort.a", "Saved");
    const second = createPost("SORT-B", "@sort.b", "Saved");
    const third = createPost("SORT-C", "@sort.c", "Saved");
    testState.posts = [first, second, third];
    testState.queue = [first, second, third].map((post) =>
      createUnresolvedQueueItem(post, 0),
    );
    const view = render(<HomePage />);
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(3),
    );
    const originalFrames = new Map(
      Array.from(view.container.querySelectorAll("iframe")).map((frame) => [
        frame.dataset.instagramId,
        frame,
      ]),
    );

    testState.queue = [...testState.queue].reverse();
    view.rerender(<HomePage />);

    originalFrames.forEach((frame, itemId) => {
      expect(
        view.container.querySelector(`iframe[data-instagram-id="${itemId}"]`),
      ).toBe(frame);
    });
  });

  it("shows the import-first landing when the library is empty", async () => {
    testState.posts = [];
    testState.queue = [];
    render(<HomePage />);
    await act(async () => undefined);

    expect(screen.getByText("Import saved posts")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Instagram Viewer" }),
    ).toHaveTextContent("InstagramViewer");
    expect(screen.queryByText("INSTAGRAM")).not.toBeInTheDocument();
    expect(screen.queryByText("VIEWER")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Choose Instagram saved posts JSON file",
      }),
    ).toBeInTheDocument();
  });

  it("keeps every Grid card shell mounted while only activating the preload zone", async () => {
    const source = createPost("LONG", "@long.library", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createQueueItem(source, index, 100),
    );
    render(<HomePage />);
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("archive-media-card")).toHaveLength(100),
    );
    expect(screen.getByTestId("archive-scroller")).toHaveAttribute(
      "data-rendered-count",
      "100",
    );
    expect(
      document.querySelectorAll('[data-media-load="paused"]').length,
    ).toBeGreaterThan(0);

    const scroller = screen.getByTestId("archive-scroller");
    scroller.scrollTop = Number.MAX_SAFE_INTEGER;
    fireEvent.scroll(scroller);
    await waitFor(() =>
      expect(
        document.querySelector('[data-media-index="99"]'),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(100);
  });

  it("keeps loaded media mounted while scrolling and restores each view position", async () => {
    const source = createPost("SCROLL", "@stable.scroll", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createQueueItem(source, index, 100),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    const scroller = screen.getByTestId("archive-scroller");
    const loadedImage = view.container.querySelector("img");
    expect(loadedImage).toBeInTheDocument();
    scroller.scrollLeft = 720;
    fireEvent.scroll(scroller);
    expect(scroller).toHaveAttribute("data-scroll-state", "moving");
    expect(loadedImage).toBeInTheDocument();
    await waitFor(() =>
      expect(scroller).toHaveAttribute("data-scroll-state", "settled"),
    );
    expect(view.container.querySelector("img")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    scroller.scrollTop = 1440;
    fireEvent.scroll(scroller);
    await waitFor(() =>
      expect(scroller).toHaveAttribute("data-scroll-state", "settled"),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Horizontal View/ }));
    expect(scroller.scrollLeft).toBe(720);

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    expect(scroller.scrollTop).toBe(1440);
    expect(view.container.querySelector("img")).toBeInTheDocument();
  });

  it("evicts iframes beyond the one-screen return cache and reloads them once on return", async () => {
    const source = createPost("IFRAME-STABLE", "@stable.frame", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 20 }, (_, index) =>
      createUnresolvedQueueItem(source, index),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(5),
    );
    const mountedFrame = view.container.querySelector(
      "iframe",
    ) as HTMLIFrameElement;
    const itemId = mountedFrame.dataset.instagramId as string;
    fireEvent.load(mountedFrame);
    expect(mountedFrame.closest(".archive-embed-crop")).toHaveAttribute(
      "data-load-state",
      "loaded",
    );
    const scroller = screen.getByTestId("archive-scroller");
    scroller.scrollLeft = 10_000;
    fireEvent.scroll(scroller);

    expect(scroller).toHaveAttribute("data-scroll-state", "moving");
    expect(mountedFrame).toBeInTheDocument();
    expect(view.container.querySelectorAll("iframe")).toHaveLength(5);
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(9),
    );
    expect(scroller).toHaveAttribute("data-scroll-state", "settled");
    expect(mountedFrame).not.toBeInTheDocument();

    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);
    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(5),
    );
    expect(scroller).toHaveAttribute("data-scroll-state", "settled");
    const remountedFrame = view.container.querySelector(
      `iframe[data-instagram-id="${itemId}"]`,
    ) as HTMLIFrameElement;
    expect(remountedFrame).toBeInTheDocument();
    expect(remountedFrame).not.toBe(mountedFrame);
    expect(
      view.container.querySelectorAll(`iframe[data-instagram-id="${itemId}"]`),
    ).toHaveLength(1);
    expect(remountedFrame?.closest(".archive-embed-crop")).toHaveAttribute(
      "data-load-state",
      "loading",
    );
    expect(
      remountedFrame
        .closest(".archive-embed-crop")
        ?.querySelector(".archive-embed-loading"),
    ).not.toHaveClass("is-hidden");
  });

  it("activates one screen ahead and leaves farther cards as placeholders", async () => {
    const source = createPost("IFRAME-AHEAD", "@fast.frame", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createUnresolvedQueueItem(source, index),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(5),
    );
    expect(
      view.container.querySelectorAll('[data-media-load="paused"]').length,
    ).toBeGreaterThan(0);
    const aheadCard = view.container.querySelector(
      '[data-media-index="3"]',
    ) as HTMLElement;
    expect(Number.parseFloat(aheadCard.style.left)).toBeGreaterThan(
      window.innerWidth,
    );
    expect(aheadCard.querySelector("iframe")).toBeInTheDocument();
    const farCard = view.container.querySelector(
      '[data-media-index="99"]',
    ) as HTMLElement;
    expect(farCard).toHaveAttribute("data-media-load", "paused");
    expect(farCard.querySelector("iframe")).not.toBeInTheDocument();
    expect(
      view.container.querySelectorAll(".archive-embed-loading"),
    ).toHaveLength(5);
    const scroller = screen.getByTestId("archive-scroller");
    scroller.scrollLeft = 10_000;
    fireEvent.scroll(scroller);

    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(9),
    );
    expect(scroller).toHaveAttribute("data-scroll-state", "settled");
    expect(
      view.container.querySelectorAll(".archive-embed-loading").length,
    ).toBeGreaterThan(0);
    expect(
      view.container.querySelectorAll('[data-media-load="enabled"]').length,
    ).toBeGreaterThan(0);
  });

  it("does not duplicate iframe elements during rapid back-and-forth scrolling", async () => {
    const source = createPost("NETWORKBOUND", "@network.bound", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createUnresolvedQueueItem(source, index),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    await waitFor(() =>
      expect(view.container.querySelectorAll("iframe")).toHaveLength(5),
    );
    const initialFrame = view.container.querySelector(
      "iframe",
    ) as HTMLIFrameElement;
    const itemId = initialFrame.dataset.instagramId as string;
    const scroller = screen.getByTestId("archive-scroller");
    scroller.scrollLeft = 10_000;
    fireEvent.scroll(scroller);
    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);
    scroller.scrollLeft = 10_000;
    fireEvent.scroll(scroller);
    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);

    await waitFor(() =>
      expect(scroller).toHaveAttribute("data-scroll-state", "settled"),
    );
    expect(
      view.container.querySelectorAll(`iframe[data-instagram-id="${itemId}"]`),
    ).toHaveLength(1);
    expect(
      view.container.querySelector(`iframe[data-instagram-id="${itemId}"]`),
    ).toBe(initialFrame);
  });

  it("moves one photo with Left/Right in Horizontal and one row with Up/Down in Grid", async () => {
    const source = createPost("STEP-KEYS", "@step.keys", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 12 }, (_, index) =>
      createQueueItem(source, index, 12),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    const scroller = screen.getByTestId("archive-scroller");
    const card = (index: number) =>
      view.container.querySelector(
        `[data-media-index="${index}"]`,
      ) as HTMLElement;
    fireEvent.click(card(0).querySelector(".archive-card-hit") as HTMLElement);

    expect(
      fireEvent.keyDown(window, { key: "ArrowRight", cancelable: true }),
    ).toBe(false);
    expect(card(1)).toHaveClass("is-selected");
    expect(scroller.scrollLeft).toBe(0);
    expect(scroller).toHaveAttribute("data-scroll-state", "moving");
    await waitFor(() => expect(scroller.scrollLeft).toBeGreaterThan(0));

    fireEvent.keyDown(window, { key: "ArrowLeft", cancelable: true });
    expect(card(0)).toHaveClass("is-selected");
    await waitFor(() => expect(scroller.scrollLeft).toBe(0), {
      timeout: 2_000,
    });

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    fireEvent.click(card(0).querySelector(".archive-card-hit") as HTMLElement);
    fireEvent.keyDown(window, { key: "ArrowDown", cancelable: true });
    expect(card(4)).toHaveClass("is-selected");
    expect(scroller.scrollTop).toBe(0);
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0));

    fireEvent.keyDown(window, { key: "ArrowUp", cancelable: true });
    expect(card(0)).toHaveClass("is-selected");
    await waitFor(() => expect(scroller.scrollTop).toBe(0), {
      timeout: 2_000,
    });
  });

  it("moves one step for a single wheel input and caps a continuous burst at two steps", async () => {
    const source = createPost("STEP-WHEEL", "@step.wheel", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 12 }, (_, index) =>
      createQueueItem(source, index, 12),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    const scroller = screen.getByTestId("archive-scroller");
    const card = (index: number) =>
      view.container.querySelector(
        `[data-media-index="${index}"]`,
      ) as HTMLElement;
    fireEvent.click(card(0).querySelector(".archive-card-hit") as HTMLElement);

    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(1)).toHaveClass("is-selected");
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(2)).toHaveClass("is-selected");
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(2)).toHaveClass("is-selected");
    fireEvent.wheel(scroller, { deltaY: -120, cancelable: true });
    expect(card(1)).toHaveClass("is-selected");

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    fireEvent.click(card(0).querySelector(".archive-card-hit") as HTMLElement);
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(4)).toHaveClass("is-selected");
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0));
    const firstStep = scroller.scrollTop;
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(8)).toHaveClass("is-selected");
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(firstStep));
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(8)).toHaveClass("is-selected");
    fireEvent.wheel(scroller, { deltaY: -120, cancelable: true });
    expect(card(4)).toHaveClass("is-selected");
  });

  it("opens the slideshow tab, auto-loops, and supports keyboard navigation", async () => {
    render(<HomePage />);
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));
    expect(window.location.search).toContain("slideshow=1");
    const slideshow = screen.getByRole("region", {
      name: "Slideshow viewer",
    });
    expect(slideshow).toBeInTheDocument();
    expect(DEFAULT_SETTINGS.slideshowIntervalMs).toBe(5_000);
    expect(
      within(slideshow).getByRole("tab", { name: "Slideshow" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(slideshow).queryByRole("button", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(
      within(slideshow).queryByRole("button", { name: "Hide this media" }),
    ).not.toBeInTheDocument();
    expect(
      within(slideshow).queryByRole("button", { name: /previous|next|pause/i }),
    ).not.toBeInTheDocument();
    expect(
      within(slideshow).getByRole("combobox", { name: "Transition style" }),
    ).toHaveValue(DEFAULT_SETTINGS.slideshowTransitionPreset);
    expect(
      within(slideshow).getByRole("slider", { name: "Frame duration" }),
    ).toHaveAttribute("min", "3000");
    await waitFor(() =>
      expect(
        slideshow.querySelector('[data-slideshow-slot="0"]'),
      ).toHaveAttribute("data-media-id", testState.queue[0].media.id),
    );
    expect(slideshow.querySelectorAll("iframe")).toHaveLength(3);
    expect(slideshow.querySelector(".slideshow-photo")).toBeNull();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        slideshow.querySelector('[data-slideshow-slot="0"]'),
      ).toHaveAttribute("data-media-id", testState.queue[1].media.id),
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        slideshow.querySelector('[data-slideshow-slot="0"]'),
      ).toHaveAttribute("data-media-id", testState.queue[2].media.id),
    );

    fireEvent.click(within(slideshow).getByRole("tab", { name: /Grid View/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Slideshow viewer" }),
      ).not.toBeInTheDocument(),
    );
    expect(window.location.search).toBe("?view=grid");
  });

  it("uses only a full-stage Instagram iframe and keeps it out of the controls", async () => {
    const source = createPost("INTERACTIVE", "@interactive", "Saved");
    testState.posts = [source];
    testState.queue = [createUnresolvedQueueItem(source, 0)];

    render(<HomePage />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));

    const frame = await screen.findByTitle("Instagram preview INTERACTIVE");
    expect(frame).toHaveAttribute("tabindex", "-1");
    expect(frame).toHaveAttribute("scrolling", "no");
    expect(frame.closest(".slideshow-embed")).toBeInTheDocument();
    expect(document.querySelector(".slideshow-photo")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /play|pause|next|previous/i }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      screen.getByTitle("Instagram preview INTERACTIVE"),
    ).toBeInTheDocument();
  });

  it("preloads both neighboring slideshow iframes and transitions the existing next frame", async () => {
    const posts = ["PRELOAD-A", "PRELOAD-B", "PRELOAD-C"].map((id) =>
      createPost(id, `@${id.toLowerCase()}`, "Saved"),
    );
    testState.posts = posts;
    testState.queue = posts.map((post) => createUnresolvedQueueItem(post, 0));

    render(<HomePage />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));

    await waitFor(() =>
      expect(
        document.querySelectorAll(".archive-slideshow iframe"),
      ).toHaveLength(3),
    );
    const preloadedNext = screen.getByTitle(
      "Instagram preview PRELOAD-B",
    ) as HTMLIFrameElement;
    const initialCurrent = screen.getByTitle(
      "Instagram preview PRELOAD-A",
    ) as HTMLIFrameElement;
    const preloadedPrevious = screen.getByTitle(
      "Instagram preview PRELOAD-C",
    ) as HTMLIFrameElement;
    expect(initialCurrent.closest(".slideshow-frame")).toHaveAttribute(
      "data-slideshow-slot",
      "0",
    );
    expect(preloadedNext.closest(".slideshow-frame")).toHaveAttribute(
      "data-slideshow-slot",
      "1",
    );
    expect(preloadedPrevious.closest(".slideshow-frame")).toHaveAttribute(
      "data-slideshow-slot",
      "-1",
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(preloadedNext.closest(".slideshow-frame")).toHaveAttribute(
        "data-slideshow-slot",
        "0",
      ),
    );
    expect(screen.getByTitle("Instagram preview PRELOAD-B")).toBe(
      preloadedNext,
    );
    expect(screen.getByTitle("Instagram preview PRELOAD-A")).toBe(
      initialCurrent,
    );
    expect(screen.getByTitle("Instagram preview PRELOAD-C")).toBe(
      preloadedPrevious,
    );
    expect(initialCurrent.closest(".slideshow-frame")).toHaveAttribute(
      "data-slideshow-slot",
      "-1",
    );
    expect(preloadedPrevious.closest(".slideshow-frame")).toHaveAttribute(
      "data-slideshow-slot",
      "1",
    );
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
