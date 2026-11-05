import type { PersonBox } from "./personFocus";

// Reclining people can be horizontal even though the photo is correctly tagged.
// A face at one side of the body identifies which quarter-turn puts the head up.
export function portraitRotation(
  body: PersonBox,
  faces: (PersonBox & { confidence?: number })[],
): 90 | -90 | 0 | undefined {
  const face = faces
    .filter((face) => {
      const x = face.originX + face.width / 2;
      const y = face.originY + face.height / 2;
      return (
        x >= body.originX &&
        x <= body.originX + body.width &&
        y >= body.originY &&
        y <= body.originY + body.height
      );
    })
    .sort(
      (a, b) =>
        (b.confidence ?? 0) - (a.confidence ?? 0) ||
        b.width * b.height - a.width * a.height,
    )[0];
  if (!face) return;
  const dx = face.originX + face.width / 2 - (body.originX + body.width / 2);
  const dy = face.originY + face.height / 2 - (body.originY + body.height / 2);
  if (Math.abs(dx) < body.width * 0.15 || Math.abs(dx) <= Math.abs(dy) * 1.05)
    return 0;
  return dx < 0 ? 90 : -90;
}

export function restoreFaceBox(
  face: PersonBox,
  region: PersonBox,
  pixelWidth: number,
  pixelHeight: number,
  rotation: 0 | 90 | -90,
): PersonBox {
  const local =
    rotation === 90
      ? {
          originX: face.originY,
          originY: pixelHeight - face.originX - face.width,
          width: face.height,
          height: face.width,
        }
      : rotation === -90
        ? {
            originX: pixelWidth - face.originY - face.height,
            originY: face.originX,
            width: face.height,
            height: face.width,
          }
        : face;
  return {
    originX: region.originX + (local.originX * region.width) / pixelWidth,
    originY: region.originY + (local.originY * region.height) / pixelHeight,
    width: (local.width * region.width) / pixelWidth,
    height: (local.height * region.height) / pixelHeight,
  };
}
