// Bound in-flight work and discard requests for cards that have left the viewport.
export function createRequestQueue(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return function run<T>(
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        const index = waiting.indexOf(start);
        if (index >= 0) waiting.splice(index, 1);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const start = () => {
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) {
          abort();
          return;
        }
        active++;
        void task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            waiting.shift()?.();
          });
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      if (active < limit) start();
      else waiting.push(start);
    });
  };
}
