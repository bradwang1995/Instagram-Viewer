import { describe, expect, it } from "vitest";
import { personCrop, usePersonFocus } from "../features/media/personFocus";

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
