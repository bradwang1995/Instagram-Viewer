export function getAdjacentItemId(
  ids: string[],
  currentId: string | undefined,
  direction: 1 | -1,
): string | undefined {
  if (ids.length === 0) {
    return undefined;
  }

  const currentIndex = currentId ? ids.indexOf(currentId) : -1;
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (startIndex + direction + ids.length) % ids.length;
  return ids[nextIndex];
}
