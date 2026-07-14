export function shuffleArray<T>(input: T[]): T[] {
  const arr = [...input];

  for (let index = arr.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [arr[index], arr[swapIndex]] = [arr[swapIndex], arr[index]];
  }

  return arr;
}
