import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import {
  isProjectImageUrlForCloud,
  projectImageSchema,
  PROJECT_IMAGE_FOLDER,
  PROJECT_IMAGE_FORMATS,
  PROJECT_IMAGE_MAX_BYTES,
} from "../utils/projectImageMetadata.js";

export class CloudinaryConfigurationError extends Error {
  constructor() {
    super("Cloudinary image storage is not configured.");
    this.name = "CloudinaryConfigurationError";
  }
}

export class InvalidProjectImageError extends Error {
  constructor() {
    super("The uploaded project image is invalid or does not meet the image policy.");
    this.name = "InvalidProjectImageError";
  }
}

export function createCloudinaryIntegration({
  sdk = cloudinary,
  getEnvironment = () => process.env,
  now = () => Date.now(),
  createId = randomUUID,
} = {}) {
  function configuration() {
    const environment = getEnvironment();
    const cloudName = environment.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = environment.CLOUDINARY_API_KEY?.trim();
    const apiSecret = environment.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !/^[a-z0-9-]{1,100}$/i.test(cloudName) || !apiKey || !apiSecret) {
      throw new CloudinaryConfigurationError();
    }
    return { cloudName, apiKey, apiSecret };
  }

  function configureSdk(config) {
    sdk.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
  }

  function generateProjectImageSignature() {
    const config = configuration();
    configureSdk(config);
    const timestamp = Math.floor(now() / 1000);
    const parameters = {
      timestamp,
      asset_folder: PROJECT_IMAGE_FOLDER,
      public_id: `${PROJECT_IMAGE_FOLDER}/${createId()}`,
      allowed_formats: PROJECT_IMAGE_FORMATS.join(","),
      unique_filename: false,
      overwrite: false,
    };
    const signature = sdk.utils.api_sign_request(parameters, config.apiSecret);

    return {
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      resourceType: "image",
      timestamp,
      signature,
      parameters,
      allowedFormats: [...PROJECT_IMAGE_FORMATS],
      maxFileSize: PROJECT_IMAGE_MAX_BYTES,
    };
  }

  async function verifyUploadedProjectImage(input) {
    const parsed = projectImageSchema.safeParse(input);
    if (!parsed.success) throw new InvalidProjectImageError();

    const image = parsed.data;
    if (!image.publicId.startsWith(`${PROJECT_IMAGE_FOLDER}/`)) throw new InvalidProjectImageError();

    const config = configuration();
    if (!isProjectImageUrlForCloud(image, config.cloudName)) throw new InvalidProjectImageError();
    configureSdk(config);

    let resource;
    try {
      resource = await sdk.api.resource(image.publicId, { resource_type: "image", type: "upload" });
    } catch (error) {
      if (error?.http_code === 404 || error?.error?.http_code === 404) throw new InvalidProjectImageError();
      throw error;
    }

    const actualUrl = resource?.secure_url;
    if (
      resource?.resource_type !== "image"
      || resource?.public_id !== image.publicId
      || resource?.format !== image.format
      || resource?.width !== image.width
      || resource?.height !== image.height
      || !Number.isSafeInteger(resource?.bytes)
      || resource.bytes < 1
      || resource.bytes > PROJECT_IMAGE_MAX_BYTES
      || actualUrl !== image.secureUrl
      || !isProjectImageUrlForCloud({ secureUrl: actualUrl }, config.cloudName)
    ) {
      throw new InvalidProjectImageError();
    }

    return {
      publicId: resource.public_id,
      secureUrl: resource.secure_url,
      format: resource.format,
      width: resource.width,
      height: resource.height,
    };
  }

  return { generateProjectImageSignature, verifyUploadedProjectImage };
}

export const cloudinaryIntegration = createCloudinaryIntegration();
