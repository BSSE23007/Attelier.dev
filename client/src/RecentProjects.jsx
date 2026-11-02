
import { useState } from "react";
import {
  ArrowUpRight,
  Play,
  Code2,
  Cloud,
  ExternalLink,
} from "lucide-react";

const projects = [
  {
    id: 1,
    title: "EstateCore",
    category: "Web Development",
    type: "web",
    description:
      "A real estate platform concept featuring property listings and a modern browsing experience.",
    technologies: ["React", "Node.js", "MongoDB"],
    video: "/videos/estatecore-demo.mp4",
    poster: "/images/estatecore-preview.jpg",
    liveUrl: "",
    caseStudyUrl: "",
  },
  {
    id: 2,
    title: "Cloud Engineering Showcase",
    category: "Cloud & DevOps",
    type: "cloud",
    description:
      "A walkthrough of cloud architecture, deployment workflows and infrastructure decisions.",
    technologies: ["AWS", "Docker", "CI/CD"],
    video: "/videos/cloud-demo.mp4",
    poster: "/images/cloud-preview.jpg",
    liveUrl: "",
    caseStudyUrl: "",
  },
  {
    id: 3,
    title: "Web Application Showcase",
    category: "Web Development",
    type: "web",
    description:
      "A product walkthrough highlighting responsive layouts, useful features and application flow.",
    technologies: ["React", "Express", "API"],
    video: "/videos/webapp-demo.mp4",
    poster: "/images/webapp-preview.jpg",
    liveUrl: "",
    caseStudyUrl: "",
  },
];

const filters = [
  { label: "All projects", value: "all" },
  { label: "Web development", value: "web" },
  { label: "Cloud & DevOps", value: "cloud" },
];

function RecentProjects() {
  const [activeFilter, setActiveFilter] = useState("all");

  const visibleProjects =
    activeFilter === "all"
      ? projects
      : projects.filter((project) => project.type === activeFilter);

  return (
    <section className="projects-section" id="work">
      <div className="projects-container">
        <div className="projects-heading">
          <div>
            <span className="section-label">SELECTED WORK</span>
            <h2>
              Real work.
              <br />
              <span className="light-gradient-text">
                Demonstrated in action.
              </span>
            </h2>
            <p>
              Explore project walkthroughs, the technology behind each
              build and the solutions we create.
            </p>
          </div>

          <a className="projects-all-link" href="#contact">
            Have a project in mind? <ArrowUpRight size={17} />
          </a>
        </div>

        <div className="project-filters" aria-label="Filter projects">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`project-filter ${
                activeFilter === filter.value ? "active" : ""
              }`}
              aria-pressed={activeFilter === filter.value}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="projects-grid">
          {visibleProjects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-media">
                {project.video ? (
                  <video
                    controls
                    preload="none"
                    playsInline
                    poster={project.poster}
                    aria-label={`${project.title} video demonstration`}
                  >
                    <source src={project.video} type="video/mp4" />
                    Your browser does not support video playback.
                  </video>
                ) : (
                  <div className="project-media-placeholder">
                    {project.type === "cloud" ? (
                      <Cloud size={38} />
                    ) : (
                      <Code2 size={38} />
                    )}
                    <span>Project preview coming soon</span>
                  </div>
                )}
                <span className="project-category">{project.category}</span>
              </div>

              <div className="project-card-body">
                <div className="project-title-row">
                  <h3>{project.title}</h3>
                  <ArrowUpRight size={19} />
                </div>

                <p>{project.description}</p>

                <div className="project-tech">
                  {project.technologies.map((technology) => (
                    <span key={technology}>{technology}</span>
                  ))}
                </div>

                <div className="project-actions">
                  {project.liveUrl ? (
                    <a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Live demo <ExternalLink size={15} />
                    </a>
                  ) : (
                    <span className="project-link-disabled">
                      Live demo coming soon
                    </span>
                  )}

                  {project.caseStudyUrl && (
                    <a href={project.caseStudyUrl}>
                      Case study <ArrowUpRight size={15} />
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="projects-bottom-cta">
          <div>
            <span className="section-label">YOUR NEXT PROJECT</span>
            <h3>Let's build something worth showing.</h3>
          </div>
          <a className="button button-primary" href="#contact">
            Discuss your project <Play size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

export default RecentProjects;
