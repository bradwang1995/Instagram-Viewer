import { describe, expect, it } from "vitest";
import {
  personCrop,
  personZoom,
  usePersonFocus,
} from "../features/media/personFocus";

describe("person focus crop", () => {
  it("keeps the original aspect ratio and includes the full person with padding", () => {
    const box = { originX: 220, originY: 500, width: 340, height: 620 };
    const crop = personCrop(900, 1160, [box])!;
    expect(crop.width / crop.height).toBeCloseTo(900 / 1160);
    expect(crop.x).toBeLessThan(box.originX);
    expect(crop.y).toBeLessThan(box.originY);
    expect(crop.x + crop.width).toBeGreaterThan(box.originX + box.width);
    expect(crop.y + crop.height).toBeGreaterThan(box.originY + box.height);
  });
  it("bounds crops at the edges and caps zoom for a tiny person", () => {
    const crop = personCrop(1200, 800, [
      { originX: 1190, originY: 0, width: 10, height: 20 },
    ])!;
    expect(crop.x + crop.width).toBeLessThanOrEqual(1200);
    expect(crop.y).toBe(0);
    expect(crop.width).toBe(200);
    expect(crop.width / crop.height).toBeCloseTo(1.5);
  });
  it("chooses the largest person and safely leaves no-person images alone", () => {
    const largest = { originX: 200, originY: 100, width: 400, height: 600 };
    expect(
      personCrop(1000, 1000, [
        { originX: 0, originY: 0, width: 10, height: 20 },
        largest,
      ]),
    ).toEqual(personCrop(1000, 1000, [largest]));
    expect(personCrop(1000, 1000, [])).toBeNull();
    expect(personCrop(1000, 1000, [{ ...largest, width: 0 }])).toBeNull();
  });
  it("defaults on and persists an off/on toggle", () => {
    expect(usePersonFocus.getState().enabled).toBe(true);
    usePersonFocus.getState().toggle();
    expect(localStorage.getItem("viewer:person-focus")).toBe("off");
    usePersonFocus.getState().toggle();
    expect(localStorage.getItem("viewer:person-focus")).toBe("on");
  });
});

it("preserves cover framing when the person is already large instead of shrinking to contain", () => {
  const crop = personCrop(900, 1200, [
    { originX: 0, originY: 100, width: 850, height: 1000 },
  ])!;
  expect(personZoom(900, 1200, 600, 600, crop, "cover")).toBeNull();
  expect(personZoom(900, 1200, 600, 600, crop, "contain")).toBeNull();
});

it("only increases the actual displayed size and never moves image edges into the existing viewport", () => {
  for (const fit of ["cover", "contain"]) {
    for (const [width, height, viewWidth, viewHeight] of [
      [900, 1200, 600, 600],
      [1200, 800, 300, 600],
      [900, 1200, 600, 300],
    ]) {
      for (const [x, y] of [
        [0, 0],
        [width - 100, height - 150],
        [width / 2, height / 2],
      ]) {
        const crop = personCrop(width, height, [
          { originX: x, originY: y, width: 100, height: 150 },
        ])!;
        const zoom = personZoom(
          width,
          height,
          viewWidth,
          viewHeight,
          crop,
          fit,
        );
        if (!zoom) continue;
        expect(zoom.scale).toBeGreaterThan(1);
        expect(Math.abs(zoom.x)).toBeLessThanOrEqual(
          (viewWidth * (zoom.scale - 1)) / 2 + 0.00001,
        );
        expect(Math.abs(zoom.y)).toBeLessThanOrEqual(
          (viewHeight * (zoom.scale - 1)) / 2 + 0.00001,
        );
        const base = (fit === "cover" ? Math.max : Math.min)(
          viewWidth / width,
          viewHeight / height,
        );
        expect(
          (width * base * zoom.scale) / 2 - Math.abs(zoom.x),
        ).toBeGreaterThanOrEqual(
          Math.min(viewWidth, width * base) / 2 - 0.00001,
        );
        expect(
          (height * base * zoom.scale) / 2 - Math.abs(zoom.y),
        ).toBeGreaterThanOrEqual(
          Math.min(viewHeight, height * base) / 2 - 0.00001,
        );
      }
    }
  }
});
