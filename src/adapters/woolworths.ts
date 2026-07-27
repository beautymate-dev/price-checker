import type { SiteAdapter, SpecialItem, StoreOption } from "./types.js";

/**
 * Not yet implemented. Woolworths NZ (formerly Countdown) has a reputation
 * for stronger anti-bot protection than the Foodstuffs sites, so this may
 * end up needing a headless-browser adapter (e.g. Playwright) rather than
 * plain HTTP requests. Phase 2 — see README.
 */
export function createWoolworthsAdapter(_storeId: string | undefined): SiteAdapter {
  async function findStores(_query: string): Promise<StoreOption[]> {
    throw new Error("Woolworths adapter not implemented yet.");
  }

  async function searchSpecials(_searchTerm: string): Promise<SpecialItem[]> {
    throw new Error("Woolworths adapter not implemented yet.");
  }

  return { site: "woolworths", findStores, searchSpecials };
}
