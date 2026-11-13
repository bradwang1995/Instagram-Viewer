import type { Consent } from "../consent";

export type AdsterraUnit = {
  provider: "adsterra";
  format: "popunder" | "social_bar";
  unitId: string;
  approvedHtml: string;
};
export type ExoclickZone = {
  provider: "exoclick";
  format: "popunder" | "display";
  zoneId: string;
  category: "mainstream" | "adult";
  approvedHtml: string;
};
export type Inventory = AdsterraUnit | ExoclickZone;

export type InventoryContext = {
  production: boolean;
  adsterra: boolean;
  exoclick: boolean;
  adultAdsEnabled: boolean;
  approvedAdultAudienceAndSite: boolean;
  surface: "entrance" | "viewer";
  entitled: boolean;
  consent: Consent;
};

export function chooseInventory(
  units: readonly Inventory[],
  context: InventoryContext,
  guest: string,
  experiment = false,
): Inventory | null {
  if (!context.production || context.surface !== "entrance" || context.entitled)
    return null;
  const eligible = units.filter((unit) => {
    if (!unit.approvedHtml.trim()) return false;
    if (unit.provider === "adsterra") {
      return (
        context.adsterra &&
        context.consent.adsterra &&
        /^[\w-]+$/.test(unit.unitId)
      );
    }
    return (
      context.exoclick &&
      context.consent.exoclick &&
      /^[1-9]\d*$/.test(unit.zoneId) &&
      (unit.category === "mainstream" ||
        (context.adultAdsEnabled &&
          context.approvedAdultAudienceAndSite &&
          context.consent.adult))
    );
  });
  if (!eligible.length) return null;
  let hash = 0;
  for (const char of guest)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return eligible[experiment ? hash % eligible.length : 0];
}

// Reserve across both providers before mounting a publisher-approved document.
export function reserveInventory(storage: Storage, now: number, capMs: number) {
  const key = "instagram-viewer:monetization:inventory:v1";
  if (!Number.isFinite(capMs) || capMs <= 0) return false;
  try {
    const previous = storage.getItem(key);
    if (previous !== null && now - Number(previous) < capMs) return false;
    storage.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}
