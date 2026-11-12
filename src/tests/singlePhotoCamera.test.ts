import { expect, it } from "vitest";
import { easeZoom, zoomAt } from "../features/media/singlePhotoCamera";

it("eases to the 6× limit while keeping the same source pixel under the pointer", () => {
  const photo = { width: 800, height: 600 };
  const view = { ...photo };
  const start = { zoom: 1, x: 0, y: 0, rotation: 0 };
  const target = zoomAt(start, photo, view, 100, -50, -5000);
  expect(target.zoom).toBe(6);
  const firstFrame = easeZoom(start, target, 16, 1);
  expect(firstFrame.zoom).toBeGreaterThan(1);
  expect(firstFrame.zoom).toBeLessThan(6);
  expect(firstFrame.x + 100 * firstFrame.zoom).toBeCloseTo(100);
  expect(firstFrame.y - 50 * firstFrame.zoom).toBeCloseTo(-50);
  let frame = firstFrame;
  for (let i = 0; i < 60; i++) frame = easeZoom(frame, target, 16, 1);
  expect(frame).toBe(target);
});
