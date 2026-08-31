// Timezone-aware weather formatters. All functions treat Open-Meteo timestamps
// as location-local wall time (Open-Meteo returns them in the requested timezone).
// We never rely on the browser's local timezone for interpreting hourly/daily fields.

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value) {
  return String(value).padStart(2, "0");
}

export function getLocalParts(timezone) {
  const tz = timezone || "UTC";
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const bag = {};
    for (const part of parts) bag[part.type] = part.value;
    const hour = Number(bag.hour) === 24 ? 0 : Number(bag.hour);
    return {
      hour, minute: Number(bag.minute), day: Number(bag.day),
      month: Number(bag.month), year: Number(bag.year),
      weekday: bag.weekday, dayOfWeek: WEEKDAY_SHORT.indexOf(bag.weekday),
    };
  } catch {
    const now = new Date();
    return { hour: now.getHours(), minute: now.getMinutes(), day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear(), weekday: WEEKDAY_SHORT[now.getDay()], dayOfWeek: now.getDay() };
  }
}

export function formatLocationDate(timezone) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone || undefined, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toUpperCase();
  } catch { return ""; }
}

export function formatLocationTime(timezone) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone || undefined, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
  } catch { return ""; }
}

export function formatHourLabel(iso, { isNow = false } = {}) {
  if (isNow) return "NOW";
  if (!iso || iso.length < 13) return "—";
  const h = Number(iso.slice(11, 13));
  if (Number.isNaN(h)) return "—";
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

export function formatSunTime(iso) {
  if (!iso || iso.length < 16) return "—";
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

export function formatWeekday(dateStr) {
  if (!dateStr || dateStr.length < 10) return "—";
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0));
  return WEEKDAY_SHORT[date.getUTCDay()];
}

export function isWeekend(timezone) {
  const dow = getLocalParts(timezone).dayOfWeek;
  return dow === 0 || dow === 6;
}

export function findNowIndex(hourly, timezone) {
  if (!Array.isArray(hourly) || hourly.length === 0) return 0;
  const p = getLocalParts(timezone);
  const prefix = `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}`;
  const idx = hourly.findIndex((row) => typeof row.time === "string" && row.time.startsWith(prefix));
  return idx >= 0 ? idx : 0;
}
