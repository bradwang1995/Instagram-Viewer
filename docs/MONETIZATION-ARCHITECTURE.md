# Monetization architecture

The gate wraps the existing outlet. Disabled mode renders the outlet directly. Mock mode is loopback development only. The rewarded and ordinary inventory experiments use separate commercial modes so a rewarded or temporary-access session is never exposed to ordinary inventory. Ordinary inventory selects one eligible publisher unit and reserves a shared cap with a browser-origin Web Lock and localStorage. A cap is a local courtesy and can reset with storage or differ across devices and profiles. The isolated frame is destroyed when the visitor continues or revokes consent.

The rewarded entrance checks access, requests CMP consent for advertising, prepares the SDK, then requests video from a new user gesture. Playback completion starts a short callback grace period. Only the rewarded callback goes to verification. A valid response opens the viewer until the server expiry measured against a monotonic local clock. Reload and visibility changes check status again. Fallback lasts one hour per guest per day by default and is visibly temporary. The fallback API accepts a visitor request without treating a client claim of no fill as trustworthy. A visitor can reset their browser identity, so this limit is a UX mechanism. Premium is a trusted status type reserved for future billing and no Worker route issues it.

## API

All browser routes accept an exact configured Origin and a random 256-bit bearer stored locally. They omit cookies, expose no cacheable status, and use an Authorization header, which triggers CORS preflight. CORS alone provides no authentication.

| Method and path                | Result                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| GET /api/health                | Liveness                                                                                                   |
| GET /api/access/status         | Entitlement or null, with serverTime                                                                       |
| POST /api/access/ayet/identity | Stable server-derived pseudonymous externalIdentifier, distinct from the bearer                            |
| POST /api/access/ayet/reward   | Verify the allowlisted callback payload and return status, with X-Grant-Issued indicating a new conversion |
| POST /api/access/fallback      | Short, separately labelled access when configured                                                          |

The Worker checks status, rewarded, expected currency and the derived identifier, then verifies ayeT's HMAC-SHA1 over externalIdentifier + currency + conversionId. The SDK callback provides no signed placement ID. Use a dedicated publisher key/placement and validate real signed fixtures with ayeT before activation. Custom fields are rejected since the integration sets none and the published PHP sample for custom fields is malformed. The conversion row itself is the grant, making duplicate requests atomic under D1's primary key. Expired rows still prevent replay. Cloudflare's per-IP rate-limit binding is local to a location and approximate. The deployment owner should review abuse limits and retention for conversion IDs and fallback rows.

The guest bearer has the confidentiality properties of browser storage. Compromise of the viewer origin can expose it and local content. The real ayeT SDK is third-party JavaScript with top-level viewer-origin privileges when enabled. Require vendor/privacy approval of this exposure or move SDK execution to a separate approved origin before enabling on any origin that holds imported content. Application code never includes imported library fields in vendor requests or analytics. The static client gate is a product experience. Public JS and local IndexedDB remain accessible to the browser owner.

Telemetry is consent-gated and in-memory. Reporting functions use counters for verified unlocks per Watch click, no fills per Watch click, exits before clicking per gate view, returning sessions, and dashboard-supplied revenue per thousand visits. This release has no persistent collector or revenue reporting feed. Ordinary impression counts require a verified vendor signal; a frame mount does not represent an impression.

[ayeT callback documentation](https://docs.ayetstudios.com/v/product-docs/rewarded-video/web-integrations/rewarded-video-sdk-for-html5) · [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
