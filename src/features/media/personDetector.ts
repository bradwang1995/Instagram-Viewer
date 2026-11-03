import type { PersonBox } from "./personFocus";

type Job = {
  id: number;
  url: string;
  width: number;
  height: number;
  listeners: Set<(boxes: PersonBox[]) => void>;
};
const cache = new Map<string, PersonBox[]>();
const jobs = new Map<string, Job>();
const queue: Job[] = [];
let worker: Worker | undefined;
let active: Job | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;
let unavailable = false;

function finish(boxes: PersonBox[]) {
  if (!active) return;
  clearTimeout(timer);
  cache.set(active.url, boxes);
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  jobs.delete(active.url);
  for (const resolve of active.listeners) resolve(boxes);
  active = undefined;
  pump();
}

function failWorker() {
  unavailable = true;
  clearTimeout(timer);
  worker?.terminate();
  worker = undefined;
  for (const job of jobs.values())
    for (const resolve of job.listeners) resolve([]);
  jobs.clear();
  queue.length = 0;
  active = undefined;
}

function pump() {
  if (active || unavailable) return;
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
        event: MessageEvent<{ id: number; boxes: PersonBox[] }>,
      ) => {
        if (event.data.id === active?.id) finish(event.data.boxes);
      };
      worker.onerror = failWorker;
      worker.onmessageerror = failWorker;
    }
    timer = setTimeout(failWorker, 45_000);
    worker.postMessage({
      id: job.id,
      url: new URL(job.url, window.location.href).href,
      width: job.width,
      height: job.height,
      baseUrl: new URL(import.meta.env.BASE_URL, window.location.href).href,
    });
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
): Promise<PersonBox[]> {
  if (signal.aborted || unavailable || typeof Worker === "undefined")
    return Promise.resolve([]);
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    let job = jobs.get(url);
    if (!job) {
      job = { id: ++nextId, url, width, height, listeners: new Set() };
      jobs.set(url, job);
      queue.push(job);
    }
    const subscribedJob = job;
    const complete = (boxes: PersonBox[]) => {
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
