/**
 * Catholic Daily Mass — daily Facebook poster
 *
 * Posts once a day to the CatholicMass Page: the day's Gospel text, the
 * quiet reflection (if one was generated), and a link to the app — with
 * the day's HD audio attached as a video.
 *
 * The video itself is built once by build-social-video.js and reused here
 * (and by post-to-youtube.js) — never encoded twice in one night's run.
 *
 * Usage:
 *   node scripts/post-to-facebook.js                # today (SA time)
 *   node scripts/post-to-facebook.js 2026-09-11     # a specific date
 *   node scripts/post-to-facebook.js --dry-run       # build the message, post nothing
 *
 * Auth: set FB_PAGE_ID and FB_PAGE_TOKEN as environment variables. This
 * MUST be the Page access token (from /me/accounts), not a System User
 * token — see the README for why these are different.
 *
 * SAFETY:
 *  - One date per run, no retries, no loops.
 *  - Hard cap on post text length.
 *  - Refuses to run if the day's video hasn't been built yet — run
 *    build-social-video.js first in the same workflow.
 *  - A missing reflection is not fatal — the post just omits that part.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { socialVideoPath } from "./build-social-video.js";
import { fetchUniversalisData } from "./lib/fetch-universalis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REFLECTIONS_DIR = path.join(ROOT, "public", "reflections");

const APP_URL = "https://catholic-daily-mass.vercel.app/";
const MAX_MESSAGE_CHARS = 15000; // generous, but a real cap — never truly unbounded
const GRAPH_VERSION = "v21.0";

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
  return fetchUniversalisData(url, "CatholicDailyMass-FacebookPoster/1.0 (+contact via app)");
}

function pick(v) {
  if (v == null) return null;
  if (typeof v === "string") return { source: "", text: v };
  return { source: v.source || "", text: v.text || "" };
}

// ---------- build the post text ----------
export function buildMessage({ day, gospel, reflectionText }) {
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
async function main() {
  console.log(`Preparing Facebook post for ${isoDate} …`);

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

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing posted to Facebook. ---\n");
    console.log(message);
    console.log(`\nUsing pre-built video at: ${videoPath}`);
    return;
  }

  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) throw new Error("FB_PAGE_ID and FB_PAGE_TOKEN must be set.");

  console.log("  Uploading to Facebook …");
  const result = await uploadVideo({ pageId, token, videoPath, message });

  console.log(`\nDone! Video post ID: ${result.id}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
