import { algoliasearch } from "algoliasearch";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually
const envPath = resolve(process.cwd(), ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const appId = env.ALGOLIA_APP_ID;
const adminKey = env.ALGOLIA_ADMIN_API_KEY;
const searchOnlyKey = env.ALGOLIA_SEARCH_ONLY_API_KEY;

if (!appId || !adminKey || !searchOnlyKey) {
  console.error("Missing Algolia credentials in .env");
  process.exit(1);
}

const client = algoliasearch(appId, adminKey);

const shop = env.SHOPIFY_SHOP || "trung-app-2-store.myshopify.com";

await client.saveObject({
  indexName: "kfo_settings",
  body: {
    objectID: shop,
    appId,
    adminApiKey: adminKey,
    searchOnlyApiKey: searchOnlyKey,
  },
});

console.log(`✓ Saved merchant Algolia config for shop: ${shop}`);
console.log(`  App ID: ${appId}`);
