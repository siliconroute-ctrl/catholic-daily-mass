/**
 * Shared "package audio as a video" helper — used by both the Facebook and
 * YouTube posting scripts, so the video is only ever built ONCE per night,
 * not once per platform.
 *
 * Picks a random backdrop from the same photo pool the app itself uses
 * (church-*.jpg / church-interior-*.jpg in public/), or falls back to the
 * app icon, or a plain generated backdrop as a last resort.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BACKDROP_PATTERN = /^church(-interior)?-\d+\.(jpe?g|png)$/i;

export function findBackdrop(publicDir) {
  let files;
  try {
    files = fs.readdirSync(publicDir);
  } catch {
    return null;
  }
  const pool = files.filter((f) => BACKDROP_PATTERN.test(f));
  if (pool.length === 0) {
    const iconPath = path.join(publicDir, "icon-512.png");
    return fs.existsSync(iconPath) ? iconPath : null;
  }
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  console.log(`  Backdrop chosen at random: ${chosen} (from a pool of ${pool.length})`);
  return path.join(publicDir, chosen);
}

export function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function generatePlainBackdrop(outPath) {
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", "color=c=0x6E1423:s=1280x720", "-frames:v", "1", outPath],
    { stdio: "ignore" }
  );
}

/**
 * Builds an MP4 (backdrop image + audio track) at outPath.
 * Uses a low framerate + fast preset for a static image — a full 25fps
 * encode of a still image is needlessly slow (measured: ~4x slower for a
 * 5-minute file with no visible difference in output quality).
 */
function resizeBackdropIfNeeded(backdropPath, tmpDir) {
  // A photo can be enormous (some phone/camera originals exceed 30 megapixels).
  // Decoding and scaling that down inside the main encode is needlessly slow —
  // pre-resize to a sensible max first, which is fast regardless of source size.
  const resized = path.join(tmpDir, "backdrop-resized.jpg");
  execFileSync(
    "ffmpeg",
    ["-y", "-i", backdropPath, "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease", resized],
    { stdio: "ignore" }
  );
  return resized;
}

export function buildVideo({ audioPath, outPath, publicDir, tmpParentDir }) {
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg is required to package the audio as a video but was not found.");
  }
  let backdrop = findBackdrop(publicDir);
  const tmpDir = fs.mkdtempSync(path.join(tmpParentDir, ".tmp-video-"));
  if (!backdrop) {
    backdrop = path.join(tmpDir, "backdrop.png");
    generatePlainBackdrop(backdrop);
  } else {
    backdrop = resizeBackdropIfNeeded(backdrop, tmpDir);
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
