import { adapters } from "./adapters/index.js";
import type { SpecialItem } from "./adapters/types.js";

export interface SearchResult {
  items: SpecialItem[];
  errors: { site: string; message: string }[];
}

/**
 * Fans out to every configured adapter and merges the specials-only
 * results. One site failing (blocked, mis-configured, endpoint changed)
 * must not prevent the others from returning results.
 */
export async function searchAllSites(term: string): Promise<SearchResult> {
  const settled = await Promise.allSettled(adapters.map((adapter) => adapter.searchSpecials(term)));

  const items: SpecialItem[] = [];
  const errors: { site: string; message: string }[] = [];

  settled.forEach((result, i) => {
    const site = adapters[i]!.site;
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      errors.push({ site, message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    }
  });

  items.sort((a, b) => a.price - b.price);
  return { items, errors };
}
