# price-checker

Searches New World, Pak'nSave, and (eventually) Woolworths NZ for a given
term and shows only items currently on special, for a store you configure
per site.

## Status

- **New World / Pak'nSave**: working, verified against live traffic. Both
  sites run on the same Foodstuffs "edge" backend
  (`api-prod.<site>.co.nz`, Apigee-fronted) — see "How the Foodstuffs
  integration works" below.
- **Woolworths NZ**: not implemented yet (`src/adapters/woolworths.ts` is a
  stub). Likely needs a headless-browser approach rather than plain HTTP
  requests — see "Next steps".

## How the Foodstuffs integration works

Both `newworld.co.nz` and `paknsave.co.nz` are modern Next.js sites where the
product grid is populated client-side by direct calls to
`api-prod.<site>.co.nz` (not by anything server-rendered or visible in a
plain `curl` of the page HTML). Reverse-engineered from live Network-tab
traffic and confirmed working from a plain server-side `fetch` (no browser,
no cookies required):

1. **Anonymous auth token** — `POST https://www.<site>.co.nz/api/user/get-current-user`
   returns `{ access_token, expires_time }`, a short-lived (~15 min) JWT with
   an `ANONYMOUS` role. No login needed. Sent as `Authorization: Bearer
   <token>` on every `api-prod` call.
2. **Store list** — `GET https://api-prod.<site>.co.nz/v1/edge/store` returns
   `{ stores: [{ id, name, address, ... }] }` for every physical store on
   that banner. `id` is a UUID, not the small numeric ID the old
   `CommonApi/Store/GetStoreList` gist endpoint used (that endpoint 404s on
   the current site — it's been replaced).
3. **Product search** — `POST https://api-prod.<site>.co.nz/v1/edge/search/paginated/products`
   with a JSON body `{ page, hitsPerPage, sortOrder, storeId, algoliaQuery: { query } }`
   returns `{ products: [...] }`. Each product has `singlePrice.price` (shelf
   price, in cents) and an optional `promotions[]` array; a non-empty
   `promotions` array is how each site marks an item as "currently a deal" —
   note this is broader than a markdown: Pak'nSave in particular badges many
   everyday-low-price items as deals with `promotions[0].rewardValue` equal
   to the shelf price (no strikethrough "was" price shown on-site either).
   `src/adapters/foodstuffs.ts` treats `rewardValue < shelf price` as a real
   markdown (shows a "was" price) and any other non-empty `promotions` entry
   as an "On Special" badge with no markdown.

All of the response-shape parsing is isolated in the "Response shape
helpers" section at the bottom of `src/adapters/foodstuffs.ts` so future
fixes (if Foodstuffs changes the shape again) stay contained to one place.
`npm run probe -- <site> stores|search` dumps the raw JSON if you need to
re-verify.

One assumption worth flagging: a "N for $X" multi-buy promotion (`threshold
> 1`) is assumed to report `rewardValue` as the bundle's total price, not a
per-unit price — this was inferred from the field naming, not observed in a
live response, since no multi-buy deal happened to be live during
verification. Worth a second look if multi-buy pricing ever looks off.

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
- `src/adapters/foodstuffs.ts` — shared New World / Pak'nSave adapter. Store
  selection is stateless (a `storeId` UUID passed per request, looked up via
  `npm run find-store`); the adapter caches a short-lived bearer token per
  instance instead.
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

1. Implement the Woolworths NZ adapter. Start by probing
   `https://www.woolworths.co.nz` traffic in a real browser's devtools
   Network tab while browsing to a category with specials, to see whether
   plain HTTP requests work or whether it needs Playwright.
2. Consider basic response caching (a search term re-run within a few
   minutes shouldn't re-hit every site) and a rate limit / backoff, since
   these are unofficial endpoints on commercial retail sites — keep usage
   to personal, reasonable-volume lookups.
3. If a live "N for $X" multi-buy special ever shows up, double-check the
   `threshold > 1` assumption in `src/adapters/foodstuffs.ts` (see above).

## A note on legality/ToS

None of these three sites offer a public API for this purpose. This project
relies on their internal web-app endpoints, which are undocumented, can
change without notice, and may be rate-limited or blocked. Treat this as a
personal-use tool, not something to run at scale or distribute as a service.
