# KFO Yarn Tool — Shopify B2B App

Shopify embedded app for managing yarn color combinations. Built with Remix, Shopify Polaris, and Algolia.

## Stack

- **Framework**: Remix v2 (Vite) + React 18
- **UI**: Shopify Polaris + App Bridge
- **Data**: Algolia (two instances — see Architecture)
- **Sessions**: Redis (`shopify_sessions` prefix)
- **Rich text**: Tiptap (StarterKit + Underline)
- **Drag-and-drop**: @dnd-kit/core + @dnd-kit/sortable
- **CSV**: PapaParse

## Commands

```bash
npm run dev          # shopify app dev (tunneled)
npm run dev:vite     # vite only (no tunnel)
npm run build        # remix vite:build
npm run start        # serve production build
npm run deploy       # shopify app deploy
```

## Architecture

### Two Algolia instances

1. **App-level** (`algolia.server.ts`) — uses `ALGOLIA_APP_ID` + `ALGOLIA_ADMIN_API_KEY` env vars. Stores per-merchant Algolia credentials in the `kfo_settings` index, keyed by shop domain.

2. **Merchant-level** (`merchantAlgolia.server.ts`) — per-shop Algolia instance using credentials from `kfo_settings`. All data (combinations, colors, tags) lives here.

`config.server.ts` owns reading/writing merchant credentials. Set `DISABLE_ALGOLIA=true` to bypass the app-level Algolia and read from `merchant.config.json` on disk instead.

### Algolia indexes

| Index | Contents |
|---|---|
| `kfo_settings` | Merchant Algolia credentials (app-level) |
| `kfo_combinations` | Yarn combinations |
| `kfo_colors` | Color library |
| `kfo_tags` | Tag library |

`kfo_combinations` index settings (set on first save in `/app/settings`):
- `searchableAttributes`: `name`, `description`
- `attributesForFaceting`: `tags`, `colors`
- `customRanking`: `asc(position)`

### Auth guard

Every route that needs merchant data calls `requireMerchantConfig` at the top of its loader/action and redirects to `/app/settings?required=1` if credentials are missing.

## Routes

| Route | Purpose |
|---|---|
| `/app` | Combinations list with search, color/tag filters, pagination, CSV export |
| `/app/combinations/new` | Create combination |
| `/app/combinations/:id/edit` | Edit combination (fetches variant images via Shopify GraphQL) |
| `/app/colors` | Colors CRUD + CSV import |
| `/app/tags` | Tags CRUD |
| `/app/settings` | Merchant Algolia credentials |
| `/app/sync` | Pull Merino + Soft Silk Mohair variants from Shopify |
| `/app/export` | Streams combinations as CSV (respects active filters) |
| `/app/import` | Bulk import combinations from CSV with validation preview |
| `/app/upload` | Upload image → Shopify CDN (staged upload flow) |

## Data Types (`app/types/kfo.ts`)

```ts
KfoProduct   { variant_id, product_name, handle, position, image_url? }
KfoCombination { objectID, name, image_url, position, tags: string[], colors: string[], products: KfoProduct[] }
KfoColor     { objectID, name, hex, image_url?, content_image_url?, content_title?, description? }
KfoTag       { objectID, name, slug, color, image_url?, content_image_url?, description? }
ShopifyVariant { id, title, product_title, product_id }
```

`colors` on a combination is an array of `KfoColor.objectID` values. `tags` is an array of `KfoTag.slug` values.

## Key Components

### `CombinationForm` (`app/components/CombinationForm.tsx`)

Shared between new and edit routes. Handles:
- Name, description (RichTextEditor), display position
- Shopify `resourcePicker` for adding product variants
- Drag-to-reorder products via @dnd-kit
- Color and tag multi-select (Combobox + Listbox)
- Image upload / library picker

### `RichTextEditor` (`app/components/RichTextEditor.tsx`)

Tiptap-based editor (Bold, Italic, Underline, Strike, H1–H3, bullet list, ordered list). Outputs HTML. Injects its own `<style>` tag with class `.kfo-rte` on first render.

## Image Upload Flow (`/app/upload`)

1. `stagedUploadsCreate` mutation → Shopify returns a pre-signed URL + params
2. POST multipart to the CDN URL with those params
3. `fileCreate` mutation to register the file
4. Poll `node(id)` up to 15 × 800 ms until `fileStatus === "READY"`
5. Returns `{ url }` — falls back to `resourceUrl` on timeout

## Environment Variables

| Variable | Purpose |
|---|---|
| `SHOPIFY_API_KEY` | Shopify app key |
| `SHOPIFY_API_SECRET` | Shopify app secret |
| `SHOPIFY_APP_URL` | Public app URL |
| `SCOPES` | Comma-separated OAuth scopes |
| `REDIS_URL` | Redis connection URL for session storage |
| `ALGOLIA_APP_ID` | App-level Algolia app ID |
| `ALGOLIA_ADMIN_API_KEY` | App-level Algolia admin key |
| `DISABLE_ALGOLIA` | If set, skip app-level Algolia and use `merchant.config.json` |
| `SHOP_CUSTOM_DOMAIN` | Optional custom shop domain |

## Delete Safety Pattern

Deleting a color or tag runs a two-step flow:
1. `check-color-usage` / `check-tag-usage` action — counts combinations that reference the item
2. Confirm modal shows the count; on confirm, removes the item from all affected combinations before deleting it

This keeps referential integrity within Algolia.
