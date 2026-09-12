/**
 * Catholic Daily Mass — daily YouTube poster
 *
 * Uploads the same video built for Facebook (backdrop photo + HD audio,
 * from build-social-video.js) to YouTube, with a proper YouTube-style
 * title, a fuller description including chapter timestamps, and tags.
 *
 * Usage:
 *   node scripts/post-to-youtube.js                # today (SA time)
 *   node scripts/post-to-youtube.js 2026-09-11     # a specific date
 *   node scripts/post-to-youtube.js --dry-run       # build everything, upload nothing
 *
 * Auth: set YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN as
 * environment variables. Get these once via youtube-auth-setup.js — see
 * that file for full one-time setup instructions.
 *
 * SAFETY:
 *  - One date per run, no retries, no loops.
 *  - Refuses to run if the day's video hasn't been built yet — run
 *    build-social-video.js first in the same workflow.
 *  - A missing reflection is not fatal — the description just omits it.
 *  - Uploads default to "unlisted" is NOT used — videos post as public,
 *    matching the intent of a daily public ministry upload. Change
 *    PRIVACY_STATUS below if you'd rather review before publishing.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { socialVideoPath } from "./build-social-video.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const REFLECTIONS_DIR = path.join(ROOT, "public", "reflections");

const APP_URL = "https://catholic-daily-mass.vercel.app/";
const CHANNEL_URL = "https://www.youtube.com/channel/UC2NDjwPehZIdHaUt3X59zCg";
const PRIVACY_STATUS = "public"; // change to "unlisted" or "private" to review before publishing
const MAX_TITLE_CHARS = 100; // YouTube's own hard limit
const MAX_DESCRIPTION_CHARS = 4900; // YouTube's own hard limit is 5000; leaving a small margin

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = dateArg || sastToday();
const compactDate = isoDate.replace(/-/g, "");

// ---------- minimal readings fetch (mirrors the other scripts) ----------
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
    headers: { "User-Agent": "CatholicDailyMass-YouTubePoster/1.0 (+contact via app)" },
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

// ---------- chapter timestamps, from the same manifest the app itself uses ----------
function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildChapters(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  const sections = manifest.sections || [];
  if (sections.length < 3) return null; // YouTube requires at least 3 to show chapters

  // Force the very first entry to 0:00 — YouTube requires this exactly,
  // even if the bell has a fraction of a second of silence before it.
  return sections.map((s, i) => `${i === 0 ? "0:00" : formatTimestamp(s.start)} ${s.label}`);
}

// ---------- build the title, description, and tags ----------
export function buildTitle({ day, gospel }) {
  const base = "Catholic Daily Mass";
  // Compound feast days ("X or Y or Z") can be very long — the first
  // alternative alone is enough for a title; the full text still appears
  // in full in the description.
  const shortDay = day ? day.split(/\s+\bor\b\s+/i)[0] : "";
  const withDay = shortDay ? `${base} \u2014 ${shortDay}` : base;
  if (withDay.length <= MAX_TITLE_CHARS) return withDay;
  const truncated = withDay.slice(0, MAX_TITLE_CHARS - 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

export function buildDescription({ day, gospel, reflectionText, chapters }) {
  const lines = [];
  lines.push(`Today's Catholic Mass readings \u2014 ${day || isoDate}.`, "");

  if (gospel) {
    lines.push(`GOSPEL${gospel.source ? ` (${gospel.source})` : ""}`, gospel.text, "");
  }
  if (reflectionText) {
    lines.push("A QUIET REFLECTION", reflectionText, "");
  }

  if (chapters && chapters.length) {
    lines.push("CHAPTERS", ...chapters, "");
  }

  lines.push(
    "Read today's full readings, follow along with the text, and explore past days:",
    APP_URL,
    "",
    "Subscribe for daily Mass readings, delivered with a real church bell and a proper priest's voice for the Gospel:",
    CHANNEL_URL,
    "",
    "#CatholicDailyMass #DailyGospel #CatholicMass #DailyReadings #CatholicPrayer #WordOfGod"
  );

  let description = lines.join("\n");
  if (description.length > MAX_DESCRIPTION_CHARS) {
    description = description.slice(0, MAX_DESCRIPTION_CHARS - 4) + "\n\u2026";
  }
  return description;
}

const TAGS = [
  "Catholic Daily Mass",
  "Daily Gospel",
  "Catholic Mass Readings",
  "Daily Mass Readings",
  "Catholic Prayer",
  "Daily Gospel Reading",
  "Catholic Reflection",
  "Word of God",
];

// ---------- upload to YouTube ----------
async function uploadVideo({ videoPath, title, description }) {
  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YT_CLIENT_ID, YT_CLIENT_SECRET, and YT_REFRESH_TOKEN must all be set.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
        tags: TAGS,
        categoryId: "22", // "People & Blogs" — YouTube has no dedicated religious category
      },
      status: {
        privacyStatus: PRIVACY_STATUS,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  return res.data;
}

// ---------- main ----------
async function main() {
  console.log(`Preparing YouTube upload for ${isoDate} …`);

  const videoPath = socialVideoPath(ROOT, isoDate);
  if (!fs.existsSync(videoPath)) {
    throw new Error(
      `No pre-built video found at ${path.relative(ROOT, videoPath)}. Run build-social-video.js for this date first.`
    );
  }

  const data = await fetchReadings();
  const day = stripHtml(typeof data.day === "string" ? data.day : data.day?.text || "");
  const gospelRaw = pick(data.Mass_G);
  const gospel = gospelRaw
    ? { source: stripHtml(gospelRaw.source), text: stripHtml(gospelRaw.text) }
    : null;
  if (!gospel) console.warn("  \u26a0 No Gospel text found for this date — uploading without it.");

  const reflectionPath = path.join(REFLECTIONS_DIR, `${isoDate}.json`);
  let reflectionText = null;
  if (fs.existsSync(reflectionPath)) {
    try {
      const r = JSON.parse(fs.readFileSync(reflectionPath, "utf8"));
      reflectionText = r.text || null;
    } catch {
      console.warn("  \u26a0 Could not read today's reflection file — uploading without it.");
    }
  }

  const manifestPath = path.join(AUDIO_DIR, `${isoDate}.json`);
  const chapters = buildChapters(manifestPath);
  if (!chapters) console.log("  (No chapter timestamps available for this date.)");

  const title = buildTitle({ day, gospel });
  const description = buildDescription({ day, gospel, reflectionText, chapters });

  console.log(`  Title: ${title}`);
  console.log(`  Description length: ${description.length} characters`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing uploaded to YouTube. ---\n");
    console.log(`TITLE:\n${title}\n`);
    console.log(`DESCRIPTION:\n${description}\n`);
    console.log(`TAGS:\n${TAGS.join(", ")}\n`);
    console.log(`Using pre-built video at: ${videoPath}`);
    return;
  }

  console.log("  Uploading to YouTube (this can take a few minutes) …");
  const result = await uploadVideo({ videoPath, title, description });

  console.log(`\nDone! Video: https://youtu.be/${result.id}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
