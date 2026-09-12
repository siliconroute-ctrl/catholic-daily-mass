/**
 * Builds the day's social-media video (backdrop photo + HD audio) ONCE,
 * for reuse by both post-to-facebook.js and post-to-youtube.js. Avoids
 * encoding the same video twice in one night's run.
 *
 * Usage:
 *   node scripts/build-social-video.js              # today (SA time)
 *   node scripts/build-social-video.js 2026-09-11   # a specific date
 *
 * Output: prints the built video's path to stdout on the final line, so
 * calling workflow steps can capture it if needed. Also always writes to
 * a predictable path: .social-video-<date>.mp4 in the project root.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVideo } from "./lib/social-video.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const PUBLIC_DIR = path.join(ROOT, "public");

const args = process.argv.slice(2);
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = dateArg || sastToday();

export function socialVideoPath(root, date) {
  return path.join(root, `.social-video-${date}.mp4`);
}

const audioPath = path.join(AUDIO_DIR, `${isoDate}.mp3`);
const outPath = socialVideoPath(ROOT, isoDate);

if (!fs.existsSync(audioPath)) {
  console.error(`FAILED: No audio file found at ${path.relative(ROOT, audioPath)}.`);
  process.exit(1);
}

console.log(`Building social video for ${isoDate} …`);
buildVideo({ audioPath, outPath, publicDir: PUBLIC_DIR, tmpParentDir: ROOT });
const mb = (fs.statSync(outPath).size / 1048576).toFixed(2);
console.log(`Done: ${path.relative(ROOT, outPath)} (${mb} MB)`);
