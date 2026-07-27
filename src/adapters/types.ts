export type SiteId = "newworld" | "paknsave" | "woolworths";

export interface StoreOption {
  id: string;
  name: string;
  address?: string;
}

export interface SpecialItem {
  site: SiteId;
  storeName: string;
  productName: string;
  brand?: string;
  size?: string;
  price: number;
  wasPrice?: number;
  specialLabel?: string;
  imageUrl?: string;
  productUrl?: string;
}

export interface SiteAdapter {
  readonly site: SiteId;
  /** Search this site's store list by name/suburb, e.g. "Royal Oak". */
  findStores(query: string): Promise<StoreOption[]>;
  /**
   * Search for a term and return only items currently on special/sale
   * at the store configured for this site. Throws if no store is configured.
   */
  searchSpecials(searchTerm: string): Promise<SpecialItem[]>;
}
