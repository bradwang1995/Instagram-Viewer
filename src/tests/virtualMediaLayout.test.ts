import { describe, expect, it } from "vitest";
import {
  getClosestRibbonIndex,
  getGridMetrics,
  getGridWindow,
  getRibbonMetrics,
  getRibbonWindow,
} from "../features/media/virtualMediaLayout";

describe("virtual media layout", () => {
  it("keeps a desktop grid to the visible row plus one preloaded row", () => {
    const metrics = getGridMetrics(1_800, 1920, 900);
    const firstWindow = getGridWindow(1_800, 0, metrics);
    const laterWindow = getGridWindow(
      1_800,
      metrics.paddingY + metrics.rowStride * 120,
      metrics,
    );

    expect(metrics.columns).toBe(4);
    expect(firstWindow[4].top).toBeGreaterThanOrEqual(900);
    expect(firstWindow).toHaveLength(8);
    expect(firstWindow.map((item) => item.index)).toEqual(
      Array.from({ length: 8 }, (_, index) => index),
    );
    expect(laterWindow).toHaveLength(8);
    expect(laterWindow[0].index).toBe(480);
    expect(metrics.totalHeight).toBeGreaterThan(900);
    const finalWindow = getGridWindow(
      1_800,
      metrics.totalHeight - 900,
      metrics,
    );
    expect(finalWindow[finalWindow.length - 1]?.index).toBe(1_799);
  });

  it("keeps the horizontal DOM window bounded while the full track stays reachable", () => {
    const metrics = getRibbonMetrics(
      Array.from({ length: 1_800 }, () => 0.78),
      1920,
      900,
    );
    const firstWindow = getRibbonWindow(metrics.layouts, 0, 1920);
    const middleOffset = metrics.layouts[900].left;
    const middleWindow = getRibbonWindow(metrics.layouts, middleOffset, 1920);

    expect(firstWindow.length).toBeLessThanOrEqual(8);
    expect(middleWindow.length).toBeLessThanOrEqual(9);
    expect(middleWindow.some((item) => item.index === 900)).toBe(true);
    expect(metrics.totalWidth).toBeGreaterThan(1_000_000);
    expect(
      getClosestRibbonIndex(metrics.layouts, middleOffset + 960),
    ).toBeGreaterThanOrEqual(900);

    const maxScroll = metrics.totalWidth - 1920;
    const finalWindow = getRibbonWindow(metrics.layouts, maxScroll, 1920);
    expect(finalWindow[finalWindow.length - 1]?.index).toBe(1_799);
    expect(getClosestRibbonIndex(metrics.layouts, maxScroll + 960)).toBe(
      1_799,
    );
  });

  it.each([
    { viewport: [390, 654], aspects: [0.62, 0.78, 1.65] },
    { viewport: [1280, 720], aspects: [1.65, 0.62, 1.2] },
    { viewport: [1920, 900], aspects: [0.62, 1.65, 0.78] },
    { viewport: [3440, 1200], aspects: [1.65, 0.62, 1.4] },
  ])(
    "keeps mixed-aspect ribbon windows bounded at $viewport",
    ({ viewport: [width, height], aspects }) => {
      const repeatedAspects = Array.from(
        { length: 1_800 },
        (_, index) => aspects[index % aspects.length],
      );
      const metrics = getRibbonMetrics(repeatedAspects, width, height);
      const offsets = [
        0,
        metrics.totalWidth / 2,
        Math.max(0, metrics.totalWidth - width),
      ];

      for (const offset of offsets) {
        const window = getRibbonWindow(metrics.layouts, offset, width);
        const visibleCount = metrics.layouts.filter(
          (layout) =>
            layout.left + layout.width >= offset &&
            layout.left <= offset + width,
        ).length;
        expect(window.length).toBeLessThanOrEqual(visibleCount + 4);
      }

      const finalWindow = getRibbonWindow(
        metrics.layouts,
        Math.max(0, metrics.totalWidth - width),
        width,
      );
      expect(finalWindow[finalWindow.length - 1]?.index).toBe(1_799);
    },
  );

  it("uses two tablet columns and one mobile column", () => {
    expect(getGridMetrics(100, 900, 700).columns).toBe(2);
    const mobile = getGridMetrics(100, 390, 654);
    expect(mobile.columns).toBe(1);
    expect(getGridWindow(100, 0, mobile)).toHaveLength(2);
    expect(getGridWindow(100, 0, mobile)[1].top).toBeGreaterThanOrEqual(654);
  });
});
