import { z } from "zod";

export const PROJECT_IMAGE_FOLDER = "attelier-project-images";
export const PROJECT_IMAGE_MAX_BYTES = 5_000_000;
export const PROJECT_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "avif"];

const secureImageUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    const path = url.pathname.split("/");
    return url.protocol === "https:"
      && url.hostname === "res.cloudinary.com"
      && !url.username && !url.password && !url.search && !url.hash
      && /^[A-Za-z0-9_-]+$/.test(path[1] || "")
      && path[2] === "image" && path[3] === "upload" && path.length > 4;
  } catch {
    return false;
  }
}, "Enter a secure Cloudinary image delivery URL.");

export const projectImageSchema = z.object({
  publicId: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/),
  secureUrl: secureImageUrlSchema,
  width: z.number().int().min(1).max(30000),
  height: z.number().int().min(1).max(30000),
  format: z.enum(PROJECT_IMAGE_FORMATS),
}).strict();

export function isProjectImageUrlForCloud(image, cloudName) {
  try {
    const url = new URL(image.secureUrl);
    return url.protocol === "https:"
      && url.hostname === "res.cloudinary.com"
      && url.pathname.startsWith(`/${cloudName}/image/upload/`)
      && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}
