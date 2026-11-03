// A cancelled view releases only its subscription. Shared work stops when nobody needs it.
export function createSharedRequests() {
  const pending = new Map();
  return (key, work, signal) => {
    if (signal?.aborted)
      return Promise.reject(new DOMException("Cancelled", "AbortError"));
    let request = pending.get(key);
    if (!request) {
      const next = {
        controller: new AbortController(),
        users: 0,
        settled: false,
        promise: undefined,
      };
      next.promise = Promise.resolve()
        .then(() => {
          next.controller.signal.throwIfAborted();
          return work(next.controller.signal);
        })
        .finally(() => {
          next.settled = true;
          if (pending.get(key) === next) pending.delete(key);
        });
      pending.set(key, next);
      request = next;
    }
    const current = request;
    current.users++;
    return new Promise((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return false;
        released = true;
        signal?.removeEventListener("abort", abort);
        current.users--;
        if (!current.users && !current.settled) {
          if (pending.get(key) === current) pending.delete(key);
          current.controller.abort();
        }
        return true;
      };
      const abort = () => {
        if (release()) reject(new DOMException("Cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      current.promise.then(
        (value) => {
          if (release()) resolve(value);
        },
        (error) => {
          if (release()) reject(error);
        },
      );
    });
  };
}
