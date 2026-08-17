import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, Form, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Banner,
  BlockStack,
  Text,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { useState } from "react";
import { algoliasearch } from "algoliasearch";
import { authenticate } from "../shopify.server";
import { readMerchantConfig, writeMerchantConfig } from "../config.server";
import { INDEXES } from "../algolia.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await readMerchantConfig(session.shop);
  return json({ config });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const appId = (formData.get("appId") as string || "").trim();
  const adminApiKey = (formData.get("adminApiKey") as string || "").trim();
  const searchOnlyApiKey = (formData.get("searchOnlyApiKey") as string || "").trim();

  if (!appId || !adminApiKey || !searchOnlyApiKey) {
    return json({ ok: false, error: "All fields are required." });
  }

  try {
    await writeMerchantConfig(session.shop, { appId, adminApiKey, searchOnlyApiKey });

    const client = algoliasearch(appId, adminApiKey);
    await client.setSettings({
      indexName: INDEXES.combinations,
      indexSettings: {
        searchableAttributes: ["name", "description"],
        attributesForFaceting: ["tags", "colors"],
        customRanking: ["asc(name)"],
      },
    });
    await client.setSettings({
      indexName: INDEXES.colors,
      indexSettings: {
        customRanking: ["asc(name)"],
      },
    });

    return json({ ok: true, error: null });
  } catch {
    return json({ ok: false, error: "Failed to save configuration." });
  }
};

export default function SettingsPage() {
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const [appId, setAppId] = useState(config.appId);
  const [adminApiKey, setAdminApiKey] = useState(config.adminApiKey);
  const [searchOnlyApiKey, setSearchOnlyApiKey] = useState(config.searchOnlyApiKey);
  const [searchParams] = useSearchParams();
  const isRequired = searchParams.get("required") === "1";

  const [showAdminKey, setShowAdminKey] = useState(false);
  const [showSearchKey, setShowSearchKey] = useState(false);

  const isConfigured = !!(config.appId && config.adminApiKey && config.searchOnlyApiKey);

  return (
    <Page fullWidth title="Settings">
      <Layout>
        <Layout.Section variant="fullWidth">
          {isRequired && !actionData?.ok && (
            <Banner
              tone="warning"
              title="Algolia configuration required"
            >
              <p>You must configure your Algolia credentials before using the app.</p>
            </Banner>
          )}
          {actionData?.ok && (
            <Banner tone="success" title="Settings saved successfully." />
          )}
          {actionData?.error && (
            <Banner tone="critical" title={actionData.error} />
          )}
        </Layout.Section>

        <Layout.Section variant="fullWidth">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Algolia Configuration
                </Text>
                {isConfigured ? (
                  <Badge tone="success">Configured</Badge>
                ) : (
                  <Badge tone="attention">Not configured</Badge>
                )}
              </InlineStack>

              <Text as="p" variant="bodyMd" tone="subdued">
                Enter your Algolia credentials. Combinations, colors, and tags
                will be synced to this Algolia instance for storefront search.
                Find these in your{" "}
                <a
                  href="https://www.algolia.com/account/api-keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  Algolia dashboard
                </a>
                .
              </Text>

              <Form method="post">
                <FormLayout>
                  <TextField
                    label="Application ID"
                    name="appId"
                    value={appId}
                    onChange={setAppId}
                    autoComplete="off"
                    helpText="Found in Algolia Dashboard → API Keys → Application ID"
                  />
                  <TextField
                    label="Admin API Key"
                    name="adminApiKey"
                    type={showAdminKey ? "text" : "password"}
                    value={adminApiKey}
                    onChange={setAdminApiKey}
                    autoComplete="off"
                    helpText="Used for write operations (index, delete). Keep this secret."
                    connectedRight={
                      <Button
                        onClick={() => setShowAdminKey((v) => !v)}
                        size="large"
                      >
                        {showAdminKey ? "Hide" : "Show"}
                      </Button>
                    }
                  />
                  <TextField
                    label="Search-Only API Key"
                    name="searchOnlyApiKey"
                    type={showSearchKey ? "text" : "password"}
                    value={searchOnlyApiKey}
                    onChange={setSearchOnlyApiKey}
                    autoComplete="off"
                    helpText="Used for storefront search widget. Safe to expose publicly."
                    connectedRight={
                      <Button
                        onClick={() => setShowSearchKey((v) => !v)}
                        size="large"
                      >
                        {showSearchKey ? "Hide" : "Show"}
                      </Button>
                    }
                  />
                  <Button submit variant="primary" loading={saving}>
                    Save settings
                  </Button>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
