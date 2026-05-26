import { randomUUID } from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoColor, KfoTag } from "../types/kfo";
import { CombinationForm } from "../components/CombinationForm";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");
  const client = await getMerchantAlgoliaClient(session.shop);

  const [colorsRes, tagsRes] = await Promise.all([
    client.searchSingleIndex<KfoColor>({ indexName: INDEXES.colors, searchParams: { query: "", hitsPerPage: 1000 } }),
    client.searchSingleIndex<KfoTag>({ indexName: INDEXES.tags, searchParams: { query: "", hitsPerPage: 1000 } }),
  ]);

  return json({ colors: colorsRes.hits, tags: tagsRes.hits, combination: null });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const raw = formData.get("data") as string;
  const data = JSON.parse(raw);
  const client = await getMerchantAlgoliaClient(session.shop);

  const objectID = randomUUID();

  const { taskID } = await client.saveObject({
    indexName: INDEXES.combinations,
    body: {
      objectID,
      name: data.name,
      description: data.description || "",
      image_url: data.image_url || "",
      position: data.position ?? 0,
      tags: data.tags,
      colors: data.colors,
      products: data.products,
    },
  });

  await client.waitForTask({ indexName: INDEXES.combinations, taskID });

  if (formData.get("_modal") === "1") return json({ ok: true });
  return redirect("/app");
};

export default function NewCombination() {
  const { colors, tags } = useLoaderData<typeof loader>();
  return <CombinationForm colors={colors} tags={tags} combination={null} />;
}
