import { Page, Layout, Card, BlockStack, Text, List, Divider, Badge, InlineStack, Box } from "@shopify/polaris";

export default function GuidePage() {
  return (
    <Page
      title="User Guide"
      subtitle="How to use the KFO Yarn Tool"
    >
      <Layout>
        {/* Combinations */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" align="start">
                <Text as="h2" variant="headingMd">Combinations</Text>
                <Badge tone="info">Main feature</Badge>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                A combination groups yarn products with colors and tags for display in your storefront widget.
              </Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Creating a combination</Text>
                <List type="number">
                  <List.Item>Go to <strong>Combinations</strong> from the navigation menu.</List.Item>
                  <List.Item>Click <strong>Add combination</strong>.</List.Item>
                  <List.Item>Enter a <strong>Name</strong> and optional description.</List.Item>
                  <List.Item>Click <strong>Add products</strong> to open the Shopify resource picker and select yarn variants.</List.Item>
                  <List.Item>Drag products to reorder them as needed.</List.Item>
                  <List.Item>Select one or more <strong>Colors</strong> and <strong>Tags</strong> from the dropdowns.</List.Item>
                  <List.Item>Optionally upload or pick a <strong>cover image</strong>.</List.Item>
                  <List.Item>Click <strong>Save</strong>.</List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Editing a combination</Text>
                <List type="number">
                  <List.Item>Find the combination in the list (use search or filters).</List.Item>
                  <List.Item>Click its name or the <strong>Edit</strong> action.</List.Item>
                  <List.Item>Make changes and click <strong>Save</strong>.</List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Deleting a combination</Text>
                <List type="number">
                  <List.Item>Open the combination for editing.</List.Item>
                  <List.Item>Click <strong>Delete</strong> and confirm the prompt.</List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Filtering &amp; searching</Text>
                <List>
                  <List.Item>Use the search bar to find combinations by name or description.</List.Item>
                  <List.Item>Use the <strong>Colors</strong> and <strong>Tags</strong> filter chips to narrow results.</List.Item>
                  <List.Item>Results are paginated — use the arrows to move between pages.</List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Colors */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Colors</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Colors are shared labels that can be attached to combinations and displayed in the storefront filter.
              </Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Adding a color</Text>
                <List type="number">
                  <List.Item>Go to <strong>Colors</strong> from the navigation menu.</List.Item>
                  <List.Item>Click <strong>Add color</strong>.</List.Item>
                  <List.Item>Enter the color <strong>Name</strong> and pick a <strong>Hex value</strong>.</List.Item>
                  <List.Item>Optionally add an image, content image, title, and description for the storefront color page.</List.Item>
                  <List.Item>Click <strong>Save</strong>.</List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Editing &amp; deleting</Text>
                <List>
                  <List.Item>Click a color row to edit it.</List.Item>
                  <List.Item>
                    Before a color can be deleted, the app checks how many combinations reference it.
                    A confirmation dialog shows the count — confirming will remove the color from all affected combinations automatically.
                  </List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Bulk import via CSV</Text>
                <List>
                  <List.Item>Prepare a CSV with columns: <code>name</code>, <code>hex</code>.</List.Item>
                  <List.Item>Click <strong>Import CSV</strong> on the Colors page and upload the file.</List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Tags */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" align="start">
                <Text as="h2" variant="headingMd">Tags</Text>
                <Badge tone="success">Storefront filters</Badge>
              </InlineStack>

              <Text as="p" variant="bodyMd">
                Tags are <strong>filter buttons shown on your storefront</strong>. When a visitor clicks a tag
                (e.g. <em>"Fine"</em>, <em>"Chunky"</em>, <em>"Wool"</em>), the widget instantly shows only
                the combinations that have that tag assigned.
              </Text>

              <Text as="p" variant="bodyMd" tone="subdued">
                Think of tags as categories for your yarn combinations — you create them here in the admin,
                attach them to combinations, and customers use them to browse your range.
              </Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">How it works end-to-end</Text>
                <List type="number">
                  <List.Item>Create a tag here (e.g. <strong>Fine</strong> with slug <code>fine</code>).</List.Item>
                  <List.Item>Assign it to one or more combinations when editing them.</List.Item>
                  <List.Item>On the storefront, the widget shows a <strong>Filter by tag</strong> bar. Customers click <em>Fine</em> and only fine-weight combinations appear.</List.Item>
                  <List.Item>You can also set a <strong>default tag</strong> in Theme Editor so the widget opens pre-filtered.</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Adding a tag</Text>
                <List type="number">
                  <List.Item>Go to <strong>Tags</strong> from the navigation menu.</List.Item>
                  <List.Item>Click <strong>Add tag</strong>.</List.Item>
                  <List.Item>Enter a <strong>Name</strong>. A URL-safe <strong>slug</strong> is generated automatically — this is the value used in filters.</List.Item>
                  <List.Item>Pick a <strong>badge color</strong> for how it appears in the admin list.</List.Item>
                  <List.Item>Optionally add an image, content image, and description (used if the tag has its own content page on the storefront).</List.Item>
                  <List.Item>Click <strong>Save</strong>.</List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Deleting a tag</Text>
                <List>
                  <List.Item>Before deleting, the app checks how many combinations use this tag and shows a confirmation. Confirming automatically removes the tag from all affected combinations.</List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Import / Export CSV */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Import &amp; Export CSV</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Move combination data in bulk using CSV files.
              </Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Exporting combinations</Text>
                <List type="number">
                  <List.Item>Go to <strong>Combinations</strong>.</List.Item>
                  <List.Item>Apply any search or filters you want.</List.Item>
                  <List.Item>Click <strong>Export CSV</strong>. The file reflects the active filters.</List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Importing combinations</Text>
                <List type="number">
                  <List.Item>Go to <strong>Import</strong> from the navigation menu.</List.Item>
                  <List.Item>Upload a CSV file. The app will show a validation preview before importing.</List.Item>
                  <List.Item>Review any warnings or errors in the preview table.</List.Item>
                  <List.Item>Click <strong>Confirm import</strong> to save valid rows.</List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">CSV format for combinations</Text>
                <List>
                  <List.Item><code>name</code> — combination name (required)</List.Item>
                  <List.Item><code>description</code> — HTML description (optional)</List.Item>
                  <List.Item><code>image_url</code> — cover image URL (optional)</List.Item>
                  <List.Item><code>position</code> — sort order (optional, integer)</List.Item>
                  <List.Item><code>tags</code> — comma-separated tag slugs (optional)</List.Item>
                  <List.Item><code>colors</code> — comma-separated color objectIDs (optional)</List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Box paddingBlockEnd="400" />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
