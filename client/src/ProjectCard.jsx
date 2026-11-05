import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Code2, Cloud, Pause, Play } from "lucide-react";
import { isLocalProjectAsset } from "./projectMedia";

function releasePreview(video) {
  if (!video) return;

  const source = video.querySelector("source");
  const hasSource = video.hasAttribute("src") || source?.hasAttribute("src");
  video.pause();

  if (!hasSource) return;

  try {
    video.currentTime = 0;
  } catch {
    // A preview that has not loaded metadata may not support seeking yet.
  }
  source?.removeAttribute("src");
  video.removeAttribute("src");
  video.load();
}

function ProjectCard({ project }) {
  const videoRef = useRef(null);
  const playbackRequest = useRef(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const coverImage = isLocalProjectAsset(project.coverImage) ? project.coverImage : "";
  const previewVideo = isLocalProjectAsset(project.previewVideo) ? project.previewVideo : "";
  const poster = isLocalProjectAsset(project.poster) ? project.poster : coverImage;
  const technologies = project.technologies || [];
  const visibleTechnologies = technologies.slice(0, 4);
  const remainingTechnologies = technologies.slice(4);

  useEffect(() => () => {
    playbackRequest.current += 1;
    releasePreview(videoRef.current);
  }, []);

  async function playPreview() {
    const video = videoRef.current;
    if (!video || !previewVideo) return;
    const request = ++playbackRequest.current;

    document.querySelectorAll("video.project-preview").forEach((otherVideo) => {
      if (otherVideo !== video) releasePreview(otherVideo);
    });

    try {
      const source = video.querySelector("source");
      if (source && !source.hasAttribute("src")) {
        source.setAttribute("src", source.dataset.src || previewVideo);
        video.load();
      }
      await video.play();
      if (playbackRequest.current === request && source?.hasAttribute("src")) {
        setIsPlayingPreview(true);
      }
    } catch {
      if (playbackRequest.current === request) {
        releasePreview(video);
        setIsPlayingPreview(false);
      }
    }
  }

  function pausePreview() {
    const video = videoRef.current;
    if (!video) return;
    playbackRequest.current += 1;
    releasePreview(video);
    setIsPlayingPreview(false);
  }

  function handleMouseEnter() {
    if (previewVideo && typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches) {
      void playPreview();
    }
  }

  return (
    <article
      className="project-card"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={pausePreview}
    >
      <Link className="project-card-open" to={`/projects/${project.id}`} aria-label={`View ${project.title} project`}>
        <div className={`project-media${!previewVideo && !coverImage ? " is-empty" : ""}`}>
          {previewVideo ? (
            <>
              {poster ? (
                <img className={`project-media-poster${isPlayingPreview ? " is-hidden" : ""}`} src={poster} alt={`${project.title} project preview`} loading="lazy" />
              ) : (
                <div className="project-media-placeholder project-video-placeholder" role="img" aria-label={`${project.title} video preview available`}>
                  {project.filter === "cloud" ? <Cloud size={32} /> : <Code2 size={32} />}
                  <span>Video preview available</span>
                </div>
              )}
              <video
                ref={videoRef}
                className={`project-preview${isPlayingPreview ? " is-playing" : ""}`}
                muted
                loop
                playsInline
                preload="none"
                poster={poster || undefined}
                aria-hidden="true"
                tabIndex={-1}
                onPause={() => setIsPlayingPreview(false)}
              >
                <source data-src={previewVideo} type="video/mp4" />
                Your browser does not support video playback.
              </video>
            </>
          ) : coverImage ? (
            <img className="project-cover" src={coverImage} alt={`${project.title} project cover`} loading="lazy" />
          ) : (
            <div className="project-media-placeholder" role="img" aria-label={`${project.title} project preview coming soon`}>
              {project.filter === "cloud" ? <Cloud size={38} /> : <Code2 size={38} />}
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
            {visibleTechnologies.map((technology) => (
              <span key={technology}>{technology}</span>
            ))}
            {remainingTechnologies.length > 0 && (
              <span
                className="project-tech-more"
                title={remainingTechnologies.join(", ")}
                aria-label={`${remainingTechnologies.length} more technologies: ${remainingTechnologies.join(", ")}`}
              >
                +{remainingTechnologies.length}
              </span>
            )}
          </div>
          <div className="project-actions">
            <span className="project-details-link">View project <ArrowUpRight size={15} /></span>
          </div>
        </div>
      </Link>

      {previewVideo && (
        <button
          type="button"
          className="project-preview-toggle"
          aria-label={`${isPlayingPreview ? "Pause" : "Play"} ${project.title} preview`}
          onClick={(event) => {
            event.stopPropagation();
            if (isPlayingPreview) pausePreview();
            else void playPreview();
          }}
        >
          {isPlayingPreview ? <Pause size={16} /> : <Play size={16} />}
        </button>
      )}
    </article>
  );
}

export default ProjectCard;
