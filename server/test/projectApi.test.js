import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import app from "../src/app.js";
import AdminSession from "../src/models/AdminSession.js";
import Project from "../src/models/Project.js";
import { cloudinaryIntegration, CloudinaryConfigurationError, InvalidProjectImageError } from "../src/services/cloudinaryIntegration.js";
import { PROJECT_IMAGE_MAX_BYTES } from "../src/utils/projectImageMetadata.js";
import {
  createAdminProject,
  createProjectImageUploadSignature,
  getAdminProject,
  listAdminProjects,
  listPublicProjects,
  projectSchemas,
  reorderAdminProjects,
  setAdminProjectFeatured,
  setAdminProjectPublished,
  slugifyProjectTitle,
  updateAdminProject,
} from "../src/controllers/projectController.js";

const projectId = "64b000000000000000000001";
const otherProjectId = "64b000000000000000000002";
const baseProject = {
  _id: projectId,
  title: "EstateCore",
  slug: "estatecore",
  shortDescription: "A real estate platform for modern property discovery.",
  category: "Web Development",
  technologies: ["React", "Node.js"],
  coverImage: null,
  gallery: [],
  liveUrl: undefined,
  featured: false,
  published: false,
  displayOrder: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function restoreProject(t, methods) {
  const originals = methods.map((name) => [name, Project[name]]);
  t.after(() => originals.forEach(([name, original]) => { Project[name] = original; }));
}

function restoreAdminSession(t) {
  const original = AdminSession.findOne;
  t.after(() => { AdminSession.findOne = original; });
}

function restoreCloudinaryIntegration(t, methods) {
  const originals = methods.map((name) => [name, cloudinaryIntegration[name]]);
  t.after(() => originals.forEach(([name, original]) => { cloudinaryIntegration[name] = original; }));
}

function queryResult(value, onSort, onSelect) {
  return {
    sort(specification) { onSort?.(specification); return this; },
    select(fields) { onSelect?.(fields); return this; },
    lean: async () => value,
  };
}

function validBody(overrides = {}) {
  return {
    title: "EstateCore",
    shortDescription: "A real estate platform for modern property discovery.",
    category: "Web Development",
    technologies: ["React", "Node.js"],
    ...overrides,
  };
}

async function listen(t) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function mockSlugLookup(t, existingSlugs = []) {
  restoreProject(t, ["findOne"]);
  Project.findOne = (filter) => ({
    select() { return this; },
    lean: async () => existingSlugs.includes(filter.slug) ? { _id: otherProjectId } : null,
  });
}

test("Project model has approved fields, defaults, timestamps, and a unique slug", () => {
  const project = new Project({
    title: "Example project",
    slug: "example-project",
    shortDescription: "A short description long enough for this project.",
    category: "Web Development",
  });
  assert.equal(project.featured, false);
  assert.equal(project.published, false);
  assert.equal(project.displayOrder, 0);
  assert.deepEqual(project.technologies, []);
  assert.deepEqual(project.gallery, []);
  assert.equal(Project.schema.path("slug").options.unique, true);
  assert.equal(Project.schema.options.timestamps, true);
  assert.equal(Project.schema.path("repositoryUrl"), undefined);
  assert.equal(Project.schema.path("video"), undefined);
});

test("slug generation normalizes case, accents, punctuation, and empty transliterations", () => {
  assert.equal(slugifyProjectTitle("  Éstate Core: A Showcase! "), "estate-core-a-showcase");
  assert.equal(slugifyProjectTitle("東京"), "project");
});

test("project creation generates a unique slug for duplicate titles", async (t) => {
  mockSlugLookup(t, ["estatecore"]);
  restoreProject(t, ["create"]);
  let created;
  Project.create = async (data) => { created = { ...baseProject, ...data }; return created; };
  const res = responseRecorder();
  await createAdminProject({ body: validBody() }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.slug, "estatecore-2");
  assert.equal(created.published, false);
  assert.equal(res.body.data.slug, "estatecore-2");
});

test("project creation accepts an explicit unique slug and optional image metadata", async (t) => {
  mockSlugLookup(t);
  restoreProject(t, ["create"]);
  restoreCloudinaryIntegration(t, ["verifyUploadedProjectImage"]);
  cloudinaryIntegration.verifyUploadedProjectImage = async (image) => image;
  let created;
  Project.create = async (data) => { created = { ...baseProject, ...data }; return created; };
  const coverImage = {
    publicId: "projects/estatecore-cover",
    secureUrl: "https://res.cloudinary.com/attelier/image/upload/v123/projects/estatecore-cover.webp",
    width: 1200,
    height: 675,
    format: "webp",
  };
  const res = responseRecorder();
  await createAdminProject({ body: validBody({ slug: "estate-core", coverImage, liveUrl: "https://estate.example" }) }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.slug, "estate-core");
  assert.deepEqual(created.coverImage, coverImage);
  assert.equal(created.liveUrl, "https://estate.example");
});

test("required project fields, invalid lengths, and unexpected fields are rejected", async (t) => {
  restoreProject(t, ["findOne", "create"]);
  Project.findOne = () => assert.fail("invalid body must not check slugs");
  Project.create = () => assert.fail("invalid body must not persist");
  const invalidBodies = [
    {},
    validBody({ title: "x" }),
    validBody({ title: "a".repeat(121) }),
    validBody({ shortDescription: "short" }),
    validBody({ category: "" }),
    validBody({ unexpected: "ignored fields must be rejected" }),
    validBody({ technologies: ["React", "react"] }),
  ];
  for (const body of invalidBodies) {
    const res = responseRecorder();
    await createAdminProject({ body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("an explicit slug conflict is rejected without changing another project", async (t) => {
  mockSlugLookup(t, ["estate-core"]);
  restoreProject(t, ["create"]);
  Project.create = () => assert.fail("conflicting slug must not create a project");
  const res = responseRecorder();
  await createAdminProject({ body: validBody({ slug: "estate-core" }) }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "A project with this slug already exists.");
});

test("unique-index races return the same slug-conflict response", async (t) => {
  mockSlugLookup(t);
  restoreProject(t, ["create"]);
  Project.create = async () => { const error = new Error("duplicate key"); error.code = 11000; throw error; };
  const res = responseRecorder();
  await createAdminProject({ body: validBody({ slug: "estate-core" }) }, res);
  assert.equal(res.statusCode, 409);
});

test("project updates accept safe slug changes and leave the current slug alone when omitted", async (t) => {
  mockSlugLookup(t);
  restoreProject(t, ["findById", "findByIdAndUpdate"]);
  let capturedUpdate;
  Project.findById = () => ({ lean: async () => ({ ...baseProject }) });
  Project.findByIdAndUpdate = (_id, update) => {
    capturedUpdate = update;
    return { lean: async () => ({ ...baseProject, ...update.$set }) };
  };

  const slugRes = responseRecorder();
  await updateAdminProject({ params: { id: projectId }, body: { slug: "estatecore-v2" } }, slugRes);
  assert.equal(slugRes.statusCode, 200);
  assert.equal(slugRes.body.data.slug, "estatecore-v2");
  assert.deepEqual(capturedUpdate.$set, { slug: "estatecore-v2" });

  const titleRes = responseRecorder();
  await updateAdminProject({ params: { id: projectId }, body: { title: "Renamed project" } }, titleRes);
  assert.deepEqual(capturedUpdate.$set, { title: "Renamed project" });
  assert.equal(titleRes.body.data.slug, "estatecore");

  const clearUrlRes = responseRecorder();
  await updateAdminProject({ params: { id: projectId }, body: { liveUrl: "" } }, clearUrlRes);
  assert.deepEqual(capturedUpdate.$set, { liveUrl: null });
  assert.equal(clearUrlRes.body.data.liveUrl, null);
});

test("project update rejects a slug owned by a different project", async (t) => {
  mockSlugLookup(t, ["occupied-slug"]);
  restoreProject(t, ["findById", "findByIdAndUpdate"]);
  Project.findById = () => ({ lean: async () => ({ ...baseProject }) });
  Project.findByIdAndUpdate = () => assert.fail("slug conflict must not update the record");
  const res = responseRecorder();
  await updateAdminProject({ params: { id: projectId }, body: { slug: "occupied-slug" } }, res);
  assert.equal(res.statusCode, 409);
});

test("public project list queries published records and exposes only public portfolio fields", async (t) => {
  restoreProject(t, ["find"]);
  let filter;
  let sort;
  let projection;
  const fixture = {
    ...baseProject,
    published: true,
    __v: 8,
    privateNote: "must not escape",
  };
  Project.find = (query) => {
    filter = query;
    return queryResult([fixture], (order) => { sort = order; }, (fields) => { projection = fields; });
  };
  const res = responseRecorder();
  await listPublicProjects({}, res);
  assert.deepEqual(filter, { published: true });
  assert.deepEqual(sort, { featured: -1, displayOrder: 1, createdAt: -1, _id: 1 });
  assert.equal(res.statusCode, 200);
  assert.equal("published" in res.body.data[0], false);
  assert.equal("createdAt" in res.body.data[0], false);
  assert.equal("privateNote" in res.body.data[0], false);
  assert.equal("__v" in res.body.data[0], false);
  assert.equal(res.body.data[0].slug, baseProject.slug);
  assert.equal(projection, "title slug shortDescription category technologies coverImage gallery liveUrl featured displayOrder");
});

test("public sorting includes stable tie-breakers", async (t) => {
  restoreProject(t, ["find"]);
  let sort;
  Project.find = () => queryResult([], (order) => { sort = order; });
  await listPublicProjects({}, responseRecorder());
  assert.equal(sort.featured, -1);
  assert.equal(sort.displayOrder, 1);
  assert.equal(sort.createdAt, -1);
  assert.equal(sort._id, 1);
});

test("public projects route is available without an administrator session", async (t) => {
  restoreProject(t, ["find"]);
  Project.find = () => queryResult([{ ...baseProject, published: true }]);
  const response = await fetch(`${await listen(t)}/api/projects`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data[0].slug, "estatecore");
  assert.equal("published" in body.data[0], false);
});

test("admin list includes unpublished records and administrative state", async (t) => {
  restoreProject(t, ["find"]);
  let filter;
  Project.find = (query) => { filter = query; return queryResult([{ ...baseProject, published: false }]); };
  const res = responseRecorder();
  await listAdminProjects({}, res);
  assert.deepEqual(filter, {});
  assert.equal(res.body.data[0].published, false);
  assert.equal(res.body.data[0].slug, "estatecore");
});

test("admin detail returns a project and missing IDs return 404", async (t) => {
  restoreProject(t, ["findById"]);
  Project.findById = () => ({ lean: async () => ({ ...baseProject, published: false }) });
  const found = responseRecorder();
  await getAdminProject({ params: { id: projectId } }, found);
  assert.equal(found.statusCode, 200);
  assert.equal(found.body.data.id, projectId);

  Project.findById = () => ({ lean: async () => null });
  const missing = responseRecorder();
  await getAdminProject({ params: { id: projectId } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("publish and unpublish actions update only the published field", async (t) => {
  restoreProject(t, ["findByIdAndUpdate"]);
  let captured;
  Project.findByIdAndUpdate = (_id, update) => {
    captured = update;
    return { lean: async () => ({ ...baseProject, published: update.$set.published }) };
  };
  for (const published of [true, false]) {
    const res = responseRecorder();
    await setAdminProjectPublished({ params: { id: projectId }, body: { published } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.published, published);
    assert.deepEqual(captured.$set, { published });
  }
});

test("feature and unfeature actions update only the featured field", async (t) => {
  restoreProject(t, ["findByIdAndUpdate"]);
  let captured;
  Project.findByIdAndUpdate = (_id, update) => {
    captured = update;
    return { lean: async () => ({ ...baseProject, featured: update.$set.featured }) };
  };
  for (const featured of [true, false]) {
    const res = responseRecorder();
    await setAdminProjectFeatured({ params: { id: projectId }, body: { featured } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.featured, featured);
    assert.deepEqual(captured.$set, { featured });
  }
});

test("reordering validates all IDs before writing and updates display order", async (t) => {
  restoreProject(t, ["countDocuments", "bulkWrite"]);
  let captured;
  Project.countDocuments = async () => 2;
  Project.bulkWrite = async (operations, options) => { captured = { operations, options }; };
  const res = responseRecorder();
  await reorderAdminProjects({ body: { items: [
    { id: projectId, displayOrder: 1 },
    { id: otherProjectId, displayOrder: 0 },
  ] } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(captured.operations.length, 2);
  assert.deepEqual(captured.operations.map((item) => item.updateOne.update.$set.displayOrder), [1, 0]);
  assert.equal(captured.options.ordered, true);
  assert.deepEqual(res.body.data.map((item) => item.id), [otherProjectId, projectId]);
});

test("invalid ordering payloads are rejected before database access", async (t) => {
  restoreProject(t, ["countDocuments", "bulkWrite"]);
  Project.countDocuments = () => assert.fail("invalid order must not query projects");
  Project.bulkWrite = () => assert.fail("invalid order must not write");
  for (const body of [
    {},
    { items: [] },
    { items: [{ id: "invalid", displayOrder: 0 }] },
    { items: [{ id: projectId, displayOrder: -1 }] },
    { items: [{ id: projectId, displayOrder: 1 }, { id: projectId, displayOrder: 2 }] },
    { items: [{ id: projectId, displayOrder: 1 }, { id: otherProjectId, displayOrder: 1 }] },
    { items: [{ id: projectId, displayOrder: 0, title: "mass assignment" }] },
  ]) {
    const res = responseRecorder();
    await reorderAdminProjects({ body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("reordering returns 404 and performs no write when a requested project is missing", async (t) => {
  restoreProject(t, ["countDocuments", "bulkWrite"]);
  Project.countDocuments = async () => 0;
  Project.bulkWrite = () => assert.fail("missing project must prevent all writes");
  const res = responseRecorder();
  await reorderAdminProjects({ body: { items: [{ id: projectId, displayOrder: 0 }] } }, res);
  assert.equal(res.statusCode, 404);
});

test("invalid MongoDB IDs are rejected before project queries", async (t) => {
  restoreProject(t, ["findById", "findByIdAndUpdate"]);
  Project.findById = () => assert.fail("invalid ID must not query");
  Project.findByIdAndUpdate = () => assert.fail("invalid ID must not update");
  for (const operation of [getAdminProject, updateAdminProject, setAdminProjectPublished, setAdminProjectFeatured]) {
    const res = responseRecorder();
    await operation({ params: { id: "not-an-object-id" }, body: {} }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("image metadata accepts Cloudinary references and rejects unsafe or unknown fields", () => {
  const valid = {
    publicId: "projects/estatecore-cover",
    secureUrl: "https://res.cloudinary.com/attelier/image/upload/v123/projects/estatecore-cover.webp",
    width: 1200,
    height: 675,
    format: "webp",
  };
  assert.equal(projectSchemas.projectImageSchema.safeParse(valid).success, true);
  for (const image of [
    { ...valid, secureUrl: "http://res.cloudinary.com/attelier/image/upload/v123/image.webp" },
    { ...valid, secureUrl: "https://evil.example/attelier/image/upload/v123/image.webp" },
    { ...valid, secureUrl: "https://user:pass@res.cloudinary.com/attelier/image/upload/v123/image.webp" },
    { ...valid, publicId: "../outside" },
    { ...valid, script: "<script>" },
  ]) assert.equal(projectSchemas.projectImageSchema.safeParse(image).success, false);
  assert.equal(projectSchemas.createProjectSchema.safeParse(validBody({ liveUrl: "javascript:alert(1)" })).success, false);
});

test("upload signature endpoint rejects client-supplied parameters and returns server-generated signatures", async (t) => {
  restoreCloudinaryIntegration(t, ["generateProjectImageSignature"]);
  cloudinaryIntegration.generateProjectImageSignature = () => ({
    signature: "test-signature", timestamp: 123, resourceType: "image", maxFileSize: PROJECT_IMAGE_MAX_BYTES,
  });
  const invalid = responseRecorder();
  await createProjectImageUploadSignature({ body: { folder: "attacker-folder" } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const valid = responseRecorder();
  await createProjectImageUploadSignature({ body: {} }, valid);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.data.signature, "test-signature");
  assert.equal(valid.body.data.maxFileSize, PROJECT_IMAGE_MAX_BYTES);
  assert.equal("apiSecret" in valid.body.data, false);
});

test("missing Cloudinary credentials fail safely without returning configuration values", async (t) => {
  restoreCloudinaryIntegration(t, ["generateProjectImageSignature"]);
  cloudinaryIntegration.generateProjectImageSignature = () => { throw new CloudinaryConfigurationError(); };
  const res = responseRecorder();
  await createProjectImageUploadSignature({ body: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { success: false, message: "Project image storage is not configured." });
});

test("failed image replacement leaves existing project data unchanged", async (t) => {
  restoreProject(t, ["findById", "findByIdAndUpdate"]);
  restoreCloudinaryIntegration(t, ["verifyUploadedProjectImage"]);
  const oldCover = {
    publicId: "attelier-project-images/existing",
    secureUrl: "https://res.cloudinary.com/attelier/image/upload/v123/attelier-project-images/existing.webp",
    width: 1200, height: 675, format: "webp",
  };
  const replacement = {
    publicId: "attelier-project-images/replacement",
    secureUrl: "https://res.cloudinary.com/attelier/image/upload/v124/attelier-project-images/replacement.webp",
    width: 1200, height: 675, format: "webp",
  };
  const current = { ...baseProject, coverImage: structuredClone(oldCover) };
  Project.findById = () => ({ lean: async () => current });
  Project.findByIdAndUpdate = () => assert.fail("failed image validation must prevent project writes");
  cloudinaryIntegration.verifyUploadedProjectImage = async () => { throw new InvalidProjectImageError(); };

  const res = responseRecorder();
  await updateAdminProject({ params: { id: projectId }, body: { coverImage: replacement } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(current.coverImage, oldCover);
});

test("unauthenticated project admin routes reject requests without querying or writing projects", async (t) => {
  restoreProject(t, ["find", "findById", "create", "findByIdAndUpdate", "countDocuments", "bulkWrite"]);
  for (const name of ["find", "findById", "create", "findByIdAndUpdate", "countDocuments", "bulkWrite"]) {
    Project[name] = () => assert.fail(`unauthenticated route must not call Project.${name}`);
  }
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const requests = [
    ["/api/admin/projects", "GET"],
    ["/api/admin/projects/upload-signature", "POST", {}],
    [`/api/admin/projects/${projectId}`, "GET"],
    ["/api/admin/projects", "POST", validBody()],
    [`/api/admin/projects/${projectId}`, "PATCH", { title: "Changed title" }],
    [`/api/admin/projects/${projectId}/publish`, "PATCH", { published: true }],
    [`/api/admin/projects/${projectId}/featured`, "PATCH", { featured: true }],
    ["/api/admin/projects/reorder", "PATCH", { items: [{ id: projectId, displayOrder: 0 }] }],
  ];
  for (const [path, method, body] of requests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json", Origin: "http://localhost:5173" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});

test("project mutations retain trusted-origin protection after authentication", async (t) => {
  restoreAdminSession(t);
  restoreProject(t, ["findByIdAndUpdate"]);
  restoreCloudinaryIntegration(t, ["generateProjectImageSignature"]);
  const admin = { _id: otherProjectId, email: "admin@example.invalid", role: "admin", isActive: true, credentialVersion: 0 };
  AdminSession.findOne = () => ({ populate: async () => ({
    _id: "isolated-session", credentialVersion: 0,
    expiresAt: new Date(Date.now() + 60000), adminId: admin,
  }) });
  Project.findByIdAndUpdate = () => assert.fail("untrusted origin must not reach project mutation");
  cloudinaryIntegration.generateProjectImageSignature = () => assert.fail("untrusted origin must not reach signature generation");
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/projects/${projectId}/publish`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: "attelier_admin_session=isolated-token", Origin: "https://untrusted.example" },
    body: JSON.stringify({ published: true }),
  });
  assert.equal(response.status, 403);

  const signatureResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/projects/upload-signature`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "attelier_admin_session=isolated-token", Origin: "https://untrusted.example" },
    body: "{}",
  });
  assert.equal(signatureResponse.status, 403);
});
