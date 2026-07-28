import type { SiteAdapter, SpecialItem, StoreOption } from "./types.js";
import { createSessionFetch } from "./httpClient.js";

const baseUrl = "https://www.woolworths.co.nz";

/**
 * Verified against live traffic (see README). Unlike Foodstuffs, this needs
 * no auth token and no cookies — every call is stateless GET, gated only by
 * one required header (`X-Requested-With: XMLHttpRequest`; omitting it
 * returns a 400 "Header is missing or is invalid").
 *
 * - Store list: GET /api/v1/addresses/pickup-addresses returns
 *   `{ storeAreas: [{ name, storeAddresses: [{ id, name, address }] }] }`,
 *   grouped by region. The "All Pick up locations" area has every store.
 * - Product search: GET /api/v1/products?target=search&search=<term>&size=48
 *   returns `{ products: { items: [...] } }`. Each item has `price.isSpecial`
 *   — a direct boolean, unlike Foodstuffs' promotions-array heuristic.
 *
 * Note: unlike Foodstuffs (independently-owned stores with their own
 * specials), Woolworths pricing/specials from this endpoint are the same
 * regardless of which store is configured — there's no per-store filter
 * parameter. `storeId` is still required and resolved to a display name
 * (kept consistent with the other adapters and the "store you configure"
 * framing), but it doesn't change which items come back.
 */
export function createWoolworthsAdapter(storeId: string | undefined): SiteAdapter {
  const sessionFetch = createSessionFetch();
  let cachedStores: StoreOption[] | undefined;

  async function apiFetch(path: string): Promise<Response> {
    return sessionFetch(`${baseUrl}${path}`, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  }

  async function findStores(query: string): Promise<StoreOption[]> {
    if (!cachedStores) {
      const res = await apiFetch("/api/v1/addresses/pickup-addresses");
      if (!res.ok) {
        throw new Error(`woolworths: failed to fetch store list (HTTP ${res.status})`);
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
        'No store configured for woolworths. Run "npm run find-store -- woolworths <suburb>" and set ' +
          "WOOLWORTHS_STORE_ID in your .env file.",
      );
    }

    const params = new URLSearchParams({ target: "search", search: searchTerm, inStockProductsOnly: "false", size: "48" });
    const res = await apiFetch(`/api/v1/products?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`woolworths: product search failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as unknown;
    const products = extractProductArray(data);
    const storeName = await resolveStoreName();

    return products
      .map(parseProduct)
      .filter((item): item is ParsedProduct => item !== null && item.onSpecial)
      .map(({ onSpecial: _onSpecial, ...item }) => ({ ...item, storeName }));
  }

  return { site: "woolworths", findStores, searchSpecials };
}

// --- Response shape helpers -------------------------------------------------

function extractStoreArray(data: unknown): unknown[] {
  if (data && typeof data === "object") {
    const areas = (data as Record<string, unknown>).storeAreas;
    if (Array.isArray(areas)) {
      const allLocations = areas.find(
        (a) => a && typeof a === "object" && (a as Record<string, unknown>).name === "All Pick up locations",
      ) as Record<string, unknown> | undefined;
      const addresses = allLocations?.storeAddresses;
      if (Array.isArray(addresses)) return addresses;
    }
  }
  return [];
}

function parseStore(raw: unknown): StoreOption | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if ((typeof r.id !== "number" && typeof r.id !== "string") || typeof r.name !== "string") return null;
  return { id: String(r.id), name: r.name.trim(), address: typeof r.address === "string" ? r.address : undefined };
}

function extractProductArray(data: unknown): unknown[] {
  if (data && typeof data === "object") {
    const products = (data as Record<string, unknown>).products;
    if (products && typeof products === "object") {
      const items = (products as Record<string, unknown>).items;
      if (Array.isArray(items)) return items;
    }
  }
  return [];
}

type ParsedProduct = SpecialItem & { onSpecial: boolean };

function parseProduct(raw: unknown): ParsedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "Product") return null; // skip PromoTile/ad entries mixed into results

  const name = r.name;
  if (typeof name !== "string") return null;

  const price = r.price as Record<string, unknown> | undefined;
  const salePrice = toNumber(price?.salePrice);
  if (salePrice == null) return null;
  const originalPrice = toNumber(price?.originalPrice);
  const savePrice = toNumber(price?.savePrice);
  const onSpecial = Boolean(price?.isSpecial);

  const productTag = r.productTag as Record<string, unknown> | undefined;
  const multiBuy = typeof productTag?.multiBuy === "string" ? productTag.multiBuy : undefined;
  const specialLabel = onSpecial
    ? (multiBuy ?? (savePrice && savePrice > 0 ? `Save $${savePrice.toFixed(2)}` : price?.isClubPrice ? "Club price" : "On Special"))
    : undefined;

  const size = r.size as Record<string, unknown> | undefined;
  const images = r.images as Record<string, unknown> | undefined;
  const sku = r.sku;
  const slug = r.slug;

  return {
    site: "woolworths",
    storeName: "",
    productName: titleCase(name),
    brand: typeof r.brand === "string" ? titleCase(r.brand) : undefined,
    size: typeof size?.volumeSize === "string" ? size.volumeSize : undefined,
    price: salePrice,
    wasPrice: onSpecial && originalPrice != null && originalPrice > salePrice ? originalPrice : undefined,
    specialLabel,
    imageUrl: typeof images?.big === "string" ? images.big : undefined,
    productUrl:
      typeof sku === "string" && typeof slug === "string"
        ? `${baseUrl}/shop/productdetails?stockcode=${sku}&name=${slug}`
        : undefined,
    onSpecial,
  };
}

function titleCase(s: string): string {
  return s.trim().replace(/\S+/g, (word) => word[0]!.toUpperCase() + word.slice(1));
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}
