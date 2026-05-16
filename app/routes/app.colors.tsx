import { randomUUID } from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher } from "@remix-run/react";
import { useState, useRef, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  DataTable,
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
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { INDEXES } from "../algolia.server";
import { getMerchantAlgoliaClient } from "../merchantAlgolia.server";
import { requireMerchantConfig } from "../config.server";
import type { KfoColor } from "../types/kfo";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const config = await requireMerchantConfig(session.shop);
  if (!config) throw redirect("/app/settings?required=1");
  const client = await getMerchantAlgoliaClient(session.shop);
  const { hits } = await client.searchSingleIndex<KfoColor>({
    indexName: INDEXES.colors,
    searchParams: { query: "", hitsPerPage: 1000 },
  });
  return json({ colors: hits });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const client = await getMerchantAlgoliaClient(session.shop);

  if (intent === "create" || intent === "edit") {
    const objectID = (formData.get("objectID") as string) || randomUUID();
    const name = formData.get("name") as string;
    const hex = formData.get("hex") as string;
    const image_url = (formData.get("image_url") as string) || "";
    const description = (formData.get("description") as string) || "";
    const resolvedObjectID = objectID || name.toLowerCase().replace(/\s+/g, "-");
    const { taskID } = await client.saveObject({
      indexName: INDEXES.colors,
      body: { objectID: resolvedObjectID, name, hex, image_url, description },
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
  const { colors } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const saving = navigation.state !== "idle";

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KfoColor | null>(null);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#000000");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [description, setDescription] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const filesFetcher = useFetcher<{ files: string[] }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function openLibrary() {
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
    setDescription("");
    setModalOpen(true);
  }

  function openEdit(color: KfoColor) {
    setEditing(color);
    setName(color.name);
    setHex(color.hex);
    setImageUrl(color.image_url ?? "");
    setDescription(color.description ?? "");
    setModalOpen(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const token = await shopify.idToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/app/upload", {
        method: "POST",
        body: fd,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.headers.get("content-type")?.includes("text/html")) {
        setUploadError(`Auth error ${res.status} — try reinstalling the app`);
        return;
      }
      const data = await res.json();
      if (data.url) { setImageUrl(data.url); setUploadError(""); }
      else setUploadError(data.error ?? "Upload failed");
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSave() {
    submit(
      { intent: editing ? "edit" : "create", objectID: editing?.objectID ?? "", name, hex, image_url: imageUrl, description },
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
      title="Colors"
      primaryAction={{ content: "Add color", onAction: openCreate }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            {saving ? (
              <InlineStack align="center">
                <div style={{ padding: "40px 0" }}>
                  <Spinner size="large" />
                </div>
              </InlineStack>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Color", "Hex", "Actions"]}
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit color" : "Add color"}
        primaryAction={{ content: "Save", onAction: handleSave, loading: saving }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Name"
              value={name}
              onChange={setName}
              autoComplete="off"
            />
            {editing && (
              <TextField
                label="ID"
                value={editing.objectID}
                disabled
                autoComplete="off"
                helpText="Permanent identifier used to link this color to combinations. Cannot be changed after creation."
              />
            )}
            <TextField
              label="Hex color"
              value={hex}
              onChange={setHex}
              autoComplete="off"
              type="text"
              prefix={
                <div style={{ backgroundColor: hex, width: 16, height: 16, borderRadius: 2, border: "1px solid #ccc" }} />
              }
            />
            <TextField
              label="Description"
              value={description}
              onChange={setDescription}
              autoComplete="off"
              multiline={3}
            />
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">Image (optional — for colors that can't be shown as hex)</Text>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Color preview"
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #ccc" }}
                />
              )}
              <InlineStack gap="200">
                <Button size="slim" onClick={() => fileInputRef.current?.click()} loading={imageUploading}>
                  Upload
                </Button>
                <Button size="slim" variant="plain" onClick={openLibrary}>
                  Browse library
                </Button>
                {imageUrl && (
                  <Button size="slim" variant="plain" tone="critical" onClick={() => setImageUrl("")}>
                    Remove
                  </Button>
                )}
              </InlineStack>
              {uploadError && (
                <Banner tone="critical" onDismiss={() => setUploadError("")}>{uploadError}</Banner>
              )}
            </BlockStack>
          </FormLayout>
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
                  onClick={() => { setImageUrl(url); setShowLibrary(false); }}
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
    </Page>
  );
}
