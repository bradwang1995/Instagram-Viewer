# Ins 图片展

A local-first viewer for Instagram Saved posts. Import `saved_posts.json`, browse a large saved-post library, and run a working photo/reel slideshow from one responsive page.

This project is intentionally minimal. It is a personal saved-post reference viewer, not an Instagram downloader, scraper, or full data-export explorer.

## Current Workflow

1. Export only your Instagram Saved posts JSON.
2. Open this local web app.
3. Import `saved_posts.json`.
4. Browse the library or play the slideshow.

The app does not ask for Instagram credentials and does not upload your JSON file.

## What It Does

- Imports Instagram Saved post JSON directly.
- Supports the `saved_posts.json` array shape with `timestamp`, `label_values`, `value`, and `href` fields.
- Extracts Instagram `/p/`, `/reel/`, and `/tv/` URLs.
- Canonicalizes and deduplicates post references.
- Stores the local library in IndexedDB.
- Shows a searchable library with media-type and saved-date filters.
- Loads the library in groups of 20 with automatic infinite scrolling.
- Uses Instagram's dedicated embed page for reliable post-to-post switching.
- Shows a slideshow with previous, next, play, pause, shuffle, and speed controls.
- Keeps the selected viewer visible when a library item is chosen.
- Adapts to desktop, tablet, and mobile widths without horizontal scrolling.
- Opens the original Instagram post when needed.
- Ignores personal export JSON files by default.

## What It Avoids

- Instagram login.
- Passwords, 2FA codes, cookies, or unofficial tokens.
- Automated browser crawling.
- Private API scraping.
- Bulk media downloading.
- Cloud sync.
- Multi-tab product-style UI.

## Privacy

The app stores local browser data only:

- Canonical Instagram URLs
- Shortcodes and post type
- Best-effort saved/imported timestamps
- Import summaries

Personal export files such as `saved_posts.json` and `savepost.json` are ignored by git.

## Preview Availability

The JSON export contains Instagram links and timestamps, not the original photo files. The app therefore displays media through Instagram's public embed page.

- Public and available photo posts can render directly in the viewer.
- Reels can show the Instagram reel embed and its available playback/cover state.
- Private, removed, age-restricted, or login-gated posts may not render.
- The reload and Instagram buttons remain available when a particular embed is unavailable.

The app does not read likes or comments and does not recreate Instagram's social interface.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the local app:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

## Local Development

There is also a Windows helper script for this workspace:

```bash
scripts\dev-server.cmd
```

Then open:

```text
http://127.0.0.1:5173/
```

## Project Shape

```text
src/
  app/                  App shell and single route
  pages/HomePage.tsx    One-page JSON import, library, and slideshow
  db/                   Dexie schema and local repositories
  features/import/      JSON, ZIP, HTML, and URL import logic
  features/library/     Filtering and sorting
  features/slideshow/   Navigation and shuffle helpers
  dev/                   Development-only large-library fixture
  components/           Reusable UI pieces
  tests/                Unit tests
```

The ZIP importer and some richer components still exist in the codebase as reusable pieces, but the active UI is JSON-first and one-page. During local development, `/?demo=1` opens a non-personal 45-item fixture for UI testing; this path is disabled in production builds.

## Current Status

The current MVP is a responsive one-page viewer with reliable selection, embedded media, filters, infinite scrolling, and slideshow controls. See [PROGRESS.md](./PROGRESS.md) for the internal tracker.
