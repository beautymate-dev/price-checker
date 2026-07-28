/**
 * Debug helper: dumps raw JSON from the Foodstuffs endpoints this project
 * relies on, so you can confirm/correct the field-mapping guesses in
 * src/adapters/foodstuffs.ts if the API changes shape.
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

  const tokenRes = await sessionFetch(`${baseUrl}/api/user/get-current-user`, { method: "POST" });
  if (!tokenRes.ok) {
    console.error(`Failed to get access token: HTTP ${tokenRes.status}`);
    process.exit(1);
  }
  const { access_token: token } = (await tokenRes.json()) as { access_token: string };

  if (mode === "stores") {
    const res = await sessionFetch(`${apiProdUrl}/v1/edge/store`, { headers: { Authorization: `Bearer ${token}` } });
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

    const res = await sessionFetch(`${apiProdUrl}/v1/edge/search/paginated/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ page: 1, hitsPerPage: 50, sortOrder: "PRICE_ASC", storeId, algoliaQuery: { query: term } }),
    });
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
