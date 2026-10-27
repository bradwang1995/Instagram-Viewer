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

vi.mock("../features/media/instagramMedia", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../features/media/instagramMedia")
  >()),
  resolveMediaUrl: async (item: MediaQueueItem) =>
    "https://scontent.cdninstagram.com/" +
    item.post.shortcode +
    "/" +
    item.media.sourceIndex +
    ".jpg",
}));

describe("Photo archive preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
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
      createQueueItem(createPost("C", "@third", "Saved"), 0, 1),
      createQueueItem(second, 0, 1),
    ];
    testState.refresh.mockResolvedValue(undefined);
    testState.setMediaVisibility.mockResolvedValue(undefined);
    testState.getInstagramEmbedAvailability.mockResolvedValue("available");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows only the first photo per post and opens its isolated photo panel", async () => {
    const post = testState.posts[0];
    testState.queue = [
      createQueueItem(post, 0, 3),
      createQueueItem(post, 1, 3),
      createQueueItem(post, 2, 3),
      createQueueItem(testState.posts[1], 0, 1),
    ];
    render(<HomePage />);
    await act(async () => undefined);
    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Open post A" }));
    const panel = await screen.findByRole("dialog");
    expect(
      document.querySelectorAll(".archive-app > .archive-preview img"),
    ).toHaveLength(0);
    await waitFor(() =>
      expect(within(panel).getAllByTestId("archive-media-card")).toHaveLength(
        3,
      ),
    );
    expect(
      within(panel).queryByRole("slider", { name: "Start time" }),
    ).toBeNull();
    fireEvent.click(within(panel).getByRole("tab", { name: /Grid View/ }));
    expect(
      within(panel).getByRole("tab", { name: /Grid View/ }),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(within(panel).getByRole("tab", { name: "Slideshow" }));
    expect(
      within(panel).getByRole("combobox", { name: "Transition style" }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("slider", { name: "Start time" }),
    ).toBeNull();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Close post photos" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(2);
    expect(document.querySelector("iframe")).toBeNull();
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

  it("keeps one Horizontal screen and preloads two Grid screens ahead", async () => {
    render(<HomePage />);
    await waitFor(() =>
      expect(observedRootMargins).toContain("0px 100% 0px 0px"),
    );

    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    await waitFor(() =>
      expect(observedRootMargins).toContain("0px 0px 200% 0px"),
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
    ).toHaveLength(0);

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
      expect(slideshow.querySelector("img")).toBeInTheDocument(),
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

  it("unmounts date-filtered photos and restores their source when the filter is cleared", async () => {
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
      expect(view.container.querySelectorAll("img")).toHaveLength(2),
    );
    const retainedFrame = view.container.querySelector(
      'img[data-media-id="post:FILTER-A:unresolved:0"]',
    );

    fireEvent.change(screen.getByRole("slider", { name: "Start time" }), {
      target: { value: "1" },
    });

    await waitFor(() => expect(retainedFrame).not.toBeInTheDocument());

    fireEvent.change(screen.getByRole("slider", { name: "Start time" }), {
      target: { value: "0" },
    });
    await waitFor(() =>
      expect(
        view.container.querySelector(
          'img[data-media-id="post:FILTER-A:unresolved:0"]',
        ),
      ).toHaveAttribute("src", retainedFrame?.getAttribute("src")),
    );
  });

  it("preserves img DOM identity when source items are reordered", async () => {
    const first = createPost("SORT-A", "@sort.a", "Saved");
    const second = createPost("SORT-B", "@sort.b", "Saved");
    const third = createPost("SORT-C", "@sort.c", "Saved");
    testState.posts = [first, second, third];
    testState.queue = [first, second, third].map((post) =>
      createUnresolvedQueueItem(post, 0),
    );
    const view = render(<HomePage />);
    await waitFor(() =>
      expect(view.container.querySelectorAll("img")).toHaveLength(3),
    );
    const originalFrames = new Map(
      Array.from(view.container.querySelectorAll("img")).map((frame) => [
        frame.dataset.mediaId,
        frame,
      ]),
    );

    testState.queue = [...testState.queue].reverse();
    view.rerender(<HomePage />);

    originalFrames.forEach((frame, itemId) => {
      expect(
        view.container.querySelector(`img[data-media-id="${itemId}"]`),
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

  it("bounds Grid DOM size for a large library and renders the final row on demand", async () => {
    const source = createPost("LONG", "@large", "Saved");
    testState.queue = Array.from({ length: 1000 }, (_, index) =>
      createQueueItem(
        { ...source, id: source.id + index, shortcode: "LONG" + index },
        0,
        1,
      ),
    );
    render(<HomePage />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));
    expect(screen.getAllByTestId("archive-media-card").length).toBeLessThan(40);
    const scroller = screen.getByTestId("archive-scroller");
    expect(scroller).toHaveAttribute("data-total-count", "1000");
    scroller.scrollTop =
      parseFloat(
        (scroller.querySelector(".archive-track") as HTMLElement).style.height,
      ) - 888;
    fireEvent.scroll(scroller);
    await waitFor(() =>
      expect(
        document.querySelector('[data-media-index="999"]'),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("archive-media-card").length).toBeLessThan(40);
    expect(document.querySelector('[data-media-index="0"]')).toBeNull();
  });

  it("keeps loaded media mounted while scrolling and restores each view position", async () => {
    const source = createPost("SCROLL", "@stable.scroll", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createQueueItem(
        {
          ...source,
          id: source.id + index,
          shortcode: `${source.shortcode}${index}`,
        },
        0,
        100,
      ),
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

  it("evicts images beyond the one-screen return cache and reloads them once on return", async () => {
    const source = createPost("IFRAME-STABLE", "@stable.frame", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 20 }, (_, index) =>
      createUnresolvedQueueItem(
        {
          ...source,
          id: source.id + index,
          shortcode: `${source.shortcode}${index}`,
        },
        0,
      ),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    await waitFor(() =>
      expect(view.container.querySelectorAll("img")).toHaveLength(5),
    );
    const mountedFrame = view.container.querySelector(
      "img",
    ) as HTMLImageElement;
    const itemId = mountedFrame.dataset.mediaId as string;
    fireEvent.load(mountedFrame);

    const scroller = screen.getByTestId("archive-scroller");
    scroller.scrollLeft = 10_000;
    fireEvent.scroll(scroller);

    expect(scroller).toHaveAttribute("data-scroll-state", "moving");
    expect(mountedFrame).toBeInTheDocument();
    expect(view.container.querySelectorAll("img")).toHaveLength(5);
    await waitFor(() =>
      expect(view.container.querySelectorAll("img")).toHaveLength(9),
    );
    await waitFor(() =>
      expect(scroller).toHaveAttribute("data-scroll-state", "settled"),
    );
    expect(mountedFrame).not.toBeInTheDocument();

    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);
    await waitFor(() =>
      expect(view.container.querySelectorAll("img")).toHaveLength(5),
    );
    await waitFor(() =>
      expect(scroller).toHaveAttribute("data-scroll-state", "settled"),
    );
    const remountedFrame = view.container.querySelector(
      `img[data-media-id="${itemId}"]`,
    ) as HTMLImageElement;
    expect(remountedFrame).toBeInTheDocument();
    expect(remountedFrame).not.toBe(mountedFrame);
    expect(
      view.container.querySelectorAll(`img[data-media-id="${itemId}"]`),
    ).toHaveLength(1);
    expect(remountedFrame).toHaveAttribute("loading", "eager");
    expect(remountedFrame?.closest("article")).toBeInTheDocument();
  });

  it("activates one screen ahead and leaves farther cards as placeholders", async () => {
    const source = createPost("IFRAME-AHEAD", "@fast.frame", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createUnresolvedQueueItem(
        {
          ...source,
          id: source.id + index,
          shortcode: `${source.shortcode}${index}`,
        },
        0,
      ),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    await waitFor(() =>
      expect(view.container.querySelectorAll("img")).toHaveLength(5),
    );
    expect(view.container.querySelectorAll("article").length).toBeLessThan(12);
    const aheadCard = view.container.querySelector(
      '[data-media-index="3"]',
    ) as HTMLElement;
    expect(Number.parseFloat(aheadCard.style.left)).toBeGreaterThan(
      window.innerWidth,
    );
    expect(aheadCard.querySelector("img")).toBeInTheDocument();
    const farCard = view.container.querySelector(
      '[data-media-index="99"]',
    ) as HTMLElement;
    expect(farCard).toBeNull();
    expect(
      view.container.querySelectorAll(".archive-image-loading"),
    ).toHaveLength(5);
    const scroller = screen.getByTestId("archive-scroller");
    scroller.scrollLeft = 10_000;
    fireEvent.scroll(scroller);

    await waitFor(() =>
      expect(view.container.querySelectorAll("img")).toHaveLength(9),
    );
    await waitFor(() =>
      expect(scroller).toHaveAttribute("data-scroll-state", "settled"),
    );
    expect(
      view.container.querySelectorAll(".archive-image-loading").length,
    ).toBeGreaterThan(0);
    expect(
      view.container.querySelectorAll('[data-media-load="enabled"]').length,
    ).toBeGreaterThan(0);
  });

  it("does not duplicate img elements during rapid back-and-forth scrolling", async () => {
    const source = createPost("NETWORKBOUND", "@network.bound", "Saved");
    testState.posts = [source];
    testState.queue = Array.from({ length: 100 }, (_, index) =>
      createUnresolvedQueueItem(
        {
          ...source,
          id: source.id + index,
          shortcode: `${source.shortcode}${index}`,
        },
        0,
      ),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    await waitFor(() =>
      expect(view.container.querySelectorAll("img")).toHaveLength(5),
    );
    const initialFrame = view.container.querySelector(
      "img",
    ) as HTMLImageElement;
    const itemId = initialFrame.dataset.mediaId as string;
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
      view.container.querySelectorAll(`img[data-media-id="${itemId}"]`),
    ).toHaveLength(1);
    expect(view.container.querySelector(`img[data-media-id="${itemId}"]`)).toBe(
      initialFrame,
    );
  });

  it("moves one photo with Left/Right in Horizontal and one row with Up/Down in Grid", async () => {
    const source = createPost("STEP-KEYS", "@step.keys", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 12 }, (_, index) =>
      createQueueItem(
        {
          ...source,
          id: source.id + index,
          shortcode: `${source.shortcode}${index}`,
        },
        0,
        12,
      ),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    const scroller = screen.getByTestId("archive-scroller");
    const card = (index: number) =>
      view.container.querySelector(
        `[data-media-index="${index}"]`,
      ) as HTMLElement;

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

  it("continues navigating during a sustained wheel gesture after each bounded burst", async () => {
    const source = createPost("CONTINUOUS", "@scroll", "Saved");
    testState.queue = Array.from({ length: 12 }, (_, index) =>
      createQueueItem(
        { ...source, id: source.id + index, shortcode: "CONTINUOUS" + index },
        0,
        1,
      ),
    );
    render(<HomePage />);
    await act(async () => undefined);
    vi.useFakeTimers();
    const scroller = screen.getByTestId("archive-scroller");
    const selected = () =>
      document
        .querySelector(".archive-card.is-selected")
        ?.getAttribute("data-media-index");
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(selected()).toBe("2");
    for (let step = 0; step < 4; step++) {
      act(() => vi.advanceTimersByTime(50));
      fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    }
    expect(selected()).toBe("3");
    vi.useRealTimers();
  });

  it("moves one step for a single wheel input and caps a continuous burst at two steps", async () => {
    const source = createPost("STEP-WHEEL", "@step.wheel", "Reference");
    testState.posts = [source];
    testState.queue = Array.from({ length: 12 }, (_, index) =>
      createQueueItem(
        {
          ...source,
          id: source.id + index,
          shortcode: `${source.shortcode}${index}`,
        },
        0,
        12,
      ),
    );
    const view = render(<HomePage />);
    await act(async () => undefined);

    const scroller = screen.getByTestId("archive-scroller");
    const card = (index: number) =>
      view.container.querySelector(
        `[data-media-index="${index}"]`,
      ) as HTMLElement;

    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(1)).toHaveClass("is-selected");
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(2)).toHaveClass("is-selected");
    fireEvent.wheel(scroller, { deltaY: 120, cancelable: true });
    expect(card(2)).toHaveClass("is-selected");
    fireEvent.wheel(scroller, { deltaY: -120, cancelable: true });
    expect(card(1)).toHaveClass("is-selected");

    fireEvent.keyDown(window, { key: "ArrowLeft", cancelable: true });
    await waitFor(() => expect(scroller.scrollLeft).toBe(0));
    fireEvent.click(screen.getByRole("tab", { name: /Grid View/ }));

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
    expect(slideshow.querySelectorAll("img")).toHaveLength(3);
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

  it("opens a post from the main slideshow and pauses background playback", async () => {
    render(<HomePage />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));
    const slideshow = screen.getByRole("region", { name: "Slideshow viewer" });
    fireEvent.click(
      slideshow.querySelector('[data-slideshow-slot="0"] .archive-card-hit')!,
    );
    await screen.findByRole("dialog");
    await act(async () => undefined);
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(6000));
    expect(
      slideshow.querySelector('[data-slideshow-slot="0"]'),
    ).toHaveAttribute("data-media-id", testState.queue[0].media.id);
    vi.useRealTimers();
  });

  it("preloads both neighboring slideshow images and transitions the existing next frame", async () => {
    const posts = ["PRELOAD-A", "PRELOAD-B", "PRELOAD-C"].map((id) =>
      createPost(id, `@${id.toLowerCase()}`, "Saved"),
    );
    testState.posts = posts;
    testState.queue = posts.map((post) => createUnresolvedQueueItem(post, 0));

    render(<HomePage />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));

    await waitFor(() =>
      expect(document.querySelectorAll(".archive-slideshow img")).toHaveLength(
        3,
      ),
    );
    const preloadedNext = document.querySelector(
      '.archive-slideshow img[src*="PRELOAD-B"]',
    ) as HTMLIFrameElement;
    const initialCurrent = document.querySelector(
      '.archive-slideshow img[src*="PRELOAD-A"]',
    ) as HTMLIFrameElement;
    const preloadedPrevious = document.querySelector(
      '.archive-slideshow img[src*="PRELOAD-C"]',
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
    expect(
      document.querySelector('.archive-slideshow img[src*="PRELOAD-B"]'),
    ).toBe(preloadedNext);
    expect(
      document.querySelector('.archive-slideshow img[src*="PRELOAD-A"]'),
    ).toBe(initialCurrent);
    expect(
      document.querySelector('.archive-slideshow img[src*="PRELOAD-C"]'),
    ).toBe(preloadedPrevious);
    expect(initialCurrent.closest(".slideshow-frame")).toHaveAttribute(
      "data-slideshow-slot",
      "-1",
    );
    expect(preloadedPrevious.closest(".slideshow-frame")).toHaveAttribute(
      "data-slideshow-slot",
      "1",
    );
  });

  it("keeps a failed cover and its scroll geometry stable until explicit retry", async () => {
    render(<HomePage />);
    await act(async () => undefined);
    const image = document.querySelector(
      'img[data-media-id="' + testState.queue[0].media.id + '"]',
    )!;
    fireEvent.error(image);
    expect(
      document.querySelector(
        'article[data-media-id="' + testState.queue[0].media.id + '"]',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Photo could not load.")).toBeInTheDocument();
    expect(screen.getAllByTestId("archive-media-card")).toHaveLength(3);
    expect(testState.getInstagramEmbedAvailability).not.toHaveBeenCalled();
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
