import { Resend } from "resend";
import { logSafeError } from "../utils/safeErrorLogger.js";

const RECIPIENT = "attelier.dev@gmail.com";
const SUBJECT = "New inquiry received — Attelier.dev";
const MESSAGE_PREVIEW_LENGTH = 300;
const DEFAULT_TIMEOUT_MS = 4000;

function isValidEmailAddress(value) {
  return typeof value === "string"
    && value.length <= 254
    && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}

function isValidSender(value) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) return false;
  const sender = value.trim();
  const directAddress = sender.match(/^([^<>]+)$/)?.[1];
  if (directAddress && isValidEmailAddress(directAddress)) return true;

  const namedAddress = sender.match(/^(?:"[^"\r\n]+"|[^"<>\r\n]+)\s*<([^<>]+)>$/);
  return Boolean(namedAddress && isValidEmailAddress(namedAddress[1]));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function buildAdminUrl(clientOrigin, inquiryId) {
  const origin = new URL(clientOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) {
    throw new TypeError("Invalid client origin");
  }
  return new URL(`/admin/inquiries/${encodeURIComponent(String(inquiryId))}`, origin).toString();
}

function buildEmail(inquiry, clientOrigin) {
  const adminUrl = buildAdminUrl(clientOrigin, inquiry._id);
  const submittedAt = new Date(inquiry.createdAt).toISOString();
  const messagePreview = String(inquiry.message).slice(0, MESSAGE_PREVIEW_LENGTH);
  const details = [
    ["Name", String(inquiry.name)],
    ["Email", String(inquiry.email)],
    ["Service", String(inquiry.service)],
    ["Submitted", submittedAt],
  ];
  const text = [
    "A new customer inquiry has been received.",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message preview:",
    messagePreview,
    "",
    `View inquiry: ${adminUrl}`,
  ].join("\n");
  const htmlDetails = details
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join("");
  const html = [
    "<p>A new customer inquiry has been received.</p>",
    `<ul>${htmlDetails}</ul>`,
    `<p><strong>Message preview:</strong><br>${escapeHtml(messagePreview).replace(/\n/g, "<br>")}</p>`,
    `<p><a href="${escapeHtml(adminUrl)}">View inquiry in the admin dashboard</a></p>`,
  ].join("");

  return { adminUrl, text, html };
}

export function createInquiryEmailNotifier({
  env = process.env,
  createClient = (apiKey) => new Resend(apiKey),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = logSafeError,
} = {}) {
  let client;

  return async function notifyInquiry(inquiry) {
    const apiKey = typeof env.EMAIL_PROVIDER_API_KEY === "string"
      ? env.EMAIL_PROVIDER_API_KEY.trim()
      : "";
    const sender = typeof env.EMAIL_FROM === "string" ? env.EMAIL_FROM.trim() : "";
    if (!apiKey || !sender || !isValidSender(sender)) return { sent: false, reason: "configuration" };

    try {
      const origin = env.CLIENT_ORIGIN || "http://localhost:5173";
      const email = buildEmail(inquiry, origin);
      client ??= createClient(apiKey);
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const result = await client.emails.send({
          from: sender,
          to: RECIPIENT,
          subject: SUBJECT,
          html: email.html,
          text: email.text,
        }, { signal: abortController.signal });

        if (result?.error) {
          logger("InquiryEmailNotificationFailed", new Error("Email provider returned an error"));
          return { sent: false, reason: "provider" };
        }
        return { sent: true };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      logger("InquiryEmailNotificationFailed", error);
      return { sent: false, reason: error?.name === "AbortError" ? "timeout" : "provider" };
    }
  };
}

export const notifyNewInquiry = createInquiryEmailNotifier();
