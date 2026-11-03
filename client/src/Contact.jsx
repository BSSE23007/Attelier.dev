import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import { ArrowLeft } from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
import Toast from "./Toast";
import { resolveApiBaseUrl, submitInquiry } from "./contactApi";
import { contactServices, inquiryFormSchema } from "./contactValidation";

const services = contactServices;

export default function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    service: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const submittingRef = useRef(false);

  const dismissToast = useCallback(() => setToast(null), []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }

  function handleBlur(event) {
    const { name, value } = event.target;
    const result = inquiryFormSchema.shape[name]?.safeParse(value);
    setErrors((previous) => {
      if (result?.success) {
        if (!previous[name]) return previous;
        const next = { ...previous };
        delete next[name];
        return next;
      }
      return { ...previous, [name]: result?.error.issues[0]?.message };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    const validation = inquiryFormSchema.safeParse(form);
    if (!validation.success) {
      setErrors(Object.fromEntries(validation.error.issues.map((issue) => [issue.path[0], issue.message])));
      setToast({ type: "error", message: "Please correct the highlighted fields and try again." });
      window.setTimeout(() => {
        document.querySelector(".contact-form [aria-invalid='true']")?.focus();
      }, 0);
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setErrors({});

    try {
      const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV);
      if (!apiBaseUrl) {
        throw new Error("Online inquiry submission is unavailable right now. Please use the email link instead.");
      }
      await submitInquiry(validation.data, { baseUrl: apiBaseUrl });
      setToast({
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
      setToast({ type: "error", message: error.message });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
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

          <div className="contact-email-group">
            <a className="contact-email" href="mailto:attelier.dev@gmail.com">
              <Mail size={19} />
              attelier.dev@gmail.com
              <ArrowRight size={17} />
            </a>
            <a className="gmail-compose" href="https://mail.google.com/mail/?view=cm&fs=1&to=attelier.dev%40gmail.com" target="_blank" rel="noreferrer">
              Open Gmail compose
            </a>
          </div>

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

        <form className="contact-form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
          <h2>Tell us about your project</h2>
          <p>Fill in the details below to get started.</p>

          <Toast message={toast?.message} type={toast?.type} onDismiss={dismissToast} />

          <label htmlFor="contact-name">Your name</label>
          <input
            id="contact-name"
            name="name"
            value={form.name}
            disabled={loading}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="Enter your name"
            autoComplete="name"
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "contact-name-error" : undefined}
          />
          {errors.name && <span className="form-field-error" id="contact-name-error">{errors.name}</span>}

          <label htmlFor="contact-email">Email address</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            value={form.email}
            disabled={loading}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="you@example.com"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
          />
          {errors.email && <span className="form-field-error" id="contact-email-error">{errors.email}</span>}

          <label htmlFor="contact-service">What do you need?</label>
          <select
            id="contact-service"
            name="service"
            value={form.service}
            disabled={loading}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            aria-invalid={Boolean(errors.service)}
            aria-describedby={errors.service ? "contact-service-error" : undefined}
          >
            <option value="">Choose a service</option>
            {services.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
          {errors.service && <span className="form-field-error" id="contact-service-error">{errors.service}</span>}

          <label htmlFor="contact-message">Project details</label>
          <textarea
            id="contact-message"
            name="message"
            value={form.message}
            disabled={loading}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="Tell us about your idea, goals and timeline..."
            rows={5}
            required
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "contact-message-error" : undefined}
          />
          {errors.message && <span className="form-field-error" id="contact-message-error">{errors.message}</span>}

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
    </>
  );
}
