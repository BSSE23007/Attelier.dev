
import { Link } from "react-router-dom";
import {
  Layers3,
  ArrowUpRight,
  Mail,
  Code2,
  Users,
  Camera,
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-about">
          <Link className="brand footer-brand" to="/">
            <img
                className="brand-logo"
                src="/images/logo-icon.png"
                alt="Attelier.dev logo"
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

          <a className="footer-email" href="mailto:attelier.dev@gmail.com">
            <Mail size={17} />
            attelier.dev@gmail.com
            <ArrowUpRight size={15} />
          </a>
        </div>

        <div className="footer-column">
          <h3>Explore</h3>
          <Link to="/">Home</Link>
          <Link to="/#services">Services</Link>
          <Link to="/#work">Our Work</Link>
          <Link to="/#process">Our Technology</Link>
          <Link to="/contact">Contact Us</Link>
        </div>

        <div className="footer-column">
          <h3>Our Services</h3>
          <Link to="/#services">Web Development</Link>
          <Link to="/#services">Cloud & DevOps</Link>
          <Link to="/#services">Graphic Design</Link>
          <Link to="/#services">Technical Writing</Link>
        </div>

        <div className="footer-column footer-social">
          <h3>Connect</h3>
          <p>Have an idea? Let's start a conversation.</p>

          <a href="mailto:attelier.dev@gmail.com">
            <Mail size={17} /> Email us
          </a>

          <span className="social-coming-soon">
            <Code2 size={17} />
            <Users size={17} />
            <Camera size={17} />
            Social profiles coming soon
        </span>
        </div>
      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Attelier.dev.
          All rights reserved.
        </span>
        <a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}
