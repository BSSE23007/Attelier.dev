import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

async function mountAdminPage(t, { page, path, fetchImpl }) {
  const browser = new Window({ url: "http://localhost/" });
  browser.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  browser.scrollTo = () => {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
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
  const { [page]: Page } = await vite.ssrLoadModule("/src/admin/AdminPages.jsx");
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const root = createRoot(container);
  const tree = createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
    createElement(Route, { path: "/admin", element: createElement(Page) }),
    createElement(Route, { path: "/admin/inquiries", element: createElement(Page) }),
    createElement(Route, { path: "/admin/inquiries/:id", element: createElement(Page) }),
  ));
  await act(async () => root.render(tree));

  async function settle() {
    await act(async () => new Promise((resolve) => browser.setTimeout(resolve, 20)));
  }
  async function click(selector) {
    await act(async () => container.querySelector(selector).click());
    await settle();
  }
  async function setValue(element, value) {
    await act(async () => {
      const descriptor = element.tagName === "SELECT"
        ? Object.getOwnPropertyDescriptor(browser.HTMLSelectElement.prototype, "value")
        : Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value");
      descriptor.set.call(element, value);
      element.dispatchEvent(new browser.Event("input", { bubbles: true }));
      element.dispatchEvent(new browser.Event("change", { bubbles: true }));
    });
  }

  t.after(async () => {
    await act(async () => root.unmount());
    await browser.happyDOM.abort();
    globalThis.fetch = originalFetch;
    restoreGlobals.reverse().forEach((restore) => restore());
  });
  await settle();
  return { browser, container, click, setValue, settle };
}

const initialInquiry = () => ({
  id: "inquiry-1", name: "Test Client", email: "test@example.invalid", service: "Other",
  message: "A test inquiry message.", status: "new", priority: "normal", firstRespondedAt: null, followUpAt: null,
  createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z", notes: [], activity: [],
});

test("inquiry details show multiple duplicate matches with dates, statuses, links, and existing controls", async (t) => {
  const inquiry = {
    ...initialInquiry(),
    possibleDuplicates: [
      { id: "prior-1", createdAt: "2026-04-30T12:00:00.000Z", status: "in-progress" },
      { id: "prior-2", createdAt: "2026-04-29T12:00:00.000Z", status: "completed" },
    ],
  };
  const mounted = await mountAdminPage(t, {
    page: "AdminInquiryDetailsPage",
    path: "/admin/inquiries/inquiry-1",
    fetchImpl: async () => jsonResponse(200, { success: true, data: inquiry }),
  });

  const warning = mounted.container.querySelector(".admin-duplicate-warning");
  assert.ok(warning);
  assert.match(warning.textContent, /Possible Duplicate/);
  assert.match(warning.textContent, /Apr 30, 2026|Apr 29, 2026/);
  assert.match(warning.textContent, /in-progress/);
  assert.match(warning.textContent, /completed/);
  assert.equal(warning.querySelectorAll("a").length, 2);
  assert.equal(warning.querySelector("a[href='/admin/inquiries/prior-1']") !== null, true);
  assert.equal(warning.querySelector("a[href='/admin/inquiries/prior-2']") !== null, true);
  assert.ok(mounted.container.querySelector("#inquiry-status"));
  assert.ok(mounted.container.querySelector("#inquiry-follow-up-date"));
  assert.ok(mounted.container.querySelector("#new-note"));
});

test("inquiry details omit the duplicate warning when there are no matches", async (t) => {
  const mounted = await mountAdminPage(t, {
    page: "AdminInquiryDetailsPage",
    path: "/admin/inquiries/inquiry-1",
    fetchImpl: async () => jsonResponse(200, { success: true, data: { ...initialInquiry(), possibleDuplicates: [] } }),
  });
  assert.equal(mounted.container.querySelector(".admin-duplicate-warning"), null);
});

test("follow-up dates preserve calendar days and format for the local timezone", async () => {
  const { localCalendarDate, followUpDateInputValue, formatFollowUpDate, followUpDateState } = await vite.ssrLoadModule("/src/admin/followUpDates.js");
  assert.equal(localCalendarDate(new Date(2026, 4, 5, 23, 30)), "2026-05-05");
  assert.equal(followUpDateInputValue("2026-05-05T00:00:00.000Z"), "2026-05-05");
  assert.ok(formatFollowUpDate("2026-05-05T00:00:00.000Z").length > 0);
  assert.equal(followUpDateState("2026-05-04T00:00:00.000Z", "2026-05-05"), "overdue");
  assert.equal(followUpDateState("2026-05-05T00:00:00.000Z", "2026-05-05"), "due-today");
  assert.equal(followUpDateState("2026-05-06T00:00:00.000Z", "2026-05-05"), "upcoming");
});

test("admin API sends follow-up mutations and local dashboard date", async (t) => {
  const { adminApi } = await vite.ssrLoadModule("/src/admin/adminApi.js");
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse(200, { success: true, data: { followUpAt: "2026-05-05T00:00:00.000Z" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await adminApi.updateFollowUp("inquiry/1", "2026-05-05");
  await adminApi.updateFollowUp("inquiry-1", null);
  await adminApi.overview({ today: "2026-05-05" });
  assert.equal(requests[0].url, "http://localhost:5000/api/admin/inquiries/inquiry%2F1/follow-up");
  assert.deepEqual(JSON.parse(requests[0].options.body), { followUpAt: "2026-05-05" });
  assert.deepEqual(JSON.parse(requests[1].options.body), { followUpAt: null });
  assert.equal(requests[2].url, "http://localhost:5000/api/admin/overview?today=2026-05-05");
});

test("admin can schedule, update, and clear a follow-up with saving state and refreshed details", async (t) => {
  const inquiry = initialInquiry();
  const mutations = [];
  let delayedResolve;
  const fetchImpl = async (url, options = {}) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith("/follow-up")) {
      const body = JSON.parse(options.body);
      mutations.push(body.followUpAt);
      if (mutations.length === 1) {
        return new Promise((resolve) => { delayedResolve = () => {
          inquiry.followUpAt = "2026-06-02T00:00:00.000Z";
          resolve(jsonResponse(200, { success: true, data: { id: inquiry.id, followUpAt: inquiry.followUpAt } }));
        }; });
      }
      inquiry.followUpAt = body.followUpAt ? `${body.followUpAt}T00:00:00.000Z` : null;
      return jsonResponse(200, { success: true, data: { id: inquiry.id, followUpAt: inquiry.followUpAt } });
    }
    return jsonResponse(200, { success: true, data: { ...inquiry } });
  };
  const mounted = await mountAdminPage(t, { page: "AdminInquiryDetailsPage", path: "/admin/inquiries/inquiry-1", fetchImpl });

  const dateInput = mounted.container.querySelector("#inquiry-follow-up-date");
  await mounted.setValue(dateInput, "2026-06-02");
  await mounted.click(".admin-follow-up-controls .admin-button-primary");
  assert.match(mounted.container.textContent, /Saving…/);
  assert.equal(mounted.container.querySelector(".admin-follow-up-controls .admin-button-primary").disabled, true);
  await act(async () => delayedResolve());
  await mounted.settle();
  assert.match(mounted.container.textContent, /Jun 2, 2026|June 2, 2026/);

  await mounted.setValue(mounted.container.querySelector("#inquiry-follow-up-date"), "2026-06-08");
  await mounted.click(".admin-follow-up-controls .admin-button-primary");
  assert.deepEqual(mutations, ["2026-06-02", "2026-06-08"]);
  assert.equal(mounted.container.querySelector("#inquiry-follow-up-date").value, "2026-06-08");

  await mounted.click(".admin-follow-up-controls .admin-button-quiet");
  assert.equal(mutations[2], null);
  assert.match(mounted.container.textContent, /No follow-up scheduled/);
});

test("follow-up API validation errors are shown in the detail page", async (t) => {
  const inquiry = initialInquiry();
  const fetchImpl = async (url) => new URL(url).pathname.endsWith("/follow-up")
    ? jsonResponse(400, { success: false, message: "Enter a valid follow-up date." })
    : jsonResponse(200, { success: true, data: inquiry });
  const mounted = await mountAdminPage(t, { page: "AdminInquiryDetailsPage", path: "/admin/inquiries/inquiry-1", fetchImpl });
  await mounted.setValue(mounted.container.querySelector("#inquiry-follow-up-date"), "2026-06-02");
  await mounted.click(".admin-follow-up-controls .admin-button-primary");
  assert.match(mounted.container.querySelector('[role="alert"]').textContent, /valid follow-up date/);
});

test("completed status refresh reflects server-side follow-up clearing", async (t) => {
  const inquiry = { ...initialInquiry(), followUpAt: "2026-06-02T00:00:00.000Z" };
  const fetchImpl = async (url, options = {}) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith("/status")) {
      inquiry.status = JSON.parse(options.body).status;
      if (inquiry.status === "completed") inquiry.followUpAt = null;
      return jsonResponse(200, { success: true, data: { status: inquiry.status, followUpAt: inquiry.followUpAt } });
    }
    return jsonResponse(200, { success: true, data: { ...inquiry } });
  };
  const mounted = await mountAdminPage(t, { page: "AdminInquiryDetailsPage", path: "/admin/inquiries/inquiry-1", fetchImpl });
  const statusSelect = mounted.container.querySelector("#inquiry-status");
  await mounted.setValue(statusSelect, "completed");
  await mounted.click(".admin-status-editor .admin-button");
  assert.equal(inquiry.followUpAt, null);
  assert.equal(mounted.container.querySelector("#inquiry-follow-up-date"), null);
  assert.match(mounted.container.textContent, /No follow-up scheduled/);
  assert.match(mounted.container.textContent, /Reopen this inquiry/);
});

test("dashboard shows follow-up counts with links to filtered inquiry lists", async (t) => {
  let requestUrl;
  const fetchImpl = async (url) => {
    requestUrl = url;
    return jsonResponse(200, { success: true, data: {
      counts: { total: 3, new: 1, inProgress: 1, completed: 1 },
      followUps: { dueToday: 2, overdue: 1, upcoming: 4 }, recent: [], activity: [],
    } });
  };
  const mounted = await mountAdminPage(t, { page: "AdminOverviewPage", path: "/admin", fetchImpl });
  assert.equal(new URL(requestUrl).searchParams.get("today") !== null, true);
  assert.match(mounted.container.querySelector(".admin-follow-up-grid").textContent, /Due today2View inquiries Overdue1View inquiries Upcoming4/);
  assert.equal(mounted.container.querySelector("a[href='/admin/inquiries?followUp=overdue']") !== null, true);
});

test("inquiry follow-up filter reads dashboard link and sends the selected filter to the API", async (t) => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return jsonResponse(200, { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  };
  const mounted = await mountAdminPage(t, { page: "AdminInquiryListPage", path: "/admin/inquiries?followUp=overdue", fetchImpl });
  assert.equal(new URL(requests[0]).searchParams.get("followUp"), "overdue");
  assert.ok(new URL(requests[0]).searchParams.get("today"));
  const followUpSelect = [...mounted.container.querySelectorAll("label")].find((label) => label.textContent.startsWith("Follow-up"))?.querySelector("select");
  await mounted.setValue(followUpSelect, "none");
  await mounted.settle();
  const latest = new URL(requests.at(-1));
  assert.equal(latest.searchParams.get("followUp"), "none");
  assert.equal(latest.searchParams.has("today"), false);
});

test("inquiry details update priority and mark the first response without overwriting it", async (t) => {
  const inquiry = initialInquiry();
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (options.method && options.method !== "GET") {
      const body = JSON.parse(options.body);
      requests.push({ path: parsed.pathname, method: options.method, body });
      if (parsed.pathname.endsWith("/priority")) inquiry.priority = body.priority;
      if (parsed.pathname.endsWith("/first-response") && !inquiry.firstRespondedAt) {
        inquiry.firstRespondedAt = "2026-05-06T10:00:00.000Z";
      }
      return jsonResponse(200, { success: true, data: {
        id: inquiry.id,
        priority: inquiry.priority,
        firstRespondedAt: inquiry.firstRespondedAt,
        updatedAt: "2026-05-06T10:00:00.000Z",
      } });
    }
    return jsonResponse(200, { success: true, data: { ...inquiry } });
  };
  const mounted = await mountAdminPage(t, { page: "AdminInquiryDetailsPage", path: "/admin/inquiries/inquiry-1", fetchImpl });

  assert.match(mounted.container.textContent, /Current priorityNormal/);
  assert.match(mounted.container.textContent, /Awaiting first response/);
  await mounted.setValue(mounted.container.querySelector("#inquiry-priority"), "high");
  await mounted.click(".admin-priority-editor .admin-button-primary");
  assert.equal(requests[0].path, "/api/admin/inquiries/inquiry-1/priority");
  assert.deepEqual(requests[0].body, { priority: "high" });
  assert.equal(mounted.container.querySelector("#inquiry-priority").value, "high");

  await mounted.click(".admin-response-editor button");
  assert.equal(requests[1].path, "/api/admin/inquiries/inquiry-1/first-response");
  assert.equal(requests[1].method, "POST");
  assert.deepEqual(requests[1].body, {});
  assert.match(mounted.container.textContent, /Response recorded/);
  assert.match(mounted.container.querySelector(".admin-response-editor").textContent, /May 6, 2026|May 6, 2026/);
  assert.equal(mounted.container.querySelector(".admin-response-editor button").disabled, true);
  assert.equal(requests.filter((request) => request.path.endsWith("/first-response")).length, 1);
});

test("priority update loading and safe API error states are visible", async (t) => {
  const inquiry = initialInquiry();
  let resolvePriority;
  let failPriority = false;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/priority")) {
      if (failPriority) return jsonResponse(400, { success: false, message: "Invalid inquiry priority." });
      return new Promise((resolve) => { resolvePriority = () => {
        inquiry.priority = JSON.parse(options.body).priority;
        resolve(jsonResponse(200, { success: true, data: { priority: inquiry.priority } }));
      }; });
    }
    return jsonResponse(200, { success: true, data: { ...inquiry } });
  };
  const mounted = await mountAdminPage(t, { page: "AdminInquiryDetailsPage", path: "/admin/inquiries/inquiry-1", fetchImpl });
  await mounted.setValue(mounted.container.querySelector("#inquiry-priority"), "low");
  await mounted.click(".admin-priority-editor .admin-button-primary");
  const saving = mounted.container.querySelector(".admin-priority-editor .admin-button-primary");
  assert.equal(saving.disabled, true);
  assert.match(saving.textContent, /Saving/);
  await act(async () => resolvePriority());
  await mounted.settle();

  failPriority = true;
  await mounted.setValue(mounted.container.querySelector("#inquiry-priority"), "high");
  await mounted.click(".admin-priority-editor .admin-button-primary");
  assert.match(mounted.container.querySelector('[role="alert"]').textContent, /Invalid inquiry priority/);
});

test("priority and response filters send backend query parameters", async (t) => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return jsonResponse(200, { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  };
  const mounted = await mountAdminPage(t, { page: "AdminInquiryListPage", path: "/admin/inquiries", fetchImpl });
  const labelSelect = (prefix) => [...mounted.container.querySelectorAll("label")]
    .find((label) => label.textContent.startsWith(prefix))?.querySelector("select");
  await mounted.setValue(labelSelect("Priority"), "high");
  await mounted.settle();
  assert.equal(new URL(requests.at(-1)).searchParams.get("priority"), "high");
  await mounted.setValue(labelSelect("First response"), "responded");
  await mounted.settle();
  const params = new URL(requests.at(-1)).searchParams;
  assert.equal(params.get("priority"), "high");
  assert.equal(params.get("response"), "responded");
});

test("inquiry list displays priority and first-response indicators", async (t) => {
  const inquiry = { ...initialInquiry(), priority: "high", firstRespondedAt: null };
  const fetchImpl = async () => jsonResponse(200, {
    success: true,
    data: [inquiry],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  });
  const mounted = await mountAdminPage(t, { page: "AdminInquiryListPage", path: "/admin/inquiries", fetchImpl });
  assert.ok(mounted.container.querySelector(".admin-priority-high"));
  assert.ok(mounted.container.querySelector(".admin-response-awaiting"));
  assert.match(mounted.container.textContent, /High/);
  assert.match(mounted.container.textContent, /Awaiting response/);
});

test("dashboard lead tracking counts render links to priority and response filters", async (t) => {
  const fetchImpl = async () => jsonResponse(200, { success: true, data: {
    counts: { total: 5, new: 2, inProgress: 1, completed: 2 },
    followUps: { dueToday: 1, overdue: 0, upcoming: 2 },
    leadTracking: { highPriority: 3, awaitingFirstResponse: 4, firstResponseRecorded: 1 },
    recent: [], activity: [],
  } });
  const mounted = await mountAdminPage(t, { page: "AdminOverviewPage", path: "/admin", fetchImpl });
  const cards = mounted.container.querySelectorAll(".admin-lead-card");
  assert.equal(cards.length, 3);
  assert.match(cards[0].textContent, /High priority3/);
  assert.match(cards[1].textContent, /Awaiting first response4/);
  assert.match(cards[2].textContent, /First response recorded1/);
  assert.equal(cards[0].getAttribute("href"), "/admin/inquiries?priority=high");
  assert.equal(cards[1].getAttribute("href"), "/admin/inquiries?response=awaiting");
  assert.equal(cards[2].getAttribute("href"), "/admin/inquiries?response=responded");
});
