import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { requireMerchantConfig } from "../config.server";

const MERINO_PRODUCT_HANDLE = "merino";
const SSM_PRODUCT_HANDLE = "soft-silk-mohair";

async function fetchVariantsByHandle(admin: any, handle: string) {
  const response = await admin.graphql(`
    query getProductVariants($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        variants(first: 250) {
          nodes {
            id
            title
          }
        }
      }
    }
  `, { variables: { handle } });
  const data = await response.json();
  const product = data.data?.productByHandle;
  if (!product) return [];
  return product.variants.nodes.map((v: any) => ({
    id: v.id.replace("gid://shopify/ProductVariant/", ""),
    title: v.title,
    product_title: product.title,
    product_id: product.id.replace("gid://shopify/Product/", ""),
  }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const [merinoVariants, ssmVariants] = await Promise.all([
    fetchVariantsByHandle(admin, MERINO_PRODUCT_HANDLE),
    fetchVariantsByHandle(admin, SSM_PRODUCT_HANDLE),
  ]);

  return json({
    ok: true,
    merinoCount: merinoVariants.length,
    ssmCount: ssmVariants.length,
    merino: merinoVariants,
    ssm: ssmVariants,
  });
};

export default function SyncPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const syncing = navigation.state !== "idle";

  return (
    <Page title="Sync Products">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Pull the latest Merino and Soft Silk Mohair variants from your Shopify store.
                Run this whenever you add or update yarn color variants in your catalog.
              </Text>
              <Button
                variant="primary"
                loading={syncing}
                onClick={() => submit({}, { method: "post" })}
              >
                Sync Products
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData?.ok && (
          <Layout.Section>
            <Banner tone="success" title="Sync complete">
              <p>
                Fetched {actionData.merinoCount} Merino variants and{" "}
                {actionData.ssmCount} Soft Silk Mohair variants.
              </p>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
