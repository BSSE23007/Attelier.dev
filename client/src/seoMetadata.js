import { projects } from "./data/projects.js";

export const SITE_ORIGIN = "https://attelier.dev";

const publicPages = {
  "/": {
    title: "Attelier.dev | Web Development & Cloud Engineering",
    description:
      "Attelier.dev builds modern web applications and reliable cloud infrastructure for businesses, alongside digital design and technical writing.",
    openGraphType: "website",
  },
  "/contact": {
    title: "Contact Attelier.dev | Start a Project",
    description:
      "Discuss a web application, cloud infrastructure, design or technical writing project with Attelier.dev. Send an inquiry or contact us by email.",
    openGraphType: "website",
  },
  "/projects/estatecore": {
    title: "EstateCore | Real Estate Platform Concept — Attelier.dev",
    description:
      "Explore EstateCore, a real-estate platform concept for customer and agent listing workflows with a proposed AWS architecture; deployment is unverified.",
    openGraphType: "article",
  },
  "/projects/hospital-management": {
    title: "Hospital Management System Case Study | Attelier.dev",
    description:
      "Explore a MERN hospital management application with administrator and doctor roles, authentication and patient-management workflows.",
    openGraphType: "article",
  },
  "/projects/aws-threat-detection": {
    title: "AWS Threat Detection and IP Remediation | Attelier.dev",
    description:
      "An event-driven AWS security framework for log-based threat detection and automated IP remediation. About 1.2 seconds was reported in project simulation.",
    openGraphType: "article",
  },
  "/projects/client-motion-graphics": {
    title: "Client Promotional Motion Graphics | Attelier.dev",
    description:
      "A roughly 20-second GHANI GFX client promotional video by Ali Sher Afzal, built around a Research, Analyze, Buy sequence.",
    openGraphType: "article",
  },
};

const adminPages = {
  "/admin/login": "Administrator Sign In | Attelier.dev",
  "/admin": "Administrator Dashboard | Attelier.dev",
  "/admin/inquiries": "Inquiry Management | Attelier.dev",
  "/admin/security": "Account Security | Attelier.dev",
};

const notFoundPage = {
  title: "Page Not Found | Attelier.dev",
  description: "The requested Attelier.dev page could not be found.",
  openGraphType: "website",
  robots: "noindex, nofollow",
};

export function getPageMetadata(pathname) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (publicPages[normalizedPath]) {
    const url = new URL(normalizedPath, SITE_ORIGIN).toString();
    return { ...publicPages[normalizedPath], url, canonicalUrl: url, robots: "index, follow" };
  }

  if (normalizedPath.startsWith("/projects/")) {
    const slug = normalizedPath.slice("/projects/".length);
    const project = projects.find((item) => item.id === slug && item.published);
    if (project) {
      return {
        ...notFoundPage,
        title: `${project.title} | Attelier.dev`,
        description: project.fullDescription || project.description,
        url: new URL(normalizedPath, SITE_ORIGIN).toString(),
        canonicalUrl: new URL(normalizedPath, SITE_ORIGIN).toString(),
        robots: "index, follow",
        openGraphType: "article",
      };
    }
  }

  if (adminPages[normalizedPath] || normalizedPath.startsWith("/admin/")) {
    return {
      title: adminPages[normalizedPath] || "Administrator | Attelier.dev",
      description: "Attelier.dev administrator area.",
      openGraphType: "website",
      robots: "noindex, nofollow",
    };
  }

  return notFoundPage;
}

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.setAttribute("content", content);
}

export function applyPageMetadata(metadata) {
  document.title = metadata.title;
  setMeta("name", "description", metadata.description);
  setMeta("name", "robots", metadata.robots);
  setMeta("property", "og:title", metadata.title);
  setMeta("property", "og:description", metadata.description);
  setMeta("property", "og:type", metadata.openGraphType);
  setMeta("property", "og:site_name", "Attelier.dev");
  setMeta("property", "og:url", metadata.url);
  setMeta("property", "og:image", metadata.image);
  setMeta("name", "twitter:card", metadata.image ? "summary_large_image" : "summary");
  setMeta("name", "twitter:title", metadata.title);
  setMeta("name", "twitter:description", metadata.description);
  setMeta("name", "twitter:image", metadata.image);
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!metadata.canonicalUrl) {
    canonical?.remove();
  } else {
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.append(canonical);
    }
    canonical.setAttribute("href", metadata.canonicalUrl);
  }
}

export function renderMetadataTags(metadata) {
  const escape = (value) =>
    String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const tags = [
    `<title>${escape(metadata.title)}</title>`,
    `<meta name="description" content="${escape(metadata.description)}" />`,
    `<meta name="robots" content="${escape(metadata.robots)}" />`,
    `<meta property="og:title" content="${escape(metadata.title)}" />`,
    `<meta property="og:description" content="${escape(metadata.description)}" />`,
    `<meta property="og:type" content="${escape(metadata.openGraphType)}" />`,
    '<meta property="og:site_name" content="Attelier.dev" />',
    ...(metadata.url ? [`<meta property="og:url" content="${escape(metadata.url)}" />`] : []),
    ...(metadata.canonicalUrl ? [`<link rel="canonical" href="${escape(metadata.canonicalUrl)}" />`] : []),
    `<meta name="twitter:card" content="${metadata.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escape(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escape(metadata.description)}" />`,
  ];

  if (metadata.image) {
    tags.push(`<meta property="og:image" content="${escape(metadata.image)}" />`);
    tags.push(`<meta name="twitter:image" content="${escape(metadata.image)}" />`);
  }

  return tags.join("\n    ");
}
