/**
 * Usage: npm run find-store -- <newworld|paknsave|woolworths> <suburb or store name>
 *
 * Prints matching stores with their IDs so you can populate .env
 * (NEWWORLD_STORE_ID / PAKNSAVE_STORE_ID / WOOLWORTHS_STORE_ID).
 */
import { createFoodstuffsAdapter } from "../src/adapters/foodstuffs.js";
import { createWoolworthsAdapter } from "../src/adapters/woolworths.js";
import type { SiteAdapter } from "../src/adapters/types.js";

async function main() {
  const [site, ...queryParts] = process.argv.slice(2);
  const query = queryParts.join(" ");

  if (site !== "newworld" && site !== "paknsave" && site !== "woolworths") {
    console.error('First argument must be "newworld", "paknsave", or "woolworths".');
    process.exit(1);
  }
  if (!query) {
    console.error("Provide a suburb or store name to search for, e.g.:");
    console.error(`  npm run find-store -- ${site} "Royal Oak"`);
    process.exit(1);
  }

  const adapter: SiteAdapter =
    site === "woolworths" ? createWoolworthsAdapter(undefined) : createFoodstuffsAdapter(site, undefined);
  const stores = await adapter.findStores(query);

  if (stores.length === 0) {
    console.log(`No ${site} stores matched "${query}".`);
    return;
  }

  console.log(`Matches for "${query}" on ${site}:\n`);
  for (const store of stores) {
    console.log(`  ${store.id}\t${store.name}${store.address ? `  (${store.address})` : ""}`);
  }
  console.log(`\nSet in .env: ${site.toUpperCase()}_STORE_ID=<id from above>`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
