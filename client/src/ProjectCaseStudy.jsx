import {
  Activity,
  ArrowRight,
  ChartNoAxesCombined,
  Database,
  Image,
  KeyRound,
  Layers,
  Network,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Type,
  Users,
  Zap,
} from "lucide-react";
import { isLocalProjectAsset, safeLiveUrl } from "./projectMedia";

const featureIcons = {
  activity: Activity,
  chart: ChartNoAxesCombined,
  database: Database,
  image: Image,
  key: KeyRound,
  layers: Layers,
  network: Network,
  scan: Search,
  server: Server,
  shield: ShieldCheck,
  sparkles: Sparkles,
  type: Type,
  users: Users,
  zap: Zap,
};

function CaseStudySection({ project, section, index }) {
  const sectionId = `${project.id}-case-study-${index}`;

  if (section.type === "workflow") {
    return (
      <section className="case-study-section" aria-labelledby={`${sectionId}-title`}>
        <div className="case-study-section-heading">
          <span className="case-study-index">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2 id={`${sectionId}-title`}>{section.title}</h2>
            {section.description && <p>{section.description}</p>}
          </div>
        </div>
        <ol className="case-study-workflow">
          {(section.steps || []).map((step, stepIndex) => (
            <li key={`${step.title}-${stepIndex}`}>
              <span className="case-study-step-number">{String(stepIndex + 1).padStart(2, "0")}</span>
              <div><h3>{step.title}</h3><p>{step.description}</p></div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (section.type === "architecture") {
    const diagram = isLocalProjectAsset(section.imagePath)
      ? section.imagePath
      : isLocalProjectAsset(project.architectureImage) ? project.architectureImage : "";
    return (
      <section className="case-study-section" aria-labelledby={`${sectionId}-title`}>
        <div className="case-study-section-heading">
          <span className="case-study-index">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2 id={`${sectionId}-title`}>{section.title}</h2>
            {section.description && <p>{section.description}</p>}
          </div>
        </div>
        <div className={`case-study-architecture ${section.layout === "pipeline" ? "is-pipeline" : "is-grid"}`}>
          {(section.nodes || []).map((node, nodeIndex) => (
            <div className="case-study-architecture-node" key={`${node.title}-${nodeIndex}`}>
              {section.layout === "pipeline" && <span className="case-study-node-number">{String(nodeIndex + 1).padStart(2, "0")}</span>}
              {section.layout === "pipeline" && nodeIndex < section.nodes.length - 1 && <ArrowRight className="case-study-node-arrow" size={17} aria-hidden="true" />}
              <h3>{node.title}</h3>
              <p>{node.description}</p>
            </div>
          ))}
        </div>
        {diagram && (
          <details className="case-study-diagram-details">
            <summary>Expand architecture diagram</summary>
            <img src={diagram} alt={section.imageAlt || `${project.title} architecture diagram`} loading="lazy" />
          </details>
        )}
        {section.note && <p className="case-study-note">{section.note}</p>}
      </section>
    );
  }

  if (section.type === "features") {
    return (
      <section className="case-study-section" aria-labelledby={`${sectionId}-title`}>
        <div className="case-study-section-heading">
          <span className="case-study-index">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2 id={`${sectionId}-title`}>{section.title}</h2>
            {section.description && <p>{section.description}</p>}
          </div>
        </div>
        <div className="case-study-feature-grid">
          {(section.items || []).map((item) => {
            const Icon = featureIcons[item.icon] || Sparkles;
            return (
              <article className="case-study-feature" key={item.title}>
                <span className="case-study-feature-icon"><Icon size={19} aria-hidden="true" /></span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (section.type === "callout") {
    return (
      <section className={`case-study-callout ${section.tone || ""}`} aria-labelledby={`${sectionId}-title`}>
        <h2 className="section-label" id={`${sectionId}-title`}>{section.title}</h2>
        <strong>{section.value}</strong>
        <p>{section.content}</p>
      </section>
    );
  }

  if (section.type === "prose") {
    return (
      <section className="case-study-section" aria-labelledby={`${sectionId}-title`}>
        <div className="case-study-section-heading">
          <span className="case-study-index">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2 id={`${sectionId}-title`}>{section.title}</h2>
            {section.description && <p>{section.description}</p>}
          </div>
        </div>
        <div className="case-study-prose">
          {(section.paragraphs || []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        </div>
      </section>
    );
  }

  return null;
}

function ProjectCaseStudy({ project }) {
  const caseStudy = project.caseStudy;
  if (!caseStudy) return null;

  const resources = (caseStudy.resources || []).flatMap((resource) => {
    const href = safeLiveUrl(resource.href);
    return href ? [{ ...resource, href }] : [];
  });

  return (
    <div className="project-case-study">
      {caseStudy.metadata?.length > 0 && (
        <dl className="case-study-metadata">
          {caseStudy.metadata.map(({ label, value }) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}

      {caseStudy.highlights?.length > 0 && (
        <div className="case-study-highlights">
          {caseStudy.highlights.map((highlight) => (
            <article className="case-study-highlight" key={`${highlight.value}-${highlight.label}`}>
              <strong>{highlight.value}</strong>
              <span>{highlight.label}</span>
              {highlight.note && <p>{highlight.note}</p>}
            </article>
          ))}
        </div>
      )}

      {caseStudy.overview && (
        <section className="case-study-overview" aria-labelledby={`${project.id}-overview-title`}>
          <span className="section-label">PROJECT OVERVIEW</span>
          <h2 id={`${project.id}-overview-title`}>The brief and approach</h2>
          <p>{caseStudy.overview}</p>
        </section>
      )}

      {(caseStudy.sections || []).map((section, index) => (
        <CaseStudySection key={`${section.type}-${section.title}`} project={project} section={section} index={index} />
      ))}

      {project.technologies?.length > 0 && (
        <section className="project-detail-technologies">
          <h2>Technology stack</h2>
          <div className="case-study-tech-list">
            {project.technologies.map((technology) => <span key={technology}>{technology}</span>)}
          </div>
        </section>
      )}

      {resources.length > 0 && (
        <section className="project-detail-resources" aria-labelledby={`${project.id}-resources-title`}>
          <h2 id={`${project.id}-resources-title`}>Demonstration and project resources</h2>
          <ul>
            {resources.map((resource) => (
              <li key={resource.href}>
                <a href={resource.href} target="_blank" rel="noopener noreferrer">
                  {resource.label} <ArrowRight size={15} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default ProjectCaseStudy;
