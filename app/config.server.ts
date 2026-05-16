import fs from "node:fs";
import path from "node:path";
import { algoliasearch } from "algoliasearch";
import appAlgolia from "./algolia.server";
import { INDEXES } from "./algolia.server";

// Fallback file when DISABLE_ALGOLIA=true
const FALLBACK_PATH = path.resolve(process.cwd(), "merchant.config.json");
const SETTINGS_INDEX = "kfo_settings";

export interface MerchantAlgoliaConfig {
  appId: string;
  adminApiKey: string;
  searchOnlyApiKey: string;
}

const empty: MerchantAlgoliaConfig = {
  appId: "",
  adminApiKey: "",
  searchOnlyApiKey: "",
};

export async function readMerchantConfig(
  shop: string,
): Promise<MerchantAlgoliaConfig> {
  if (process.env.DISABLE_ALGOLIA) {
    try {
      const all = JSON.parse(fs.readFileSync(FALLBACK_PATH, "utf8"));
      return all[shop] ?? { ...empty };
    } catch {
      return { ...empty };
    }
  }

  try {
    const obj = await appAlgolia.getObject({
      indexName: SETTINGS_INDEX,
      objectID: shop,
    });
    const { appId, adminApiKey, searchOnlyApiKey } = obj as any;

    return {
      appId: appId || "",
      adminApiKey: adminApiKey || "",
      searchOnlyApiKey: searchOnlyApiKey || "",
    };
  } catch (error) {
    return { ...empty };
  }
}

export function isMerchantConfigComplete(config: MerchantAlgoliaConfig) {
  return Boolean(config.appId && config.adminApiKey && config.searchOnlyApiKey);
}

export async function requireMerchantConfig(
  shop: string,
): Promise<MerchantAlgoliaConfig | null> {
  const config = await readMerchantConfig(shop);

  if (!isMerchantConfigComplete(config)) {
    return null;
  }

  return config;
}

async function initMerchantIndexes(appId: string, adminApiKey: string) {
  const client = algoliasearch(appId, adminApiKey);
  await Promise.all(
    Object.values(INDEXES).map(async (indexName) => {
      await client.saveObject({
        indexName,
        body: { objectID: "__init__" },
      });
      await client.deleteObject({ indexName, objectID: "__init__" });
    }),
  );
}

export async function writeMerchantConfig(
  shop: string,
  config: MerchantAlgoliaConfig,
): Promise<void> {
  if (process.env.DISABLE_ALGOLIA) {
    let all: Record<string, MerchantAlgoliaConfig> = {};
    try {
      all = JSON.parse(fs.readFileSync(FALLBACK_PATH, "utf8"));
    } catch {}
    all[shop] = config;
    fs.writeFileSync(FALLBACK_PATH, JSON.stringify(all, null, 2));
    await initMerchantIndexes(config.appId, config.adminApiKey);
    return;
  }
  await appAlgolia.saveObject({
    indexName: SETTINGS_INDEX,
    body: { objectID: shop, ...config },
  });
  await initMerchantIndexes(config.appId, config.adminApiKey);
}
