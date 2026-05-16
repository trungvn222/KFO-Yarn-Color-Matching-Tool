import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`#graphql
    query {
      files(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            fileStatus
            ... on MediaImage {
              id
              image { url }
            }
          }
        }
      }
    }
  `);

  const data = await res.json();
  const files = (data.data?.files?.edges ?? [])
    .map((e: any) => e.node)
    .filter((n: any) => n?.image?.url && n?.fileStatus === "READY")
    .map((n: any) => n.image.url);

  return json({ files });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file || !file.size) {
    return json({ error: "No file provided" }, { status: 400 });
  }

  // Step 1: create staged upload
  const stagingRes = await admin.graphql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [{
          resource: "IMAGE",
          filename: file.name,
          mimeType: file.type,
          fileSize: String(file.size),
          httpMethod: "POST",
        }],
      },
    }
  );

  const stagingData = await stagingRes.json();
  const userErrors = stagingData.data?.stagedUploadsCreate?.userErrors;
  if (userErrors?.length) {
    return json({ error: userErrors[0].message }, { status: 400 });
  }

  const target = stagingData.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    return json({ error: "Failed to create staged upload" }, { status: 500 });
  }

  // Step 2: POST multipart to Shopify CDN
  const uploadForm = new FormData();
  for (const { name, value } of target.parameters) {
    uploadForm.append(name, value);
  }
  const buffer = await file.arrayBuffer();
  uploadForm.append("file", new Blob([buffer], { type: file.type }), file.name);

  const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!uploadRes.ok) {
    return json({ error: `CDN upload failed: ${uploadRes.status}` }, { status: 500 });
  }

  // Step 3: register file in Shopify Files
  const createRes = await admin.graphql(
    `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage {
            id
            fileStatus
            image { url }
          }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
      },
    }
  );

  const createData = await createRes.json();
  const created = createData.data?.fileCreate?.files?.[0];

  if (!created?.id) {
    return json({ url: target.resourceUrl });
  }

  // Step 4: poll until READY
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const pollRes = await admin.graphql(
      `#graphql
      query getFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            fileStatus
            image { url }
          }
        }
      }`,
      { variables: { id: created.id } }
    );
    const node = (await pollRes.json()).data?.node;
    if (node?.fileStatus === "READY" && node?.image?.url) {
      return json({ url: node.image.url });
    }
  }

  return json({ url: target.resourceUrl });
};
