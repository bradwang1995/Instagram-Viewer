import { create } from "zustand";

// Start each page visit at the original framing, even after an earlier high setting.
export const usePersonFocus = create<{
  strength: number;
  pending: number;
  sharpen: boolean;
  autoRotate: boolean;
  peopleOnly: boolean;
  people: Record<string, boolean | undefined>;
  setStrength: (value: number) => void;
}>((set) => ({
  strength: 0,
  pending: 0,
  sharpen: false,
  autoRotate: false,
  peopleOnly: false,
  people: {},
  setStrength: (value) =>
    set({
      strength: Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 0,
    }),
}));
export type PersonBox = {
  originX: number;
  originY: number;
  width: number;
  height: number;
  rotation?: 90 | -90;
};

// Prefer the dominant foreground person; distant bystanders must not widen the crop.
export function personCrop(width: number, height: number, boxes: PersonBox[]) {
  const valid = boxes.filter(
    (b) =>
      [b.originX, b.originY, b.width, b.height].every(Number.isFinite) &&
      b.width > 0 &&
      b.height > 0,
  );
  const candidates = valid
    .map((b) => {
      const x = Math.max(0, b.originX),
        y = Math.max(0, b.originY);
      return {
        x,
        y,
        width: Math.min(width, b.originX + b.width) - x,
        height: Math.min(height, b.originY + b.height) - y,
        ...(b.rotation ? { rotation: b.rotation } : {}),
      };
    })
    .filter((b) => b.width > 0 && b.height > 0)
    // Keep tiny detections in the worker result for People Only, but do not
    // mistake a distant bystander for the intended focus subject.
    .filter((b) => {
      const relativeHeight = b.rotation ? b.width / width : b.height / height;
      return (
        relativeHeight >= 0.2 || b.width * b.height >= width * height * 0.02
      );
    });
  candidates.sort(
    (a, b) =>
      b.width * b.height - a.width * a.height ||
      Math.abs(a.x + a.width / 2 - width / 2) -
        Math.abs(b.x + b.width / 2 - width / 2),
  );
  return candidates[0] ?? null;
}

export function personZoom(
  width: number,
  height: number,
  viewWidth: number,
  viewHeight: number,
  crop: NonNullable<ReturnType<typeof personCrop>>,
  fit: string,
  strength = 100,
) {
  if (Math.min(width, height, viewWidth, viewHeight) <= 0 || strength <= 0)
    return null;
  const base = (fit === "cover" ? Math.max : Math.min)(
    viewWidth / width,
    viewHeight / height,
  );
  // Each photo fills the frame vertically with its own subject. At full focus,
  // the head reaches the top and the lowest ~4% may fall below the bottom.
  // A width cap would leave short/seated subjects and beach photos far away.
  const closeup = Math.max(0, Math.min(1, (strength - 100) / 100));
  const target = Math.max(
    base,
    viewHeight / (crop.height * (0.96 - 0.46 * closeup)),
  );
  const centerX = crop.x + crop.width / 2;
  const scale = target / base;
  const drawnWidth = width * base,
    drawnHeight = height * base;
  const limitX = (width * target - Math.min(viewWidth, drawnWidth)) / 2;
  const limitY = (height * target - Math.min(viewHeight, drawnHeight)) / 2;
  const x = Math.max(-limitX, Math.min(limitX, (width / 2 - centerX) * target));
  const y = Math.max(
    -limitY,
    Math.min(limitY, -viewHeight / 2 + (height / 2 - crop.y) * target),
  );
  const progress = Math.min(100, strength) / 100;
  return {
    scale: 1 + (scale - 1) * progress,
    x: x * progress,
    y: y * progress,
    drawnWidth,
    drawnHeight,
  };
}
