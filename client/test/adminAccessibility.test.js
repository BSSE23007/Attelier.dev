import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Window } from "happy-dom";
import { createServer } from "vite";

let vite;

before(async () => {
  vite = await createServer({ configFile: false, root: ".", appType: "custom", server: { middlewareMode: true, hmr: false } });
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

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function mountTree(t, { path = "/", routes, fetchImpl }) {
  const browser = new Window({ url: "http://localhost/" });
  browser.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const originalFetch = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
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
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const root = createRoot(container);
  const tree = createElement(MemoryRouter, { initialEntries: [path] }, routes);
  await act(async () => root.render(tree));

  t.after(async () => {
    await act(async () => root.unmount());
    await browser.happyDOM.abort();
    globalThis.fetch = originalFetch;
    restoreGlobals.reverse().forEach((restore) => restore());
  });

  async function settle(milliseconds = 20) {
    await act(async () => new Promise((resolve) => browser.setTimeout(resolve, milliseconds)));
  }

  return { browser, container, settle };
}

async function mountPage(t, Page, { path, fetchImpl }) {
  const routes = createElement(Routes, null, createElement(Route, { path: "*", element: createElement(Page) }));
  return mountTree(t, { path, routes, fetchImpl });
}

function sampleInquiry(overrides = {}) {
  return {
    id: "inquiry-demo",
    name: "Maya Example",
    email: "maya@example.invalid",
    service: "Web Development",
    message: "A synthetic inquiry for accessibility testing.",
    status: "new",
    priority: "normal",
    firstRespondedAt: null,
    followUpAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    notes: [{ body: "PRIVATE INTERNAL NOTE MUST NOT APPEAR IN LINK NAME" }],
    activity: [],
    ...overrides,
  };
}

function luminance(hex) {
  const values = hex.replace("#", "").match(/.{2}/g).map((pair) => parseInt(pair, 16) / 255);
  const linear = values.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function composite(foreground, background, alpha) {
  const fore = foreground.slice(1).match(/.{2}/g).map((pair) => parseInt(pair, 16));
  const back = background.slice(1).match(/.{2}/g).map((pair) => parseInt(pair, 16));
  const channels = fore.map((value, index) => Math.round(value * alpha + back[index] * (1 - alpha)).toString(16).padStart(2, "0"));
  return "#" + channels.join("");
}

test("admin muted text and badges meet normal-text contrast on their dark surfaces", () => {
  const css = readFileSync("src/admin/Admin.css", "utf8");
  assert.doesNotMatch(css, /color:\s*#64748b/i);

  const correctedSelectors = [
    ".admin-side-label",
    ".admin-follow-up-card-hint",
    ".admin-panel-heading p",
    ".admin-table th",
    ".admin-table-subtext",
    ".admin-follow-up-none",
    ".admin-empty",
    ".admin-activity-list time, .admin-history-list span",
    ".admin-pagination",
    ".admin-customer-details span",
    ".admin-note span",
    ".admin-inquiry-card-meta",
  ];
  const cssRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const selector of correctedSelectors) {
    assert.ok(cssRules.some(([, ruleSelector, declarations]) =>
      ruleSelector.includes(selector) && /color:\s*#94a3b8/i.test(declarations)
    ), selector);
  }

  for (const surface of ["#080e1a", "#0b1220", "#101b2d"]) {
    assert.ok(contrastRatio("#94a3b8", surface) >= 4.5, "Muted text contrast on " + surface);
  }

  const hoveredSurface = composite("#2563eb", "#0b1220", 0.08);
  assert.ok(contrastRatio("#67e8f9", hoveredSurface) >= 4.5, "Hover hint contrast");
  const badgeColors = [
    ["#67e8f9", "#22d3ee", 0.08],
    ["#93c5fd", "#2563eb", 0.12],
    ["#6ee7b7", "#10b981", 0.08],
    ["#cbd5e1", "#64748b", 0.12],
    ["#93c5fd", "#2563eb", 0.1],
    ["#fca5a5", "#7f1d1d", 0.16],
  ];
  for (const [foreground, overlay, alpha] of badgeColors) {
    assert.ok(contrastRatio(foreground, composite(overlay, "#0b1220", alpha)) >= 4.5, "Badge text contrast for " + foreground);
  }
  assert.ok(contrastRatio("#94a3b8", "#0b1220") >= 4.5, "Disabled standard button text contrast");
  assert.ok(contrastRatio("#cbd5e1", "#1e3a8a") >= 4.5, "Disabled primary button text contrast");
  assert.match(css, /\.admin-button:disabled[^}]*opacity:\s*1/);
});

test("admin session validation exposes one polite status and announces expiry with its return path", async (t) => {
  const { AdminGuard, AdminLoginPage } = await vite.ssrLoadModule("/src/admin/AdminPages.jsx");
  let resolveFetch;
  const pendingResponse = new Promise((resolve) => { resolveFetch = resolve; });

  function LoginProbe() {
    const location = useLocation();
    return createElement("div", {
      "data-login-from": location.state?.from || "",
      "data-login-message": location.state?.message || "",
    }, createElement(AdminLoginPage));
  }

  const routes = createElement(Routes, null,
    createElement(Route, { path: "/admin", element: createElement(AdminGuard) },
      createElement(Route, { path: "*", element: createElement("div", null, "Protected inquiry page") }),
    ),
    createElement(Route, { path: "/admin/login", element: createElement(LoginProbe) }),
  );
  const view = await mountTree(t, {
    path: "/admin/inquiries/inquiry-demo",
    routes,
    fetchImpl: () => pendingResponse,
  });

  await view.settle();
  const loading = view.container.querySelector('.admin-gate[aria-busy="true"] [role="status"]');
  assert.ok(loading);
  assert.equal(loading.getAttribute("aria-live"), "polite");
  assert.equal(view.container.querySelector(".admin-gate").getAttribute("aria-busy"), "true");
  assert.equal(loading.textContent, "Checking administrator session");

  await act(async () => resolveFetch(jsonResponse(200, {
    success: true,
    admin: { email: "accessibility-test@example.invalid" },
    expiresAt: new Date(Date.now() + 70).toISOString(),
  })));
  await view.settle(140);

  const login = view.container.querySelector("[data-login-message]");
  assert.ok(login);
  assert.equal(login.getAttribute("data-login-from"), "/admin/inquiries/inquiry-demo");
  assert.equal(login.getAttribute("data-login-message"), "Your session has expired. Please sign in again.");
  assert.equal(view.container.querySelector(".admin-success-message")?.getAttribute("role"), "status");
});

test("ordinary admin logout does not show a session-expired message", async (t) => {
  const { AdminLayout, AdminLoginPage } = await vite.ssrLoadModule("/src/admin/AdminPages.jsx");
  function AdminContext() {
    return createElement(Outlet, { context: { email: "accessibility-test@example.invalid" } });
  }
  function LoginProbe() {
    const location = useLocation();
    return createElement("div", { "data-login-message": location.state?.message || "" }, createElement(AdminLoginPage));
  }

  const routes = createElement(Routes, null,
    createElement(Route, { path: "/admin", element: createElement(AdminContext) },
      createElement(Route, { element: createElement(AdminLayout) },
        createElement(Route, { index: true, element: createElement("p", null, "Dashboard") }),
      ),
    ),
    createElement(Route, { path: "/admin/login", element: createElement(LoginProbe) }),
  );
  const view = await mountTree(t, {
    path: "/admin",
    routes,
    fetchImpl: async () => jsonResponse(200, { success: true }),
  });

  await act(async () => view.container.querySelector(".admin-logout").click());
  await view.settle();
  assert.ok(view.container.querySelector("[data-login-message]"));
  assert.equal(view.container.querySelector("[data-login-message]").getAttribute("data-login-message"), "");
  assert.equal(view.container.querySelector(".admin-success-message"), null);
});

test("dashboard loading rows expose polite status regions and clear when loading finishes", async (t) => {
  const { AdminOverviewPage } = await vite.ssrLoadModule("/src/admin/AdminPages.jsx");
  let resolveFetch;
  const pendingResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const view = await mountPage(t, AdminOverviewPage, { path: "/admin", fetchImpl: () => pendingResponse });

  await view.settle();
  const statuses = [...view.container.querySelectorAll(".admin-loading-rows[role='status']")];
  assert.equal(statuses.length, 2);
  assert.deepEqual(statuses.map((node) => node.querySelector(".admin-sr-only").textContent), [
    "Loading recent inquiries",
    "Loading recent activity",
  ]);
  assert.ok(statuses.every((node) => node.getAttribute("aria-live") === "polite"));
  assert.ok(statuses.every((node) => node.getAttribute("aria-busy") === "true"));
  assert.ok(statuses.every((node) => node.querySelectorAll("span[aria-hidden='true']").length === 3));
  assert.equal(view.container.querySelector(".admin-stat-grid").getAttribute("aria-busy"), "true");

  await act(async () => resolveFetch(jsonResponse(200, {
    success: true,
    data: {
      counts: { total: 1, new: 1, inProgress: 0, completed: 0 },
      followUps: { dueToday: 0, overdue: 0, upcoming: 0 },
      leadTracking: { highPriority: 0, awaitingFirstResponse: 1, firstResponseRecorded: 0 },
      recent: [],
      activity: [],
    },
  })));
  await view.settle();
  assert.equal(view.container.querySelector(".admin-loading-rows"), null);
  assert.equal(view.container.querySelector(".admin-stat-grid").getAttribute("aria-busy"), "false");
});

test("inquiry list loading status clears after results arrive", async (t) => {
  const { AdminInquiryListPage } = await vite.ssrLoadModule("/src/admin/AdminPages.jsx");
  let resolveFetch;
  const pendingResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const view = await mountPage(t, AdminInquiryListPage, {
    path: "/admin/inquiries",
    fetchImpl: () => pendingResponse,
  });

  await view.settle();
  const status = view.container.querySelector(".admin-loading-rows[role='status']");
  assert.ok(status);
  assert.equal(status.getAttribute("aria-live"), "polite");
  assert.equal(status.getAttribute("aria-busy"), "true");
  assert.equal(status.querySelector(".admin-sr-only").textContent, "Loading inquiries");

  await act(async () => resolveFetch(jsonResponse(200, {
    success: true,
    data: [],
    pagination: { total: 0, totalPages: 0 },
  })));
  await view.settle();
  assert.equal(view.container.querySelector(".admin-loading-rows"), null);
  assert.equal(view.container.querySelector(".admin-inquiry-panel").getAttribute("aria-busy"), "false");
});

test("mobile inquiry links announce customer details without including private notes", async (t) => {
  const { AdminInquiryListPage } = await vite.ssrLoadModule("/src/admin/AdminPages.jsx");
  const view = await mountPage(t, AdminInquiryListPage, {
    path: "/admin/inquiries",
    fetchImpl: async () => jsonResponse(200, {
      success: true,
      data: [sampleInquiry()],
      pagination: { total: 1, totalPages: 1 },
    }),
  });
  await view.settle(30);

  const link = view.container.querySelector(".admin-inquiry-card");
  assert.ok(link);
  const accessibleName = link.getAttribute("aria-label");
  assert.match(accessibleName, /Maya Example/);
  assert.match(accessibleName, /New status/);
  assert.match(accessibleName, /Web Development/);
  assert.match(accessibleName, /May 1, 2026/);
  assert.match(accessibleName, /Awaiting first response/);
  assert.doesNotMatch(accessibleName, /PRIVATE INTERNAL NOTE|maya@example\.invalid/);
  assert.equal(link.getAttribute("href"), "/admin/inquiries/inquiry-demo");
});

test("admin mobile navigation controls meet the 44-pixel target size and reduced motion remains respected", () => {
  const css = readFileSync("src/admin/Admin.css", "utf8");
  const publicCss = readFileSync("src/App.css", "utf8");
  assert.match(css, /\.admin-menu-toggle \{ width: 44px; height: 44px; \}/);
  assert.match(css, /\.admin-pagination \.admin-icon-button \{ width: 44px; height: 44px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(publicCss, /@media \(prefers-reduced-motion: reduce\)/);
});
