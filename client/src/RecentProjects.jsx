
import { useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import { getPublishedProjects, projects } from "./data/projects";
import ProjectCard from "./ProjectCard";

const filters = [
  { label: "All projects", value: "all" },
  { label: "Web development", value: "web" },
  { label: "Cloud & DevOps", value: "cloud" },
  { label: "Motion graphics", value: "motion" },
];

function RecentProjects({ projectList = projects }) {
  const [activeFilter, setActiveFilter] = useState("all");

  const publishedProjects = getPublishedProjects(projectList);
  const visibleProjects = publishedProjects.filter(
    (project) => activeFilter === "all" || project.filter === activeFilter,
  );
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
            <ProjectCard project={project} key={project.id} />
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
