/**
 * Builds a video for the day's REFLECTION audio (backdrop photo + the
 * reflection HD audio), separate from the readings video built by
 * build-social-video.js. Reuses the same buildVideo() helper (and the same
 * backdrop photo pool) so the two videos look and sound consistent.
 *
 * Usage:
 *   node scripts/build-reflection-video.js              # today (SA time)
 *   node scripts/build-reflection-video.js 2026-09-11   # a specific date
 *
 * Output: always writes to a predictable path:
 *   .reflection-video-<date>.mp4 in the project root.
 *
 * A missing reflection for a date is NOT an error — reflection generation
 * runs with continue-on-error in the nightly job and won't always produce
 * one. This exits cleanly (code 0) with a message instead of failing the
 * workflow.
 *
 * NOTE: this file is also imported by post-reflection-to-facebook.js and
 * post-reflection-to-youtube.js purely to reuse the reflectionVideoPath()
 * helper, so the actual build logic below is guarded to only run when this
 * file is executed directly — never as a side effect of importing it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVideo } from "./lib/social-video.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REFLECTIONS_DIR = path.join(ROOT, "public", "reflections");
const PUBLIC_DIR = path.join(ROOT, "public");

export function reflectionVideoPath(root, date) {
  return path.join(root, `.reflection-video-${date}.mp4`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  function sastToday() {
    const now = new Date(Date.now() + 2 * 3600 * 1000);
    return now.toISOString().slice(0, 10);
  }

  const args = process.argv.slice(2);
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const isoDate = dateArg || sastToday();

  const audioPath = path.join(REFLECTIONS_DIR, `${isoDate}.mp3`);
  const outPath = reflectionVideoPath(ROOT, isoDate);

  if (!fs.existsSync(audioPath)) {
    console.log(`No reflection audio found for ${isoDate} — nothing to build today, skipping.`);
    process.exit(0);
  }

  console.log(`Building reflection video for ${isoDate} …`);
  buildVideo({ audioPath, outPath, publicDir: PUBLIC_DIR, tmpParentDir: ROOT });
  const mb = (fs.statSync(outPath).size / 1048576).toFixed(2);
  console.log(`Done: ${path.relative(ROOT, outPath)} (${mb} MB)`);
}
