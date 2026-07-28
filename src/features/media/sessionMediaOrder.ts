export function extendSessionMediaOrder(
  previousIds: string[],
  currentIds: string[],
  random: () => number = Math.random,
): string[] {
  const knownIds = new Set(previousIds);
  const newIds = currentIds.filter((id) => !knownIds.has(id));

  for (let index = newIds.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [newIds[index], newIds[swapIndex]] = [newIds[swapIndex], newIds[index]];
  }

  return newIds.length ? [...previousIds, ...newIds] : previousIds;
}
