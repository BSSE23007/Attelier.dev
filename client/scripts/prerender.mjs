import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { createServer } from "vite";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(clientRoot, "dist");
const routes = [
  "/",
  "/contact",
  "/projects/estatecore",
  "/projects/hospital-management",
  "/projects/aws-threat-detection",
  "/projects/client-motion-graphics",
];

const vite = await createServer({
  configFile: path.join(clientRoot, "vite.config.js"),
  root: clientRoot,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
});

try {
  const [{ AppRoutes }, { getPageMetadata, renderMetadataTags }] = await Promise.all([
    vite.ssrLoadModule("/src/App.jsx"),
    vite.ssrLoadModule("/src/seoMetadata.js"),
  ]);
  const baseHtml = await readFile(path.join(outputDirectory, "index.html"), "utf8");

  function createPageHtml(route) {
    const markup = renderToString(
      React.createElement(
        StaticRouter,
        { location: route },
        React.createElement(AppRoutes),
      ),
    );
    const metadata = getPageMetadata(route);
    const head = renderMetadataTags(metadata);
    const cleanHtml = baseHtml
      .replace(/\s*<title>[\s\S]*?<\/title>/i, "")
      .replace(/\s*<meta\s+name=["']description["'][^>]*\/?\s*>/i, "")
      .replace(/\s*<meta\s+name=["']robots["'][^>]*\/?\s*>/i, "")
      .replace(/\s*<meta\s+property=["'](?:og:|twitter:)[^>]*\/?\s*>/gi, "")
      .replace("</head>", `    ${head}\n  </head>`);

    if (!cleanHtml.includes('<div id="root"></div>')) {
      throw new Error(`Could not find the empty React root while prerendering ${route}.`);
    }
    const prerenderedRoot = `<div id="root" data-prerendered-route="${route}">${markup}</div>`;
    return cleanHtml.replace('<div id="root"></div>', prerenderedRoot);
  }

  for (const route of routes) {
    const relativeDirectory = route === "/" ? "" : route.slice(1);
    const destination = path.join(outputDirectory, relativeDirectory, "index.html");
    const html = createPageHtml(route);
    const metadata = getPageMetadata(route);
    const expectedCanonical = `<link rel="canonical" href="${metadata.canonicalUrl}" />`;
    assert.ok(html.includes(expectedCanonical), `Missing canonical URL for ${route}.`);
    assert.ok(html.includes(`<meta property="og:url" content="${metadata.url}" />`), `Missing Open Graph URL for ${route}.`);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `Expected one H1 on ${route}.`);

    const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    const shouldHaveStructuredData = route === "/" || route.startsWith("/projects/");
    assert.equal(jsonLdBlocks.length, shouldHaveStructuredData ? 1 : 0, `Unexpected JSON-LD count on ${route}.`);
    for (const [, jsonLd] of jsonLdBlocks) JSON.parse(jsonLd);

    const imageTags = html.match(/<img\b[^>]*>/g) || [];
    for (const imageTag of imageTags) assert.match(imageTag, /\balt=/, `Image missing alt on ${route}: ${imageTag}`);

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, html);
  }

  // Static hosts that support a conventional 404.html can serve this page with
  // a not-found status; client-side routing still handles unknown paths too.
  const notFoundHtml = createPageHtml("/__attelier_not_found__");
  await writeFile(path.join(outputDirectory, "404.html"), notFoundHtml);
  console.log(`Prerendered ${routes.length} public routes and a not-found page.`);
} finally {
  await vite.close();
}
