# KFO Yarn Tool — Deploy Checklist (Dev)

**Updated:** 2026-05-18

---

## Prerequisites (collect from client)

- [ ] **Shopify** — Client ID + Client Secret (from Partners dashboard)
- [ ] **Algolia (App-level)** — App ID + Admin API Key (dev/app account, used to store merchant credentials in `kfo_settings`)
- [ ] **Algolia (Merchant)** — App ID + Admin API Key + Search-Only API Key (merchant's own account)
- [ ] **Upstash** — Redis URL (see Step 1 below)

---

## Step 1 — Create Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com) → **Create database**
2. Name: `kfo-sessions`, Region: `us-east-1` (or closest to your Vercel region)
3. Type: **Regional** (Global not needed)
4. Copy the **Redis URL** (format: `rediss://default:xxxx@xxx.upstash.io:6379`)

---

## Step 2 — Push code to GitHub

```bash
git add .
git commit -m "feat: KFO Yarn Tool — ready for deploy"
git push origin main
```

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import GitHub repo
2. Framework: **Remix** (auto-detected)
3. Add **Environment Variables**:

| Key | Value |
|---|---|
| `SHOPIFY_API_KEY` | Client ID from Shopify Partners |
| `SHOPIFY_API_SECRET` | Client Secret from Shopify Partners |
| `SHOPIFY_APP_URL` | `https://<vercel-domain>.vercel.app` |
| `SCOPES` | `read_products,write_files,read_files` |
| `ALGOLIA_APP_ID` | App-level Algolia App ID |
| `ALGOLIA_ADMIN_API_KEY` | App-level Algolia Admin Key |
| `REDIS_URL` | Upstash Redis URL |

4. Click **Deploy** → wait for build → copy the Vercel domain

---

## Step 4 — Update Shopify Partners

Go to [partners.shopify.com](https://partners.shopify.com) → select app → **App setup**:

- **App URL:** `https://<vercel-domain>.vercel.app`
- **Allowed redirection URL(s):**
  ```
  https://<vercel-domain>.vercel.app/auth/callback
  https://<vercel-domain>.vercel.app/auth/shopify/callback
  https://<vercel-domain>.vercel.app/api/auth/callback
  ```

Update `shopify.app.toml`:
```toml
application_url = "https://<vercel-domain>.vercel.app"

[auth]
redirect_urls = [
  "https://<vercel-domain>.vercel.app/auth/callback",
  "https://<vercel-domain>.vercel.app/auth/shopify/callback",
  "https://<vercel-domain>.vercel.app/api/auth/callback"
]
```

---

## Step 5 — Deploy Theme Extension

```bash
nvm use 22.13.1
shopify app deploy
```

> First run will prompt for confirmation — type `yes`.  
> The extension is pushed to Shopify's CDN, independent from Vercel.

---

## Step 6 — Install app on store

1. Go to Partners → **Test on development store**, or send the install link to the merchant
2. Install URL: `https://<store>.myshopify.com/admin/apps/kfo-yarn-color-matching-tool`
3. Merchant approves permissions → app installed

---

## Step 7 — First-time configuration (in Admin app)

1. Open app → automatically redirected to **Settings** if not yet configured
2. Enter the **merchant's** Algolia credentials:
   - Application ID
   - Admin API Key
   - Search-Only API Key
3. Click **Save** → app automatically:
   - Creates 3 indexes: `kfo_combinations`, `kfo_colors`, `kfo_tags`
   - Sets `searchableAttributes` + `attributesForFaceting` on `kfo_combinations`

---

## Step 8 — Post-deploy verification

- [ ] App loads without redirect loop
- [ ] Settings save successfully, no Algolia errors
- [ ] Create a test Color, Tag, and Combination
- [ ] Thumbnail upload works
- [ ] Widget displays correctly on storefront
- [ ] Favorites sync between both blocks

---

## Quick Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| Redirect loop on app open | Wrong `SHOPIFY_APP_URL` | Update env var + redeploy |
| `REDIS_URL` connection error | Wrong URL or not set | Check Upstash dashboard |
| Settings save fails (Algolia error) | Wrong API Key | Use Admin Key, not Search-Only Key |
| Widget not loading | Extension not deployed | Run `shopify app deploy` |
| `Cannot find variant` on Add to Cart | variant_id is GID instead of numeric | Already fixed in code (split `/`) |
