/**
 * Universalis JSONP loader.
 * Official webmaster service: https://universalis.com/n-jsonp.htm
 * Endpoint pattern: https://universalis.com/[calendar/]YYYYMMDD/jsonpmass.js
 * The script calls window.universalisCallback(data).
 *
 * Terms we honour in this app (see n-jsonp-technical.htm):
 *  - The copyright notice from the data is always displayed (Footer).
 *  - A visible link to Universalis is always present (Footer).
 */

const BASE = "https://universalis.com";
const CACHE_PREFIX = "cdm-readings-v2-";
const CACHE_KEEP = 14; // days of readings kept for offline use

// Universalis calls a fixed global function name from its JSONP script.
// Define it once and forever; requests register a pending handler with it.
let pendingHandler = null;
if (typeof window !== "undefined") {
  window.universalisCallback = (data) => {
    if (pendingHandler) pendingHandler(data);
    // No pending handler = a stale/duplicate response; ignore silently.
  };
}

/** YYYYMMDD for a Date */
export function compactDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function displayDate(d) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function cacheKey(compact, calendar) {
  return `${CACHE_PREFIX}${calendar || "general"}-${compact}`;
}

/** A day's data is only worth caching if it looks complete. Nearly every
 *  Mass has a Gospel and a Psalm; if either is missing, the feed most likely
 *  glitched, and caching it would freeze that glitch on the device for days
 *  (this is the likely cause of a Psalm that "never comes back" for one date
 *  while neighbouring dates are fine). Incomplete days are re-fetched. */
function looksComplete(data) {
  return Boolean(data && data.Mass_G && data.Mass_Ps);
}

function readCache(compact, calendar) {
  try {
    const raw = localStorage.getItem(cacheKey(compact, calendar));
    const data = raw ? JSON.parse(raw) : null;
    return looksComplete(data) ? data : null;
  } catch {
    return null;
  }
}

function writeCache(compact, calendar, data) {
  if (!looksComplete(data)) return;
  try {
    localStorage.setItem(cacheKey(compact, calendar), JSON.stringify(data));
    pruneCache();
  } catch {
    /* storage full or unavailable — not fatal */
  }
}

function pruneCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys
      .sort() // date suffix sorts chronologically
      .slice(0, Math.max(0, keys.length - CACHE_KEEP))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Fetch readings for a given Date via JSONP.
 * @param {Date} date
 * @param {string} calendar  optional Universalis calendar code, e.g. "africa.southafrica"
 * @returns {Promise<object>} raw Universalis data object
 */
export function fetchReadings(date, calendar = "") {
  const compact = compactDate(date);

  // Serve from cache instantly if we have it (also = offline support)
  const cached = readCache(compact, calendar);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Universalis did not respond. Check your connection."));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
    }

    // The callback stays permanently defined on window (Universalis calls a
    // fixed function name). Each request registers itself as the pending
    // handler; late or duplicate script responses resolve harmlessly.
    pendingHandler = (data) => {
      pendingHandler = null;
      cleanup();
      if (data && typeof data === "object") {
        writeCache(compact, calendar, data);
        resolve(data);
      } else {
        reject(new Error("Unexpected data from Universalis."));
      }
    };

    const path = calendar
      ? `${BASE}/${calendar}/${compact}/jsonpmass.js`
      : `${BASE}/${compact}/jsonpmass.js`;

    script.src = path;
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach Universalis."));
    };
    document.head.appendChild(script);
  });
}

/**
 * Normalise the raw Universalis object into an ordered list of sections.
 * Defensive: renders whatever reading keys exist, in liturgical order,
 * then any unrecognised Mass_* keys, so feed changes never blank the app.
 */
const SECTION_ORDER = [
  ["Mass_R1", "First Reading"],
  ["Mass_Ps", "Responsorial Psalm"],
  ["Mass_R2", "Second Reading"],
  ["Mass_GA", "Gospel Acclamation"],
  ["Mass_G", "Gospel"],
];

/** Converts a section's HTML into safe plain-text paragraphs. Used as a
 *  guaranteed-visible fallback for on-screen rendering when raw HTML from
 *  the feed might be malformed in a way a browser silently hides (while
 *  text-extraction for the voice, which is far more forgiving of odd
 *  markup, still finds and speaks the content fine). */
function toParagraphs(html) {
  if (!html) return [];
  let s = String(html)
    .replace(/<br\s*\/?>/gi, "\u0001")
    .replace(/<\/p>/gi, "\u0001")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  return s
    .split("\u0001")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function normaliseReadings(data) {
  const sections = [];
  const used = new Set();

  const pick = (val) => {
    if (val == null) return null;
    if (typeof val === "string") return { source: "", text: val };
    return {
      source: val.source || val.heading || "",
      text: val.text || val.body || "",
    };
  };

  for (const [key, label] of SECTION_ORDER) {
    const s = pick(data[key]);
    if (s && s.text) {
      sections.push({ key, label, ...s, paragraphs: toParagraphs(s.text) });
      used.add(key);
    } else if (key === "Mass_Ps") {
      // The Psalm is present in nearly every Mass. If it's ever missing,
      // this is worth seeing in the console rather than silently vanishing.
      // eslint-disable-next-line no-console
      console.warn(
        "[Daily Mass] No Responsorial Psalm in today's feed data. Raw keys received:",
        Object.keys(data)
      );
    }
  }

  // Any additional Mass_ sections the feed provides that we didn't map
  for (const key of Object.keys(data)) {
    if (key.startsWith("Mass_") && !used.has(key)) {
      const s = pick(data[key]);
      if (s && s.text) {
        sections.push({
          key,
          label: key.replace("Mass_", "Reading "),
          ...s,
        });
      }
    }
  }

  const rawDay =
    typeof data.day === "string"
      ? data.day
      : data.day?.text || data.day?.body || "";

  return {
    date: typeof data.date === "string" ? data.date : "",
    day: stripToText(rawDay),
    sections,
    copyright: pick(data.copyright)?.text || "",
  };
}

/** Universalis sends some fields as HTML (e.g. the feast title wrapped in a
 *  styled div). Reduce to clean text, decoding entities like &#x2010;. */
function stripToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim();
}
