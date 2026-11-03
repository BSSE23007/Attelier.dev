import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("toast announces success and error variants and offers dismissal", async (t) => {
  const vite = await createServer({
    configFile: false,
    root: ".",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const { default: Toast } = await vite.ssrLoadModule("/src/Toast.jsx");
  const dismiss = () => {};

  const success = renderToStaticMarkup(React.createElement(Toast, {
    message: "Inquiry received.", type: "success", onDismiss: dismiss,
  }));
  assert.match(success, /role="status"/);
  assert.match(success, /Inquiry received\./);
  assert.match(success, /aria-label="Dismiss notification"/);

  const error = renderToStaticMarkup(React.createElement(Toast, {
    message: "Submission failed.", type: "error", onDismiss: dismiss,
  }));
  assert.match(error, /role="alert"/);
  assert.match(error, /Submission failed\./);
});
