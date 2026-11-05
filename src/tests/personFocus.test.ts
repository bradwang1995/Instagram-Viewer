import { describe, expect, it } from "vitest";
import {
  personCrop,
  personZoom,
  usePersonFocus,
} from "../features/media/personFocus";
describe("person focus strength", () => {
  it("starts at zero and clamps the session slider", () => {
    expect(usePersonFocus.getState().strength).toBe(0);
    usePersonFocus.getState().setStrength(0);
    expect(usePersonFocus.getState().strength).toBe(0);
    usePersonFocus.getState().setStrength(45);
    expect(usePersonFocus.getState().strength).toBe(45);
    usePersonFocus.getState().setStrength(120);
    expect(usePersonFocus.getState().strength).toBe(100);
    usePersonFocus.getState().setStrength(250);
    expect(usePersonFocus.getState().strength).toBe(100);
  });
  it("selects the dominant foreground person independently of background people and order", () => {
    const main = { originX: 300, originY: 400, width: 250, height: 500 };
    const background = { originX: 20, originY: 650, width: 40, height: 120 };
    for (const boxes of [
      [main, background],
      [background, main],
    ]) {
      expect(personCrop(1000, 1000, boxes)).toEqual({
        x: 300,
        y: 400,
        width: 250,
        height: 500,
      });
    }
    expect(personCrop(1000, 1000, [])).toBeNull();
    expect(
      personCrop(1000, 1000, [
        { originX: NaN, originY: 0, width: 20, height: 40 },
      ]),
    ).toBeNull();
    expect(
      personCrop(1000, 1000, [
        { originX: -20, originY: 800, width: 100, height: 300 },
      ]),
    ).toEqual({ x: 0, y: 800, width: 80, height: 200 });
  });
  it("does not focus distant bystanders when the main person was missed", () => {
    expect(
      personCrop(918, 1125, [
        { originX: 288, originY: 597, width: 10, height: 30 },
        { originX: 866, originY: 574, width: 19, height: 62 },
      ]),
    ).toBeNull();
    expect(
      personCrop(1000, 800, [
        { originX: 100, originY: 200, width: 500, height: 140, rotation: 90 },
      ]),
    ).toEqual({ x: 100, y: 200, width: 500, height: 140, rotation: 90 });
  });
  it("keeps 0 original and interpolates to a head-aligned close crop", () => {
    const width = 900,
      height = 1200,
      vw = 500,
      vh = 600;
    const crop = personCrop(width, height, [
      { originX: 200, originY: 150, width: 300, height: 600 },
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
        vw / 2 + (crop.x + crop.width / 2 - width / 2) * pixels + full.x,
      ).toBeCloseTo(vw / 2);
      expect(vh / 2 + (crop.y - height / 2) * pixels + full.y).toBeCloseTo(0);
      expect(
        vh / 2 + (crop.y + crop.height - height / 2) * pixels + full.y,
      ).toBeGreaterThan(vh);
      expect(vh / (crop.height * 0.96)).toBeCloseTo(pixels);
      expect(full.drawnWidth / full.drawnHeight).toBeCloseTo(width / height);
    }
  });
  it("gives standing and kneeling people different per-photo scales and offsets without a width cap", () => {
    const standing = { x: 300, y: 400, width: 300, height: 500 };
    const kneeling = { x: 400, y: 650, width: 400, height: 300 };
    const a = personZoom(1000, 1000, 600, 900, standing, "cover")!;
    const b = personZoom(1000, 1000, 600, 900, kneeling, "cover")!;
    expect(b.scale).toBeGreaterThan(a.scale);
    expect(b.x).not.toBe(a.x);
    expect(b.y).not.toBe(a.y);
    for (const [crop, z] of [
      [standing, a],
      [kneeling, b],
    ] as const) {
      const pixels = (z.drawnHeight / 1000) * z.scale;
      expect(450 + (crop.y - 500) * pixels + z.y).toBeCloseTo(0);
      expect(450 + (crop.y + crop.height - 500) * pixels + z.y).toBeCloseTo(
        900 / 0.96,
      );
    }
  });
  it("never shrinks already-large people", () => {
    const crop = personCrop(900, 1200, [
      { originX: 0, originY: 100, width: 900, height: 1000 },
    ])!;
    expect(personZoom(900, 1200, 600, 600, crop, "cover")!.scale).toBe(1);
  });
  it("keeps the 100 percent endpoint when given an out-of-range strength", () => {
    const crop = { x: 300, y: 100, width: 250, height: 900 };
    expect(personZoom(1000, 1200, 500, 600, crop, "contain", 200)).toEqual(
      personZoom(1000, 1200, 500, 600, crop, "contain", 100),
    );
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
          [width - 150, height - 300],
        ]) {
          const crop = personCrop(width, height, [
            { originX: x, originY: y, width: 150, height: 300 },
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
            if (amount === 100) {
              const pixels = (z.drawnWidth / width) * z.scale;
              expect(vh / 2 + (crop.y - height / 2) * pixels + z.y).toBeCloseTo(
                0,
              );
            }
          }
        }
  });
});
