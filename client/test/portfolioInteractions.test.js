import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { projects } from "../src/data/projects.js";

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

async function mount(t, Component, { path = "/", route = "/", props = {} } = {}) {
  const browser = new Window({ url: "http://localhost/" });
  browser.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const restoreGlobals = [
    setGlobalValue("window", browser), setGlobalValue("document", browser.document),
    setGlobalValue("navigator", browser.navigator), setGlobalValue("HTMLElement", browser.HTMLElement),
    setGlobalValue("Node", browser.Node), setGlobalValue("Event", browser.Event),
    setGlobalValue("MouseEvent", browser.MouseEvent), setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true),
  ];
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);
  let mounted = true;
  t.after(async () => {
    if (mounted) await act(async () => root.unmount());
    await browser.happyDOM.abort();
    restoreGlobals.reverse().forEach((restore) => restore());
  });
  const tree = createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
    createElement(Route, { path: route, element: createElement(Component, props) }),
  ));
  await act(async () => root.render(tree));
  return { browser, container };
}

test("project cards show valid previews and retain fallbacks for missing cover or video media", async () => {
  const { default: ProjectCard } = await vite.ssrLoadModule("/src/ProjectCard.jsx");
  const noMedia = { ...projects[3], previewVideo: "" };
  const noMediaMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProjectCard, { project: noMedia })));
  assert.match(noMediaMarkup, /href="\/projects\/client-motion-graphics"/);
  assert.match(noMediaMarkup, /Project preview coming soon/);
  assert.doesNotMatch(noMediaMarkup, /<video/);

  const motionMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProjectCard, { project: projects[3] })));
  assert.match(motionMarkup, /data-src="\/projects\/client-motion-graphics\/preview\.mp4"/);
  assert.match(motionMarkup, /preload="none"/);
  assert.match(motionMarkup, /Video preview available/);

  const estateMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProjectCard, { project: projects[0] })));
  assert.match(estateMarkup, /EstateCore video preview available/);
  assert.match(estateMarkup, /data-src="\/projects\/estatecore\/preview\.mp4"/);

  const awsMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProjectCard, { project: projects[2] })));
  assert.match(awsMarkup, /Towards an Automated Defense.*video preview available/);
  assert.match(awsMarkup, /data-src="\/projects\/aws-threat-detection\/preview\.mp4"/);
  assert.doesNotMatch(awsMarkup, /aws-threat-detection\/poster\.webp/);
});
test("project preview sources attach on interaction and release the previous preview", async (t) => {
  const { default: ProjectCard } = await vite.ssrLoadModule("/src/ProjectCard.jsx");
  function ProjectCardPair() {
    return createElement("div", null,
      createElement(ProjectCard, { project: projects[0] }),
      createElement(ProjectCard, { project: projects[1] }),
    );
  }

  const { browser, container } = await mount(t, ProjectCardPair);
  const mediaPrototype = browser.HTMLMediaElement.prototype;
  mediaPrototype.load = () => {};
  mediaPrototype.play = () => Promise.resolve();
  mediaPrototype.pause = () => {};

  const cards = [...container.querySelectorAll(".project-card")];
  const videos = cards.map((card) => card.querySelector("video.project-preview"));
  assert.equal(videos.length, 2);
  assert.ok(videos.every((video) => video.getAttribute("preload") === "none"));
  assert.ok(videos.every((video) => !video.querySelector("source").hasAttribute("src")));

  await act(async () => cards[0].querySelector(".project-preview-toggle").click());
  assert.equal(videos[0].querySelector("source").getAttribute("src"), projects[0].previewVideo);

  await act(async () => cards[1].querySelector(".project-preview-toggle").click());
  assert.equal(videos[0].querySelector("source").hasAttribute("src"), false);
  assert.equal(videos[1].querySelector("source").getAttribute("src"), projects[1].previewVideo);
});

test("public mobile navigation restores focus when closed and supports repeated use", async (t) => {
  const { default: Navbar } = await vite.ssrLoadModule("/src/Navbar.jsx");
  const view = await mount(t, Navbar);
  const toggle = view.container.querySelector(".mobile-menu-button");
  const nav = view.container.querySelector("#primary-navigation");

  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.ok(nav.classList.contains("nav-open"));

  await act(async () => {
    view.browser.dispatchEvent(new view.browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(view.browser.document.activeElement, toggle);

  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const servicesLink = nav.querySelector('a[href="/#services"]');
  await act(async () => servicesLink.click());
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(view.browser.document.activeElement, toggle);

  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(view.browser.document.activeElement, toggle);
});

test("project detail route renders the complete case study and safe repository resource", async (t) => {
  const { default: ProjectDetailPage } = await vite.ssrLoadModule("/src/ProjectDetailPage.jsx");
  const view = await mount(t, ProjectDetailPage, { path: "/projects/hospital-management", route: "/projects/:slug" });
  assert.match(view.container.textContent, /Hospital Management System/);
  assert.match(view.container.textContent, /Patient management lifecycle/);
  assert.match(view.container.textContent, /Technology stack/);
  assert.match(view.container.textContent, /MongoDB Atlas/);
  assert.equal(view.container.querySelectorAll(".case-study-feature").length, 6);
  const repo = view.container.querySelector('a[href="https://github.com/BSSE23032/hms-mern-app"]');
  assert.ok(repo);
  assert.equal(repo.getAttribute("target"), "_blank");
  assert.equal(repo.getAttribute("rel"), "noopener noreferrer");
  const loadVideo = view.container.querySelector(".project-page-video-trigger");
  assert.ok(loadVideo);
  await act(async () => loadVideo.click());
  assert.equal(view.container.querySelector(".project-page-media video")?.getAttribute("preload"), "none");
  assert.equal(view.container.querySelector(".project-page-back")?.getAttribute("href"), "/#work");
});

test("unknown project slugs show an accessible not-found state and return link", async (t) => {
  const { default: ProjectDetailPage } = await vite.ssrLoadModule("/src/ProjectDetailPage.jsx");
  const view = await mount(t, ProjectDetailPage, { path: "/projects/not-a-project", route: "/projects/:slug" });
  assert.match(view.container.querySelector("main").textContent, /Project not found/);
  assert.equal(view.container.querySelector('main a[href="/#work"]')?.textContent.trim(), "Back to projects");
  assert.equal(view.container.querySelector(".project-case-study"), null);
});

test("detail pages preserve qualified AWS result and do not fabricate media", async (t) => {
  const { default: ProjectDetailPage } = await vite.ssrLoadModule("/src/ProjectDetailPage.jsx");
  const view = await mount(t, ProjectDetailPage, { path: "/projects/aws-threat-detection", route: "/projects/:slug" });
  assert.match(view.container.textContent, /Approximately 1.2 seconds/);
  assert.match(view.container.textContent, /not a guaranteed production benchmark/);
  assert.match(view.container.textContent, /future-scope ideas, not completed capabilities/);
  const loadVideo = view.container.querySelector(".project-page-video-trigger");
  assert.ok(loadVideo);
  await act(async () => loadVideo.click());
  assert.equal(view.container.querySelector(".project-page-media video")?.getAttribute("preload"), "none");  assert.equal(view.container.querySelector(".case-study-diagram-details img")?.getAttribute("src"), "/projects/aws-threat-detection/architecture.png");
  assert.doesNotMatch(view.container.innerHTML, /aws-threat-detection\/poster\.webp/);
});

test("EstateCore and motion graphics retain their project-specific case study content", async () => {
  const { default: ProjectDetailPage } = await vite.ssrLoadModule("/src/ProjectDetailPage.jsx");
  const renderProject = (slug) => renderToStaticMarkup(createElement(
    MemoryRouter,
    { initialEntries: [`/projects/${slug}`] },
    createElement(Routes, null, createElement(Route, { path: "/projects/:slug", element: createElement(ProjectDetailPage) })),
  ));

  const estate = renderProject("estatecore");
  assert.match(estate, /Customer and agent workflows/);
  assert.match(estate, /service-level deployment status is unconfirmed/);
  assert.match(estate, /Proposed AWS architecture/);
  assert.ok(estate.includes('src="/projects/estatecore/architecture.png"'));

  const motion = renderProject("client-motion-graphics");
  assert.match(motion, /The three-part message/);
  assert.match(motion, /Load video demonstration/);
  assert.match(motion, /Research/);
  assert.match(motion, /Analyze/);
  assert.match(motion, /Buy/);
  assert.match(motion, /Adobe After Effects/);
  assert.match(motion, /GHANI GFX/);
});
