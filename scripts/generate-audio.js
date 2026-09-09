/**
 * Catholic Daily Mass — daily audio generator (Google Cloud Text-to-Speech)
 *
 * Produces ONE MP3 per day:  bell → opening blessing (male) → First Reading
 * (female) → Psalm (female) → Second Reading (female, Sundays) → Gospel
 * Acclamation (female, "Alleluia … Alleluia" as a call-and-response) →
 * Gospel (male) → "The Gospel of the Lord" (male).
 *
 * Output:  public/audio/YYYY-MM-DD.mp3  +  public/audio/YYYY-MM-DD.json
 * (the JSON holds section start/end times so the app can highlight the
 * section being read).
 *
 * Usage:
 *   node scripts/generate-audio.js                # today (South Africa time)
 *   node scripts/generate-audio.js 2026-09-09     # a specific date
 *   node scripts/generate-audio.js --dry-run      # fetch + build text, no API call, no cost
 *   node scripts/generate-audio.js --list-voices  # print available English voices
 *
 * Auth: set GOOGLE_APPLICATION_CREDENTIALS to the path of your service
 * account JSON key. Never commit that key.
 *
 * SAFETY (cost): one date per run, no retries, and a hard cap on characters
 * sent to Google per run (MAX_CHARS_PER_RUN). A normal day is ~3–5k chars;
 * Google's free tier is 1,000,000/month for the voices used here.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import textToSpeech from "@google-cloud/text-to-speech";
import { parseBuffer } from "music-metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "audio");
const BELL_PATH = path.join(ROOT, "public", "church-bell.mp3");

// ---------- configuration ----------
const MAX_CHARS_PER_RUN = 12000; // hard cost cap — a day never legitimately exceeds this
const KEEP_DAYS = 14; // prune audio older than this
const REQUEST_LIMIT_BYTES = 4600; // Google limit is 5000 bytes per request; keep headroom
const SPEAKING_RATE = 0.92;

// Voices — override with env vars if you prefer others (see --list-voices).
const FEMALE_VOICE = process.env.TTS_FEMALE_VOICE || "en-GB-Neural2-A";
const MALE_VOICE = process.env.TTS_MALE_VOICE || "en-GB-Neural2-D";
const LANGUAGE = process.env.TTS_LANGUAGE || "en-GB";

const OPENING_BLESSING =
  "In the name of the Father, and of the Son, and of the Holy Spirit. " +
  "Let us prepare our hearts to hear the Word of the Lord.";

// ---------- args ----------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIST_VOICES = args.includes("--list-voices");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

// ---------- date (South Africa, UTC+2, no DST) ----------
function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = dateArg || sastToday();
const compactDate = isoDate.replace(/-/g, "");

// ---------- text helpers (mirrors the in-app logic) ----------
function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li)>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentences(text) {
  const raw = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9\u2018\u201C])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.length ? raw : [text];
}

const BOOK_ABBR = {
  Gen: "Genesis", Ex: "Exodus", Lev: "Leviticus", Num: "Numbers", Deut: "Deuteronomy", Dt: "Deuteronomy",
  Jos: "Joshua", Jdg: "Judges", Ru: "Ruth", Sam: "Samuel", Kgs: "Kings", Chr: "Chronicles", Neh: "Nehemiah",
  Tob: "Tobit", Jdt: "Judith", Est: "Esther", Mac: "Maccabees", Jb: "Job", Ps: "Psalm", Prov: "Proverbs",
  Eccl: "Ecclesiastes", Qo: "Ecclesiastes", Sg: "Song of Songs", Wis: "Wisdom", Sir: "Sirach", Ecclus: "Ecclesiasticus",
  Is: "Isaiah", Isa: "Isaiah", Jer: "Jeremiah", Lam: "Lamentations", Bar: "Baruch", Ezek: "Ezekiel", Ez: "Ezekiel",
  Dan: "Daniel", Dn: "Daniel", Hos: "Hosea", Jl: "Joel", Am: "Amos", Ob: "Obadiah", Jon: "Jonah", Mic: "Micah",
  Nah: "Nahum", Hab: "Habakkuk", Zeph: "Zephaniah", Hag: "Haggai", Zech: "Zechariah", Mal: "Malachi",
  Mt: "Matthew", Mk: "Mark", Lk: "Luke", Jn: "John", Ac: "Acts", Acts: "Acts", Rom: "Romans", Cor: "Corinthians",
  Gal: "Galatians", Eph: "Ephesians", Phil: "Philippians", Col: "Colossians", Thess: "Thessalonians",
  Tim: "Timothy", Tit: "Titus", Philem: "Philemon", Heb: "Hebrews", Jas: "James", Pet: "Peter", Jude: "Jude",
  Rev: "Revelation", Apoc: "Apocalypse",
};
function expandBookAbbreviations(s) {
  return s.replace(/\b([A-Z][a-z]{1,5})\b\.?/g, (m, w) => BOOK_ABBR[w] || m);
}

const ORDINALS = { 1: "First", 2: "Second", 3: "Third" };
function speakableReference(source) {
  let s = stripHtml(source);
  if (!s) return "";
  s = s.replace(/([A-Za-z])(\d)/g, "$1 $2");
  s = s.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-");
  s = expandBookAbbreviations(s);
  s = s.replace(/^([123])\s+/, (_, d) => `${ORDINALS[d]} `);
  const m = s.match(/^(.+?)\s+(\d+):([\d,\-\s]+)$/);
  if (m) {
    const book = m[1].trim();
    const chapter = m[2];
    const verses = m[3]
      .split(",")
      .map((v) => v.trim())
      .map((v) => (v.includes("-") ? v.replace("-", " to ") : v))
      .join(" and ");
    const plural = /to| and /.test(verses) ? "verses" : "verse";
    s = /^psalm$/i.test(book)
      ? `Psalm ${chapter}, ${plural} ${verses}`
      : `${book}, chapter ${chapter}, ${plural} ${verses}`;
  }
  return s.replace(/[.!?;:]+$/, "").trim();
}

/** The Church's standard spoken introduction to a scripture reading never
 *  includes chapter/verse numbers — the lector says "A reading from the
 *  [Letter/book/prophet] ..." and nothing more specific. Mirrors the
 *  client-side version in src/lib/tts.js exactly, so the device-voice
 *  fallback and the HD generated audio always say the same thing. */
const PAULINE_LETTERS = new Set([
  "Romans", "Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
  "Thessalonians", "Timothy", "Titus", "Philemon",
]);
const CATHOLIC_EPISTLES = new Set(["James", "Peter", "John", "Jude"]);
const PROPHET_BOOKS = new Set([
  "Isaiah", "Jeremiah", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah",
  "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
  "Malachi", "Baruch",
]);

function liturgicalIntroduction(source, isGospel) {
  let s = stripHtml(source);
  if (!s) return "";
  s = expandBookAbbreviations(s);
  s = s.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-");

  const m = s.match(/^(.+?)\s+\d+:[\d,\-\s]+$/);
  let bookPhrase = (m ? m[1] : s).trim();

  let ordinalWord = null;
  bookPhrase = bookPhrase.replace(/^([123])\s+/, (_, d) => {
    ordinalWord = ORDINALS[d];
    return "";
  });
  const book = bookPhrase.trim();

  if (isGospel) return `A reading from the holy Gospel according to ${book}.`;

  if (book === "Hebrews") return "A reading from the Letter to the Hebrews.";
  if (book === "Acts") return "A reading from the Acts of the Apostles.";
  if (book === "Revelation" || book === "Apocalypse") return "A reading from the book of Revelation.";
  if (PAULINE_LETTERS.has(book)) {
    return ordinalWord
      ? `A reading from the ${ordinalWord} Letter of Saint Paul to the ${book}.`
      : `A reading from the Letter of Saint Paul to the ${book}.`;
  }
  if (CATHOLIC_EPISTLES.has(book)) {
    return ordinalWord
      ? `A reading from the ${ordinalWord} Letter of Saint ${book}.`
      : `A reading from the Letter of Saint ${book}.`;
  }
  if (PROPHET_BOOKS.has(book)) return `A reading from the book of the prophet ${book}.`;
  return `A reading from the book of ${book}.`;
}

const SECTION_ORDER = [
  ["Mass_R1", "First Reading"],
  ["Mass_Ps", "Responsorial Psalm"],
  ["Mass_R2", "Second Reading"],
  ["Mass_GA", "Gospel Acclamation"],
  ["Mass_G", "Gospel"],
];

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Sentence list -> SSML fragments, expanding "Alleluia, alleluia" into a
 *  call-and-response with a distinct pause. */
function sentencesToSsmlParts(sentences, { acclamation = false } = {}) {
  const parts = [];
  for (const sentence of sentences) {
    if (acclamation && /^alleluia\s*,?\s*alleluia[!.]?$/i.test(sentence)) {
      parts.push(`Alleluia.<break time="700ms"/>Alleluia.`);
    } else {
      parts.push(esc(sentence));
    }
  }
  return parts;
}

/** The Responsorial Psalm's response line repeats between verses in
 *  Universalis' own text — matching the real liturgical structure. Gives
 *  those repeats extra pause, standing in for the congregation's turn. */
function sentencesToPsalmSsmlParts(sentences) {
  if (!sentences.length) return [];
  const refrainNorm = sentences[0].trim().toLowerCase();
  return sentences.map((s) =>
    s.trim().toLowerCase() === refrainNorm ? `${esc(s)}<break time="500ms"/>` : esc(s)
  );
}

/** Split SSML parts into requests under the byte limit (same voice). */
function packRequests(parts, { leadBreak = "", gap = "600ms", tailBreak = "1800ms" }) {
  const requests = [];
  let current = [];
  const wrap = (arr, lead, tail) =>
    `<speak>${lead}${arr.join(`<break time="${gap}"/>`)}${tail}</speak>`;
  for (const p of parts) {
    const trial = wrap([...current, p], "", "");
    if (Buffer.byteLength(trial, "utf8") > REQUEST_LIMIT_BYTES && current.length) {
      requests.push(current);
      current = [p];
    } else {
      current.push(p);
    }
  }
  if (current.length) requests.push(current);
  return requests.map((arr, i) =>
    wrap(
      arr,
      i === 0 ? leadBreak : "",
      i === requests.length - 1 ? `<break time="${tailBreak}"/>` : `<break time="${gap}"/>`
    )
  );
}

// ---------- fetch readings ----------
async function fetchReadings() {
  const url = `https://universalis.com/${compactDate}/jsonpmass.js`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CatholicDailyMass-AudioGenerator/1.0 (+contact via app)" },
  });
  if (!res.ok) throw new Error(`Universalis HTTP ${res.status} for ${url}`);
  const js = await res.text();
  const start = js.indexOf("(");
  const end = js.lastIndexOf(")");
  if (start < 0 || end < 0) throw new Error("Unexpected JSONP format from Universalis");
  return JSON.parse(js.slice(start + 1, end));
}

function normalise(data) {
  const pick = (v) =>
    v == null ? null : typeof v === "string" ? { source: "", text: v } : { source: v.source || "", text: v.text || "" };
  const sections = [];
  for (const [key, label] of SECTION_ORDER) {
    const s = pick(data[key]);
    if (s && s.text) {
      sections.push({ key, label, ...s });
    } else if (key === "Mass_Ps") {
      console.warn(
        `  \u26a0 No Responsorial Psalm in today's feed. Raw keys received: ${Object.keys(data).join(", ")}`
      );
    }
  }
  const day = stripHtml(typeof data.day === "string" ? data.day : data.day?.text || "");
  return { day, sections };
}

// ---------- build the synthesis plan ----------
function buildPlan({ day, sections }) {
  // Each item: { key, label, voice, ssmlRequests: [..] }
  const plan = [];

  plan.push({
    key: "blessing",
    label: "Opening Blessing",
    voice: MALE_VOICE,
    ssmlRequests: packRequests(sentencesToSsmlParts(toSentences(OPENING_BLESSING)), {
      leadBreak: `<break time="900ms"/>`,
      tailBreak: "1800ms",
    }),
  });

  for (const s of sections) {
    const isGospel = s.key === "Mass_G";
    const isReading = s.key === "Mass_R1" || s.key === "Mass_R2";
    const isPsalm = s.key === "Mass_Ps";
    const isAcclamation = s.key === "Mass_GA";
    const voice = isGospel ? MALE_VOICE : FEMALE_VOICE;
    const body = toSentences(stripHtml(s.text));

    let parts;
    if (isPsalm) {
      parts = [`Responsorial Psalm.<break time="500ms"/>`, ...sentencesToPsalmSsmlParts(body)];
    } else if (isAcclamation) {
      parts = [`The Gospel Acclamation.<break time="500ms"/>`, ...sentencesToSsmlParts(body, { acclamation: true })];
    } else {
      const header = liturgicalIntroduction(s.source, isGospel);
      parts = [esc(header) + `<break time="400ms"/>`, ...sentencesToSsmlParts(body, { acclamation: false })];
      if (isReading) parts.push(`<break time="1200ms"/>The Word of the Lord.`);
      if (isGospel) parts.push(`<break time="1200ms"/>The Gospel of the Lord.`);
    }
    plan.push({ key: s.key, label: s.label, voice, ssmlRequests: packRequests(parts, { tailBreak: "2200ms" }) });
  }
  return plan;
}

function countChars(plan) {
  return plan.reduce((n, item) => n + item.ssmlRequests.reduce((m, r) => m + r.length, 0), 0);
}

// ---------- synthesis ----------
async function synthesizeAll(client, plan) {
  const sectionBuffers = [];
  for (const item of plan) {
    const chunks = [];
    for (const ssml of item.ssmlRequests) {
      const [resp] = await client.synthesizeSpeech({
        input: { ssml },
        voice: { languageCode: LANGUAGE, name: item.voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: SPEAKING_RATE, pitch: 0 },
      });
      chunks.push(Buffer.from(resp.audioContent));
    }
    sectionBuffers.push({ key: item.key, label: item.label, buffer: Buffer.concat(chunks) });
    console.log(`  ✓ ${item.label} (${item.voice}, ${item.ssmlRequests.length} request${item.ssmlRequests.length > 1 ? "s" : ""})`);
  }
  return sectionBuffers;
}

async function durationOf(buffer) {
  const meta = await parseBuffer(buffer, { mimeType: "audio/mpeg" });
  return meta.format.duration || 0;
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Stitch bell + sections into one clean MP3. Requires ffmpeg — earlier
 *  versions of this script silently fell back to raw byte concatenation
 *  when ffmpeg was missing, which plays fine in lenient players but can
 *  stop after the first clip in stricter ones (VLC, Windows Media Player),
 *  since gluing separately-encoded MP3s together at the byte level often
 *  confuses decoders once the audio format changes mid-file. That fallback
 *  has been removed: this now fails loudly instead of shipping silently
 *  broken audio. Uses ffmpeg's concat FILTER (not the concat demuxer) —
 *  it decodes every input fully and re-encodes once as a single continuous
 *  stream, which is the robust way to join files with differing formats. */
function stitch(pieces, outPath) {
  if (!hasFfmpeg()) {
    throw new Error(
      "ffmpeg is required but was not found. Install it (the GitHub Action " +
        "does this automatically) — refusing to fall back to raw concatenation, " +
        "which produces broken audio in strict players."
    );
  }
  const tmpDir = fs.mkdtempSync(path.join(OUT_DIR, ".tmp-"));
  const inputArgs = [];
  const filterInputs = [];
  pieces.forEach((p, i) => {
    const f = path.join(tmpDir, `p${i}.mp3`);
    fs.writeFileSync(f, p);
    inputArgs.push("-i", f);
    filterInputs.push(`[${i}:a]`);
  });
  const filter = `${filterInputs.join("")}concat=n=${pieces.length}:v=0:a=1[out]`;
  execFileSync(
    "ffmpeg",
    ["-y", ...inputArgs, "-filter_complex", filter, "-map", "[out]", "-ar", "24000", "-ac", "1", "-b:a", "64k", outPath],
    { stdio: "inherit" }
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return "ffmpeg-concat-filter";
}

function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const f of fs.readdirSync(OUT_DIR)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.(mp3|json)$/);
    if (!m) continue;
    if (new Date(m[1]).getTime() < cutoff) fs.unlinkSync(path.join(OUT_DIR, f));
  }
}

// ---------- main ----------
(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (LIST_VOICES) {
    const client = new textToSpeech.TextToSpeechClient();
    const [result] = await client.listVoices({ languageCode: "en" });
    for (const v of result.voices.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`${v.name.padEnd(26)} ${v.ssmlGender.padEnd(8)} ${v.languageCodes.join(",")}`);
    }
    return;
  }

  console.log(`Generating audio for ${isoDate} …`);
  const data = await fetchReadings();
  const readings = normalise(data);
  if (!readings.sections.length) throw new Error("No readings returned for this date.");
  console.log(`  Day: ${readings.day || "(no title)"} — ${readings.sections.length} sections`);

  const plan = buildPlan(readings);
  const chars = countChars(plan);
  console.log(`  Characters to synthesise (incl. SSML): ${chars}`);
  if (chars > MAX_CHARS_PER_RUN) {
    throw new Error(`Refusing to run: ${chars} chars exceeds safety cap of ${MAX_CHARS_PER_RUN}.`);
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing sent to Google. Plan: ---");
    for (const item of plan) {
      console.log(`\n[${item.label}] voice=${item.voice}`);
      for (const r of item.ssmlRequests) console.log("  " + r.slice(0, 200) + (r.length > 200 ? " …" : ""));
    }
    return;
  }

  const client = new textToSpeech.TextToSpeechClient();
  console.log("  Synthesising with Google Cloud TTS …");
  const sections = await synthesizeAll(client, plan);

  // Timeline: bell first, then sections.
  const pieces = [];
  const timeline = [];
  let t = 0;
  if (fs.existsSync(BELL_PATH)) {
    const bell = fs.readFileSync(BELL_PATH);
    const d = await durationOf(bell);
    pieces.push(bell);
    timeline.push({ key: "bell", label: "Church Bell", start: t, end: t + d });
    t += d;
  }
  for (const s of sections) {
    const d = await durationOf(s.buffer);
    pieces.push(s.buffer);
    timeline.push({ key: s.key, label: s.label, start: t, end: t + d });
    t += d;
  }

  const mp3Path = path.join(OUT_DIR, `${isoDate}.mp3`);
  const jsonPath = path.join(OUT_DIR, `${isoDate}.json`);
  const method = stitch(pieces, mp3Path);
  const manifest = {
    date: isoDate,
    day: readings.day,
    generatedAt: new Date().toISOString(),
    voices: { readings: FEMALE_VOICE, gospel: MALE_VOICE },
    duration: t,
    sections: timeline,
    stitch: method,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));
  prune();

  const mb = (fs.statSync(mp3Path).size / 1048576).toFixed(2);
  console.log(`\nDone: ${path.relative(ROOT, mp3Path)} (${mb} MB, ${Math.round(t)}s)`);
  console.log(`Stitched via: ${method} — ${pieces.length} pieces (bell + ${sections.length} sections)`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
