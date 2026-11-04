import { describe, expect, it } from "vitest";
import {
  personCrop,
  personZoom,
  usePersonFocus,
} from "../features/media/personFocus";
describe("person focus strength", () => {
  it("defaults to full focus and persists/clamps the slider", () => {
    expect(usePersonFocus.getState().strength).toBe(100);
    usePersonFocus.getState().setStrength(0);
    expect(localStorage.getItem("viewer:person-focus-strength")).toBe("0");
    usePersonFocus.getState().setStrength(45);
    expect(usePersonFocus.getState().strength).toBe(45);
    usePersonFocus.getState().setStrength(120);
    expect(usePersonFocus.getState().strength).toBe(100);
  });
  it("includes all people with a small margin and rejects invalid boxes", () => {
    const crop = personCrop(1000, 1000, [
      { originX: 50, originY: 100, width: 100, height: 400 },
      { originX: 700, originY: 300, width: 150, height: 500 },
    ])!;
    expect(crop.x).toBeLessThan(50);
    expect(crop.y).toBeLessThan(100);
    expect(crop.x + crop.width).toBeGreaterThan(850);
    expect(crop.y + crop.height).toBeGreaterThan(800);
    expect(personCrop(1000, 1000, [])).toBeNull();
    expect(
      personCrop(1000, 1000, [
        { originX: NaN, originY: 0, width: 20, height: 40 },
      ]),
    ).toBeNull();
  });
  it("keeps 0 original, interpolates smoothly, and maximizes without cutting off people", () => {
    const width = 900,
      height = 1200,
      vw = 500,
      vh = 600;
    const crop = personCrop(width, height, [
      { originX: 200, originY: 300, width: 300, height: 600 },
    ])!;
    for (const fit of ["cover", "contain"]) {
      expect(personZoom(width, height, vw, vh, crop, fit, 0)).toBeNull();
      const full = personZoom(width, height, vw, vh, crop, fit, 100)!;
      const half = personZoom(width, height, vw, vh, crop, fit, 50)!;
      expect(half.scale).toBeCloseTo((1 + full.scale) / 2);
      expect(half.x).toBeCloseTo(full.x / 2);
      expect(half.y).toBeCloseTo(full.y / 2);
      const base = full.drawnWidth / width,
        pixels = base * full.scale;
      expect(
        vw / 2 + (crop.x - width / 2) * pixels + full.x,
      ).toBeGreaterThanOrEqual(-0.00001);
      expect(
        vw / 2 + (crop.x + crop.width - width / 2) * pixels + full.x,
      ).toBeLessThanOrEqual(vw + 0.00001);
      expect(
        vh / 2 + (crop.y - height / 2) * pixels + full.y,
      ).toBeGreaterThanOrEqual(-0.00001);
      expect(
        vh / 2 + (crop.y + crop.height - height / 2) * pixels + full.y,
      ).toBeLessThanOrEqual(vh + 0.00001);
      expect(Math.min(vw / crop.width, vh / crop.height)).toBeCloseTo(pixels);
      expect(full.drawnWidth / full.drawnHeight).toBeCloseTo(width / height);
    }
  });
  it("never shrinks already-large people", () => {
    const crop = personCrop(900, 1200, [
      { originX: 0, originY: 100, width: 850, height: 1000 },
    ])!;
    expect(personZoom(900, 1200, 600, 600, crop, "cover")).toBeNull();
  });
  it("keeps the original image footprint covered for edge subjects at every strength", () => {
    for (const fit of ["cover", "contain"])
      for (const [width, height, vw, vh] of [
        [900, 1200, 600, 600],
        [1200, 800, 300, 600],
        [900, 1200, 600, 300],
      ])
        for (const [x, y] of [
          [0, 0],
          [width - 100, height - 150],
        ]) {
          const crop = personCrop(width, height, [
            { originX: x, originY: y, width: 100, height: 150 },
          ])!;
          for (const amount of [1, 25, 50, 75, 100]) {
            const z = personZoom(width, height, vw, vh, crop, fit, amount);
            if (!z) continue;
            expect(z.scale).toBeGreaterThan(1);
            expect(
              (z.drawnWidth * z.scale) / 2 - Math.abs(z.x),
            ).toBeGreaterThanOrEqual(Math.min(vw, z.drawnWidth) / 2 - 0.00001);
            expect(
              (z.drawnHeight * z.scale) / 2 - Math.abs(z.y),
            ).toBeGreaterThanOrEqual(Math.min(vh, z.drawnHeight) / 2 - 0.00001);
          }
        }
  });
});
