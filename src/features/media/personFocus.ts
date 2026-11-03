import { create } from "zustand";

function initialPreference() {
  try {
    return localStorage.getItem("viewer:person-focus") !== "off";
  } catch {
    return true;
  }
}

export const usePersonFocus = create<{ enabled: boolean; toggle: () => void }>(
  (set) => ({
    enabled: initialPreference(),
    toggle: () =>
      set(({ enabled }) => {
        try {
          localStorage.setItem("viewer:person-focus", enabled ? "off" : "on");
        } catch {
          /* Session preference still works. */
        }
        return { enabled: !enabled };
      }),
  }),
);

export type PersonBox = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

// Keep the original orientation and aspect ratio, with breathing room on all sides.
export function personCrop(width: number, height: number, boxes: PersonBox[]) {
  const box = boxes
    .filter((b) => b.width > 0 && b.height > 0)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!box) return null;
  const cropWidth = Math.min(
    width,
    Math.max(box.width * 1.16, (box.height * 1.12 * width) / height, width / 6),
  );
  const cropHeight = (cropWidth * height) / width;
  const x = Math.max(
    0,
    Math.min(width - cropWidth, box.originX + box.width / 2 - cropWidth / 2),
  );
  const y = Math.max(
    0,
    Math.min(
      height - cropHeight,
      box.originY + box.height / 2 - cropHeight / 2,
    ),
  );
  return { x, y, width: cropWidth, height: cropHeight };
}
