import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ClipboardList, Eye, EyeOff, KeyRound, LayoutDashboard, LogOut, Menu, RefreshCw, Shield, X } from "lucide-react";
import Toast from "../Toast";
import { adminApi } from "./adminApi";
import { followUpDateInputValue, followUpDateState, formatFollowUpDate, localCalendarDate } from "./followUpDates";
import "./Admin.css";

const STATUSES = [
  { value: "new", label: "New" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];
const SERVICES = ["Web Development", "Cloud Engineering", "UI/UX & Graphic Design", "Technical Writing", "Other"];
const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];
const FOLLOW_UP_FILTERS = [
  { value: "", label: "All inquiries" },
  { value: "due-today", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "none", label: "No follow-up scheduled" },
];
const PRIORITY_FILTERS = [
  { value: "", label: "All priorities" },
  ...PRIORITIES,
];
const RESPONSE_FILTERS = [
  { value: "", label: "All response states" },
  { value: "awaiting", label: "Awaiting first response" },
  { value: "responded", label: "Responded" },
];

function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", ...options }).format(date);
}

function statusLabel(status) {
  return STATUSES.find((item) => item.value === status)?.label || status;
}

function priorityLabel(priority) {
  return PRIORITIES.find((item) => item.value === priority)?.label || "Normal";
}

function StatusBadge({ status }) {
  return <span className={`admin-status admin-status-${status}`}>{statusLabel(status)}</span>;
}

function PriorityBadge({ priority = "normal" }) {
  const value = PRIORITIES.some((item) => item.value === priority) ? priority : "normal";
  return <span className={`admin-priority admin-priority-${value}`}>{priorityLabel(value)}</span>;
}

function ResponseIndicator({ value }) {
  return value
    ? <span className="admin-response-indicator admin-response-recorded">Responded</span>
    : <span className="admin-response-indicator admin-response-awaiting">Awaiting response</span>;
}

function activityLabel(item) {
  if (item.type === "note-added") return "Internal note added";
  if (item.type === "first-response-recorded") return "First response recorded";
  if (item.type === "priority-changed") return `Priority changed to ${priorityLabel(item.priority).toLowerCase()}`;
  return `Status changed to ${statusLabel(item.status)}`;
}

function FollowUpIndicator({ value, compact = false }) {
  if (!value) return <span className="admin-follow-up-none">{compact ? "No follow-up" : "—"}</span>;
  const state = followUpDateState(value);
  const label = state === "due-today" ? "Due today" : state === "overdue" ? "Overdue" : "Upcoming";
  return <span className={`admin-follow-up-indicator admin-follow-up-${state}`}>{label} · {formatFollowUpDate(value)}</span>;
}

export function AdminGuard() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const location = useLocation();
  const expiryTimer = useRef(null);

  const loadSession = useCallback(() => {
    setLoading(true);
    setError("");
    adminApi.session()
      .then((result) => {
        setAdmin(result.admin);
        window.clearTimeout(expiryTimer.current);
        const remaining = new Date(result.expiresAt).getTime() - Date.now();
        expiryTimer.current = window.setTimeout(() => {
          window.dispatchEvent(new Event("admin-session-expired"));
        }, Math.max(remaining, 0));
      })
      .catch((requestError) => {
        setAdmin(null);
        if (requestError.status !== 401) setError(requestError.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const expire = () => {
      window.clearTimeout(expiryTimer.current);
      setAdmin(null);
      setLoading(false);
      setError("");
      setSessionExpired(true);
    };
    window.addEventListener("admin-session-expired", expire);
    const timer = window.setTimeout(loadSession, 0);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(expiryTimer.current);
      window.removeEventListener("admin-session-expired", expire);
    };
  }, [loadSession]);

  if (loading) return <main className="admin-gate" aria-busy="true"><span className="admin-sr-only" role="status" aria-live="polite">Checking administrator session</span><div className="admin-spinner" aria-hidden="true" /></main>;
  if (error) return <main className="admin-gate"><div className="admin-error-card"><h1>Admin service unavailable</h1><p>{error}</p><button className="admin-button" onClick={loadSession} type="button"><RefreshCw size={16} /> Try again</button></div></main>;
  if (!admin) return <Navigate to="/admin/login" replace state={{
    from: location.pathname,
    ...(sessionExpired ? { message: "Your session has expired. Please sign in again." } : {}),
  }} />;
  return <Outlet context={admin} />;
}

export function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await adminApi.login({ email, password });
      setPassword("");
      navigate(location.state?.from || "/admin", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <Link className="admin-brand" to="/" aria-label="Attelier.dev home">
          <img src="/images/logo-icon.png" alt="" />
          <span>Attelier<span>.dev</span></span>
        </Link>
        <div className="admin-eyebrow">PRIVATE ADMIN AREA</div>
        <h1 id="admin-login-title">Welcome back</h1>
        <p className="admin-muted">Sign in to manage project inquiries.</p>
        {location.state?.message && <p className="admin-success-message" role="status">{location.state.message}</p>}
        {error && <p className="admin-inline-error" role="alert">{error}</p>}
        <form className="admin-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Email address</label>
          <input id="admin-email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
          <label htmlFor="admin-password">Password</label>
          <div className="admin-password-field">
            <input id="admin-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} />
            <button className="admin-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <button className="admin-button admin-button-primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"} {!busy && <ArrowRight size={17} />}
          </button>
          {busy && <span className="admin-sr-only" role="status" aria-live="polite">Signing in</span>}
        </form>
        <Link className="admin-back-link" to="/"><ArrowLeft size={15} /> Back to website</Link>
      </section>
    </main>
  );
}

export function AdminLayout() {
  const admin = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");
  const [mobileNavPath, setMobileNavPath] = useState(null);
  const mobileNavOpen = mobileNavPath === location.pathname;
  const menuButtonRef = useRef(null);
  const mobileNavRef = useRef(null);

  useEffect(() => {
    if (mobileNavOpen) mobileNavRef.current?.querySelector("a")?.focus();
    else if (mobileNavRef.current?.contains(document.activeElement)) menuButtonRef.current?.focus();
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileNavPath(null);
      if (event.key === "Tab") {
        const focusable = [menuButtonRef.current, ...mobileNavRef.current.querySelectorAll("a")].filter(Boolean);
        const activeIndex = focusable.indexOf(document.activeElement);
        if (event.shiftKey && activeIndex === 0) {
          event.preventDefault();
          focusable.at(-1)?.focus();
        } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
          event.preventDefault();
          focusable[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  async function handleLogout() {
    setLogoutError("");
    try {
      await adminApi.logout();
      navigate("/admin/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin">
          <img src="/images/logo-icon.png" alt="" />
          <span>Attelier<span>.dev</span></span>
        </Link>
        <button ref={menuButtonRef} className="admin-menu-toggle" type="button" onClick={() => setMobileNavPath((openPath) => openPath === location.pathname ? null : location.pathname)} aria-controls="admin-mobile-nav" aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}>
          {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
        <div className="admin-side-label">WORKSPACE</div>
        <nav ref={mobileNavRef} className={`admin-nav${mobileNavOpen ? " is-open" : ""}`} id="admin-mobile-nav" aria-label="Admin navigation" role={mobileNavOpen ? "dialog" : undefined} aria-modal={mobileNavOpen ? "true" : undefined}>
          <NavLink to="/admin" end onClick={() => setMobileNavPath(null)}><LayoutDashboard size={18} /> Overview</NavLink>
          <NavLink to="/admin/inquiries" onClick={() => setMobileNavPath(null)}><ClipboardList size={18} /> Inquiries</NavLink>
          <NavLink to="/admin/security" onClick={() => setMobileNavPath(null)}><Shield size={18} /> Security</NavLink>
        </nav>
        <div className="admin-sidebar-bottom">
          <Link to="/" className="admin-back-link"><ArrowLeft size={15} /> View website</Link>
          <button className="admin-logout" type="button" onClick={handleLogout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title"><span className="admin-eyebrow">ADMIN WORKSPACE</span><strong>Inquiry management</strong></div>
          <div className="admin-topbar-actions">
            <div className="admin-user"><span className="admin-avatar">{admin.email?.slice(0, 1).toUpperCase()}</span><span>{admin.email}</span></div>
            <button className="admin-top-logout" type="button" onClick={handleLogout} aria-label="Sign out"><LogOut size={17} /><span>Sign out</span></button>
          </div>
        </header>
        {mobileNavOpen && <button className="admin-drawer-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMobileNavPath(null)} />}
        {logoutError && <div className="admin-top-error" role="alert">{logoutError}</div>}
        <div className="admin-content"><Outlet context={admin} /></div>
      </main>
    </div>
  );
}

export function AdminSecurityPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleVisibility(field) {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }

    setBusy(true);
    try {
      await adminApi.changePassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      navigate("/admin/login", { replace: true, state: { message: "Password changed. Please sign in again with your new password." } });
    } catch (requestError) {
      setError(requestError.message || "Unable to change the password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const passwordField = (id, label, value, setValue, field, autocomplete) => (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="admin-password-field">
        <input id={id} name={id} type={visible[field] ? "text" : "password"} autoComplete={autocomplete} value={value} onChange={(event) => setValue(event.target.value)} required maxLength={256} />
        <button className="admin-password-toggle" type="button" onClick={() => toggleVisibility(field)} aria-label={visible[field] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible[field]}>
          {visible[field] ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </>
  );

  return (
    <>
      <AdminPageHeading eyebrow="ACCOUNT SECURITY" title="Change password" description="Update the password for your administrator account." />
      <section className="admin-panel admin-security-panel">
        <div className="admin-security-policy"><KeyRound size={19} /><div><strong>Password policy</strong><p>Use 15–256 characters and include at least three of: lowercase letters, uppercase letters, numbers, and symbols.</p></div></div>
        {error && <p className="admin-inline-error" role="alert">{error}</p>}
        <form className="admin-form admin-security-form" onSubmit={handleSubmit}>
          {passwordField("current-password", "Current password", currentPassword, setCurrentPassword, "current", "current-password")}
          {passwordField("new-password", "New password", newPassword, setNewPassword, "next", "new-password")}
          {passwordField("confirm-password", "Confirm new password", confirmPassword, setConfirmPassword, "confirm", "new-password")}
          <button className="admin-button admin-button-primary" type="submit" disabled={busy}>
            {busy ? "Updating password…" : "Change password"} {!busy && <ArrowRight size={17} />}
          </button>
          {busy && <span className="admin-sr-only" role="status" aria-live="polite">Updating password</span>}
        </form>
      </section>
    </>
  );
}

function AdminPageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="admin-page-heading">
      <div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {action}
    </div>
  );
}

function InquiryTable({ inquiries, emptyMessage = "No inquiries match these filters." }) {
  if (!inquiries.length) return <div className="admin-empty"><ClipboardList size={28} /><strong>No inquiries found</strong><span>{emptyMessage}</span></div>;
  return (
    <>
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Customer</th><th>Service</th><th>Received</th><th>Priority</th><th>Status</th><th>First response</th><th>Follow-up</th><th><span className="admin-sr-only">Open inquiry</span></th></tr></thead>
        <tbody>
          {inquiries.map((inquiry) => (
            <tr key={inquiry.id}>
              <td><Link className="admin-customer-link" to={`/admin/inquiries/${inquiry.id}`}>{inquiry.name}</Link><span className="admin-table-subtext">{inquiry.email}</span></td>
              <td>{inquiry.service}</td>
              <td>{formatDate(inquiry.createdAt)}</td>
              <td><PriorityBadge priority={inquiry.priority} /></td>
              <td><StatusBadge status={inquiry.status} /></td>
              <td><ResponseIndicator value={inquiry.firstRespondedAt} /></td>
              <td><FollowUpIndicator value={inquiry.followUpAt} /></td>
              <td><Link className="admin-row-link" to={`/admin/inquiries/${inquiry.id}`} aria-label={`View inquiry from ${inquiry.name}`}><ArrowRight size={17} /></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="admin-inquiry-cards">
      {inquiries.map((inquiry) => (
        <Link className="admin-inquiry-card" key={inquiry.id} to={`/admin/inquiries/${inquiry.id}`} aria-label={`Open inquiry from ${inquiry.name}. ${statusLabel(inquiry.status)} status. ${inquiry.service}. Received ${formatDate(inquiry.createdAt)}. ${inquiry.firstRespondedAt ? "First response recorded" : "Awaiting first response"}.`}>
          <span className="admin-inquiry-card-heading"><strong>{inquiry.name}</strong><StatusBadge status={inquiry.status} /></span>
          <span className="admin-inquiry-card-email">{inquiry.email}</span>
          <span className="admin-inquiry-card-signals"><PriorityBadge priority={inquiry.priority} /><ResponseIndicator value={inquiry.firstRespondedAt} /></span>
          <span className="admin-inquiry-card-meta"><span>{inquiry.service}</span><time dateTime={inquiry.createdAt}>{formatDate(inquiry.createdAt)}</time></span>
          <FollowUpIndicator value={inquiry.followUpAt} compact />
          <ArrowRight className="admin-inquiry-card-arrow" size={16} aria-hidden="true" />
        </Link>
      ))}
    </div>
    </>
  );
}

function LoadingRows({ label = "Loading inquiries" }) {
  return (
    <div className="admin-loading-rows" role="status" aria-live="polite" aria-busy="true">
      <span className="admin-sr-only">{label}</span>
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </div>
  );
}

export function AdminOverviewPage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.overview({ today: localCalendarDate() });
      setOverview(result.data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      <AdminPageHeading eyebrow="OVERVIEW" title="Dashboard" description="A quick view of your recent project inquiries." action={<button className="admin-button admin-button-quiet" onClick={load} type="button"><RefreshCw size={16} /> Refresh</button>} />
      {error && <div className="admin-error-banner" role="alert">{error}</div>}
      <section className="admin-stat-grid" aria-label="Inquiry totals" aria-busy={loading}>
        {[["Total inquiries", overview?.counts.total], ["New", overview?.counts.new], ["In progress", overview?.counts.inProgress], ["Completed", overview?.counts.completed]].map(([label, value]) => (
          <article className="admin-stat-card" key={label}><span>{label}</span>{loading ? <div className="admin-skeleton" /> : <strong>{value ?? 0}</strong>}</article>
        ))}
      </section>
      <section className="admin-follow-up-grid" aria-label="Scheduled follow-ups" aria-busy={loading}>
        {[
          ["Due today", "dueToday", "due-today"],
          ["Overdue", "overdue", "overdue"],
          ["Upcoming", "upcoming", "upcoming"],
        ].map(([label, key, filter]) => (
          <Link className={`admin-follow-up-card admin-follow-up-card-${filter}`} key={key} to={`/admin/inquiries?followUp=${filter}`}>
            <span>{label}</span><strong>{loading ? "—" : overview?.followUps?.[key] ?? 0}</strong><span className="admin-follow-up-card-hint">View inquiries <ArrowRight size={13} /></span>
          </Link>
        ))}
      </section>
      <section className="admin-lead-tracking-grid" aria-label="Lead priority and first response" aria-busy={loading}>
        {[
          ["High priority", "highPriority", "priority=high", "admin-lead-card-high"],
          ["Awaiting first response", "awaitingFirstResponse", "response=awaiting", "admin-lead-card-awaiting"],
          ["First response recorded", "firstResponseRecorded", "response=responded", "admin-lead-card-responded"],
        ].map(([label, key, filter, className]) => (
          <Link className={`admin-lead-card ${className}`} key={key} to={`/admin/inquiries?${filter}`}>
            <span>{label}</span><strong>{loading ? "—" : overview?.leadTracking?.[key] ?? 0}</strong><span className="admin-follow-up-card-hint">View inquiries <ArrowRight size={13} /></span>
          </Link>
        ))}
      </section>
      <div className="admin-overview-grid" aria-busy={loading}>
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><h2>Recent inquiries</h2><p>Latest submissions from your website.</p></div><Link to="/admin/inquiries">View all <ArrowRight size={15} /></Link></div>
          {loading ? <LoadingRows label="Loading recent inquiries" /> : <InquiryTable inquiries={overview?.recent || []} emptyMessage="New inquiries will appear here." />}
        </section>
        <section className="admin-panel admin-activity-panel">
          <div className="admin-panel-heading"><div><h2>Recent activity</h2><p>Recent status updates and notes.</p></div></div>
          {loading ? <LoadingRows label="Loading recent activity" /> : overview?.activity?.length ? (
            <ul className="admin-activity-list">
              {overview.activity.map((item) => (
                <li key={item.id}>
                  <span className={`admin-activity-dot ${item.type}`} />
                  <div><Link to={`/admin/inquiries/${item.inquiryId}`}>{item.inquiryName || "Inquiry"}</Link><p>{activityLabel(item)}</p><time dateTime={item.createdAt}>{formatDate(item.createdAt, { dateStyle: "short", timeStyle: "short" })}</time></div>
                </li>
              ))}
            </ul>
          ) : <div className="admin-empty admin-empty-compact">No activity recorded yet.</div>}
        </section>
      </div>
    </>
  );
}

export function AdminInquiryListPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [followUp, setFollowUp] = useState(() => FOLLOW_UP_FILTERS.some((item) => item.value === searchParams.get("followUp")) ? searchParams.get("followUp") : "");
  const [priority, setPriority] = useState(() => PRIORITIES.some((item) => item.value === searchParams.get("priority")) ? searchParams.get("priority") : "");
  const [response, setResponse] = useState(() => RESPONSE_FILTERS.some((item) => item.value === searchParams.get("response")) ? searchParams.get("response") : "");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (service) params.set("service", service);
      if (priority) params.set("priority", priority);
      if (response) params.set("response", response);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (followUp) {
        params.set("followUp", followUp);
        if (followUp !== "none") params.set("today", localCalendarDate());
      }
      try {
        const response = await adminApi.inquiries(params.toString(), { signal: controller.signal });
        if (active) setResult(response);
      } catch (requestError) {
        if (active && requestError.name !== "AbortError") setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, status, service, fromDate, toDate, followUp, priority, response, page, refreshKey]);

  function changeFilter(setter) {
    return (event) => { setter(event.target.value); setPage(1); };
  }

  const pagination = result?.pagination;
  return (
    <>
      <AdminPageHeading eyebrow="CUSTOMER WORK" title="Inquiries" description="Search, filter, and review submitted project inquiries." />
      <section className="admin-panel admin-inquiry-panel" aria-busy={loading}>
        <div className="admin-filter-grid">
          <label className="admin-search-field">Search inquiries<input type="search" value={search} onChange={changeFilter(setSearch)} placeholder="Name, email, or project details" /></label>
          <label>Status<select value={status} onChange={changeFilter(setStatus)}><option value="">All statuses</option>{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Service<select value={service} onChange={changeFilter(setService)}><option value="">All services</option>{SERVICES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Priority<select value={priority} onChange={changeFilter(setPriority)}>{PRIORITY_FILTERS.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}</select></label>
          <label>First response<select value={response} onChange={changeFilter(setResponse)}>{RESPONSE_FILTERS.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}</select></label>
          <label>Follow-up<select value={followUp} onChange={changeFilter(setFollowUp)}>{FOLLOW_UP_FILTERS.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}</select></label>
          <label>From date<input type="date" value={fromDate} onChange={changeFilter(setFromDate)} /></label>
          <label>To date<input type="date" min={fromDate || undefined} value={toDate} onChange={changeFilter(setToDate)} /></label>
        </div>
        {error && <div className="admin-error-banner" role="alert">{error} <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Retry</button></div>}
        {loading ? <LoadingRows label="Loading inquiries" /> : <InquiryTable inquiries={result?.data || []} />}
        <div className="admin-pagination">
          <span>{pagination?.total ?? 0} inquiries</span>
          <div><span>Page {page} of {Math.max(1, pagination?.totalPages || 0)}</span><button type="button" className="admin-icon-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="Previous page"><ChevronLeft size={19} /></button><button type="button" className="admin-icon-button" onClick={() => setPage((current) => current + 1)} disabled={!pagination || page >= pagination.totalPages || loading} aria-label="Next page"><ChevronRight size={19} /></button></div>
        </div>
      </section>
    </>
  );
}

export function AdminInquiryDetailsPage() {
  const { id } = useParams();
  const [inquiry, setInquiry] = useState(null);
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");
  const [followUpDate, setFollowUpDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [responseBusy, setResponseBusy] = useState(false);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.inquiry(id);
      setInquiry(result.data);
      setStatus(result.data.status);
      setPriority(result.data.priority || "normal");
      setFollowUpDate(followUpDateInputValue(result.data.followUpAt));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveStatus() {
    setBusy(true);
    try {
      const result = await adminApi.updateStatus(id, status);
      setInquiry((current) => ({ ...current, status: result.data.status, updatedAt: result.data.updatedAt }));
      setToast({ type: "success", message: "Inquiry status updated." });
      await load();
    } catch (requestError) {
      setToast({ type: "error", message: requestError.message });
    } finally {
      setBusy(false);
    }
  }

  async function savePriority() {
    setPriorityBusy(true);
    try {
      await adminApi.updatePriority(id, priority);
      setToast({ type: "success", message: "Inquiry priority updated." });
      await load();
    } catch (requestError) {
      setToast({ type: "error", message: requestError.message });
    } finally {
      setPriorityBusy(false);
    }
  }

  async function markResponded() {
    setResponseBusy(true);
    try {
      await adminApi.markResponded(id);
      setToast({ type: "success", message: "First response recorded." });
      await load();
    } catch (requestError) {
      setToast({ type: "error", message: requestError.message });
    } finally {
      setResponseBusy(false);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await adminApi.addNote(id, note);
      setInquiry((current) => ({
        ...current,
        notes: [...current.notes, result.data],
        activity: [...current.activity, { ...result.data, type: "note-added" }],
      }));
      setNote("");
      setToast({ type: "success", message: "Internal note added." });
      await load();
    } catch (requestError) {
      setToast({ type: "error", message: requestError.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveFollowUp(nextDate = followUpDate) {
    setFollowUpBusy(true);
    try {
      const result = await adminApi.updateFollowUp(id, nextDate || null);
      setInquiry((current) => current ? { ...current, followUpAt: result.data.followUpAt } : current);
      setFollowUpDate(followUpDateInputValue(result.data.followUpAt));
      setToast({ type: "success", message: nextDate ? "Follow-up date saved." : "Follow-up date cleared." });
      await load();
    } catch (requestError) {
      setToast({ type: "error", message: requestError.message });
    } finally {
      setFollowUpBusy(false);
    }
  }

  return (
    <>
      <div className="admin-detail-back"><Link to="/admin/inquiries"><ArrowLeft size={16} /> Back to inquiries</Link></div>
      {loading && <LoadingRows label="Loading inquiry details" />}
      {error && <div className="admin-error-banner" role="alert">{error}<button type="button" onClick={load}>Retry</button></div>}
      {!loading && inquiry && <>
        <AdminPageHeading eyebrow="INQUIRY DETAILS" title={inquiry.name} description={`Received ${formatDate(inquiry.createdAt, { dateStyle: "long", timeStyle: "short" })}`} action={<StatusBadge status={inquiry.status} />} />
        {inquiry.possibleDuplicates?.length > 0 && <section className="admin-duplicate-warning" aria-labelledby="admin-duplicate-title">
          <div className="admin-duplicate-copy"><h2 id="admin-duplicate-title">Possible Duplicate</h2><p>One or more earlier inquiries have the same email, service, and message within 24 hours.</p></div>
          <ul>{inquiry.possibleDuplicates.map((match) => <li key={match.id}>
            <span><time dateTime={match.createdAt}>{formatDate(match.createdAt, { dateStyle: "medium", timeStyle: "short" })}</time><span className="admin-duplicate-status">{match.status}</span></span>
            <Link to={`/admin/inquiries/${encodeURIComponent(match.id)}`}>Open inquiry <ArrowRight size={14} aria-hidden="true" /></Link>
          </li>)}</ul>
        </section>}
        <div className="admin-detail-grid">
          <section className="admin-panel admin-detail-main">
            <div className="admin-panel-heading"><div><h2>Project details</h2><p>Customer message</p></div><StatusBadge status={inquiry.status} /></div>
            <p className="admin-message">{inquiry.message}</p>
            <div className="admin-customer-details"><div><span>Customer</span><strong>{inquiry.name}</strong></div><div><span>Email</span><a href={`mailto:${inquiry.email}`}>{inquiry.email}</a></div><div><span>Requested service</span><strong>{inquiry.service}</strong></div><div><span>Submitted</span><strong>{formatDate(inquiry.createdAt, { dateStyle: "long", timeStyle: "short" })}</strong></div><div><span>Current priority</span><PriorityBadge priority={inquiry.priority} /></div></div>
            <div className="admin-status-editor"><label htmlFor="inquiry-status">Update status</label><select id="inquiry-status" value={status} onChange={(event) => setStatus(event.target.value)}>{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button className="admin-button admin-button-primary" type="button" onClick={saveStatus} disabled={busy || status === inquiry.status}>Save status</button></div>
            <div className="admin-priority-editor"><label htmlFor="inquiry-priority">Lead priority<select id="inquiry-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button className="admin-button admin-button-primary" type="button" onClick={savePriority} disabled={priorityBusy || priority === (inquiry.priority || "normal")}>{priorityBusy ? "Saving…" : "Save priority"}</button></div>
            <div className="admin-response-editor">
              <div><strong>First response</strong>{inquiry.firstRespondedAt ? <time dateTime={inquiry.firstRespondedAt}>{formatDate(inquiry.firstRespondedAt, { dateStyle: "long", timeStyle: "short" })}</time> : <span>Awaiting first response</span>}</div>
              <button className="admin-button admin-button-quiet" type="button" onClick={markResponded} disabled={responseBusy || Boolean(inquiry.firstRespondedAt)}>{responseBusy ? "Recording…" : inquiry.firstRespondedAt ? "Response recorded" : "Mark as Responded"}</button>
            </div>
            <div className="admin-follow-up-editor">
              <div><strong>Follow-up</strong><span>{inquiry.followUpAt ? formatFollowUpDate(inquiry.followUpAt) : "No follow-up scheduled"}</span></div>
              {inquiry.status === "completed" ? (
                <p className="admin-follow-up-help">Reopen this inquiry before scheduling another follow-up.</p>
              ) : (
                <div className="admin-follow-up-controls">
                  <label htmlFor="inquiry-follow-up-date">Follow-up date<input id="inquiry-follow-up-date" type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} /></label>
                  <button className="admin-button admin-button-primary" type="button" onClick={() => saveFollowUp()} disabled={followUpBusy || !followUpDate || followUpDate === followUpDateInputValue(inquiry.followUpAt)}>{followUpBusy ? "Saving…" : "Save date"}</button>
                  {inquiry.followUpAt && <button className="admin-button admin-button-quiet" type="button" onClick={() => saveFollowUp(null)} disabled={followUpBusy}>{followUpBusy ? "Saving…" : "Clear date"}</button>}
                </div>
              )}
            </div>
          </section>
          <section className="admin-panel admin-notes-panel">
            <div className="admin-panel-heading"><div><h2>Internal notes</h2><p>Visible to administrators only.</p></div></div>
            <div className="admin-notes-list">{inquiry.notes?.length ? inquiry.notes.map((item) => <article className="admin-note" key={item.id}><p>{item.body}</p><span>{item.createdBy} · {formatDate(item.createdAt, { dateStyle: "short", timeStyle: "short" })}</span></article>) : <div className="admin-empty admin-empty-compact">No internal notes yet.</div>}</div>
            <form className="admin-note-form" onSubmit={saveNote}><label htmlFor="new-note">Add a note</label><textarea id="new-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="Add a private follow-up note…" required /><button className="admin-button admin-button-primary" type="submit" disabled={busy || !note.trim()}>Add note</button></form>
          </section>
          <section className="admin-panel admin-activity-history"><div className="admin-panel-heading"><div><h2>Activity history</h2><p>Status changes and note additions.</p></div></div>
            {inquiry.activity?.length ? <ol className="admin-history-list">{[...inquiry.activity].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((item) => <li key={item.id}><span className="admin-activity-dot" /><div><strong>{activityLabel(item)}</strong><span>{item.createdBy} · {formatDate(item.createdAt, { dateStyle: "short", timeStyle: "short" })}</span></div></li>)}</ol> : <div className="admin-empty admin-empty-compact">No admin activity recorded.</div>}
          </section>
        </div>
      </>}
      <Toast message={toast?.message} type={toast?.type} onDismiss={dismissToast} />
    </>
  );
}
