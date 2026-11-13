export const DAY = 86_400_000;
export const FALLBACK_DURATION = 3_600_000;

export type EntitlementKind = "free_rewarded" | "premium" | "no_fill_temporary";
export type Entitlement = { type: EntitlementKind; expiresAt: number };
export type AccessStatus = {
  serverTime: number;
  rewardedAvailable?: boolean;
  entitlement: Entitlement | null;
};
export type Failure =
  | "no_fill"
  | "cap"
  | "blocked"
  | "cancelled"
  | "complete"
  | "unavailable"
  | "verification";
export type MockOutcome = "rewarded" | Failure;
export type VideoResult = { reward: unknown } | { failure: Failure };
export type NoFillPolicy = "allow_access" | "retry";
