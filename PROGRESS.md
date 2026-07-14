# PROGRESS

Internal implementation tracker for `Ins 图片展`.

## Current Product Direction

Build a very small local-first Instagram Saved post exhibition:

```text
Import saved_posts.json
        ↓
Extract Instagram post / reel / tv URLs
        ↓
Store local library in IndexedDB
        ↓
Browse + search + date/type filters
        ↓
Embedded media viewer + slideshow
        ↓
Optional local backup / restore
```

The product should remain one page unless a future requirement truly needs more.

## Privacy And Safety Rules

- [x] Ignore personal export files such as `saved_posts.json`.
- [x] Ignore `savepost.json` and common saved-post JSON filename variants.
- [x] Do not ask for Instagram username, password, 2FA, cookies, or unofficial tokens.
- [x] Do not automate crawling of Instagram Saved pages.
- [x] Do not bulk download Instagram media.
- [x] Treat the app as a local reference viewer, not a downloader.
- [x] Keep imported data out of GitHub Pages and any application backend.
- [x] Document that shared browser profiles share the same local IndexedDB.
- [x] Document Instagram iframe requests separately from local JSON processing.

## Revision 1: Initial Repository

- [x] Initialize git repository.
- [x] Create Vite React TypeScript project.
- [x] Add README.
- [x] Add PROGRESS tracker.
- [x] Add Dexie/IndexedDB data model.
- [x] Add URL parser for `/p/`, `/reel/`, and `/tv/`.
- [x] Add recursive JSON extractor.
- [x] Add ZIP importer.
- [x] Add first multi-page MVP.
- [x] Add unit tests.

## Revision 2: JSON-First Minimal UI

- [x] Add `saved_posts.json` / `savepost.json` gitignore rules.
- [x] Inspect actual `saved_posts.json` structure without exposing personal URL data.
- [x] Add direct JSON file importer.
- [x] Support the saved-post array shape with `timestamp`, `label_values`, `value`, and `href`.
- [x] Replace active multi-page routes with a single-page app.
- [x] Remove active nav tabs from the UI.
- [x] Remove active Settings page from the UI.
- [x] Keep import, library, and slideshow on one page.
- [x] Update README to match the simplified product.
- [x] Update PROGRESS after the revision.

## Revision 3: Viewer And Large-Library Repair

- [x] Replace script-mutated Instagram blockquotes with keyed embed iframes.
- [x] Track the selected post by stable post ID instead of list index.
- [x] Keep filtered, shuffled, clicked, and playing navigation on one playback order.
- [x] Repair previous, next, play, pause, and shuffle behavior.
- [x] Add selectable slideshow timing (6, 10, or 15 seconds).
- [x] Add photo/reel segmented filtering and remove TV from the active filter UI.
- [x] Add inclusive From/To saved-date filtering.
- [x] Load 20 library records initially.
- [x] Add infinite scrolling in groups of 20 with a manual fallback button.
- [x] Scroll the viewer into view when a library item is selected on stacked layouts.
- [x] Redesign the one-page UI for desktop, tablet, and mobile widths.
- [x] Add a reload action and original Instagram fallback per embed.
- [x] Add a development-only 45-item fixture for large-list browser QA.
- [x] Ignore likes, comments, and other Instagram social interactions.

## Revision 4: GitHub Pages And Local Data Recovery

- [x] Add a GitHub Actions workflow for GitHub Pages.
- [x] Build with a repository-specific Vite base path.
- [x] Configure the browser router to use Vite's deployment base URL.
- [x] Keep the production deployment completely static and backend-free.
- [x] Expose app-backup download from the active one-page UI.
- [x] Expose app-backup restore from both populated and empty states.
- [x] Add UI coverage for backup download and restore.
- [x] Explain browser-local privacy boundaries and shared-profile risk.
- [x] Explain same-browser persistence and cross-device recovery.
- [x] Add setup instructions for maintainers and forks.
- [ ] Confirm the first live GitHub Pages deployment.

## Current Active UI

- [x] Import JSON button.
- [x] Search field.
- [x] Photo/reel type filter.
- [x] Saved-date range filter.
- [x] Infinite library list (20 items per batch).
- [x] Keyed Instagram iframe preview.
- [x] Previous and next controls.
- [x] Play/pause.
- [x] Shuffle.
- [x] Slideshow speed selector.
- [x] Open original Instagram post.
- [x] Clear local library from the same page.
- [x] Download portable local backup.
- [x] Restore portable local backup.

## Tests

- [x] `parseInstagramUrl`
- [x] `extractPostsFromJson`
- [x] `extractPostsFromJson` for `saved_posts.json` array shape
- [x] `extractPostsFromHtml`
- [x] `mergeSavedPost`
- [ ] Direct JSON importer integration test with mocked IndexedDB
- [x] One-page UI selection/navigation/loading smoke test
- [x] Date range filtering test
- [x] Embed URL and wrapping navigation tests
- [x] One-page backup download/restore test

## Latest Verification

- [x] `npm test` passes with 13 tests across 7 files, including backup recovery and deterministic shuffle navigation.
- [x] `npm run build` passes.
- [x] The Pages-specific build emits `/Instagram-saved-photo-viewer/` asset paths and router basename.
- [x] Local dev server responds at `http://127.0.0.1:5173/`.
- [x] `git status --ignored` shows `saved_posts.json` as ignored.
- [x] Active router only serves the one-page `HomePage`.
- [x] Active header has no navigation tabs.
- [x] Browser QA starts with exactly 20 of 45 demo records.
- [x] Scrolling automatically expands the rendered list from 20 to 40.
- [x] Browser QA confirms click selection and Next change the iframe target.
- [x] Browser QA confirms Play advances after 6 seconds and Pause stops playback.
- [x] Browser QA confirms the photo and date filters reduce the library.
- [x] Browser QA confirms no horizontal overflow at desktop or 390px mobile width.
- [x] A real local-export photo embed returns visible main media without a login wall.
- [x] A real local-export Reel embed returns its Instagram media/cover state.

## Next Candidate Improvements

- [ ] Add an automated direct JSON importer integration test with mocked IndexedDB.
- [ ] Consider list virtualization only if many infinite-scroll batches become slow.
- [ ] Add a timed unavailable-preview message if Instagram changes embed behavior.
- [ ] Add optional manual URL paste only if needed.
- [ ] Consider opt-in authenticated sync only as a separate, security-reviewed product phase.

## Notes

- MVP v1 was committed as `9c31a75` and pushed to `origin/main`.
- Keep imported data browser-local unless a future phase explicitly designs authentication, authorization, encryption, retention, and deletion controls.
- Keep README and PROGRESS updated after each meaningful change.
