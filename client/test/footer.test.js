import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("footer has a single email contact, a contact route CTA, and four safe social links", async (t) => {
  const vite = await createServer({
    configFile: false,
    root: ".",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const { default: Footer } = await vite.ssrLoadModule("/src/Footer.jsx");
  const markup = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(Footer))
  );

  assert.equal([...markup.matchAll(/mailto:attelier\.dev@gmail\.com/g)].length, 1);
  assert.equal([...markup.matchAll(/Open Gmail compose/g)].length, 1);
  assert.match(markup, /href="\/contact"[^>]*>Start a project/);
  const socialMarkup = markup.match(/<div class="footer-social-links"[^>]*>(.*?)<\/div>/)?.[1];
  assert.ok(socialMarkup);
  assert.equal([...socialMarkup.matchAll(/<svg/g)].length, 4);
  const expectedProfiles = [
    ["Facebook", "https://www.facebook.com/your-page"],
    ["Instagram", "https://www.instagram.com/your-profile"],
    ["LinkedIn", "https://www.linkedin.com/company/your-company"],
    ["GitHub", "https://github.com/your-organization"],
  ];
  for (const [network, url] of expectedProfiles) {
    assert.ok(socialMarkup.includes(`href="${url}"`));
    assert.match(markup, new RegExp(`target="_blank" rel="noopener noreferrer" aria-label="Attelier\\.dev on ${network} \\(placeholder link\\)"`));
  }
  assert.doesNotMatch(markup, /Social profiles coming soon|Email us/);
});
