import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { getStructuredData, serializeStructuredData } from "../src/structuredData.js";

const projectRoutes = [
  "/projects/estatecore",
  "/projects/hospital-management",
  "/projects/aws-threat-detection",
  "/projects/client-motion-graphics",
];

function collectPropertyNames(value, names = []) {
  if (!value || typeof value !== "object") return names;
  for (const [key, child] of Object.entries(value)) {
    names.push(key);
    collectPropertyNames(child, names);
  }
  return names;
}

test("homepage Organization and WebSite JSON-LD is factual and serializable", () => {
  const structuredData = getStructuredData("/");
  const parsed = JSON.parse(serializeStructuredData(structuredData));
  assert.equal(parsed["@context"], "https://schema.org");
  assert.deepEqual(parsed["@graph"].map(({ "@type": type }) => type), ["Organization", "WebSite"]);

  const [organization, website] = parsed["@graph"];
  assert.equal(organization.name, "Attelier.dev");
  assert.equal(organization.url, "https://attelier.dev/");
  assert.match(organization.description, /web development.*cloud and DevOps.*graphic design.*technical writing/i);
  assert.equal(organization.logo.url, "https://attelier.dev/images/logo.png");
  assert.ok(existsSync(new URL("../public/images/logo.png", import.meta.url)));
  assert.equal(organization.sameAs, undefined);
  assert.equal(website.name, "Attelier.dev");
  assert.equal(website.url, "https://attelier.dev/");
  assert.equal(website.publisher["@id"], organization["@id"]);
  assert.equal(website.potentialAction, undefined);
  assert.doesNotMatch(JSON.stringify(parsed), /aggregateRating|review|telephone|address|foundingDate|award/i);
});

test("each public project has one accurate CreativeWork record and canonical URL", () => {
  const records = projectRoutes.map((route) => JSON.parse(serializeStructuredData(getStructuredData(route))));
  assert.equal(new Set(records.map((record) => record["@id"])).size, projectRoutes.length);

  for (const [index, record] of records.entries()) {
    assert.equal(record["@context"], "https://schema.org");
    assert.equal(record["@type"], "CreativeWork");
    assert.equal(record.url, `https://attelier.dev${projectRoutes[index]}`);
    assert.equal(record.isPartOf["@id"], "https://attelier.dev/#website");
    assert.ok(record.name);
    assert.ok(record.description);
    assert.ok(!collectPropertyNames(record).some((key) =>
      ["aggregateRating", "review", "offers", "price", "award"].includes(key),
    ));
  }

  assert.match(records[0].description, /proposal/i);
  assert.match(records[0].description, /not marked as deployed/i);
  assert.equal(records[0].creator, undefined);
  assert.equal(records[0].image, "https://attelier.dev/projects/estatecore/architecture.png");
  assert.ok(existsSync(new URL("../public/projects/estatecore/architecture.png", import.meta.url)));

  assert.deepEqual(records[1].creator.map(({ name }) => name), ["Ali Sher Afzal", "Ali Hasnain"]);
  assert.equal(records[1].image, undefined);
  assert.deepEqual(records[2].creator.map(({ name }) => name), ["Ali Sher Afzal", "Suhaib Kashif"]);
  assert.equal(records[2].image, "https://attelier.dev/projects/aws-threat-detection/architecture.png");
  assert.match(records[2].description, /reported timing is specific to that simulation/i);
  assert.ok(existsSync(new URL("../public/projects/aws-threat-detection/architecture.png", import.meta.url)));

  assert.deepEqual(records[3].creator.map(({ name }) => name), ["Ali Sher Afzal"]);
  assert.match(records[3].description, /GHANI GFX as the client brand/i);
  assert.doesNotMatch(records[3].description, /Attelier\.dev.*client brand/i);
  assert.equal(records[3].image, undefined);
});

test("structured data is absent from contact, admin, and unknown routes", () => {
  for (const route of ["/contact", "/admin", "/admin/login", "/admin/inquiries/secret", "/unknown"]) {
    assert.equal(getStructuredData(route), null, route);
  }
});

test("JSON-LD serialization prevents script-closing injection", () => {
  const unsafe = { description: "</script><script>alert('x')</script> & data" };
  const serialized = serializeStructuredData(unsafe);
  assert.doesNotMatch(serialized, /<|>|&/);
  assert.deepEqual(JSON.parse(serialized), unsafe);
});
