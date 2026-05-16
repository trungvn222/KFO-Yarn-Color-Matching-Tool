# KFO Yarn Color Matching Tool — Requirements Document

**Project:** Knitting for Olive — Yarn Color Matching Shopify App  
**Date:** 2026-05-14  
**Status:** Draft

---

## 1. Overview

A Shopify app that lets customers visually mix and match yarn color combinations and add multiple products to the cart in one action.

**Two main surfaces:**
- **Admin Tool** — Merchants manage combinations inside Shopify Admin (Polaris UI)
- **Storefront Widget** — Customers browse, filter, and purchase combinations

Combinations are **visual only** — no custom inventory or pricing per combination.

---

## 2. Data Model

### 2.1 Algolia Index: `kfo_combinations`

```json
{
  "objectID": "uuid",
  "name": "Red + Pink + Cream",
  "image_url": "https://...",
  "position": 1,
  "tags": ["summer", "pastel"],
  "primary_variant_id": "123456",
  "color_slugs": ["red", "pink", "cream"],
  "products": [
    {
      "variant_id": "123456",
      "product_name": "Merino",
      "color_name": "Red",
      "color_slug": "red",
      "color_hex": "#FF0000",
      "position": 1
    },
    {
      "variant_id": "789012",
      "product_name": "Soft Silk Mohair",
      "color_name": "Pink",
      "color_slug": "pink",
      "color_hex": "#FFC0CB",
      "position": 2
    }
  ]
}
```

- `color_slugs` — denormalized from `products[].color_slug`; used for Algolia facet filtering
- `primary_variant_id` — the variant used as the primary swatch on the storefront (set by merchant)
- `products` — supports N items (minimum 2, no maximum); `position` determines display order

### 2.2 Algolia Index: `kfo_colors`

```json
{ "objectID": "red", "name": "Red", "hex": "#FF0000" }
```

### 2.3 Algolia Index: `kfo_tags`

```json
{ "objectID": "summer", "name": "Summer", "slug": "summer", "color": "#FFF9C4" }
```

---

## 3. Algolia Configuration

| Setting | Value |
|---|---|
| Searchable attributes | `name`, `tags`, `products.color_name`, `products.product_name` |
| Filterable attributes | `primary_variant_id`, `tags`, `products.variant_id`, `color_slugs` |
| Facets | `tags`, `color_slugs` |
| Ranking | `position` (ascending) |
| Search-Only API Key | Public; embedded in storefront widget (read-only) |
| Admin API Key | Private; server-side only (full CRUD) — never exposed to client |

---

## 4. Functional Requirements

### 4.1 Project Setup

- Initialize Shopify App using Shopify CLI + Remix
- Install Shopify App Bridge and Polaris
- Configure OAuth with scope: `read_products`
- Create Algolia account and the 3 indexes above
- Install `algoliasearch` JS SDK
- Set up dev environment (ngrok or Cloudflare Tunnel)

### 4.2 Shopify Product Sync

- Fetch all Merino variants from Shopify Admin API
- Fetch all Soft Silk Mohair (SSM) variants from Shopify Admin API
- Expose a manual **"Sync Products"** button in the admin to refresh the variant list

### 4.3 Admin — Color Management

| Action | Behavior |
|---|---|
| List | Table: swatch preview, name, slug, count of combinations using this color |
| Create | Fields: name, hex (color picker); slug auto-generated from name |
| Edit | Update name, hex; auto-update `color_slugs` in all affected combinations |
| Delete | Warn if color is in use; block or confirm before deleting |

All CRUD writes to Algolia index `kfo_colors`.

### 4.4 Admin — Tag Management

| Action | Behavior |
|---|---|
| List | Table: name, slug, badge color, count of combinations using this tag |
| Create | Fields: name, slug auto-generated, color picker |
| Edit | Update name, badge color |
| Delete | Warn if tag is in use by any combination |

All CRUD writes to Algolia index `kfo_tags`.

### 4.5 Admin — Combination Management

| Action | Behavior |
|---|---|
| List | Table: image, name, product count, tags, action buttons |
| Filter | Filter list by tag |
| Create | See §4.5.1 |
| Edit | Modify products (add/remove/reorder), change primary product, update tags/image |
| Delete | Remove from Algolia |
| Reorder | Set `position` field to control storefront display order |
| CSV Import | See §4.5.2 |

All CRUD writes to Algolia index `kfo_combinations`.

#### 4.5.1 Create / Edit Combination

- **Name** — auto-generated from product color names, or entered manually
- **Product list** — dynamic; "Add Product" button opens a variant picker
  - Each product row: pick variant (from synced Shopify variants) + pick color from `kfo_colors` (or create new inline)
  - Minimum 2 products; no maximum
  - Drag-and-drop to reorder; `position` field within `products[]`
- **Primary Product** — merchant selects one product as the storefront swatch
- **`color_slugs`** — auto-computed from all `products[].color_slug` on save
- **Image upload** — upload combination result photo
- **Tags** — multi-select from `kfo_tags`

#### 4.5.2 CSV Import (bulk migration)

- Downloadable CSV template with correct column headers
- File upload via Polaris DropZone
- Server-side parsing and validation (missing required fields, invalid variant IDs, etc.)
- Preview table before confirming import
- Bulk write to Algolia on confirm
- Per-row error reporting for any failed records

### 4.6 Storefront — Filter Bar

- Fetch all colors from `kfo_colors`; render as color swatch pills (use `hex` for display)
- Fetch all tags from `kfo_tags`; render as tag pills
- Multi-select colors → filter Algolia via `facetFilters: [color_slugs]`
- Multi-select tags → filter Algolia via `facetFilters: [tags]`
- Color filter, tag filter, and primary swatch filter operate simultaneously
- Display result count per color/tag pill from `facetHits`
- Reset filter button

### 4.7 Storefront — Color Swatch Selector

- Fetch distinct `primary_variant_id` values from Algolia
- Render a grid of color swatches using `color_hex` of the primary product
- Selected and hover states
- Responsive: mobile and desktop

### 4.8 Storefront — Results Grid

- Query Algolia filtered by selected `primary_variant_id` and selected tags
- Show up to 10 combinations per page (`hitsPerPage: 10`)
- Each card: combination image, name, product list (N items), tags
- "Show More" button using Algolia pagination; display remaining count from `nbHits`

### 4.9 Storefront — Detail Popup

- Shows: combination image, list of N products (name + color), tags
- **Add to Cart** button — adds all N variants simultaneously via Shopify Storefront API cart mutation (`lines` array with N items)

### 4.10 Storefront — Favorites

- Save combination `objectID` to `localStorage`
- Fetch full details from Algolia when gallery opens
- Personal gallery: view saved combinations, remove, or reopen detail popup

### 4.11 Theme App Extension

- Deliver the storefront widget as a Shopify App Block
- Merchant installs via Shopify Theme Editor — no code required
- Widget uses the public Search-Only Algolia API Key

---

## 5. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Security | Admin Algolia API Key is never sent to the client; only Search-Only Key is embedded in the widget |
| Auth | Shopify OAuth; scope: `read_products` |
| Shopify APIs | Admin API for product sync; Storefront API for cart mutations |
| Admin UI | Built exclusively with Shopify Polaris — matches native Shopify Admin look and feel |
| Storefront UI | React + Tailwind CSS |

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Remix (Shopify CLI) |
| Admin UI | Shopify Polaris |
| Shopify APIs | Admin API + Storefront API |
| Database | Algolia (`kfo_combinations`, `kfo_colors`, `kfo_tags`) |
| Storefront Widget | React + Tailwind CSS |
| Favorites | `localStorage` (stores `objectID`, fetches details from Algolia) |
| Deployment | Vercel or Railway |

---

## 7. Phase 1 Constraints

- Yarn 1: **Merino** (customer selects color)
- Yarn 2: **Soft Silk Mohair (SSM)** (system suggests)
- One Merino color can appear in multiple combinations with different SSM pairings

---

## 8. Estimation

| # | Task | Days | Hours |
|---|---|---|---|
| 1 | Project Setup | 1 | 6h |
| 2 | Algolia Data Layer | 1 | 6h |
| 3 | Shopify Product Sync | 1 | 6h |
| 4 | Admin — Color Management | 1 | 9h |
| 5 | Admin — Tag Management | 1 | 9h |
| 6 | Admin — Combination Management | 4 | 30h |
| 7 | Storefront — Filter Bar | 1.5 | 12h |
| 8 | Storefront — Color Swatch Selector | 1 | 9h |
| 9 | Storefront — Results Grid | 1 | 9h |
| 10 | Storefront — Detail Popup + Add to Cart | 1.5 | 12h |
| 11 | Storefront — Favorites | 1 | 9h |
| 12 | Admin — CSV Import | 1.5 | 12h |
| 13 | Theme App Extension | 1 | 9h |
| 14 | Deployment | 0.5 | 4h |
| | **Total** | **18 days** | **142h** |
