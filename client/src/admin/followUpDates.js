export function localCalendarDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function followUpDateInputValue(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function formatFollowUpDate(value) {
  const dateKey = followUpDateInputValue(value);
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  // Noon avoids crossing a calendar boundary in local-time formatting.
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(year, month - 1, day, 12));
}

export function followUpDateState(value, today = localCalendarDate()) {
  const dateKey = followUpDateInputValue(value);
  if (!dateKey) return "none";
  if (dateKey < today) return "overdue";
  if (dateKey > today) return "upcoming";
  return "due-today";
}
