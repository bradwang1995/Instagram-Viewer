import { create } from "zustand";

function initialStrength() {
  try {
    const saved = localStorage.getItem("viewer:person-focus-strength");
    if (saved !== null && Number.isFinite(Number(saved)))
      return Math.max(0, Math.min(100, Number(saved)));
    return localStorage.getItem("viewer:person-focus") === "off" ? 0 : 100;
  } catch {
    return 100;
  }
}

export const usePersonFocus = create<{
  strength: number;
  setStrength: (value: number) => void;
}>((set) => ({
  strength: initialStrength(),
  setStrength: (value) => {
    const strength = Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : 0;
    try {
      localStorage.setItem("viewer:person-focus-strength", String(strength));
    } catch {
      /* Session preference still works. */
    }
    set({ strength });
  },
}));

export type PersonBox = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

// Include every detected person, with a small margin for detector uncertainty.
export function personCrop(width: number, height: number, boxes: PersonBox[]) {
  const valid = boxes.filter(
    (b) =>
      [b.originX, b.originY, b.width, b.height].every(Number.isFinite) &&
      b.width > 0 &&
      b.height > 0,
  );
  if (!valid.length) return null;
  const left = Math.max(0, Math.min(...valid.map((b) => b.originX)));
  const top = Math.max(0, Math.min(...valid.map((b) => b.originY)));
  const right = Math.min(
    width,
    Math.max(...valid.map((b) => b.originX + b.width)),
  );
  const bottom = Math.min(
    height,
    Math.max(...valid.map((b) => b.originY + b.height)),
  );
  if (right <= left || bottom <= top) return null;
  const padX = (right - left) * 0.02,
    padY = (bottom - top) * 0.04;
  const x = Math.max(0, left - padX),
    y = Math.max(0, top - padY);
  return {
    x,
    y,
    width: Math.min(width, right + padX) - x,
    height: Math.min(height, bottom + padY) - y,
  };
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
  const target = Math.min(viewWidth / crop.width, viewHeight / crop.height);
  if (target <= base * 1.025) return null;
  const scale = target / base;
  const drawnWidth = width * base,
    drawnHeight = height * base;
  const limitX = (width * target - Math.min(viewWidth, drawnWidth)) / 2;
  const limitY = (height * target - Math.min(viewHeight, drawnHeight)) / 2;
  const x = Math.max(
    -limitX,
    Math.min(limitX, (width / 2 - crop.x - crop.width / 2) * target),
  );
  const y = Math.max(
    -limitY,
    Math.min(limitY, (height / 2 - crop.y - crop.height / 2) * target),
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
