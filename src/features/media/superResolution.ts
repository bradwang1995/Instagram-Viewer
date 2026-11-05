type Result = { url?: string; error?: string };
type Subscriber = {
  resolve: (result: Result) => void;
  progress: (value: number) => void;
};
type Job = {
  id: number;
  url: string;
  subscribers: Set<Subscriber>;
  cancelled?: boolean;
  image?: HTMLImageElement;
};
const cache = new Map<string, string>();
const jobs = new Map<string, Job>();
const queue: Job[] = [];
let worker: Worker | undefined;
let active: Job | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

function finish(result: Result) {
  if (!active) return;
  clearTimeout(timer);
  const job = active;
  active = undefined;
  if (jobs.get(job.url) === job) jobs.delete(job.url);
  for (const subscriber of job.subscribers) subscriber.resolve(result);
  pump();
}
function fail() {
  worker?.terminate();
  worker = undefined;
  clearTimeout(timer);
  const pending = [...jobs.values()];
  jobs.clear();
  queue.length = 0;
  active = undefined;
  for (const job of pending)
    for (const subscriber of job.subscribers)
      subscriber.resolve({
        error: "Super Resolution unavailable; original photo retained",
      });
}
function pump() {
  if (active) return;
  let job: Job | undefined;
  while ((job = queue.shift())) {
    if (job.subscribers.size) break;
    if (jobs.get(job.url) === job) jobs.delete(job.url);
  }
  if (!job) return;
  active = job;
  try {
    if (!worker) {
      worker = new Worker(
        new URL("./superResolution.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.onmessage = ({
        data,
      }: MessageEvent<{
        id: number;
        progress?: number;
        blob?: Blob;
        error?: string;
      }>) => {
        if (data.id !== active?.id) return;
        if (data.progress !== undefined) {
          for (const subscriber of active.subscribers)
            subscriber.progress(Math.round(data.progress * 100));
          return;
        }
        if (data.blob && active.subscribers.size) {
          const url = URL.createObjectURL(data.blob);
          cache.set(active.url, url);
          if (cache.size > 4) {
            const oldest = cache.keys().next().value!;
            URL.revokeObjectURL(cache.get(oldest)!);
            cache.delete(oldest);
          }
          finish({ url });
        } else finish({ error: data.error ?? "Enhancement cancelled" });
      };
    }
    timer = setTimeout(fail, 300_000);
    const message = {
      id: job.id,
      url: new URL(job.url, window.location.href).href,
      baseUrl: new URL(import.meta.env.BASE_URL, window.location.href).href,
    };
    const current = job;
    const target = worker;
    const currentJob = job;
    const sendUrl = () => {
      if (active !== currentJob) return;
      try {
        target.postMessage(message);
      } catch {
        fail();
      }
    };
    if (job.image && typeof createImageBitmap !== "undefined") {
      void createImageBitmap(job.image)
        .then((bitmap) => {
          if (active !== current) {
            bitmap.close();
            return;
          }
          if (current.cancelled || !current.subscribers.size) {
            bitmap.close();
            finish({});
            return;
          }
          try {
            target.postMessage({ ...message, bitmap }, [bitmap]);
          } catch {
            bitmap.close();
            sendUrl();
          }
        })
        .catch(() => {
          sendUrl();
        });
    } else sendUrl();
  } catch {
    fail();
  }
}

// Process only requested visible photos, one at a time, with bounded blob caching.
export function enhancePhoto(
  url: string,
  signal: AbortSignal,
  progress: (value: number) => void,
  image?: HTMLImageElement,
): Promise<Result> {
  if (signal.aborted || typeof Worker === "undefined")
    return Promise.resolve({ error: "Super Resolution unavailable" });
  const cached = cache.get(url);
  if (cached) return Promise.resolve({ url: cached });
  return new Promise((resolve) => {
    let job = jobs.get(url);
    if (!job || job.cancelled) {
      job = { id: ++nextId, url, subscribers: new Set(), image };
      jobs.set(url, job);
      queue.push(job);
    }
    const subscribed = job;
    const subscriber: Subscriber = {
      progress,
      resolve: (result) => {
        signal.removeEventListener("abort", abort);
        subscribed.subscribers.delete(subscriber);
        resolve(result);
      },
    };
    const abort = () => {
      subscriber.resolve({});
      if (subscribed === active && !subscribed.subscribers.size) {
        subscribed.cancelled = true;
        worker?.postMessage({ id: subscribed.id, cancel: true });
      }
    };
    subscribed.subscribers.add(subscriber);
    signal.addEventListener("abort", abort, { once: true });
    pump();
  });
}
