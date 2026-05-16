import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoColor, KfoCombination, KfoTag } from "../types/kfo";
import { CombinationForm } from "../components/CombinationForm";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");
  const client = await getMerchantAlgoliaClient(session.shop);

  const [combination, colorsRes, tagsRes] = await Promise.all([
    client.getObject<KfoCombination>({ indexName: INDEXES.combinations, objectID: params.id! }),
    client.searchSingleIndex<KfoColor>({ indexName: INDEXES.colors, searchParams: { query: "", hitsPerPage: 1000 } }),
    client.searchSingleIndex<KfoTag>({ indexName: INDEXES.tags, searchParams: { query: "", hitsPerPage: 1000 } }),
  ]);

  const variantGids = (combination.products ?? []).map(
    (p) => `gid://shopify/ProductVariant/${p.variant_id}`
  );

  if (variantGids.length > 0) {
    const res = await admin.graphql(
      `#graphql
      query getVariantImages($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            image { url }
            product { featuredImage { url } }
          }
        }
      }`,
      { variables: { ids: variantGids } }
    );
    const gqlData = await res.json();
    const imageMap: Record<string, string> = {};
    for (const node of gqlData.data?.nodes ?? []) {
      if (!node?.id) continue;
      const variantId = node.id.replace("gid://shopify/ProductVariant/", "");
      imageMap[variantId] = node.image?.url ?? node.product?.featuredImage?.url ?? "";
    }
    combination.products = combination.products.map((p) => ({
      ...p,
      image_url: imageMap[p.variant_id] ?? p.image_url ?? "",
    }));
  }

  return json({ combination, colors: colorsRes.hits, tags: tagsRes.hits });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const raw = formData.get("data") as string;
  const data = JSON.parse(raw);
  const client = await getMerchantAlgoliaClient(session.shop);


  await client.saveObject({
    indexName: INDEXES.combinations,
    body: {
      objectID: params.id!,
      name: data.name,
      description: data.description || "",
      image_url: data.image_url || "",
      position: data.position ?? 0,
      tags: data.tags,
      colors: data.colors,
      products: data.products,
    },
  });

  return redirect("/app");
};

export default function EditCombination() {
  const { combination, colors, tags } = useLoaderData<typeof loader>();
  return <CombinationForm colors={colors} tags={tags} combination={combination as KfoCombination} />;
}
