/**
 * Daily devotional reflection, generated once a day by
 * scripts/generate-reflection.js and published at /reflections/YYYY-MM-DD.json.
 * Returns null if no reflection exists for a date — the app simply doesn't
 * show the button in that case, rather than showing an error.
 */
export function isoDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function fetchReflection(date) {
  const key = isoDateKey(date);
  try {
    const res = await fetch(`/reflections/${key}.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.date !== key || !data.text) return null;
    return data;
  } catch {
    return null;
  }
}
