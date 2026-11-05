import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { getPublishedProjects, projects } from "../src/data/projects.js";

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

test("exports all three projects with stable IDs and their original content", () => {
  assert.deepEqual(projects.map(({ id }) => id), [
    "estatecore",
    "hospital-management",
    "aws-threat-detection",
    "client-motion-graphics",
  ]);
  assert.deepEqual(projects.map(({ title }) => title), [
    "EstateCore",
    "Hospital Management System",
    "Towards an Automated Defense: A Novel Framework for Log-Based Threat Detection and IP Remediation in AWS",
    "Client Promotional Motion Graphics & Video Design",
  ]);
  assert.deepEqual(projects.map(({ description }) => description), [
    "A cloud-based real estate platform concept for customer and agent workflows and listing management.",
    "A MERN application for role-based patient management by administrators and doctors.",
    "An event-driven AWS security framework that detects suspicious ALB requests and automates IP remediation.",
    "A roughly 20-second client promotional video designed and animated independently by Ali Sher Afzal.",
  ]);
  assert.deepEqual(projects.map(({ technologies }) => technologies), [
    ["React", "Node.js", "MongoDB", "AWS"],
    ["MongoDB Atlas", "Express", "React", "Node.js", "JWT", "bcryptjs", "Bootstrap"],
    ["AWS", "Python", "Boto3", "EC2", "VPC", "Internet Gateway", "Application Load Balancer", "Lambda", "S3", "EventBridge", "DynamoDB", "DynamoDB Streams", "Security Groups", "Network ACLs", "CloudWatch", "IAM", "Terraform", "Regular Expressions"],
    ["Adobe After Effects", "Adobe Premiere Pro", "Adobe Photoshop"],
  ]);
});

test("keeps current categories, filters, order, published state, and valid media paths", () => {
  assert.deepEqual(projects.map(({ category, filter }) => ({ category, filter })), [
    { category: "Web Development", filter: "web" },
    { category: "Web Development", filter: "web" },
    { category: "Cloud Security / DevSecOps", filter: "cloud" },
    { category: "Motion Graphics", filter: "motion" },
  ]);
  assert.ok(projects.every((project) => project.published));
  assert.deepEqual(projects.filter(({ featured }) => featured).map(({ id }) => id), ["estatecore"]);
  assert.deepEqual(projects.map(({ coverImage, architectureImage, gallery, previewVideo, poster, youtubeUrl, liveUrl }) => ({
    coverImage, architectureImage, gallery, previewVideo, poster, youtubeUrl, liveUrl,
  })), [
    { coverImage: "", architectureImage: "/projects/estatecore/architecture.png", gallery: [], previewVideo: "/projects/estatecore/preview.mp4", poster: "", youtubeUrl: "", liveUrl: "" },
    { coverImage: "", architectureImage: "", gallery: [], previewVideo: "/projects/hospital-management/preview.mp4", poster: "", youtubeUrl: "", liveUrl: "" },
    { coverImage: "", architectureImage: "/projects/aws-threat-detection/architecture.png", gallery: [], previewVideo: "/projects/aws-threat-detection/preview.mp4", poster: "", youtubeUrl: "", liveUrl: "" },
    { coverImage: "", architectureImage: "", gallery: [], previewVideo: "/projects/client-motion-graphics/preview.mp4", poster: "", youtubeUrl: "", liveUrl: "" },
  ]);
  for (const project of projects) {
    for (const asset of [project.coverImage, project.architectureImage, project.previewVideo, project.poster].filter(Boolean)) {
      assert.ok(existsSync(new URL(`../public${asset}`, import.meta.url)), `${project.id} media must exist: ${asset}`);
    }
  }  assert.deepEqual(getPublishedProjects([...projects, { ...projects[0], id: "draft", published: false }]), projects);

  assert.equal(projects[1].caseStudy.metadata[0].value, "Ali Sher Afzal and Ali Hasnain");
  assert.equal(projects[1].caseStudy.resources[0].href, "https://github.com/BSSE23032/hms-mern-app");
  assert.doesNotMatch(JSON.stringify(projects[1]), /appointment scheduling|medical reports/i);
  assert.match(JSON.stringify(projects[2]), /Approximately 1.2 seconds/);
  assert.match(JSON.stringify(projects[2]), /future-scope ideas, not completed capabilities/);
  assert.equal(projects[3].caseStudy.metadata.find(({ label }) => label === "Client branding").value, "GHANI GFX");
});

test("RecentProjects renders imported projects, keeps the placeholder, and filters them", async (t) => {
  const browser = new Window({ url: "http://localhost/" });
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

  const { default: RecentProjects } = await vite.ssrLoadModule("/src/RecentProjects.jsx");
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const root = createRoot(container);
  let mounted = true;
  t.after(async () => {
    if (mounted) await act(async () => root.unmount());
    await browser.happyDOM.abort();
    restoreGlobals.reverse().forEach((restore) => restore());
  });
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(RecentProjects))));

  assert.deepEqual(
    [...container.querySelectorAll(".projects-grid .project-title-row h3")].map((heading) => heading.textContent),
    projects.map(({ title }) => title),
  );
  assert.equal(container.querySelectorAll(".projects-grid .project-media-placeholder").length, 4);
  assert.equal(container.querySelectorAll(".projects-grid .project-card").length, 4);
  assert.equal(container.querySelectorAll(".featured-projects").length, 0);
  assert.deepEqual(
    [...container.querySelectorAll(".projects-grid .project-card-open")].map((link) => link.getAttribute("href")),
    projects.map(({ id }) => `/projects/${id}`),
  );

  await act(async () => {
    [...container.querySelectorAll(".project-filter")].find((button) => button.textContent === "Cloud & DevOps").click();
  });
  assert.deepEqual(
    [...container.querySelectorAll(".projects-grid .project-title-row h3")].map((heading) => heading.textContent),
    [projects[2].title],
  );
  await act(async () => {
    [...container.querySelectorAll(".project-filter")].find((button) => button.textContent === "Motion graphics").click();
  });
  assert.deepEqual(
    [...container.querySelectorAll(".projects-grid .project-title-row h3")].map((heading) => heading.textContent),
    [projects[3].title],
  );

  await act(async () => root.unmount());
  mounted = false;
});
