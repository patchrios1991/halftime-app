// ─── Shared date/time utilities ───────────────────────────────────────────────
// Single source of truth for all date formatting in the app.

/** Parse "YYYY-MM-DD" safely without timezone shift. */
export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Short date: "Jan 15"
 * Pass { weekday: true } for "Mon, Jan 15"
 */
export function fmtDate(dateStr, { weekday = false } = {}) {
  const d = parseLocalDate(dateStr);
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    ...(weekday && { weekday: "short" }),
    month: "short",
    day:   "numeric",
  });
}

/** Three-letter weekday: "Mon", "Tue", … */
export function fmtDay(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return "";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

/**
 * 12-hour clock: "7:30 PM"
 * Fixes midnight-shows-as-0:00-AM bug — hour 0 maps to 12.
 */
export function fmtTime(timeStr) {
  if (!timeStr) return "";
  const [h, min] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${min} ${hour >= 12 ? "PM" : "AM"}`;
}

/** Today's date with time zeroed. Call once per render (useMemo). */
export function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Days between today and a game date string.
 * Negative = past, 0 = today, positive = future.
 */
export function daysUntil(dateStr) {
  const gameDate = parseLocalDate(dateStr);
  if (!gameDate) return null;
  const today = getToday();
  return Math.ceil((gameDate - today) / (1000 * 60 * 60 * 24));
}

/** Human-readable countdown label. */
export function daysLabel(n) {
  if (n === null) return "";
  if (n < 0)   return "Past";
  if (n === 0) return "Today 🔥";
  if (n === 1) return "Tomorrow";
  return `${n} days away`;
}
