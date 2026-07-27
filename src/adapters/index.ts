import { config } from "../config.js";
import { createFoodstuffsAdapter } from "./foodstuffs.js";
import { createWoolworthsAdapter } from "./woolworths.js";
import type { SiteAdapter } from "./types.js";

export const adapters: SiteAdapter[] = [
  createFoodstuffsAdapter("newworld", config.newworld.storeId),
  createFoodstuffsAdapter("paknsave", config.paknsave.storeId),
  createWoolworthsAdapter(config.woolworths.storeId),
];

export type { SiteAdapter, SpecialItem, StoreOption, SiteId } from "./types.js";
