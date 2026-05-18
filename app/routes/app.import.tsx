import { randomUUID } from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Text,
  Box,
  DataTable,
  Badge,
  Divider,
  DropZone,
  Thumbnail,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoColor, KfoTag } from "../types/kfo";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);

  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");

  const client = await getMerchantAlgoliaClient(session.shop);

  const [tagsRes, colorsRes] = await Promise.all([
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
    colors: colorsRes.hits,
    tags: tagsRes.hits,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const config = await requireMerchantConfig(session.shop);
  if (!config) return json({ error: "Algolia not configured" }, { status: 400 });

  const formData = await request.formData();
  const rowsJson = formData.get("rows") as string;

  let rows: any[];
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return json({ error: "Invalid data" }, { status: 400 });
  }

  if (!rows.length) return json({ imported: 0, skipped: 0 });

  const client = await getMerchantAlgoliaClient(session.shop);

  const objects = rows.map((row: any) => ({
    objectID: randomUUID(),
    name: row.name,
    description: row.description ?? "",
    position: Number(row.position) || 0,
    image_url: row.image_url ?? "",
    colors: row.colors,
    tags: row.tags,
    products: row.variant_ids.map((id: string, i: number) => ({
      variant_id: id,
      product_name: "",
      position: i + 1,
    })),
  }));

  await client.saveObjects({ indexName: INDEXES.combinations, objects });

  return json({ imported: objects.length, skipped: 0 });
};

// ── CSV row after parsing ──────────────────────────────────────────────────
interface CsvRow {
  name: string;
  description?: string;
  position?: string;
  image_url?: string;
  colors?: string;
  tags?: string;
  variant_ids?: string;
}

interface PreviewRow {
  raw: CsvRow;
  name: string;
  description: string;
  position: number;
  image_url: string;
  colors: string[];
  tags: string[];
  variant_ids: string[];
  errors: string[];
}

function validateRow(raw: CsvRow, allColors: KfoColor[], allTags: KfoTag[]): PreviewRow {
  const errors: string[] = [];

  const name = (raw.name ?? "").trim();
  if (!name) errors.push("name required");

  const colorSlugs = raw.colors ? raw.colors.split("|").map((s) => s.trim()).filter(Boolean) : [];
  const tagSlugs = raw.tags ? raw.tags.split("|").map((s) => s.trim()).filter(Boolean) : [];
  const variantIds = raw.variant_ids ? raw.variant_ids.split("|").map((s) => s.trim()).filter(Boolean) : [];

  const colorObjectIds: string[] = [];
  for (const slug of colorSlugs) {
    const found = allColors.find(
      (c) => c.objectID === slug || c.name.toLowerCase() === slug.toLowerCase()
    );
    if (!found) errors.push(`unknown color: ${slug}`);
    else colorObjectIds.push(found.objectID);
  }

  const tagSlugsResolved: string[] = [];
  for (const slug of tagSlugs) {
    const found = allTags.find(
      (t) => t.slug === slug || t.name.toLowerCase() === slug.toLowerCase()
    );
    if (!found) errors.push(`unknown tag: ${slug}`);
    else tagSlugsResolved.push(found.slug);
  }

  for (const id of variantIds) {
    if (!/^\d+$/.test(id)) errors.push(`non-numeric variant_id: ${id}`);
  }

  return {
    raw,
    name,
    description: (raw.description ?? "").trim(),
    position: Number(raw.position) || 0,
    image_url: (raw.image_url ?? "").trim(),
    colors: colorObjectIds,
    tags: tagSlugsResolved,
    variant_ids: variantIds,
    errors,
  };
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function ImportPage() {
  const { colors, tags } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const importing = navigation.state !== "idle";

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseFile(file: File) {
    setParseError("");
    setResult(null);
    setFileName(file.name);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          setParseError(results.errors[0].message);
          return;
        }
        const validated = results.data.map((row) => validateRow(row, colors, tags));
        setRows(validated);
      },
      error: (err: Error) => setParseError(err.message),
    });
  }

  const handleDrop = useCallback(
    (_: File[], accepted: File[]) => {
      if (accepted[0]) parseFile(accepted[0]);
    },
    [colors, tags]
  );

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  function handleImport() {
    if (!validRows.length) return;
    const data = validRows.map((r) => ({
      name: r.name,
      description: r.description,
      position: r.position,
      image_url: r.image_url,
      colors: r.colors,
      tags: r.tags,
      variant_ids: r.variant_ids,
    }));
    submit({ rows: JSON.stringify(data) }, { method: "post" });
    setResult({ imported: validRows.length, skipped: invalidRows.length });
    setRows([]);
    setFileName("");
  }

  const tableRows = rows.map((r, i) => [
    <Text as="span" variant="bodySm">{String(i + 1)}</Text>,
    <Text as="span" variant="bodySm" fontWeight={r.errors.length ? "regular" : "semibold"}>
      {r.name || <span style={{ color: "#8c9196" }}>(empty)</span>}
    </Text>,
    <Text as="span" variant="bodySm">{r.variant_ids.join(", ") || "—"}</Text>,
    <InlineStack gap="100" wrap>
      {r.colors.map((id) => {
        const c = colors.find((x) => x.objectID === id);
        return c ? (
          <div key={id} title={c.name} style={{ width: 14, height: 14, borderRadius: "50%", background: c.hex, border: "1px solid #ccc", flexShrink: 0 }} />
        ) : null;
      })}
    </InlineStack>,
    <InlineStack gap="100" wrap>
      {r.tags.map((slug) => {
        const t = tags.find((x) => x.slug === slug);
        return <Badge key={slug}>{t?.name ?? slug}</Badge>;
      })}
    </InlineStack>,
    r.errors.length === 0 ? (
      <Badge tone="success">Valid</Badge>
    ) : (
      <BlockStack gap="100">
        {r.errors.map((e, ei) => <Badge key={ei} tone="critical">{e}</Badge>)}
      </BlockStack>
    ),
  ]);

  return (
    <Page
      fullWidth
      title="Import Combinations"
      backAction={{ content: "Combinations", url: "/app" }}
      primaryAction={
        validRows.length > 0
          ? {
              content: `Import ${validRows.length} combination${validRows.length !== 1 ? "s" : ""}`,
              onAction: handleImport,
              loading: importing,
            }
          : undefined
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {result && (
              <Banner
                tone="success"
                title={`Imported ${result.imported} combination${result.imported !== 1 ? "s" : ""}`}
                onDismiss={() => setResult(null)}
              >
                {result.skipped > 0 && <p>{result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped (invalid).</p>}
              </Banner>
            )}

            {parseError && (
              <Banner tone="critical" title="CSV parse error" onDismiss={() => setParseError("")}>
                <p>{parseError}</p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Upload CSV</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Expected columns: <code>name</code>, <code>description</code>, <code>position</code>, <code>image_url</code>, <code>colors</code>, <code>tags</code>, <code>variant_ids</code>
                  <br />
                  Separate multiple values with <code>|</code> (e.g. <code>red|navy</code>). Colors and tags must match existing names or IDs.
                </Text>
                <DropZone
                  accept=".csv,text/csv"
                  type="file"
                  onDrop={handleDrop}
                  label="Drop CSV here or click to browse"
                >
                  <DropZone.FileUpload
                    actionTitle="Choose CSV file"
                    actionHint="or drag and drop"
                  />
                </DropZone>
                {fileName && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Loaded: <strong>{fileName}</strong> — {rows.length} row{rows.length !== 1 ? "s" : ""} ({validRows.length} valid, {invalidRows.length} invalid)
                  </Text>
                )}
              </BlockStack>
            </Card>

            {rows.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Preview</Text>
                    <InlineStack gap="200">
                      {validRows.length > 0 && <Badge tone="success">{`${validRows.length} valid`}</Badge>}
                      {invalidRows.length > 0 && <Badge tone="critical">{`${invalidRows.length} invalid`}</Badge>}
                    </InlineStack>
                  </InlineStack>
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={["#", "Name", "Variant IDs", "Colors", "Tags", "Status"]}
                    rows={tableRows}
                    truncate
                  />
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">CSV Format</Text>
                <Text as="p" variant="bodySm" tone="subdued">Download and fill in the template:</Text>
                <Button
                  size="slim"
                  onClick={() => {
                    const header = "name,description,position,image_url,colors,tags,variant_ids\n";
                    const example = '"Summer Combo","Warm tones",1,"","red|navy","summer|pastel","123456|789012"\n';
                    const blob = new Blob([header + example], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "kfo-import-template.csv"; a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download template
                </Button>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Column reference</Text>
                  {[
                    ["name", "Required. Combination display name."],
                    ["description", "Optional. Short description."],
                    ["position", "Optional. Sort order (number)."],
                    ["image_url", "Optional. Full URL of thumbnail image."],
                    ["colors", "Pipe-separated color names or IDs."],
                    ["tags", "Pipe-separated tag names or slugs."],
                    ["variant_ids", "Pipe-separated numeric Shopify variant IDs."],
                  ].map(([col, desc]) => (
                    <BlockStack key={col} gap="050">
                      <Text as="span" variant="bodySm" fontWeight="semibold"><code>{col}</code></Text>
                      <Text as="span" variant="bodySm" tone="subdued">{desc}</Text>
                    </BlockStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>

            {colors.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Available Colors</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Click to copy name for CSV.</Text>
                  <BlockStack gap="100">
                    {colors.map((c) => (
                      <button
                        key={c.objectID}
                        onClick={() => copyText(c.name)}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 0",
                          borderRadius: 4,
                        }}
                        title={`Click to copy: ${c.name}`}
                      >
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: c.hex, border: "1px solid #ccc", flexShrink: 0 }} />
                        <Text as="span" variant="bodySm">{c.name}</Text>
                      </button>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}

            {tags.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Available Tags</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Click to copy slug for CSV.</Text>
                  <BlockStack gap="100">
                    {tags.map((t) => (
                      <button
                        key={t.objectID}
                        onClick={() => copyText(t.slug)}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 0",
                          borderRadius: 4,
                        }}
                        title={`Click to copy: ${t.slug}`}
                      >
                        <Badge>{t.name}</Badge>
                        <Text as="span" variant="bodySm" tone="subdued">({t.slug})</Text>
                      </button>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
