import { algoliasearch } from "algoliasearch";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load app Algolia credentials from .env
const envPath = resolve(process.cwd(), ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const appClient = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_ADMIN_API_KEY);

// Read merchant credentials from kfo_settings
const settings = await appClient.getObject({
  indexName: "kfo_settings",
  objectID: "algolia",
});

const { appId, adminApiKey } = settings;
const merchantClient = algoliasearch(appId, adminApiKey);

const indexes = ["kfo_combinations", "kfo_colors", "kfo_tags"];

for (const index of indexes) {
  try {
    await merchantClient.deleteIndex({ indexName: index });
    console.log(`✓ Deleted index: ${index}`);
  } catch (err) {
    console.error(`✗ Failed to delete ${index}:`, err.message);
  }
}
