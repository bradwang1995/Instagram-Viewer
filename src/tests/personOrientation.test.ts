import { expect, it } from "vitest";
import {
  portraitRotation,
  restoreFaceBox,
} from "../features/media/personOrientation";
const body = { originX: 100, originY: 100, width: 800, height: 600 };
it("turns a reclining person head-up according to the face position", () => {
  expect(
    portraitRotation(body, [
      { originX: 150, originY: 200, width: 100, height: 100 },
    ]),
  ).toBe(90);
  expect(
    portraitRotation(body, [
      { originX: 750, originY: 200, width: 100, height: 100 },
    ]),
  ).toBe(-90);
});
it("prefers a confident head detection over a larger false face on the body", () => {
  expect(
    portraitRotation(body, [
      { originX: 350, originY: 200, width: 300, height: 300, confidence: 0.55 },
      { originX: 750, originY: 200, width: 100, height: 100, confidence: 0.85 },
    ]),
  ).toBe(-90);
});
it.each([
  [0, { originX: 193, originY: 34, width: 47, height: 47 }],
  [90, { originX: 118, originY: 193, width: 47, height: 47 }],
  [-90, { originX: 34, originY: 45, width: 47, height: 47 }],
] as const)(
  "maps a face detected at %s degrees back to original photo pixels",
  (rotation, face) => {
    expect(
      restoreFaceBox(
        face,
        { originX: 428, originY: 650, width: 285, height: 199 },
        285,
        199,
        rotation,
      ),
    ).toEqual({ originX: 621, originY: 684, width: 47, height: 47 });
  },
);
it("keeps upright subjects untouched and ignores faces outside the primary person", () => {
  expect(
    portraitRotation(body, [
      { originX: 450, originY: 120, width: 100, height: 100 },
    ]),
  ).toBe(0);
  expect(
    portraitRotation(body, [{ originX: 0, originY: 0, width: 40, height: 40 }]),
  ).toBeUndefined();
  expect(portraitRotation(body, [])).toBeUndefined();
});
