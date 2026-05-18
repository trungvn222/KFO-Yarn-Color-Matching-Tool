# KFO Yarn Tool — Client Onboarding Guide

**Updated:** 2026-05-18

---

## Overview

KFO Yarn Tool has two parts:
- **Admin app** — manage combinations, colors, and tags (runs inside Shopify Admin)
- **Storefront widget** — displays combinations and favorites to customers on the store

To get started, you need to create a **Shopify app** and an **Algolia account**, then share the credentials with your developer.

---

## Part 1 — Shopify Partners

### 1.1 Create a Shopify Partners account (if you don't have one)

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Sign up with your company email

### 1.2 Create the app

1. Go to **Apps** → **Create app** → **Create app manually**
2. Fill in:
   - **App name:** `KFO Yarn Color Matching Tool`
   - **App URL:** *(your developer will update this after deploying)*
3. Once created, go to the **Client credentials** tab
4. Copy and send to your developer:
   - **Client ID** (= `SHOPIFY_API_KEY`)
   - **Client secret** (= `SHOPIFY_API_SECRET`)

> The client secret is shown only once — copy it immediately and store it securely.

---

## Part 2 — Algolia

### 2.1 Create an Algolia account

1. Go to [algolia.com](https://www.algolia.com) → **Start for free**
2. Sign up with your company email
3. Create a new application when prompted (e.g. name: `KFO Yarn Tool`)

### 2.2 Create 3 indexes

Go to **Search → Index → Create Index** and create the following:

| Index name | Purpose |
|---|---|
| `kfo_combinations` | Color combination library |
| `kfo_colors` | Color swatches |
| `kfo_tags` | Filter tags |

> Index names are case-sensitive — enter them exactly as shown above.

### 2.3 Get API Keys

Go to **Settings → API Keys**:

| Key | Used for |
|---|---|
| **Application ID** | Identifies your Algolia account |
| **Admin API Key** | Admin app (server-side only) — **keep secret** |
| **Search-Only API Key** | Storefront widget (safe to expose publicly) |

Send all 3 keys to your developer.

---

## Part 3 — After Developer Deploys

Your developer will send you an install link. Once installed:

### 3.1 Configure Algolia in the Admin app

1. Open the app → it will automatically redirect to **Settings**
2. Enter the 3 Algolia keys (Application ID, Admin API Key, Search-Only API Key)
3. Click **Save**
4. The app will automatically create the indexes and apply the required configuration

### 3.2 Add initial data

Follow this order:

**Colors** → create colors (name, hex code, optional image)

**Tags** → create tags (name, badge color)

**Combinations** → create combinations:
- Select products via the Resource Picker
- Assign colors and tags
- Upload a thumbnail (optional)

### 3.3 Add the widget to your Theme

1. Shopify Admin → **Online Store → Themes → Customize**
2. Navigate to the page where you want the widget (e.g. a custom page "Yarn Combinations")
3. Click **Add section** → select **KFO Combinations**
4. In the Theme Editor settings, fill in:
   - **Application ID:** your Algolia App ID
   - **Search-Only API Key:** your Search-Only Key (**do not use the Admin Key here**)
   - Index names (defaults are already correct)
5. Optional: add the **KFO Favorites** block to a "My Favorites" page

---

## Part 4 — Daily Usage (Admin app)

| Feature | Location |
|---|---|
| Manage combinations | Admin app → **Combinations** |
| Add / edit colors | Admin app → **Colors** |
| Add / edit tags | Admin app → **Tags** |
| Bulk import | Admin app → **Import** (CSV upload) |
| Algolia settings | Admin app → **Settings** |

### Bulk Import via CSV

Use this when you need to add many combinations at once:

1. Admin app → **Import** → **Download template** to get the CSV template file
2. Open the file and fill in your data:
   - `colors`: color names separated by `|` (e.g. `Red|Navy Blue`)
   - `tags`: tag names separated by `|` (e.g. `Summer|Pastel`)
   - `variant_ids`: Shopify variant IDs separated by `|`
3. Upload the CSV → review the preview (red rows have errors)
4. Click **Import** to save to Algolia

---

## Security Notes

- **Admin API Key** is for the Admin app only — **never** paste it into the Theme Editor
- **Search-Only API Key** is what goes into the Theme Editor (safe to expose)
- Shopify Client secret — store securely, do not share publicly
