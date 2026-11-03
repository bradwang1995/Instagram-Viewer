export function createSharedRequests<T>(): (
  key: string,
  work: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>;
