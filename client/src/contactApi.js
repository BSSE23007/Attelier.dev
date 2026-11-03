const DEFAULT_API_BASE_URL = "http://localhost:5000";

export function resolveApiBaseUrl(configuredBaseUrl, isDevelopment) {
  const configured = configuredBaseUrl?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return isDevelopment ? DEFAULT_API_BASE_URL : null;
}

export function buildInquiryUrl(baseUrl = DEFAULT_API_BASE_URL) {
  const normalizedBase = (baseUrl?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  return `${normalizedBase}/api/inquiries`;
}

export async function submitInquiry(
  inquiry,
  { baseUrl, fetchImpl = fetch, timeoutMs = 15000 } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetchImpl(buildInquiryUrl(baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inquiry),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("The request took too long. Please try again.", { cause: error });
      }
      throw new Error("We couldn’t reach the inquiry server. Please try again.", { cause: error });
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Too many requests. Please wait a few minutes and try again.");
      }
      if (response.status === 400) {
        throw new Error("Please check your inquiry details and try again.");
      }
      throw new Error("We couldn’t submit your inquiry right now. Please try again.");
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("The request took too long. Please try again.", { cause: error });
      }
      throw new Error("The server returned an unexpected response. Please try again.", { cause: error });
    }

    if (data?.success !== true) {
      throw new Error("We couldn’t confirm your inquiry was received. Please try again.");
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}
