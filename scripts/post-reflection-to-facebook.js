/**
 * Catholic Daily Mass — daily REFLECTION Facebook poster
 *
 * A second, separate daily post containing ONLY the day's quiet reflection
 * (the same reflection shown in the PWA) as a video — the reflection's own
 * HD audio over a backdrop photo. Distinct from post-to-facebook.js, which
 * posts the full day's readings; this one gives the reflection its own
 * standalone post.
 *
 * Usage:
 *   node scripts/post-reflection-to-facebook.js                # today (SA time)
 *   node scripts/post-reflection-to-facebook.js 2026-09-11     # a specific date
 *   node scripts/post-reflection-to-facebook.js --dry-run       # build the message, post nothing
 *
 * Auth: same two secrets as post-to-facebook.js — FB_PAGE_ID, FB_PAGE_TOKEN.
 *
 * SAFETY:
 *  - One date per run, no retries, no loops.
 *  - A missing reflection for the date is NOT an error — it exits cleanly
 *    (code 0) since reflection generation is a best-effort nightly step
 *    that doesn't always produce one.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reflectionVideoPath } from "./build-reflection-video.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REFLECTIONS_DIR = path.join(ROOT, "public", "reflections");

const APP_URL = "https://catholic-daily-mass.vercel.app/";
const MAX_MESSAGE_CHARS = 15000;
const GRAPH_VERSION = "v21.0";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = dateArg || sastToday();

// ---------- build the post text ----------
export function buildMessage({ day, reflectionText }) {
  const lines = [];
  lines.push(`🕊️ A Quiet Reflection — ${day || isoDate}`, "");
  lines.push(reflectionText, "");
  lines.push(
    "📖 Read today's full readings, listen to today's Mass, and pray with us daily:",
    APP_URL
  );
  let message = lines.join("\n");
  if (message.length > MAX_MESSAGE_CHARS) {
    message = message.slice(0, MAX_MESSAGE_CHARS - 20) + "…\n\n" + APP_URL;
  }
  return message;
}

// ---------- upload to Facebook ----------
async function uploadVideo({ pageId, token, videoPath, message }) {
  const buffer = fs.readFileSync(videoPath);
  const form = new FormData();
  form.append("source", new Blob([buffer], { type: "video/mp4" }), "daily-mass-reflection.mp4");
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
  console.log(`Preparing reflection Facebook post for ${isoDate} …`);

  const reflectionJsonPath = path.join(REFLECTIONS_DIR, `${isoDate}.json`);
  if (!fs.existsSync(reflectionJsonPath)) {
    console.log(`No reflection generated for ${isoDate} — nothing to post today, skipping.`);
    return;
  }

  const videoPath = reflectionVideoPath(ROOT, isoDate);
  if (!fs.existsSync(videoPath)) {
    throw new Error(
      `Reflection exists for ${isoDate} but no pre-built video was found at ` +
        `${path.relative(ROOT, videoPath)}. Run build-reflection-video.js for this date first.`
    );
  }

  const reflection = JSON.parse(fs.readFileSync(reflectionJsonPath, "utf8"));
  const day = reflection.day || "";
  const reflectionText = reflection.text || "";
  if (!reflectionText) {
    throw new Error(`${path.relative(ROOT, reflectionJsonPath)} has no "text" field.`);
  }

  const message = buildMessage({ day, reflectionText });
  console.log(`  Message length: ${message.length} characters`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing posted to Facebook. ---\n");
    console.log(message);
    console.log(`\nUsing pre-built video at: ${videoPath}`);
    return;
  }

  const pageId = process.env.FB_PAGE_ID?.trim();
  const token = process.env.FB_PAGE_TOKEN?.trim();
  if (!pageId || !token) throw new Error("FB_PAGE_ID and FB_PAGE_TOKEN must be set.");

  console.log("  Uploading to Facebook …");
  const result = await uploadVideo({ pageId, token, videoPath, message });

  console.log(`\nDone! Video post ID: ${result.id}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
