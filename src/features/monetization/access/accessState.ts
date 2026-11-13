import type { AccessStatus } from "../types";

export function accessDeadline(status: AccessStatus, observedAt: number) {
  return (
    observedAt +
    Math.max(
      0,
      (status.entitlement?.expiresAt ?? status.serverTime) - status.serverTime,
    )
  );
}

export function remainingAccess(deadline: number, monotonicNow: number) {
  return Math.max(0, deadline - monotonicNow);
}
