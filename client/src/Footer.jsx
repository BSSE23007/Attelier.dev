
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Mail,
} from "lucide-react";

const socialProfiles = [
  { name: "Facebook", url: "https://www.facebook.com/your-page", Icon: FacebookMark },
  { name: "Instagram", url: "https://www.instagram.com/your-profile", Icon: InstagramMark },
  { name: "LinkedIn", url: "https://www.linkedin.com/company/your-company", Icon: LinkedInMark },
  { name: "GitHub", url: "https://github.com/your-organization", Icon: GitHubMark },
];

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.019 4.388 11.005 10.125 11.854v-8.385H7.078v-3.469h3.047V9.429c0-3.017 1.792-4.687 4.533-4.687 1.312 0 2.686.236 2.686.236v2.953h-1.513c-1.49 0-1.955.93-1.955 1.886v2.256h3.328l-.532 3.469h-2.796v8.385C19.612 23.078 24 18.092 24 12.073Z" />
    </svg>
  );
}

function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.6" cy="6.7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 .297a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.42-1.305.763-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.116-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 6.004 0c2.29-1.552 3.292-1.23 3.292-1.23.66 1.653.256 2.873.126 3.176.77.84 1.23 1.91 1.23 3.22 0 4.61-2.807 5.625-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.216.694.825.576A12.01 12.01 0 0 0 12 .297Z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-about">
          <Link className="brand footer-brand" to="/">
            <img
              className="brand-logo"
              src="/images/logo-icon.png"
              alt=""
            />
            <span className="brand-name">
              Attelier<span>.dev</span>
            </span>
          </Link>

          <p>
            Ideas into products. Products built to scale.
            We build thoughtful digital experiences and
            reliable technology for ambitious businesses.
          </p>

          <div className="footer-email-group">
            <a className="footer-email" href="mailto:attelier.dev@gmail.com">
              <Mail size={17} />
              attelier.dev@gmail.com
              <ArrowUpRight size={15} />
            </a>
            <a className="gmail-compose" href="https://mail.google.com/mail/?view=cm&fs=1&to=attelier.dev%40gmail.com" target="_blank" rel="noreferrer">
              Open Gmail compose <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="footer-column">
          <h2>Explore</h2>
          <Link to="/">Home</Link>
          <Link to="/#services">Services</Link>
          <Link to="/#work">Our Work</Link>
          <Link to="/#process">Our Technology</Link>
          <Link to="/contact">Contact Us</Link>
        </div>

        <div className="footer-column">
          <h2>Our Services</h2>
          <Link to="/#service-web-development">Web Development</Link>
          <Link to="/#service-cloud-devops">Cloud & DevOps</Link>
          <Link to="/#service-graphic-design">Graphic Design</Link>
          <Link to="/#service-technical-writing">Technical Writing</Link>
        </div>

        <div className="footer-column footer-social">
          <h2>Connect</h2>
          <p>Have an idea? Let's start a conversation.</p>

          <Link className="footer-project-link" to="/contact">
            Start a project <ArrowRight size={16} />
          </Link>

          <div className="footer-social-links" role="group" aria-label="Social media links">
            {socialProfiles.map((profile) => (
              <a
                className={`footer-social-link footer-social-link-${profile.name.toLowerCase()}`}
                href={profile.url}
                key={profile.name}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Attelier.dev on ${profile.name} (placeholder link)`}
                title={`${profile.name} (placeholder link)`}
              >
                <profile.Icon />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Attelier.dev.
          All rights reserved.
        </span>
      </div>
    </footer>
  );
}
