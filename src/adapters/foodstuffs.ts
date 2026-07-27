import type { SiteAdapter, SiteId, SpecialItem, StoreOption } from "./types.js";
import { createSessionFetch } from "./httpClient.js";

/**
 * New World and Pak'nSave are both run by Foodstuffs on what looks like
 * the same underlying "CommonApi" backend (only the domain differs), per
 * community reverse-engineering (see README). This adapter is shared
 * between the two, parameterized by domain.
 *
 * IMPORTANT: none of this is officially documented, and it has NOT been
 * verified against live traffic from this environment (outbound requests
 * to these domains are blocked by this sandbox's network policy — see
 * README "Network limitation"). Field names in `parseProduct` below are
 * best-effort guesses and will likely need correcting once you run
 * `npm run probe` somewhere with normal internet access and inspect a
 * real response.
 */
export function createFoodstuffsAdapter(site: "newworld" | "paknsave", storeId: string | undefined): SiteAdapter {
  const baseUrl = `https://www.${site}.co.nz`;
  const apiProdUrl = `https://api-prod.${site}.co.nz`;
  const sessionFetch = createSessionFetch();
  let storeSelected = false;
  let cachedStoreName: string | undefined;

  async function resolveStoreName(): Promise<string> {
    if (cachedStoreName) return cachedStoreName;
    if (!storeId) return "";
    try {
      const stores = await findStores("");
      cachedStoreName = stores.find((s) => s.id === storeId)?.name ?? storeId;
    } catch {
      cachedStoreName = storeId;
    }
    return cachedStoreName;
  }

  async function ensureStoreSelected(): Promise<void> {
    if (storeSelected) return;
    if (!storeId) {
      throw new Error(
        `No store configured for ${site}. Run "npm run find-store -- ${site} <suburb>" and set ` +
          `${site.toUpperCase()}_STORE_ID in your .env file.`,
      );
    }
    const res = await sessionFetch(
      `${baseUrl}/CommonApi/Store/ChangeStore?storeId=${encodeURIComponent(storeId)}&clickSource=list`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new Error(`${site}: failed to select store ${storeId} (HTTP ${res.status})`);
    }
    storeSelected = true;
  }

  async function findStores(query: string): Promise<StoreOption[]> {
    const res = await sessionFetch(`${baseUrl}/CommonApi/Store/GetStoreList`);
    if (!res.ok) {
      throw new Error(`${site}: failed to fetch store list (HTTP ${res.status})`);
    }
    const data = (await res.json()) as unknown;
    const stores = extractStoreArray(data);
    const needle = query.trim().toLowerCase();
    return stores
      .map(parseStore)
      .filter((store): store is StoreOption => store !== null)
      .filter((store) => !needle || store.name.toLowerCase().includes(needle));
  }

  async function searchSpecials(searchTerm: string): Promise<SpecialItem[]> {
    await ensureStoreSelected();

    // VERIFY: endpoint path/params confirmed for newworld.co.nz via community
    // docs; assumed (not confirmed) to mirror for paknsave.co.nz under its
    // own api-prod host. Adjust once you've probed the real traffic.
    const url = new URL(`${apiProdUrl}/v1/edge/search/paginated/products`);
    url.searchParams.set("target", searchTerm);
    url.searchParams.set("storeId", storeId!);
    url.searchParams.set("page", "1");

    const res = await sessionFetch(url.toString());
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
//
// These are intentionally isolated and defensive: the real response shape
// is unconfirmed from this environment. If probing reveals a different
// shape, only this section should need edits.

function extractStoreArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["storeAreas", "stores", "Stores", "data"]) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function parseStore(raw: unknown): StoreOption | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id ?? r.Id ?? r.storeId ?? r.StoreId;
  const name = r.name ?? r.Name ?? r.storeName ?? r.StoreName;
  if (id == null || name == null) return null;
  const address = r.address ?? r.Address ?? undefined;
  return { id: String(id), name: String(name), address: address ? String(address) : undefined };
}

function extractProductArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["products", "Products", "items", "Items", "data"]) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

type ParsedProduct = SpecialItem & { onSpecial: boolean };

function parseProduct(site: SiteId, raw: unknown): ParsedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const name = r.name ?? r.Name ?? r.displayName ?? r.DisplayName;
  if (name == null) return null;

  const priceObj = (r.price ?? r.Price ?? r) as Record<string, unknown>;
  const currentPrice = toNumber(priceObj.salePrice ?? priceObj.SalePrice ?? priceObj.originalPrice ?? priceObj.Price);
  const wasPrice = toNumber(priceObj.originalPrice ?? priceObj.OriginalPrice ?? priceObj.was ?? priceObj.Was);

  if (currentPrice == null) return null;

  const specialLabel = r.promoText ?? r.PromoText ?? r.specialLabel ?? r.SpecialLabel ?? r.promotionDescription;
  const onSpecial = Boolean(
    r.onSpecial ?? r.OnSpecial ?? r.isSpecial ?? r.IsSpecial ?? (wasPrice != null && wasPrice > currentPrice) ?? specialLabel,
  );

  return {
    site,
    storeName: "",
    productName: String(name),
    brand: r.brand ? String(r.brand) : r.Brand ? String(r.Brand) : undefined,
    size: r.size ? String(r.size) : r.Size ? String(r.Size) : undefined,
    price: currentPrice,
    wasPrice: wasPrice ?? undefined,
    specialLabel: specialLabel ? String(specialLabel) : undefined,
    imageUrl: r.imageUrl ? String(r.imageUrl) : r.ImageUrl ? String(r.ImageUrl) : undefined,
    productUrl: r.url ? String(r.url) : undefined,
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
