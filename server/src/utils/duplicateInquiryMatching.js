export const DUPLICATE_INQUIRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function normalizeInquiryEmail(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase() : "";
}

export function normalizeInquiryMessage(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
    : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildDuplicateInquiryFilter(inquiry) {
  const email = normalizeInquiryEmail(inquiry?.email);
  const message = normalizeInquiryMessage(inquiry?.message);
  const createdAt = new Date(inquiry?.createdAt);
  if (!email || !message || typeof inquiry?.service !== "string" || !inquiry.service || !Number.isFinite(createdAt.getTime())) {
    return null;
  }

  return {
    _id: { $ne: inquiry._id },
    email: new RegExp(`^\\s*${escapeRegExp(email)}\\s*$`, "i"),
    service: inquiry.service,
    createdAt: {
      $gte: new Date(createdAt.getTime() - DUPLICATE_INQUIRY_WINDOW_MS),
      $lt: createdAt,
    },
  };
}

export function findPossibleDuplicateInquiries(inquiry, candidates) {
  const email = normalizeInquiryEmail(inquiry?.email);
  const message = normalizeInquiryMessage(inquiry?.message);
  const createdAt = new Date(inquiry?.createdAt);
  if (!email || !message || typeof inquiry?.service !== "string" || !inquiry.service || !Number.isFinite(createdAt.getTime())) {
    return [];
  }

  const earliestAllowed = createdAt.getTime() - DUPLICATE_INQUIRY_WINDOW_MS;
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => {
      if (!candidate || String(candidate._id) === String(inquiry._id)) return false;
      if (normalizeInquiryEmail(candidate.email) !== email) return false;
      if (candidate.service !== inquiry.service || normalizeInquiryMessage(candidate.message) !== message) return false;
      const candidateTime = new Date(candidate.createdAt).getTime();
      return Number.isFinite(candidateTime) && candidateTime >= earliestAllowed && candidateTime < createdAt.getTime();
    })
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .map((candidate) => ({
      id: String(candidate._id),
      createdAt: candidate.createdAt,
      status: candidate.status,
    }));
}
