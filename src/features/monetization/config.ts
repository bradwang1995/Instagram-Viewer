export function httpsOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" &&
      url.origin === value &&
      !url.hostname.endsWith(".pages.dev")
      ? url.origin
      : "";
  } catch {
    return "";
  }
}

export function readConfig(env: Record<string, unknown>, origin: string) {
  const value = (key: string) =>
    typeof env[key] === "string" ? env[key].trim() : "";
  const enabled = (key: string) => value(key) === "true";
  const master = enabled("VITE_MONETIZATION_ENABLED");
  const mode = value("VITE_AD_MODE");
  const productionOrigin = httpsOrigin(value("VITE_MONETIZATION_SITE_ORIGIN"));
  const production =
    master &&
    env.PROD === true &&
    Boolean(productionOrigin) &&
    !new URL(productionOrigin).hostname.endsWith(".github.io") &&
    origin === productionOrigin;
  const mock =
    master &&
    mode === "mock" &&
    env.DEV === true &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const apiOrigin = httpsOrigin(value("VITE_MONETIZATION_API_ORIGIN"));
  const placementId = Number(value("VITE_AYET_PLACEMENT_ID"));
  const slot = value("VITE_AYET_REWARDED_ADSLOT");
  const live =
    production &&
    mode === "rewarded" &&
    enabled("VITE_AYET_ENABLED") &&
    enabled("VITE_AYET_ORIGIN_APPROVED") &&
    /^[1-9]\d*$/.test(value("VITE_AYET_PLACEMENT_ID")) &&
    Number.isSafeInteger(placementId) &&
    placementId > 0 &&
    Boolean(slot && apiOrigin && apiOrigin !== productionOrigin);
  return {
    mode: mock
      ? ("mock" as const)
      : live
        ? ("live" as const)
        : ("disabled" as const),
    placementId,
    slot,
    apiOrigin,
    production,
    inventory:
      production &&
      mode === "inventory" &&
      Boolean(apiOrigin && apiOrigin !== productionOrigin) &&
      (enabled("VITE_ADSTERRA_ENABLED") || enabled("VITE_EXOCLICK_ENABLED")),
    inventoryExperiment: enabled("VITE_INVENTORY_EXPERIMENT"),
    inventoryCapMs:
      Number(value("VITE_INVENTORY_CAP_HOURS") || "24") * 3_600_000,
    noFillPolicy:
      value("VITE_NO_FILL_POLICY") === "retry"
        ? ("retry" as const)
        : ("allow_access" as const),
    premiumInfo: mock || (live && enabled("VITE_PREMIUM_ENABLED")),
    adsterra: production && enabled("VITE_ADSTERRA_ENABLED"),
    exoclick: production && enabled("VITE_EXOCLICK_ENABLED"),
    adultAdsEnabled: production && enabled("VITE_ADULT_ADS_ENABLED"),
  };
}

export const config = readConfig(import.meta.env, window.location.origin);
