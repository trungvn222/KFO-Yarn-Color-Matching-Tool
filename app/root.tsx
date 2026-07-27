import type { ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

function Document({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

// Last-resort net: only reached if an error escapes every nested route's own
// ErrorBoundary (e.g. app.tsx's own loader/auth failing). Keeps the failure
// contained to a plain message instead of Remix's default blank crash page.
export function ErrorBoundary() {
  return (
    <Document>
      <div style={{ padding: 40, fontFamily: "sans-serif", textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>Please refresh the page. If the problem continues, try reopening the app from Shopify admin.</p>
      </div>
    </Document>
  );
}
