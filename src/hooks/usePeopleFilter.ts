import { useMemo } from "react";
import { usePersonFocus } from "../features/media/personFocus";
import type { MediaQueueItem } from "../features/media/mediaQueue";

// Unknown/failed detections remain visible; loaded cards progressively classify.
export function usePeopleFilter(items: MediaQueueItem[]) {
  const enabled = usePersonFocus((s) => s.peopleOnly);
  const people = usePersonFocus((s) => s.people);
  return useMemo(
    () =>
      enabled ? items.filter((item) => people[item.media.id] !== false) : items,
    [items, enabled, people],
  );
}
