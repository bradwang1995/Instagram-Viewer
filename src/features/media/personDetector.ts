import type { PersonBox } from "./personFocus";

type Job = {
  id: number;
  url: string;
  width: number;
  height: number;
  image?: HTMLImageElement;
  listeners: Set<(boxes: PersonBox[] | null) => void>;
};
const cache = new Map<string, PersonBox[]>();
const jobs = new Map<string, Job>();
const queue: Job[] = [];
let worker: Worker | undefined;
let active: Job | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

function finish(boxes: PersonBox[] | null) {
  if (!active) return;
  clearTimeout(timer);
  if (boxes !== null) cache.set(active.url, boxes);
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  jobs.delete(active.url);
  for (const resolve of active.listeners) resolve(boxes);
  active = undefined;
  pump();
}

function failWorker() {
  clearTimeout(timer);
  worker?.terminate();
  worker = undefined;
  for (const job of jobs.values())
    for (const resolve of job.listeners) resolve(null);
  jobs.clear();
  queue.length = 0;
  active = undefined;
}

function pump() {
  if (active) return;
  let job: Job | undefined;
  while ((job = queue.shift())) {
    if (job.listeners.size) break;
    jobs.delete(job.url);
  }
  if (!job) return;
  active = job;
  try {
    if (!worker) {
      worker = new Worker(
        new URL("./personDetector.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (
        event: MessageEvent<{
          id: number;
          boxes: PersonBox[];
          failed?: boolean;
        }>,
      ) => {
        if (event.data.id === active?.id)
          finish(event.data.failed ? null : event.data.boxes);
      };
      worker.onerror = failWorker;
      worker.onmessageerror = failWorker;
    }
    timer = setTimeout(failWorker, 45_000);
    const message = {
      id: job.id,
      url: new URL(job.url, window.location.href).href,
      width: job.width,
      height: job.height,
      baseUrl: new URL(import.meta.env.BASE_URL, window.location.href).href,
    };
    const target = worker;
    const currentJob = job;
    const sendUrl = () => {
      if (active !== currentJob) return;
      try {
        target.postMessage(message);
      } catch {
        failWorker();
      }
    };
    if (job.image && typeof createImageBitmap !== "undefined") {
      const ratio = Math.min(1, 1280 / Math.max(job.width, job.height));
      const current = job;
      void createImageBitmap(job.image, {
        resizeWidth: Math.max(1, Math.round(job.width * ratio)),
        resizeHeight: Math.max(1, Math.round(job.height * ratio)),
      })
        .then((bitmap) => {
          if (active !== current) {
            bitmap.close();
            return;
          }
          if (!current.listeners.size) {
            bitmap.close();
            finish(null);
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
    failWorker();
  }
}

// One background inference at a time; abandoning a card removes its queued work.
export function detectPerson(
  url: string,
  width: number,
  height: number,
  signal: AbortSignal,
  image?: HTMLImageElement,
): Promise<PersonBox[] | null> {
  if (signal.aborted || typeof Worker === "undefined")
    return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    let job = jobs.get(url);
    if (!job) {
      job = { id: ++nextId, url, width, height, image, listeners: new Set() };
      jobs.set(url, job);
      queue.push(job);
    }
    const subscribedJob = job;
    const complete = (boxes: PersonBox[] | null) => {
      signal.removeEventListener("abort", abort);
      subscribedJob.listeners.delete(complete);
      resolve(boxes);
    };
    const abort = () => complete([]);
    job.listeners.add(complete);
    signal.addEventListener("abort", abort, { once: true });
    pump();
  });
}
