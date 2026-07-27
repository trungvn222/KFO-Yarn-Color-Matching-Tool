import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError, useRouteLoaderData, isRouteErrorResponse } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { Page, Layout, Card, BlockStack, Text, Button } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  console.log("[app] login success — shop:", session.shop, "| scopes:", session.scope);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  console.log("apiKey11", apiKey);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Combinations
        </Link>
        <Link to="/app/colors">Colors</Link>
        <Link to="/app/tags">Tags</Link>
<Link to="/app/settings">Settings</Link>
<Link to="/app/guide">Guide</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
// For everything else (an unexpected exception in any /app/* loader or action —
// e.g. a deleted Algolia record, a Shopify API hiccup), show a friendly page
// instead of letting Remix's raw error screen crash the whole app.
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return boundary.error(error);
  }

  console.error("[app] unhandled route error:", error);
  // This route's own loader only authenticates and returns apiKey — if it succeeded
  // (the error came from a child route), useLoaderData is safe to call here too.
  const loaderData = useRouteLoaderData<typeof loader>("routes/app");
  const apiKey = loaderData?.apiKey || "";

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Combinations
        </Link>
        <Link to="/app/colors">Colors</Link>
        <Link to="/app/tags">Tags</Link>
        <Link to="/app/settings">Settings</Link>
        <Link to="/app/guide">Guide</Link>
      </NavMenu>
      <Page title="Something went wrong">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="p">
                  We hit an unexpected error loading this page. Nothing was lost — try again, or head back to Combinations.
                </Text>
                <Button url="/app">Back to Combinations</Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
