import { projects } from "./data/projects.js";
import { isLocalProjectAsset } from "./projectMedia.js";
import { SITE_ORIGIN } from "./seoMetadata.js";

const organizationId = `${SITE_ORIGIN}/#organization`;
const websiteId = `${SITE_ORIGIN}/#website`;

function organizationAndWebsite() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "Attelier.dev",
        url: `${SITE_ORIGIN}/`,
        description:
          "Attelier.dev provides web development, cloud and DevOps, graphic design, and technical writing.",
        logo: {
          "@type": "ImageObject",
          url: `${SITE_ORIGIN}/images/logo.png`,
        },
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: "Attelier.dev",
        url: `${SITE_ORIGIN}/`,
        inLanguage: "en",
        publisher: { "@id": organizationId },
      },
    ],
  };
}

function projectCreativeWork(project, pathname) {
  const url = new URL(pathname, SITE_ORIGIN).toString();
  const creativeWork = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${url}#project`,
    name: project.title,
    description: project.caseStudy?.overview || project.fullDescription || project.description,
    url,
    isPartOf: { "@id": websiteId },
  };

  if (Array.isArray(project.caseStudy?.creators) && project.caseStudy.creators.length > 0) {
    creativeWork.creator = project.caseStudy.creators.map((name) => ({
      "@type": "Person",
      name,
    }));
  }

  if (isLocalProjectAsset(project.architectureImage)) {
    creativeWork.image = new URL(project.architectureImage, SITE_ORIGIN).toString();
  }

  return creativeWork;
}

export function getStructuredData(pathname, projectList = projects) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (normalizedPath === "/") return organizationAndWebsite();

  const project = projectList.find(
    (item) => item.published && normalizedPath === `/projects/${item.id}`,
  );
  return project ? projectCreativeWork(project, normalizedPath) : null;
}

export function serializeStructuredData(structuredData) {
  return JSON.stringify(structuredData).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
