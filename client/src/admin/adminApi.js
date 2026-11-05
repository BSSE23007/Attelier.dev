import { resolveApiBaseUrl } from "../contactApi";

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV);

export class AdminApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export async function adminRequest(path, { method = "GET", body, signal } = {}) {
  if (!API_BASE_URL) {
    throw new AdminApiError("Admin API is not configured for this deployment.", 0);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/admin/${path.replace(/^\/+/, "")}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new AdminApiError("Unable to reach the admin service. Please try again.", 0);
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Use a safe generic message below for non-JSON upstream responses.
  }

  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("admin-session-expired"));
  }
  if (!response.ok || data.success !== true) {
    const fallback = response.status === 401
      ? "Your admin session has expired. Please sign in again."
      : "The admin request could not be completed.";
    throw new AdminApiError(typeof data.message === "string" ? data.message : fallback, response.status);
  }

  return data;
}

export const adminApi = {
  login: (body) => adminRequest("auth/login", { method: "POST", body }),
  logout: () => adminRequest("auth/logout", { method: "POST", body: {} }),
  changePassword: (body) => adminRequest("auth/password", { method: "POST", body }),
  session: () => adminRequest("auth/session"),
  overview: ({ signal, today } = {}) => adminRequest(`overview${today ? `?today=${encodeURIComponent(today)}` : ""}`, { signal }),
  inquiries: (params, { signal } = {}) => adminRequest(`inquiries?${params}`, { signal }),
  inquiry: (id, { signal } = {}) => adminRequest(`inquiries/${encodeURIComponent(id)}`, { signal }),
  updateStatus: (id, status) => adminRequest(`inquiries/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),
  updatePriority: (id, priority) => adminRequest(`inquiries/${encodeURIComponent(id)}/priority`, { method: "PATCH", body: { priority } }),
  markResponded: (id) => adminRequest(`inquiries/${encodeURIComponent(id)}/first-response`, { method: "POST", body: {} }),
  updateFollowUp: (id, followUpAt) => adminRequest(`inquiries/${encodeURIComponent(id)}/follow-up`, { method: "PATCH", body: { followUpAt } }),
  addNote: (id, body) => adminRequest(`inquiries/${encodeURIComponent(id)}/notes`, { method: "POST", body: { body } }),
};
