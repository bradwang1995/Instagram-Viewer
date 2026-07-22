import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const playwrightPackagePath =
  process.env.PLAYWRIGHT_PACKAGE_PATH ?? "playwright-core";
const chromeExecutable = process.env.CHROME_EXECUTABLE;
const savedPostsPath = process.env.SAVED_POSTS_PATH;

if (!chromeExecutable || !savedPostsPath) {
  throw new Error("Set CHROME_EXECUTABLE and SAVED_POSTS_PATH.");
}

const { chromium } = require(playwrightPackagePath);
const browser = await chromium.launch({
  executablePath: chromeExecutable,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
});
const page = await context.newPage();
let activeEmbedRequests = 0;
let maximumConcurrentEmbedRequests = 0;
let totalEmbedRequests = 0;

async function waitForEmbedQueueToSettle() {
  let previousTotal = -1;
  let stableChecks = 0;
  const deadline = performance.now() + 25_000;

  while (performance.now() < deadline) {
    await page.waitForTimeout(250);
    if (activeEmbedRequests === 0 && totalEmbedRequests === previousTotal) {
      stableChecks += 1;
      if (stableChecks >= 3) return;
    } else {
      stableChecks = 0;
    }
    previousTotal = totalEmbedRequests;
  }

  throw new Error("Compatibility embed queue did not settle.");
}

async function readViewerMetrics() {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll("[data-testid='archive-media-card']"),
    );
    const scroller = document.querySelector("[data-testid='archive-scroller']");
    const scrollerRect = scroller?.getBoundingClientRect();
    const visibleCardCount = scrollerRect
      ? cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return (
            rect.right > scrollerRect.left &&
            rect.left < scrollerRect.right &&
            rect.bottom > scrollerRect.top &&
            rect.top < scrollerRect.bottom
          );
        }).length
      : 0;

    return {
      mountedCardCount: cards.length,
      visibleCardCount,
      mountedIframeCount: document.querySelectorAll(
        "[data-testid='archive-media-card'] iframe",
      ).length,
      renderedCount: Number(scroller?.getAttribute("data-rendered-count")),
      hasVisibleSourceOrMediaTotals:
        /\b(media|sources?)\b.*\d|\d.*\b(media|sources?)\b/i.test(
          document.body.innerText,
        ),
    };
  });
}

function assertViewportBound(label, metrics) {
  const maximumMountedCards = label.startsWith("Grid View") ? 8 : 9;
  if (
    metrics.mountedCardCount > maximumMountedCards ||
    metrics.renderedCount > maximumMountedCards
  ) {
    throw new Error(`${label}: mounted an unbounded media window.`);
  }
  if (maximumConcurrentEmbedRequests > 2) {
    throw new Error(
      `${label}: observed ${maximumConcurrentEmbedRequests} concurrent embed requests.`,
    );
  }
  if (totalEmbedRequests > metrics.mountedCardCount) {
    throw new Error(
      `${label}: requested ${totalEmbedRequests} embeds for ${metrics.mountedCardCount} mounted cards.`,
    );
  }
  if (metrics.mountedIframeCount > metrics.mountedCardCount) {
    throw new Error(
      `${label}: mounted ${metrics.mountedIframeCount} iframes for ${metrics.mountedCardCount} mounted cards.`,
    );
  }
  if (metrics.hasVisibleSourceOrMediaTotals) {
    throw new Error(`${label}: exposed rejected media/source totals.`);
  }
}

try {
  await page.route(
    /graph\.facebook\.com\/v25\.0\/instagram_oembed/,
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "{}",
      });
    },
  );
  await page.route(/instagram\.com\/p\/.*\/embed\//, async (route) => {
    activeEmbedRequests += 1;
    totalEmbedRequests += 1;
    maximumConcurrentEmbedRequests = Math.max(
      maximumConcurrentEmbedRequests,
      activeEmbedRequests,
    );
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    activeEmbedRequests -= 1;
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Delayed compatibility preview</title>",
    });
  });

  await page.goto("http://127.0.0.1:5173/", {
    waitUntil: "domcontentloaded",
  });
  const startedAt = performance.now();
  await page.locator('input[type="file"]').setInputFiles(savedPostsPath);
  await page.getByTestId("archive-scroller").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const viewerReadyMs = Math.round(performance.now() - startedAt);

  await waitForEmbedQueueToSettle();
  const horizontal = {
    metrics: await readViewerMetrics(),
    maximumConcurrentEmbedRequests,
    totalEmbedRequests,
  };
  assertViewportBound("Horizontal View", horizontal.metrics);

  activeEmbedRequests = 0;
  maximumConcurrentEmbedRequests = 0;
  totalEmbedRequests = 0;
  await page.getByRole("button", { name: /Grid View/ }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-testid='archive-media-card']").length ===
      8,
  );
  await waitForEmbedQueueToSettle();
  const gridInitial = {
    metrics: await readViewerMetrics(),
    maximumConcurrentEmbedRequests,
    totalEmbedRequests,
  };
  assertViewportBound("Grid View initial row", gridInitial.metrics);

  activeEmbedRequests = 0;
  maximumConcurrentEmbedRequests = 0;
  totalEmbedRequests = 0;
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-testid='archive-scroller']");
    const first = document.querySelector('[data-media-index="0"]');
    const nextRow = document.querySelector('[data-media-index="4"]');
    if (
      !(scroller instanceof HTMLElement) ||
      !(first instanceof HTMLElement) ||
      !(nextRow instanceof HTMLElement)
    ) {
      throw new Error("Grid row anchors are unavailable.");
    }
    scroller.scrollTop = nextRow.offsetTop + 2;
    scroller.dispatchEvent(new Event("scroll"));
  });
  await page.waitForFunction(() => {
    const scroller = document.querySelector("[data-testid='archive-scroller']");
    const nextRow = document.querySelector('[data-media-index="4"]');
    if (!(scroller instanceof HTMLElement) || !(nextRow instanceof HTMLElement))
      return false;
    const scrollerRect = scroller.getBoundingClientRect();
    const nextRowRect = nextRow.getBoundingClientRect();
    return (
      scroller.scrollTop > 0 &&
      nextRowRect.bottom > scrollerRect.top &&
      nextRowRect.top < scrollerRect.bottom
    );
  });
  await waitForEmbedQueueToSettle();
  const gridSecondRow = {
    metrics: await readViewerMetrics(),
    maximumConcurrentEmbedRequests,
    totalEmbedRequests,
  };
  assertViewportBound("Grid View second row", gridSecondRow.metrics);

  process.stdout.write(
    `${JSON.stringify(
      {
        viewerReadyMs,
        horizontal,
        gridInitial,
        gridSecondRow,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await context.close();
  await browser.close();
}
