/**
 * Universalis regional calendars — confirmed from universalis.com/n-location.htm.
 * calendar: "" means the General Calendar (no prefix in the Universalis URL).
 */
const GENERAL_OPTION = { name: "General (International)", calendar: "" };

const COUNTRIES = [
  { name: "South Africa", calendar: "africa.safrica" },
  { name: "Nigeria", calendar: "africa.nigeria" },
  { name: "Kenya", calendar: "africa.kenya" },
  { name: "Madagascar", calendar: "africa.madagascar" },
  { name: "Africa (other / general)", calendar: "africa" },
  { name: "Brazil", calendar: "americas.brazil" },
  { name: "Latin America (other / general)", calendar: "americas" },
  { name: "India", calendar: "asia.india" },
  { name: "Indonesia", calendar: "asia.indonesia" },
  { name: "Malaysia", calendar: "asia.malaysia" },
  { name: "Singapore", calendar: "asia.singapore" },
  { name: "Vietnam", calendar: "asia.vietnam" },
  { name: "Asia (other / general)", calendar: "asia" },
  { name: "Australia", calendar: "australia" },
  { name: "Canada", calendar: "canada" },
  { name: "Caribbean", calendar: "caribbean" },
  { name: "Eastern Mediterranean", calendar: "east" },
  { name: "England", calendar: "europe.england" },
  { name: "France", calendar: "europe.france" },
  { name: "Ireland", calendar: "europe.ireland" },
  { name: "Italy", calendar: "europe.italy" },
  { name: "Poland", calendar: "europe.poland" },
  { name: "Portugal", calendar: "europe.portugal" },
  { name: "Scotland", calendar: "europe.scotland" },
  { name: "Wales", calendar: "europe.wales" },
  { name: "Europe (other / general)", calendar: "europe" },
  { name: "Middle East", calendar: "meast" },
  { name: "New Zealand", calendar: "nz" },
  { name: "Philippines", calendar: "philippines" },
  { name: "United States", calendar: "usa" },
].sort((a, b) => a.name.localeCompare(b.name));

export const REGIONS = [GENERAL_OPTION, ...COUNTRIES];

const STORAGE_KEY = "cdm-region";

/** Guess a country calendar from the device's own locale settings. */
function autoDetectCountry() {
  try {
    const langs = (navigator.languages || [navigator.language || ""]).join(",").toLowerCase();
    const map = [
      [/-za\b/, "africa.safrica"],
      [/-ng\b/, "africa.nigeria"],
      [/-ke\b/, "africa.kenya"],
      [/-mg\b/, "africa.madagascar"],
      [/-br\b/, "americas.brazil"],
      [/-in\b/, "asia.india"],
      [/-id\b/, "asia.indonesia"],
      [/-my\b/, "asia.malaysia"],
      [/-sg\b/, "asia.singapore"],
      [/-vn\b/, "asia.vietnam"],
      [/-au\b/, "australia"],
      [/-ca\b/, "canada"],
      [/-nz\b/, "nz"],
      [/-ph\b/, "philippines"],
      [/-us\b/, "usa"],
      [/-gb\b|-uk\b/, "europe.england"],
      [/-fr\b/, "europe.france"],
      [/-ie\b/, "europe.ireland"],
      [/-it\b/, "europe.italy"],
      [/-pl\b/, "europe.poland"],
      [/-pt\b/, "europe.portugal"],
    ];
    for (const [re, code] of map) {
      if (re.test(langs)) return code;
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** Returns the saved country; on first-ever visit, auto-detects one from
 *  the device and remembers it, so later visits stay stable even if the
 *  device's locale info changes. */
export function loadSavedRegion() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved;
  } catch {
    /* ignore */
  }
  const detected = autoDetectCountry();
  saveRegion(detected);
  return detected;
}

export function saveRegion(calendar) {
  try {
    localStorage.setItem(STORAGE_KEY, calendar);
  } catch {
    /* ignore */
  }
}

export function regionName(calendar) {
  return REGIONS.find((r) => r.calendar === calendar)?.name || "General (International)";
}
