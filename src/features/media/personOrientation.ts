import type { PersonBox } from "./personFocus";

// Reclining people can be horizontal even though the photo is correctly tagged.
// A face at one side of the body identifies which quarter-turn puts the head up.
export function portraitRotation(
  body: PersonBox,
  faces: PersonBox[],
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
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!face) return;
  const dx = face.originX + face.width / 2 - (body.originX + body.width / 2);
  const dy = face.originY + face.height / 2 - (body.originY + body.height / 2);
  if (Math.abs(dx) < body.width * 0.15 || Math.abs(dx) <= Math.abs(dy) * 1.05)
    return 0;
  return dx < 0 ? 90 : -90;
}
