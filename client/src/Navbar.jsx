import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";

// Reusable site navigation
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 12);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className={`navbar${scrolled ? " navbar-scrolled" : ""}`}>
      <Link className="brand" to="/" onClick={closeMenu}>
      <img
        className="brand-logo"
        src="/images/logo-icon.png"
        alt="Attelier.dev logo"
      />
      </Link>

      <button
        className="mobile-menu-button"
        type="button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <nav id="primary-navigation" className={`nav-links ${menuOpen ? "nav-open" : ""}`} aria-label="Main navigation">
        <Link to="/" onClick={closeMenu}>
          Home
        </Link>

        <Link to="/#services" onClick={closeMenu}>
          Services
        </Link>

        <Link to="/#work" onClick={closeMenu}>
          Our Work
        </Link>

        <Link to="/#process" onClick={closeMenu}>
          Our Process
        </Link>

        <Link
          className="nav-cta"
          to="/contact"
          onClick={closeMenu}
        >
          Let's Talk <ArrowRight size={16} />
        </Link>
      </nav>
    </header>
  );
}

