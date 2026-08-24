import { describe, expect, it } from "vitest";
import {
  getClosestRibbonIndex,
  getGridMetrics,
  getGridWindow,
  getRetainedMediaLayouts,
  getRibbonMetrics,
  getRibbonWindow,
} from "../features/media/virtualMediaLayout";

describe("virtual media layout", () => {
  it("uses edge-aligned half-gap grids and a near-full-height half-gap ribbon", () => {
    const grid = getGridMetrics(100, 1920, 900);
    const ribbon = getRibbonMetrics([0.78, 0.78], 1920, 900);
    const [first, second] = ribbon.layouts;

    expect(grid.columns).toBe(4);
    expect(grid.paddingX).toBe(0);
    expect(grid.columnGap).toBeCloseTo(17.28, 5);
    expect(grid.rowGap).toBeCloseTo(11.25, 5);
    expect(first.height).toBe(891);
    expect(first.top).toBeCloseTo(4.5, 5);
    expect(second.left - first.left - first.width).toBeCloseTo(21.12, 5);
  });

  it("keeps a dense desktop grid to visible rows plus bounded preload", () => {
    const metrics = getGridMetrics(1_800, 1920, 900);
    const firstWindow = getGridWindow(1_800, 0, metrics);
    const laterWindow = getGridWindow(
      1_800,
      metrics.paddingY + metrics.rowStride * 120,
      metrics,
    );

    expect(metrics.columns).toBe(4);
    expect(firstWindow[8].top).toBeGreaterThanOrEqual(850);
    expect(firstWindow).toHaveLength(16);
    expect(firstWindow.map((item) => item.index)).toEqual(
      Array.from({ length: 16 }, (_, index) => index),
    );
    expect(laterWindow).toHaveLength(16);
    expect(laterWindow[0].index).toBe(476);
    expect(laterWindow.some((item) => item.index === 480)).toBe(true);
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

    expect(firstWindow.length).toBeLessThanOrEqual(9);
    expect(middleWindow.length).toBeLessThanOrEqual(11);
    expect(middleWindow.some((item) => item.index === 900)).toBe(true);
    expect(metrics.totalWidth).toBeGreaterThan(1_000_000);
    expect(
      getClosestRibbonIndex(metrics.layouts, middleOffset + 960),
    ).toBeGreaterThanOrEqual(900);

    const maxScroll = metrics.totalWidth - 1920;
    const finalWindow = getRibbonWindow(metrics.layouts, maxScroll, 1920);
    expect(finalWindow[finalWindow.length - 1]?.index).toBe(1_799);
    expect(getClosestRibbonIndex(metrics.layouts, maxScroll + 960)).toBe(1_799);
  });

  it.each([
    { axis: "horizontal" as const, start: "left" as const },
    { axis: "vertical" as const, start: "top" as const },
  ])(
    "retains exactly one viewport behind, current, and one ahead on the $axis axis",
    ({ axis, start }) => {
      const layouts = Array.from({ length: 5 }, (_, index) => ({
        index,
        left: start === "left" ? index * 100 : 0,
        top: start === "top" ? index * 100 : 0,
        width: 100,
        height: 100,
      }));

      expect(getRetainedMediaLayouts(layouts, 200, 100, axis)).toEqual(
        layouts.slice(1, 4),
      );
      expect(getRetainedMediaLayouts(layouts, 0, 100, axis)).toEqual(
        layouts.slice(0, 2),
      );
    },
  );

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
        expect(window.length).toBeLessThanOrEqual(visibleCount + 6);
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
    expect(getGridWindow(100, 0, mobile)).toHaveLength(3);
    expect(getGridWindow(100, 0, mobile)[1].top).toBeLessThan(654);
  });
});
