import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import viteConfig, { createContentSecurityPolicy } from "../vite.config.js";

function parseDirectives(policy) {
  return Object.fromEntries(policy.split(";").map((entry) => {
    const [directive, ...sources] = entry.trim().split(/\s+/);
    return [directive, sources];
  }));
}

test("report-only CSP protects Vite responses and allows the resources used by the app", () => {
  const developmentPolicy = viteConfig.server.headers["Content-Security-Policy-Report-Only"];
  const previewPolicy = viteConfig.preview.headers["Content-Security-Policy-Report-Only"];
  const directives = parseDirectives(developmentPolicy);
  const previewDirectives = parseDirectives(previewPolicy);

  assert.ok(developmentPolicy);
  assert.ok(previewPolicy);
  assert.ok(directives["script-src"].includes("https://*.tawk.to"));
  assert.ok(directives["frame-src"].includes("https://*.tawk.to"));
  assert.ok(directives["frame-src"].includes("https://www.youtube-nocookie.com"));
  assert.ok(directives["style-src"].includes("https://fonts.googleapis.com"));
  assert.ok(directives["font-src"].includes("https://fonts.gstatic.com"));
  assert.ok(directives["connect-src"].includes("http://localhost:5000"));
  assert.ok(directives["connect-src"].includes("ws://localhost:5173"));
  assert.ok(directives["connect-src"].includes("wss://*.tawk.to"));
  assert.ok(directives["img-src"].includes("https://tawk.link"));
  assert.ok(directives["img-src"].includes("https://s3.amazonaws.com"));
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.deepEqual(directives["base-uri"], ["'self'"]);
  assert.deepEqual(directives["frame-ancestors"], ["'none'"]);
  assert.ok(previewDirectives["connect-src"].includes("http://localhost:5000"));
  assert.ok(!previewDirectives["connect-src"].includes("ws://localhost:5173"));

  const productionBaseline = parseDirectives(createContentSecurityPolicy());
  assert.deepEqual(productionBaseline["object-src"], ["'none'"]);
  assert.deepEqual(productionBaseline["base-uri"], ["'self'"]);
  assert.deepEqual(productionBaseline["form-action"], ["'self'", "https://*.tawk.to"]);
  assert.deepEqual(productionBaseline["frame-ancestors"], ["'none'"]);
  const productionSources = Object.values(productionBaseline).flat();
  assert.ok(!productionSources.some((source) => source.includes("unsafe-inline") || source.includes("unsafe-eval") || source.includes("localhost")));
  assert.deepEqual(
    [...new Set(productionSources.filter((source) => source.includes("*")))].sort(),
    ["https://*.tawk.to", "wss://*.tawk.to"],
  );
  assert.ok(productionBaseline["script-src"].includes("https://cdn.jsdelivr.net"));
});

test("Vite development HTML response carries the report-only CSP header", async (t) => {
  const configPath = fileURLToPath(new URL("../vite.config.js", import.meta.url));
  const vite = await createViteServer({
    configFile: configPath,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  await vite.listen();
  t.after(() => vite.close());

  const address = vite.httpServer.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-security-policy-report-only"),
    viteConfig.server.headers["Content-Security-Policy-Report-Only"],
  );
  assert.match(await response.text(), /<div id="root"><\/div>/);
});
