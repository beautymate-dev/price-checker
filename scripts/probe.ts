/**
 * Debug helper: dumps raw JSON from the Foodstuffs endpoints this project
 * relies on, so you can confirm/correct the field-mapping guesses in
 * src/adapters/foodstuffs.ts.
 *
 * MUST be run somewhere with normal internet access — this sandbox's
 * network policy blocks outbound requests to these domains (see README).
 *
 * Usage:
 *   npm run probe -- <newworld|paknsave> stores
 *   npm run probe -- <newworld|paknsave> search <storeId> <term>
 */
import { createSessionFetch } from "../src/adapters/httpClient.js";

async function main() {
  const [site, mode, ...rest] = process.argv.slice(2);

  if (site !== "newworld" && site !== "paknsave") {
    console.error('First argument must be "newworld" or "paknsave".');
    process.exit(1);
  }

  const sessionFetch = createSessionFetch();
  const baseUrl = `https://www.${site}.co.nz`;
  const apiProdUrl = `https://api-prod.${site}.co.nz`;

  if (mode === "stores") {
    const res = await sessionFetch(`${baseUrl}/CommonApi/Store/GetStoreList`);
    console.log(`HTTP ${res.status}`);
    console.log(await res.text());
    return;
  }

  if (mode === "search") {
    const [storeId, ...termParts] = rest;
    const term = termParts.join(" ");
    if (!storeId || !term) {
      console.error("Usage: npm run probe -- <site> search <storeId> <term>");
      process.exit(1);
    }

    const changeRes = await sessionFetch(
      `${baseUrl}/CommonApi/Store/ChangeStore?storeId=${encodeURIComponent(storeId)}&clickSource=list`,
      { method: "POST" },
    );
    console.log(`ChangeStore HTTP ${changeRes.status}`);

    const url = new URL(`${apiProdUrl}/v1/edge/search/paginated/products`);
    url.searchParams.set("target", term);
    url.searchParams.set("storeId", storeId);
    url.searchParams.set("page", "1");

    const res = await sessionFetch(url.toString());
    console.log(`Search HTTP ${res.status}`);
    console.log(await res.text());
    return;
  }

  console.error('Second argument must be "stores" or "search".');
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
