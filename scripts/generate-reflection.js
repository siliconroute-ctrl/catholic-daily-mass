/**
 * Catholic Daily Mass — daily reflection generator (Claude API)
 *
 * Produces a short, quiet devotional reflection on the day's First Reading,
 * Psalm, and Gospel — one per day, shared by every visitor (not generated
 * per-user), matching the same cost-safe pattern as generate-audio.js.
 *
 * Output: public/reflections/YYYY-MM-DD.json
 *
 * Usage:
 *   node scripts/generate-reflection.js                # today (SA time)
 *   node scripts/generate-reflection.js 2026-09-09     # a specific date
 *   node scripts/generate-reflection.js --dry-run       # show the prompt, call nothing, zero cost
 *
 * Auth: set ANTHROPIC_API_KEY as an environment variable. Never commit it.
 *
 * SAFETY (cost + content):
 *  - One date per run, no retries, no loops.
 *  - Hard cap on output length (max_tokens) — this can never generate a
 *    long or runaway response.
 *  - The prompt explicitly asks for a devotional reflection, not doctrine,
 *    and the output is always labelled in the app as AI-generated and
 *    offered for personal reflection only — never presented as official
 *    Church teaching or a homily.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import textToSpeech from "@google-cloud/text-to-speech";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "reflections");
const KEEP_DAYS = 14;

const MODEL = process.env.REFLECTION_MODEL || "claude-haiku-4-5-20251001";
const MAX_TOKENS = 400; // hard cap — a devotional reflection is short by design
const MAX_REFLECTION_CHARS = 2000; // safety cap before sending to Google TTS

// Same voice as the readings, for a consistent listening experience.
const VOICE = process.env.REFLECTION_VOICE || "en-GB-Neural2-A";
const LANGUAGE = process.env.REFLECTION_LANGUAGE || "en-GB";
const SPEAKING_RATE = 0.92;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = dateArg || sastToday();
const compactDate = isoDate.replace(/-/g, "");

// ---------- minimal readings fetch (mirrors generate-audio.js) ----------
function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li)>/gi, " ")
    .replace(/\r\n|\r|\n/g, " ")
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

async function fetchReadings() {
  const url = `https://universalis.com/${compactDate}/jsonpmass.js`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CatholicDailyMass-ReflectionGenerator/1.0 (+contact via app)" },
  });
  if (!res.ok) throw new Error(`Universalis HTTP ${res.status} for ${url}`);
  const js = await res.text();
  const start = js.indexOf("(");
  const end = js.lastIndexOf(")");
  if (start < 0 || end < 0) throw new Error("Unexpected JSONP format from Universalis");
  return JSON.parse(js.slice(start + 1, end));
}

function pick(v) {
  if (v == null) return null;
  if (typeof v === "string") return { source: "", text: v };
  return { source: v.source || "", text: v.text || "" };
}

// ---------- build the prompt ----------
const SYSTEM_PROMPT = `You write a short, quiet devotional reflection for a Catholic daily Mass \
app. The reflection accompanies that day's Scripture readings and helps someone pause and pray \
with the Word for a moment — it is not a homily, a Bible study, or a doctrinal explainer.

Tone: gentle, contemplative, unhurried — like a quiet moment of prayer, not a lecture. Plain, \
warm language. No jargon.

Content: draw out ONE simple, honest connecting thread across the readings rather than trying \
to cover everything. You may reference a specific image or phrase from the text. Avoid making \
definitive doctrinal pronouncements, avoid political or controversial framing, and avoid \
inventing historical or biographical claims not in the text itself.

Length: 2 to 3 short paragraphs, about 150 to 220 words total.

Ending: close with a brief, gentle invitation to prayer or reflection — an invitation, never a \
directive or a command.

Formatting: write in plain prose only. Do not use markdown — no asterisks, no bold, no italics, \
no bullet points. This text is displayed as plain text, so any formatting symbols would appear \
as literal characters on the page.

Output ONLY the reflection text itself. No heading, no title, no "Reflection:" label, no sign-off.`;

function buildUserPrompt(readings) {
  const parts = [`Today's Mass readings (${readings.day || isoDate}):`, ""];
  if (readings.r1) parts.push("First Reading:", readings.r1, "");
  if (readings.psalm) parts.push("Responsorial Psalm (the repeated response):", readings.psalm, "");
  if (readings.gospel) parts.push("Gospel:", readings.gospel, "");
  parts.push("Write today's quiet reflection.");
  return parts.join("\n");
}

async function callClaude(userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  let text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Empty response from Anthropic API.");

  // Safety net: the prompt asks for plain prose, but strip stray markdown
  // anyway (asterisks, underscores, bullets) since it displays as literal
  // characters otherwise.
  text = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1")
    .replace(/^[-*]\s+/gm, "");

  return text;
}

function prune() {
  if (!fs.existsSync(OUT_DIR)) return;
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const f of fs.readdirSync(OUT_DIR)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.(json|mp3)$/);
    if (!m) continue;
    if (new Date(m[1]).getTime() < cutoff) fs.unlinkSync(path.join(OUT_DIR, f));
  }
}

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toSentences(text) {
  const raw = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9\u2018\u201C])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.length ? raw : [text];
}

function buildReflectionSsml(text) {
  const sentences = toSentences(text);
  const parts = sentences.map(
    (s, i) => esc(s) + (i < sentences.length - 1 ? '<break time="500ms"/>' : "")
  );
  return `<speak>${parts.join(" ")}<break time="600ms"/></speak>`;
}

async function synthesizeReflectionAudio(text) {
  const client = new textToSpeech.TextToSpeechClient();
  const ssml = buildReflectionSsml(text);
  const [resp] = await client.synthesizeSpeech({
    input: { ssml },
    voice: { languageCode: LANGUAGE, name: VOICE },
    audioConfig: { audioEncoding: "MP3", speakingRate: SPEAKING_RATE, pitch: 0 },
  });
  return Buffer.from(resp.audioContent);
}

// ---------- main ----------
(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Generating reflection for ${isoDate} …`);
  const data = await fetchReadings();

  const readings = {
    day: stripHtml(typeof data.day === "string" ? data.day : data.day?.text || ""),
    r1: stripHtml(pick(data.Mass_R1)?.text || ""),
    psalm: stripHtml(pick(data.Mass_Ps)?.text || "").split(".")[0], // just the opening response line
    gospel: stripHtml(pick(data.Mass_G)?.text || ""),
  };

  if (!readings.gospel) {
    throw new Error("No Gospel text found for this date — refusing to generate a reflection without it.");
  }

  const userPrompt = buildUserPrompt(readings);
  console.log(`  Prompt length: ${userPrompt.length} characters`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing sent to Anthropic. Prompt: ---\n");
    console.log(SYSTEM_PROMPT);
    console.log("\n---\n");
    console.log(userPrompt);
    return;
  }

  console.log("  Calling Claude …");
  const reflection = await callClaude(userPrompt);
  console.log(`  Reflection length: ${reflection.length} characters`);

  if (reflection.length > MAX_REFLECTION_CHARS) {
    throw new Error(
      `Refusing to synthesise: reflection is ${reflection.length} characters, exceeding the safety cap of ${MAX_REFLECTION_CHARS}.`
    );
  }

  console.log("  Synthesising audio with Google Cloud TTS …");
  const audioBuffer = await synthesizeReflectionAudio(reflection);
  const mp3Path = path.join(OUT_DIR, `${isoDate}.mp3`);
  fs.writeFileSync(mp3Path, audioBuffer);

  const outPath = path.join(OUT_DIR, `${isoDate}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        date: isoDate,
        day: readings.day,
        model: MODEL,
        voice: VOICE,
        generatedAt: new Date().toISOString(),
        text: reflection,
        hasAudio: true,
      },
      null,
      2
    )
  );
  prune();

  const kb = (audioBuffer.length / 1024).toFixed(0);
  console.log(`\nDone: ${path.relative(ROOT, outPath)} and ${path.relative(ROOT, mp3Path)} (${kb} KB)`);
  console.log(`\n--- Reflection ---\n${reflection}\n`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
