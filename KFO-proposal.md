# KFO Yarn Color Matching Tool — Project Proposal

## Overview
A Shopify app for Knitting for Olive that allows customers to visually mix and match yarn color combinations, and add multiple products to the cart at once.

The app consists of two parts:
- **Admin Tool** — Merchants manage color combinations directly in Shopify Admin
- **Storefront Widget** — Customers browse, filter, and add combinations to cart

> Combinations are visual only — no custom inventory or pricing.

---

## Scope of Work

### 1. Project Setup
Initialize Shopify App (Remix), configure authentication, and set up Algolia with 3 indexes: `combinations`, `tags`, `colors`.

### 2. Algolia Data Layer
Configure indexes, filters, facets, and API keys. Each combination record stores an array of N products, color slugs for filtering, tags, and a primary product for swatch display.

### 3. Shopify Product Sync
Fetch and cache Shopify product variants in the admin. Includes a manual "Sync Products" button to pull the latest data.

### 4. Admin — Color Management
Full CRUD for the color library (name, hex value). Colors are shared across all combinations.

### 5. Admin — Tag Management
Full CRUD for tags. Tags are used to categorize and filter combinations on the storefront.

### 6. Admin — Combination Management
Full CRUD for combinations. Each combination supports:
- N products (minimum 2, no maximum)
- Drag-and-drop product ordering
- Primary product selection (used as storefront swatch)
- Color and tag assignment
- Image upload

### 7. Storefront — Filter Bar
Customers can filter combinations by color swatches and tags simultaneously. Displays result counts per filter option.

### 8. Storefront — Color Swatch Selector
Grid of color swatches based on the primary product. Selecting a swatch filters the results grid.

### 9. Storefront — Results Grid
Displays up to 10 combinations per page with a "Show More" button. Each card shows the combination image, product list, and tags.

### 10. Storefront — Detail Popup
Shows full combination details. A single "Add to Cart" button adds all N products to the Shopify cart simultaneously.

### 11. Storefront — Favorites
Customers can save combinations to a personal gallery stored in localStorage, and reopen or remove them at any time.

### 12. Admin — CSV Import
Bulk import combinations from a CSV file. Includes:
- Downloadable CSV template with correct column structure
- File upload via Polaris DropZone
- Server-side parsing and validation (missing fields, invalid variant IDs, etc.)
- Preview table before confirming import
- Bulk write to Algolia on confirm
- Per-row error reporting for failed records

### 13. Theme App Extension
Embed the storefront widget as a Shopify App Block, installable via the Theme Editor with no code required.

### 13. Deployment
Deploy to production and install on the KFO Shopify store.

---

## Estimation

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

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Remix (Shopify CLI) |
| Admin UI | **Shopify Polaris** (native Shopify look & feel, no custom CSS) |
| Shopify APIs | Admin API + Storefront API |
| Database | Algolia |
| Storefront Widget | React + Tailwind CSS |
| Favorites | localStorage |
| Deployment | Vercel / Railway |

> **Admin UI note:** All admin pages (Colors, Tags, Combinations) are built exclusively with Shopify Polaris components — tables, forms, modals, badges, color pickers — to match the native Shopify Admin experience.
