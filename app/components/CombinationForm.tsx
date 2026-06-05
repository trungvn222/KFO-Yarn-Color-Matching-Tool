import { forwardRef, useImperativeHandle, useState } from "react";
import { useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Tag,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Thumbnail,
  TextField,
  Combobox,
  Listbox,
  AutoSelection,
} from "@shopify/polaris";
import { RichTextEditor } from "./RichTextEditor";
import { ImagePicker } from "./ImagePicker";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KfoColor, KfoCombination, KfoTag } from "../types/kfo";

interface ProductRow {
  variant_id: string;
  product_name: string;
  handle: string;
  position: number;
  image_url?: string;
  deleted?: boolean;
}

function SortableProductRow({
  product,
  idx,
  onRemove,
}: {
  product: ProductRow;
  idx: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.variant_id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderRadius: 8,
        border: "1px solid #e1e3e5",
        padding: "16px",
        background: isDragging ? "#f6f6f7" : "#fff",
      }}
    >
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="300" blockAlign="center">
          <div
            {...attributes}
            {...listeners}
            style={{ cursor: "grab", color: "#8c9196", padding: "4px", touchAction: "none", flexShrink: 0 }}
            title="Drag to reorder"
          >
            ⠿
          </div>
          <Thumbnail source={product.image_url || ""} alt={product.product_name} size="small" />
          <BlockStack gap="050">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodyMd" fontWeight="semibold">
                {product.product_name || `Product ${idx + 1}`}
              </Text>
              {product.deleted && (
                <Badge tone="critical">Product deleted</Badge>
              )}
            </InlineStack>
            <Text as="span" variant="bodySm" tone="subdued">
              Variant ID: {product.variant_id}
            </Text>
          </BlockStack>
        </InlineStack>
        <Button size="slim" tone="critical" onClick={onRemove}>Remove</Button>
      </InlineStack>
    </div>
  );
}

export interface CombinationFormHandle {
  getData: () => {
    name: string;
    popup_name: string;
    description: string;
    image_url: string;
    position: number;
    tags: string[];
    colors: string[];
    products: ProductRow[];
  };
}

interface Props {
  colors: KfoColor[];
  tags: KfoTag[];
  combination: KfoCombination | null;
  mode?: "page" | "modal";
  onCancel?: () => void;
  saving?: boolean;
}

export const CombinationForm = forwardRef<CombinationFormHandle, Props>(function CombinationForm(
  { colors, tags, combination, mode = "page", onCancel, saving: externalSaving },
  ref,
) {
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const [name, setName] = useState(combination?.name ?? "");
  const [popupName, setPopupName] = useState(combination?.popup_name ?? "");
  const [description, setDescription] = useState((combination as any)?.description ?? "");
  const [imageUrl, setImageUrl] = useState(combination?.image_url ?? "");
  const [position, setPosition] = useState(String(combination?.position ?? 0));

  const saving = mode === "modal" ? (externalSaving ?? false) : navigation.state !== "idle";

  useImperativeHandle(ref, () => ({
    getData: () => ({
      name,
      popup_name: popupName,
      description,
      image_url: imageUrl,
      position: Number(position),
      tags: selectedTags,
      colors: selectedColors,
      products,
    }),
  }));

  function handleCancel() {
    if (onCancel) onCancel();
    else navigate("/app");
  }

  const [selectedTags, setSelectedTags] = useState<string[]>(combination?.tags ?? []);
  const [selectedColors, setSelectedColors] = useState<string[]>(combination?.colors ?? []);
  const [colorInputValue, setColorInputValue] = useState("");
  const [tagInputValue, setTagInputValue] = useState("");
  const [products, setProducts] = useState<ProductRow[]>(
    combination?.products ? combination.products.map((p) => ({ ...p })) : []
  );

  async function openProductPicker() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: true });
    if (!selected || selected.length === 0) return;

    const newRows: ProductRow[] = [];
    for (const product of selected as any[]) {
      for (const variant of product.variants) {
        const variantId = variant.id.replace("gid://shopify/ProductVariant/", "");
        if (products.some((p) => p.variant_id === variantId)) continue;

        const productName =
          product.variants.length > 1
            ? `${product.title} – ${variant.title}`
            : product.title;

        newRows.push({
          variant_id: variantId,
          product_name: productName,
          handle: product.handle ?? "",
          position: 0,
          image_url: product.images?.[0]?.originalSrc ?? "",
        });
      }
    }

    setProducts((prev) => {
      const next = [...prev, ...newRows];
      return next.map((p, i) => ({ ...p, position: i + 1 }));
    });
  }

  function removeProduct(idx: number) {
    setProducts((prev) =>
      prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, position: i + 1 }))
    );
  }

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setProducts((prev) => {
      const oldIndex = prev.findIndex((p) => p.variant_id === active.id);
      const newIndex = prev.findIndex((p) => p.variant_id === over.id);
      return arrayMove(prev, oldIndex, newIndex).map((p, i) => ({ ...p, position: i + 1 }));
    });
  }

  function toggleColor(id: string) {
    setSelectedColors((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function toggleTag(slug: string) {
    setSelectedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug]
    );
  }

  function autoName() {
    const parts = products.map((p) => p.product_name).filter(Boolean);
    if (parts.length) setPopupName(parts.join(" + "));
  }

  function handleSave() {
    submit(
      { data: JSON.stringify({ name, popup_name: popupName, description, image_url: imageUrl, position: Number(position), tags: selectedTags, colors: selectedColors, products }) },
      { method: "post" }
    );
  }

  const formContent = (
    <>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <TextField
                label="Secondary Yarn name"
                value={name}
                onChange={setName}
                autoComplete="off"
              />
              <InlineStack gap="200" blockAlign="end">
                <Box width="100%">
                  <TextField
                    label="Combination name (popup)"
                    value={popupName}
                    onChange={setPopupName}
                    autoComplete="off"
                    helpText="Shown as the title in the storefront popup. Leave blank to use Combination name."
                  />
                </Box>
                <Button onClick={autoName}>Auto-name</Button>
              </InlineStack>
              <RichTextEditor
                label="Description"
                value={description}
                onChange={setDescription}
              />
              <TextField
                label="Display position"
                value={position}
                onChange={setPosition}
                autoComplete="off"
                type="number"
              />
            </BlockStack>
          </Card>

          <Box paddingBlockStart="600">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Products</Text>
                <Button onClick={openProductPicker}>Add product</Button>
              </InlineStack>
              {products.length === 0 && (
                <Text as="p" variant="bodyMd" tone="subdued">
                  Add at least 2 products to create a combination.
                </Text>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={products.map((p) => p.variant_id)} strategy={verticalListSortingStrategy}>
                  {products.map((p, idx) => (
                    <SortableProductRow
                      key={p.variant_id}
                      product={p}
                      idx={idx}
                      onRemove={() => removeProduct(idx)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </BlockStack>
          </Card>
          </Box>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Thumbnail</Text>
              <ImagePicker value={imageUrl} onChange={setImageUrl} previewAlt="Combination" />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Colors</Text>
              <Combobox
                allowMultiple
                activator={
                  <Combobox.TextField
                    label="Colors"
                    labelHidden
                    value={colorInputValue}
                    onChange={setColorInputValue}
                    placeholder="Search colors..."
                    autoComplete="off"
                  />
                }
              >
                {colors.filter((c) =>
                  c.name.toLowerCase().includes(colorInputValue.toLowerCase())
                ).length > 0 ? (
                  <Listbox
                    autoSelection={AutoSelection.None}
                    onSelect={(id) => { toggleColor(id); setColorInputValue(""); }}
                  >
                    {colors
                      .filter((c) => c.name.toLowerCase().includes(colorInputValue.toLowerCase()))
                      .map((c) => (
                        <Listbox.Option key={c.objectID} value={c.objectID} selected={selectedColors.includes(c.objectID)}>
                          <Listbox.TextOption selected={selectedColors.includes(c.objectID)}>
                            <InlineStack gap="200" blockAlign="center">
                              <div style={{ width: 14, height: 14, borderRadius: "50%", background: c.hex, border: "1px solid #ccc", flexShrink: 0 }} />
                              {c.name}
                            </InlineStack>
                          </Listbox.TextOption>
                        </Listbox.Option>
                      ))}
                  </Listbox>
                ) : null}
              </Combobox>
              {selectedColors.length > 0 && (
                <InlineStack gap="100" wrap>
                  {selectedColors.map((id) => {
                    const c = colors.find((x) => x.objectID === id);
                    return c ? (
                      <Tag key={id} onRemove={() => toggleColor(id)}>
                        <InlineStack gap="100" blockAlign="center">
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.hex, border: "1px solid #ccc" }} />
                          {c.name}
                        </InlineStack>
                      </Tag>
                    ) : null;
                  })}
                </InlineStack>
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Tags</Text>
              <Combobox
                allowMultiple
                activator={
                  <Combobox.TextField
                    label="Tags"
                    labelHidden
                    value={tagInputValue}
                    onChange={setTagInputValue}
                    placeholder="Search tags..."
                    autoComplete="off"
                  />
                }
              >
                {tags.filter((t) =>
                  t.name.toLowerCase().includes(tagInputValue.toLowerCase())
                ).length > 0 ? (
                  <Listbox
                    autoSelection={AutoSelection.None}
                    onSelect={(slug) => { toggleTag(slug); setTagInputValue(""); }}
                  >
                    {tags
                      .filter((t) => t.name.toLowerCase().includes(tagInputValue.toLowerCase()))
                      .map((t) => (
                        <Listbox.Option key={t.slug} value={t.slug} selected={selectedTags.includes(t.slug)}>
                          <Listbox.TextOption selected={selectedTags.includes(t.slug)}>
                            {t.name}
                          </Listbox.TextOption>
                        </Listbox.Option>
                      ))}
                  </Listbox>
                ) : null}
              </Combobox>
              {selectedTags.length > 0 && (
                <InlineStack gap="100" wrap>
                  {selectedTags.map((slug) => {
                    const t = tags.find((x) => x.slug === slug);
                    return (
                      <Tag key={slug} onRemove={() => toggleTag(slug)}>
                        {t?.name ?? slug}
                      </Tag>
                    );
                  })}
                </InlineStack>
              )}
            </BlockStack>
          </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </>
  );

  if (mode === "modal") {
    return <Box paddingBlock="400">{formContent}</Box>;
  }

  return (
    <Page
      fullWidth
      title={combination ? "Edit combination" : "New combination"}
      backAction={{ content: "Combinations", onAction: handleCancel }}
      primaryAction={{ content: "Save", onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: "Cancel", onAction: handleCancel }]}
    >
      {formContent}
    </Page>
  );
});
