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

const HEADER_GAP_MS = 900;
const SENTENCE_GAP_MS = 550;
const SECTION_GAP_MS = 2400;
const SPEECH_RATE = 0.85;

const OPENING_BLESSING =
  "In the name of the Father, and of the Son, and of the Holy Spirit. " +
  "Let us prepare our hearts to hear the Word of the Lord.";

/* ---------- text preparation ---------- */

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function stripTerminalPunctuation(s) {
  return s.replace(/[.!?;:]+\s*$/, "").trim();
}

function toSentences(text) {
  const raw = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9\u2018\u201C])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const cleaned = raw.map(stripTerminalPunctuation).filter(Boolean);
  return cleaned.length ? cleaned : [stripTerminalPunctuation(text)];
}

const ORDINALS = { 1: "First", 2: "Second", 3: "Third" };

function speakableReference(source) {
  let s = stripHtml(source);
  if (!s) return "";
  s = s.replace(/([A-Za-z])(\d)/g, "$1 $2");
  s = s.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-");
  s = s.replace(/\bPs\b\.?/i, "Psalm");
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

/* ---------- voice selection ---------- */

const MALE_HINTS =
  /male|david|daniel|george|james|john|thomas|arthur|ryan|guy|fred|alex\b|oliver|aaron|brian|eric|matthew|william|mark\b|paul\b/i;
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

function voiceMap() {
  const { voices, male, female } = classifyVoices();
  const fallback = voices[0] || null;
  let general, gospel;
  if (female.length || male.length) {
    general = female[0] || fallback;
    gospel = male[0] || fallback;
  } else if (voices.length >= 2) {
    general = voices[0];
    gospel = voices[1];
  } else {
    general = gospel = fallback;
  }
  const map = { Mass_R1: general, Mass_Ps: general, Mass_R2: general, Mass_GA: general, Mass_G: gospel, default: fallback };
  // eslint-disable-next-line no-console
  console.log("[Daily Mass] Voices available:", voices.map((v) => v.name).join(", ") || "(none)");
  // eslint-disable-next-line no-console
  console.log("[Daily Mass] Assigned — Readings/Psalm:", general?.name, "| Gospel/Blessing:", gospel?.name);
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

  const estimatedMs = Math.max(2200, item.text.split(/\s+/).length * 420);
  const watchdog = setTimeout(advance, estimatedMs);

  window.speechSynthesis.speak(utter);
}

export function isSupported() {
  return "speechSynthesis" in window;
}

export function play(sections, handlers = {}) {
  stop();
  onProgress = handlers.onProgress || null;
  onDone = handlers.onDone || null;

  const map = voiceMap();
  queue = [];

  // Church bell, then the opening blessing in the Gospel/male voice.
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
    const ref = speakableReference(s.source);
    const headerText = ref ? `${s.label}, ${ref}` : s.label;

    queue.push({ key: s.key, voice, text: headerText, isHeader: true, gapAfter: HEADER_GAP_MS });

    const sentences = toSentences(stripHtml(s.text));
    sentences.forEach((sentence, i) => {
      const isLast = i === sentences.length - 1;
      queue.push({ key: s.key, voice, text: sentence, isHeader: false, gapAfter: isLast ? SECTION_GAP_MS : SENTENCE_GAP_MS });
    });

    if (s.key === "Mass_G") {
      queue.push({ key: s.key, voice, text: "The Gospel of the Lord", isHeader: false, gapAfter: SECTION_GAP_MS });
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
