# KFO Combinations Widget — Theme App Extension

Storefront-facing companion to the KFO admin app. It renders yarn combinations,
favorites, and per-product favorites directly on the merchant's online store by
reading the same Algolia indexes the admin app writes to.

This extension is **read-only**: it queries Algolia with a *search-only* key and
talks to the storefront cart/AJAX APIs. It never touches the admin app or
Algolia admin credentials.

- **Extension type**: `theme` (theme app extension)
- **uid / handle**: `a729cab6-…` / `kfo-combinations-widget` (`shopify.extension.toml`)
- **API version**: `2026-04`

## How it works

Each block is a [theme app extension app block](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
with `"target": "section"`. The merchant drops it into a section via the Theme
Editor and fills in settings (Algolia credentials, index names, display
options). The Liquid template:

1. Renders a mount `<div>` whose `data-*` attributes carry every setting.
2. Loads the shared `kfo-widget.css`.
3. Loads the block's JS, which reads `root.dataset`, fetches the
   `algoliasearch-lite` UMD build from jsDelivr, queries Algolia, and renders
   the UI into the mount element.

So the data flow is always: **Liquid settings → `data-*` attributes →
`root.dataset` in JS → Algolia search → DOM**. There is no server round-trip
through the app for storefront rendering.

> Algolia credentials are entered per-block in the Theme Editor. Always use the
> **Search-Only API Key**, never the Admin key (the schema `info` text repeats
> this — it ships to the browser).

## Blocks

| Block (`blocks/`) | Schema name | Mount id | Script | Purpose |
|---|---|---|---|---|
| `combinations.liquid` | KFO Combinations | `#kfo-widget` | `kfo-widget.js` | Main browse grid: search, color/tag filters, per-color sections, detail modal, add-to-cart, favoriting |
| `favorites.liquid` | KFO Favorites | `#kfo-favorites` | `kfo-favorites.js` | Grid of the visitor's favorited *combinations* (a "favorites page" block) |
| `product-favorite.liquid` | KFO Product Favorite | `#kfo-product-fav-btn` | `kfo-product-favorites.js` | A heart button for a single product page. No config |
| `product-favorites-gallery.liquid` | KFO Product Favorites | `#kfo-product-favorites` | `kfo-product-favorites.js` | Grid of the visitor's favorited *products* |

`product-favorite.liquid` and `product-favorites-gallery.liquid` share one
script (`kfo-product-favorites.js`); it runs `initHeartBtn()` and
`initGallery()` and each no-ops if its mount element is absent, so the same file
serves both blocks.

## Assets

| File | Role |
|---|---|
| `kfo-widget.css` | Single stylesheet shared by **all** blocks (~1.2k lines) |
| `kfo-widget.js` | Combinations browser (see below) |
| `kfo-favorites.js` | Favorited-combinations page |
| `kfo-product-favorites.js` | Product heart button + product favorites gallery |
| `kfo-heart.svg` / `kfo-heart-active.svg` | Heart icons (inactive / active). Passed to JS via `data-heart-url` / `data-heart-active-url` |
| `kfo-heart-active.png` | PNG fallback of the active heart |

## Two independent favorites systems

Favorites are stored client-side in `localStorage` — there is no per-customer
server persistence. There are **two separate stores**:

| Store | Key | Holds | Change event |
|---|---|---|---|
| Combination favorites | `kfo_favorites` | combination `objectID`s | `kfo:favorites-changed` |
| Product favorites | `kfo_product_favorites` | product `handle`s | `kfo:product-favorites-changed` |

When a favorite is toggled, the script writes `localStorage` and dispatches the
matching `window` event. Every mounted block listens for its event and re-syncs
heart states / re-renders, so multiple blocks on the same page stay consistent.

## `kfo-widget.js` (combinations browser)

The largest script. An IIFE that runs `init()` on `#kfo-widget`. Key behavior:

- **Filter options** — loads all colors and tags up front (`hitsPerPage: 1000`)
  to build the color and tag filter controls. Color filter collapses to 8
  swatches (4 on mobile) with a SEE MORE / SEE LESS toggle; collapsing toggles
  CSS classes rather than removing nodes, so swatch `<img>`s don't reload/flicker.
- **Section vs flat rendering** — `renderContent()` calls `renderSections()`,
  which renders one section per color (selected colors, or all colors as the
  default). Each section shell is rendered immediately and its cards are
  lazy-loaded via `IntersectionObserver` (`rootMargin: 200px`) when scrolled
  near. Empty sections hide themselves. A section caps at 12 cards, showing a
  "Show all" overlay card that loads the rest in place.
  > `renderFlat()` (single grid + numeric pagination) is **defined but never
  > called** — `renderContent` always uses sections. It's effectively dead code;
  > the pagination helpers (`renderPagination`) exist only for that path.
- **Detail modal** — opened per card; appended to `<body>`. Shows a skeleton,
  then fetches live variant images from the storefront `/products/{handle}.js`
  AJAX API (`fetchVariantImages`) so images match the live theme, with a zoom
  lightbox and per-product ADD TO CART.
- **Add to cart** — POSTs to `/cart/add.js` with the numeric variant id (parsed
  out of `gid://shopify/ProductVariant/123`), then dispatches `cart:refresh` and
  `theme:cart:open` for the theme's drawer, and calls the merchant
  `window.kfoOnAddToCart` hook if defined (see below).
- **Favoriting** — heart buttons on cards/modal toggle `kfo_favorites` and show
  an "ADDED TO FAVORITE" toast linking to the favorites page
  (`data-favorites-url`, default `/pages/favorites`).

### Programmatic script injection (instant-nav compatibility)

`combinations.liquid` does **not** use a static `<script src defer>` tag to load
`kfo-widget.js`. A static tag does not execute when the section is injected via
`innerHTML` — which is what the Shopify Section Rendering API and instant-nav /
prefetch tools (e.g. `shopify-perf-kit`) do. Instead an inline script creates a
`<script>` via `document.createElement` (which always executes) and guards
against double-injection with a `data-kfo-widget` marker. The other blocks use
plain `<script defer>` tags because they aren't subject to the same
section-swap path.

The inline script and `kfo-widget.js` are sprinkled with `console.log('[KFO]…')`
debug statements tracing the load/init flow (added in recent commits while
diagnosing the instant-nav loading issue).

## Merchant add-to-cart hook

Both `combinations.liquid` and `favorites.liquid` expose an
**"On add-to-cart success — custom JS"** textarea setting. Its contents are
wrapped (in a `try/catch`) into:

```js
window.kfoOnAddToCart = function (detail) { /* merchant code */ };
```

After a successful add-to-cart the script calls this hook with
`{ variantId, numericId, button, combination }`, letting the merchant open their
cart drawer, fire analytics, etc. Example given in the schema:
`document.querySelector('cart-drawer')?.open();`

## Block settings reference

### KFO Combinations (`combinations.liquid`)
- **Algolia**: `algolia_app_id`, `algolia_search_key`
- **Indexes**: `combinations_index` (`kfo_combinations`), `colors_index`
  (`kfo_colors`), `tags_index` (`kfo_tags`), `per_page` (4–48, default 12)
- **Search**: `show_search` (default off)
- **Filters**: `show_color_filter` (default on), `color_filter_label`,
  `default_colors` (comma-separated color IDs), `show_tag_filter` (default on),
  `default_tags` (comma-separated tag slugs)
- **Favorites**: `favorites_url`
- **Add to cart**: `atc_success_script`

### KFO Favorites (`favorites.liquid`)
- `algolia_app_id`, `algolia_search_key`, `combinations_index`,
  `atc_success_script`

### KFO Product Favorite (`product-favorite.liquid`)
- None — reads `product.handle` from Liquid and works automatically.

### KFO Product Favorites (`product-favorites-gallery.liquid`)
- `per_page` (4–48, default 12). Pulls product data from
  `/products/{handle}.js` (not Algolia), paginates client-side.

## Custom events emitted

| Event | Target | When |
|---|---|---|
| `kfo:favorites-changed` | `window` | A combination is favorited/unfavorited |
| `kfo:product-favorites-changed` | `window` | A product is favorited/unfavorited |
| `cart:refresh` | `document` | After a successful add-to-cart (theme cart sync) |
| `theme:cart:open` | `document` | After a successful add-to-cart (open theme drawer) |

## Relationship to the admin app

The admin app (see the repo root `CLAUDE.md`) writes combinations, colors, and
tags into the merchant's Algolia indexes. This extension only reads them.
Combination/color/tag shapes match `app/types/kfo.ts` — note the storefront also
reads optional fields the admin sets: `popup_name` (modal title override),
`content_image_url` / `content_title` / `description` on colors (section
headers).
