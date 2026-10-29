# OGInstagram local core experiment

This directory preserves the source changes from the 2026-10-28 local experiment. It is not a production backend and is not bundled into the Vite site. Oracle deployment preparation is in [ORACLE-DEPLOYMENT.md](../../ORACLE-DEPLOYMENT.md).

Upstream: https://github.com/seirenkr/OGInstagram at `a92f5372880b61da9c2ba72e539a64ae4ef0350c`. Upstream is MIT licensed; its source and license remain in the separate checkout, not vendored here.

## Preserved files

- `lab_harness_test.go`: original Go core with an opt-in baseline/direct session adapter, loopback-only API and report routes. The known fixed signing key is test-only. Never expose this test harness publicly.
- `windows-sqlite.patch`: Windows SQLite file-URI compatibility fix against the pinned upstream.
- `lab.html`: local report UI. Its `/lab/report` dataset and `/lab/image/*` files remain local.

The nested checkout, portable Go toolchain, cache database, logs, personal saved-post JSON, temporary signed CDN URLs, and downloaded images remain ignored under `embed-lab.local/`. They are intentionally not published.

## Existing local checkout

From the project root in PowerShell:

```powershell
& './embed-lab.local/start-selfhost-core.ps1' -Mode direct -Rebuild
# http://127.0.0.1:18080/lab/
& './embed-lab.local/stop-selfhost-core.ps1' -Mode direct
```

These local scripts and toolchain are not installed by a fresh Git checkout. To reproduce the adapter independently, clone the pinned upstream into an ignored directory, apply the Windows patch on Windows, copy `lab_harness_test.go` to upstream `server/`, and use a compatible Go toolchain. Set `DEVELOPMENT=true`, `OG_LAB_MODE=direct` (or `baseline`), `BASE_URL=http://127.0.0.1:18080`, and an absolute writable `DATA_DIR`; then run `go test -run '^TestLabServe$' -timeout 0 -v` from upstream `server/`. Baseline needs no proxy credentials and reproduces the no-session error. Direct mode creates a local-network session without credentials.

To use the optional report UI, set `ASSETS_DIR` to a directory containing `lab.html`, place your own `summary.json` beside `DATA_DIR`, and your own image files in an `images/` sibling. Querying `/lab/post/<shortcode>` does not require report fixtures. Without `OG_LAB_MODE` the test skips. No frontend or full container deployment was tested in the experiment.

## Observations, not production guarantees

- 20 distinct saved post references: 16 complete media results, 4 failures (three `graphql_error`, one `restricted`). Neither category alone proves deletion/private status. No public OG media service was called.
- 21 photos across three successful posts downloaded and decoded in the built-in browser; videos were not playback-tested.
- 16/16 successful posts hit cache on repeat and after process restart, without new source fetches.
- Successful fresh metadata requests: P50 237 ms, P95 504 ms, excluding the warm sample and failed lookups. These are not image/page load times.
- Native core working set after the sequential sample: 26.43 MiB, peak 26.71 MiB. Not a concurrency or production capacity benchmark.
- Upstream backend tests: 158 top-level passes, one Windows symlink-privilege failure, one opt-in lab skip. No tests weakened.

The open-source private helper is absent. Cloud-host network access, public service hardening, container build and the four failed posts still require validation before production integration.
