# Monetization release checklist

## Disabled build

- [ ] Run `npm test`, `npm run lint`, `npm run build`, and `npm test -- monetization-worker/index.test.js`.
- [ ] Verify GitHub Pages serves the intended build, the viewer opens directly, and no ad SDK, inventory frame or access request is made.
- [ ] Exercise mock reward, reload, expiry, cancellation, cap and no fill. Check keyboard controls, reduced motion, and narrow/wide viewports.

## Commercial pilot

- [ ] Confirm custom production site and Worker domains. Verify root ads.txt contains exact authorized lines and preview hosts remain inert.
- [ ] Validate the CMP, revocation and policy for each vendor. Review SDK origin isolation and protect imported data before activation.
- [ ] Confirm publisher account, placement/zone IDs, demand, adult eligibility if applicable, exact tags, ad formats, and allowed surfaces.
- [ ] Verify a real signed test callback with the dedicated ayeT placement, fixed currency, guest identity, no custom fields, and delayed/completion-only callback behavior.
- [ ] Verify Worker D1 migration, cross-guest rejection, rate limits, idempotency, server expiry, CORS, server secrets, and access restoration in another tab.
- [ ] Test exact publisher tags in the sandbox, actual frequency behavior and creative labelling. Keep any incompatible vendor format disabled.
- [ ] Keep Premium informational until trusted authentication and verified billing webhooks are implemented.

## Rollback

Set `VITE_MONETIZATION_ENABLED=false` or restore the previous disabled artifact to bypass the gate. Turn off each inventory flag independently. Turn off Worker `AYET_ENABLED` to stop new verification and grants while preserving read-only access to previously issued grants. Preserve conversion rows during rollback so reactivation still rejects old replays. Verify the deployed viewer and network behavior after rollback.

[ayeT go-live checklist](https://docs.ayetstudios.com/v/product-docs/callbacks-and-testing/go-live-checklist/rewarded-video-checklist)

## Local validation record

On 2026-11-13, the full suite passed 244 tests in 42 files, including the four access Worker cases using SQLite. Type-check and production build passed. The Codex built-in browser verified mock reward, reload restoration, completion without reward and temporary access after no fill, including a 390-pixel viewport. Expiry and Escape cancellation were verified by automated tests.
