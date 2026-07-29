import { describe, expect, it } from "vitest";
import {
  addWheelImpulse,
  advanceMomentum,
} from "../features/media/scrollMomentum";

describe("scroll momentum", () => {
  it("adds bounded wheel velocity in either direction", () => {
    expect(addWheelImpulse(0, 100)).toBeGreaterThan(0);
    expect(addWheelImpulse(0, -100)).toBeLessThan(0);
    expect(addWheelImpulse(0, 100_000)).toBe(4.8);
    expect(addWheelImpulse(0, -100_000)).toBe(-4.8);
  });

  it("decelerates across multiple frames without jumping to a target", () => {
    const first = advanceMomentum(0, 3.2, 1000 / 60, 0, 10_000);
    const second = advanceMomentum(
      first.position,
      first.velocity,
      1000 / 60,
      0,
      10_000,
    );

    expect(first.position).toBeGreaterThan(0);
    expect(second.position).toBeGreaterThan(first.position);
    expect(second.position - first.position).toBeLessThan(first.position);
    expect(second.velocity).toBeLessThan(first.velocity);
    expect(first.settled).toBe(false);
  });

  it("comes to rest at a scroll boundary", () => {
    expect(advanceMomentum(990, 4, 16, 0, 1000)).toEqual({
      position: 1000,
      velocity: 0,
      settled: true,
    });
  });
});
