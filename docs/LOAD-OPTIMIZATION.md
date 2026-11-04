# Loading optimization workflow

The viewer has no Load report UI or export. Local gateway and browser outcome logging run in the background. The user delegates log interpretation and selective, evidence-based loading improvements to Codex; they do not need to understand Instagram internals or manually export data.

## Evidence and analysis

- Read `embed-lab.local/personal/images/load-logs/load-events.jsonl` and its `.1` / `.2` archives from this checkout, even when investigating from another worktree. They are local, ignored, size-bounded logs; rotation can remove older evidence.
- Run `node scripts/analyze-load-logs.mjs` for a deterministic summary. `--save` writes the latest summary to `latest-summary.json` beside the logs, without committing private browsing data. Compare the previous summary's fingerprint before saving to avoid repeatedly investigating unchanged data.
- Browser outcomes are deduplicated per visit/post/photo. Post success means at least one photo loaded, not a complete carousel. Deferred results are excluded from success rates. Gateway entries and shared-operation timings are separate evidence; never sum them into unique upstream attempt counts or end-to-end latency.
- Compare revisions, cache hits/misses, missing diagnostics, failure stage/code, recoveries, and timing sample counts before attributing a cause. Unknown measurements remain unknown. Distinguish real browsing, fixtures, preloads, and manual acceptance where evidence permits; do not assume test traffic is real user browsing.
- `graphql_error`, `restricted`, or HTTP errors alone do not prove that a post is private or deleted. Investigate the owning code and a small relevant sample before changing retry/concurrency behavior. Do not generate bulk upstream traffic, bypass restrictions, or change login/security behavior.

## Decision and release

When asked in this chat, or on its daily scheduled review, inspect new evidence and prioritize user-visible loading failures and latency. Record material findings, uncertainty, the selected action (including no change), and before/after validation here. Keep unchanged or insufficient evidence quiet; do not manufacture an optimization to produce a daily commit.

Implement only small loading-related fixes with a demonstrated cause and an appropriate regression check. Other agents' features take priority: inspect the working tree, preserve their changes, and defer overlapping files until safe. Follow AGENTS.md for validation, scoped commit, push, deployment and production verification. Do not restart a shared local server while another agent is testing. Report meaningful findings, completed fixes, failures or required user action; no routine unchanged-status messages.

The local server must run updated code to collect logs, and the computer and Codex desktop app must be available for local scheduled analysis. A successful scheduled review does not prove real Instagram playback/loading acceptance.

## Decisions

### 2026-11-03 — Initial local baseline and UI removal

Available log window: 19:15–19:25 America/Toronto. Three browser visits contain 14 latest photo outcomes: 10 loaded, 3 failed (`metadata:graphql_error`), and 1 deferred. Attempted-photo and at-least-one-photo post success are both 76.9%; no recorded recoveries. Browser resource p50/p95 are 978/2188 ms (14 samples); gateway request p50/p95 are 666/2009 ms (14 samples). These durations have different scopes and cannot be added. Gateway records also include two generic metadata 502 errors, an access restriction and a low-resolution rejection; they are not additional browser failures.

Decision: remove the report UI, export, UI events and report localStorage writes; preserve bounded background diagnostics. Add repeatable log analysis and a daily review. No retry, concurrency or cache policy optimization yet: this small window does not establish a root cause or a reliable before/after comparison. Monitor metadata failures and cold-versus-warm loading first. Baseline is observational, not a controlled acceptance test.
