import type { SiteAdapter, SiteId, SpecialItem, StoreOption } from "./types.js";
import { createSessionFetch } from "./httpClient.js";

/**
 * New World and Pak'nSave are both run by Foodstuffs on the same "edge"
 * backend (Apigee-fronted, hostname api-prod.<site>.co.nz) — only the
 * domain/banner differs. This adapter is shared between the two,
 * parameterized by domain.
 *
 * Verified against live traffic (see README):
 * - Auth: POST https://www.<site>.co.nz/api/user/get-current-user returns an
 *   anonymous JWT (`access_token`, ~15 min TTL) used as a Bearer token for
 *   every api-prod call. No cookies/session/store-selection step needed.
 * - Store list: GET https://api-prod.<site>.co.nz/v1/edge/store returns
 *   every store for the banner as `{ stores: [{ id, name, address, ... }] }`.
 * - Product search: POST https://api-prod.<site>.co.nz/v1/edge/search/paginated/products
 *   with a JSON body, returns `{ products: [...] }`.
 */
export function createFoodstuffsAdapter(site: "newworld" | "paknsave", storeId: string | undefined): SiteAdapter {
  const baseUrl = `https://www.${site}.co.nz`;
  const apiProdUrl = `https://api-prod.${site}.co.nz`;
  const sessionFetch = createSessionFetch();

  let cachedStores: StoreOption[] | undefined;
  let cachedToken: { value: string; expiresAtMs: number } | undefined;

  async function getToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAtMs - 30_000 > Date.now()) {
      return cachedToken.value;
    }
    const res = await sessionFetch(`${baseUrl}/api/user/get-current-user`, { method: "POST" });
    if (!res.ok) {
      throw new Error(`${site}: failed to obtain an access token (HTTP ${res.status})`);
    }
    const data = (await res.json()) as { access_token: string; expires_time: string };
    cachedToken = { value: data.access_token, expiresAtMs: Date.parse(data.expires_time) };
    return cachedToken.value;
  }

  async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken();
    return sessionFetch(`${apiProdUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  }

  async function findStores(query: string): Promise<StoreOption[]> {
    if (!cachedStores) {
      const res = await apiFetch("/v1/edge/store");
      if (!res.ok) {
        throw new Error(`${site}: failed to fetch store list (HTTP ${res.status})`);
      }
      const data = (await res.json()) as unknown;
      cachedStores = extractStoreArray(data)
        .map(parseStore)
        .filter((store): store is StoreOption => store !== null);
    }
    const needle = query.trim().toLowerCase();
    return cachedStores.filter((store) => !needle || store.name.toLowerCase().includes(needle));
  }

  async function resolveStoreName(): Promise<string> {
    if (!storeId) return "";
    const stores = await findStores("");
    return stores.find((s) => s.id === storeId)?.name ?? storeId;
  }

  async function searchSpecials(searchTerm: string): Promise<SpecialItem[]> {
    if (!storeId) {
      throw new Error(
        `No store configured for ${site}. Run "npm run find-store -- ${site} <suburb>" and set ` +
          `${site.toUpperCase()}_STORE_ID in your .env file.`,
      );
    }

    const res = await apiFetch("/v1/edge/search/paginated/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: 1,
        hitsPerPage: 50,
        sortOrder: "PRICE_ASC",
        storeId,
        algoliaQuery: { query: searchTerm },
      }),
    });
    if (!res.ok) {
      throw new Error(`${site}: product search failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as unknown;
    const products = extractProductArray(data);
    const storeName = await resolveStoreName();

    return products
      .map((raw) => parseProduct(site, raw))
      .filter((item): item is ParsedProduct => item !== null && item.onSpecial)
      .map(({ onSpecial: _onSpecial, ...item }) => ({ ...item, storeName }));
  }

  return { site, findStores, searchSpecials };
}

// --- Response shape helpers -------------------------------------------------

function extractStoreArray(data: unknown): unknown[] {
  if (data && typeof data === "object") {
    const stores = (data as Record<string, unknown>).stores;
    if (Array.isArray(stores)) return stores;
  }
  return [];
}

function parseStore(raw: unknown): StoreOption | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  return { id: r.id, name: r.name, address: typeof r.address === "string" ? r.address : undefined };
}

function extractProductArray(data: unknown): unknown[] {
  if (data && typeof data === "object") {
    const products = (data as Record<string, unknown>).products;
    if (Array.isArray(products)) return products;
  }
  return [];
}

type ParsedProduct = SpecialItem & { onSpecial: boolean };

interface Promotion {
  rewardValue?: number;
  threshold?: number;
  bestPromotion?: boolean;
  cardDependencyFlag?: boolean;
}

function parseProduct(site: SiteId, raw: unknown): ParsedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const name = r.name;
  if (typeof name !== "string") return null;

  const singlePrice = r.singlePrice as Record<string, unknown> | undefined;
  const wasPriceCents = toNumber(singlePrice?.price);
  if (wasPriceCents == null) return null;

  const promotions = Array.isArray(r.promotions) ? (r.promotions as Promotion[]) : [];
  const bestPromo = promotions.find((p) => p.bestPromotion) ?? promotions[0];

  // A non-empty `promotions` array is Foodstuffs' own "this is a deal" signal
  // (matches what each site's own /shop/specials or /shop/deals page lists) —
  // it's broader than "price is lower than shelf price": Pak'nSave in
  // particular badges plenty of everyday-low-price items as deals with no
  // markdown at all (rewardValue === shelf price).
  const onSpecial = Boolean(bestPromo && typeof bestPromo.rewardValue === "number");

  // threshold > 1 means a "N for $X" multi-buy deal, where rewardValue is the
  // total price for the bundle (unconfirmed against a live multi-buy example
  // — adjust here if a real "3 for $6"-style response proves otherwise).
  const threshold = bestPromo?.threshold ?? 1;
  const rewardValue = bestPromo?.rewardValue ?? wasPriceCents;
  const currentPriceCents = threshold > 1 ? rewardValue / threshold : rewardValue;
  const isMarkdown = currentPriceCents < wasPriceCents;

  const specialLabel = onSpecial
    ? threshold > 1
      ? `${threshold} for $${(rewardValue / 100).toFixed(2)}`
      : bestPromo?.cardDependencyFlag
        ? "Club+ price"
        : isMarkdown
          ? undefined
          : "On Special"
    : undefined;

  return {
    site,
    storeName: "",
    productName: name,
    brand: typeof r.brand === "string" ? r.brand : undefined,
    size: typeof r.displayName === "string" ? r.displayName : undefined,
    price: currentPriceCents / 100,
    wasPrice: onSpecial && isMarkdown ? wasPriceCents / 100 : undefined,
    specialLabel,
    onSpecial,
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}
