/**
 * Sunday liturgical year cycle (A/B/C) — a fixed, well-known ecclesiastical
 * calculation, not something Universalis returns in its feed.
 *
 * The liturgical year begins on the First Sunday of Advent (the Sunday
 * closest to 30 November) and is labelled A, B or C on a 3-year cycle.
 * Verified against public reference points:
 *   2023 (Jan–Nov) = Year A · 2024 = Year B · 2025 = Year C · 2026 = Year A
 *
 * Note: this gives the overall liturgical year label used on Sundays and
 * generally quoted in missals. Weekday first readings follow a separate
 * two-year cycle (Year I / II) not covered here.
 */

function firstSundayOfAdvent(year) {
  const christmas = new Date(Date.UTC(year, 11, 25));
  const weekday = christmas.getUTCDay(); // 0 = Sunday
  const sunday4 = new Date(Date.UTC(year, 11, 25 - weekday));
  const sunday1 = new Date(sunday4);
  sunday1.setUTCDate(sunday4.getUTCDate() - 21);
  return sunday1;
}

export function liturgicalYearLetter(date) {
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const year = utcDate.getUTCFullYear();
  const advent1ThisYear = firstSundayOfAdvent(year);
  const startYear = utcDate >= advent1ThisYear ? year : year - 1;
  const idx = (((startYear - 2022) % 3) + 3) % 3;
  return ["A", "B", "C"][idx];
}

/**
 * Weekday First Reading cycle (I / II) — a separate, simpler 2-year cycle
 * that runs on the plain calendar year (not the Advent-to-Advent liturgical
 * year): odd years = Year I, even years = Year II. Only the weekday First
 * Reading changes between the two; the weekday Gospel never does.
 */
export function weekdayCycleNumeral(date) {
  return date.getFullYear() % 2 === 0 ? "II" : "I";
}
