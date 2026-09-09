/**
 * Listen engine — reads the day's readings aloud using the device's own
 * speech synthesis, sentence by sentence, at an unhurried pace.
 *
 * Playback order: church bell -> opening blessing (Gospel/male voice) ->
 * First Reading -> Psalm -> Second Reading (Sundays) -> Acclamation ->
 * Gospel -> "The Gospel of the Lord" (Gospel/male voice).
 *
 * IMPORTANT — Android fix: an earlier version periodically called
 * pause()+resume() to dodge a desktop-Chrome stalling bug. On Android this
 * silently breaks the native speech engine: the JS layer keeps reporting
 * "still speaking" while the phone has actually gone silent. That
 * workaround has been removed entirely. In its place: a persistent
 * reference to the utterance currently playing (prevents a separate,
 * genuine Android GC bug that can kill the "finished" event) plus a
 * watchdog timer that force-advances if the browser never reports
 * completion at all.
 */
import { ringBell } from "./bell.js";

let queue = [];
let current = -1;
let onProgress = null;
let onDone = null;
let active = false;
let gapTimer = null;
let currentUtterance = null;

const HEADER_GAP_MS = 1000;
const SENTENCE_GAP_MS = 750;
const SECTION_GAP_MS = 2400;
const CHORUS_GAP_MS = 700; // pause between the two "Alleluia"s
const SPEECH_RATE = 0.82;

const OPENING_BLESSING =
  "In the name of the Father, and of the Son, and of the Holy Spirit. " +
  "Let us prepare our hearts to hear the Word of the Lord.";

/* ---------- text preparation ---------- */

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

/** Strips trailing sentence-ending punctuation — including when it's
 *  followed by a closing quote mark (e.g. `...your face.'`), which a plain
 *  end-of-string check misses. Our own pause conveys the sentence break;
 *  leaving a lone period for the engine to interpret is what causes some
 *  voices to read it aloud as the word "dot", especially on short lines. */
function stripTerminalPunctuation(s) {
  return s.replace(/[.!?;:]+[\u2018\u2019\u201C\u201D"')\]]*\s*$/, "").trim();
}

function toSentences(text) {
  const raw = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9\u2018\u201C])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const cleaned = raw.map(stripTerminalPunctuation).filter(Boolean);
  return cleaned.length ? cleaned : [stripTerminalPunctuation(text)];
}

/** In the Gospel Acclamation, "Alleluia, alleluia" is meant to sound like a
 *  short choral call-and-response, not one rushed word. Splits that pair
 *  into two separate spoken items with a distinct pause between them. */
const ALLELUIA_PAIR = /^alleluia\s*,?\s*alleluia$/i;

function expandAcclamation(sentences) {
  const out = [];
  sentences.forEach((sentence) => {
    if (ALLELUIA_PAIR.test(sentence)) {
      out.push({ text: "Alleluia", gapAfter: CHORUS_GAP_MS });
      out.push({ text: "Alleluia", gapAfter: null });
    } else {
      out.push({ text: sentence, gapAfter: null });
    }
  });
  return out;
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

  const match = s.match(/^(.+?)\s+(\d+):([\d,\-\s]+)$/);
  if (match) {
    const book = match[1].trim();
    const chapter = match[2];
    const verseList = match[3]
      .split(",")
      .map((v) => v.trim())
      .map((v) => (v.includes("-") ? v.replace("-", " to ") : v))
      .join(" and ");
    const plural = /to| and /.test(verseList) ? "verses" : "verse";
    s = /^psalm$/i.test(book)
      ? `Psalm ${chapter}, ${plural} ${verseList}`
      : `${book}, chapter ${chapter}, ${plural} ${verseList}`;
  }
  return stripTerminalPunctuation(s.replace(/\s+/g, " ").trim());
}

/** The Church's standard spoken introduction to a scripture reading never
 *  includes chapter/verse numbers — the lector says "A reading from the
 *  [Letter/book/prophet] ..." and nothing more specific. This builds that
 *  exact formula from the printed citation, dropping the numbers entirely.
 *  (Chapter/verse still SHOWS on screen — only the spoken audio changes.) */
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

/* ---------- voice selection ---------- */

const MALE_HINTS =
  /(?<!fe)male|david|daniel|george|james|john|thomas|arthur|ryan|guy|fred|alex\b|oliver|aaron|brian|eric|matthew|william|mark\b|paul\b/i;
const FEMALE_HINTS =
  /female|zira|hazel|susan|samantha|victoria|karen|serena|kate|emma|amy|joanna|salli|olivia|sonia|libby|aria|jenny|catherine|fiona|moira|tessa|linda|heera/i;

function englishVoices() {
  const all = window.speechSynthesis.getVoices();
  const en = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  return en.length ? en : all;
}

function classifyVoices() {
  const voices = englishVoices();
  const male = voices.filter((v) => MALE_HINTS.test(v.name) && !FEMALE_HINTS.test(v.name));
  const female = voices.filter((v) => FEMALE_HINTS.test(v.name));
  return { voices, male, female };
}

/** Waits for the device to finish reporting its installed voices. On some
 *  Android phones, getVoices() returns an incomplete or empty list for a
 *  moment after page load, and picking a voice too early — before the
 *  full list is ready — is a major source of inconsistent voice choices. */
function ensureVoicesLoaded() {
  return new Promise((resolve) => {
    if (window.speechSynthesis.getVoices().length > 0) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    window.speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 1200);
  });
}

function restoreVoice(key, voices) {
  try {
    const name = localStorage.getItem(key);
    return name ? voices.find((v) => v.name === name) || null : null;
  } catch {
    return null;
  }
}

function persistVoice(key, voice) {
  try {
    if (voice) localStorage.setItem(key, voice.name);
  } catch {
    /* ignore */
  }
}

/** Clears the device's remembered voice choices. Call this after installing
 *  a new voice pack in the phone's settings, so the app picks it up instead
 *  of continuing to reuse whatever it chose before. */
export function resetRememberedVoices() {
  try {
    localStorage.removeItem("cdm-voice-general");
    localStorage.removeItem("cdm-voice-gospel");
  } catch {
    /* ignore */
  }
}

/** Reports whether this device currently has a voice identifiable as male,
 *  without picking or remembering anything — safe to call for a UI check. */
export async function hasMaleVoice() {
  await ensureVoicesLoaded();
  return classifyVoices().male.length > 0;
}

/** Picks (and permanently remembers) one voice for readings and one for the
 *  Gospel role, so the same two voices are used every time on this device.
 *  If no voice on this device is identifiable as male, the Gospel simply
 *  uses the same voice as everything else — no pitch-shifting trick, which
 *  sounds artificial. See hasMaleVoice() for surfacing this to the user. */
function voiceMap() {
  const { voices, male, female } = classifyVoices();
  const fallback = voices[0] || null;

  let general = restoreVoice("cdm-voice-general", voices) || female[0] || fallback;
  let gospel = restoreVoice("cdm-voice-gospel", voices) || male[0] || general;

  persistVoice("cdm-voice-general", general);
  persistVoice("cdm-voice-gospel", gospel);

  const gospelIsConfirmedMale = gospel && MALE_HINTS.test(gospel.name) && !FEMALE_HINTS.test(gospel.name);

  const map = {
    Mass_R1: general,
    Mass_Ps: general,
    Mass_R2: general,
    Mass_GA: general,
    Mass_G: gospel,
    default: fallback,
  };

  // eslint-disable-next-line no-console
  console.log("[Daily Mass] Voices available:", voices.map((v) => v.name).join(", ") || "(none)");
  // eslint-disable-next-line no-console
  console.log(
    "[Daily Mass] Readings/Psalm:", general?.name,
    "| Gospel/Blessing:", gospel?.name,
    gospelIsConfirmedMale ? "(confirmed male voice)" : "(no male voice on this device — using the same voice as other readings, no pitch trick)"
  );

  return map;
}

/* ---------- playback ---------- */

function speakNext() {
  current += 1;
  if (!active || current >= queue.length) {
    stop();
    if (onDone) onDone();
    return;
  }
  const item = queue[current];

  if (item.type === "bell") {
    ringBell().then(() => {
      if (!active) return;
      gapTimer = setTimeout(speakNext, item.gapAfter);
    });
    return;
  }

  if (item.isHeader && onProgress) onProgress(item.key);

  const utter = new SpeechSynthesisUtterance(item.text);
  currentUtterance = utter; // hold a reference — prevents the Android GC bug
  if (item.voice) utter.voice = item.voice;
  utter.rate = SPEECH_RATE;
  utter.pitch = 1.0;

  let advanced = false;
  const advance = () => {
    if (advanced) return;
    advanced = true;
    clearTimeout(watchdog);
    if (!active) return;
    gapTimer = setTimeout(speakNext, item.gapAfter);
  };
  utter.onend = advance;
  utter.onerror = advance;

  // This is a safety net for the rare case where the browser never fires
  // onend/onerror at all — NOT a routine substitute for it. An earlier,
  // tighter estimate here was firing before some sentences had actually
  // finished playing, which queued the next line immediately afterward
  // with no audible gap. A generous margin avoids that while still
  // catching a genuinely stuck utterance (which would otherwise hang
  // silently forever).
  const estimatedMs = Math.max(4000, item.text.split(/\s+/).length * 600);
  const watchdog = setTimeout(advance, estimatedMs);

  window.speechSynthesis.speak(utter);
}

export function isSupported() {
  return "speechSynthesis" in window;
}

export async function play(sections, handlers = {}) {
  stop();
  onProgress = handlers.onProgress || null;
  onDone = handlers.onDone || null;

  await ensureVoicesLoaded();
  const map = voiceMap();
  queue = [];

  // Church bell, then the opening blessing in the Gospel voice.
  queue.push({ type: "bell", gapAfter: 900 });
  toSentences(OPENING_BLESSING).forEach((sentence, i, arr) => {
    queue.push({
      voice: map.Mass_G,
      text: sentence,
      isHeader: i === 0,
      key: "blessing",
      gapAfter: i === arr.length - 1 ? SECTION_GAP_MS : SENTENCE_GAP_MS,
    });
  });

  sections.forEach((s) => {
    const voice = map[s.key] || map.default;
    const isReading = s.key === "Mass_R1" || s.key === "Mass_R2";
    const isGospel = s.key === "Mass_G";

    let headerText;
    if (isReading || isGospel) {
      headerText = liturgicalIntroduction(s.source, isGospel);
    } else {
      const ref = speakableReference(s.source);
      headerText = ref ? `${s.label}, ${ref}` : s.label;
    }

    queue.push({ key: s.key, voice, text: headerText, isHeader: true, gapAfter: HEADER_GAP_MS });

    const rawSentences = toSentences(stripHtml(s.text));
    const items = s.key === "Mass_GA" ? expandAcclamation(rawSentences) : rawSentences.map((t) => ({ text: t, gapAfter: null }));

    items.forEach((it, i) => {
      const isLast = i === items.length - 1;
      queue.push({
        key: s.key,
        voice,
        text: it.text,
        isHeader: false,
        gapAfter: it.gapAfter ?? (isLast ? SECTION_GAP_MS : SENTENCE_GAP_MS),
      });
    });

    if (isReading) {
      queue.push({ key: s.key, voice, text: "The Word of the Lord.", isHeader: false, gapAfter: SECTION_GAP_MS });
    }
    if (isGospel) {
      queue.push({ key: s.key, voice, text: "The Gospel of the Lord.", isHeader: false, gapAfter: SECTION_GAP_MS });
    }
  });

  current = -1;
  active = true;
  speakNext();
}

export function pause() {
  window.speechSynthesis.pause();
}

export function resume() {
  window.speechSynthesis.resume();
}

export function stop() {
  active = false;
  if (gapTimer) {
    clearTimeout(gapTimer);
    gapTimer = null;
  }
  currentUtterance = null;
  window.speechSynthesis.cancel();
  queue = [];
  current = -1;
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
