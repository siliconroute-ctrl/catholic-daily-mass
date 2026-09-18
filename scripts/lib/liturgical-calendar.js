/**
 * Figures out which YouTube playlist(s) a given date's Mass video belongs
 * in: "Weekly Mass" (Mon-Sat), "Sunday Mass" (Sun), and — in addition to
 * whichever of those applies — "Feast Days" for a fixed set of major dates.
 *
 * Feast day dates are either fixed on the civil calendar (Christmas, New
 * Year's) or "moveable", anchored to Easter Sunday. Easter Sunday itself is
 * computed with the standard Anonymous Gregorian algorithm (Meeus/Jones/
 * Butcher) — there's no reliable third-party data source already in this
 * codebase for it, and the formula is well-established and exact for any
 * Gregorian-calendar year.
 */

function computeEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Ash Wednesday, Holy Thursday, and Good Friday always fall in the same
// civil year as the Easter Sunday they precede, so anchoring off the
// date's own year is safe for all four.
export function getFeastDayName(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (month === 12 && day === 24) return "Christmas Eve";
  if (month === 12 && day === 25) return "Christmas Day";
  if (month === 12 && day === 31) return "New Year's Eve Mass";
  if (month === 1 && day === 1) return "New Year's Mass";

  const easter = computeEasterSunday(year);
  if (isoDate === toIsoDate(addDays(easter, -46))) return "Ash Wednesday";
  if (isoDate === toIsoDate(addDays(easter, -3))) return "Holy Thursday";
  if (isoDate === toIsoDate(addDays(easter, -2))) return "Good Friday";
  if (isoDate === toIsoDate(easter)) return "Easter Sunday";

  return null;
}

export function getPlaylistNames(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const names = [dayOfWeek === 0 ? "Sunday Mass" : "Weekly Mass"];
  if (getFeastDayName(isoDate)) names.push("Feast Days");
  return names;
}
