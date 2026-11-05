import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";
import { applyPageMetadata, getPageMetadata, renderMetadataTags } from "../src/seoMetadata.js";

const publicRoutes = [
  "/",
  "/contact",
  "/projects/estatecore",
  "/projects/hospital-management",
  "/projects/aws-threat-detection",
  "/projects/client-motion-graphics",
];

test("each approved public route has unique indexable metadata", () => {
  const metadata = publicRoutes.map(getPageMetadata);
  assert.equal(new Set(metadata.map((page) => page.title)).size, publicRoutes.length);
  assert.equal(new Set(metadata.map((page) => page.description)).size, publicRoutes.length);
  for (const page of metadata) {
    assert.match(page.robots, /^index, follow$/);
    assert.ok(page.title.length > 0);
    assert.ok(page.description.length > 0);
  }
});

test("project metadata preserves important accuracy qualifications", () => {
  assert.match(getPageMetadata("/projects/estatecore").description, /deployment is unverified/i);
  const awsDescription = getPageMetadata("/projects/aws-threat-detection").description;
  assert.match(awsDescription, /reported in project simulation/i);
  assert.doesNotMatch(awsDescription, /WAF|SageMaker/i);
});

test("admin pages and unknown routes receive noindex metadata", () => {
  for (const route of [
    "/admin/login",
    "/admin",
    "/admin/inquiries",
    "/admin/inquiries/record-id",
    "/admin/security",
    "/somewhere-else",
    "/projects/invalid-slug",
  ]) {
    assert.equal(getPageMetadata(route).robots, "noindex, nofollow", route);
  }
});

test("server-rendered metadata uses the confirmed canonical origin", () => {
  const html = renderMetadataTags(getPageMetadata("/projects/hospital-management"));
  assert.match(html, /<title>Hospital Management System Case Study/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /property="og:url" content="https:\/\/attelier\.dev\/projects\/hospital-management"/);
  assert.match(html, /rel="canonical" href="https:\/\/attelier\.dev\/projects\/hospital-management"/);
  assert.match(html, /name="twitter:card" content="summary"/);
  assert.doesNotMatch(html, /www\.attelier\.dev|og:image|twitter:image/i);
});

test("sitemap contains only the six canonical public routes", async () => {
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls, publicRoutes.map((route) => `https://attelier.dev${route === "/" ? "/" : route}`));
  assert.doesNotMatch(sitemap, /www\.attelier\.dev|\/admin|\/api/);
});

test("client metadata navigation clears admin noindex before rendering a public route", async () => {
  const browser = new Window();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: browser.document,
  });

  try {
    applyPageMetadata(getPageMetadata("/admin/inquiries/record-id"));
    assert.equal(browser.document.title, "Administrator | Attelier.dev");
    assert.equal(browser.document.head.querySelector('meta[name="robots"]')?.content, "noindex, nofollow");
    assert.equal(browser.document.head.querySelector('link[rel="canonical"]'), null);

    applyPageMetadata(getPageMetadata("/projects/hospital-management"));
    assert.equal(browser.document.title, "Hospital Management System Case Study | Attelier.dev");
    assert.equal(browser.document.head.querySelector('meta[name="robots"]')?.content, "index, follow");
    assert.match(browser.document.head.querySelector('meta[name="description"]')?.content, /doctor roles/);
    assert.equal(browser.document.head.querySelector('link[rel="canonical"]')?.href, "https://attelier.dev/projects/hospital-management");
    assert.equal(browser.document.head.querySelector('meta[property="og:url"]')?.content, "https://attelier.dev/projects/hospital-management");
  } finally {
    await browser.happyDOM.abort();
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }
});
