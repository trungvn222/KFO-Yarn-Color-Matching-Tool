import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

/**
 * Download an image from an arbitrary public URL (e.g. another store's Shopify
 * CDN) and re-upload it to the *current* shop's Files, returning the new CDN URL.
 *
 * Used when importing colors/tags exported from another store so the images live
 * on the target store and no longer depend on the source store's CDN.
 *
 * `cache` dedupes uploads within a single import: the same source URL is only
 * fetched + uploaded once. Pass a shared Map across rows.
 *
 * On any failure the original `sourceUrl` is returned unchanged so an import
 * never breaks just because one image could not be re-hosted.
 */
export async function rehostImageFromUrl(
  admin: AdminApiContext,
  sourceUrl: string,
  cache?: Map<string, string>,
): Promise<string> {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  if (cache?.has(sourceUrl)) return cache.get(sourceUrl)!;

  try {
    const newUrl = await doRehost(admin, sourceUrl);
    cache?.set(sourceUrl, newUrl);
    return newUrl;
  } catch (err) {
    console.error(`rehostImageFromUrl failed for ${sourceUrl}:`, err);
    cache?.set(sourceUrl, sourceUrl);
    return sourceUrl;
  }
}

async function doRehost(admin: AdminApiContext, sourceUrl: string): Promise<string> {
  // Step 0: download the source image
  const download = await fetch(sourceUrl);
  if (!download.ok) throw new Error(`download failed: ${download.status}`);
  const buffer = await download.arrayBuffer();
  const mimeType = download.headers.get("content-type") || "image/jpeg";

  const path = sourceUrl.split("?")[0];
  const filename = decodeURIComponent(path.substring(path.lastIndexOf("/") + 1)) || "image";

  // Step 1: create staged upload
  const stagingRes = await admin.graphql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [{
          resource: "IMAGE",
          filename,
          mimeType,
          fileSize: String(buffer.byteLength),
          httpMethod: "POST",
        }],
      },
    },
  );

  const stagingData = await stagingRes.json();
  const userErrors = stagingData.data?.stagedUploadsCreate?.userErrors;
  if (userErrors?.length) throw new Error(userErrors[0].message);

  const target = stagingData.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error("no staged target returned");

  // Step 2: POST multipart to Shopify CDN
  const uploadForm = new FormData();
  for (const { name, value } of target.parameters) uploadForm.append(name, value);
  uploadForm.append("file", new Blob([buffer], { type: mimeType }), filename);

  const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!uploadRes.ok) throw new Error(`CDN upload failed: ${uploadRes.status}`);

  // Step 3: register file in Shopify Files
  const createRes = await admin.graphql(
    `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { ... on MediaImage { id fileStatus image { url } } }
        userErrors { field message }
      }
    }`,
    { variables: { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }] } },
  );

  const createData = await createRes.json();
  const createErrors = createData.data?.fileCreate?.userErrors;
  if (createErrors?.length) throw new Error(createErrors[0].message);
  const created = createData.data?.fileCreate?.files?.[0];
  if (!created?.id) throw new Error("fileCreate returned no file id");

  // Step 4: poll until the new store's CDN URL is ready (up to ~40s)
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const pollRes = await admin.graphql(
      `#graphql
      query getFile($id: ID!) {
        node(id: $id) { ... on MediaImage { fileStatus image { url } } }
      }`,
      { variables: { id: created.id } },
    );
    const node = (await pollRes.json()).data?.node;
    if (node?.fileStatus === "FAILED") throw new Error("file processing FAILED on new store");
    if (node?.fileStatus === "READY" && node?.image?.url) {
      console.log(`rehostImageFromUrl: ${sourceUrl} -> ${node.image.url}`);
      return node.image.url;
    }
  }

  // Never return the ephemeral staged URL (it 404s later). Throw so the caller
  // keeps the still-working source URL instead of a dead temporary one.
  throw new Error("file not READY after polling; keeping source URL");
}
