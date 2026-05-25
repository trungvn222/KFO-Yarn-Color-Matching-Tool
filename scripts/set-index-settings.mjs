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

const appClient = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_ADMIN_API_KEY);
const settings = await appClient.getObject({ indexName: "kfo_settings", objectID: "algolia" });
const { appId, adminApiKey } = settings;

const merchantClient = algoliasearch(appId, adminApiKey);

await merchantClient.setSettings({
  indexName: "kfo_combinations",
  indexSettings: {
    searchableAttributes: ["name", "description"],
    attributesForFaceting: ["tags", "colors"],
    customRanking: ["asc(position)"],
  },
});
console.log("✓ Set index settings on kfo_combinations");
