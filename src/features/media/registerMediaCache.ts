export function registerMediaCache(): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}media-cache-sw.js`, {
          scope: import.meta.env.BASE_URL,
        })
        .catch(() => undefined);
    },
    { once: true },
  );
}
