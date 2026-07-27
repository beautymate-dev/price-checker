# price-checker

Searches New World, Pak'nSave, and (eventually) Woolworths NZ for a given
term and shows only items currently on special, for a store you configure
per site.

## Status

- **New World / Pak'nSave**: adapter scaffolded, using a shared "Foodstuffs"
  implementation (both sites appear to run the same backend). **Not yet
  verified against live traffic** — see "Network limitation" below.
- **Woolworths NZ**: not implemented yet (`src/adapters/woolworths.ts` is a
  stub). Likely needs a headless-browser approach rather than plain HTTP
  requests — see "Next steps".

## Network limitation (read this first)

This project was scaffolded in a sandboxed environment whose network policy
blocks outbound requests to `paknsave.co.nz`, `newworld.co.nz`, and
`woolworths.co.nz` — so none of the adapter code has actually been run
against the live sites yet. The endpoint URLs and response-field guesses in
`src/adapters/foodstuffs.ts` come from community reverse-engineering
(a public gist documenting Foodstuffs' `CommonApi`, and a couple of
open-source NZ grocery comparison projects), not from a verified live
response.

**Before this will actually work**, run it somewhere with normal internet
access (your own machine) and:

1. `npm install`
2. `npm run probe -- newworld stores` — dumps the raw store list JSON.
   Confirm the field names used in `parseStore` (`src/adapters/foodstuffs.ts`)
   match reality; adjust if not.
3. Pick a store ID from that output, then:
   `npm run probe -- newworld search <storeId> "butter"` — dumps the raw
   product search JSON. Confirm/fix the field names in `parseProduct`,
   especially how "on special" is represented (a boolean flag, a promo-text
   field, or just `wasPrice > price`).
4. Repeat both probe commands for `paknsave` — its product-search endpoint
   in particular (`api-prod.paknsave.co.nz/...`) is the least-confirmed part
   of this scaffold and may need a different path entirely.

All of the response-shape parsing is isolated in the "Response shape
helpers" section at the bottom of `src/adapters/foodstuffs.ts` so fixes stay
contained to one place.

## Setup

```bash
npm install
cp .env.example .env
npm run find-store -- newworld "Your Suburb"   # then copy the ID into .env
npm run find-store -- paknsave "Your Suburb"
npm run dev
```

Open http://localhost:3000, search a term, and see current specials across
your configured stores.

## Architecture

- `src/adapters/types.ts` — shared `SiteAdapter` interface and normalized
  `SpecialItem`/`StoreOption` types every site adapter produces.
- `src/adapters/foodstuffs.ts` — shared New World / Pak'nSave adapter
  (store selection is session/cookie-based, so it uses a per-instance
  cookie jar).
- `src/adapters/woolworths.ts` — stub for phase 2.
- `src/search.ts` — fans a search term out to every configured adapter in
  parallel; one site failing doesn't block the others (`Promise.allSettled`).
- `src/server.ts` — Express server: static frontend + `GET /api/search?term=`.
- `public/` — minimal vanilla JS/HTML/CSS frontend.
- `scripts/find-store.ts` — CLI to resolve a suburb/store name to a store ID.
- `scripts/probe.ts` — CLI to dump raw API responses for verifying/fixing
  the field-mapping guesses above.

Store IDs are configured once via `.env` (`NEWWORLD_STORE_ID`,
`PAKNSAVE_STORE_ID`), not looked up on every search — matching the original
requirement that store selection be settable via variables.

## Next steps

1. Verify and fix the Foodstuffs field mappings per "Network limitation"
   above — this is the immediate blocker to a working demo.
2. Implement the Woolworths NZ adapter. Start by probing
   `https://www.woolworths.co.nz` traffic in a real browser's devtools
   Network tab while browsing to a category with specials, to see whether
   plain HTTP requests work or whether it needs Playwright.
3. Consider basic response caching (a search term re-run within a few
   minutes shouldn't re-hit every site) and a rate limit / backoff, since
   these are unofficial endpoints on commercial retail sites — keep usage
   to personal, reasonable-volume lookups.

## A note on legality/ToS

None of these three sites offer a public API for this purpose. This project
relies on their internal web-app endpoints, which are undocumented, can
change without notice, and may be rate-limited or blocked. Treat this as a
personal-use tool, not something to run at scale or distribute as a service.
