
import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";

import Contact from "./Contact";
import Navbar from "./Navbar";
import Footer from "./Footer";
import BackToTop from "./BackToTop";
import RecentProjects from "./RecentProjects";
import {
  AdminGuard,
  AdminInquiryDetailsPage,
  AdminInquiryListPage,
  AdminLayout,
  AdminLoginPage,
  AdminOverviewPage,
  AdminSecurityPage,
} from "./admin/AdminPages";

import {
  ArrowRight,
  Code2,
  Cloud,
  Palette,
  FileText,
  CheckCircle2,
} from "lucide-react";

import "./App.css";

// Services displayed on the homepage
const services = [
  {
    number: "01",
    icon: Code2,
    title: "Web Development",
    description:
      "Modern, responsive web applications built around your business needs.",
    tags: ["MERN Stack", "APIs", "Full-Stack"],
  },
  {
    number: "02",
    icon: Cloud,
    title: "Cloud & DevOps",
    description:
      "Reliable cloud infrastructure, smooth deployments and scalable systems.",
    tags: ["AWS", "Docker", "CI/CD"],
  },
  {
    number: "03",
    icon: Palette,
    title: "Graphic Design",
    description:
      "Distinctive visual identities and digital assets that make your brand stand out.",
    tags: ["Branding", "UI Assets", "Creative"],
  },
  {
    number: "04",
    icon: FileText,
    title: "Technical Writing",
    description:
      "Clear technical documentation, editing and professional proofreading.",
    tags: ["Documentation", "Editing", "Reports"],
  },
];

// Scroll to the correct section when a URL contains a hash.
// Example: /#services or /#work
function HashScroll() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({
        top: 0,
        behavior: "auto",
      });
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const sectionId = decodeURIComponent(hash.slice(1));
      const section = document.getElementById(sectionId);

      if (section) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        section.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    }, 100);

    return () => window.clearTimeout(timer);
  }, [pathname, hash]);

  return null;
}

// Homepage
function Home() {
  useEffect(() => {
    const elements = document.querySelectorAll(
      ".section-heading, .service-card, .projects-heading, .project-card, .projects-bottom-cta, .technology-section > *, .contact-content > *"
    );
    elements.forEach((element) => element.setAttribute("data-reveal", ""));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="site-wrapper">
      <Navbar />

      <main>
        {/* HERO */}
        <section className="hero" id="home">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="status-dot" />
              DIGITAL ENGINEERING STUDIO
            </div>

            <h1>
              We turn ambitious ideas into{" "}
              <span className="gradient-text">
                digital reality.
              </span>
            </h1>

            <p className="hero-description">
              We build modern web applications and reliable cloud
              infrastructure to help businesses launch, operate and grow.
            </p>

            <div className="hero-actions">
              <Link
                className="button button-primary"
                to="/contact"
              >
                Start a project <ArrowRight size={18} />
              </Link>

              <Link
                className="button button-secondary"
                to="/#work"
              >
                Explore our work
              </Link>
            </div>

            <div className="hero-note">
              <CheckCircle2 size={17} />
              <span>
                Built with purpose. Engineered for growth.
              </span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-glow" />

            <div className="code-window">
              <div className="window-header">
                <div className="window-dots">
                  <span />
                  <span />
                  <span />
                </div>

                <span className="window-label">
                  attelier.config
                </span>
              </div>

              <div className="code-content">
                <div>
                  <span className="line-number">01</span>
                  <span className="code-purple">const</span>{" "}
                  <span className="code-blue">vision</span> = {"{"}
                </div>

                <div>
                  <span className="line-number">02</span>
                  &nbsp;&nbsp;build:{" "}
                  <span className="code-green">
                    "web applications"
                  </span>,
                </div>

                <div>
                  <span className="line-number">03</span>
                  &nbsp;&nbsp;deploy:{" "}
                  <span className="code-green">
                    "the cloud"
                  </span>,
                </div>

                <div>
                  <span className="line-number">04</span>
                  &nbsp;&nbsp;scale:{" "}
                  <span className="code-orange">true</span>,
                </div>

                <div>
                  <span className="line-number">05</span>
                  {"};"}
                </div>

                <div className="code-spacer" />

                <div>
                  <span className="line-number">06</span>
                  <span className="code-purple">
                    export default
                  </span>{" "}
                  <span className="code-blue">Attelier</span>;
                </div>
              </div>

              <div className="window-footer">
                <span>
                  <span className="status-dot" /> Ready to build
                </span>
                <span>JavaScript · Cloud</span>
              </div>
            </div>

            <div className="floating-card floating-top">
              <span className="floating-icon blue-icon">
                <Code2 size={20} />
              </span>

              <div>
                <strong>Full-stack</strong>
                <small>Web applications</small>
              </div>
            </div>

            <div className="floating-card floating-bottom">
              <span className="floating-icon cyan-icon">
                <Cloud size={20} />
              </span>

              <div>
                <strong>Cloud ready</strong>
                <small>Built to scale</small>
              </div>
            </div>
          </div>

          <div className="hero-decoration decoration-one" />
          <div className="hero-decoration decoration-two" />
        </section>

        {/* TRUST STRIP */}
        <section className="trust-strip">
          <span>ENGINEERING FOCUSED</span>
          <span className="trust-separator" />
          <span>MODERN TECHNOLOGY</span>
          <span className="trust-separator" />
          <span>BUILT FOR GROWTH</span>
        </section>

        {/* SERVICES */}
        <section
          className="services section-light"
          id="services"
        >
          <div className="section-heading">
            <span className="section-label">WHAT WE DO</span>

            <h2>
              Technology that moves
              <br />
              <span className="light-gradient-text">
                your business forward.
              </span>
            </h2>

            <p>
              From your first idea to production-ready systems,
              we help turn complex challenges into practical solutions.
            </p>
          </div>

          <div className="service-grid">
            {services.map((service) => {
              const Icon = service.icon;

              return (
                <article
                  className="service-card"
                  key={service.number}
                >
                  <div className="service-card-top">
                    <div className="service-icon">
                      <Icon size={24} />
                    </div>

                    <span className="service-number">
                      {service.number}
                    </span>
                  </div>

                  <h3>{service.title}</h3>
                  <p>{service.description}</p>

                  <div className="service-tags">
                    {service.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>

                  <Link
                    className="service-link"
                    to="/contact"
                  >
                    Discuss your project{" "}
                    <ArrowRight size={16} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        {/* PROJECTS */}
        <div id="work">
          <RecentProjects />
        </div>

        {/* TECHNOLOGY */}
        <section
          className="technology-section"
          id="process"
        >
          <span className="section-label">OUR TECHNOLOGY</span>

          <h2>The right tools. The right foundation.</h2>

          <p>
            We choose technologies based on your requirements,
            not just the latest trend.
          </p>

          <div className="tech-list">
            {[
              "React",
              "Node.js",
              "Express",
              "MongoDB",
              "AWS",
              "Docker",
            ].map((tech) => (
              <span className="tech-pill" key={tech}>
                {tech}
              </span>
            ))}
          </div>
        </section>

        {/* HOMEPAGE CONTACT CTA */}
        <section
          className="contact-section"
          id="contact"
        >
          <div className="contact-content">
            <span className="section-label">
              LET'S BUILD SOMETHING
            </span>

            <h2>
              Your next idea deserves a solid foundation.
            </h2>

            <p>
              Tell us what you're planning. Let's explore the right
              technology, approach and next steps together.
            </p>

            <Link
              className="button button-primary"
              to="/contact"
            >
              Start a conversation <ArrowRight size={18} />
            </Link>

            <small className="contact-note">
              Have a project in mind? Tell us about it on our
              contact page.
            </small>
          </div>
        </section>
      </main>

      <Footer />
      <BackToTop />
    </div>
  );
}

// App routes
export default function App() {
  return (
    <BrowserRouter>
      <HashScroll />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="inquiries" element={<AdminInquiryListPage />} />
            <Route path="inquiries/:id" element={<AdminInquiryDetailsPage />} />
          <Route path="security" element={<AdminSecurityPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
