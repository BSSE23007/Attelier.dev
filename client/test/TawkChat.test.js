import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { StrictMode, act, createElement, Fragment, useState } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { Window } from "happy-dom";
import { createServer } from "vite";

let vite;
before(async () => {
  vite = await createServer({
    configFile: false,
    root: ".",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
});
after(async () => vite?.close());

function setGlobalValue(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  };
}

async function mountTawk(t, { initialPath = "/", api = {}, strict = true } = {}) {
  const browser = new Window({ url: "http://localhost/" });
  browser.Tawk_API = api;
  browser.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  browser.scrollTo = () => {};

  const restoreGlobals = [
    setGlobalValue("window", browser),
    setGlobalValue("document", browser.document),
    setGlobalValue("navigator", browser.navigator),
    setGlobalValue("HTMLElement", browser.HTMLElement),
    setGlobalValue("Node", browser.Node),
    setGlobalValue("Event", browser.Event),
    setGlobalValue("MouseEvent", browser.MouseEvent),
    setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true),
  ];

  const scripts = [];
  const originalAppendChild = browser.document.head.appendChild.bind(browser.document.head);
  browser.document.head.appendChild = (element) => {
    if (element.tagName === "SCRIPT" && element.src.includes("embed.tawk.to/")) {
      scripts.push(element);
      return element;
    }
    return originalAppendChild(element);
  };

  const { default: TawkChat } = await vite.ssrLoadModule("/src/TawkChat.jsx");
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const root = createRoot(container);
  let navigateTo;
  let renderCount = 0;

  function RouteHarness() {
    navigateTo = useNavigate();
    const { pathname } = useLocation();
    const [count, setCount] = useState(0);
    renderCount = count;
    return createElement(Fragment, null,
      createElement(TawkChat),
      createElement("output", { id: "current-route" }, pathname),
      createElement("output", { id: "render-count" }, String(count)),
      createElement("button", { id: "rerender", onClick: () => setCount((value) => value + 1) }, "Rerender"),
      createElement("button", { id: "go-home", onClick: () => navigateTo("/") }, "Home"),
      createElement("button", { id: "go-contact", onClick: () => navigateTo("/contact") }, "Contact"),
      createElement("button", { id: "go-admin", onClick: () => navigateTo("/admin/login") }, "Admin login"),
      createElement("button", { id: "go-inquiries", onClick: () => navigateTo("/admin/inquiries") }, "Inquiries"),
    );
  }

  const tree = createElement(MemoryRouter, { initialEntries: [initialPath] }, createElement(RouteHarness));
  await act(async () => root.render(strict ? createElement(StrictMode, null, tree) : tree));
  let mounted = true;

  async function goTo(path) {
    await act(async () => navigateTo(path));
  }

  async function rerender() {
    await act(async () => container.querySelector("#rerender").click());
  }

  t.after(async () => {
    if (mounted) await act(async () => root.unmount());
    browser.document.head.appendChild = originalAppendChild;
    await browser.happyDOM.abort();
    restoreGlobals.reverse().forEach((restore) => restore());
  });

  return {
    api,
    browser,
    container,
    goTo,
    rerender,
    root,
    scripts,
    unmount: async () => {
      if (!mounted) return;
      await act(async () => root.unmount());
      mounted = false;
    },
    get renderCount() { return renderCount; },
  };
}

test("mounts in StrictMode and rerenders without duplicating the Tawk script", async (t) => {
  const mounted = await mountTawk(t, { api: {} });
  assert.equal(mounted.scripts.length, 1);
  assert.equal(mounted.container.querySelector("#current-route").textContent, "/");

  await mounted.rerender();
  await mounted.goTo("/contact");
  assert.equal(mounted.renderCount, 1);
  assert.equal(mounted.container.querySelector("#current-route").textContent, "/contact");
  assert.equal(mounted.scripts.length, 1);
});

test("direct admin routes hide the widget and do not initialize the script", async (t) => {
  let showCount = 0;
  let hideCount = 0;
  const mounted = await mountTawk(t, {
    initialPath: "/admin/inquiries",
    api: {
      showWidget() { showCount += 1; },
      hideWidget() { hideCount += 1; },
    },
  });

  assert.equal(mounted.container.querySelector("#current-route").textContent, "/admin/inquiries");
  assert.equal(showCount, 0);
  assert.equal(hideCount, 1);
  assert.equal(mounted.scripts.length, 0);
  await mounted.goTo("/admin/security");
  await mounted.goTo("/admin");
  assert.equal(hideCount, 1);
});

test("public to admin to public navigation applies visibility without a page reload", async (t) => {
  const calls = [];
  const browser = await mountTawk(t, {
    api: {
      showWidget() { calls.push("show"); },
      hideWidget() { calls.push("hide"); },
    },
  });
  let pageUnloadCount = 0;
  browser.browser.addEventListener("beforeunload", () => { pageUnloadCount += 1; });

  await browser.goTo("/admin/login");
  assert.deepEqual(calls, ["show", "hide"]);
  assert.equal(browser.container.querySelector("#current-route").textContent, "/admin/login");
  await browser.goTo("/admin/inquiries");
  assert.equal(calls.length, 2);
  await browser.goTo("/contact");
  assert.deepEqual(calls, ["show", "hide", "show"]);
  assert.equal(pageUnloadCount, 0);
});

test("delayed loading keeps the widget hidden if the route becomes admin", async (t) => {
  const calls = [];
  const mounted = await mountTawk(t, { api: {} });
  assert.equal(mounted.scripts.length, 1);

  await mounted.goTo("/admin/login");
  mounted.browser.Tawk_API.hideWidget = () => { calls.push("hide"); };
  mounted.browser.Tawk_API.showWidget = () => { calls.push("show"); };
  mounted.scripts[0].dispatchEvent(new mounted.browser.Event("load"));
  mounted.browser.Tawk_API.onLoad();

  assert.equal(mounted.container.querySelector("#current-route").textContent, "/admin/login");
  assert.deepEqual(calls, ["hide"]);
  await mounted.goTo("/contact");
  assert.deepEqual(calls, ["hide", "show"]);
});

test("direct admin to public navigation initializes once and shows after delayed load", async (t) => {
  const calls = [];
  const mounted = await mountTawk(t, { initialPath: "/admin/login", api: {} });
  assert.equal(mounted.scripts.length, 0);

  await mounted.goTo("/contact");
  assert.equal(mounted.scripts.length, 1);
  mounted.browser.Tawk_API.showWidget = () => { calls.push("show"); };
  mounted.browser.Tawk_API.hideWidget = () => { calls.push("hide"); };
  mounted.scripts[0].dispatchEvent(new mounted.browser.Event("load"));
  assert.deepEqual(calls, ["show"]);
});

test("rapid public/admin/public navigation uses one pending script and the latest visibility", async (t) => {
  const calls = [];
  const mounted = await mountTawk(t, { api: {} });
  await mounted.goTo("/admin/login");
  await mounted.goTo("/contact");
  await mounted.goTo("/admin/inquiries");
  await mounted.goTo("/");
  assert.equal(mounted.scripts.length, 1);

  mounted.browser.Tawk_API.showWidget = () => { calls.push("show"); };
  mounted.browser.Tawk_API.hideWidget = () => { calls.push("hide"); };
  mounted.scripts[0].dispatchEvent(new mounted.browser.Event("load"));
  assert.deepEqual(calls, ["show"]);
});

test("script failure does not crash navigation and a public retry remains singleton", async (t) => {
  const calls = [];
  const mounted = await mountTawk(t, { api: {} });
  const failedScript = mounted.scripts[0];
  await mounted.goTo("/admin/login");
  failedScript.dispatchEvent(new mounted.browser.Event("error"));
  await mounted.goTo("/contact");
  assert.equal(mounted.scripts.length, 2);
  assert.equal(mounted.container.querySelector("#current-route").textContent, "/contact");

  mounted.browser.Tawk_API.showWidget = () => { calls.push("show"); };
  mounted.browser.Tawk_API.hideWidget = () => { calls.push("hide"); };
  mounted.scripts[1].dispatchEvent(new mounted.browser.Event("load"));
  assert.deepEqual(calls, ["show"]);
  failedScript.dispatchEvent(new mounted.browser.Event("load"));
  assert.deepEqual(calls, ["show"]);
});

test("unmount during loading is safe and the singleton may finish loading", async (t) => {
  const calls = [];
  const mounted = await mountTawk(t, { api: {} });
  const [script] = mounted.scripts;
  await mounted.unmount();

  mounted.browser.Tawk_API.showWidget = () => { calls.push("show"); };
  script.dispatchEvent(new mounted.browser.Event("load"));
  assert.deepEqual(calls, ["show"]);
  assert.equal(mounted.scripts.length, 1);
});

test("server rendering does not require window or document APIs", async () => {
  const { default: TawkChat } = await vite.ssrLoadModule("/src/TawkChat.jsx");
  const { renderToString } = await import("react-dom/server");
  const markup = renderToString(createElement(MemoryRouter, null, createElement(TawkChat)));
  assert.equal(markup, "");
});
