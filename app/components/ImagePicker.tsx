import { useState, useRef, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Button,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  TextField,
  Select,
  Modal,
  Spinner,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

type LibraryFile = { url: string; filename: string; type: string };

interface ImagePickerProps {
  /** Current image URL (controlled). */
  value: string;
  /** Called with the new URL when the user uploads, picks from library, or removes (""). */
  onChange: (url: string) => void;
  /** Max height of the preview image in px. */
  previewMaxHeight?: number;
  /** Alt text for the preview image. */
  previewAlt?: string;
}

/**
 * Reusable image field: preview + Upload / Browse library / Remove,
 * backed by Shopify Files (staged upload + paginated library with search/filter/sort).
 * Talks to the `/app/upload` route (GET = library, POST = upload).
 */
export function ImagePicker({
  value,
  onChange,
  previewMaxHeight = 200,
  previewAlt = "Image",
}: ImagePickerProps) {
  const shopify = useAppBridge();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageUploading, setImageUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySelected, setLibrarySelected] = useState("");
  const [libraryType, setLibraryType] = useState("all");
  const [librarySort, setLibrarySort] = useState("newest");
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([]);
  const [libraryCursor, setLibraryCursor] = useState<string | null>(null);
  const [libraryHasNext, setLibraryHasNext] = useState(false);
  const filesFetcher = useFetcher<{
    files: LibraryFile[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }>();

  // Accumulate paginated pages (infinite scroll) and dedupe by url
  useEffect(() => {
    const d = filesFetcher.data;
    if (!d?.files) return;
    setLibraryFiles((prev) => {
      const seen = new Set(prev.map((f) => f.url));
      const merged = [...prev];
      for (const f of d.files) if (!seen.has(f.url)) merged.push(f);
      return merged;
    });
    setLibraryCursor(d.pageInfo?.endCursor ?? null);
    setLibraryHasNext(Boolean(d.pageInfo?.hasNextPage));
  }, [filesFetcher.data]);

  function loadMoreFiles() {
    if (filesFetcher.state !== "idle" || !libraryHasNext || !libraryCursor) return;
    filesFetcher.load(`/app/upload?after=${encodeURIComponent(libraryCursor)}`);
  }

  function refreshLibrary() {
    if (filesFetcher.state !== "idle") return;
    setLibraryFiles([]);
    setLibraryCursor(null);
    setLibraryHasNext(false);
    filesFetcher.load("/app/upload");
  }

  function openLibrary() {
    setShowLibrary(true);
    setLibrarySelected(value);
    setLibrarySearch("");
    setLibraryType("all");
    setLibrarySort("newest");
    if (filesFetcher.state === "idle" && libraryFiles.length === 0) {
      filesFetcher.load("/app/upload");
    }
  }

  function closeLibrary() {
    setShowLibrary(false);
  }

  function confirmLibrary() {
    if (librarySelected) onChange(librarySelected);
    setShowLibrary(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    setUploadError("");
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
      if (data.url) {
        onChange(data.url);
        setUploadError("");
        if (showLibrary) {
          setLibrarySelected(data.url);
          const path = String(data.url).split("?")[0];
          const filename = decodeURIComponent(path.substring(path.lastIndexOf("/") + 1)) || "image";
          const ext = filename.includes(".") ? filename.split(".").pop()! : "";
          setLibraryFiles((prev) =>
            prev.some((f) => f.url === data.url)
              ? prev
              : [{ url: data.url, filename, type: ext.toUpperCase() }, ...prev]
          );
        }
      } else {
        setUploadError(data.error ?? "Upload failed");
      }
    } catch {
      setUploadError("Upload failed — check your connection and try again.");
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageUpload}
      />
      {value && (
        <img
          src={value}
          alt={previewAlt}
          style={{ width: "100%", borderRadius: 8, objectFit: "cover", maxHeight: previewMaxHeight }}
        />
      )}
      <InlineStack gap="200" wrap>
        <Button size="slim" onClick={() => fileInputRef.current?.click()} loading={imageUploading}>
          Upload
        </Button>
        <Button size="slim" variant="plain" onClick={openLibrary}>
          Browse library
        </Button>
        {value && (
          <Button size="slim" variant="plain" tone="critical" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </InlineStack>
      {uploadError && (
        <Banner tone="critical" onDismiss={() => setUploadError("")}>
          {uploadError}
        </Banner>
      )}

      <Modal
        open={showLibrary}
        onClose={closeLibrary}
        title="Select file"
        size="large"
        primaryAction={{ content: "Done", disabled: !librarySelected, onAction: confirmLibrary }}
        secondaryActions={[{ content: "Cancel", onAction: closeLibrary }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <InlineStack gap="300" align="space-between" blockAlign="center" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search files"
                  labelHidden
                  placeholder="Search files"
                  value={librarySearch}
                  onChange={setLibrarySearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setLibrarySearch("")}
                />
              </div>
              <Button
                onClick={refreshLibrary}
                loading={filesFetcher.state === "loading"}
                accessibilityLabel="Refresh media"
              >
                Refresh
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} loading={imageUploading}>
                Add media
              </Button>
            </InlineStack>

            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <Select
                label="File type"
                labelInline
                value={libraryType}
                onChange={setLibraryType}
                options={[
                  { label: "All", value: "all" },
                  ...Array.from(new Set(libraryFiles.map((f) => f.type).filter(Boolean)))
                    .sort()
                    .map((t) => ({ label: t, value: t })),
                ]}
              />
              <Select
                label="Sort"
                labelInline
                value={librarySort}
                onChange={setLibrarySort}
                options={[
                  { label: "Newest", value: "newest" },
                  { label: "Oldest", value: "oldest" },
                  { label: "Name A–Z", value: "az" },
                  { label: "Name Z–A", value: "za" },
                ]}
              />
            </InlineStack>

            <div style={{ minHeight: 440 }}>
            {filesFetcher.state === "loading" && libraryFiles.length === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 440 }}>
                <Spinner />
              </div>
            ) : (() => {
              const all = libraryFiles;
              const q = librarySearch.trim().toLowerCase();
              let files = all.filter(
                (f) =>
                  (libraryType === "all" || f.type === libraryType) &&
                  (!q || f.filename.toLowerCase().includes(q))
              );
              // `all` is already newest-first from the loader (sortKey CREATED_AT, reverse)
              if (librarySort === "oldest") files = [...files].reverse();
              else if (librarySort === "az") files = [...files].sort((a, b) => a.filename.localeCompare(b.filename));
              else if (librarySort === "za") files = [...files].sort((a, b) => b.filename.localeCompare(a.filename));
              if (!all.length) {
                return <Text as="p" tone="subdued">No images uploaded yet.</Text>;
              }
              if (!files.length) {
                return <Text as="p" tone="subdued">No files match “{librarySearch}”.</Text>;
              }
              return (
                <div
                  style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16, maxHeight: 440, overflowY: "auto" }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) loadMoreFiles();
                  }}
                >
                  {files.map((f) => {
                    const selected = librarySelected === f.url;
                    return (
                      <div key={f.url} onClick={() => setLibrarySelected(f.url)} style={{ cursor: "pointer" }}>
                        <div
                          style={{
                            position: "relative",
                            aspectRatio: "1",
                            borderRadius: 8,
                            overflow: "hidden",
                            background: "#f6f6f7",
                            border: selected ? "2px solid #303030" : "1px solid #e1e3e5",
                            boxShadow: selected ? "0 0 0 1px #303030" : "none",
                          }}
                        >
                          <img src={f.url} alt={f.filename} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          <div
                            style={{
                              position: "absolute",
                              top: 8,
                              left: 8,
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              background: selected ? "#303030" : "rgba(255,255,255,0.9)",
                              border: selected ? "none" : "1px solid #8a8a8a",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {selected && (
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M13 4.5L6.5 11L3 7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Text as="p" variant="bodySm" truncate>{f.filename}</Text>
                          {f.type && <Text as="p" variant="bodySm" tone="subdued">{f.type}</Text>}
                        </div>
                      </div>
                    );
                  })}
                  {libraryHasNext && (
                    <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", padding: "12px 0" }}>
                      {filesFetcher.state === "loading"
                        ? <Spinner size="small" />
                        : <Button variant="plain" onClick={loadMoreFiles}>Load more</Button>}
                    </div>
                  )}
                </div>
              );
            })()}
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}
