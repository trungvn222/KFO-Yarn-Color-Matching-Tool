import { algoliasearch } from "algoliasearch";

export const INDEXES = {
  combinations: "kfo_combinations",
  colors: "kfo_colors",
  tags: "kfo_tags",
} as const;

const mockClient = {
  searchSingleIndex: async () => ({ results: { hits: [], nbHits: 0 } }),
  saveObject: async () => ({ objectID: "mock" }),
  deleteObject: async () => ({}),
  getObject: async () => ({}),
} as any;

function createAppClient() {
  if (process.env.DISABLE_ALGOLIA) return mockClient;
  const appId = process.env.ALGOLIA_APP_ID;
  const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;

  if (!appId || !adminKey) return mockClient;
  return algoliasearch(appId, adminKey);
}

// App Algolia: stores app-level settings (merchant config, etc.)
export default createAppClient();
