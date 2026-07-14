# Ins 图片展

A local-first viewer for Instagram Saved posts. Import `saved_posts.json`, browse a large saved-post library, and run a working photo/reel slideshow from one responsive page.

This project is intentionally minimal. It is a personal saved-post reference viewer, not an Instagram downloader, scraper, or full data-export explorer.

Live app: [bradwang1995.github.io/Instagram-saved-photo-viewer](https://bradwang1995.github.io/Instagram-saved-photo-viewer/)

## Current Workflow

1. Export only your Instagram Saved posts JSON.
2. Open the hosted app or run it locally.
3. Import `saved_posts.json`.
4. Browse the library or play the slideshow.
5. Download an app backup before clearing browser data or moving devices.

The app does not ask for Instagram credentials and does not upload your JSON file to GitHub, GitHub Pages, or an application server.

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
- Downloads and restores portable local backups.
- Ignores personal export JSON files by default.

## What It Avoids

- Instagram login.
- Passwords, 2FA codes, cookies, or unofficial tokens.
- Automated browser crawling.
- Private API scraping.
- Bulk media downloading.
- Cloud sync.
- Multi-tab product-style UI.

## Privacy And Data Ownership

There is no application backend, account system, client ID, or session database. GitHub Pages serves the same static HTML, CSS, and JavaScript files to everyone. When a visitor selects a JSON file, the app reads it in that browser and writes the extracted library to IndexedDB under the site's origin.

This means:

- A visitor on another device or browser profile cannot read your IndexedDB library.
- GitHub Pages does not receive the selected JSON file or the IndexedDB records.
- The original JSON file is not added to this repository or a remote database.
- Someone using the same operating-system account and browser profile can open the same local library. Use a separate browser profile on a shared computer.
- Clearing site data, using a private window, browser storage eviction, or changing to a different site origin can remove or separate access to the library.
- The app's own JavaScript can access its IndexedDB data. Use a deployment whose source and owner you trust.

The local database contains canonical Instagram URLs, shortcodes, post types, timestamps, collection names, and import summaries. Personal export filenames such as `saved_posts.json` and `savepost.json` are ignored by git.

Instagram previews are loaded in iframes from `instagram.com`. Opening a preview sends that post URL and normal browser request information to Instagram, just as opening an Instagram embed normally would. The export JSON itself is not sent with that request.

## Returning Later Or Moving Devices

On the same browser profile and the same site origin, the gallery is loaded automatically from IndexedDB on future visits. There is no login because no server owns a copy of the library.

For another browser or device:

1. Click **Download backup** in the current gallery.
2. Move the downloaded backup file privately to the other device.
3. Open the app there and click **Restore backup**.

The backup is a readable JSON file and contains your saved-post links. It is not encrypted, so treat it like the original Instagram export and do not commit or share it. This manual backup flow is also the recovery path before clearing browser data or moving the app to a custom domain.

Automatic cross-device sync would require user authentication, access controls, secure server storage, deletion controls, and a documented privacy policy. That is intentionally outside the current local-first MVP.

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

## GitHub Pages Deployment

The repository includes [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml). It runs the test suite, builds Vite with the repository name as its base path, and deploys `dist` whenever `main` is pushed. The project remains a static site; no personal viewer data is included in the deployment artifact.

One repository setting is required:

1. Open **Settings → Pages** in the GitHub repository.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`, or open **Actions → Deploy to GitHub Pages → Run workflow**.
4. After the workflow succeeds, use the URL shown in its `github-pages` deployment.

For a fork, the workflow calculates `/<repository-name>/` automatically. No source edit is needed as long as the fork is deployed as a normal GitHub project page.

To inspect the exact Pages build locally:

```bash
npm ci
npm test
npm run lint
npx --no-install vite build --base="/Instagram-saved-photo-viewer/"
```

The generated static site is in `dist/`. The checked-in workflow is the recommended deployment path because Vite requires a build step.

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

The current MVP is a responsive one-page viewer with reliable selection, embedded media, filters, infinite scrolling, slideshow controls, portable backups, and automated GitHub Pages deployment. See [PROGRESS.md](./PROGRESS.md) for the internal tracker.
