import { algoliasearch } from "algoliasearch";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
);

// Read merchant credentials from kfo_settings
const appClient = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_ADMIN_API_KEY);
const settings = await appClient.getObject({ indexName: "kfo_settings", objectID: "algolia" });
const { appId, adminApiKey } = settings;

const merchantClient = algoliasearch(appId, adminApiKey);
const indexes = ["kfo_combinations", "kfo_colors", "kfo_tags"];

for (const indexName of indexes) {
  await merchantClient.saveObject({ indexName, body: { objectID: "__init__" } });
  await merchantClient.deleteObject({ indexName, objectID: "__init__" });
  console.log(`✓ Created index: ${indexName}`);
}

// Configure faceting for combinations index
await merchantClient.setSettings({
  indexName: "kfo_combinations",
  indexSettings: {
    searchableAttributes: ["name", "description"],
    attributesForFaceting: ["tags", "colors"],
    customRanking: ["asc(position)"],
  },
});
console.log("✓ Set index settings on kfo_combinations");
