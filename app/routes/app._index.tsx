import { randomUUID } from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useRevalidator, useFetcher } from "@remix-run/react";
import Papa from "papaparse";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Button,
  Badge,
  Banner,
  ChoiceList,
  DataTable,
  Popover,
  Pagination,
  ProgressBar,
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
  Modal,
} from "@shopify/polaris";
import { useState, useRef, useEffect } from "react";
import { CombinationForm, type CombinationFormHandle } from "../components/CombinationForm";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import { rehostImageFromUrl } from "../shopifyFiles.server";
import type { KfoCombination, KfoColor, KfoTag } from "../types/kfo";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);

  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");

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
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const objectID = formData.get("objectID") as string;
    const client = await getMerchantAlgoliaClient(session.shop);
    await client.deleteObject({ indexName: INDEXES.combinations, objectID });
    return json({ ok: true });
  }

  if (intent === "import") {
    let rows: any[];
    try {
      rows = JSON.parse(formData.get("rows") as string);
    } catch {
      return json({ ok: false, error: "Invalid data" }, { status: 400 });
    }
    if (!rows.length) return json({ ok: true, imported: 0 });

    const client = await getMerchantAlgoliaClient(session.shop);

    // Re-host each combination thumbnail onto this store's CDN so it no longer
    // depends on the source store. Same source URL is only uploaded once.
    const imageCache = new Map<string, string>();
    const objects = [];
    for (const row of rows) {
      const image_url = row.image_url ? await rehostImageFromUrl(admin, row.image_url, imageCache) : "";
      objects.push({
        objectID: randomUUID(),
        name: row.name,
        popup_name: row.popup_name ?? "",
        description: row.description ?? "",
        position: Number(row.position) || 0,
        image_url,
        colors: row.colors,
        tags: row.tags,
        products: row.variant_ids.map((id: string, i: number) => ({
          variant_id: id,
          product_name: "",
          position: i + 1,
        })),
      });
    }

    await client.saveObjects({ indexName: INDEXES.combinations, objects });
    return json({ ok: true, imported: objects.length });
  }

  return json({ ok: false });
};

const PER_PAGE_OPTIONS = ["10", "20", "50", "100"];

// ── CSV import validation ───────────────────────────────────────────────────
interface CsvRow {
  name: string;
  popup_name?: string;
  description?: string;
  position?: string;
  image_url?: string;
  colors?: string;
  tags?: string;
  variant_ids?: string;
}

interface ImportPreviewRow {
  name: string;
  popup_name: string;
  description: string;
  position: number;
  image_url: string;
  colors: string[];
  tags: string[];
  variant_ids: string[];
  errors: string[];
}

function validateImportRow(raw: CsvRow, allColors: KfoColor[], allTags: KfoTag[]): ImportPreviewRow {
  const errors: string[] = [];

  const name = (raw.name ?? "").trim();
  if (!name) errors.push("name required");

  const colorSlugs = raw.colors ? raw.colors.split("|").map((s) => s.trim()).filter(Boolean) : [];
  const tagSlugs = raw.tags ? raw.tags.split("|").map((s) => s.trim()).filter(Boolean) : [];
  const variantIds = raw.variant_ids ? raw.variant_ids.split("|").map((s) => s.trim()).filter(Boolean) : [];

  const colorObjectIds: string[] = [];
  for (const slug of colorSlugs) {
    const found = allColors.find((c) => c.objectID === slug || c.name.toLowerCase() === slug.toLowerCase());
    if (!found) errors.push(`unknown color: ${slug}`);
    else colorObjectIds.push(found.objectID);
  }

  const tagSlugsResolved: string[] = [];
  for (const slug of tagSlugs) {
    const found = allTags.find((t) => t.slug === slug || t.name.toLowerCase() === slug.toLowerCase());
    if (!found) errors.push(`unknown tag: ${slug}`);
    else tagSlugsResolved.push(found.slug);
  }

  for (const id of variantIds) {
    if (!/^\d+$/.test(id)) errors.push(`non-numeric variant_id: ${id}`);
  }

  return {
    name,
    popup_name: (raw.popup_name ?? "").trim(),
    description: (raw.description ?? "").trim(),
    position: Number(raw.position) || 0,
    image_url: (raw.image_url ?? "").trim(),
    colors: colorObjectIds,
    tags: tagSlugsResolved,
    variant_ids: variantIds,
    errors,
  };
}

export default function CombinationsIndex() {
  const { combinations, tags, colors, selectedTagSlugs, selectedColorIds, q, page, perPage, nbPages, nbHits } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const loading = navigation.state !== "idle";

  const [activeTags, setActiveTags] = useState<string[]>(selectedTagSlugs);
  const [activeColors, setActiveColors] = useState<string[]>(selectedColorIds);
  const [queryValue, setQueryValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Import CSV
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportPreviewRow[]>([]);
  const [importParseError, setImportParseError] = useState("");
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const importing = importProgress !== null;
  const importInputRef = useRef<HTMLInputElement>(null);
  const importValidRows = importRows.filter((r) => r.errors.length === 0);
  const importInvalidRows = importRows.filter((r) => r.errors.length > 0);

  function openImport() {
    setImportRows([]);
    setImportParseError("");
    setShowImport(true);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportParseError("");
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          setImportParseError(results.errors[0].message);
          return;
        }
        setImportRows(results.data.map((row) => validateImportRow(row, colors, tags)));
      },
      error: (err: Error) => setImportParseError(err.message),
    });
    if (importInputRef.current) importInputRef.current.value = "";
  }

  function downloadImportTemplate() {
    const header = "name,description,position,image_url,colors,tags,variant_ids\n";
    const example = '"Summer Combo","Warm tones",1,"","red|navy","summer|pastel","123456|789012"\n';
    const blob = new Blob([header + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "kfo-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!importValidRows.length) return;
    const data = importValidRows.map((r) => ({
      name: r.name,
      popup_name: r.popup_name,
      description: r.description,
      position: r.position,
      image_url: r.image_url,
      colors: r.colors,
      tags: r.tags,
      variant_ids: r.variant_ids,
    }));
    const CHUNK = 3;
    setImportProgress({ done: 0, total: data.length, current: data[0]?.name ?? "" });
    let imported = 0;
    let failed = 0;
    // 3 rows per request: shows progress while thumbnails re-host, and lets rows
    // in the same batch share the image de-dup cache. App Bridge injects the token.
    for (let i = 0; i < data.length; i += CHUNK) {
      const batch = data.slice(i, i + CHUNK);
      setImportProgress({ done: imported + failed, total: data.length, current: batch[0].name });
      const fd = new FormData();
      fd.set("intent", "import");
      fd.set("rows", JSON.stringify(batch));
      try {
        // ponytail: must be /app?index — POST to /app hits the layout route
        // (app.tsx, no action). The import action lives in this index route.
        const res = await fetch("/app?index", { method: "POST", body: fd });
        if (!res.ok) throw new Error(String(res.status));
        imported += batch.length;
      } catch {
        failed += batch.length;
      }
      setImportProgress({ done: imported + failed, total: data.length, current: batch[batch.length - 1].name });
    }
    setImportProgress(null);
    setShowImport(false);
    setImportRows([]);
    revalidator.revalidate();
  }

  const [showNewModal, setShowNewModal] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const formRef = useRef<CombinationFormHandle>(null);
  const newFetcher = useFetcher<{ ok: boolean }>();
  const newSaving = newFetcher.state !== "idle";

  useEffect(() => {
    if (newFetcher.state === "idle" && newFetcher.data?.ok) {
      revalidator.revalidate();
    }
  }, [newFetcher.state, newFetcher.data]);

  function openNewModal() {
    setModalKey((k) => k + 1);
    setShowNewModal(true);
  }

  function handleModalSave() {
    const data = formRef.current?.getData();
    if (!data) return;
    setShowNewModal(false);
    newFetcher.submit(
      { data: JSON.stringify(data), _modal: "1" },
      { method: "post", action: "/app/combinations/new" },
    );
  }

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalKey, setEditModalKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editFormRef = useRef<CombinationFormHandle>(null);
  const editLoadFetcher = useFetcher<{ combination: KfoCombination }>();
  const editSaveFetcher = useFetcher<{ ok: boolean; combination: KfoCombination }>();
  const editSaving = editSaveFetcher.state !== "idle";
  const [overrides, setOverrides] = useState<Record<string, KfoCombination>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (editSaveFetcher.state === "idle" && editSaveFetcher.data?.ok) {
      const updated = editSaveFetcher.data.combination;
      if (updated) setOverrides((prev) => ({ ...prev, [updated.objectID]: updated }));
      setSavingId(null);
    }
  }, [editSaveFetcher.state, editSaveFetcher.data]);

  function openEditModal(combination: KfoCombination) {
    setEditingId(combination.objectID);
    setEditModalKey((k) => k + 1);
    setShowEditModal(true);
    editLoadFetcher.load(`/app/combinations/${combination.objectID}/edit`);
  }

  function handleEditModalSave() {
    const data = editFormRef.current?.getData();
    if (!data || !editingId) return;
    const optimistic = { objectID: editingId, ...data } as KfoCombination;
    setOverrides((prev) => ({ ...prev, [editingId]: optimistic }));
    setSavingId(editingId);
    setShowEditModal(false);
    setEditingId(null);
    editSaveFetcher.submit(
      { data: JSON.stringify(data), _modal: "1" },
      { method: "post", action: `/app/combinations/${editingId}/edit` },
    );
  }

  const displayCombinations = combinations.map((c: KfoCombination) => overrides[c.objectID] ?? c);

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

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (queryValue) params.set("q", queryValue);
      if (activeTags.length) params.set("tags", activeTags.join(","));
      if (activeColors.length) params.set("colors", activeColors.join(","));
      const res = await fetch(`/app/export?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kfo-combinations-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
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
      fullWidth
      title="Combinations"
      primaryAction={{ content: "New combination", onAction: openNewModal }}
      secondaryActions={[
        {
          content: exporting ? "Exporting..." : "Export CSV",
          onAction: handleExport,
          loading: exporting,
          disabled: exporting,
        },
        {
          content: "Import CSV",
          onAction: openImport,
        },
        {
          content: "Refresh",
          onAction: () => revalidator.revalidate(),
          loading: revalidator.state !== "idle",
        },
      ]}
    >
      <Layout>
        <Layout.Section variant="fullWidth">
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
                  onAction: openNewModal,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create your first yarn color combination.</p>
              </EmptyState>
            ) : (
              <>
                <IndexTable
                  resourceName={{ singular: "combination", plural: "combinations" }}
                  itemCount={displayCombinations.length}
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
                  {displayCombinations.map((c: KfoCombination) => (
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
                        <InlineStack gap="200" blockAlign="center">
                          {savingId === c.objectID ? (
                            <Spinner size="small" />
                          ) : (
                            <>
                              <Button variant="plain" onClick={() => openEditModal(c)}>Edit</Button>
                              <Button variant="plain" tone="critical" onClick={() => handleDelete(c)}>Delete</Button>
                            </>
                          )}
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

      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New combination"
        size="large"
        primaryAction={{ content: "Save", onAction: handleModalSave, loading: newSaving }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowNewModal(false) }]}
      >
        <Modal.Section flush>
          <CombinationForm
            key={modalKey}
            ref={formRef}
            mode="modal"
            colors={colors}
            tags={tags}
            combination={null}
            saving={newSaving}
            onCancel={() => setShowNewModal(false)}
          />
        </Modal.Section>
      </Modal>

      <Modal
        open={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingId(null); }}
        title="Edit combination"
        size="large"
        primaryAction={{ content: "Save", onAction: handleEditModalSave, loading: editSaving }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setShowEditModal(false); setEditingId(null); } }]}
      >
        <Modal.Section flush>
          {(() => {
            const loaded = editLoadFetcher.state === "idle"
              && editLoadFetcher.data?.combination?.objectID === editingId
              ? editLoadFetcher.data.combination
              : null;
            return loaded ? (
              <CombinationForm
                key={editModalKey}
                ref={editFormRef}
                mode="modal"
                colors={colors}
                tags={tags}
                combination={loaded}
                saving={editSaving}
                onCancel={() => setShowEditModal(false)}
              />
            ) : (
              <Box padding="400">
                <InlineStack align="center"><Spinner size="large" /></InlineStack>
              </Box>
            );
          })()}
        </Modal.Section>
      </Modal>

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      <Modal
        open={showImport}
        onClose={() => { if (!importing) setShowImport(false); }}
        title="Import combinations from CSV"
        size="large"
        primaryAction={
          importValidRows.length > 0
            ? {
                content: `Import ${importValidRows.length} combination${importValidRows.length !== 1 ? "s" : ""}`,
                onAction: handleImport,
                loading: importing,
              }
            : undefined
        }
        secondaryActions={[{ content: "Cancel", onAction: () => setShowImport(false), disabled: importing }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {importProgress && (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  Importing {importProgress.done} / {importProgress.total}
                  {importProgress.current ? ` — ${importProgress.current}` : ""}
                </Text>
                <ProgressBar
                  progress={importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}
                  size="small"
                  tone="highlight"
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  Re-hosting thumbnails can take a few seconds each — please keep this open.
                </Text>
              </BlockStack>
            )}

            <InlineStack gap="300" blockAlign="center">
              <Button onClick={() => importInputRef.current?.click()} disabled={importing}>Choose CSV file</Button>
              <Button variant="plain" onClick={downloadImportTemplate} disabled={importing}>Download template</Button>
            </InlineStack>

            <Text as="p" variant="bodySm" tone="subdued">
              Columns: <strong>name</strong> (required), <strong>description</strong>, <strong>position</strong>,{" "}
              <strong>image_url</strong>, <strong>colors</strong>, <strong>tags</strong>, <strong>variant_ids</strong>.
              Separate multiple values with <code>|</code>. Colors/tags must match existing ones — import Colors &amp; Tags first.
              Any image URLs are re-uploaded to this store's CDN.
            </Text>

            {importParseError && (
              <Banner tone="critical" onDismiss={() => setImportParseError("")}>{importParseError}</Banner>
            )}

            {importRows.length > 0 && (
              <BlockStack gap="200">
                <InlineStack gap="200">
                  {importValidRows.length > 0 && <Badge tone="success">{`${importValidRows.length} valid`}</Badge>}
                  {importInvalidRows.length > 0 && <Badge tone="critical">{`${importInvalidRows.length} invalid`}</Badge>}
                </InlineStack>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Name", "Variant IDs", "Tags", "Image", "Status"]}
                  rows={importRows.map((r) => [
                    r.name || "(empty)",
                    r.variant_ids.join(", ") || "—",
                    <InlineStack gap="100" wrap>
                      {r.tags.map((slug) => {
                        const t = tags.find((x: KfoTag) => x.slug === slug);
                        return <Badge key={slug}>{t?.name ?? slug}</Badge>;
                      })}
                    </InlineStack>,
                    r.image_url ? <Badge tone="info">to re-host</Badge> : <Text as="span" variant="bodySm">—</Text>,
                    r.errors.length === 0
                      ? <Badge tone="success">Valid</Badge>
                      : <BlockStack gap="100">{r.errors.map((e, ei) => <Badge key={ei} tone="critical">{e}</Badge>)}</BlockStack>,
                  ])}
                />
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
