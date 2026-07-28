# price-checker

Searches New World, Pak'nSave, and Woolworths NZ for a given term and shows
only items currently on special, for a store you configure per site.

## Status

All three sites are working, verified against live traffic.

- **New World / Pak'nSave**: both run on the same Foodstuffs "edge" backend
  (`api-prod.<site>.co.nz`, Apigee-fronted) — see "How the Foodstuffs
  integration works" below.
- **Woolworths NZ**: turned out not to need a headless browser after all —
  see "How the Woolworths integration works" below.

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

## How the Woolworths integration works

Turned out to be simpler than Foodstuffs, and simpler than the original
stub's "probably needs Playwright" worry. It's a stateless REST API on the
same origin as the website — no auth token, no cookies, no session:

1. **One required header** — every `/api/v1/...` call needs
   `X-Requested-With: XMLHttpRequest`, or it 400s with `"Header is missing or
   is invalid"`. That's the only gate; a plain `curl` with just that header
   and a normal User-Agent works.
2. **Store list** — `GET /api/v1/addresses/pickup-addresses` returns
   `{ storeAreas: [{ name, storeAddresses: [{ id, name, address }] }] }`,
   grouped by region. The `"All Pick up locations"` area has every store
   nationwide.
3. **Product search** — `GET /api/v1/products?target=search&search=<term>&inStockProductsOnly=false&size=48`
   returns `{ products: { items: [...] } }`. Each item has `price.isSpecial`
   as a direct boolean (no promotions-array heuristics needed like
   Foodstuffs) plus `price.originalPrice`/`salePrice`/`savePrice` already in
   dollars, and unlike Foodstuffs, real image URLs and enough info
   (`sku`/`slug`) to build a working product page link.

The one real surprise: **the configured store doesn't change what comes
back.** Unlike Foodstuffs (independently-owned stores, genuinely different
specials per store), Woolworths pricing/specials from this endpoint are the
same nationwide — there's no store or region filter parameter on the search
endpoint. `WOOLWORTHS_STORE_ID` is still required (kept consistent with the
other two adapters) and used to resolve a display name for each result's
`storeName`, but it's cosmetic here, not a real per-store filter.

## Setup

```bash
npm install
cp .env.example .env
npm run find-store -- newworld "Your Suburb"   # then copy the ID into .env
npm run find-store -- paknsave "Your Suburb"
npm run find-store -- woolworths "Your Suburb"
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
- `src/adapters/woolworths.ts` — Woolworths NZ adapter. Fully stateless
  (no token, no cookies) — just one required header per request.
- `src/search.ts` — fans a search term out to every configured adapter in
  parallel; one site failing doesn't block the others (`Promise.allSettled`).
- `src/server.ts` — Express server: static frontend + `GET /api/search?term=`.
- `public/` — minimal vanilla JS/HTML/CSS frontend.
- `scripts/find-store.ts` — CLI to resolve a suburb/store name to a store ID.
- `scripts/probe.ts` — CLI to dump raw Foodstuffs API responses for
  verifying/fixing the field-mapping guesses above.

Store IDs are configured once via `.env` (`NEWWORLD_STORE_ID`,
`PAKNSAVE_STORE_ID`, `WOOLWORTHS_STORE_ID`), not looked up on every search —
matching the original requirement that store selection be settable via
variables.

## Next steps

1. Consider basic response caching (a search term re-run within a few
   minutes shouldn't re-hit every site) and a rate limit / backoff, since
   these are unofficial endpoints on commercial retail sites — keep usage
   to personal, reasonable-volume lookups.
2. If a live "N for $X" multi-buy special ever shows up on Foodstuffs,
   double-check the `threshold > 1` assumption in
   `src/adapters/foodstuffs.ts` (see above).

## A note on legality/ToS

None of these three sites offer a public API for this purpose. This project
relies on their internal web-app endpoints, which are undocumented, can
change without notice, and may be rate-limited or blocked. Treat this as a
personal-use tool, not something to run at scale or distribute as a service.
