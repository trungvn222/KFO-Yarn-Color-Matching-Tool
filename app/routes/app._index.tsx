import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Button,
  Badge,
  ChoiceList,
  Popover,
  Pagination,
  Select,
  Thumbnail,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Text,
  TextField,
  EmptyState,
  Spinner,
} from "@shopify/polaris";
import { useState, useRef } from "react";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoCombination, KfoColor, KfoTag } from "../types/kfo";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);

  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");

  console.log("session", session);

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const tagParams = url.searchParams.get("tags") || "";
  const colorParams = url.searchParams.get("colors") || "";
  const selectedTagSlugs = tagParams ? tagParams.split(",") : [];
  const selectedColorIds = colorParams ? colorParams.split(",") : [];
  const page = Math.max(0, Number(url.searchParams.get("page") || "1") - 1);
  const perPage = Number(url.searchParams.get("perPage") || "20");

  const client = await getMerchantAlgoliaClient(session.shop);

  const facetFilters: string[][] = [];
  if (selectedTagSlugs.length) facetFilters.push(selectedTagSlugs.map((s) => `tags:${s}`));
  if (selectedColorIds.length) facetFilters.push(selectedColorIds.map((id) => `colors:${id}`));

  const [combinationsRes, tagsRes, colorsRes] = await Promise.all([
    client.searchSingleIndex<KfoCombination>({
      indexName: INDEXES.combinations,
      searchParams: {
        query: q,
        hitsPerPage: perPage,
        page,
        facets: ["tags", "colors"],
        ...(facetFilters.length ? { facetFilters } : {}),
      },
    }),
    client.searchSingleIndex<KfoTag>({
      indexName: INDEXES.tags,
      searchParams: { query: "", hitsPerPage: 1000 },
    }),
    client.searchSingleIndex<KfoColor>({
      indexName: INDEXES.colors,
      searchParams: { query: "", hitsPerPage: 1000 },
    }),
  ]);

  return json({
    combinations: combinationsRes.hits,
    tags: tagsRes.hits,
    colors: colorsRes.hits,
    selectedTagSlugs,
    selectedColorIds,
    q,
    page: page + 1,
    perPage,
    nbPages: combinationsRes.nbPages ?? 1,
    nbHits: combinationsRes.nbHits ?? 0,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const objectID = formData.get("objectID") as string;
    const client = await getMerchantAlgoliaClient(session.shop);
    await client.deleteObject({ indexName: INDEXES.combinations, objectID });
    return json({ ok: true });
  }

  return json({ ok: false });
};

const PER_PAGE_OPTIONS = ["10", "20", "50", "100"];

export default function CombinationsIndex() {
  const { combinations, tags, colors, selectedTagSlugs, selectedColorIds, q, page, perPage, nbPages, nbHits } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";

  const [activeTags, setActiveTags] = useState<string[]>(selectedTagSlugs);
  const [activeColors, setActiveColors] = useState<string[]>(selectedColorIds);
  const [queryValue, setQueryValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  function applyFilters(q: string, tags: string[], colors: string[], targetPage = 1, targetPerPage = perPage) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tags.length) params.set("tags", tags.join(","));
    if (colors.length) params.set("colors", colors.join(","));
    if (targetPage > 1) params.set("page", String(targetPage));
    if (targetPerPage !== 20) params.set("perPage", String(targetPerPage));
    submit(params, { method: "get" });
  }

  function handleQueryChange(value: string) {
    setQueryValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(value, activeTags, activeColors), 300);
  }

  function handleQueryClear() {
    setQueryValue("");
    applyFilters("", activeTags, activeColors);
  }

  function handleTagFilter(selected: string[]) {
    setActiveTags(selected);
    applyFilters(queryValue, selected, activeColors);
  }

  function handleColorFilter(selected: string[]) {
    setActiveColors(selected);
    applyFilters(queryValue, activeTags, selected);
  }

  function handleClearAll() {
    setQueryValue("");
    setActiveTags([]);
    setActiveColors([]);
    submit(new URLSearchParams(), { method: "get" });
  }

  function handlePerPageChange(value: string) {
    applyFilters(queryValue, activeTags, activeColors, 1, Number(value));
  }

  function handleDelete(combination: KfoCombination) {
    if (confirm(`Delete combination "${combination.name}"?`)) {
      submit(
        { intent: "delete", objectID: combination.objectID },
        { method: "post" },
      );
    }
  }

  const colorMap = Object.fromEntries(colors.map((c: KfoColor) => [c.objectID, c]));

  return (
    <Page
      title="Combinations"
      primaryAction={{
        content: "New combination",
        url: "/app/combinations/new",
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <TextField
                label="Search combinations"
                labelHidden
                value={queryValue}
                onChange={handleQueryChange}
                clearButton
                onClearButtonClick={handleQueryClear}
                placeholder="Search combinations"
                autoComplete="off"
              />
              <InlineStack gap="200" wrap>
                <Popover
                  active={colorPopoverOpen}
                  activator={
                    <Button onClick={() => setColorPopoverOpen((v) => !v)} disclosure>
                      {activeColors.length > 0 ? `Color (${activeColors.length})` : "Color"}
                    </Button>
                  }
                  onClose={() => setColorPopoverOpen(false)}
                >
                  <Popover.Section>
                    <ChoiceList
                      title="Color"
                      titleHidden
                      allowMultiple
                      choices={colors.map((c: KfoColor) => ({
                        label: (
                          <InlineStack gap="150" blockAlign="center">
                            <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.hex, border: "1px solid #ccc", flexShrink: 0 }} />
                            {c.name}
                          </InlineStack>
                        ),
                        value: c.objectID,
                      }))}
                      selected={activeColors}
                      onChange={handleColorFilter}
                    />
                  </Popover.Section>
                </Popover>

                <Popover
                  active={tagPopoverOpen}
                  activator={
                    <Button onClick={() => setTagPopoverOpen((v) => !v)} disclosure>
                      {activeTags.length > 0 ? `Tag (${activeTags.length})` : "Tag"}
                    </Button>
                  }
                  onClose={() => setTagPopoverOpen(false)}
                >
                  <Popover.Section>
                    <ChoiceList
                      title="Tag"
                      titleHidden
                      allowMultiple
                      choices={tags.map((t: KfoTag) => ({
                        label: t.name,
                        value: t.slug,
                      }))}
                      selected={activeTags}
                      onChange={handleTagFilter}
                    />
                  </Popover.Section>
                </Popover>

                {(activeColors.length > 0 || activeTags.length > 0 || queryValue) && (
                  <Button variant="plain" onClick={handleClearAll}>Clear all</Button>
                )}
              </InlineStack>
            </BlockStack>

            <Box paddingBlockStart="400">
              <Divider />
            </Box>

            {loading ? (
              <InlineStack align="center" blockAlign="center">
                <div style={{ padding: "40px 0" }}>
                  <Spinner size="large" />
                </div>
              </InlineStack>
            ) : combinations.length === 0 ? (
              <EmptyState
                heading="No combinations yet"
                action={{
                  content: "Create combination",
                  url: "/app/combinations/new",
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create your first yarn color combination.</p>
              </EmptyState>
            ) : (
              <>
                <IndexTable
                  resourceName={{ singular: "combination", plural: "combinations" }}
                  itemCount={combinations.length}
                  headings={[
                    { title: "Image" },
                    { title: "Name" },
                    { title: "Products" },
                    { title: "Colors" },
                    { title: "Tags" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {combinations.map((c: KfoCombination) => (
                    <IndexTable.Row id={c.objectID} key={c.objectID} position={0}>
                      <IndexTable.Cell>
                        <Thumbnail source={c.image_url || ""} alt={c.name} size="small" />
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{c.name}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">{String(c.products.length)}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="100" blockAlign="center">
                          {(c.colors ?? []).slice(0, 5).map((id: string) => {
                            const col = colorMap[id];
                            return col ? (
                              <div key={id} title={col.name} style={{ width: 16, height: 16, borderRadius: "50%", background: col.hex, border: "1px solid #ccc", flexShrink: 0 }} />
                            ) : null;
                          })}
                          {(c.colors ?? []).length > 5 && (
                            <Text as="span" variant="bodySm" tone="subdued">+{(c.colors ?? []).length - 5}</Text>
                          )}
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="100" wrap>
                          {c.tags.map((t: string) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Link to={`/app/combinations/${c.objectID}/edit`}>
                            <Button variant="plain">Edit</Button>
                          </Link>
                          <Button variant="plain" tone="critical" onClick={() => handleDelete(c)}>
                            Delete
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>

                <Box paddingBlock="400" paddingInline="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {nbHits} combinations
                    </Text>
                    <InlineStack gap="400" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodySm">Rows per page</Text>
                        <Select
                          label="Rows per page"
                          labelHidden
                          options={PER_PAGE_OPTIONS.map((v) => ({ label: v, value: v }))}
                          value={String(perPage)}
                          onChange={handlePerPageChange}
                        />
                      </InlineStack>
                      <Pagination
                        hasPrevious={page > 1}
                        hasNext={page < nbPages}
                        onPrevious={() => applyFilters(queryValue, activeTags, activeColors, page - 1)}
                        onNext={() => applyFilters(queryValue, activeTags, activeColors, page + 1)}
                        label={`${page} / ${nbPages}`}
                      />
                    </InlineStack>
                  </InlineStack>
                </Box>
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
