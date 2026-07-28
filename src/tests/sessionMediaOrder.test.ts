import { describe, expect, it } from "vitest";
import { extendSessionMediaOrder } from "../features/media/sessionMediaOrder";

describe("session media order", () => {
  it("shuffles new media once and preserves the existing session order", () => {
    const randomValues = [0.1, 0.8, 0.2];
    const random = () => randomValues.shift() ?? 0;
    const initial = extendSessionMediaOrder([], ["a", "b", "c", "d"], random);

    expect(initial).not.toEqual(["a", "b", "c", "d"]);
    expect(
      extendSessionMediaOrder(initial, ["b", "d"], () => {
        throw new Error("existing media must not be reshuffled");
      }),
    ).toBe(initial);
    expect(
      extendSessionMediaOrder(initial, ["a", "b", "c", "d", "e"], random),
    ).toEqual([...initial, "e"]);
  });

  it("can create independent orders for Horizontal and Grid views", () => {
    const ids = ["a", "b", "c", "d"];
    const horizontal = extendSessionMediaOrder([], ids, () => 0);
    const grid = extendSessionMediaOrder([], ids, () => 0.999);

    expect(horizontal).not.toEqual(grid);
    expect(new Set(horizontal)).toEqual(new Set(ids));
    expect(new Set(grid)).toEqual(new Set(ids));
  });
});
