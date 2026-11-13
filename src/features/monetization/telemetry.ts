const events = [
  "visit",
  "returning_session",
  "gate_shown",
  "watch_clicked",
  "sdk_loaded",
  "ad_request_success",
  "ad_no_fill",
  "ad_started",
  "ad_completed_no_reward",
  "reward_received",
  "reward_verified",
  "reward_rejected",
  "grant_issued",
  "access_restored",
  "access_expired",
  "no_fill_access",
  "normal_ad_impression",
  "premium_stub_seen",
  "exit_before_ad",
] as const;

export type AdEvent = (typeof events)[number];
type Counters = Partial<Record<AdEvent, number>>;

export function createTelemetry(allowed: () => boolean) {
  let counts: Counters = {};
  return {
    record(event: AdEvent) {
      if (allowed() && events.includes(event))
        counts[event] = (counts[event] ?? 0) + 1;
    },
    snapshot: (): Counters => ({ ...counts }),
    clear() {
      counts = {};
    },
  };
}

export function report(counts: Counters, dashboardRevenue?: number) {
  const n = (event: AdEvent) => counts[event] ?? 0;
  const ratio = (a: number, b: number) => (b ? a / b : null);
  return {
    verifiedUnlockRate: ratio(n("grant_issued"), n("watch_clicked")),
    noFillRate: ratio(n("ad_no_fill"), n("watch_clicked")),
    exitBeforeAdRate: ratio(n("exit_before_ad"), n("gate_shown")),
    returningSessions: n("returning_session"),
    revenuePer1000Visits:
      dashboardRevenue === undefined
        ? null
        : ratio(1000 * dashboardRevenue, n("visit")),
  };
}
