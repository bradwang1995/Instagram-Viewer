export function registerMediaCache(): void {
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}media-cache-sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
