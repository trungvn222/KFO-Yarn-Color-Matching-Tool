import { webcrypto } from "node:crypto";
import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

// Ensure Web Crypto API is available globally for Vite SSR module runner
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

console.log(host);

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: true,
    cors: { preflightContinue: true },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: { allow: ["app", "node_modules"] },
  },
  plugins: [
    {
      name: "strip-import-attributes",
      enforce: "pre",
      transform(code, id) {
        if (id.includes("node_modules") && code.includes(" with {")) {
          return {
            code: code.replace(
              /\bwith\s*\{\s*type\s*:\s*['"]json['"]\s*\}/g,
              "",
            ),
            map: null,
          };
        }
      },
    },
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: { assetsInlineLimit: 0 },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
  ssr: {
    noExternal: [/@shopify/],
  },
}) satisfies UserConfig;
