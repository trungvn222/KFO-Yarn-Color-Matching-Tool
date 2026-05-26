import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher, useRevalidator } from "@remix-run/react";
import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Button,
  Modal,
  FormLayout,
  TextField,
  InlineStack,
  BlockStack,
  Banner,
  ProgressBar,
  Spinner,
  Text,
  Thumbnail,
  Pagination,
  Select,
  Box,
  Divider,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { RichTextEditor } from "../components/RichTextEditor";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoColor } from "../types/kfo";

const PER_PAGE_OPTIONS = ["10", "20", "50", "100"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const page = Math.max(0, Number(url.searchParams.get("page") || "1") - 1);
  const perPage = Number(url.searchParams.get("perPage") || "20");

  const client = await getMerchantAlgoliaClient(session.shop);

  const [colorsRes, allIdsRes] = await Promise.all([
    client.searchSingleIndex<KfoColor>({
      indexName: INDEXES.colors,
      searchParams: { query: q, hitsPerPage: perPage, page },
    }),
    client.searchSingleIndex<KfoColor>({
      indexName: INDEXES.colors,
      searchParams: { query: "", hitsPerPage: 1000, attributesToRetrieve: ["objectID"] },
    }),
  ]);

  return json({
    colors: colorsRes.hits,
    allIds: allIdsRes.hits.map((h) => h.objectID),
    q,
    page: page + 1,
    perPage,
    nbPages: colorsRes.nbPages ?? 1,
    nbHits: colorsRes.nbHits ?? 0,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const client = await getMerchantAlgoliaClient(session.shop);

  if (intent === "create" || intent === "edit") {
    const name = formData.get("name") as string;
    const hex = formData.get("hex") as string;
    const image_url = (formData.get("image_url") as string) || "";
    const content_image_url = (formData.get("content_image_url") as string) || "";
    const content_title = (formData.get("content_title") as string) || "";
    const description = (formData.get("description") as string) || "";
    const objectID = (formData.get("objectID") as string) || name.toLowerCase().replace(/\s+/g, "-");
    const { taskID } = await client.saveObject({
      indexName: INDEXES.colors,
      body: { objectID, name, hex, image_url, content_image_url, content_title, description },
    });
    await client.waitForTask({ indexName: INDEXES.colors, taskID });
    return json({ ok: true });
  }

  if (intent === "check-color-usage") {
    const objectID = formData.get("objectID") as string;
    const res = await client.searchSingleIndex({
      indexName: INDEXES.combinations,
      searchParams: { query: "", facetFilters: [`colors:${objectID}`], hitsPerPage: 0 },
    });
    return json({ count: res.nbHits ?? 0 });
  }

  if (intent === "import") {
    const raw = formData.get("rows") as string;
    const rows = JSON.parse(raw) as { name: string; hex: string; description: string }[];
    const objects = rows.map((row) => ({
      objectID: row.name.toLowerCase().replace(/\s+/g, "-"),
      name: row.name,
      hex: row.hex || "#cccccc",
      description: row.description || "",
      image_url: "",
    }));
    await Promise.all(
      objects.map((obj) => client.saveObject({ indexName: INDEXES.colors, body: obj }))
    );
    return json({ ok: true, imported: objects.length });
  }

  if (intent === "delete") {
    const objectID = formData.get("objectID") as string;

    const affected = await client.searchSingleIndex({
      indexName: INDEXES.combinations,
      searchParams: { query: "", facetFilters: [`colors:${objectID}`], hitsPerPage: 1000 },
    });

    await Promise.all(
      affected.hits.map((combo: any) =>
        client.saveObject({
          indexName: INDEXES.combinations,
          body: { ...combo, colors: combo.colors.filter((id: string) => id !== objectID) },
        })
      )
    );

    const { taskID } = await client.deleteObject({ indexName: INDEXES.colors, objectID });
    await client.waitForTask({ indexName: INDEXES.colors, taskID });
    return json({ ok: true, removed: affected.hits.length });
  }

  return json({ ok: false });
};

export default function ColorsPage() {
  const { colors, allIds, q, page, perPage, nbPages, nbHits } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const loading = navigation.state !== "idle";

  // Search
  const [queryValue, setQueryValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyFilters(query: string, targetPage = 1, targetPerPage = perPage) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (targetPage > 1) params.set("page", String(targetPage));
    if (targetPerPage !== 20) params.set("perPage", String(targetPerPage));
    submit(params, { method: "get" });
  }

  function handleQueryChange(value: string) {
    setQueryValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(value), 300);
  }

  function handleQueryClear() {
    setQueryValue("");
    applyFilters("");
  }

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KfoColor | null>(null);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#000000");
  const [imageUrl, setImageUrl] = useState("");
  const [contentImageUrl, setContentImageUrl] = useState("");
  const [contentTitle, setContentTitle] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [contentImageUploading, setContentImageUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [contentUploadError, setContentUploadError] = useState("");
  const [description, setDescription] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<"filter" | "content">("filter");
  const filesFetcher = useFetcher<{ files: string[] }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentFileInputRef = useRef<HTMLInputElement>(null);

  // Import CSV state
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<{ name: string; hex: string; description: string }[]>([]);
  const [importError, setImportError] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const importFetcher = useFetcher<{ ok: boolean; imported: number }>();

  // Delete flow
  const [deletingColor, setDeletingColor] = useState<KfoColor | null>(null);
  const [deletePhase, setDeletePhase] = useState<"checking" | "confirming" | "deleting" | "done">("checking");
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkFetcher = useFetcher<{ count: number }>();
  const deleteFetcher = useFetcher<{ ok: boolean; removed: number }>();

  useEffect(() => {
    if (checkFetcher.state === "idle" && checkFetcher.data != null && deletePhase === "checking") {
      setDeletePhase("confirming");
    }
  }, [checkFetcher.state, checkFetcher.data, deletePhase]);

  useEffect(() => {
    if (deletePhase === "deleting") {
      setProgress(0);
      progressRef.current = setInterval(() => {
        setProgress((p) => (p < 85 ? p + 5 : p));
      }, 200);
    }
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [deletePhase]);

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.ok && deletePhase === "deleting") {
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setTimeout(() => {
        setDeletingColor(null);
        setDeletePhase("checking");
        setProgress(0);
      }, 600);
    }
  }, [deleteFetcher.state, deleteFetcher.data, deletePhase]);

  useEffect(() => {
    if (importFetcher.state === "idle" && importFetcher.data?.ok) {
      shopify.toast.show(`Imported ${importFetcher.data.imported} color${importFetcher.data.imported !== 1 ? "s" : ""}`);
      setShowImport(false);
      setImportRows([]);
      revalidator.revalidate();
    }
  }, [importFetcher.state, importFetcher.data]);

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as any[])
          .map((row) => ({
            name: String(row.name || row.Name || "").trim(),
            hex: String(row.hex || row.Hex || row.color || row.Color || "").trim(),
            description: String(row.description || row.Description || "").trim(),
          }))
          .filter((r) => r.name);
        if (!rows.length) {
          setImportError("No valid rows found. Make sure your CSV has a 'name' column.");
          return;
        }
        setImportError("");
        setImportRows(rows);
      },
      error: (err: Error) => setImportError(err.message),
    });
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  function downloadTemplate() {
    const csv = Papa.unparse([{ name: "Example Red", hex: "#FF0000", description: "A vibrant red" }]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "colors-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    importFetcher.submit(
      { intent: "import", rows: JSON.stringify(importRows) },
      { method: "post" }
    );
  }

  function handleDeleteClick(color: KfoColor) {
    setDeletingColor(color);
    setDeletePhase("checking");
    checkFetcher.submit({ intent: "check-color-usage", objectID: color.objectID }, { method: "post" });
  }

  function confirmDelete() {
    if (!deletingColor) return;
    setDeletePhase("deleting");
    deleteFetcher.submit({ intent: "delete", objectID: deletingColor.objectID }, { method: "post" });
  }

  function cancelDelete() {
    setDeletingColor(null);
    setDeletePhase("checking");
    setProgress(0);
  }

  function openLibrary(target: "filter" | "content") {
    setLibraryTarget(target);
    setShowLibrary(true);
    if (filesFetcher.state === "idle" && !filesFetcher.data) {
      filesFetcher.load("/app/upload");
    }
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setHex("#000000");
    setImageUrl("");
    setContentImageUrl("");
    setContentTitle("");
    setDescription("");
    setModalOpen(true);
  }

  function openEdit(color: KfoColor) {
    setEditing(color);
    setName(color.name);
    setHex(color.hex);
    setImageUrl(color.image_url ?? "");
    setContentImageUrl(color.content_image_url ?? "");
    setContentTitle(color.content_title ?? "");
    setDescription(color.description ?? "");
    setModalOpen(true);
  }

  async function uploadFile(file: File): Promise<string> {
    const token = await shopify.idToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/app/upload", {
      method: "POST",
      body: fd,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`Auth error ${res.status} — try reinstalling the app`);
    }
    const data = await res.json();
    if (data.url) return data.url;
    throw new Error(data.error ?? "Upload failed");
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    setUploadError("");
    try {
      const url = await uploadFile(file);
      setImageUrl(url);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleContentImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContentImageUploading(true);
    setContentUploadError("");
    try {
      const url = await uploadFile(file);
      setContentImageUrl(url);
    } catch (err: any) {
      setContentUploadError(err.message);
    } finally {
      setContentImageUploading(false);
      if (contentFileInputRef.current) contentFileInputRef.current.value = "";
    }
  }

  const previewSlug = name.toLowerCase().replace(/\s+/g, "-");
  const isDuplicate = !editing && allIds.includes(previewSlug);

  function handleSave() {
    if (isDuplicate) return;
    submit(
      { intent: editing ? "edit" : "create", objectID: editing?.objectID ?? "", name, hex, image_url: imageUrl, content_image_url: contentImageUrl, content_title: contentTitle, description },
      { method: "post" }
    );
    setModalOpen(false);
  }

  const rows = colors.map((c: KfoColor) => [
    <InlineStack gap="200" blockAlign="center">
      {c.image_url ? (
        <Thumbnail source={c.image_url} alt={c.name} size="small" />
      ) : (
        <div style={{ backgroundColor: c.hex, width: 40, height: 40, borderRadius: 4, border: "1px solid #ccc", flexShrink: 0 }} />
      )}
      <BlockStack gap="050">
        <Text as="span" variant="bodyMd">{c.name}</Text>
        <Text as="span" variant="bodySm" tone="subdued">{c.objectID}</Text>
      </BlockStack>
    </InlineStack>,
    c.hex,
    <InlineStack gap="200">
      <Button variant="plain" onClick={() => openEdit(c)}>Edit</Button>
      <Button variant="plain" tone="critical" onClick={() => handleDeleteClick(c)}>Delete</Button>
    </InlineStack>,
  ]);

  return (
    <Page
      fullWidth
      title="Colors"
      primaryAction={{ content: "Add color", onAction: openCreate }}
      secondaryActions={[
        { content: "Import CSV", onAction: () => { setShowImport(true); setImportRows([]); setImportError(""); } },
      ]}
    >
      <Layout>
        <Layout.Section variant="fullWidth">
          <Card>
            <BlockStack gap="400">
              <TextField
                label="Search colors"
                labelHidden
                value={queryValue}
                onChange={handleQueryChange}
                clearButton
                onClearButtonClick={handleQueryClear}
                placeholder="Search colors"
                autoComplete="off"
              />
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
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Color", "Filter Color", "Actions"]}
                rows={rows}
              />
            )}

            <Box paddingBlock="400" paddingInline="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  {nbHits} color{nbHits !== 1 ? "s" : ""}
                </Text>
                <InlineStack gap="400" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodySm">Rows per page</Text>
                    <Select
                      label="Rows per page"
                      labelHidden
                      options={PER_PAGE_OPTIONS.map((v) => ({ label: v, value: v }))}
                      value={String(perPage)}
                      onChange={(v) => applyFilters(queryValue, 1, Number(v))}
                    />
                  </InlineStack>
                  <Pagination
                    hasPrevious={page > 1}
                    hasNext={page < nbPages}
                    onPrevious={() => applyFilters(queryValue, page - 1)}
                    onNext={() => applyFilters(queryValue, page + 1)}
                    label={`${page} / ${nbPages}`}
                  />
                </InlineStack>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit color" : "Add color"}
        size="large"
        primaryAction={{ content: "Save", onAction: handleSave, loading: loading, disabled: isDuplicate }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
          <input ref={contentFileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleContentImageUpload} />

          <BlockStack gap="400">
            {isDuplicate && (
              <Banner tone="warning">
                ID <strong>{previewSlug}</strong> already exists. Choose a different name.
              </Banner>
            )}

            {/* Row 1: Name */}
            <TextField
              label="Name"
              value={name}
              onChange={setName}
              autoComplete="off"
              helpText={!editing && name ? `ID: ${previewSlug}` : undefined}
            />
            {editing && (
              <TextField
                label="ID"
                value={editing.objectID}
                disabled
                autoComplete="off"
                helpText="Permanent identifier, cannot be changed after creation."
              />
            )}

            {/* Content title */}
            <TextField
              label="Content title"
              value={contentTitle}
              onChange={setContentTitle}
              autoComplete="off"
              helpText="Displayed in the section header. Leave blank to use Name."
            />

            {/* Row 2: Content image (left) + Description (right) — same height */}
            <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, width: 160 }}>
                <Text as="p" variant="bodyMd">
                  Content image{" "}
                  <Text as="span" variant="bodySm" tone="subdued">(section header)</Text>
                </Text>
                <div
                  style={{
                    flex: 1,
                    minHeight: 120,
                    borderRadius: 8,
                    border: "1px dashed #8c9196",
                    overflow: "hidden",
                    background: contentImageUrl ? "none" : "#f6f6f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {contentImageUrl ? (
                    <img src={contentImageUrl} alt="Content" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <Text as="span" variant="bodySm" tone="subdued">No image</Text>
                  )}
                </div>
                <InlineStack gap="100" wrap>
                  <Button size="slim" onClick={() => contentFileInputRef.current?.click()} loading={contentImageUploading}>Upload</Button>
                  <Button size="slim" variant="plain" onClick={() => openLibrary("content")}>Library</Button>
                  {contentImageUrl && <Button size="slim" variant="plain" tone="critical" onClick={() => setContentImageUrl("")}>Remove</Button>}
                </InlineStack>
                {contentUploadError && <Banner tone="critical" onDismiss={() => setContentUploadError("")}>{contentUploadError}</Banner>}
              </div>

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <RichTextEditor
                  label="Description"
                  value={description}
                  onChange={setDescription}
                />
              </div>
            </div>

            {/* Row 3: Hex color + Filter image — cùng nhóm */}
            <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
              <div style={{ width: 180 }}>
                <TextField
                  label="Filter Color"
                  value={hex}
                  onChange={setHex}
                  autoComplete="off"
                  type="text"
                  prefix={
                    <div style={{ backgroundColor: hex, width: 16, height: 16, borderRadius: 2, border: "1px solid #ccc" }} />
                  }
                />
              </div>
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd">
                  Filter image{" "}
                  <Text as="span" variant="bodySm" tone="subdued">(swatch in color filter)</Text>
                </Text>
                <InlineStack gap="200" blockAlign="center">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Filter" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "50%", border: "1px solid #ccc", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: hex, border: "1px solid #ccc", flexShrink: 0 }} />
                  )}
                  <Button size="slim" onClick={() => fileInputRef.current?.click()} loading={imageUploading}>Upload</Button>
                  <Button size="slim" variant="plain" onClick={() => openLibrary("filter")}>Library</Button>
                  {imageUrl && <Button size="slim" variant="plain" tone="critical" onClick={() => setImageUrl("")}>Remove</Button>}
                </InlineStack>
                {uploadError && <Banner tone="critical" onDismiss={() => setUploadError("")}>{uploadError}</Banner>}
              </BlockStack>
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={!!deletingColor}
        onClose={deletePhase === "deleting" ? () => {} : cancelDelete}
        title={`Delete "${deletingColor?.name}"`}
        primaryAction={
          deletePhase === "confirming"
            ? { content: "Delete", onAction: confirmDelete, destructive: true }
            : undefined
        }
        secondaryActions={
          deletePhase === "confirming"
            ? [{ content: "Cancel", onAction: cancelDelete }]
            : undefined
        }
      >
        <Modal.Section>
          {deletePhase === "checking" && (
            <InlineStack align="center"><Spinner size="small" /></InlineStack>
          )}
          {deletePhase === "confirming" && (
            <BlockStack gap="300">
              {(checkFetcher.data?.count ?? 0) > 0 ? (
                <Text as="p" variant="bodyMd">
                  This color is used in{" "}
                  <Text as="span" fontWeight="semibold">{checkFetcher.data!.count} combination{checkFetcher.data!.count !== 1 ? "s" : ""}</Text>.
                  It will be removed from all of them before being deleted.
                </Text>
              ) : (
                <Text as="p" variant="bodyMd">
                  This color is not used in any combination. It will be permanently deleted.
                </Text>
              )}
            </BlockStack>
          )}
          {(deletePhase === "deleting" || deletePhase === "done") && (
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                {deletePhase === "done"
                  ? `Done. Removed from ${deleteFetcher.data?.removed ?? 0} combination${(deleteFetcher.data?.removed ?? 0) !== 1 ? "s" : ""}.`
                  : `Removing from ${checkFetcher.data?.count ?? 0} combination${(checkFetcher.data?.count ?? 0) !== 1 ? "s" : ""}...`}
              </Text>
              <ProgressBar progress={progress} size="small" tone={deletePhase === "done" ? "success" : "highlight"} />
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      <Modal
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        title="Image library"
        size="large"
      >
        <Modal.Section>
          {filesFetcher.state === "loading" ? (
            <InlineStack align="center"><Spinner /></InlineStack>
          ) : filesFetcher.data?.files?.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
              {filesFetcher.data.files.map((url) => (
                <div
                  key={url}
                  onClick={() => {
                    if (libraryTarget === "content") setContentImageUrl(url);
                    else setImageUrl(url);
                    setShowLibrary(false);
                  }}
                  style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: "2px solid transparent", transition: "border 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#008060")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
                >
                  <img src={url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                </div>
              ))}
            </div>
          ) : (
            <Text as="p" tone="subdued">No images uploaded yet.</Text>
          )}
        </Modal.Section>
      </Modal>
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={handleCsvFile}
      />

      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Import colors from CSV"
        size="large"
        primaryAction={
          importRows.length > 0
            ? {
                content: `Import ${importRows.length} color${importRows.length !== 1 ? "s" : ""}`,
                onAction: handleImport,
                loading: importFetcher.state !== "idle",
              }
            : undefined
        }
        secondaryActions={[{ content: "Cancel", onAction: () => setShowImport(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <Button onClick={() => csvInputRef.current?.click()}>Choose CSV file</Button>
              <Button variant="plain" onClick={downloadTemplate}>Download template</Button>
            </InlineStack>

            <Text as="p" variant="bodySm" tone="subdued">
              CSV must have a <strong>name</strong> column. Optional: <strong>hex</strong>, <strong>description</strong>.
              Existing colors with the same ID will be overwritten.
            </Text>

            {importError && (
              <Banner tone="critical" onDismiss={() => setImportError("")}>{importError}</Banner>
            )}

            {importRows.length > 0 && (
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Name", "Hex", "Description", "Status"]}
                rows={importRows.map((r) => {
                  const id = r.name.toLowerCase().replace(/\s+/g, "-");
                  const isOverwrite = allIds.includes(id);
                  return [
                    r.name,
                    <InlineStack gap="200" blockAlign="center">
                      {r.hex && (
                        <div style={{ backgroundColor: r.hex, width: 16, height: 16, borderRadius: 2, border: "1px solid #ccc", flexShrink: 0 }} />
                      )}
                      <Text as="span" variant="bodySm">{r.hex || "—"}</Text>
                    </InlineStack>,
                    r.description || "—",
                    isOverwrite
                      ? <Badge tone="warning">Will overwrite</Badge>
                      : <Badge tone="success">New</Badge>,
                  ];
                })}
              />
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
