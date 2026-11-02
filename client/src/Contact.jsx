import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import {
  ArrowRight,
  Mail,
  MessageSquare,
  Clock,
  Code2,
  Cloud,
  Palette,
  FileText,
} from "lucide-react";
import "./App.css";

const services = [
  "Web Development",
  "Cloud Engineering",
  "UI/UX & Graphic Design",
  "Technical Writing",
  "Other",
];

export default function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    service: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({
    type: "",
    message: "",
  });

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/inquiries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            service: form.service,
            message: form.message,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to submit your inquiry."
        );
      }

      setStatus({
        type: "success",
        message: "Thanks! Your project inquiry has been received.",
      });

      setForm({
        name: "",
        email: "",
        service: "",
        message: "",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error.message === "Failed to fetch"
            ? "Unable to reach the server. Please try again."
            : error.message || "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="contact-page">
      <div className="contact-back-row">
        <Link to="/" className="contact-back-button">
          <ArrowLeft size={18} />
          Back to Home
        </Link>
      </div>

      <section className="contact-hero">
        <span className="eyebrow">
          <MessageSquare size={15} /> LET'S TALK
        </span>

        <h1>
          Have a project in <span>mind?</span>
        </h1>

        <p>
          Tell us what you are building. We’ll help turn your
          idea into a thoughtful, scalable digital product.
        </p>
      </section>

      <section className="contact-layout">
        <div className="contact-info">
          <span className="eyebrow">GET IN TOUCH</span>
          <h2>Let's build something meaningful.</h2>
          <p>
            Whether you need a new website, cloud infrastructure,
            design support or technical documentation, we'd love
            to hear about your project.
          </p>

          <a
            className="contact-email"
            href="mailto:attelier.dev@gmail.com"
          >
            <Mail size={19} />
            attelier.dev@gmail.com
            <ArrowRight size={17} />
          </a>

          <div className="contact-detail">
            <Clock size={19} />
            <div>
              <strong>Our approach</strong>
              <p>Clear communication. Thoughtful engineering.</p>
            </div>
          </div>

          <div className="contact-services">
            <h3>What we can help with</h3>
            <div><Code2 size={17} /> Web Development</div>
            <div><Cloud size={17} /> Cloud Engineering</div>
            <div><Palette size={17} /> Design & Branding</div>
            <div><FileText size={17} /> Technical Writing</div>
          </div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit}>
          <h2>Tell us about your project</h2>
          <p>Fill in the details below to get started.</p>

          {status.message && (
            <p
              role="status"
              aria-live="polite"
              className={`contact-status ${status.type}`}
            >
              {status.message}
            </p>
          )}

          <label htmlFor="contact-name">Your name</label>
          <input
            id="contact-name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Enter your name"
            autoComplete="name"
            required
          />

          <label htmlFor="contact-email">Email address</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label htmlFor="contact-service">What do you need?</label>
          <select
            id="contact-service"
            name="service"
            value={form.service}
            onChange={handleChange}
            required
          >
            <option value="">Choose a service</option>
            {services.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>

          <label htmlFor="contact-message">Project details</label>
          <textarea
            id="contact-message"
            name="message"
            value={form.message}
            onChange={handleChange}
            placeholder="Tell us about your idea, goals and timeline..."
            rows={5}
            required
          />

          <button
            className="contact-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send project inquiry"}
            {!loading && <ArrowRight size={18} />}
          </button>

          <small>
            Your project details will be submitted securely for our team to review.
          </small>
        </form>
      </section>
    </main>
  );
}