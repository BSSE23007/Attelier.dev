import mongoose from "mongoose";
import { z } from "zod";
import Project from "../models/Project.js";
import { cloudinaryIntegration, CloudinaryConfigurationError, InvalidProjectImageError } from "../services/cloudinaryIntegration.js";
import { logSafeError } from "../utils/safeErrorLogger.js";
import { projectImageSchema } from "../utils/projectImageMetadata.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugSchema = z.string().trim().toLowerCase().min(1).max(120).regex(slugPattern);
const technologyArraySchema = z.array(z.string().trim().min(1).max(40)).max(20)
  .refine((items) => new Set(items.map((item) => item.toLowerCase())).size === items.length, "Technologies must be unique.");

const liveUrlSchema = z.preprocess((value) => value === "" ? null : value,
  z.string().trim().max(2048).url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Enter a valid HTTPS project URL.").nullable().optional());

const editableFields = {
  title: z.string().trim().min(2).max(120),
  slug: slugSchema,
  shortDescription: z.string().trim().min(10).max(500),
  category: z.string().trim().min(2).max(80),
  technologies: technologyArraySchema,
  coverImage: projectImageSchema.nullable(),
  gallery: z.array(projectImageSchema).max(12),
  liveUrl: liveUrlSchema,
  featured: z.boolean(),
  published: z.boolean(),
  displayOrder: z.number().int().min(0).max(1000000),
};

const createProjectSchema = z.object({
  ...editableFields,
  slug: slugSchema.optional(),
  technologies: technologyArraySchema.default([]),
  gallery: z.array(projectImageSchema).max(12).default([]),
  coverImage: projectImageSchema.nullable().optional(),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(1000000).default(0),
}).strict();

const updateProjectSchema = z.object(editableFields).partial().strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one project field to update.");
const visibilitySchema = z.object({ published: z.boolean() }).strict();
const featuredSchema = z.object({ featured: z.boolean() }).strict();
const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i),
    displayOrder: z.number().int().min(0).max(1000000),
  }).strict()).min(1).max(500),
}).strict().refine(({ items }) => new Set(items.map(({ id }) => id.toLowerCase())).size === items.length, "Each project can appear only once.")
  .refine(({ items }) => new Set(items.map(({ displayOrder }) => displayOrder)).size === items.length, "Display order values must be unique.");

export function slugifyProjectTitle(title) {
  const slug = title.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120).replace(/-+$/g, "");
  return slug || "project";
}

class ProjectSlugConflictError extends Error {
  constructor() {
    super("A project with this slug already exists.");
    this.status = 409;
  }
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function publicProject(project) {
  return {
    id: String(project._id),
    title: project.title,
    slug: project.slug,
    shortDescription: project.shortDescription,
    category: project.category,
    technologies: project.technologies || [],
    coverImage: project.coverImage ?? null,
    gallery: project.gallery || [],
    liveUrl: project.liveUrl ?? null,
    featured: Boolean(project.featured),
    displayOrder: project.displayOrder ?? 0,
  };
}

function adminProject(project) {
  return {
    ...publicProject(project),
    published: Boolean(project.published),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function validateId(id, res) {
  if (mongoose.isValidObjectId(id)) return true;
  res.status(400).json({ success: false, message: "Invalid project ID." });
  return false;
}

async function existingProjectForSlug(slug, projectId) {
  const filter = { slug };
  if (projectId) filter._id = { $ne: projectId };
  return Project.findOne(filter).select("_id").lean();
}

async function resolveSlug(title, suppliedSlug, projectId) {
  const baseSlug = suppliedSlug || slugifyProjectTitle(title);
  if (suppliedSlug) {
    if (await existingProjectForSlug(baseSlug, projectId)) throw new ProjectSlugConflictError();
    return baseSlug;
  }

  let candidate = baseSlug;
  let suffix = 2;
  while (await existingProjectForSlug(candidate, projectId)) {
    const suffixText = `-${suffix}`;
    candidate = `${baseSlug.slice(0, 120 - suffixText.length).replace(/-+$/g, "")}${suffixText}`;
    suffix += 1;
  }
  return candidate;
}

function invalidBody(res, message) {
  return res.status(400).json({ success: false, message });
}

function handleProjectError(error, context, res) {
  if (error instanceof InvalidProjectImageError) {
    return res.status(400).json({ success: false, message: "The uploaded project image is invalid or exceeds the allowed size." });
  }
  if (error instanceof CloudinaryConfigurationError) {
    return res.status(503).json({ success: false, message: "Project image storage is not configured." });
  }
  if (error instanceof ProjectSlugConflictError || isDuplicateKeyError(error)) {
    return res.status(409).json({ success: false, message: "A project with this slug already exists." });
  }
  logSafeError(context, error);
  return res.status(503).json({ success: false, message: "Unable to complete the project request right now." });
}

function sameProjectImage(left, right) {
  return Boolean(left && right)
    && left.publicId === right.publicId
    && left.secureUrl === right.secureUrl
    && left.format === right.format
    && left.width === right.width
    && left.height === right.height;
}

async function verifyNewProjectImages(changes, current = {}) {
  if (Object.hasOwn(changes, "coverImage") && changes.coverImage && !sameProjectImage(changes.coverImage, current.coverImage)) {
    changes.coverImage = await cloudinaryIntegration.verifyUploadedProjectImage(changes.coverImage);
  }

  if (Object.hasOwn(changes, "gallery")) {
    changes.gallery = await Promise.all(changes.gallery.map(async (image) => {
      const alreadyReferenced = (current.gallery || []).some((existing) => sameProjectImage(image, existing));
      return alreadyReferenced ? image : cloudinaryIntegration.verifyUploadedProjectImage(image);
    }));
  }
}

const uploadSignatureRequestSchema = z.object({}).strict();

export async function createProjectImageUploadSignature(req, res) {
  const parsed = uploadSignatureRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return invalidBody(res, "Project image upload parameters are server controlled.");
  try {
    return res.json({ success: true, data: cloudinaryIntegration.generateProjectImageSignature() });
  } catch (error) {
    if (error instanceof CloudinaryConfigurationError) {
      return res.status(503).json({ success: false, message: "Project image storage is not configured." });
    }
    return handleProjectError(error, "Project image signature generation failed", res);
  }
}

export async function listPublicProjects(_req, res) {
  try {
    const projects = await Project.find({ published: true })
      .sort({ featured: -1, displayOrder: 1, createdAt: -1, _id: 1 })
      .select("title slug shortDescription category technologies coverImage gallery liveUrl featured displayOrder")
      .lean();
    return res.json({ success: true, data: projects.map(publicProject) });
  } catch (error) {
    return handleProjectError(error, "Public project list failed", res);
  }
}

export async function listAdminProjects(_req, res) {
  try {
    const projects = await Project.find({})
      .sort({ featured: -1, displayOrder: 1, createdAt: -1, _id: 1 })
      .lean();
    return res.json({ success: true, data: projects.map(adminProject) });
  } catch (error) {
    return handleProjectError(error, "Admin project list failed", res);
  }
}

export async function getAdminProject(req, res) {
  if (!validateId(req.params.id, res)) return undefined;
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    return res.json({ success: true, data: adminProject(project) });
  } catch (error) {
    return handleProjectError(error, "Admin project detail failed", res);
  }
}

export async function createAdminProject(req, res) {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return invalidBody(res, "Invalid project details.");

  try {
    const data = { ...parsed.data };
    data.slug = await resolveSlug(data.title, data.slug, null);
    await verifyNewProjectImages(data);
    const project = await Project.create(data);
    return res.status(201).json({ success: true, data: adminProject(project) });
  } catch (error) {
    return handleProjectError(error, "Admin project creation failed", res);
  }
}

export async function updateAdminProject(req, res) {
  if (!validateId(req.params.id, res)) return undefined;
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) return invalidBody(res, "Invalid project update.");

  try {
    const current = await Project.findById(req.params.id).lean();
    if (!current) return res.status(404).json({ success: false, message: "Project not found." });
    const changes = { ...parsed.data };
    if (changes.slug !== undefined) {
      changes.slug = await resolveSlug(current.title, changes.slug, req.params.id);
    }
    await verifyNewProjectImages(changes, current);
    const project = await Project.findByIdAndUpdate(req.params.id, { $set: changes }, { new: true, runValidators: true }).lean();
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    return res.json({ success: true, data: adminProject(project) });
  } catch (error) {
    return handleProjectError(error, "Admin project update failed", res);
  }
}

export async function setAdminProjectPublished(req, res) {
  if (!validateId(req.params.id, res)) return undefined;
  const parsed = visibilitySchema.safeParse(req.body);
  if (!parsed.success) return invalidBody(res, "Provide a published boolean.");
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { $set: { published: parsed.data.published } }, { new: true, runValidators: true }).lean();
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    return res.json({ success: true, data: adminProject(project) });
  } catch (error) {
    return handleProjectError(error, "Admin project publish update failed", res);
  }
}

export async function setAdminProjectFeatured(req, res) {
  if (!validateId(req.params.id, res)) return undefined;
  const parsed = featuredSchema.safeParse(req.body);
  if (!parsed.success) return invalidBody(res, "Provide a featured boolean.");
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { $set: { featured: parsed.data.featured } }, { new: true, runValidators: true }).lean();
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    return res.json({ success: true, data: adminProject(project) });
  } catch (error) {
    return handleProjectError(error, "Admin project featured update failed", res);
  }
}

export async function reorderAdminProjects(req, res) {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return invalidBody(res, "Invalid project ordering.");

  try {
    const ids = parsed.data.items.map(({ id }) => new mongoose.Types.ObjectId(id));
    const existingCount = await Project.countDocuments({ _id: { $in: ids } });
    if (existingCount !== ids.length) return res.status(404).json({ success: false, message: "One or more projects were not found." });

    await Project.bulkWrite(parsed.data.items.map(({ id, displayOrder }) => ({
      updateOne: { filter: { _id: new mongoose.Types.ObjectId(id) }, update: { $set: { displayOrder } } },
    })), { ordered: true });
    return res.json({
      success: true,
      data: [...parsed.data.items].sort((left, right) => left.displayOrder - right.displayOrder),
    });
  } catch (error) {
    return handleProjectError(error, "Admin project reorder failed", res);
  }
}

export const projectSchemas = { createProjectSchema, updateProjectSchema, visibilitySchema, featuredSchema, reorderSchema, projectImageSchema };
