import { describe, expect, it } from "vitest";
import {
  addWheelImpulse,
  advanceMomentum,
  advanceTargetedMomentum,
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

  it("preserves the accepted 120px wheel impulse rolling-stop profile", () => {
    let position = 0;
    let velocity = addWheelImpulse(0, 120);
    let frameCount = 0;

    while (frameCount < 100) {
      const frame = advanceMomentum(position, velocity, 1000 / 60, 0, 10_000);
      position = frame.position;
      velocity = frame.velocity;
      frameCount += 1;
      if (frame.settled) break;
    }

    expect(frameCount).toBe(42);
    expect(position).toBeCloseTo(530.84865, 5);
    expect(velocity).toBeCloseTo(0.0178897, 6);
  });

  it("comes to rest at a scroll boundary", () => {
    expect(advanceMomentum(990, 4, 16, 0, 1000)).toEqual({
      position: 1000,
      velocity: 0,
      settled: true,
    });
  });

  it("eases toward one exact target without overshooting", () => {
    let position = 0;
    let velocity = 0;
    const positions: number[] = [];

    for (let frameCount = 0; frameCount < 100; frameCount += 1) {
      const frame = advanceTargetedMomentum(position, velocity, 884, 1000 / 60);
      position = frame.position;
      velocity = frame.velocity;
      positions.push(position);
      if (frame.settled) break;
    }

    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[0]).toBeLessThan(884);
    expect(positions.every((value) => value >= 0 && value <= 884)).toBe(true);
    expect(position).toBe(884);
    expect(velocity).toBe(0);
    expect(positions.length).toBeGreaterThan(30);
    expect(positions.length).toBeLessThan(55);
  });

  it("preserves velocity while retargeting to another exact step", () => {
    const first = advanceTargetedMomentum(0, 0, 500, 1000 / 60);
    const second = advanceTargetedMomentum(
      first.position,
      first.velocity,
      1000,
      1000 / 60,
    );

    expect(first.position).toBeGreaterThan(0);
    expect(second.position).toBeGreaterThan(first.position);
    expect(second.velocity).toBeGreaterThan(first.velocity);
    expect(second.settled).toBe(false);
  });
});
