import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoCombination, KfoColor } from "../types/kfo";

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
  const tagParams = url.searchParams.get("tags") || "";
  const colorParams = url.searchParams.get("colors") || "";
  const selectedTagSlugs = tagParams ? tagParams.split(",") : [];
  const selectedColorIds = colorParams ? colorParams.split(",") : [];

  const client = await getMerchantAlgoliaClient(session.shop);

  const facetFilters: string[][] = [];
  if (selectedTagSlugs.length) facetFilters.push(selectedTagSlugs.map((s) => `tags:${s}`));
  if (selectedColorIds.length) facetFilters.push(selectedColorIds.map((id) => `colors:${id}`));

  const [combinationsRes, colorsRes] = await Promise.all([
    client.searchSingleIndex<KfoCombination>({
      indexName: INDEXES.combinations,
      searchParams: {
        query: q,
        hitsPerPage: 1000,
        page: 0,
        ...(facetFilters.length ? { facetFilters } : {}),
      },
    }),
    client.searchSingleIndex<KfoColor>({
      indexName: INDEXES.colors,
      searchParams: { query: "", hitsPerPage: 1000 },
    }),
  ]);

  const colorMap = Object.fromEntries(colorsRes.hits.map((c) => [c.objectID, c.name]));

  const header = ["name", "popup_name", "description", "position", "image_url", "colors", "tags", "variant_ids"];

  const dataRows = combinationsRes.hits.map((c) => [
    c.name,
    (c as any).popup_name ?? "",
    (c as any).description ?? "",
    String(c.position ?? 0),
    c.image_url ?? "",
    (c.colors ?? []).map((id) => colorMap[id] ?? id).join("|"),
    (c.tags ?? []).join("|"),
    (c.products ?? []).map((p) => p.variant_id).join("|"),
  ]);

  const csv = buildCsv([header, ...dataRows]);
  const filename = `kfo-combinations-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
