import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { Window } from "happy-dom";
import { createServer } from "vite";

const publicRoutes = [
  "/",
  "/contact",
  "/projects/estatecore",
  "/projects/hospital-management",
  "/projects/aws-threat-detection",
  "/projects/client-motion-graphics",
];
const validPaths = new Set(publicRoutes);
let vite;
let AppRoutes;

before(async () => {
  vite = await createServer({
    configFile: false,
    root: ".",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  ({ AppRoutes } = await vite.ssrLoadModule("/src/App.jsx"));
});

after(async () => vite?.close());

function renderPage(pathname) {
  const html = renderToStaticMarkup(
    createElement(StaticRouter, { location: pathname }, createElement(AppRoutes)),
  );
  const browser = new Window();
  browser.document.body.innerHTML = html;
  return { browser, document: browser.document };
}

test("each public route renders one H1 and a continuous heading hierarchy", async () => {
  for (const route of publicRoutes) {
    const { browser, document } = renderPage(route);
    assert.equal(document.querySelectorAll("h1").length, 1, route);

    let previousLevel = 0;
    for (const heading of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const currentLevel = Number(heading.tagName.slice(1));
      assert.ok(currentLevel <= previousLevel + 1, `${route}: heading jump to ${heading.tagName} (${heading.textContent})`);
      previousLevel = currentLevel;
    }
    await browser.happyDOM.abort();
  }
});

test("public page images have alt attributes and EstateCore describes its proposed diagram", async () => {
  for (const route of publicRoutes) {
    const { browser, document } = renderPage(route);
    for (const image of document.querySelectorAll("img")) {
      assert.ok(image.hasAttribute("alt"), `${route}: image ${image.getAttribute("src")} needs an alt attribute`);
    }
    await browser.happyDOM.abort();
  }

  const { browser, document } = renderPage("/projects/estatecore");
  const architecture = document.querySelector('.case-study-diagram-details img[src="/projects/estatecore/architecture.png"]');
  assert.match(architecture?.getAttribute("alt") || "", /proposed/i);
  assert.match(architecture?.getAttribute("alt") || "", /deployment is unverified/i);
  assert.equal(document.querySelector('.footer-brand img')?.getAttribute("alt"), "");
  await browser.happyDOM.abort();
});

test("internal links on public pages resolve to a public route or an existing section", async () => {
  const { browser: homeBrowser, document: homeDocument } = renderPage("/");
  for (const route of publicRoutes) {
    const { browser, document } = renderPage(route);
    for (const link of document.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href");
      if (!href.startsWith("/")) continue;
      const url = new URL(href, "https://attelier.dev");
      assert.equal(url.origin, "https://attelier.dev", `${route}: ${href}`);
      assert.ok(validPaths.has(url.pathname), `${route}: unexpected internal route ${href}`);
      if (url.hash) {
        const targetDocument = url.pathname === "/" ? homeDocument : document;
        assert.ok(targetDocument.getElementById(decodeURIComponent(url.hash.slice(1))), `${route}: missing target for ${href}`);
      }
    }
    await browser.happyDOM.abort();
  }
  await homeBrowser.happyDOM.abort();
});

test("structured data renders on the home and project pages, never admin routes", async () => {
  for (const route of ["/", ...publicRoutes.slice(2)]) {
    const { browser, document } = renderPage(route);
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')];
    assert.equal(blocks.length, 1, route);
    assert.doesNotThrow(() => JSON.parse(blocks[0].textContent), route);
    await browser.happyDOM.abort();
  }

  for (const route of ["/contact", "/admin", "/admin/login", "/admin/inquiries/secret"]) {
    const { browser, document } = renderPage(route);
    assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 0, route);
    await browser.happyDOM.abort();
  }
});
