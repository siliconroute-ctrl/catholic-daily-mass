/**
 * Catholic Daily Mass — daily Facebook poster
 *
 * Posts once a day to the CatholicMass Page: the day's Gospel text, the
 * quiet reflection (if one was generated), and a link to the app — with
 * the day's HD audio attached as a video.
 *
 * IMPORTANT — why a video, not an audio file: Facebook's Graph API has no
 * "attach a plain audio file" post type. Images, videos, and links are the
 * only native attachment types. The standard way anyone shares audio on
 * Facebook (podcasts, sermons, etc.) is to package it as a video: a static
 * background image with the audio playing underneath. That's what this
 * script does — it does not create a new video "on air," this is exactly
 * how existing daily-audio Facebook pages work.
 *
 * Usage:
 *   node scripts/post-to-facebook.js                # today (SA time)
 *   node scripts/post-to-facebook.js 2026-09-11     # a specific date
 *   node scripts/post-to-facebook.js --dry-run       # build everything, post nothing, zero cost/risk
 *
 * Auth: set FB_PAGE_ID and FB_PAGE_TOKEN as environment variables.
 *
 * SAFETY:
 *  - One date per run, no retries, no loops.
 *  - Hard cap on post text length.
 *  - Refuses to run if the day's audio file doesn't exist yet — run this
 *    AFTER generate-audio.js in the same workflow, never before.
 *  - A missing reflection is not fatal — the post just omits that part.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const REFLECTIONS_DIR = path.join(ROOT, "public", "reflections");
const PUBLIC_DIR = path.join(ROOT, "public");

const APP_URL = "https://catholic-daily-mass.vercel.app/";
const MAX_MESSAGE_CHARS = 15000; // generous, but a real cap — never truly unbounded
const GRAPH_VERSION = "v21.0";

// A handful of candidate backdrop images to try, in order — same idea as
// the app's own photo-pool fallback. If none exist, a plain generated
// backdrop is used instead so this can never hard-fail for a cosmetic reason.
// Uses the SAME photo pool the app itself draws from (church-*.jpg and
// church-interior-*.jpg in public/) — one pool, shared by both the app and
// Facebook, so there's only ever one set of photos to maintain. Picks one
// at random each run, rather than always favouring the same photo.
const BACKDROP_PATTERN = /^church(-interior)?-\d+\.(jpe?g|png)$/i;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = dateArg || sastToday();
const compactDate = isoDate.replace(/-/g, "");

// ---------- minimal readings fetch (mirrors generate-audio.js / generate-reflection.js) ----------
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
    headers: { "User-Agent": "CatholicDailyMass-FacebookPoster/1.0 (+contact via app)" },
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

// ---------- build the post text ----------
function buildMessage({ day, gospel, reflectionText }) {
  const lines = [];
  lines.push(`\u2728 Today's Mass \u2014 ${day || isoDate}`, "");
  if (gospel) {
    lines.push(`\u271D\uFE0F Gospel${gospel.source ? ` (${gospel.source})` : ""}`, gospel.text, "");
  }
  if (reflectionText) {
    lines.push("\uD83D\uDD4A\uFE0F A Quiet Reflection", reflectionText, "");
  }
  lines.push(
    "\uD83D\uDCD6 Read the full readings, listen to today's Mass, and pray with us daily:",
    APP_URL
  );
  let message = lines.join("\n");
  if (message.length > MAX_MESSAGE_CHARS) {
    message = message.slice(0, MAX_MESSAGE_CHARS - 20) + "\u2026\n\n" + APP_URL;
  }
  return message;
}

// ---------- build the video (background image + audio) ----------
function findBackdrop() {
  let files;
  try {
    files = fs.readdirSync(PUBLIC_DIR);
  } catch {
    return null;
  }
  const pool = files.filter((f) => BACKDROP_PATTERN.test(f));
  if (pool.length === 0) {
    const iconPath = path.join(PUBLIC_DIR, "icon-512.png");
    return fs.existsSync(iconPath) ? iconPath : null;
  }
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  console.log(`  Backdrop chosen at random: ${chosen} (from a pool of ${pool.length})`);
  return path.join(PUBLIC_DIR, chosen);
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Generates a plain garnet-and-gold backdrop if no photo is available, so
 *  this never hard-fails just because a photo slot happens to be empty. */
function generatePlainBackdrop(outPath) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=0x6E1423:s=1280x720",
      "-frames:v", "1",
      outPath,
    ],
    { stdio: "ignore" }
  );
}

function buildVideo(audioPath, outPath) {
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg is required to package the audio as a video but was not found.");
  }
  let backdrop = findBackdrop();
  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-fb-"));
  if (!backdrop) {
    backdrop = path.join(tmpDir, "backdrop.png");
    generatePlainBackdrop(backdrop);
  }
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loop", "1",
      "-framerate", "6",
      "-i", backdrop,
      "-i", audioPath,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "stillimage",
      "-r", "6",
      "-c:a", "aac",
      "-b:a", "128k",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "-movflags", "+faststart",
      "-shortest",
      outPath,
    ],
    { stdio: "inherit" }
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ---------- upload to Facebook ----------
async function uploadVideo({ pageId, token, videoPath, message }) {
  const buffer = fs.readFileSync(videoPath);
  const form = new FormData();
  form.append("source", new Blob([buffer], { type: "video/mp4" }), "daily-mass.mp4");
  form.append("description", message);
  form.append("access_token", token);

  const res = await fetch(`https://graph-video.facebook.com/${GRAPH_VERSION}/${pageId}/videos`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Facebook API error: ${data.error?.message || res.statusText}`);
  }
  return data;
}

// ---------- main ----------
(async () => {
  console.log(`Preparing Facebook post for ${isoDate} …`);

  const audioPath = path.join(AUDIO_DIR, `${isoDate}.mp3`);
  if (!fs.existsSync(audioPath)) {
    throw new Error(
      `No audio file found at ${path.relative(ROOT, audioPath)}. Run generate-audio.js for this date first.`
    );
  }

  const data = await fetchReadings();
  const day = stripHtml(typeof data.day === "string" ? data.day : data.day?.text || "");
  const gospelRaw = pick(data.Mass_G);
  const gospel = gospelRaw
    ? { source: stripHtml(gospelRaw.source), text: stripHtml(gospelRaw.text) }
    : null;
  if (!gospel) console.warn("  \u26a0 No Gospel text found for this date — posting without it.");

  const reflectionPath = path.join(REFLECTIONS_DIR, `${isoDate}.json`);
  let reflectionText = null;
  if (fs.existsSync(reflectionPath)) {
    try {
      const r = JSON.parse(fs.readFileSync(reflectionPath, "utf8"));
      reflectionText = r.text || null;
    } catch {
      console.warn("  \u26a0 Could not read today's reflection file — posting without it.");
    }
  } else {
    console.log("  (No reflection generated for this date — posting without it.)");
  }

  const message = buildMessage({ day, gospel, reflectionText });
  console.log(`  Message length: ${message.length} characters`);

  const videoPath = path.join(ROOT, `.fb-post-${isoDate}.mp4`);
  console.log("  Building video (backdrop + audio) …");
  buildVideo(audioPath, videoPath);
  const mb = (fs.statSync(videoPath).size / 1048576).toFixed(2);
  console.log(`  Video built: ${mb} MB`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing posted to Facebook. ---\n");
    console.log(message);
    console.log(`\nVideo saved locally at: ${videoPath}`);
    return;
  }

  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) throw new Error("FB_PAGE_ID and FB_PAGE_TOKEN must be set.");

  console.log("  Uploading to Facebook …");
  const result = await uploadVideo({ pageId, token, videoPath, message });
  fs.unlinkSync(videoPath);

  console.log(`\nDone! Video post ID: ${result.id}`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
