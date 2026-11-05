function safeLabel(value, fallback) {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)
    ? value
    : fallback;
}

function safeCode(value) {
  if (Number.isSafeInteger(value)) return value;
  return typeof value === "string" && /^[A-Z0-9_-]{1,32}$/.test(value) ? value : undefined;
}

export function logSafeError(context, error) {
  const diagnostic = { name: safeLabel(error?.name, "Error") };
  const code = safeCode(error?.code);
  if (code !== undefined) diagnostic.code = code;

  // Context is a fixed call-site label. Never pass request data, error messages,
  // stacks, headers, cookies, or environment values to this logger.
  console.error(`[${context}]`, diagnostic);
}
