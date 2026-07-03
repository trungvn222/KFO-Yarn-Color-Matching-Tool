import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoColor } from "../types/kfo";

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

  const colorsRes = await client.searchSingleIndex<KfoColor>({
    indexName: INDEXES.colors,
    searchParams: { query: q, hitsPerPage: 1000, page: 0 },
  });

  const header = ["objectID", "name", "hex", "content_title", "description", "image_url", "content_image_url"];

  const dataRows = colorsRes.hits.map((c) => [
    c.objectID,
    c.name ?? "",
    c.hex ?? "",
    c.content_title ?? "",
    c.description ?? "",
    c.image_url ?? "",
    c.content_image_url ?? "",
  ]);

  const csv = buildCsv([header, ...dataRows]);
  const filename = `kfo-colors-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
