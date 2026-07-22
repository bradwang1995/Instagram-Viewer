export type InstagramEmbedAvailability =
  "available" | "unavailable" | "unknown";

const INSTAGRAM_OEMBED_ENDPOINT =
  "https://graph.facebook.com/v25.0/instagram_oembed";
const OEMBED_TIMEOUT_MS = 6_000;
const availabilityByUrl = new Map<
  string,
  Promise<InstagramEmbedAvailability>
>();

export function getInstagramEmbedAvailability(
  canonicalUrl: string,
): Promise<InstagramEmbedAvailability> {
  const cached = availabilityByUrl.get(canonicalUrl);
  if (cached) return cached;

  const request = requestInstagramEmbedAvailability(canonicalUrl).then(
    (availability) => {
      if (availability === "unknown") availabilityByUrl.delete(canonicalUrl);
      return availability;
    },
  );
  availabilityByUrl.set(canonicalUrl, request);
  return request;
}

async function requestInstagramEmbedAvailability(
  canonicalUrl: string,
): Promise<InstagramEmbedAvailability> {
  const endpoint = new URL(INSTAGRAM_OEMBED_ENDPOINT);
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("omitscript", "true");
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    OEMBED_TIMEOUT_MS,
  );

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      credentials: "omit",
      mode: "cors",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
    });
    if (response.ok) return "available";
    if ([400, 404, 410].includes(response.status)) return "unavailable";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    window.clearTimeout(timeout);
  }
}
