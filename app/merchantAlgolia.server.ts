import { algoliasearch } from "algoliasearch";
import { readMerchantConfig } from "./config.server";

type AlgoliaClient = ReturnType<typeof algoliasearch>;

const mockClient: AlgoliaClient = {
  searchSingleIndex: async () => ({ hits: [], nbHits: 0 } as any),
  saveObject: async () => ({ taskID: 0, objectID: "mock" } as any),
  deleteObject: async () => ({} as any),
  getObject: async () => ({} as any),
} as unknown as AlgoliaClient;

export async function getMerchantAlgoliaClient(shop: string): Promise<AlgoliaClient> {
  const { appId, adminApiKey } = await readMerchantConfig(shop);
  if (!appId || !adminApiKey) return mockClient;
  return algoliasearch(appId, adminApiKey);
}
