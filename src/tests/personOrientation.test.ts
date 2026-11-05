import { expect, it } from "vitest";
import { portraitRotation } from "../features/media/personOrientation";
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
