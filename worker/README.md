# Production photo metadata

The GitHub Pages frontend uses `https://instagram-viewer-metadata.bradwang1995.workers.dev` in production. Local Vite uses its `/api/instagram` proxy. `VITE_INSTAGRAM_METADATA_ORIGIN` overrides either default.

This Worker accepts only indexed public post metadata requests, targets only OGInstagram, and allows browser access from `https://bradwang1995.github.io`. Images continue to load directly from the media service. Successful metadata responses are cached for five minutes; failed responses are not cached or retried. A successful `/health` response confirms the gateway is running, not that OGInstagram is available.

Deploy this service before releasing frontend changes that depend on it:

```powershell
npm exec --package=wrangler@4.105.0 -- wrangler types worker/worker-configuration.d.ts --config worker/wrangler.jsonc
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022 worker/index.ts worker/worker-configuration.d.ts
npx vitest run worker/index.test.js
npm exec --package=wrangler@4.105.0 -- wrangler deploy --config worker/wrangler.jsonc
```

Frontend publishing continues through `.github/workflows/deploy-pages.yml` on a push to `main`. This Worker is deployed separately using an authenticated Cloudflare account; no Cloudflare credentials are stored in this repository.
