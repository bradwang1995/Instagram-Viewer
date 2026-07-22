import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwrightPackagePath =
  process.env.PLAYWRIGHT_PACKAGE_PATH ?? "playwright-core";
const chromeExecutable = process.env.CHROME_EXECUTABLE;

if (!chromeExecutable) {
  throw new Error("Set CHROME_EXECUTABLE before running visual QA.");
}

const { chromium } = require(playwrightPackagePath);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifactDir = path.join(projectRoot, "artifacts");
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromeExecutable,
  headless: true,
});

try {
  const results = [];
  results.push(
    await captureState({
      browser,
      name: "horizontal",
      url: "http://127.0.0.1:5173/?demo=1",
      viewport: { width: 1920, height: 1080 },
      expectedColumns: undefined,
      expectedVisibleCards: undefined,
      screenshot: path.join(artifactDir, "audit-01-horizontal.png"),
    }),
  );
  results.push(
    await captureManifestImport({
      browser,
      screenshot: path.join(artifactDir, "audit-04-manifest-grid.png"),
    }),
  );
  results.push(await verifySilentSourceFiltering({ browser }));
  results.push(
    await captureState({
      browser,
      name: "desktop-grid",
      url: "http://127.0.0.1:5173/?demo=1&view=grid",
      viewport: { width: 1920, height: 1080 },
      expectedColumns: 4,
      expectedVisibleCards: 4,
      screenshot: path.join(artifactDir, "audit-02-grid.png"),
    }),
  );
  results.push(
    await captureState({
      browser,
      name: "mobile-grid",
      url: "http://127.0.0.1:5173/?demo=1&view=grid",
      viewport: { width: 390, height: 844 },
      expectedColumns: 1,
      expectedVisibleCards: 1,
      screenshot: path.join(artifactDir, "audit-03-mobile-grid.png"),
    }),
  );

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await browser.close();
}

async function verifySilentSourceFiltering({ browser }) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    await page.route(
      /graph\.facebook\.com\/v25\.0\/instagram_oembed/,
      async (route) => {
        const postUrl = new URL(route.request().url()).searchParams.get("url");
        const unavailable = postUrl?.includes("BLOCKEDQA");
        await route.fulfill({
          status: unavailable ? 400 : 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: unavailable ? '{"error":"not embeddable"}' : "{}",
        });
      },
    );
    await page.route(/instagram\.com\/p\/.*\/embed\//, async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Available compatibility preview</title>",
      });
    });

    const savedPosts = ["AVAILABLEQA1", "BLOCKEDQA", "AVAILABLEQA2"].map(
      (shortcode, index) => ({
        timestamp: 1_710_000_000 + index,
        media: [],
        label_values: [
          {
            label: "URL",
            value: `https://www.instagram.com/p/${shortcode}/`,
            href: `https://www.instagram.com/p/${shortcode}/`,
          },
        ],
      }),
    );

    await page.goto("http://127.0.0.1:5173/?view=grid", {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "saved-posts-silent-filtering-qa.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(savedPosts)),
    });
    await page.getByTestId("archive-scroller").waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await page.waitForFunction(() => {
      const cards = Array.from(
        document.querySelectorAll("[data-testid='archive-media-card']"),
      );
      return (
        cards.length === 2 &&
        !document.querySelector('[data-media-id="post:BLOCKEDQA:media:0"]') &&
        cards.every((card) => card.querySelector("iframe"))
      );
    });

    const evidence = await page.evaluate(() => ({
      cardCount: document.querySelectorAll("[data-testid='archive-media-card']")
        .length,
      iframeCount: document.querySelectorAll(
        "[data-testid='archive-media-card'] iframe",
      ).length,
      blockedCardPresent: Boolean(
        document.querySelector('[data-media-id="post:BLOCKEDQA:media:0"]'),
      ),
      hasFailureCopy: /unavailable|could not display|failed post/i.test(
        document.body.innerText,
      ),
    }));

    if (
      evidence.cardCount !== 2 ||
      evidence.iframeCount !== 2 ||
      evidence.blockedCardPresent ||
      evidence.hasFailureCopy
    ) {
      throw new Error(
        `unavailable source was not silently omitted: ${JSON.stringify(evidence)}`,
      );
    }

    return {
      name: "silent-source-filtering",
      viewport: { width: 1920, height: 1080 },
      evidence,
    };
  } finally {
    await context.close();
  }
}

async function captureManifestImport({ browser, screenshot }) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    const imageNames = [
      "warm-interior.webp",
      "city-night.webp",
      "quiet-lake.webp",
    ];
    const media = await Promise.all(
      imageNames.map(async (name, index) => ({
        id: `frame-${index + 1}`,
        assetUrl: `data:image/webp;base64,${(
          await readFile(path.join(projectRoot, "public", "demo", name))
        ).toString("base64")}`,
      })),
    );
    const manifest = {
      format: "instagram-viewer.resolved-media",
      version: 1,
      posts: [
        {
          postUrl: "https://www.instagram.com/p/BROWSERQA1/",
          creatorHandle: "browser.qa",
          media,
        },
      ],
    };

    await page.goto("http://127.0.0.1:5173/?view=grid", {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "resolved-media-browser-qa.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(manifest)),
    });
    await page.getByTestId("archive-scroller").waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await page.waitForFunction(() => {
      const images = Array.from(
        document.querySelectorAll("[data-testid='archive-media-card'] img"),
      );
      return (
        images.length === 3 &&
        images.every((image) => image.complete && image.naturalWidth > 0)
      );
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(750);

    const evidence = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll("[data-testid='archive-media-card']"),
      );
      return {
        cardCount: cards.length,
        mediaIds: cards.map((card) => card.getAttribute("data-media-id")),
        mediaIndexes: cards.map((card) =>
          Number(card.getAttribute("data-media-index")),
        ),
        directImageCount: cards.filter((card) => card.querySelector("img"))
          .length,
        iframeCount: document.querySelectorAll(
          "[data-testid='archive-media-card'] iframe",
        ).length,
      };
    });
    const expectedIds = [1, 2, 3].map(
      (index) => `post:BROWSERQA1:media:resolved:frame-${index}`,
    );
    if (
      evidence.cardCount !== 3 ||
      evidence.directImageCount !== 3 ||
      evidence.iframeCount !== 0 ||
      JSON.stringify(evidence.mediaIds) !== JSON.stringify(expectedIds) ||
      JSON.stringify(evidence.mediaIndexes) !== JSON.stringify([0, 1, 2])
    ) {
      throw new Error(
        `resolved manifest did not produce three independent direct-image cards: ${JSON.stringify(evidence)}`,
      );
    }

    await page.locator(".archive-preview").screenshot({ path: screenshot });
    return {
      name: "resolved-manifest-grid",
      viewport: { width: 1920, height: 1080 },
      evidence,
      screenshot,
    };
  } finally {
    await context.close();
  }
}

async function captureState({
  browser,
  name,
  url,
  viewport,
  expectedColumns,
  expectedVisibleCards,
  screenshot,
}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByTestId("archive-scroller").waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await page.waitForFunction(() => {
      const images = Array.from(
        document.querySelectorAll("[data-testid='archive-media-card'] img"),
      );
      return (
        images.length > 0 &&
        images.every((image) => image.complete && image.naturalWidth > 0)
      );
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1_500);

    const initial = await page.evaluate(() => {
      const scroller = document.querySelector(
        "[data-testid='archive-scroller']",
      );
      const cards = Array.from(
        document.querySelectorAll("[data-testid='archive-media-card']"),
      );
      if (!(scroller instanceof HTMLElement))
        throw new Error("Missing scroller");
      const scrollerRect = scroller.getBoundingClientRect();
      const cardRects = cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          index: Number(card.getAttribute("data-media-index")),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
      const visible = cardRects.filter(
        (rect) =>
          rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom,
      );
      const bodyText = document.body.innerText;
      const style = getComputedStyle(scroller);
      const selectedSurface = document.querySelector(
        ".archive-card.is-selected .archive-media-surface",
      );
      const logo = document.querySelector(".archive-logo");
      const dockActions = document.querySelector(".dock-actions");
      const rectSnapshot = (element) => {
        if (!(element instanceof HTMLElement)) return undefined;
        const rect = element.getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      };
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          computed.display !== "none" &&
          computed.visibility !== "hidden" &&
          Number(computed.opacity) > 0
        );
      };
      return {
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        userSelect: getComputedStyle(document.body).userSelect,
        scrollbarWidth: style.scrollbarWidth,
        scrollSnapType: style.scrollSnapType,
        selectedBorderWidth: selectedSurface
          ? getComputedStyle(selectedSurface).borderTopWidth
          : undefined,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        scrollerWidth: scroller.clientWidth,
        scrollerHeight: scroller.clientHeight,
        cardCount: cardRects.length,
        visibleCardCount: visible.length,
        visibleColumnCount: new Set(visible.map((rect) => rect.left)).size,
        maximumCardHeight: Math.max(...cardRects.map((rect) => rect.height)),
        logoVisible: isVisible(logo),
        dockActionsVisible: isVisible(dockActions),
        logoRect: rectSnapshot(logo),
        dockActionsRect: rectSnapshot(dockActions),
        hasRejectedCopy: [
          "INS/ARCHIVE",
          "YOUR ARCHIVE",
          "Open source on Instagram",
          "Hide this media",
        ].some((copy) => bodyText.includes(copy)),
      };
    });

    if (initial.rootFontSize !== "24px") {
      throw new Error(
        `${name}: expected 24px root font, got ${initial.rootFontSize}`,
      );
    }
    if (initial.scrollbarWidth !== "none") {
      throw new Error(`${name}: visible scrollbar styling detected`);
    }
    if (initial.userSelect !== "none") {
      throw new Error(`${name}: selectable gallery content detected`);
    }
    if (initial.scrollSnapType !== "none") {
      throw new Error(`${name}: horizontal scroll snap is still active`);
    }
    if (initial.selectedBorderWidth !== "0px") {
      throw new Error(`${name}: selected photo border is still visible`);
    }
    if (initial.hasRejectedCopy) {
      throw new Error(`${name}: rejected card copy is still visible`);
    }
    if (!initial.logoVisible || !initial.dockActionsVisible) {
      throw new Error(`${name}: primary viewer chrome is not visible`);
    }
    const maximumMountedCards = name.includes("grid")
      ? viewport.width <= 640
        ? 2
        : viewport.width <= 1100
          ? 4
          : 8
      : 9;
    if (initial.cardCount > maximumMountedCards) {
      throw new Error(`${name}: mounted ${initial.cardCount} cards`);
    }
    if (
      name === "horizontal" &&
      (initial.maximumCardHeight / viewport.height < 0.7 ||
        initial.maximumCardHeight / viewport.height > 0.8)
    ) {
      throw new Error(`${name}: media height is outside 70-80% of viewport`);
    }
    if (
      expectedColumns !== undefined &&
      initial.visibleColumnCount !== expectedColumns
    ) {
      throw new Error(
        `${name}: expected ${expectedColumns} columns, got ${initial.visibleColumnCount}`,
      );
    }
    if (
      expectedVisibleCards !== undefined &&
      initial.visibleCardCount !== expectedVisibleCards
    ) {
      throw new Error(
        `${name}: expected ${expectedVisibleCards} visible cards, got ${initial.visibleCardCount}`,
      );
    }

    await page.locator(".archive-preview").screenshot({ path: screenshot });

    await page.getByTestId("archive-scroller").evaluate((scroller) => {
      scroller.scrollTo({
        left: scroller.scrollWidth,
        top: scroller.scrollHeight,
        behavior: "instant",
      });
    });
    await page.waitForTimeout(500);
    const end = await page.evaluate(() => {
      const indexes = Array.from(
        document.querySelectorAll("[data-testid='archive-media-card']"),
        (card) => Number(card.getAttribute("data-media-index")),
      );
      return {
        mountedCardCount: indexes.length,
        minimumIndex: Math.min(...indexes),
        maximumIndex: Math.max(...indexes),
      };
    });

    if (end.maximumIndex !== 18) {
      throw new Error(`${name}: last demo media is not reachable`);
    }
    if (end.mountedCardCount > maximumMountedCards) {
      throw new Error(
        `${name}: end window mounted ${end.mountedCardCount} cards`,
      );
    }

    return { name, viewport, initial, end, screenshot };
  } finally {
    await context.close();
  }
}
