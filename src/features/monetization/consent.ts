export type Consent = {
  rewarded: boolean;
  adsterra: boolean;
  exoclick: boolean;
  adult: boolean;
  analytics: boolean;
};

const denied: Consent = {
  rewarded: false,
  adsterra: false,
  exoclick: false,
  adult: false,
  analytics: false,
};

let current = denied;
const listeners = new Set<() => void>();

// Called by the approved CMP adapter on initial resolution and every consent change.
export function updateMonetizationConsent(consent: Consent) {
  current = { ...consent };
  listeners.forEach((listener) => listener());
}

export const getConsent = () => current;

export function subscribeConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
