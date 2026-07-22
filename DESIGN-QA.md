# PhotoYoshi Archive Field Design QA

- Product reference: `https://photoyoshi.com/`
- Reference captures: `artifacts/photoyoshi-reference-desktop.png`, `artifacts/photoyoshi-reference-scroll-1.png`, `artifacts/photoyoshi-reference-scroll-2.png`, and `artifacts/photoyoshi-reference-mobile.png`
- Previous product state: `artifacts/before-photoyoshi-redesign.png`
- Final implementation: `artifacts/photoyoshi-archive-desktop-final.png` and `artifacts/photoyoshi-archive-mobile-final.png`
- Same-viewport comparison: `artifacts/photoyoshi-mobile-comparison.png`
- Interaction evidence: `artifacts/photoyoshi-archive-desktop-scroll.png`, `artifacts/photoyoshi-archive-index.png`, `artifacts/photoyoshi-archive-slideshow.png`, and `artifacts/photoyoshi-archive-slideshow-mobile.png`
- Viewports: `1280 × 720` desktop and `390 × 844` mobile
- Current refinement evidence: `artifacts/audit-01-horizontal.png`, `artifacts/audit-02-grid.png`, `artifacts/audit-03-mobile-grid.png`, and `artifacts/audit-04-manifest-grid.png`
- Current states: bundled non-personal direct-image demo in desktop Horizontal View, desktop Grid View, and `390 × 844` mobile Grid View; real saved-post JSON in a network-controlled browser profile

## Outcome

The previous white Instagram embed and text-library split have been replaced by a full-viewport photo field. The active product name is `Instagram Viewer`. Direct source frames, when available to internal fixtures, are presented as independent media items; ordinary `saved_posts.json` imports use a bounded Instagram compatibility preview per post. Both use a virtual Horizontal View or four-column desktop Grid View. Per-card metadata, counters, source actions, and curation controls no longer compete with the photos.

The visual language follows the supplied PhotoYoshi reference: oversized clipped grotesk typography, deep olive-black canvas, a centered image object, sparse editorial metadata, sharp rectangular surfaces, and motion driven by scrolling and pointer position. The implementation adapts that composition to the product workflow rather than copying PhotoYoshi content or assets.

## Combined Comparison Pass

`artifacts/photoyoshi-mobile-comparison.png` records the earlier visual-direction checkpoint. The current refinement keeps the dark low-chrome canvas and restrained motion while restoring the `Instagram Viewer` name, removing the bottom counter, and enlarging functional text.

## Required Fidelity Surfaces

- Typography: passed. Functional text now uses a 150% root scale; the preview no longer spends image space on an oversized archive watermark or compact per-card metadata.
- Layout and spacing: passed in fresh local Chrome captures. Desktop Horizontal media is `828px` high in a `1080px` viewport (76.7%). Desktop Grid shows one four-card row while preloading two more, and mobile Grid shows one card while preloading two more.
- Color and surfaces: passed. Deep olive-black backgrounds, warm off-white display text, muted gray metadata, and one acid-lime action color replace the old white embed chrome. No gradients, generic floating cards, or decorative CSS blobs were introduced.
- Image quality: passed. The demo uses bundled WebP photography at native aspect ratio. The app does not copy or hotlink PhotoYoshi imagery. Imported unresolved Instagram sources use a tightly cropped compatibility embed only when the card intersects the real viewport; mounted overscan rows remain network-idle.
- Icons: passed. Lucide icons share one stroke family and remain paired with understandable `Horizontal View`, `Grid View`, Filter, Settings, and Slideshow labels.
- Copy and content: passed. The product name is `Instagram Viewer`; source/media totals, creator/collection captions, frame labels, and rejected per-card action copy are absent from the browsing surfaces.
- Responsiveness: passed in implementation, tests, and current captures. Desktop uses exactly four Grid columns; tablet uses two and mobile uses one. Both browsing modes use bounded render windows and visually hidden scrollbars. The revised dock is visible in the current `390 × 844` capture.
- Accessibility: passed for the implemented checkpoint. Semantic buttons, labels, image alt text, visible focus treatment, keyboard playback shortcuts, and reduced-motion CSS are present. Motion is not required to import, filter, hide, restore, or play media.

## Functional Browser Evidence

- Vertical wheel input moved the horizontal ribbon from `scrollLeft 528` to `1127` and selected media index `2`.
- The original Ribbon/Index checkpoint rendered the 19-item demo; the current virtual layouts keep the full track reachable without mounting every item simultaneously.
- Creator filter reduced the session to the five `@quietframes` media items and Clear restored all 19.
- Settings exposed independent frame duration, transition duration, transition style, loop mode, and hidden-media recovery.
- Slideshow navigation advanced inside a multi-frame source before moving to the next source.
- Desktop slideshow controls ended at `y=720`; mobile slideshow media ended at `y=642.75` above controls beginning at `y=738`.
- The empty-library route rendered the JSON upload composition with document dimensions matching the viewport.
- The real local-library route correctly returned the upload screen when IndexedDB contained no imported records.
- A V1 resolved-media file containing three embedded WebP images imported through the real browser file input as three ordered direct-image cards with distinct stable IDs and no iframes.

## Iteration History

### Iteration 1

- [P1] The legacy interface devoted most of the viewport to a white Instagram embed and a shortcode/date list, contradicting the chosen dark, image-first direction.
  - Fix: replaced it with the PhotoYoshi-inspired upload composition and continuous media field.
- [P1] Post-level playback could not express multiple media frames as a single browsing sequence.
  - Fix: the resolved-media queue now expands every source frame in order and keeps source provenance as secondary metadata.
- [P2] Rendering every Instagram embed would create an unbounded iframe count for large libraries.
  - Fix: unresolved compatibility embeds mount only for real viewport intersections (plus the active Horizontal selection); resolved media uses direct image assets.
- [P2] Controls previously competed with the image and could disappear below the fold.
  - Fix: constrained media to the available viewport and reserved a fixed desktop/mobile dock.
- [P2] The library search hierarchy emphasized shortcode and time rather than recognizable people or collections.
  - Fix: filters now prioritize creator, collection, caption/tag text, and hidden state.

### Iteration 2

- [P2] Mobile required a separate visual hierarchy instead of a scaled desktop strip.
  - Fix: widened the selected frame to the safe mobile content width, simplified metadata, collapsed secondary control labels, and retained a full-width slideshow action.
- [P3] Production build reports a `583.80 kB` minified JavaScript chunk.
  - Follow-up: code-split optional animation/settings surfaces if first-load performance becomes a priority; this does not block the current local-first prototype.

### Iteration 3

- [P0] Large libraries created one Motion card per media item and the horizontal centered-item lookup scanned every card on each scroll frame.
  - Fix: both views now use layout-math virtualization. Desktop Grid mounts no more than 12 cards, and Horizontal View mounts only visible cards plus two-item overscan while using a binary centered-index lookup.
- [P0] Grid could expand to roughly eight columns on a wide screen and depended on browser lazy-load heuristics.
  - Fix: desktop Grid is exactly four columns, renders three rows at most, and immediately loads only that bounded window.
- [P1] Photos were darkened by card opacity, image filters, a shade overlay, and sibling-hover dimming.
  - Fix: all of those treatments were removed. Photos use normal filters and full opacity; hover feedback is lift, scale, border, and shadow.
- [P1] Horizontal photos occupied roughly half the viewport and `YOUR ARCHIVE` consumed the background.
  - Fix: the watermark was removed and the selected horizontal media surface now occupies 76.7% of the verified `1920 × 1080` viewport.
- [P1] UI labels were too small and the terms Ribbon/Index and INS/ARCHIVE were unclear or incorrect.
  - Fix: root text scale is 150%, visible branding is `Instagram Viewer`, and modes are `Horizontal View` and `Grid View`.
- [P1] Cards displayed creator/collection/frame labels, totals, Hide/Open Source actions, and ordinal numbers.
  - Fix: active cards now contain only the media surface and accessible selection semantics.

### Iteration 4

- [P0] Timed-out compatibility iframes released a queue permit but remained mounted, allowing stalled previews to accumulate across a virtual window.
  - Fix: timeout/error now enters a terminal unavailable state, unmounts the iframe, releases the permit, and remembers the failure for later virtual remounts.
- [P1] The first desktop Grid viewport still exposed part of its second row.
  - Fix: one row now fills the scroll viewport; the following two rows remain mounted below the fold as bounded preload only.
- [P1] Earlier end-reachability evidence depended on JSDOM scroll behavior.
  - Fix: repeatable local Chrome QA now scrolls the actual Horizontal and Grid tracks to their maximum offsets and confirms demo media index 18 is mounted at the end.
- [P1] The generic JSON walk duplicated `value`/`href` URLs and interpreted `URL` as a collection while ignoring owner/caption metadata present in the real export.
  - Fix: the actual record shape is parsed atomically, preserving supported metadata and eliminating those false records.

### Iteration 5

- [P0] The media-first queue could display resolved children, but the JSON import path had no legal way to persist them and always created a single compatibility fallback.
  - Fix: added strict V1 manifest parsing plus atomic per-post replacement so every supplied child becomes an independent card.
- [P1] Array-index media IDs would lose user preferences if a resolver reordered carousel children.
  - Fix: each manifest frame now requires a stable source ID; source index controls order while the stable identity owns local preferences.
- [P1] A failed image cached only by media ID would keep a newly updated URL unavailable for the rest of the session.
  - Fix: failure and successful-candidate caches now include the current asset/preview URL revision.
- [P1] Remote media manifests can trigger browser requests to arbitrary hosts.
  - Fix: V1 accepts only public HTTPS or bounded safe image data URLs, suppresses image referrers, and documents the remote-host privacy boundary.

### Iteration 6

- [P0] A two-request concurrency queue limited simultaneous Instagram navigations but still let all 12 mounted Grid cards load sequentially.
  - Fix: DOM overscan and network permission are now separate. Grid permits only the visible row; Horizontal permits cards intersecting the real viewport plus the selected card.
- [P1] The clarified product workflow accepts only Instagram's exported Saved JSON, not a second local image package.
  - Fix: removed the local manifest-builder workflow and documented official public embeds as the selected credential-free loading path.

### Iteration 7

- [P1] Native carousel-child extraction was still described as an open release blocker after the accepted product scope changed.
  - Resolution: one ordinary saved post now intentionally maps to one card using Instagram's default first preview. Carousel-child extraction is a non-goal for this MVP.

## Known Data Boundary

Instagram `saved_posts.json` does not contain carousel-child media, original image bytes, or reliable thumbnails. It does contain post URLs plus some owner and descriptive metadata, which the importer preserves. The only user workflow is Saved JSON; eligible posts load from Instagram through public embeds. An embed may display its own carousel, but the parent viewer cannot inspect the cross-origin iframe or flatten its children into independent native cards. The app does not scrape Instagram, request pasted credentials, or fabricate media children.

## Verification

- `npm run lint`: passed.
- `npm test`: 13 files and 44 tests passed, including viewport-gated compatibility embeds, resolved-manifest parser regressions, transaction rollback, Grid/Horizontal end reachability, mixed-aspect viewport coverage, direct-image fallback, responsive single-row Grid behavior, and iframe timeout queue draining.
- `npm run build`: passed.
- Fresh local Chrome evidence confirms `24px` root text, hidden scrollbars, one visible Grid row, bounded DOM windows, a 76.7%-height Horizontal surface, current mobile dock layout, and last-media reachability.
- The ignored 6 MB real JSON opened the viewer in `1571ms` in an isolated browser profile with deterministic four-second embed responses. Horizontal mounted four cards but requested only its two viewport intersections. Grid mounted 12 cards but kept four visible-row iframes; moving to the next row produced four new requests. Navigation concurrency peaked at two and no rejected media/source totals appeared.
- Browser-uploaded three-photo internal fixture evidence confirms three ordered direct-image cards, stable IDs, and zero iframes at `artifacts/audit-04-manifest-grid.png`.
- One default preview per saved post is the accepted scope; native carousel-child extraction is not an unresolved acceptance item.

Current saved-JSON compatibility viewer and accepted MVP checkpoint: passed.
