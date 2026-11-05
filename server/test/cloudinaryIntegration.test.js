import test from "node:test";
import assert from "node:assert/strict";
import {
  CloudinaryConfigurationError,
  createCloudinaryIntegration,
  InvalidProjectImageError,
} from "../src/services/cloudinaryIntegration.js";
import {
  PROJECT_IMAGE_FOLDER,
  PROJECT_IMAGE_FORMATS,
  PROJECT_IMAGE_MAX_BYTES,
  projectImageSchema,
} from "../src/utils/projectImageMetadata.js";

const env = {
  CLOUDINARY_CLOUD_NAME: "attelier-test",
  CLOUDINARY_API_KEY: "fake-test-api-key",
  CLOUDINARY_API_SECRET: "fake-test-api-secret",
};
const metadata = {
  publicId: `${PROJECT_IMAGE_FOLDER}/test-asset`,
  secureUrl: "https://res.cloudinary.com/attelier-test/image/upload/v123/attelier-project-images/test-asset.webp",
  format: "webp",
  width: 1200,
  height: 675,
};

function sdkForResource(resource, onResource = () => {}) {
  return {
    config() {},
    utils: { api_sign_request() { return "mock-signature"; } },
    api: { async resource(publicId, options) { onResource(publicId, options); return resource; } },
  };
}

function cloudResource(overrides = {}) {
  return {
    resource_type: "image",
    public_id: metadata.publicId,
    secure_url: metadata.secureUrl,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    bytes: 500000,
    ...overrides,
  };
}

test("missing or malformed Cloudinary configuration fails without configuring the SDK", () => {
  for (const environment of [
    {},
    { ...env, CLOUDINARY_API_SECRET: "" },
    { ...env, CLOUDINARY_API_KEY: "" },
    { ...env, CLOUDINARY_CLOUD_NAME: "invalid.cloud.name" },
  ]) {
    let configured = false;
    const service = createCloudinaryIntegration({
      sdk: { config() { configured = true; }, utils: { api_sign_request() {} } },
      getEnvironment: () => environment,
    });
    assert.throws(() => service.generateProjectImageSignature(), CloudinaryConfigurationError);
    assert.equal(configured, false);
  }
});

test("signed parameters are server controlled and return no API secret", () => {
  let sdkConfig;
  let signed;
  const service = createCloudinaryIntegration({
    sdk: {
      config(value) { sdkConfig = value; },
      utils: { api_sign_request(parameters, secret) { signed = { parameters, secret }; return "signature-only"; } },
    },
    getEnvironment: () => env,
    now: () => 1770000000000,
    createId: () => "fixed-test-id",
  });
  const result = service.generateProjectImageSignature();

  assert.equal(result.signature, "signature-only");
  assert.equal(result.timestamp, 1770000000);
  assert.equal(result.cloudName, env.CLOUDINARY_CLOUD_NAME);
  assert.equal(result.apiKey, env.CLOUDINARY_API_KEY);
  assert.equal(result.resourceType, "image");
  assert.equal(result.maxFileSize, PROJECT_IMAGE_MAX_BYTES);
  assert.deepEqual(result.allowedFormats, PROJECT_IMAGE_FORMATS);
  assert.deepEqual(signed.parameters, result.parameters);
  assert.equal(signed.secret, env.CLOUDINARY_API_SECRET);
  assert.equal("apiSecret" in result, false);
  assert.equal("CLOUDINARY_API_SECRET" in result, false);
  assert.equal(sdkConfig.secure, true);
  assert.equal(sdkConfig.cloud_name, env.CLOUDINARY_CLOUD_NAME);
  assert.equal(result.parameters.asset_folder, PROJECT_IMAGE_FOLDER);
  assert.equal(result.parameters.public_id, `${PROJECT_IMAGE_FOLDER}/fixed-test-id`);
  assert.equal(result.parameters.allowed_formats, "jpg,jpeg,png,webp,avif");
  assert.equal(result.parameters.overwrite, false);
});

test("project image metadata only accepts approved formats and fields", () => {
  assert.equal(projectImageSchema.safeParse(metadata).success, true);
  assert.equal(projectImageSchema.safeParse({ ...metadata, format: "gif" }).success, false);
  assert.equal(projectImageSchema.safeParse({ publicId: metadata.publicId }).success, false);
  assert.equal(projectImageSchema.safeParse({ ...metadata, apiSecret: "not allowed" }).success, false);
});

test("server verifies uploaded Cloudinary metadata and accepts the exact 5 MB boundary", async () => {
  let requested;
  const service = createCloudinaryIntegration({
    sdk: sdkForResource(cloudResource({ bytes: PROJECT_IMAGE_MAX_BYTES }), (publicId, options) => { requested = { publicId, options }; }),
    getEnvironment: () => env,
  });
  assert.deepEqual(await service.verifyUploadedProjectImage(metadata), metadata);
  assert.equal(requested.publicId, metadata.publicId);
  assert.deepEqual(requested.options, { resource_type: "image", type: "upload" });
});

test("oversized Cloudinary assets are rejected before project metadata can be saved", async () => {
  const service = createCloudinaryIntegration({
    sdk: sdkForResource(cloudResource({ bytes: PROJECT_IMAGE_MAX_BYTES + 1 })),
    getEnvironment: () => env,
  });
  await assert.rejects(service.verifyUploadedProjectImage(metadata), InvalidProjectImageError);
});

test("invalid IDs, external or wrong-account URLs, missing metadata, and format mismatches are rejected", async () => {
  let resourceCalls = 0;
  const service = createCloudinaryIntegration({
    sdk: sdkForResource(cloudResource(), () => { resourceCalls += 1; }),
    getEnvironment: () => env,
  });
  const invalidValues = [
    {},
    { ...metadata, publicId: "unrelated-folder/file" },
    { ...metadata, publicId: `${PROJECT_IMAGE_FOLDER}/bad/../id` },
    { ...metadata, secureUrl: "https://images.example.invalid/image.webp" },
    { ...metadata, secureUrl: metadata.secureUrl.replace("attelier-test", "another-cloud") },
    { ...metadata, format: "png" },
  ];
  for (const value of invalidValues) {
    await assert.rejects(service.verifyUploadedProjectImage(value), InvalidProjectImageError);
  }
  assert.equal(resourceCalls, 1);
});
