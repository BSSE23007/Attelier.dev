import test from "node:test";
import assert from "node:assert/strict";
import { initializeTawk, isAdminPath, setTawkVisibility, syncTawkRoute, TAWK_SCRIPT_ID, TAWK_WIDGET_URL } from "../src/tawkService.js";

function createBrowser(t, api = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const scripts = [];

  const documentRef = {
    head: {
      appendChild(script) {
        script.parentNode = this;
        scripts.push(script);
        return script;
      },
    },
    createElement(tagName) {
      assert.equal(tagName, "script");
      const handlers = new Map();
      return {
        attributes: {},
        addEventListener(name, callback) {
          handlers.set(name, callback);
        },
        removeEventListener(name) {
          handlers.delete(name);
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        getAttribute(name) {
          return this.attributes[name] || null;
        },
        dispatch(name) {
          handlers.get(name)?.();
        },
        remove() {
          scripts.splice(scripts.indexOf(this), 1);
        },
      };
    },
    getElementById(id) {
      return scripts.find((script) => script.id === id) || null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, "script[src]");
      return scripts;
    },
  };
  const windowRef = { Tawk_API: api };
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentRef });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });

  return { windowRef, documentRef, scripts };
}

test("loads the configured script once across repeated initialization", async (t) => {
  const { scripts } = createBrowser(t);
  setTawkVisibility(true);

  const firstLoad = initializeTawk();
  const secondLoad = initializeTawk();
  assert.equal(firstLoad, secondLoad);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].id, TAWK_SCRIPT_ID);
  assert.equal(scripts[0].src, TAWK_WIDGET_URL);
  assert.equal(scripts[0].async, true);
  assert.equal(scripts[0].charset, "UTF-8");
  assert.equal(scripts[0].attributes.crossorigin, "*");

  scripts[0].dispatch("load");
  assert.equal(await firstLoad, true);
  assert.equal(await initializeTawk(), true);
  assert.equal(scripts.length, 1);
});

test("reuses an existing Tawk API without adding a second script", async (t) => {
  let showCount = 0;
  let hideCount = 0;
  const { scripts } = createBrowser(t, {
    showWidget() { showCount += 1; },
    hideWidget() { hideCount += 1; },
  });
  setTawkVisibility(false);

  assert.equal(await initializeTawk(), true);
  assert.equal(hideCount, 1);
  assert.equal(showCount, 0);
  assert.equal(scripts.length, 0);
});

test("detects and reuses an existing Tawk script element", async (t) => {
  let hideCount = 0;
  const { windowRef, documentRef, scripts } = createBrowser(t);
  const existingScript = documentRef.createElement("script");
  existingScript.src = TAWK_WIDGET_URL;
  documentRef.head.appendChild(existingScript);
  setTawkVisibility(false);

  assert.equal(await initializeTawk(), true);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0], existingScript);
  windowRef.Tawk_API.hideWidget = () => { hideCount += 1; };
  windowRef.Tawk_API.onLoad();
  assert.equal(hideCount, 1);
});

test("does not automatically maximize or pop out the conversation", async (t) => {
  let maximizeCount = 0;
  let popupCount = 0;
  createBrowser(t, {
    showWidget() {},
    hideWidget() {},
    maximize() { maximizeCount += 1; },
    popup() { popupCount += 1; },
  });

  await syncTawkRoute("/");
  await syncTawkRoute("/contact");
  assert.equal(maximizeCount, 0);
  assert.equal(popupCount, 0);
});

test("public and admin route changes show or hide the same widget", async (t) => {
  let showCount = 0;
  let hideCount = 0;
  createBrowser(t, {
    showWidget() { showCount += 1; },
    hideWidget() { hideCount += 1; },
  });

  for (const path of ["/", "/contact", "/unknown-public-page", "/administrator"]) {
    assert.equal(isAdminPath(path), false);
    await syncTawkRoute(path);
  }
  for (const path of ["/admin/login", "/admin", "/admin/inquiries", "/admin/inquiries/123", "/admin/security", "/ADMIN/security"]) {
    assert.equal(isAdminPath(path), true);
    await syncTawkRoute(path);
  }
  await syncTawkRoute("/contact");

  assert.equal(showCount, 2);
  assert.equal(hideCount, 1);
});

test("applies the latest route visibility after asynchronous Tawk loading", async (t) => {
  let originalLoadCount = 0;
  let showCount = 0;
  let hideCount = 0;
  const { windowRef, scripts } = createBrowser(t, {
    onLoad() { originalLoadCount += 1; },
  });

  const loading = syncTawkRoute("/");
  await syncTawkRoute("/admin/security");
  assert.equal(scripts.length, 1);
  scripts[0].dispatch("load");

  windowRef.Tawk_API.showWidget = () => { showCount += 1; };
  windowRef.Tawk_API.hideWidget = () => { hideCount += 1; };
  windowRef.Tawk_API.onLoad();
  assert.equal(await loading, true);
  assert.equal(originalLoadCount, 1);
  assert.equal(hideCount, 1);
  assert.equal(showCount, 0);

  setTawkVisibility(true);
  assert.equal(showCount, 1);
});

test("handles script errors without throwing and can retry on a later public route", async (t) => {
  const { scripts } = createBrowser(t);
  const firstLoad = initializeTawk();
  scripts[0].dispatch("error");
  assert.equal(await firstLoad, false);
  assert.equal(scripts.length, 0);

  const retry = initializeTawk();
  assert.equal(scripts.length, 1);
  scripts[0].dispatch("load");
  assert.equal(await retry, true);
});

test("supports repeated failed attempts and one later successful retry without accumulating scripts", async (t) => {
  const { scripts } = createBrowser(t);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loading = initializeTawk();
    assert.equal(scripts.length, 1);
    scripts[0].dispatch("error");
    assert.equal(await loading, false);
    assert.equal(scripts.length, 0);
  }

  const successfulRetry = initializeTawk();
  assert.equal(scripts.length, 1);
  scripts[0].dispatch("load");
  assert.equal(await successfulRetry, true);
  assert.equal(scripts.length, 1);
});

test("a direct admin route never injects the external script", async (t) => {
  const { scripts } = createBrowser(t);
  assert.equal(await syncTawkRoute("/admin/login"), false);
  assert.equal(await syncTawkRoute("/admin/inquiries/42"), false);
  assert.equal(scripts.length, 0);
});

test("visibility integration does not send visitor, inquiry, or authentication data", async (t) => {
  let attributeCalls = 0;
  const { windowRef } = createBrowser(t, {
    showWidget() {},
    hideWidget() {},
    setAttributes() { attributeCalls += 1; },
  });
  await syncTawkRoute("/contact");
  await syncTawkRoute("/admin/inquiries/123");
  assert.equal(attributeCalls, 0);
  assert.equal("visitor" in windowRef.Tawk_API, false);
  assert.equal("authToken" in windowRef.Tawk_API, false);
});
