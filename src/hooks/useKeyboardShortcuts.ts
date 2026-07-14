import { useEffect } from "react";

export type KeyboardShortcutMap = Record<string, (event: KeyboardEvent) => void>;

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcutMap,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTyping && event.key !== "Escape") {
        return;
      }

      const handler = shortcuts[event.key];

      if (handler) {
        handler(event);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, shortcuts]);
}
