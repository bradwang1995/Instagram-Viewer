# Accepted Experience Baseline

Recorded on 2026-07-29 before adding further viewer features. The target-constrained browsing-navigation decision below superseded the original free-distance momentum profile on 2026-08-23.

This document defines the performance and loading balance that future work must preserve unless a later decision explicitly replaces it. The automated tests protect deterministic behavior; a fresh built-in-browser pass remains required for subjective smoothness, live Instagram latency, and visual acceptance.

## Filtering

- Start time and End time controls update their own value immediately.
- The visible media queue does not change during the first `299ms` after the last range change.
- The queue applies the latest range at `300ms`.
- A filtered iframe remains mounted with the same DOM identity. Restoring the range does not request it again.

Protected by `src/tests/HomePage.test.tsx`.

## Archive Loading And Retention

- Every media item keeps a lightweight card shell in the DOM.
- Horizontal and Grid activate the current viewport plus exactly one viewport ahead.
- After scrolling settles, activated iframe documents are retained only when they overlap the spatial range from one viewport behind through one viewport ahead:

  ```text
  [max(0, offset - viewport), offset + (2 × viewport))
  ```

- Iframes are not pruned while the browsing surface is moving. Reconciliation happens after the `180ms` settle delay following a step transition or other scroll.
- A nearby reverse scroll inside the retained range reuses the iframe. Returning after a distant iframe was evicted creates one fresh iframe, never duplicates.
- Filter-hidden iframes are excluded from spatial pruning so their identity survives range changes.

Protected by `src/tests/virtualMediaLayout.test.ts` and `src/tests/HomePage.test.tsx`.

## Discrete Browsing Navigation

Wheel and keyboard input share one step-based navigation contract:

- In Horizontal View, one ArrowLeft/ArrowRight press targets exactly one photo backward/forward and centers it when space permits.
- In Horizontal View, one isolated non-zero wheel input uses only its direction and adds one photo. A continuous wheel burst may add a second photo but is capped at two total target steps until the burst resets after `180ms`; delta magnitude cannot bypass that cap.
- In Grid View, one isolated wheel input or ArrowUp/ArrowDown press targets exactly one row backward/forward, preserving the selected column when possible. A continuous wheel burst is capped at two rows.
- Arrow keys always remain one exact step per key press and reset any active wheel-burst count.
- Position changes use a requestAnimationFrame spring transition that preserves velocity across consecutive steps and eases to the exact selected photo/row instead of jumping there.
- Reduced-motion preference disables that transition and moves directly to the same exact target.
- Navigation stops at the first and last photo/row instead of wrapping.
- The browsing shortcuts are disabled while Slideshow is open so Slideshow keeps its own ArrowLeft/ArrowRight contract.
- Orthogonal archive arrow keys remain suppressed so the browser cannot perform a second native scroll on the wrong axis.

Protected by the keyboard and wheel integration cases in `src/tests/HomePage.test.tsx` and the target-settling cases in `src/tests/scrollMomentum.test.ts`.

## Direct-Image Cache And Preload

- Nearby resolved images preload with asynchronous decoding and `no-referrer`.
- The asset URL is preferred over the preview URL.
- The decoded-image LRU window holds exactly `24` unique URLs.
- Reusing an image refreshes its LRU position without creating another `Image`.
- Supported browsers register the cache-first image service worker once at the app base path. Instagram iframe documents remain outside the app-owned image cache.

Protected by `src/tests/mediaPreload.test.ts` and `src/tests/registerMediaCache.test.ts`.

## Slideshow

- Every slideshow media item renders through its current Instagram iframe rather than switching resolved media to a direct `<img>` path.
- The iframe container occupies the full viewport beneath the overlaid header and dock.
- The previous, current, and next media frames remain mounted as slots `-1`, `0`, and `1`.
- Moving forward turns the already-preloaded next iframe into the current frame without replacing its DOM node. The other neighboring iframe identities also remain stable.
- Frame duration is clamped to the accepted `3–10s` range.

Protected by `src/tests/HomePage.test.tsx`.

## Real-Browser Reference

The original acceptance pass that established this baseline used the repository-local `saved_posts.json` in a fresh Codex built-in browser:

- `1,742` mounted card shells;
- nine retained Horizontal iframes after scrolling to `4233px`;
- `27` retained Grid iframes after scrolling to `11294px`;
- both scrollers reached `data-scroll-state="settled"`;
- slideshow exposed slots `-1 / 0 / 1`;
- no browser console warnings or errors.

The 2026-07-29 baseline-protection pass at `1920 × 1080` confirmed the former momentum implementation:

- a Horizontal wheel gesture moved the restored position from `2447px` to `3001px`, settled, and retained nine iframes;
- Grid moved from `0px` to `1083px`, settled, and retained `28` unresolved iframes across the same three-viewport policy;
- Slideshow mounted exactly three iframe frames at slots `-1 / 0 / 1` with the `3000–10000ms` duration range;
- the browser console again contained zero warnings or errors.

Those two wheel-distance measurements are retained as historical evidence only; the discrete navigation contract above now replaces them.

The 2026-08-23 replacement pass in a fresh Codex built-in browser confirmed:

- Horizontal ArrowRight moved from the first visible target to index `1`; one wheel-down event moved to index `2`, and one wheel-up event returned to index `1`.
- Grid ArrowDown moved from the selected row to index `10`; one wheel-down event moved to index `14`, and one wheel-up event returned to index `10`.
- Direct Slideshow ArrowRight still advanced exactly one frame while archive keyboard handling was disabled.
- All tested positions reached `data-scroll-state="settled"`, the accepted visual composition remained intact, and both browser tabs reported zero console warnings or errors.

The later smooth-step refinement pass confirmed that the step targets did not change while their motion became continuous:

- Horizontal ArrowRight progressed through sampled positions `154px → 767px → 884px`, selecting index `1` immediately and settling at the computed target.
- Two Horizontal wheel events selected exactly indices `2` then `3` and settled at their computed `2651px` target.
- Grid ArrowDown showed a moving `74px` intermediate position before settling index `4` at `302px`; wheel forward/reverse selected exactly indices `8`/`4` and settled at `603px`/`302px`.
- Slideshow still owned ArrowRight while open, the accepted visual composition remained intact, and the console reported zero warnings or errors.

These measurements are evidence for this exact implementation, not universal timing guarantees. Live Instagram behavior, network conditions, viewport size, and the mix of direct images versus compatibility iframes can change observed counts and loading time.
