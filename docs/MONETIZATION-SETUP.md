# Monetization setup

## Local demo

Run Node.js 22.13+ and install dependencies with `npm ci`. Copy `.env.example` to `.env.local`, set `VITE_MONETIZATION_ENABLED=true` and `VITE_AD_MODE=mock`, then run `npm run dev`. Open the loopback URL printed by Vite. Choose a simulated outcome, click Watch an Ad, and open Access status to reset the demo. The demo uses browser storage and no vendor or Worker. A Vite production or preview build cannot activate the demo.

## Owner handoff

| Item         | Owner supplies                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosting      | Approved HTTPS site origin and separate Worker origin                                                                                                                          |
| ayeT         | Approved Website placement, Rewarded Video AdSlot name, integer reward currency, test campaign, and written confirmation that the publisher key is dedicated to this placement |
| ayeT secrets | Publisher API key and independently generated random session-signing secret, entered into Worker secrets                                                                       |
| Consent      | CMP vendor mappings, ad/cookie disclosure, revocation callback, and applicable audience/site policy                                                                            |
| Adsterra     | Approved publisher HTML for each Popunder or Social Bar unit, allowed creative formats, and ID                                                                                 |
| ExoClick     | Approved Zone Code for each display or popunder zone, zone ID, and approved categories                                                                                         |
| Premium      | Future verified authentication, billing provider and webhook design                                                                                                            |

The CMP integration calls `updateMonetizationConsent` on initial resolution and every change. Keep every field false until consent and eligibility are known. A publisher tag may collect device data and use cookies. Review vendor terms, approved creative types, and storage/referrer behavior before any pilot.

## Separate access Worker

Use a separate D1 database and Worker configuration based on `monetization-worker/wrangler.jsonc`. Add a `d1_databases` entry with binding `DB`, the owner-provided database name and ID, and `migrations_dir: "migrations"`. Set `SITE_ORIGIN`, `AYET_REWARD_CURRENCY`, and `NO_FILL_POLICY`. Preserve the disabled flag until the release checklist passes. Use the same no-fill policy on both sides.

With Wrangler v4, run `wrangler d1 migrations apply DB --local --config monetization-worker/wrangler.jsonc` against the configured local D1, and `wrangler dev --config monetization-worker/wrangler.jsonc` for a Worker smoke test. Use dummy secrets in a gitignored `monetization-worker/.dev.vars.local` or Wrangler's local secret configuration. The checked-in tests run the real migration in Node SQLite and exercise the Worker request handler with fixtures, without a Cloudflare account.

For an authorized release, set the actual secrets with `wrangler secret put AYET_PUBLISHER_API_KEY` and `wrangler secret put SESSION_SIGNING_SECRET` using the separate Worker config. Apply the migration with `--remote` after reviewing the database target. Configure the approved Worker custom domain, deploy with that config, and verify the kill switch, CORS and signed test campaign before enabling the website flags. Do not set either secret in a Vite variable.

[Cloudflare D1 commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/) · [ayeT HTML5 SDK](https://docs.ayetstudios.com/v/product-docs/rewarded-video/web-integrations/rewarded-video-sdk-for-html5)

## Ordinary inventory

After receiving exact HTML, register the approved publisher document and ID in `providers/approvedInventory.ts`. Public publisher tag code is visible in the compiled bundle. Use a dedicated `inventory` build mode selection and enable only the approved vendor flag. Supply the access Worker origin so existing reward or temporary grants suppress inventory. If access status is unavailable, the inventory stays hidden. Confirm the vendor supports an opaque-origin sandboxed frame and place the exact snippet in its required location inside that document. Popunder frames permit popups only after the visitor explicitly chooses sponsored content and interacts with the approved creative. Keep the unit disabled if it requires top-level installation, inherited origin, or interaction outside the ad frame. Such a unit needs a separate vendor-approved hosting and isolation design. ExoClick adult inventory also requires a reviewed audience/site eligibility integration in code and explicit adult consent. The supplied eligibility stub denies it.

[Adsterra Social Bar guide](https://adsterra.com/blog/publishers-guide-to-social-bar/) · [ExoClick Publisher Academy](https://www.exoclick.com/academy/)

## Root domain and ads.txt

Keep GitHub Pages on its repository base until a migration is authorized. For Cloudflare Pages use `npm run build`, publish `dist` with base `/`, and use Pages' SPA fallback by omitting a top-level `404.html` from that build output. Test hard refresh of deep links and confirm preview URLs never match the approved commercial origin. Merge exact, dashboard-issued authorized seller lines into `public/ads.txt`, retaining other valid entries. Check the new domain serves `/ads.txt` as plain text with HTTP 200. Export/import any browser-local library if needed because origin-scoped IndexedDB does not migrate with DNS.

[Cloudflare Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/) · [ayeT ads.txt instructions](https://docs.ayetstudios.com/v/product-docs/rewarded-video/get-ads.txt)
