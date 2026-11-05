import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import ProjectCard from "./ProjectCard";

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function FeaturedProjectsCarousel({ projects = [], onSelectProject, intervalMs = 6000 }) {
  const featuredProjects = projects.filter((project) => project.published && project.featured);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);
  const dragStartX = useRef(null);
  const dragMoved = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = (event) => setReduceMotion(event.matches);
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  const currentIndex = Math.min(activeIndex, Math.max(0, featuredProjects.length - 1));

  useEffect(() => {
    if (
      featuredProjects.length < 2
      || reduceMotion
      || isHovered
      || isFocused
      || isManuallyPaused
    ) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (Math.min(index, featuredProjects.length - 1) + 1) % featuredProjects.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [featuredProjects.length, intervalMs, reduceMotion, isHovered, isFocused, isManuallyPaused]);

  if (featuredProjects.length === 0) return null;

  function previous() {
    setActiveIndex((index) => (Math.min(index, featuredProjects.length - 1) - 1 + featuredProjects.length) % featuredProjects.length);
  }

  function next() {
    setActiveIndex((index) => (Math.min(index, featuredProjects.length - 1) + 1) % featuredProjects.length);
  }

  function handlePointerOver(event) {
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setIsHovered(true);
  }

  function handlePointerOut(event) {
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setIsHovered(false);
  }

  return (
    <section
      className="featured-projects"
      aria-label="Featured projects carousel"
      aria-roledescription="carousel"
      tabIndex={0}
      onMouseOver={handlePointerOver}
      onMouseOut={handlePointerOut}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onFocus={() => setIsFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          previous();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          next();
        }
      }}
      onPointerDown={(event) => {
        if (event.isPrimary) {
          dragMoved.current = false;
          dragStartX.current = event.clientX;
        }
      }}
      onPointerUp={(event) => {
        if (dragStartX.current === null) return;
        const distance = event.clientX - dragStartX.current;
        dragStartX.current = null;
        if (Math.abs(distance) >= 48) {
          dragMoved.current = true;
          distance < 0 ? next() : previous();
        }
      }}
      onPointerCancel={() => {
        dragStartX.current = null;
        dragMoved.current = false;
      }}
      onClickCapture={(event) => {
        if (!dragMoved.current) return;
        event.preventDefault();
        event.stopPropagation();
        dragMoved.current = false;
      }}
    >
      <div className="featured-projects-heading">
        <div>
          <span className="section-label">FEATURED PROJECT</span>
          <h3>Work worth a closer look.</h3>
        </div>
        {featuredProjects.length > 1 && (
          <div className="featured-carousel-controls">
            <button type="button" aria-label="Previous featured project" onClick={previous}>
              <ChevronLeft size={19} />
            </button>
            <button
              type="button"
              aria-label={isManuallyPaused ? "Resume carousel rotation" : "Pause carousel rotation"}
              onClick={() => setIsManuallyPaused((paused) => !paused)}
            >
              {isManuallyPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button type="button" aria-label="Next featured project" onClick={next}>
              <ChevronRight size={19} />
            </button>
          </div>
        )}
      </div>

      <div className="featured-carousel-viewport" aria-live="off">
        <div
          className={`featured-track${reduceMotion ? " reduced-motion" : ""}`}
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {featuredProjects.map((project, index) => (
            <div
              className="featured-slide"
              key={project.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${featuredProjects.length}: ${project.title}`}
              aria-hidden={index !== currentIndex}
              inert={index !== currentIndex}
            >
              <ProjectCard project={project} onOpen={onSelectProject} featured />
            </div>
          ))}
        </div>
      </div>

      {featuredProjects.length > 1 && (
        <div className="featured-carousel-dots" aria-label="Choose featured project">
          {featuredProjects.map((project, index) => (
            <button
              type="button"
              key={project.id}
              aria-label={`Show featured project ${index + 1}: ${project.title}`}
              aria-current={index === currentIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default FeaturedProjectsCarousel;
