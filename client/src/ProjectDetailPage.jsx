import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Image as ImageIcon, Play } from "lucide-react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import BackToTop from "./BackToTop";
import ProjectCaseStudy from "./ProjectCaseStudy";
import { getPublishedProjects, projects } from "./data/projects";
import { isLocalProjectAsset, safeLiveUrl, youtubeEmbedUrl } from "./projectMedia";

function ProjectMedia({ project }) {
  const [videoReady, setVideoReady] = useState(false);
  const cover = isLocalProjectAsset(project.coverImage) ? project.coverImage : "";
  const video = isLocalProjectAsset(project.previewVideo) ? project.previewVideo : "";
  const poster = isLocalProjectAsset(project.poster) ? project.poster : cover;
  const youtube = youtubeEmbedUrl(project.youtubeUrl);

  if (youtube) {
    return <iframe className="project-page-media-frame" src={youtube} title={`${project.title} video demonstration`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />;
  }
  if (video && !poster && !videoReady) {
    return (
      <button className="project-page-video-trigger" type="button" onClick={() => setVideoReady(true)} aria-label={`Load ${project.title} video demonstration`}>
        <Play size={26} aria-hidden="true" />
        <span>Load video demonstration</span>
      </button>
    );
  }
  if (video) {
    return <video className="project-page-media-video" controls playsInline preload="none" poster={poster || undefined} aria-label={`${project.title} video demonstration`}><source src={video} type="video/mp4" />Your browser does not support video playback.</video>;
  }
  if (cover) return <img className="project-page-cover" src={cover} alt={`${project.title} project preview`} loading="lazy" />;

  return (
    <div className="project-page-media-placeholder" role="img" aria-label={`${project.title} media preview not yet available`}>
      <ImageIcon size={30} aria-hidden="true" />
      <span>Project media coming soon</span>
    </div>
  );
}

function ProjectDetailPage() {
  const { slug } = useParams();
  const project = getPublishedProjects(projects).find((item) => item.id === slug);

  if (!project) {
    return (
      <div className="site-wrapper">
        <Navbar />
        <main className="project-page-main project-not-found">
          <span className="section-label">PROJECT</span>
          <h1>Project not found</h1>
          <p>This project may have moved or is no longer available.</p>
          <Link className="button button-secondary" to="/#work"><ArrowLeft size={17} /> Back to projects</Link>
        </main>
        <Footer />
        <BackToTop />
      </div>
    );
  }

  const resources = (project.caseStudy?.resources || []).flatMap((resource) => {
    const href = safeLiveUrl(resource.href);
    return href ? [{ ...resource, href }] : [];
  });
  const liveUrl = safeLiveUrl(project.liveUrl);

  return (
    <div className="site-wrapper">
      <Navbar />
      <main className="project-page-main">
        <Link className="project-page-back" to="/#work"><ArrowLeft size={16} /> Back to projects</Link>
        <header className="project-page-hero">
          <div className="project-page-intro">
            <span className="section-label">{project.category}</span>
            <h1>{project.title}</h1>
            <p>{project.fullDescription || project.description}</p>
            <div className="project-page-actions">
              {liveUrl && <a className="button button-primary" href={liveUrl} target="_blank" rel="noopener noreferrer">Open live project <ArrowUpRight size={16} /></a>}
              {resources.map((resource) => <a className="button button-secondary" key={resource.href} href={resource.href} target="_blank" rel="noopener noreferrer">{resource.label} <ArrowUpRight size={16} /></a>)}
            </div>
          </div>
          <div className="project-page-media"><ProjectMedia project={project} /></div>
        </header>

        {(project.gallery || []).some((item) => isLocalProjectAsset(typeof item === "string" ? item : item?.src)) && (
          <section className="project-page-gallery" aria-label={`${project.title} image gallery`}>
            {(project.gallery || []).map((item) => {
              const src = typeof item === "string" ? item : item?.src;
              if (!isLocalProjectAsset(src)) return null;
              const alt = typeof item === "string" ? `${project.title} project image` : item.alt || `${project.title} project image`;
              return <details className="project-page-gallery-item" key={src}><summary><img src={src} alt={alt} loading="lazy" /></summary><img className="project-page-gallery-expanded" src={src} alt={alt} loading="lazy" /></details>;
            })}
          </section>
        )}

        <ProjectCaseStudy project={project} />
      </main>
      <Footer />
      <BackToTop />
    </div>
  );
}

export default ProjectDetailPage;
