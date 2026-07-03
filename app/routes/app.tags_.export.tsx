import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoTag } from "../types/kfo";

function buildCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const config = await requireMerchantConfig(session.shop);
  if (!config) return new Response("Algolia not configured", { status: 400 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";

  const client = await getMerchantAlgoliaClient(session.shop);

  const tagsRes = await client.searchSingleIndex<KfoTag>({
    indexName: INDEXES.tags,
    searchParams: { query: q, hitsPerPage: 1000, page: 0 },
  });

  const header = ["objectID", "name", "slug", "color", "description", "image_url", "content_image_url"];

  const dataRows = tagsRes.hits.map((t) => [
    t.objectID,
    t.name ?? "",
    t.slug ?? "",
    t.color ?? "",
    t.description ?? "",
    t.image_url ?? "",
    t.content_image_url ?? "",
  ]);

  const csv = buildCsv([header, ...dataRows]);
  const filename = `kfo-tags-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
